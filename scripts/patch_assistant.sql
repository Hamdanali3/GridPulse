-- Patch rate limits, nullable tool schemas, & retry delay in public.gp_assistant_chat and public.gp_assistant_public

CREATE OR REPLACE FUNCTION public.gp_assistant_chat(
    p_token text,
    p_message text,
    p_history jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_start timestamp := clock_timestamp();
    v_ctx jsonb;
    v_rl jsonb;
    v_user_id bigint;
    v_role text;
    v_user_name text;
    v_today text;
    v_tz text;
    v_groq_key text;
    v_groq_model text;
    v_sys_prompt text;
    v_messages jsonb := '[]'::jsonb;
    v_hist_item jsonb;
    v_tools jsonb;
    v_req_body jsonb;
    v_res record;
    v_groq_res jsonb;
    v_status int;
    v_choice jsonb;
    v_tool_calls jsonb;
    v_tc jsonb;
    v_tool_name text;
    v_tool_args jsonb;
    v_tool_out jsonb;
    v_tools_used jsonb := '[]'::jsonb;
    v_round int := 0;
    v_done boolean := false;
    v_content text;
    v_final jsonb;
    v_latency int;
    v_kpis jsonb := '[]'::jsonb;
    v_links jsonb := '[]'::jsonb;
    v_key text;
    v_val jsonb;
BEGIN
    -- 1. Resolve User & Role
    v_ctx := public.gp_assistant_resolve_user(p_token);
    IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code', 'UNAUTHENTICATED', 'message', 'Sign in to use PulseBot.'));
    END IF;

    v_user_id := (v_ctx->>'user_id')::bigint;
    v_role := COALESCE(v_ctx->>'role', 'viewer');
    v_user_name := COALESCE(v_ctx->>'name', 'User');
    v_today := COALESCE(v_ctx->>'today', TO_CHAR(NOW() AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD'));
    v_tz := COALESCE(v_ctx->>'timezone', 'Asia/Karachi');

    -- 2. Rate limit (150 req per 5 min for authenticated users)
    v_rl := public.gp_assistant_check_rate_limit('user', v_user_id::text, 150, 300);
    IF NOT COALESCE((v_rl->>'allowed')::boolean, true) THEN
        RETURN jsonb_build_object('success', false, 'error', jsonb_build_object('code', 'RATE_LIMITED', 'message', 'Rate limit exceeded. Please wait a moment.'));
    END IF;

    -- 3. Retrieve Groq Config
    SELECT value INTO v_groq_key FROM public.assistant_config WHERE key = 'groq_api_key';
    SELECT value INTO v_groq_model FROM public.assistant_config WHERE key = 'groq_model';
    IF v_groq_key IS NULL OR v_groq_key = '' THEN
        v_groq_key := current_setting('app.settings.groq_api_key', true);
    END IF;
    IF v_groq_model IS NULL OR v_groq_model = '' THEN
        v_groq_model := 'openai/gpt-oss-120b';
    END IF;

    -- 4. Build System Prompt & Messages
    v_sys_prompt := 'You are PulseBot, the visual AI operations copilot for GridPulse Chitral renewable grid (hydro, solar, wind in Khyber Pakhtunkhwa, Pakistan). '
        || 'Today is ' || v_today || ' (' || v_tz || '). '
        || 'Authenticated User: ' || v_user_name || ', Role: ' || v_role || '. '
        || 'Role rules: '
        || CASE v_role
            WHEN 'admin' THEN 'Fleet-wide visibility: production, alerts, work orders across all engineers, team, and audit trail.'
            WHEN 'engineer' THEN 'Focus on assigned tasks and actionable field operational advice. Never fabricate edits/writes.'
            ELSE 'Read-only operational reporting. Explain terms (capacity factor, availability, efficiency) clearly.'
           END
        || ' Always ground your answer in tool output. '
        || 'When answering, output a single JSON object with keys: '
        || 'summary (string, concise 1-3 sentences with key numbers), '
        || 'kpis (array of objects: {label, value, unit?, delta?, trend?}), '
        || 'visuals (array of objects: {type: bar|line|area|pie|table, title, data: [...], series: [{key, label}], x: string}), '
        || 'insights (array of strings), '
        || 'links (array of objects: {label, route: /sites|/work-orders|/alerts|/reports|/team|/audit}), '
        || 'followups (array of strings: 2-3 suggested next questions). '
        || 'Never wrap in markdown backticks or commentary outside JSON.';

    v_messages := jsonb_build_array(
        jsonb_build_object('role', 'system', 'content', v_sys_prompt)
    );

    IF p_history IS NOT NULL AND jsonb_typeof(p_history) = 'array' THEN
        FOR v_hist_item IN SELECT * FROM jsonb_array_elements(p_history) LOOP
            IF v_hist_item->>'role' IN ('user', 'assistant') AND NULLIF(v_hist_item->>'content', '') IS NOT NULL THEN
                v_messages := v_messages || jsonb_build_array(jsonb_build_object(
                    'role', v_hist_item->>'role',
                    'content', LEFT(v_hist_item->>'content', 1000)
                ));
            END IF;
        END LOOP;
    END IF;

    v_messages := v_messages || jsonb_build_array(
        jsonb_build_object('role', 'user', 'content', p_message)
    );

    -- 5. Tool schemas catalog (allowing nullable parameters to prevent model tool-validation errors)
    v_tools := jsonb_build_array(
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'fleet_overview', 'description', 'Fleet current output, capacity factor, availability, site status counts', 'parameters', jsonb_build_object('type', 'object', 'properties', '{}'::jsonb))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'site_summary', 'description', 'Site operational metrics and asset health', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('site_id', jsonb_build_object('type', jsonb_build_array('integer', 'null')), 'name', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_sites', 'description', 'Lookup sites by status or technology', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('technology', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_assets', 'description', 'Lookup assets', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('site_id', jsonb_build_object('type', jsonb_build_array('integer', 'null')), 'status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'generation_timeseries', 'description', 'Timeseries generation data by site or tech', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('range', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'scope', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'alerts_summary', 'description', 'Alert counts by severity and status', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_alerts', 'description', 'List recent alerts', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('severity', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'limit', jsonb_build_object('type', jsonb_build_array('integer', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'work_orders_summary', 'description', 'Work orders breakdown by status and priority', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('scope', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'work_orders_list', 'description', 'List work orders', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('status', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'priority', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'limit', jsonb_build_object('type', jsonb_build_array('integer', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'energy_report', 'description', 'Energy generation breakdown', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('range', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'group_by', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'project_knowledge', 'description', 'Chitral grid project knowledge', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('query', jsonb_build_object('type', jsonb_build_array('string', 'null'))))))
    );

    -- 6. Interactive Multi-Round Loop (up to 3 rounds)
    WHILE v_round < 3 AND NOT v_done LOOP
        v_round := v_round + 1;
        v_req_body := jsonb_build_object(
            'model', v_groq_model,
            'messages', v_messages,
            'tools', v_tools,
            'tool_choice', 'auto',
            'max_tokens', CASE WHEN v_round = 1 THEN 250 ELSE 450 END
        );

        SELECT status, content INTO v_res
        FROM extensions.http((
            'POST',
            'https://api.groq.com/openai/v1/chat/completions',
            ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_groq_key)],
            'application/json',
            v_req_body::text
        )::extensions.http_request);

        v_status := v_res.status;

        -- Fallback on 429
        IF v_status = 429 THEN
            PERFORM pg_sleep(2.0);
            v_groq_model := 'openai/gpt-oss-20b';
            v_req_body := jsonb_set(v_req_body, '{model}', to_jsonb(v_groq_model));
            SELECT status, content INTO v_res
            FROM extensions.http((
                'POST',
                'https://api.groq.com/openai/v1/chat/completions',
                ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_groq_key)],
                'application/json',
                v_req_body::text
            )::extensions.http_request);
            v_status := v_res.status;
        END IF;

        IF v_status <> 200 THEN
            RETURN jsonb_build_object('success', false, 'status', v_status, 'error', jsonb_build_object('code', 'GROQ_ERROR', 'message', 'PulseBot intelligence service temporarily unavailable (' || v_status::text || ').', 'details', v_res.content));
        END IF;

        BEGIN
            v_groq_res := v_res.content::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'status', 500, 'error', jsonb_build_object('code', 'GROQ_ERROR', 'message', 'Invalid JSON from Groq'));
        END;

        v_choice := v_groq_res->'choices'->0;
        v_tool_calls := v_choice->'message'->'tool_calls';

        IF v_tool_calls IS NOT NULL AND jsonb_typeof(v_tool_calls) = 'array' AND jsonb_array_length(v_tool_calls) > 0 THEN
            v_messages := v_messages || jsonb_build_array(v_choice->'message');

            FOR v_tc IN SELECT * FROM jsonb_array_elements(v_tool_calls) LOOP
                v_tool_name := v_tc->'function'->>'name';
                BEGIN
                    v_tool_args := (v_tc->'function'->>'arguments')::jsonb;
                EXCEPTION WHEN OTHERS THEN
                    v_tool_args := '{}'::jsonb;
                END;

                v_tools_used := v_tools_used || jsonb_build_array(v_tool_name);
                v_tool_out := public.gp_assistant_exec_tool(p_token, v_tool_name, v_tool_args);

                v_messages := v_messages || jsonb_build_array(jsonb_build_object(
                    'role', 'tool',
                    'tool_call_id', v_tc->>'id',
                    'name', v_tool_name,
                    'content', v_tool_out::text
                ));
            END LOOP;
        ELSE
            v_done := true;
            v_content := v_choice->'message'->>'content';
        END IF;
    END LOOP;

    -- 7. Synthesis fallback if loop hit max rounds without stopping
    IF NOT v_done THEN
        v_messages := v_messages || jsonb_build_array(jsonb_build_object(
            'role', 'user',
            'content', 'All operational tool queries are complete. Output your final operational answer now as a single valid JSON object with keys: summary, kpis, visuals, insights, links, followups.'
        ));

        v_req_body := jsonb_build_object(
            'model', v_groq_model,
            'messages', v_messages,
            'max_tokens', 450
        );

        SELECT status, content INTO v_res
        FROM extensions.http((
            'POST',
            'https://api.groq.com/openai/v1/chat/completions',
            ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_groq_key)],
            'application/json',
            v_req_body::text
        )::extensions.http_request);

        IF v_res.status = 200 THEN
            v_groq_res := v_res.content::jsonb;
            v_choice := v_groq_res->'choices'->0;
            v_content := v_choice->'message'->>'content';
        END IF;
    END IF;

    -- 8. Strip markdown code fences if present
    v_content := TRIM(COALESCE(v_content, ''));
    IF v_content ILIKE '```json%' THEN
        v_content := SUBSTRING(v_content FROM 8);
        IF v_content LIKE '%```' THEN
            v_content := SUBSTRING(v_content FROM 1 FOR LENGTH(v_content) - 3);
        END IF;
    ELSIF v_content ILIKE '```%' THEN
        v_content := SUBSTRING(v_content FROM 4);
        IF v_content LIKE '%```' THEN
            v_content := SUBSTRING(v_content FROM 1 FOR LENGTH(v_content) - 3);
        END IF;
    END IF;
    v_content := TRIM(v_content);

    BEGIN
        v_final := v_content::jsonb;
    EXCEPTION WHEN OTHERS THEN
        DECLARE
            v_match text[];
        BEGIN
            v_match := regexp_match(v_content, '"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"');
            IF v_match IS NOT NULL AND v_match[1] IS NOT NULL THEN
                v_final := jsonb_build_object('summary', v_match[1]);
            ELSE
                v_final := jsonb_build_object('summary', COALESCE(NULLIF(v_content, ''), 'PulseBot processed your operational request.'));
            END IF;
        END;
    END;

    -- 9. Normalization of response schema
    IF v_final->'summary' IS NULL OR jsonb_typeof(v_final->'summary') <> 'string' THEN
        v_final := jsonb_set(v_final, '{summary}', to_jsonb('Operational analysis for GridPulse Chitral.'::text));
    END IF;

    -- Normalize KPIs (if object, convert to array of {label, value})
    IF jsonb_typeof(v_final->'kpis') = 'object' THEN
        v_kpis := '[]'::jsonb;
        FOR v_key, v_val IN SELECT * FROM jsonb_each(v_final->'kpis') LOOP
            v_kpis := v_kpis || jsonb_build_array(jsonb_build_object(
                'label', REPLACE(INITCAP(REPLACE(v_key, '_', ' ')), 'Mw', 'MW'),
                'value', v_val
            ));
        END LOOP;
        v_final := jsonb_set(v_final, '{kpis}', v_kpis);
    ELSIF v_final->'kpis' IS NULL OR jsonb_typeof(v_final->'kpis') <> 'array' THEN
        v_final := jsonb_set(v_final, '{kpis}', '[]'::jsonb);
    END IF;

    -- Normalize Visuals
    IF jsonb_typeof(v_final->'visuals') = 'object' THEN
        v_final := jsonb_set(v_final, '{visuals}', jsonb_build_array(v_final->'visuals'));
    ELSIF v_final->'visuals' IS NULL OR jsonb_typeof(v_final->'visuals') <> 'array' THEN
        v_final := jsonb_set(v_final, '{visuals}', '[]'::jsonb);
    END IF;

    -- Normalize Insights
    IF jsonb_typeof(v_final->'insights') = 'string' THEN
        v_final := jsonb_set(v_final, '{insights}', jsonb_build_array(v_final->'insights'));
    ELSIF v_final->'insights' IS NULL OR jsonb_typeof(v_final->'insights') <> 'array' THEN
        v_final := jsonb_set(v_final, '{insights}', '[]'::jsonb);
    END IF;

    -- Normalize Links (if object, convert to array of {label, route})
    IF jsonb_typeof(v_final->'links') = 'object' THEN
        v_links := '[]'::jsonb;
        FOR v_key, v_val IN SELECT * FROM jsonb_each(v_final->'links') LOOP
            v_links := v_links || jsonb_build_array(jsonb_build_object(
                'label', INITCAP(REPLACE(v_key, '_', ' ')),
                'route', CASE
                    WHEN v_val::text ILIKE '%site%' THEN '/sites'
                    WHEN v_val::text ILIKE '%order%' THEN '/work-orders'
                    WHEN v_val::text ILIKE '%alert%' THEN '/alerts'
                    WHEN v_val::text ILIKE '%report%' THEN '/reports'
                    WHEN v_val::text ILIKE '%team%' THEN '/team'
                    WHEN v_val::text ILIKE '%audit%' THEN '/audit'
                    ELSE '/sites'
                END
            ));
        END LOOP;
        v_final := jsonb_set(v_final, '{links}', v_links);
    ELSIF v_final->'links' IS NULL OR jsonb_typeof(v_final->'links') <> 'array' OR jsonb_array_length(v_final->'links') = 0 THEN
        v_final := jsonb_set(v_final, '{links}', jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Work Orders', 'route', '/work-orders')
        ));
    END IF;

    -- Normalize Followups
    IF jsonb_typeof(v_final->'followups') = 'string' THEN
        v_final := jsonb_set(v_final, '{followups}', jsonb_build_array(v_final->'followups'));
    ELSIF v_final->'followups' IS NULL OR jsonb_typeof(v_final->'followups') <> 'array' OR jsonb_array_length(v_final->'followups') = 0 THEN
        v_final := jsonb_set(v_final, '{followups}', jsonb_build_array(
            'What is the fleet status today?',
            'Show open critical alerts',
            'List overdue work orders'
        ));
    END IF;

    v_latency := ROUND(EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start)))::int;

    -- 10. Audit Log
    PERFORM public.gp_assistant_write_log(v_user_id, v_role, 'session', v_tools_used, v_round::smallint, v_latency, 'ok', NULL, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'data', v_final,
        'meta', jsonb_build_object('tools_used', v_tools_used, 'latency_ms', v_latency)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_assistant_public(
    p_message text,
    p_history jsonb DEFAULT '[]'::jsonb,
    p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_start timestamp := clock_timestamp();
    v_rl jsonb;
    v_groq_key text;
    v_groq_model text;
    v_sys_prompt text;
    v_messages jsonb := '[]'::jsonb;
    v_hist_item jsonb;
    v_req_body jsonb;
    v_res record;
    v_content text;
    v_final jsonb;
    v_latency int;
    v_ip_ident text := COALESCE(NULLIF(TRIM(p_ip), ''), 'anon_public');
BEGIN
    v_rl := public.gp_assistant_check_rate_limit('public_ip', v_ip_ident, 100, 300);
    IF NOT COALESCE((v_rl->>'allowed')::boolean, true) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', jsonb_build_object('code', 'RATE_LIMITED', 'message', 'Too many questions right now. Please wait a few seconds and try again.')
        );
    END IF;

    SELECT value INTO v_groq_key FROM public.assistant_config WHERE key = 'groq_api_key';
    SELECT value INTO v_groq_model FROM public.assistant_config WHERE key = 'groq_model';
    IF v_groq_key IS NULL OR v_groq_key = '' THEN
        v_groq_key := current_setting('app.settings.groq_api_key', true);
    END IF;
    IF v_groq_model IS NULL OR v_groq_model = '' THEN
        v_groq_model := 'openai/gpt-oss-120b';
    END IF;

    v_sys_prompt := 'You are PulseBot, the public FAQ assistant on the landing/login page of GridPulse.' || E'\n' ||
        'GridPulse is the live renewable-operations platform for Chitral district in Khyber Pakhtunkhwa, Pakistan.' || E'\n' ||
        'It monitors 11 generation plants (7 hydro including 108 MW Golen Gol and 69 MW Lawi, 3 solar parks in Mastuj, Booni, and Drosh, and 1 wind pilot at Shandur Pass).' || E'\n\n' ||
        'PLATFORM DETAILS:' || E'\n' ||
        '- Roles: Admin (full operations, team management, audit log), Engineer (field ops, acknowledge/resolve alerts, work orders), Viewer (read-only reports and dashboards).' || E'\n' ||
        '- Demo Accounts: Admin (admin@gridpulse.io / Admin12345), Engineer (engineer@gridpulse.io / Engineer12345), Viewer (viewer@gridpulse.io / Viewer12345).' || E'\n' ||
        '- Alerts: Triggered by telemetry thresholds (low efficiency, over-frequency, over-temperature, low battery). Can convert to work orders.' || E'\n' ||
        '- Work Orders: Kanban and table views with priorities (low, medium, high, critical) and statuses (planned, in_progress, blocked, done).' || E'\n' ||
        '- Tech Stack: React 18 + TypeScript + Vite on Vercel; Supabase PostgreSQL + Row Level Security + PostgREST RPC backend.' || E'\n\n' ||
        'OUTPUT RULES:' || E'\n' ||
        'Never disclose private operational data or live real-time values to public users.' || E'\n' ||
        'Return ONLY valid JSON with keys:' || E'\n' ||
        '- summary: String (concise answer)' || E'\n' ||
        '- bullets: Array of 2-4 strings' || E'\n' ||
        '- links: Array of { label: string, route: string }' || E'\n' ||
        '- followups: Array of 2-3 strings';

    v_messages := jsonb_build_array(jsonb_build_object('role', 'system', 'content', v_sys_prompt));
    IF p_history IS NOT NULL AND jsonb_typeof(p_history) = 'array' THEN
        FOR v_hist_item IN SELECT * FROM jsonb_array_elements(p_history) LOOP
            IF v_hist_item->>'role' IN ('user', 'assistant') AND NULLIF(v_hist_item->>'content', '') IS NOT NULL THEN
                v_messages := v_messages || jsonb_build_array(jsonb_build_object(
                    'role', v_hist_item->>'role',
                    'content', v_hist_item->>'content'
                ));
            END IF;
        END LOOP;
    END IF;
    v_messages := v_messages || jsonb_build_array(jsonb_build_object('role', 'user', 'content', p_message));

    v_req_body := jsonb_build_object(
        'model', v_groq_model,
        'messages', v_messages,
        'response_format', jsonb_build_object('type', 'json_object'),
        'max_tokens', 400
    );

    SELECT status, content INTO v_res
    FROM extensions.http((
        'POST',
        'https://api.groq.com/openai/v1/chat/completions',
        ARRAY[
            extensions.http_header('Authorization', 'Bearer ' || v_groq_key)
        ],
        'application/json',
        v_req_body::text
    )::extensions.http_request);

    IF v_res.status <> 200 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', jsonb_build_object('code', 'GROQ_ERROR', 'message', 'Public info assistant temporarily unavailable (' || v_res.status::text || ').')
        );
    END IF;

    v_content := (v_res.content::jsonb)->'choices'->0->'message'->>'content';
    BEGIN
        v_final := v_content::jsonb;
    EXCEPTION WHEN OTHERS THEN
        v_final := jsonb_build_object(
            'summary', COALESCE(v_content, 'GridPulse is the live renewable-operations platform for Chitral.'),
            'bullets', jsonb_build_array('Monitors 11 hydro, solar, and wind plants.', 'Sign in to access live telemetry and dispatch work orders.'),
            'links', jsonb_build_array(jsonb_build_object('label', 'Sign In to Demo', 'route', '/login')),
            'followups', jsonb_build_array('What are the demo login credentials?', 'How do alerts turn into work orders?')
        );
    END;

    IF v_final->'summary' IS NULL THEN
        v_final := jsonb_set(v_final, '{summary}', to_jsonb('GridPulse overview and capabilities.'::text));
    END IF;
    IF v_final->'bullets' IS NULL OR jsonb_typeof(v_final->'bullets') <> 'array' THEN
        v_final := jsonb_set(v_final, '{bullets}', '[]'::jsonb);
    END IF;
    IF v_final->'links' IS NULL OR jsonb_typeof(v_final->'links') <> 'array' THEN
        v_final := jsonb_set(v_final, '{links}', '[]'::jsonb);
    END IF;
    IF v_final->'followups' IS NULL OR jsonb_typeof(v_final->'followups') <> 'array' THEN
        v_final := jsonb_set(v_final, '{followups}', '[]'::jsonb);
    END IF;

    v_latency := ROUND(EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start)))::int;

    PERFORM public.gp_assistant_write_log(NULL, 'public', 'public_infobox', '[]'::jsonb, 0::smallint, v_latency, 'ok', NULL, v_ip_ident);

    RETURN jsonb_build_object(
        'success', true,
        'data', v_final,
        'meta', jsonb_build_object('latency_ms', v_latency)
    );
END;
$$;
