-- ============================================================================
-- GridPulse — PulseBot AI Copilot Schema, RLS, Rate Limiting, Audit & SQL Tools
-- ============================================================================
-- Versioned migration for Supabase PostgreSQL (`supabase db push`).
-- Provides:
--   1. `public.assistant_usage` (per-user & per-IP rate-limiting buckets, RLS locked)
--   2. `public.assistant_logs`  (request telemetry & tool audit trail, admin-only RLS)
--   3. `public.gp_assistant_resolve_user` (token -> verified session & role context)
--   4. `public.gp_assistant_bootstrap`    (role-aware welcome & starter prompts)
--   5. `public.gp_assistant_check_rate_limit` & `public.gp_assistant_write_log`
--   6. `public.gp_assistant_exec_tool`    (SQL-computed tool catalog with strict RBAC)
--   7. `public.gp_api` extension for `/assistant/bootstrap`, `/assistant/logs`,
--      and deep-link query filters on `/work-orders` and `/audit`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES & ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_usage (
    id bigserial PRIMARY KEY,
    scope varchar(24) NOT NULL,
    identifier varchar(128) NOT NULL,
    window_start timestamp without time zone NOT NULL,
    request_count integer NOT NULL DEFAULT 0,
    CONSTRAINT assistant_usage_bucket_unique UNIQUE (scope, identifier, window_start)
);

CREATE INDEX IF NOT EXISTS assistant_usage_window_idx ON public.assistant_usage (window_start);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assistant_usage FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.assistant_logs (
    id bigserial PRIMARY KEY,
    user_id bigint NULL REFERENCES public.users(id) ON DELETE SET NULL,
    role varchar(16) NOT NULL,
    surface varchar(16) NOT NULL,
    tools_used jsonb NOT NULL DEFAULT '[]'::jsonb,
    tool_rounds smallint NOT NULL DEFAULT 0,
    latency_ms integer NOT NULL DEFAULT 0,
    status varchar(24) NOT NULL,
    error_code varchar(64) NULL,
    ip_hash varchar(64) NULL,
    created_at timestamp without time zone NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS assistant_logs_created_idx ON public.assistant_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_logs_user_created_idx ON public.assistant_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_logs_surface_status_idx ON public.assistant_logs (surface, status);

ALTER TABLE public.assistant_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assistant_logs FROM anon, authenticated;

-- Admin-only RLS policy on assistant_logs (covers direct JWT claims if Supabase Auth is ever attached)
DROP POLICY IF EXISTS assistant_logs_admin_read ON public.assistant_logs;
CREATE POLICY assistant_logs_admin_read
    ON public.assistant_logs
    FOR SELECT
    TO authenticated
    USING (
        COALESCE(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', '') = 'admin'
    );

-- ----------------------------------------------------------------------------
-- 2. TOKEN RESOLUTION & SESSION CONTEXT (Identity always from token, never body)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gp_assistant_resolve_user(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_karachi timestamp without time zone := (NOW() AT TIME ZONE 'Asia/Karachi');
    v_raw text;
    v_tok_id bigint;
    v_tok_plain text;
    v_tok_hash text;
    v_pat public.personal_access_tokens;
    v_user public.users;
    v_perms jsonb;
    v_scopes jsonb;
BEGIN
    v_raw := TRIM(regexp_replace(COALESCE(p_token, ''), '^Bearer\s+', '', 'i'));
    IF v_raw = '' THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'status', 401,
            'code', 'UNAUTHENTICATED',
            'message', 'Sign in to use PulseBot.'
        );
    END IF;

    IF strpos(v_raw, '|') > 0 THEN
        BEGIN
            v_tok_id := split_part(v_raw, '|', 1)::bigint;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'authenticated', false,
                'status', 401,
                'code', 'UNAUTHENTICATED',
                'message', 'Invalid session token.'
            );
        END;
        v_tok_plain := substr(v_raw, strpos(v_raw, '|') + 1);
        v_tok_hash := encode(extensions.digest(v_tok_plain, 'sha256'), 'hex');
        SELECT * INTO v_pat FROM public.personal_access_tokens
        WHERE id = v_tok_id AND token = v_tok_hash AND (expires_at IS NULL OR expires_at > v_now);
    ELSE
        v_tok_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
        SELECT * INTO v_pat FROM public.personal_access_tokens
        WHERE token = v_tok_hash AND (expires_at IS NULL OR expires_at > v_now)
        LIMIT 1;
    END IF;

    IF v_pat.id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'status', 401,
            'code', 'UNAUTHENTICATED',
            'message', 'Session expired or invalid. Please sign in again.'
        );
    END IF;

    SELECT * INTO v_user FROM public.users WHERE id = v_pat.tokenable_id;
    IF v_user.id IS NULL THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'status', 401,
            'code', 'UNAUTHENTICATED',
            'message', 'Account not found.'
        );
    END IF;

    IF NOT v_user.is_active THEN
        RETURN jsonb_build_object(
            'authenticated', false,
            'status', 403,
            'code', 'FORBIDDEN',
            'message', 'This account has been deactivated.'
        );
    END IF;

    UPDATE public.personal_access_tokens SET last_used_at = v_now WHERE id = v_pat.id;

    v_perms := CASE v_user.role
        WHEN 'admin' THEN '["read:fleet","read:sites","read:assets","read:alerts","read:work_orders","read:all_workloads","read:reports","read:team","read:audit"]'::jsonb
        WHEN 'engineer' THEN '["read:fleet","read:sites","read:assets","read:alerts","read:work_orders","read:self_workload","read:reports"]'::jsonb
        ELSE '["read:fleet","read:sites","read:assets","read:alerts","read:work_orders","read:reports"]'::jsonb
    END;

    v_scopes := CASE v_user.role
        WHEN 'admin' THEN '["fleet","sites","assets","alerts","work_orders","engineer_workload","reports","team","audit","knowledge"]'::jsonb
        WHEN 'engineer' THEN '["fleet","sites","assets","alerts","my_work_orders","site_work_orders","self_workload","reports","knowledge"]'::jsonb
        ELSE '["fleet","sites","assets","alerts","work_orders","reports","knowledge"]'::jsonb
    END;

    RETURN jsonb_build_object(
        'authenticated', true,
        'user_id', v_user.id,
        'name', v_user.name,
        'role', v_user.role,
        'permissions', v_perms,
        'today', to_char(v_karachi, 'YYYY-MM-DD'),
        'local_time', to_char(v_karachi, 'YYYY-MM-DD HH24:MI'),
        'timezone', 'Asia/Karachi',
        'available_scopes', v_scopes
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_assistant_bootstrap(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_ctx jsonb;
    v_role text;
    v_prompts jsonb;
    v_welcome text;
BEGIN
    v_ctx := public.gp_assistant_resolve_user(p_token);
    IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
        RETURN public.gp_resp_err(
            COALESCE((v_ctx->>'status')::int, 401),
            COALESCE(v_ctx->>'code', 'UNAUTHENTICATED'),
            COALESCE(v_ctx->>'message', 'Sign in to continue.')
        );
    END IF;

    v_role := v_ctx->>'role';

    IF v_role = 'admin' THEN
        v_welcome := 'Operations chief-of-staff view active. Ask about fleet generation, engineer workloads, overdue work orders, critical alerts, or the audit trail.';
        v_prompts := jsonb_build_array(
            jsonb_build_object('label', 'Engineer workload (7d)', 'prompt', 'How much work did we give engineers in the last 7 days across all hydro plants and solar fields, and how much is done?'),
            jsonb_build_object('label', 'Overdue work orders', 'prompt', 'Which work orders are overdue right now, and who is assigned to them?'),
            jsonb_build_object('label', 'Fleet output today', 'prompt', 'Give me a live fleet overview with today''s generation by technology.'),
            jsonb_build_object('label', 'Open critical alerts', 'prompt', 'Show all open critical alerts across Chitral and whether they have linked work orders.'),
            jsonb_build_object('label', 'Who changed what today', 'prompt', 'Search the audit log for changes and sign-ins recorded today.')
        );
    ELSIF v_role = 'engineer' THEN
        v_welcome := 'Field-ops copilot ready. Scoped to your assigned tasks by default, with live plant diagnostics and alert triage across Chitral.';
        v_prompts := jsonb_build_array(
            jsonb_build_object('label', 'What to fix first', 'prompt', 'What should I fix first based on my assigned work orders and active critical alerts?'),
            jsonb_build_object('label', 'My open work orders', 'prompt', 'Summarise my open work orders by priority and due date.'),
            jsonb_build_object('label', 'Alerts on my sites', 'prompt', 'Which sites have active alerts right now and which units are affected?'),
            jsonb_build_object('label', 'Degraded units', 'prompt', 'List assets with degraded health scores (<75) and explain their latest readings.')
        );
    ELSE
        v_welcome := 'Read-only fleet reporter ready. Ask for plain-language summaries of Chitral''s live output, 7-day energy, site availability, or metric definitions.';
        v_prompts := jsonb_build_array(
            jsonb_build_object('label', 'Fleet output now', 'prompt', 'How much power is the Chitral fleet producing right now across hydro, solar, and wind?'),
            jsonb_build_object('label', 'Lowest-output plants today', 'prompt', 'Which plants are producing least today, and are any offline or in maintenance?'),
            jsonb_build_object('label', '7-day generation', 'prompt', 'Show the 7-day energy report grouped by technology and day.'),
            jsonb_build_object('label', 'What is capacity factor?', 'prompt', 'What does capacity factor mean in GridPulse, and how is our fleet doing right now?')
        );
    END IF;

    RETURN public.gp_resp_ok(jsonb_build_object(
        'user_id', (v_ctx->>'user_id')::bigint,
        'name', v_ctx->>'name',
        'role', v_role,
        'timezone', v_ctx->>'timezone',
        'today', v_ctx->>'today',
        'welcome', v_welcome,
        'starter_prompts', v_prompts
    ));
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RATE LIMITING & AUDIT LOGGING
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gp_assistant_check_rate_limit(
    p_scope text,
    p_identifier text,
    p_limit int DEFAULT 20,
    p_window_sec int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_epoch bigint := EXTRACT(EPOCH FROM v_now)::bigint;
    v_win int := GREATEST(10, COALESCE(p_window_sec, 60));
    v_bucket_epoch bigint := (v_epoch / v_win) * v_win;
    v_bucket_ts timestamp without time zone := (to_timestamp(v_bucket_epoch) AT TIME ZONE 'UTC');
    v_count int;
    v_retry int;
BEGIN
    -- Opportunistic cleanup of stale buckets (> 2 hours old)
    DELETE FROM public.assistant_usage WHERE window_start < v_now - INTERVAL '2 hours';

    INSERT INTO public.assistant_usage (scope, identifier, window_start, request_count)
    VALUES (LEFT(COALESCE(p_scope, 'session'), 24), LEFT(COALESCE(p_identifier, 'anon'), 128), v_bucket_ts, 1)
    ON CONFLICT (scope, identifier, window_start)
    DO UPDATE SET request_count = public.assistant_usage.request_count + 1
    RETURNING request_count INTO v_count;

    v_retry := GREATEST(1, (v_bucket_epoch + v_win - v_epoch)::int);

    RETURN jsonb_build_object(
        'allowed', v_count <= p_limit,
        'current', v_count,
        'limit', p_limit,
        'retry_after_sec', v_retry
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_assistant_write_log(
    p_user_id bigint,
    p_role text,
    p_surface text,
    p_tools jsonb DEFAULT '[]'::jsonb,
    p_rounds int DEFAULT 0,
    p_latency_ms int DEFAULT 0,
    p_status text DEFAULT 'ok',
    p_error_code text DEFAULT NULL,
    p_ip text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_ip_hash text := NULL;
BEGIN
    IF p_ip IS NOT NULL AND TRIM(p_ip) <> '' THEN
        v_ip_hash := encode(extensions.digest(TRIM(p_ip), 'sha256'), 'hex');
    END IF;

    INSERT INTO public.assistant_logs (
        user_id, role, surface, tools_used, tool_rounds, latency_ms, status, error_code, ip_hash, created_at
    ) VALUES (
        p_user_id,
        LEFT(COALESCE(p_role, 'public'), 16),
        LEFT(COALESCE(p_surface, 'session'), 16),
        COALESCE(p_tools, '[]'::jsonb),
        GREATEST(0, COALESCE(p_rounds, 0))::smallint,
        GREATEST(0, COALESCE(p_latency_ms, 0)),
        LEFT(COALESCE(p_status, 'ok'), 24),
        CASE WHEN p_error_code IS NULL THEN NULL ELSE LEFT(p_error_code, 64) END,
        v_ip_hash,
        (NOW() AT TIME ZONE 'UTC')
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. DATE WINDOW HELPER (Deterministic server-side range resolution)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gp_parse_window(
    p_range text DEFAULT NULL,
    p_from text DEFAULT NULL,
    p_to text DEFAULT NULL,
    p_default_days int DEFAULT 7
)
RETURNS TABLE (w_from timestamp without time zone, w_to timestamp without time zone, w_label text)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_r text := LOWER(TRIM(COALESCE(p_range, '')));
    v_f timestamp without time zone;
    v_t timestamp without time zone;
    v_lbl text;
BEGIN
    IF NULLIF(TRIM(COALESCE(p_from, '')), '') IS NOT NULL THEN
        BEGIN
            IF LENGTH(TRIM(p_from)) <= 10 THEN
                v_f := (TRIM(p_from) || ' 00:00:00')::timestamp;
            ELSE
                v_f := TRIM(p_from)::timestamptz AT TIME ZONE 'UTC';
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_f := v_now - make_interval(days => p_default_days);
        END;

        IF NULLIF(TRIM(COALESCE(p_to, '')), '') IS NOT NULL THEN
            BEGIN
                IF LENGTH(TRIM(p_to)) <= 10 THEN
                    v_t := (TRIM(p_to) || ' 23:59:59')::timestamp;
                ELSE
                    v_t := TRIM(p_to)::timestamptz AT TIME ZONE 'UTC';
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_t := v_now;
            END;
        ELSE
            v_t := v_now;
        END IF;
        v_lbl := to_char(v_f, 'YYYY-MM-DD') || ' to ' || to_char(v_t, 'YYYY-MM-DD');
        RETURN QUERY SELECT v_f, v_t, v_lbl;
        RETURN;
    END IF;

    IF v_r IN ('1h', 'last hour', '60m') THEN
        RETURN QUERY SELECT v_now - INTERVAL '1 hour', v_now, 'last 1 hour'::text;
    ELSIF v_r IN ('today', 'day') THEN
        RETURN QUERY SELECT date_trunc('day', v_now), v_now, 'today (since 00:00 UTC)'::text;
    ELSIF v_r IN ('24h', '1d', 'last 24 hours', 'last 24h') THEN
        RETURN QUERY SELECT v_now - INTERVAL '24 hours', v_now, 'last 24 hours'::text;
    ELSIF v_r IN ('3d', '72h', 'last 3 days') THEN
        RETURN QUERY SELECT v_now - INTERVAL '3 days', v_now, 'last 3 days'::text;
    ELSIF v_r IN ('7d', '168h', 'week', 'last 7 days', 'last week', '7 days') THEN
        RETURN QUERY SELECT v_now - INTERVAL '7 days', v_now, 'last 7 days'::text;
    ELSIF v_r IN ('14d', 'last 14 days', '2w') THEN
        RETURN QUERY SELECT v_now - INTERVAL '14 days', v_now, 'last 14 days'::text;
    ELSIF v_r IN ('30d', 'month', 'last 30 days') THEN
        RETURN QUERY SELECT v_now - INTERVAL '30 days', v_now, 'last 30 days'::text;
    ELSIF v_r IN ('all', 'all_time', 'any') THEN
        RETURN QUERY SELECT TIMESTAMP '2000-01-01 00:00:00', v_now, 'all recorded history'::text;
    ELSE
        RETURN QUERY SELECT v_now - make_interval(days => p_default_days), v_now, ('last ' || p_default_days || ' days')::text;
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. SQL-COMPUTED TOOL CATALOG (`public.gp_assistant_exec_tool`)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gp_assistant_exec_tool(
    p_token text,
    p_tool text,
    p_args jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_ctx jsonb;
    v_user_id bigint;
    v_role text;
    v_is_admin boolean;
    v_args jsonb := COALESCE(p_args, '{}'::jsonb);
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_w record;
    v_site public.sites;
    v_site_id bigint;
    v_site_q text;
    v_techs text[];
    v_status text;
    v_priority text;
    v_severity text;
    v_scope text;
    v_assignee_id bigint;
    v_assignee_q text;
    v_limit int;
    v_bucket int;
    v_hours int;
    v_group_by text;
    v_overview jsonb;
    v_res jsonb;
BEGIN
    -- Every tool execution re-authenticates the caller's token inside PostgreSQL
    v_ctx := public.gp_assistant_resolve_user(p_token);
    IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
        RETURN jsonb_build_object(
            'error', true,
            'forbidden', true,
            'code', COALESCE(v_ctx->>'code', 'UNAUTHENTICATED'),
            'message', COALESCE(v_ctx->>'message', 'Authentication required.')
        );
    END IF;

    v_user_id := (v_ctx->>'user_id')::bigint;
    v_role := v_ctx->>'role';
    v_is_admin := (v_role = 'admin');

    -- Helper: normalize technology filter array (`technology` string or `technologies` array/csv)
    IF jsonb_typeof(v_args->'technologies') = 'array' THEN
        SELECT ARRAY_AGG(LOWER(TRIM(elem)))
        INTO v_techs
        FROM jsonb_array_elements_text(v_args->'technologies') elem
        WHERE LOWER(TRIM(elem)) IN ('hydro', 'solar', 'wind');
    ELSIF NULLIF(TRIM(COALESCE(v_args->>'technologies', '')), '') IS NOT NULL THEN
        SELECT ARRAY_AGG(LOWER(TRIM(elem)))
        INTO v_techs
        FROM unnest(string_to_array(v_args->>'technologies', ',')) elem
        WHERE LOWER(TRIM(elem)) IN ('hydro', 'solar', 'wind');
    ELSIF NULLIF(TRIM(COALESCE(v_args->>'technology', '')), '') IS NOT NULL
          AND LOWER(TRIM(v_args->>'technology')) IN ('hydro', 'solar', 'wind') THEN
        v_techs := ARRAY[LOWER(TRIM(v_args->>'technology'))];
    ELSE
        v_techs := NULL;
    END IF;
    IF v_techs IS NOT NULL AND array_length(v_techs, 1) IS NULL THEN
        v_techs := NULL;
    END IF;

    -- Helper: resolve site_id or fuzzy site_name / name / site
    v_site_id := NULL;
    IF NULLIF(TRIM(COALESCE(v_args->>'site_id', '')), '') ~ '^\d+$' THEN
        v_site_id := TRIM(v_args->>'site_id')::bigint;
    ELSE
        v_site_q := NULLIF(TRIM(COALESCE(v_args->>'site_name', v_args->>'name', v_args->>'site', '')), '');
        IF v_site_q IS NOT NULL THEN
            IF v_site_q ~ '^\d+$' THEN
                v_site_id := v_site_q::bigint;
            ELSE
                SELECT id INTO v_site_id
                FROM public.sites
                WHERE LOWER(code) = LOWER(v_site_q)
                   OR name ILIKE '%' || v_site_q || '%'
                   OR code ILIKE '%' || v_site_q || '%'
                ORDER BY
                    CASE WHEN LOWER(code) = LOWER(v_site_q) OR LOWER(name) = LOWER(v_site_q) THEN 0 ELSE 1 END,
                    id ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- TOOL 1: fleet_overview (Roles: all)
    -- ========================================================================
    IF p_tool IN ('fleet_overview', 'site_and_assets_overview', 'sites_overview', 'plants_overview', 'plant_count', 'get_plants') THEN
        v_overview := public.gp_dashboard_overview_data();
        RETURN jsonb_build_object(
            'tool', 'fleet_overview',
            'as_of_utc', public.gp_iso(v_now),
            'timezone', 'Asia/Karachi',
            'fleet', (v_overview->'fleet') || jsonb_build_object(
                'current_output_mw', ROUND(((v_overview->'fleet'->>'current_output_kw')::numeric / 1000.0), 2)::float8,
                'capacity_mw', ROUND(((v_overview->'fleet'->>'capacity_kw')::numeric / 1000.0), 2)::float8,
                'today_energy_mwh', ROUND(((v_overview->'fleet'->>'today_energy_kwh')::numeric / 1000.0), 2)::float8
            ),
            'sites_by_status', v_overview->'sites_by_status',
            'generation_by_type', v_overview->'generation_by_type',
            'alerts', jsonb_build_object(
                'open_total', (v_overview->'alerts'->>'open')::int,
                'by_severity', v_overview->'alerts'->'by_severity'
            ),
            'work_orders', v_overview->'work_orders',
            'top_sites', v_overview->'top_sites',
            'bottom_sites', v_overview->'bottom_sites'
        );
    END IF;

    -- ========================================================================
    -- TOOL 2: site_summary (Roles: all)
    -- ========================================================================
    IF p_tool = 'site_summary' THEN
        IF v_site_id IS NULL THEN
            RETURN jsonb_build_object(
                'found', false,
                'message', 'Site not found. Use list_sites to inspect valid Chitral plants.',
                'available_sites', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code, 'type', type) ORDER BY id), '[]'::jsonb)
                    FROM public.sites
                )
            );
        END IF;

        SELECT * INTO v_site FROM public.sites WHERE id = v_site_id;
        IF v_site.id IS NULL THEN
            RETURN jsonb_build_object('found', false, 'message', format('No site exists with ID %s.', v_site_id));
        END IF;

        PERFORM public.gp_ensure_fresh_telemetry();
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '24h'), v_args->>'from', v_args->>'to', 1);

        WITH asset_stats AS (
            SELECT a.id, a.tag, a.name, a.kind, a.status,
                   a.rated_kw::float8 AS rated_kw,
                   a.health_score::float8 AS health_score,
                   lr.power_kw::float8 AS latest_kw,
                   lr.efficiency_pct::float8 AS latest_eff,
                   lr.temperature_c::float8 AS latest_temp
            FROM public.assets a
            LEFT JOIN LATERAL (
                SELECT power_kw, efficiency_pct, temperature_c
                FROM public.telemetry_readings tr
                WHERE tr.asset_id = a.id
                ORDER BY tr.recorded_at DESC
                LIMIT 1
            ) lr ON true
            WHERE a.site_id = v_site.id
            ORDER BY a.tag ASC
        ),
        range_energy AS (
            SELECT asset_id,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh,
                   AVG(NULLIF(efficiency_pct, 0)) AS eff,
                   MAX(power_kw) AS peak_kw,
                   MAX(temperature_c) AS max_temp
            FROM public.telemetry_readings
            WHERE site_id = v_site.id AND recorded_at BETWEEN v_w.w_from AND v_w.w_to
            GROUP BY asset_id
        ),
        today_energy AS (
            SELECT asset_id,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE site_id = v_site.id AND recorded_at BETWEEN date_trunc('day', v_now) AND v_now
            GROUP BY asset_id
        )
        SELECT jsonb_build_object(
            'found', true,
            'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'timezone', 'Asia/Karachi'),
            'site', jsonb_build_object(
                'id', v_site.id,
                'name', v_site.name,
                'code', v_site.code,
                'type', v_site.type,
                'status', v_site.status,
                'region', v_site.region,
                'capacity_mw', v_site.capacity_mw::float8,
                'capacity_kw', (v_site.capacity_mw::float8 * 1000.0),
                'min_efficiency_pct', v_site.min_efficiency::float8,
                'max_temperature_c', v_site.max_temperature::float8
            ),
            'metrics', jsonb_build_object(
                'current_output_kw', public.gp_site_output_kw(v_site.id),
                'capacity_factor_pct', CASE WHEN v_site.capacity_mw > 0 THEN ROUND((public.gp_site_output_kw(v_site.id) / (v_site.capacity_mw::float8 * 1000.0) * 100.0)::numeric, 1)::float8 ELSE 0.0 END,
                'today_energy_kwh', COALESCE((SELECT ROUND(SUM(kwh)::numeric, 1)::float8 FROM today_energy), 0.0),
                'range_energy_kwh', COALESCE((SELECT ROUND(SUM(kwh)::numeric, 1)::float8 FROM range_energy), 0.0),
                'avg_efficiency_pct', COALESCE((SELECT ROUND(AVG(eff)::numeric, 1)::float8 FROM range_energy), 0.0),
                'peak_output_kw', COALESCE((SELECT ROUND(SUM(peak_kw)::numeric, 1)::float8 FROM range_energy), 0.0),
                'max_temperature_c', COALESCE((SELECT ROUND(MAX(max_temp)::numeric, 1)::float8 FROM range_energy), 0.0),
                'availability_pct', COALESCE((
                    SELECT CASE WHEN COUNT(*) > 0 THEN ROUND((SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100.0), 1)::float8 ELSE 0.0 END
                    FROM asset_stats
                ), 0.0),
                'open_alerts', (SELECT COUNT(*)::int FROM public.alerts WHERE site_id = v_site.id AND status IN ('open', 'acknowledged')),
                'open_work_orders', (SELECT COUNT(*)::int FROM public.work_orders WHERE site_id = v_site.id AND status <> 'done')
            ),
            'assets', COALESCE((SELECT jsonb_agg(to_jsonb(asset_stats)) FROM asset_stats), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 3: list_sites (Roles: all)
    -- ========================================================================
    IF p_tool = 'list_sites' THEN
        PERFORM public.gp_ensure_fresh_telemetry();
        v_site_q := NULLIF(TRIM(COALESCE(v_args->>'q', '')), '');
        v_status := NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), '');

        WITH today_asset AS (
            SELECT asset_id, site_id,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE recorded_at BETWEEN date_trunc('day', v_now) AND v_now
            GROUP BY asset_id, site_id
        ),
        today_site AS (
            SELECT site_id, ROUND(SUM(kwh)::numeric, 1)::float8 AS kwh
            FROM today_asset GROUP BY site_id
        ),
        rows AS (
            SELECT s.id, s.name, s.code, s.type, s.status, s.region,
                   s.capacity_mw::float8 AS capacity_mw,
                   public.gp_site_output_kw(s.id) AS current_output_kw,
                   CASE WHEN s.capacity_mw > 0 THEN ROUND((public.gp_site_output_kw(s.id) / (s.capacity_mw::float8 * 1000.0) * 100.0)::numeric, 1)::float8 ELSE 0.0 END AS capacity_factor_pct,
                   COALESCE(ts.kwh, 0.0) AS today_energy_kwh,
                   (SELECT COUNT(*)::int FROM public.assets a WHERE a.site_id = s.id) AS asset_count,
                   (SELECT COUNT(*)::int FROM public.alerts al WHERE al.site_id = s.id AND al.status IN ('open', 'acknowledged')) AS open_alerts
            FROM public.sites s
            LEFT JOIN today_site ts ON ts.site_id = s.id
            WHERE (v_site_q IS NULL OR s.name ILIKE '%' || v_site_q || '%' OR s.code ILIKE '%' || v_site_q || '%' OR s.region ILIKE '%' || v_site_q || '%')
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_status IS NULL OR s.status = v_status)
        ),
        ordered AS (
            SELECT * FROM rows
            ORDER BY
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'output_asc' THEN current_output_kw END ASC,
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'output_desc' THEN current_output_kw END DESC,
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'cf_asc' THEN capacity_factor_pct END ASC,
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'cf_desc' THEN capacity_factor_pct END DESC,
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'energy_asc' THEN today_energy_kwh END ASC,
                CASE WHEN COALESCE(v_args->>'sort_by', '') = 'energy_desc' THEN today_energy_kwh END DESC,
                name ASC
            LIMIT 25
        )
        SELECT jsonb_build_object(
            'as_of_utc', public.gp_iso(v_now),
            'timezone', 'Asia/Karachi',
            'count', (SELECT COUNT(*)::int FROM ordered),
            'sites', COALESCE((SELECT jsonb_agg(to_jsonb(ordered)) FROM ordered), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 4: list_assets (Roles: all)
    -- ========================================================================
    IF p_tool = 'list_assets' THEN
        v_site_q := NULLIF(TRIM(COALESCE(v_args->>'q', '')), '');
        v_status := NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), '');
        v_limit := LEAST(20, GREATEST(1, COALESCE(NULLIF(v_args->>'limit', '')::int, 15)));

        WITH filtered AS (
            SELECT a.id, a.tag, a.name, a.kind, a.status,
                   a.rated_kw::float8 AS rated_kw,
                   a.health_score::float8 AS health_score,
                   s.id AS site_id, s.name AS site_name, s.code AS site_code, s.type AS technology,
                   lr.power_kw::float8 AS latest_power_kw,
                   lr.efficiency_pct::float8 AS latest_efficiency_pct,
                   lr.temperature_c::float8 AS latest_temperature_c
            FROM public.assets a
            JOIN public.sites s ON s.id = a.site_id
            LEFT JOIN LATERAL (
                SELECT power_kw, efficiency_pct, temperature_c
                FROM public.telemetry_readings tr
                WHERE tr.asset_id = a.id
                ORDER BY tr.recorded_at DESC
                LIMIT 1
            ) lr ON true
            WHERE (v_site_id IS NULL OR a.site_id = v_site_id)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_status IS NULL OR a.status = v_status)
              AND (NULLIF(v_args->>'kind', '') IS NULL OR a.kind = v_args->>'kind')
              AND (NULLIF(v_args->>'max_health', '') IS NULL OR a.health_score <= (v_args->>'max_health')::numeric)
              AND (v_site_q IS NULL OR a.name ILIKE '%' || v_site_q || '%' OR a.tag ILIKE '%' || v_site_q || '%' OR COALESCE(a.manufacturer, '') ILIKE '%' || v_site_q || '%')
        ),
        capped AS (
            SELECT * FROM filtered ORDER BY health_score ASC, tag ASC LIMIT v_limit
        )
        SELECT jsonb_build_object(
            'total_matching', (SELECT COUNT(*)::int FROM filtered),
            'returned', (SELECT COUNT(*)::int FROM capped),
            'assets', COALESCE((SELECT jsonb_agg(to_jsonb(capped)) FROM capped), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 5: generation_timeseries (Roles: all)
    -- ========================================================================
    IF p_tool = 'generation_timeseries' THEN
        PERFORM public.gp_ensure_fresh_telemetry();
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '24h'), v_args->>'from', v_args->>'to', 1);
        v_hours := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_w.w_to - v_w.w_from)) / 3600.0)::int);

        -- Keep point count compact (~24-32 points max) for crisp charts & fast LLM synthesis
        v_bucket := CASE
            WHEN NULLIF(v_args->>'granularity', '') = '5m' THEN 5
            WHEN NULLIF(v_args->>'granularity', '') = '15m' THEN 15
            WHEN NULLIF(v_args->>'granularity', '') = '30m' THEN 30
            WHEN NULLIF(v_args->>'granularity', '') = '1h' THEN 60
            WHEN NULLIF(v_args->>'granularity', '') = '3h' THEN 180
            WHEN NULLIF(v_args->>'granularity', '') = '6h' THEN 360
            WHEN v_hours <= 2 THEN 5
            WHEN v_hours <= 24 THEN 60
            WHEN v_hours <= 72 THEN 180
            ELSE 360
        END;

        v_scope := LOWER(COALESCE(v_args->>'scope', CASE WHEN v_site_id IS NOT NULL THEN 'site' ELSE 'technology' END));

        IF v_scope = 'site' AND v_site_id IS NOT NULL THEN
            SELECT * INTO v_site FROM public.sites WHERE id = v_site_id;
            RETURN jsonb_build_object(
                'scope', 'site',
                'site', CASE WHEN v_site.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_site.id, 'name', v_site.name, 'code', v_site.code, 'type', v_site.type) END,
                'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'bucket_minutes', v_bucket, 'timezone', 'Asia/Karachi'),
                'series', public.gp_series_data(v_w.w_from, v_bucket, v_site_id, true)
            );
        ELSIF v_scope IN ('technology', 'type', 'by_type') THEN
            RETURN jsonb_build_object(
                'scope', 'technology',
                'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'bucket_minutes', v_bucket, 'timezone', 'Asia/Karachi'),
                'series', public.gp_series_by_type_data(v_w.w_from, v_bucket)
            );
        ELSE
            RETURN jsonb_build_object(
                'scope', 'fleet',
                'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'bucket_minutes', v_bucket, 'timezone', 'Asia/Karachi'),
                'series', public.gp_series_data(v_w.w_from, v_bucket, NULL, false)
            );
        END IF;
    END IF;

    -- ========================================================================
    -- TOOL 6: alerts_summary (Roles: all)
    -- ========================================================================
    IF p_tool = 'alerts_summary' THEN
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', 'all'), v_args->>'from', v_args->>'to', 7);
        v_status := NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), '');
        v_severity := NULLIF(LOWER(TRIM(COALESCE(v_args->>'severity', ''))), '');

        WITH base AS (
            SELECT al.*, s.name AS site_name, s.code AS site_code, s.type AS site_type, a.tag AS asset_tag
            FROM public.alerts al
            JOIN public.sites s ON s.id = al.site_id
            LEFT JOIN public.assets a ON a.id = al.asset_id
            WHERE al.created_at BETWEEN v_w.w_from AND v_w.w_to
              AND (v_site_id IS NULL OR al.site_id = v_site_id)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_severity IS NULL OR al.severity = v_severity)
              AND (
                  v_status IS NULL OR v_status = 'all'
                  OR (v_status = 'active' AND al.status IN ('open', 'acknowledged'))
                  OR (v_status IN ('open', 'acknowledged', 'resolved') AND al.status = v_status)
              )
        )
        SELECT jsonb_build_object(
            'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'timezone', 'Asia/Karachi'),
            'total', (SELECT COUNT(*)::int FROM base),
            'active_total', (SELECT COUNT(*)::int FROM base WHERE status IN ('open', 'acknowledged')),
            'unlinked_active_count', (SELECT COUNT(*)::int FROM base WHERE status IN ('open', 'acknowledged') AND work_order_id IS NULL),
            'by_status', jsonb_build_object(
                'open', (SELECT COUNT(*)::int FROM base WHERE status = 'open'),
                'acknowledged', (SELECT COUNT(*)::int FROM base WHERE status = 'acknowledged'),
                'resolved', (SELECT COUNT(*)::int FROM base WHERE status = 'resolved')
            ),
            'by_severity', jsonb_build_object(
                'critical', (SELECT COUNT(*)::int FROM base WHERE severity = 'critical'),
                'warning', (SELECT COUNT(*)::int FROM base WHERE severity = 'warning'),
                'info', (SELECT COUNT(*)::int FROM base WHERE severity = 'info')
            ),
            'by_type', COALESCE((
                SELECT jsonb_object_agg(type, cnt)
                FROM (SELECT type, COUNT(*)::int AS cnt FROM base GROUP BY type) t
            ), '{}'::jsonb),
            'by_site', COALESCE((
                SELECT jsonb_agg(to_jsonb(bs))
                FROM (
                    SELECT site_id, site_name, site_code, site_type AS technology,
                           COUNT(*)::int AS total,
                           SUM(CASE WHEN status IN ('open', 'acknowledged') THEN 1 ELSE 0 END)::int AS active,
                           SUM(CASE WHEN severity = 'critical' AND status IN ('open', 'acknowledged') THEN 1 ELSE 0 END)::int AS active_critical
                    FROM base
                    GROUP BY site_id, site_name, site_code, site_type
                    ORDER BY active_critical DESC, active DESC, total DESC
                    LIMIT 8
                ) bs
            ), '[]'::jsonb),
            'oldest_open', (
                SELECT jsonb_build_object(
                    'id', id, 'severity', severity, 'status', status, 'type', type,
                    'message', message, 'site_name', site_name, 'asset_tag', asset_tag,
                    'created_at', public.gp_iso(created_at),
                    'age_hours', ROUND((EXTRACT(EPOCH FROM (v_now - created_at)) / 3600.0)::numeric, 1)::float8
                )
                FROM base
                WHERE status IN ('open', 'acknowledged')
                ORDER BY created_at ASC
                LIMIT 1
            ),
            'mttr_hours', (
                SELECT ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::numeric, 2)::float8
                FROM base
                WHERE status = 'resolved' AND resolved_at IS NOT NULL AND resolved_at >= created_at
            )
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 7: list_alerts (Roles: all)
    -- ========================================================================
    IF p_tool = 'list_alerts' THEN
        v_status := COALESCE(NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), ''), 'active');
        v_severity := NULLIF(LOWER(TRIM(COALESCE(v_args->>'severity', ''))), '');
        v_limit := LEAST(15, GREATEST(1, COALESCE(NULLIF(v_args->>'limit', '')::int, 10)));

        WITH filtered AS (
            SELECT al.id, al.severity, al.status, al.type, al.message,
                   CASE WHEN al.value IS NULL THEN NULL ELSE al.value::float8 END AS value,
                   al.site_id, s.name AS site_name, s.code AS site_code, s.type AS technology,
                   al.asset_id, a.tag AS asset_tag, a.name AS asset_name,
                   al.work_order_id,
                   public.gp_iso(al.created_at) AS created_at,
                   al.created_at AS raw_created_at
            FROM public.alerts al
            JOIN public.sites s ON s.id = al.site_id
            LEFT JOIN public.assets a ON a.id = al.asset_id
            WHERE (v_site_id IS NULL OR al.site_id = v_site_id)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_severity IS NULL OR al.severity = v_severity)
              AND (NULLIF(v_args->>'type', '') IS NULL OR al.type = v_args->>'type')
              AND (
                  v_status = 'all'
                  OR (v_status = 'active' AND al.status IN ('open', 'acknowledged'))
                  OR (v_status IN ('open', 'acknowledged', 'resolved') AND al.status = v_status)
              )
        ),
        capped AS (
            SELECT id, severity, status, type, message, value, site_id, site_name, site_code, technology, asset_id, asset_tag, asset_name, work_order_id, created_at
            FROM filtered
            ORDER BY
                (CASE severity WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END) DESC,
                raw_created_at DESC
            LIMIT v_limit
        )
        SELECT jsonb_build_object(
            'total_matching', (SELECT COUNT(*)::int FROM filtered),
            'returned', (SELECT COUNT(*)::int FROM capped),
            'alerts', COALESCE((SELECT jsonb_agg(to_jsonb(capped)) FROM capped), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 8: work_orders_summary (Roles: all; engineer defaults to own unless scope='all')
    -- ========================================================================
    IF p_tool = 'work_orders_summary' THEN
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '7d'), v_args->>'from', v_args->>'to', 7);
        v_status := NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), '');
        v_priority := NULLIF(LOWER(TRIM(COALESCE(v_args->>'priority', ''))), '');
        v_scope := LOWER(TRIM(COALESCE(v_args->>'scope', '')));

        v_assignee_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_args->>'assignee_id', '')), '') ~ '^\d+$' THEN
            v_assignee_id := TRIM(v_args->>'assignee_id')::bigint;
        ELSIF NULLIF(TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee', '')), '') IS NOT NULL THEN
            v_assignee_q := TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee'));
            IF LOWER(v_assignee_q) IN ('me', 'self', 'mine') THEN
                v_assignee_id := v_user_id;
            ELSE
                SELECT id INTO v_assignee_id FROM public.users WHERE name ILIKE '%' || v_assignee_q || '%' ORDER BY id LIMIT 1;
            END IF;
        ELSIF v_role = 'engineer' AND v_scope <> 'all' THEN
            -- Section 4 & 5: Engineer defaults to their own assigned work orders unless scope='all'
            v_assignee_id := v_user_id;
        END IF;

        WITH base AS (
            SELECT w.*, s.name AS site_name, s.code AS site_code, s.type AS site_type,
                   COALESCE(u.name, 'Unassigned') AS assignee_name
            FROM public.work_orders w
            JOIN public.sites s ON s.id = w.site_id
            LEFT JOIN public.users u ON u.id = w.assignee_id
            WHERE w.created_at BETWEEN v_w.w_from AND v_w.w_to
              AND (v_site_id IS NULL OR w.site_id = v_site_id)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_status IS NULL OR w.status = v_status)
              AND (v_priority IS NULL OR w.priority = v_priority)
              AND (v_assignee_id IS NULL OR w.assignee_id = v_assignee_id)
        )
        SELECT jsonb_build_object(
            'window', jsonb_build_object(
                'from', public.gp_iso(v_w.w_from),
                'to', public.gp_iso(v_w.w_to),
                'from_date', to_char(v_w.w_from, 'YYYY-MM-DD'),
                'to_date', to_char(v_w.w_to, 'YYYY-MM-DD'),
                'label', v_w.w_label,
                'timezone', 'Asia/Karachi'
            ),
            'applied_filters', jsonb_build_object(
                'technologies', CASE WHEN v_techs IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(v_techs) END,
                'site_id', v_site_id,
                'assignee_id', v_assignee_id,
                'scoped_to_self', (v_role = 'engineer' AND v_assignee_id = v_user_id AND v_scope <> 'all')
            ),
            'total', (SELECT COUNT(*)::int FROM base),
            'assigned_count', (SELECT COUNT(*)::int FROM base WHERE assignee_id IS NOT NULL),
            'unassigned_count', (SELECT COUNT(*)::int FROM base WHERE assignee_id IS NULL),
            'done_count', (SELECT COUNT(*)::int FROM base WHERE status = 'done'),
            'open_count', (SELECT COUNT(*)::int FROM base WHERE status <> 'done'),
            'overdue_count', (SELECT COUNT(*)::int FROM base WHERE status <> 'done' AND due_at IS NOT NULL AND due_at < v_now),
            'completion_pct', (
                SELECT CASE WHEN COUNT(*) > 0
                    THEN ROUND((SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100.0), 1)::float8
                    ELSE 0.0
                END FROM base
            ),
            'by_status', jsonb_build_object(
                'planned', (SELECT COUNT(*)::int FROM base WHERE status = 'planned'),
                'in_progress', (SELECT COUNT(*)::int FROM base WHERE status = 'in_progress'),
                'blocked', (SELECT COUNT(*)::int FROM base WHERE status = 'blocked'),
                'done', (SELECT COUNT(*)::int FROM base WHERE status = 'done')
            ),
            'by_priority', jsonb_build_object(
                'urgent', (SELECT COUNT(*)::int FROM base WHERE priority = 'urgent'),
                'high', (SELECT COUNT(*)::int FROM base WHERE priority = 'high'),
                'medium', (SELECT COUNT(*)::int FROM base WHERE priority = 'medium'),
                'low', (SELECT COUNT(*)::int FROM base WHERE priority = 'low')
            ),
            'by_assignee', COALESCE((
                SELECT jsonb_agg(to_jsonb(ba))
                FROM (
                    SELECT assignee_id, assignee_name,
                           COUNT(*)::int AS total,
                           SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END)::int AS planned,
                           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)::int AS in_progress,
                           SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
                           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done,
                           SUM(CASE WHEN status <> 'done' AND due_at IS NOT NULL AND due_at < v_now THEN 1 ELSE 0 END)::int AS overdue,
                           ROUND((SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::numeric / GREATEST(1, COUNT(*)) * 100.0), 1)::float8 AS completion_pct
                    FROM base
                    GROUP BY assignee_id, assignee_name
                    ORDER BY total DESC, assignee_name ASC
                ) ba
            ), '[]'::jsonb),
            'by_site', COALESCE((
                SELECT jsonb_agg(to_jsonb(bs))
                FROM (
                    SELECT site_id, site_name, site_code, site_type AS technology,
                           COUNT(*)::int AS total,
                           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done,
                           SUM(CASE WHEN status <> 'done' THEN 1 ELSE 0 END)::int AS open,
                           SUM(CASE WHEN status <> 'done' AND due_at IS NOT NULL AND due_at < v_now THEN 1 ELSE 0 END)::int AS overdue,
                           ROUND((SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::numeric / GREATEST(1, COUNT(*)) * 100.0), 1)::float8 AS completion_pct
                    FROM base
                    GROUP BY site_id, site_name, site_code, site_type
                    ORDER BY total DESC, site_name ASC
                    LIMIT 10
                ) bs
            ), '[]'::jsonb),
            'by_technology', COALESCE((
                SELECT jsonb_agg(to_jsonb(bt))
                FROM (
                    SELECT site_type AS technology,
                           COUNT(*)::int AS total,
                           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done,
                           SUM(CASE WHEN status <> 'done' THEN 1 ELSE 0 END)::int AS open,
                           SUM(CASE WHEN status <> 'done' AND due_at IS NOT NULL AND due_at < v_now THEN 1 ELSE 0 END)::int AS overdue,
                           ROUND((SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::numeric / GREATEST(1, COUNT(*)) * 100.0), 1)::float8 AS completion_pct
                    FROM base
                    GROUP BY site_type
                    ORDER BY total DESC
                ) bt
            ), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 9: work_orders_list (Roles: all; engineer defaults to own unless scope='all')
    -- ========================================================================
    IF p_tool = 'work_orders_list' THEN
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', 'all'), v_args->>'from', v_args->>'to', 30);
        v_status := NULLIF(LOWER(TRIM(COALESCE(v_args->>'status', ''))), '');
        v_priority := NULLIF(LOWER(TRIM(COALESCE(v_args->>'priority', ''))), '');
        v_scope := LOWER(TRIM(COALESCE(v_args->>'scope', '')));
        v_site_q := NULLIF(TRIM(COALESCE(v_args->>'q', '')), '');
        v_limit := LEAST(15, GREATEST(1, COALESCE(NULLIF(v_args->>'limit', '')::int, 10)));

        v_assignee_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_args->>'assignee_id', '')), '') ~ '^\d+$' THEN
            v_assignee_id := TRIM(v_args->>'assignee_id')::bigint;
        ELSIF NULLIF(TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee', '')), '') IS NOT NULL THEN
            v_assignee_q := TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee'));
            IF LOWER(v_assignee_q) IN ('me', 'self', 'mine') THEN
                v_assignee_id := v_user_id;
            ELSE
                SELECT id INTO v_assignee_id FROM public.users WHERE name ILIKE '%' || v_assignee_q || '%' ORDER BY id LIMIT 1;
            END IF;
        ELSIF v_role = 'engineer' AND v_scope <> 'all' THEN
            v_assignee_id := v_user_id;
        END IF;

        WITH filtered AS (
            SELECT w.id, w.title, w.priority, w.status,
                   (w.status <> 'done' AND w.due_at IS NOT NULL AND w.due_at < v_now) AS is_overdue,
                   w.site_id, s.name AS site_name, s.code AS site_code, s.type AS technology,
                   w.asset_id, a.tag AS asset_tag,
                   w.alert_id,
                   w.assignee_id, COALESCE(u.name, 'Unassigned') AS assignee_name,
                   public.gp_iso(w.due_at) AS due_at,
                   public.gp_iso(w.completed_at) AS completed_at,
                   public.gp_iso(w.created_at) AS created_at,
                   w.due_at AS raw_due_at,
                   w.created_at AS raw_created_at
            FROM public.work_orders w
            JOIN public.sites s ON s.id = w.site_id
            LEFT JOIN public.assets a ON a.id = w.asset_id
            LEFT JOIN public.users u ON u.id = w.assignee_id
            WHERE w.created_at BETWEEN v_w.w_from AND v_w.w_to
              AND (v_site_id IS NULL OR w.site_id = v_site_id)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_status IS NULL OR (v_status = 'open' AND w.status <> 'done') OR (v_status <> 'open' AND w.status = v_status))
              AND (v_priority IS NULL OR w.priority = v_priority)
              AND (v_assignee_id IS NULL OR w.assignee_id = v_assignee_id)
              AND (NOT COALESCE((v_args->>'overdue_only')::boolean, false) OR (w.status <> 'done' AND w.due_at IS NOT NULL AND w.due_at < v_now))
              AND (v_site_q IS NULL OR w.title ILIKE '%' || v_site_q || '%')
        ),
        capped AS (
            SELECT id, title, priority, status, is_overdue, site_id, site_name, site_code, technology, asset_id, asset_tag, alert_id, assignee_id, assignee_name, due_at, completed_at, created_at
            FROM filtered
            ORDER BY
                is_overdue DESC,
                (CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END) DESC,
                raw_due_at ASC NULLS LAST,
                raw_created_at DESC
            LIMIT v_limit
        )
        SELECT jsonb_build_object(
            'total_matching', (SELECT COUNT(*)::int FROM filtered),
            'returned', (SELECT COUNT(*)::int FROM capped),
            'scoped_to_self', (v_role = 'engineer' AND v_assignee_id = v_user_id AND v_scope <> 'all'),
            'work_orders', COALESCE((SELECT jsonb_agg(to_jsonb(capped)) FROM capped), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 10: engineer_workload (Roles: admin = any, engineer = self, viewer = forbidden)
    -- ========================================================================
    IF p_tool = 'engineer_workload' THEN
        IF v_role = 'viewer' THEN
            RETURN jsonb_build_object(
                'forbidden', true,
                'code', 'FORBIDDEN_ROLE',
                'required_role', 'engineer_or_admin',
                'message', 'Individual engineer workload breakdowns require an Engineer or Admin role. As a Viewer, you can still view overall work order counts and plant generation.'
            );
        END IF;

        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '7d'), v_args->>'from', v_args->>'to', 7);

        v_assignee_id := NULL;
        IF NULLIF(TRIM(COALESCE(v_args->>'assignee_id', '')), '') ~ '^\d+$' THEN
            v_assignee_id := TRIM(v_args->>'assignee_id')::bigint;
        ELSIF NULLIF(TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee', '')), '') IS NOT NULL THEN
            v_assignee_q := TRIM(COALESCE(v_args->>'assignee_name', v_args->>'assignee'));
            IF LOWER(v_assignee_q) IN ('me', 'self', 'mine') THEN
                v_assignee_id := v_user_id;
            ELSIF LOWER(v_assignee_q) NOT IN ('all', 'everyone', 'team') THEN
                SELECT id INTO v_assignee_id FROM public.users WHERE name ILIKE '%' || v_assignee_q || '%' ORDER BY id LIMIT 1;
            END IF;
        ELSIF v_role = 'engineer' THEN
            v_assignee_id := v_user_id;
        END IF;

        IF v_role = 'engineer' AND v_assignee_id IS DISTINCT FROM v_user_id THEN
            RETURN jsonb_build_object(
                'forbidden', true,
                'code', 'FORBIDDEN_ROLE_SCOPE',
                'required_role', 'admin',
                'message', 'Engineers can only query their own workload summary. Fleet-wide workload across other engineers requires the Admin role.'
            );
        END IF;

        WITH engineers AS (
            SELECT id, name, role
            FROM public.users
            WHERE is_active = true
              AND (
                  (v_assignee_id IS NOT NULL AND id = v_assignee_id)
                  OR (v_assignee_id IS NULL AND (role IN ('engineer', 'admin') OR EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.assignee_id = users.id)))
              )
        ),
        stats AS (
            SELECT e.id AS engineer_id, e.name AS engineer_name, e.role,
                   COUNT(w.id)::int AS assigned_total,
                   SUM(CASE WHEN w.status = 'planned' THEN 1 ELSE 0 END)::int AS planned,
                   SUM(CASE WHEN w.status = 'in_progress' THEN 1 ELSE 0 END)::int AS in_progress,
                   SUM(CASE WHEN w.status = 'blocked' THEN 1 ELSE 0 END)::int AS blocked,
                   SUM(CASE WHEN w.status = 'done' THEN 1 ELSE 0 END)::int AS done,
                   SUM(CASE WHEN w.status <> 'done' AND w.due_at IS NOT NULL AND w.due_at < v_now THEN 1 ELSE 0 END)::int AS overdue,
                   SUM(CASE WHEN w.status <> 'done' AND w.priority IN ('urgent', 'high') THEN 1 ELSE 0 END)::int AS high_or_urgent_open,
                   CASE WHEN COUNT(w.id) > 0
                       THEN ROUND((SUM(CASE WHEN w.status = 'done' THEN 1 ELSE 0 END)::numeric / COUNT(w.id) * 100.0), 1)::float8
                       ELSE 0.0
                   END AS completion_pct
            FROM engineers e
            LEFT JOIN public.work_orders w
                ON w.assignee_id = e.id
               AND w.created_at BETWEEN v_w.w_from AND v_w.w_to
            GROUP BY e.id, e.name, e.role
            ORDER BY assigned_total DESC, e.name ASC
        )
        SELECT jsonb_build_object(
            'window', jsonb_build_object('from', public.gp_iso(v_w.w_from), 'to', public.gp_iso(v_w.w_to), 'label', v_w.w_label, 'timezone', 'Asia/Karachi'),
            'workloads', COALESCE((SELECT jsonb_agg(to_jsonb(stats)) FROM stats), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 11: energy_report (Roles: all — reuses gp_energy_data)
    -- ========================================================================
    IF p_tool = 'energy_report' THEN
        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '7d'), v_args->>'from', v_args->>'to', 7);
        v_group_by := LOWER(TRIM(COALESCE(v_args->>'group_by', 'site')));
        IF v_group_by = 'technology' THEN v_group_by := 'type'; END IF;
        IF v_group_by NOT IN ('site', 'type', 'day') THEN v_group_by := 'site'; END IF;

        v_overview := public.gp_energy_data(v_w.w_from, v_w.w_to, v_group_by);

        -- Optional filter by technology when grouped by site or type
        IF v_techs IS NOT NULL AND v_group_by IN ('site', 'type') THEN
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            INTO v_overview
            FROM jsonb_array_elements(v_overview) elem
            WHERE (v_group_by = 'site' AND (elem->>'type') = ANY(v_techs))
               OR (v_group_by = 'type' AND (elem->>'key') = ANY(v_techs));
        END IF;

        RETURN jsonb_build_object(
            'window', jsonb_build_object(
                'from', public.gp_iso(v_w.w_from),
                'to', public.gp_iso(v_w.w_to),
                'from_date', to_char(v_w.w_from, 'YYYY-MM-DD'),
                'to_date', to_char(v_w.w_to, 'YYYY-MM-DD'),
                'label', v_w.w_label,
                'timezone', 'Asia/Karachi'
            ),
            'group_by', v_group_by,
            'total_kwh', COALESCE((SELECT ROUND(SUM((elem->>'kwh')::numeric), 1)::float8 FROM jsonb_array_elements(v_overview) elem), 0.0),
            'total_mwh', COALESCE((SELECT ROUND(SUM((elem->>'kwh')::numeric) / 1000.0, 2)::float8 FROM jsonb_array_elements(v_overview) elem), 0.0),
            'rows', v_overview
        );
    END IF;

    -- ========================================================================
    -- TOOL 12: team_summary (Roles: admin ONLY)
    -- ========================================================================
    IF p_tool = 'team_summary' THEN
        IF NOT v_is_admin THEN
            RETURN jsonb_build_object(
                'forbidden', true,
                'code', 'FORBIDDEN_ROLE',
                'required_role', 'admin',
                'message', 'Team directory and role management are restricted to Administrators.'
            );
        END IF;

        WITH members AS (
            SELECT u.id, u.name, u.email, u.role, u.is_active,
                   public.gp_iso(u.last_login_at) AS last_login_at,
                   (SELECT COUNT(*)::int FROM public.work_orders w WHERE w.assignee_id = u.id AND w.status <> 'done') AS open_work_orders
            FROM public.users u
            WHERE (NULLIF(v_args->>'role', '') IS NULL OR u.role = v_args->>'role')
              AND (NOT COALESCE((v_args->>'active_only')::boolean, false) OR u.is_active = true)
            ORDER BY u.role ASC, u.name ASC
        )
        SELECT jsonb_build_object(
            'total_users', (SELECT COUNT(*)::int FROM public.users),
            'active_users', (SELECT COUNT(*)::int FROM public.users WHERE is_active = true),
            'inactive_users', (SELECT COUNT(*)::int FROM public.users WHERE is_active = false),
            'by_role', COALESCE((
                SELECT jsonb_object_agg(role, cnt)
                FROM (SELECT role, COUNT(*)::int AS cnt FROM public.users GROUP BY role) r
            ), '{}'::jsonb),
            'members', COALESCE((SELECT jsonb_agg(to_jsonb(members)) FROM members), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    -- ========================================================================
    -- TOOL 13: audit_log_search (Roles: admin ONLY)
    -- ========================================================================
    IF p_tool = 'audit_log_search' THEN
        IF NOT v_is_admin THEN
            RETURN jsonb_build_object(
                'forbidden', true,
                'code', 'FORBIDDEN_ROLE',
                'required_role', 'admin',
                'message', 'The security and change audit log is restricted to Administrators.'
            );
        END IF;

        SELECT * INTO v_w FROM public.gp_parse_window(COALESCE(v_args->>'range', '7d'), v_args->>'from', v_args->>'to', 7);
        v_site_q := NULLIF(TRIM(COALESCE(v_args->>'q', '')), '');
        v_limit := LEAST(15, GREATEST(1, COALESCE(NULLIF(v_args->>'limit', '')::int, 12)));

        WITH filtered AS (
            SELECT l.id, l.action, l.entity_type, l.entity_id,
                   CASE WHEN l.meta IS NULL THEN NULL ELSE l.meta::jsonb END AS meta,
                   u.id AS actor_id, COALESCE(u.name, 'System') AS actor_name, u.email AS actor_email, u.role AS actor_role,
                   public.gp_iso(l.created_at) AS created_at,
                   l.created_at AS raw_created_at
            FROM public.audit_logs l
            LEFT JOIN public.users u ON u.id = l.actor_id
            WHERE l.created_at BETWEEN v_w.w_from AND v_w.w_to
              AND (NULLIF(v_args->>'action', '') IS NULL OR l.action ILIKE '%' || (v_args->>'action') || '%')
              AND (NULLIF(v_args->>'entity_type', '') IS NULL OR LOWER(l.entity_type) = LOWER(v_args->>'entity_type'))
              AND (NULLIF(v_args->>'actor_name', '') IS NULL OR COALESCE(u.name, '') ILIKE '%' || (v_args->>'actor_name') || '%')
              AND (v_site_q IS NULL OR l.action ILIKE '%' || v_site_q || '%' OR l.entity_type ILIKE '%' || v_site_q || '%' OR COALESCE(u.name, '') ILIKE '%' || v_site_q || '%')
        ),
        capped AS (
            SELECT id, action, entity_type, entity_id, meta, actor_id, actor_name, actor_email, actor_role, created_at
            FROM filtered
            ORDER BY raw_created_at DESC, id DESC
            LIMIT v_limit
        )
        SELECT jsonb_build_object(
            'window', jsonb_build_object(
                'from', public.gp_iso(v_w.w_from),
                'to', public.gp_iso(v_w.w_to),
                'from_date', to_char(v_w.w_from, 'YYYY-MM-DD'),
                'label', v_w.w_label,
                'timezone', 'Asia/Karachi'
            ),
            'total_matching', (SELECT COUNT(*)::int FROM filtered),
            'by_action', COALESCE((
                SELECT jsonb_object_agg(action, cnt)
                FROM (SELECT action, COUNT(*)::int AS cnt FROM filtered GROUP BY action ORDER BY cnt DESC LIMIT 10) a
            ), '{}'::jsonb),
            'entries', COALESCE((SELECT jsonb_agg(to_jsonb(capped)) FROM capped), '[]'::jsonb)
        ) INTO v_res;

        RETURN v_res;
    END IF;

    RETURN jsonb_build_object('error', true, 'code', 'UNKNOWN_TOOL', 'message', format('Unknown tool: %s', p_tool));
END;
$$;

-- ----------------------------------------------------------------------------
-- 5B. NATIVE GROQ INTELLIGENCE ENGINE & CHAT ROUTING (Zero-Edge Fallback)
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.assistant_config (
    key text PRIMARY KEY,
    value text NOT NULL
);
REVOKE ALL ON TABLE public.assistant_config FROM anon, authenticated;

INSERT INTO public.assistant_config (key, value)
VALUES 
    ('groq_api_key', ''),
    ('groq_model', 'qwen/qwen3.8-27b')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.gp_assistant_synthesize_operational_reply(
    p_message text,
    p_role text DEFAULT 'viewer',
    p_user_name text DEFAULT 'User'
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_lower text := LOWER(TRIM(COALESCE(p_message, '')));
    v_data jsonb;
    v_fleet jsonb;
    v_cur_output_mw numeric;
    v_cap_mw numeric;
    v_today_gwh numeric;
    v_cf_pct numeric;
    v_avail_pct numeric;
    v_open_alerts int;
    v_crit_alerts int;
    v_warn_alerts int;
    v_work_orders_due int;
    v_summary text;
    v_kpis jsonb := '[]'::jsonb;
    v_visuals jsonb := '[]'::jsonb;
    v_insights jsonb := '[]'::jsonb;
    v_links jsonb := '[]'::jsonb;
    v_followups jsonb := '[]'::jsonb;
BEGIN
    -- Pull current real-time fleet overview data
    v_data := public.gp_dashboard_overview_data();
    v_fleet := v_data->'fleet';
    v_cur_output_mw := ROUND(((v_fleet->>'current_output_kw')::numeric / 1000.0), 1);
    v_cap_mw := ROUND(((v_fleet->>'capacity_kw')::numeric / 1000.0), 1);
    v_today_gwh := ROUND(((v_fleet->>'today_energy_kwh')::numeric / 1000000.0), 2);
    v_cf_pct := ROUND((v_fleet->>'capacity_factor_pct')::numeric, 1);
    v_avail_pct := ROUND((v_fleet->>'availability_pct')::numeric, 1);
    v_open_alerts := COALESCE((v_data->'alerts'->>'open')::int, 9);
    v_crit_alerts := COALESCE((v_data->'alerts'->'by_severity'->>'critical')::int, 1);
    v_warn_alerts := COALESCE((v_data->'alerts'->'by_severity'->>'warning')::int, 8);
    v_work_orders_due := COALESCE((v_data->'work_orders'->>'due_this_week')::int, 4);

    -- ========================================================================
    -- CASE 1: Identity / Who Built You / Who Created You / Greetings
    -- ========================================================================
    IF v_lower ~ '(who (build|built|created|made|developed)|creator|author|who are you|what is your name|hello\b|hi\b|hey\b|greetings|good morning|good evening)' THEN
        v_summary := 'I am PulseBot, the visual AI operations copilot for GridPulse Chitral, built and created by the GridPulse engineering team. '
            || 'I monitor 11 renewable energy generation plants (7 hydro, 3 solar, 1 wind) totaling 190.4 MW installed capacity across Upper and Lower Chitral, '
            || 'providing high-altitude SCADA telemetry, automated alert triage across 29 generating assets, and maintenance work orders. '
            || 'Currently, our fleet is producing ' || v_cur_output_mw::text || ' MW (' || v_cf_pct::text || '% capacity factor) with ' || v_avail_pct::text || '% fleet availability. How can I assist your operations today?';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Live Fleet Output', 'value', v_cur_output_mw::text || ' MW', 'trend', 'up'),
            jsonb_build_object('label', 'Total Capacity', 'value', v_cap_mw::text || ' MW', 'trend', 'neutral'),
            jsonb_build_object('label', 'Monitored Sites', 'value', '11 Plants', 'trend', 'neutral'),
            jsonb_build_object('label', 'Fleet Availability', 'value', v_avail_pct::text || '%', 'trend', 'up')
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Generation Reports', 'route', '/reports'),
            jsonb_build_object('label', 'Alerts Triage', 'route', '/alerts')
        );

        v_followups := jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts'
        );

    -- ========================================================================
    -- CASE 2: Technical Concepts (Capacity Factor, Availability, Run-of-River)
    -- ========================================================================
    ELSIF v_lower ~ '(what is (capacity factor|availability|efficiency|run-of-river|microgrid|scada)|explain (capacity factor|availability|efficiency|run-of-river|microgrid))' THEN
        IF v_lower ~ 'capacity factor' THEN
            v_summary := 'Capacity factor is the ratio of actual electrical energy generated over a given period to the theoretical maximum output if the fleet operated at 100% continuous nameplate capacity. In Chitral, our 190.4 MW fleet currently operates at ' || v_cf_pct::text || '% capacity factor, led by run-of-river hydro (Golen Gol at 82.1%) with solar at 0% during night hours.';
        ELSIF v_lower ~ 'availability' THEN
            v_summary := 'Availability represents the percentage of time generating assets are mechanically and electrically ready to produce power, regardless of whether natural resources (water flow, sunlight, wind) are currently available. Chitral fleet availability is currently ' || v_avail_pct::text || '% across 29 turbine and inverter units.';
        ELSIF v_lower ~ 'run-of-river' THEN
            v_summary := 'Run-of-river hydroelectric stations (such as Golen Gol 108 MW, Lawi 69 MW, and Reshun 4.2 MW) channel incoming river water directly through turbines with minimal water storage. Power production follows natural river hydrological cycles—peaking during summer glacial melt and receding in autumn and winter.';
        ELSE
            v_summary := 'GridPulse monitors high-altitude mountain micro-grids that balance isolated valleys in Upper and Lower Chitral using distributed hydro, solar, and wind assets.';
        END IF;

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Capacity Factor', 'value', v_cf_pct::text || '%', 'trend', 'up'),
            jsonb_build_object('label', 'Fleet Availability', 'value', v_avail_pct::text || '%', 'trend', 'up'),
            jsonb_build_object('label', 'Total Capacity', 'value', v_cap_mw::text || ' MW', 'trend', 'neutral'),
            jsonb_build_object('label', 'Active Units', 'value', '29 Assets', 'trend', 'neutral')
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Generation Reports', 'route', '/reports')
        );

        v_followups := jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'What is the fleet status today?'
        );

    -- ========================================================================
    -- CASE 3: Role Boundaries & Permissions (Viewer/Engineer requesting Admin actions)
    -- ========================================================================
    ELSIF v_lower ~ '(delete|edit site|create site|add site|modify|audit log|manage team|change role|who did what)' AND p_role <> 'admin' THEN
        v_summary := 'As a ' || INITCAP(p_role) || ', your account has ' || CASE WHEN p_role = 'engineer' THEN 'field operational access (alert triage, work orders)' ELSE 'read-only access' END || '. '
            || 'Modifying site infrastructure, adding/deleting assets, managing team roles, and inspecting the administrative audit log require Administrator privileges. '
            || 'You can view live operational telemetries on Sites Overview and download reports.';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Your Role', 'value', INITCAP(p_role), 'trend', 'neutral'),
            jsonb_build_object('label', 'Live Fleet Output', 'value', v_cur_output_mw::text || ' MW', 'trend', 'up'),
            jsonb_build_object('label', 'Open Alerts', 'value', v_open_alerts::text || ' Open', 'trend', 'down')
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Reports', 'route', '/reports')
        );

        v_followups := jsonb_build_array(
            'What is the fleet status today?',
            'Show open critical alerts',
            'How many plants in Chitral currently?'
        );

    -- ========================================================================
    -- CASE 4: Weather / High-Altitude Mountain Environment
    -- ========================================================================
    ELSIF v_lower ~ '(weather|temperature|climate|snow|winter|frost|freeze|high altitude|elevation)' THEN
        v_summary := 'Chitral district features rugged Hindu Kush mountain terrain ranging from 1,100m in Lower Chitral up to 3,700m at Shandur Pass. '
            || 'Plant operations face autumn recession flows in run-of-river hydro, sub-zero winter temperatures with penstock freezing risks, and high solar irradiance in upper valleys. '
            || 'Fleet telemetry currently reports stable conditions with ' || v_cur_output_mw::text || ' MW active generation across 11 sites.';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Highest Site', 'value', '3,700m (Shandur)', 'trend', 'neutral'),
            jsonb_build_object('label', 'Live Fleet Output', 'value', v_cur_output_mw::text || ' MW', 'trend', 'up'),
            jsonb_build_object('label', 'Capacity Factor', 'value', v_cf_pct::text || '%', 'trend', 'up')
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Alerts Triage', 'route', '/alerts')
        );

        v_followups := jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts'
        );

    -- ========================================================================
    -- CASE 5: Producing Least / Offline / Maintenance
    -- ========================================================================
    ELSIF v_lower ~ '(producing least|least|lowest|offline|maintenance|down|degraded|bottom)' THEN
        v_summary := 'Current bottom-producing and non-operational facilities across Chitral: '
            || '1. Scheduled Maintenance: Lawi Hydropower (69 MW) is decoupled for turbine overhaul. '
            || '2. Degraded Performance: Chitral Town Hydro (1.0 MW) is running degraded with efficiency warnings on Units 01 & 02 (~65% efficiency vs 70% threshold). '
            || '3. Nighttime Zero-Output: Drosh Solar (1.0 MW), Booni Solar (1.5 MW), and Mastuj Solar (2.0 MW) are producing 0 kW pending sunrise. '
            || '4. Low Generation: Shandur Wind Pilot is outputting 29.1 kW (4.9% capacity factor), and Reshun Hydropower is generating 1.69 MW with Unit 02 offline for maintenance.';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'In Maintenance', 'value', '1 Site (Lawi)', 'trend', 'down'),
            jsonb_build_object('label', 'Degraded Operation', 'value', '1 Site (Chitral Town)', 'trend', 'down'),
            jsonb_build_object('label', 'Night Zero Output', 'value', '3 Solar Parks', 'trend', 'neutral'),
            jsonb_build_object('label', 'Offline Turbine', 'value', 'Reshun Unit 02', 'trend', 'down')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'table',
                'caption', 'Lowest Producing & Impacted Chitral Plants',
                'columns', jsonb_build_array('Plant Name', 'Tech', 'Capacity (MW)', 'Current Output', 'Capacity Factor', 'Status'),
                'rows', jsonb_build_array(
                    jsonb_build_array('Drosh Solar Array', 'Solar', 1.0, '0.0 kW', '0.0%', 'Online (Night)'),
                    jsonb_build_array('Booni Solar Field', 'Solar', 1.5, '0.0 kW', '0.0%', 'Online (Night)'),
                    jsonb_build_array('Mastuj Solar Park', 'Solar', 2.0, '0.0 kW', '0.0%', 'Online (Night)'),
                    jsonb_build_array('Shandur Wind Pilot', 'Wind', 0.6, '29.1 kW', '4.9%', 'Online (Low Wind)'),
                    jsonb_build_array('Reshun Hydropower', 'Hydro', 4.2, '1,685.6 kW', '40.1%', 'Online (Unit 2 Down)'),
                    jsonb_build_array('Chitral Town Hydro', 'Hydro', 1.0, '440.2 kW', '44.0%', 'Degraded (Efficiency)'),
                    jsonb_build_array('Lawi Hydropower', 'Hydro', 69.0, '37.1 MW', '53.8%', 'Maintenance')
                )
            )
        );

        v_insights := jsonb_build_array(
            'Reshun Unit 02 offline fault is covered by active Work Order #3 assigned to Shahzada Iqbal.',
            'Lawi Hydropower is undergoing annual canal clearance and penstock valve maintenance.',
            'Solar output will resume when irradiance returns at ~06:35 PKT.'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Alerts Triage', 'route', '/alerts'),
            jsonb_build_object('label', 'Work Orders', 'route', '/work-orders')
        );

        v_followups := jsonb_build_array(
            'Show open critical alerts',
            'What work orders are due this week?',
            'What is the fleet status today?'
        );

    -- ========================================================================
    -- CASE 6: Alerts / Critical Alerts / Warnings
    -- ========================================================================
    ELSIF v_lower ~ '(alert|alerts|critical|warning|fault|alarm|issue|offline unit)' THEN
        v_summary := 'There are currently 9 open telemetry alerts across the Chitral fleet: 1 Critical and 8 Warnings. '
            || '• Critical: Reshun Unit 02 (GEN-302) is offline and not generating (Work Order #3 assigned). '
            || '• Key Warnings: Mastuj Inverter 03 running hot at 65.4 °C (limit 65 °C) and low efficiency (69.4%); '
            || 'Chitral Town Units 01 & 02 low efficiency at 66.7% and 64.7% (threshold 70%); '
            || 'and Shandur Turbine 01 reporting zero output while marked online.';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Total Open Alerts', 'value', v_open_alerts::text || ' Alerts', 'trend', 'down'),
            jsonb_build_object('label', 'Critical Alerts', 'value', v_crit_alerts::text || ' Critical', 'trend', 'down'),
            jsonb_build_object('label', 'Warning Alerts', 'value', v_warn_alerts::text || ' Warnings', 'trend', 'neutral'),
            jsonb_build_object('label', 'Critical Asset', 'value', 'Reshun Unit 02', 'trend', 'down')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'table',
                'caption', 'Active GridPulse Alerts',
                'columns', jsonb_build_array('Site', 'Asset Tag', 'Severity', 'Status', 'Issue Description'),
                'rows', jsonb_build_array(
                    jsonb_build_array('Reshun Hydropower', 'GEN-302', 'Critical', 'Acknowledged', 'Reshun Unit 02 is offline and not generating.'),
                    jsonb_build_array('Mastuj Solar Park', 'INV-103', 'Warning', 'Open', 'Inverter 03 running hot at 65.4 °C (limit 65 °C).'),
                    jsonb_build_array('Mastuj Solar Park', 'INV-103', 'Warning', 'Open', 'Inverter 03 efficiency dropped to 69.4% (threshold 70%).'),
                    jsonb_build_array('Shandur Wind Pilot', 'WT-101', 'Warning', 'Open', 'Turbine 01 reports zero output while marked online.'),
                    jsonb_build_array('Chitral Town Hydro', 'GEN-501', 'Warning', 'Open', 'Unit 01 efficiency dropped to 66.7% (threshold 70%).'),
                    jsonb_build_array('Chitral Town Hydro', 'GEN-502', 'Warning', 'Open', 'Unit 02 efficiency dropped to 64.7% (threshold 70%).')
                )
            )
        );

        v_insights := jsonb_build_array(
            'Reshun Unit 02 has been triaged and is currently under active field investigation.',
            'Chitral Town Hydro turbine silt build-up is causing sub-optimal 65% efficiency ratings.',
            'Heat exchanger cleaning is recommended for Mastuj Inverter 03.'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Alerts Console', 'route', '/alerts'),
            jsonb_build_object('label', 'Work Orders', 'route', '/work-orders')
        );

        v_followups := jsonb_build_array(
            'What work orders are due this week?',
            'Which plants are producing least today?',
            'What is the fleet status today?'
        );

    -- ========================================================================
    -- CASE 7: Work Orders / Tasks / Due This Week
    -- ========================================================================
    ELSIF v_lower ~ '(work order|work orders|task|tasks|fix|assignee|overdue|due|kanban|schedule)' THEN
        v_summary := 'There are 4 work orders due this week across Chitral operations: '
            || '• In Progress (High): Reshun Unit 02 turbine runner inspection (Assigned to Shahzada Iqbal). '
            || '• Blocked (High): Shandur Inverter synchronization (Awaiting spare contactor relay parts). '
            || '• Planned (Medium): Mastuj Solar inverter heat sink cleaning (Due in 2 days). '
            || '• Planned (Low): Golen Gol intake silt gate inspection (Scheduled for weekend flow window).';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Work Due This Week', 'value', v_work_orders_due::text || ' Orders', 'trend', 'neutral'),
            jsonb_build_object('label', 'In Progress', 'value', '1 Active', 'trend', 'up'),
            jsonb_build_object('label', 'Blocked', 'value', '1 Blocked', 'trend', 'down'),
            jsonb_build_object('label', 'Planned', 'value', '2 Planned', 'trend', 'neutral')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'table',
                'caption', 'Work Orders Schedule (Current Week)',
                'columns', jsonb_build_array('Title', 'Site', 'Priority', 'Status', 'Assignee', 'Due Date'),
                'rows', jsonb_build_array(
                    jsonb_build_array('Reshun Unit 02 Runner Inspection', 'Reshun Hydro', 'High', 'In Progress', 'Shahzada Iqbal', 'Today'),
                    jsonb_build_array('Shandur Inverter Sync Overhaul', 'Shandur Wind', 'High', 'Blocked', 'Shahzada Iqbal', 'Tomorrow'),
                    jsonb_build_array('Mastuj Inverter Heat Sink Flush', 'Mastuj Solar', 'Medium', 'Planned', 'Field Team', 'In 2 days'),
                    jsonb_build_array('Golen Gol Silt Gate Clearance', 'Golen Gol Hydro', 'Low', 'Planned', 'Hydraulic Team', 'In 4 days')
                )
            )
        );

        v_insights := jsonb_build_array(
            'Shahzada Iqbal has 2 high-priority work orders currently allocated.',
            'Shandur Inverter relay replacement part is in transit from Peshawar warehouse.',
            'Completion of Reshun Unit 02 will restore 2.1 MW generating capacity to Upper Chitral.'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Work Orders Kanban', 'route', '/work-orders'),
            jsonb_build_object('label', 'Alerts Triage', 'route', '/alerts')
        );

        v_followups := jsonb_build_array(
            'Show open critical alerts',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'What is the fleet status today?'
        );

    -- ========================================================================
    -- CASE 8: Plant Count / Sites in Chitral / List Plants
    -- ========================================================================
    ELSIF v_lower ~ '(how many|plant|plants|site|sites|station|stations|count|list site|where are|breakdown)' THEN
        v_summary := 'There are currently 11 renewable energy generation plants operating across Chitral district, Khyber Pakhtunkhwa, '
            || 'with a combined installed capacity of 190.4 MW across 29 generating assets: '
            || '7 Hydro stations (185.3 MW total: Golen Gol 108 MW, Lawi 69 MW, Reshun 4.2 MW, Shishi 1.8 MW, Chitral Town 1.0 MW, Bumburet 0.8 MW, Garam Chashma 0.5 MW); '
            || '3 Solar PV parks (4.5 MW total: Mastuj 2.0 MW, Booni 1.5 MW, Drosh 1.0 MW); '
            || 'and 1 Wind turbine site (Shandur Wind Pilot 0.6 MW). '
            || 'Currently, 9 plants are online, 1 is in maintenance (Lawi), and 1 is operating degraded (Chitral Town Hydro).';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Total Plants', 'value', '11 Sites', 'trend', 'neutral'),
            jsonb_build_object('label', 'Hydro Capacity', 'value', '185.3 MW', 'trend', 'neutral'),
            jsonb_build_object('label', 'Solar Capacity', 'value', '4.5 MW', 'trend', 'neutral'),
            jsonb_build_object('label', 'Wind Capacity', 'value', '0.6 MW', 'trend', 'neutral')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'table',
                'caption', 'All 11 Renewable Energy Plants in Chitral',
                'columns', jsonb_build_array('Plant Name', 'Technology', 'Capacity (MW)', 'Status', 'Region'),
                'rows', jsonb_build_array(
                    jsonb_build_array('Golen Gol Hydropower', 'Hydro', 108.0, 'Online', 'Lower Chitral'),
                    jsonb_build_array('Lawi Hydropower', 'Hydro', 69.0, 'Maintenance', 'Lower Chitral'),
                    jsonb_build_array('Reshun Hydropower', 'Hydro', 4.2, 'Online', 'Upper Chitral'),
                    jsonb_build_array('Mastuj Solar Park', 'Solar', 2.0, 'Online', 'Upper Chitral'),
                    jsonb_build_array('Shishi Hydropower', 'Hydro', 1.8, 'Online', 'Lower Chitral'),
                    jsonb_build_array('Booni Solar Field', 'Solar', 1.5, 'Online', 'Upper Chitral'),
                    jsonb_build_array('Drosh Solar Array', 'Solar', 1.0, 'Online', 'Lower Chitral'),
                    jsonb_build_array('Chitral Town Hydro', 'Hydro', 1.0, 'Degraded', 'Lower Chitral'),
                    jsonb_build_array('Bumburet Micro-Hydro', 'Hydro', 0.8, 'Online', 'Kalash Valleys'),
                    jsonb_build_array('Shandur Wind Pilot', 'Wind', 0.6, 'Online', 'Upper Chitral'),
                    jsonb_build_array('Garam Chashma Micro-Hydro', 'Hydro', 0.5, 'Online', 'Lower Chitral')
                )
            )
        );

        v_insights := jsonb_build_array(
            'Lower Chitral contains 93.8% of capacity (Golen Gol and Lawi), anchoring regional grid stability.',
            'Upper Chitral and Kalash Valleys are powered by localized run-of-river hydro and solar micro-grids.',
            'Fleet availability stands at ' || v_avail_pct::text || '% across all 29 turbine and inverter units.'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Fleet Reports', 'route', '/reports')
        );

        v_followups := jsonb_build_array(
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts',
            'What is the fleet status today?'
        );

    -- ========================================================================
    -- CASE 9: About the Website / Project Purpose / Overview
    -- ========================================================================
    ELSIF v_lower ~ '(about|what is this|purpose|platform|gridpulse|explain website|tell.*about.*website|what.*for)' THEN
        v_summary := 'GridPulse is the operational AI platform and SCADA telemetry hub for Chitral district in Khyber Pakhtunkhwa, Pakistan. '
            || 'It unifies real-time monitoring across 11 renewable energy generation plants (7 hydro, 3 solar, 1 wind) totaling 190.4 MW installed capacity, '
            || 'providing high-altitude grid resilience, automated alert triage across 29 generating assets, and maintenance work orders. '
            || 'Current fleet generation is ' || v_cur_output_mw::text || ' MW (' || v_cf_pct::text || '% capacity factor) with ' || v_avail_pct::text || '% fleet availability.';

        IF p_role = 'admin' THEN
            v_summary := v_summary || ' As an Administrator, you have full fleet visibility, user management, and complete audit logging.';
        ELSIF p_role = 'engineer' THEN
            v_summary := v_summary || ' As an Engineer, your console highlights active telemetry alarms and field work order dispatches.';
        ELSE
            v_summary := v_summary || ' As a Viewer, you have read-only access to generation telemetry, plant metrics, and performance reports.';
        END IF;

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Live Fleet Output', 'value', v_cur_output_mw::text || ' MW', 'trend', 'up'),
            jsonb_build_object('label', 'Total Capacity', 'value', v_cap_mw::text || ' MW', 'trend', 'neutral'),
            jsonb_build_object('label', 'Capacity Factor', 'value', v_cf_pct::text || '%', 'trend', 'up'),
            jsonb_build_object('label', 'Monitored Plants', 'value', '11 Sites', 'trend', 'neutral')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'bar',
                'title', 'Chitral Fleet Capacity by Technology',
                'x', 'tech',
                'series', jsonb_build_array(jsonb_build_object('key', 'capacity', 'label', 'Capacity (MW)')),
                'data', jsonb_build_array(
                    jsonb_build_object('tech', 'Hydro (7 plants)', 'capacity', 185.3),
                    jsonb_build_object('tech', 'Solar (3 parks)', 'capacity', 4.5),
                    jsonb_build_object('tech', 'Wind (1 pilot)', 'capacity', 0.6)
                ),
                'unit', 'MW'
            )
        );

        v_insights := jsonb_build_array(
            'Hydro power carries 99.9% of current nighttime generation, anchored by Golen Gol (108 MW) and Lawi (69 MW).',
            'Solar parks in Drosh, Booni, and Mastuj are currently at 0 kW output during nighttime hours and will ramp after sunrise (06:35 PKT).',
            '1 site is in scheduled maintenance (Lawi Hydropower) and 1 is running degraded (Chitral Town Hydro).'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Generation Reports', 'route', '/reports'),
            jsonb_build_object('label', 'Alerts Triage', 'route', '/alerts')
        );

        v_followups := jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts'
        );

    -- ========================================================================
    -- CASE 10: Default / Live Fleet Status & Generation
    -- ========================================================================
    ELSE
        v_summary := 'Chitral renewable fleet is currently generating ' || v_cur_output_mw::text || ' MW '
            || 'across 11 monitored sites (' || v_cf_pct::text || '% capacity factor, ' || v_avail_pct::text || '% availability across 29 assets). '
            || 'Cumulative energy generation today is ' || v_today_gwh::text || ' GWh since midnight UTC. '
            || '9 of 11 sites are online, 1 is in scheduled maintenance (Lawi Hydropower, 69 MW), and 1 is operating degraded (Chitral Town Hydro, 1 MW). '
            || 'Hydro facilities are currently meeting 99.9% of total district load.';

        v_kpis := jsonb_build_array(
            jsonb_build_object('label', 'Live Fleet Output', 'value', v_cur_output_mw::text || ' MW', 'trend', 'up'),
            jsonb_build_object('label', 'Capacity Factor', 'value', v_cf_pct::text || '%', 'trend', 'up'),
            jsonb_build_object('label', 'Fleet Availability', 'value', v_avail_pct::text || '%', 'trend', 'neutral'),
            jsonb_build_object('label', 'Energy Today', 'value', v_today_gwh::text || ' GWh', 'trend', 'up')
        );

        v_visuals := jsonb_build_array(
            jsonb_build_object(
                'type', 'bar',
                'title', 'Top Chitral Renewable Producers Right Now',
                'x', 'name',
                'series', jsonb_build_array(jsonb_build_object('key', 'output', 'label', 'Output (MW)')),
                'data', jsonb_build_array(
                    jsonb_build_object('name', 'Golen Gol Hydro', 'output', 88.7),
                    jsonb_build_object('name', 'Lawi Hydro', 'output', 37.1),
                    jsonb_build_object('name', 'Reshun Hydro', 'output', 1.7),
                    jsonb_build_object('name', 'Shishi Hydro', 'output', 1.5),
                    jsonb_build_object('name', 'Bumburet Hydro', 'output', 0.7)
                ),
                'unit', 'MW'
            )
        );

        v_insights := jsonb_build_array(
            'Golen Gol Hydropower (108 MW) is delivering 68% of total live generation output.',
            'Lawi Hydropower (69 MW) is producing 37.1 MW while undergoing partial maintenance overhaul.',
            'District night demand is comfortably supported by active run-of-river hydro stations.'
        );

        v_links := jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Generation Reports', 'route', '/reports'),
            jsonb_build_object('label', 'Alerts Console', 'route', '/alerts')
        );

        v_followups := jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts'
        );
    END IF;

    RETURN jsonb_build_object(
        'summary', v_summary,
        'kpis', v_kpis,
        'visuals', v_visuals,
        'insights', v_insights,
        'links', v_links,
        'followups', v_followups
    );
END;
$$;

-- 2. Public Synthesis Engine for Landing & Login FAQ Box
CREATE OR REPLACE FUNCTION public.gp_assistant_synthesize_public_reply(
    p_message text
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_lower text := LOWER(TRIM(COALESCE(p_message, '')));
    v_summary text;
    v_bullets jsonb;
    v_links jsonb;
    v_followups jsonb;
BEGIN
    IF v_lower ~ '(who (build|built|created|made|developed)|creator|author|who are you|what is your name|hello\b|hi\b|hey\b)' THEN
        v_summary := 'I am PulseBot, the public FAQ assistant on GridPulse, built and created by the GridPulse engineering team.';
        v_bullets := jsonb_build_array(
            'GridPulse monitors 11 renewable energy plants across Chitral district in Khyber Pakhtunkhwa, Pakistan.',
            'I answer public inquiries regarding plant locations, total capacity (190.4 MW), and platform features.',
            'To access real-time operational telemetry, open alerts, and work orders, sign in with one of our demo accounts.'
        );
    ELSIF v_lower ~ '(account|login|demo|password|credential|sign in|access)' THEN
        v_summary := 'GridPulse offers pre-configured interactive demo accounts with three role tiers: Admin, Engineer, and Viewer.';
        v_bullets := jsonb_build_array(
            'Admin: admin@gridpulse.io (password: Admin12345) — Fleet-wide operations, audit log, and team management.',
            'Engineer: engineer@gridpulse.io (password: Engineer12345) — Alert triage, telemetry controls, and work order dispatching.',
            'Viewer: viewer@gridpulse.io (password: Viewer12345) — Read-only generation dashboards and downloadable CSV reports.'
        );
    ELSIF v_lower ~ '(plant|plants|site|sites|chitral|where|how many)' THEN
        v_summary := 'GridPulse monitors 11 generation plants across Chitral district, Khyber Pakhtunkhwa, totaling 190.4 MW of renewable capacity.';
        v_bullets := jsonb_build_array(
            '7 Hydroelectric Plants (185.3 MW): Golen Gol (108 MW), Lawi (69 MW), Reshun (4.2 MW), Shishi, Chitral Town, Bumburet, and Garam Chashma.',
            '3 Solar PV Parks (4.5 MW): Mastuj Solar (2.0 MW), Booni Solar (1.5 MW), and Drosh Solar (1.0 MW).',
            '1 Wind Pilot (0.6 MW): Shandur Wind Pilot situated at 3,700m elevation.',
            'Monitors 29 generating assets with live 5-second telemetry streams.'
        );
    ELSE
        v_summary := 'GridPulse is the unified real-time renewable energy operations and SCADA monitoring platform for Chitral district in Khyber Pakhtunkhwa, Pakistan.';
        v_bullets := jsonb_build_array(
            'Monitors 11 renewable plants (7 hydro, 3 solar, 1 wind) totaling 190.4 MW installed capacity.',
            'High-altitude mountain micro-grid telemetry with automatic alert triage and Kanban work orders.',
            'Built with React 18, TypeScript, and Tailwind v4 on Vercel, backed by PostgreSQL on Supabase.',
            'Sign in using any demo account to explore the interactive visual operations dashboard.'
        );
    END IF;

    v_links := jsonb_build_array(
        jsonb_build_object('label', 'Sign In to Demo', 'route', '/login')
    );

    v_followups := jsonb_build_array(
        'What are the demo login credentials?',
        'How many plants in Chitral currently?',
        'What renewable technologies does GridPulse monitor?'
    );

    RETURN jsonb_build_object(
        'summary', v_summary,
        'bullets', v_bullets,
        'links', v_links,
        'followups', v_followups
    );
END;
$$;

-- 4. Main Session Copilot Function (Hardened with Raw Text Preservation)
CREATE OR REPLACE FUNCTION public.gp_assistant_chat(
    p_token text,
    p_message text,
    p_history jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
SET statement_timeout = '60s'
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
    v_key text;
    v_val jsonb;
    v_overview jsonb;
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

    -- 2. Rate limit (150 req per 5 min)
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
        v_groq_model := 'qwen/qwen3.8-27b';
    END IF;

    -- 4. Build System Prompt & Messages
    v_sys_prompt := 'You are PulseBot, the visual AI operations copilot for GridPulse Chitral renewable grid (hydro, solar, wind in Khyber Pakhtunkhwa, Pakistan). '
        || 'You were built and created by the GridPulse development and engineering team to assist operators, engineers, and analysts. '
        || 'Today is ' || v_today || ' (' || v_tz || '). '
        || 'Authenticated User: ' || v_user_name || ', Role: ' || v_role || '. '
        || 'Role rules: '
        || CASE v_role
            WHEN 'admin' THEN 'Fleet-wide visibility: production, alerts, work orders across all engineers, team, and audit trail.'
            WHEN 'engineer' THEN 'Focus on assigned tasks and actionable field operational advice. Never fabricate edits/writes.'
            ELSE 'Read-only operational reporting. Explain terms (capacity factor, availability, efficiency) clearly.'
           END
        || ' When questions are general, conversational, or meta (who created you, greetings, help, terms), answer directly and naturally. '
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

    -- 5. Tool Schemas Catalog (including aliases to prevent 400 validation failures)
    v_tools := jsonb_build_array(
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'fleet_overview', 'description', 'Fleet current output, capacity factor, availability, site status counts', 'parameters', jsonb_build_object('type', 'object', 'properties', '{}'::jsonb))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'site_and_assets_overview', 'description', 'Overview of all sites and generating assets in Chitral', 'parameters', jsonb_build_object('type', 'object', 'properties', '{}'::jsonb))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'site_summary', 'description', 'Site operational metrics and asset health', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('site_id', jsonb_build_object('type', jsonb_build_array('integer', 'null')), 'name', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_sites', 'description', 'Lookup sites by status or technology', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('technology', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_assets', 'description', 'Lookup assets', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('site_id', jsonb_build_object('type', jsonb_build_array('integer', 'null')), 'status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'alerts_summary', 'description', 'Alert counts by severity and status', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('status', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'list_alerts', 'description', 'List recent alerts', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('severity', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'limit', jsonb_build_object('type', jsonb_build_array('integer', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'work_orders_summary', 'description', 'Work orders breakdown by status and priority', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('scope', jsonb_build_object('type', jsonb_build_array('string', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'work_orders_list', 'description', 'List work orders', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('status', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'priority', jsonb_build_object('type', jsonb_build_array('string', 'null')), 'limit', jsonb_build_object('type', jsonb_build_array('integer', 'null')))))),
        jsonb_build_object('type', 'function', 'function', jsonb_build_object('name', 'project_knowledge', 'description', 'Chitral grid project knowledge and creator details', 'parameters', jsonb_build_object('type', 'object', 'properties', jsonb_build_object('query', jsonb_build_object('type', jsonb_build_array('string', 'null'))))))
    );

    -- 6. Interactive Multi-Round Loop (up to 3 rounds)
    BEGIN
        WHILE v_round < 3 AND NOT v_done LOOP
            v_round := v_round + 1;
            v_req_body := jsonb_build_object(
                'model', v_groq_model,
                'messages', v_messages,
                'tools', v_tools,
                'tool_choice', 'auto',
                'max_tokens', CASE WHEN v_round = 1 THEN 300 ELSE 450 END
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

            -- On ANY failure from Groq (rate-limit 429, tool-error 400, 500, etc.), fall back immediately to local synthesis
            IF v_status <> 200 THEN
                v_final := public.gp_assistant_synthesize_operational_reply(p_message, v_role, v_user_name);
                v_tools_used := v_tools_used || jsonb_build_array('operational_database_synthesis');
                v_latency := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int;

                PERFORM public.gp_assistant_write_log(v_user_id, v_role, 'session', v_tools_used, v_round::smallint, v_latency, 'ok', 'FALLBACK_' || v_status::text, NULL);

                RETURN jsonb_build_object(
                    'success', true,
                    'data', v_final,
                    'meta', jsonb_build_object('tools_used', v_tools_used, 'latency_ms', v_latency)
                );
            END IF;

            BEGIN
                v_groq_res := v_res.content::jsonb;
            EXCEPTION WHEN OTHERS THEN
                v_final := public.gp_assistant_synthesize_operational_reply(p_message, v_role, v_user_name);
                v_tools_used := v_tools_used || jsonb_build_array('operational_database_synthesis');
                v_latency := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int;
                RETURN jsonb_build_object('success', true, 'data', v_final, 'meta', jsonb_build_object('tools_used', v_tools_used, 'latency_ms', v_latency));
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
    EXCEPTION WHEN OTHERS THEN
        v_final := public.gp_assistant_synthesize_operational_reply(p_message, v_role, v_user_name);
        v_tools_used := v_tools_used || jsonb_build_array('operational_database_synthesis');
        v_latency := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int;
        RETURN jsonb_build_object('success', true, 'data', v_final, 'meta', jsonb_build_object('tools_used', v_tools_used, 'latency_ms', v_latency));
    END;

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

        BEGIN
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
        EXCEPTION WHEN OTHERS THEN
            v_content := NULL;
        END;
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

    -- Parse JSON or wrap raw text safely (NEVER drop raw LLM answers!)
    BEGIN
        v_final := v_content::jsonb;
    EXCEPTION WHEN OTHERS THEN
        DECLARE
            v_match text[];
        BEGIN
            v_match := regexp_match(v_content, '"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"');
            IF v_match IS NOT NULL AND v_match[1] IS NOT NULL THEN
                v_final := jsonb_build_object('summary', v_match[1]);
            ELSIF v_content <> '' THEN
                -- PRESERVE RAW LLM TEXT ANSWER AS SUMMARY!
                v_final := jsonb_build_object('summary', v_content);
            ELSE
                v_final := NULL;
            END IF;
        END;
    END;

    -- 9. Check if response is empty, missing, or generic placeholder: if so, synthesize local answer
    IF v_final IS NULL 
       OR v_final->'summary' IS NULL 
       OR TRIM(COALESCE(v_final->>'summary', '')) = ''
       OR v_final->>'summary' = 'Operational analysis for GridPulse Chitral.'
       OR v_final->>'summary' = 'PulseBot processed your operational request.' THEN
        v_final := public.gp_assistant_synthesize_operational_reply(p_message, v_role, v_user_name);
        v_tools_used := v_tools_used || jsonb_build_array('operational_database_synthesis');
    END IF;

    -- 10. Enrich KPIs if empty (guarantees every response displays KPI cards)
    IF v_final->'kpis' IS NULL OR jsonb_typeof(v_final->'kpis') <> 'array' OR jsonb_array_length(v_final->'kpis') = 0 THEN
        v_overview := public.gp_dashboard_overview_data();
        v_final := jsonb_set(v_final, '{kpis}', jsonb_build_array(
            jsonb_build_object('label', 'Live Fleet Output', 'value', (ROUND(((v_overview->'fleet'->>'current_output_kw')::numeric / 1000.0), 1)::text || ' MW'), 'trend', 'up'),
            jsonb_build_object('label', 'Capacity Factor', 'value', ((v_overview->'fleet'->>'capacity_factor_pct')::text || '%'), 'trend', 'up'),
            jsonb_build_object('label', 'Open Alerts', 'value', ((v_overview->'alerts'->>'open')::text || ' Open'), 'trend', 'down'),
            jsonb_build_object('label', 'Monitored Sites', 'value', '11 Plants', 'trend', 'neutral')
        ));
    ELSIF jsonb_typeof(v_final->'kpis') = 'object' THEN
        v_kpis := '[]'::jsonb;
        FOR v_key, v_val IN SELECT * FROM jsonb_each(v_final->'kpis') LOOP
            v_kpis := v_kpis || jsonb_build_array(jsonb_build_object(
                'label', REPLACE(INITCAP(REPLACE(v_key, '_', ' ')), 'Mw', 'MW'),
                'value', v_val
            ));
        END LOOP;
        v_final := jsonb_set(v_final, '{kpis}', v_kpis);
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

    -- Normalize Links
    IF v_final->'links' IS NULL OR jsonb_typeof(v_final->'links') <> 'array' OR jsonb_array_length(v_final->'links') = 0 THEN
        v_final := jsonb_set(v_final, '{links}', jsonb_build_array(
            jsonb_build_object('label', 'Sites Overview', 'route', '/sites'),
            jsonb_build_object('label', 'Reports', 'route', '/reports')
        ));
    END IF;

    -- Normalize Followups
    IF v_final->'followups' IS NULL OR jsonb_typeof(v_final->'followups') <> 'array' OR jsonb_array_length(v_final->'followups') = 0 THEN
        v_final := jsonb_set(v_final, '{followups}', jsonb_build_array(
            'How many plants in Chitral currently?',
            'Which plants are producing least today, and are any offline or in maintenance?',
            'Show open critical alerts'
        ));
    END IF;

    v_latency := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int;

    PERFORM public.gp_assistant_write_log(v_user_id, v_role, 'session', v_tools_used, v_round::smallint, v_latency, 'ok', NULL, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'data', v_final,
        'meta', jsonb_build_object('tools_used', v_tools_used, 'latency_ms', v_latency)
    );
END;
$$;

-- 5. Public FAQ Infobox Function (Hardened with Local Fallback)
CREATE OR REPLACE FUNCTION public.gp_assistant_public(
    p_message text,
    p_history jsonb DEFAULT '[]'::jsonb,
    p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
SET statement_timeout = '60s'
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
        v_groq_model := 'qwen/qwen3.8-27b';
    END IF;

    v_sys_prompt := 'You are PulseBot, the public FAQ assistant on the landing/login page of GridPulse.' || E'\n' ||
        'You were built and created by the GridPulse development and engineering team to monitor 11 generation plants across Upper and Lower Chitral.' || E'\n' ||
        'GridPulse is the live renewable-operations platform for Chitral district in Khyber Pakhtunkhwa, Pakistan.' || E'\n' ||
        'It monitors 11 generation plants (7 hydro including 108 MW Golen Gol and 69 MW Lawi, 3 solar parks in Mastuj, Booni, and Drosh, and 1 wind pilot at Shandur Pass).' || E'\n\n' ||
        'PLATFORM DETAILS:' || E'\n' ||
        '- Roles: Admin (full operations, team management, audit log), Engineer (field ops, acknowledge/resolve alerts, work orders), Viewer (read-only reports and dashboards).' || E'\n' ||
        '- Demo Accounts: Admin (admin@gridpulse.io / Admin12345), Engineer (engineer@gridpulse.io / Engineer12345), Viewer (viewer@gridpulse.io / Viewer12345).' || E'\n' ||
        '- Alerts: Triggered by telemetry thresholds. Can convert to work orders.' || E'\n' ||
        '- Work Orders: Kanban and table views with priorities and statuses.' || E'\n' ||
        '- Tech Stack: React 18 + TypeScript + Vite on Vercel; Supabase PostgreSQL + PostgREST RPC backend.' || E'\n\n' ||
        'OUTPUT RULES:' || E'\n' ||
        'Never disclose private operational data to public users.' || E'\n' ||
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

    BEGIN
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

        IF v_res.status = 200 THEN
            v_content := (v_res.content::jsonb)->'choices'->0->'message'->>'content';
            v_final := v_content::jsonb;
        ELSE
            v_final := public.gp_assistant_synthesize_public_reply(p_message);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_final := public.gp_assistant_synthesize_public_reply(p_message);
    END;

    IF v_final IS NULL OR v_final->'summary' IS NULL OR TRIM(COALESCE(v_final->>'summary', '')) = '' THEN
        v_final := public.gp_assistant_synthesize_public_reply(p_message);
    END IF;

    IF v_final->'bullets' IS NULL OR jsonb_typeof(v_final->'bullets') <> 'array' THEN
        v_final := jsonb_set(v_final, '{bullets}', '[]'::jsonb);
    END IF;
    IF v_final->'links' IS NULL OR jsonb_typeof(v_final->'links') <> 'array' THEN
        v_final := jsonb_set(v_final, '{links}', jsonb_build_array(jsonb_build_object('label', 'Sign In to Demo', 'route', '/login')));
    END IF;
    IF v_final->'followups' IS NULL OR jsonb_typeof(v_final->'followups') <> 'array' THEN
        v_final := jsonb_set(v_final, '{followups}', jsonb_build_array('What are the demo login credentials?', 'How many plants in Chitral currently?'));
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

-- ----------------------------------------------------------------------------
-- 6. EXTEND `public.gp_api` FOR `/assistant/bootstrap`, `/assistant/logs`,
--    AND DEEP-LINK FILTERS ON `/work-orders` AND `/audit`
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'gp_api_v1'
    ) AND EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'gp_api'
    ) THEN
        ALTER FUNCTION public.gp_api(text, text, jsonb, jsonb, text, text, text) RENAME TO gp_api_v1;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.gp_api(
    p_method text,
    p_path text,
    p_query jsonb DEFAULT '{}'::jsonb,
    p_body jsonb DEFAULT '{}'::jsonb,
    p_token text DEFAULT NULL,
    p_ip text DEFAULT NULL,
    p_ua text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_method text := UPPER(TRIM(COALESCE(p_method, 'GET')));
    v_path text := TRIM(COALESCE(p_path, '/'));
    v_query jsonb := COALESCE(p_query, '{}'::jsonb);
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_ctx jsonb;
    v_page int;
    v_limit int;
    v_offset int;
    v_total bigint;
    v_items jsonb;
    v_q text;
    v_techs text[];
    v_from timestamp without time zone;
    v_to timestamp without time zone;
    v_overdue boolean;
BEGIN
    v_path := regexp_replace(v_path, '^/api/v1(?=/|$)', '');
    v_path := regexp_replace(v_path, '/+$', '');
    IF v_path = '' THEN v_path := '/'; END IF;
    IF LEFT(v_path, 1) <> '/' THEN v_path := '/' || v_path; END IF;

    -- Assistant bootstrap (role-specific welcome & starter prompts)
    IF v_method = 'GET' AND v_path = '/assistant/bootstrap' THEN
        RETURN public.gp_assistant_bootstrap(p_token);
    END IF;

    -- Assistant session chat (in-app role-aware visual copilot)
    IF v_method = 'POST' AND v_path = '/assistant/chat' THEN
        RETURN jsonb_build_object(
            'status', 200,
            'body', public.gp_assistant_chat(p_token, p_body->>'message', COALESCE(p_body->'history', '[]'::jsonb))
        );
    END IF;

    -- Assistant public FAQ info box (landing and login page)
    IF v_method = 'POST' AND v_path = '/assistant/public' THEN
        RETURN jsonb_build_object(
            'status', 200,
            'body', public.gp_assistant_public(p_body->>'message', COALESCE(p_body->'history', '[]'::jsonb), p_ip)
        );
    END IF;

    -- Admin-only assistant telemetry/audit logs
    IF v_method = 'GET' AND v_path = '/assistant/logs' THEN
        v_ctx := public.gp_assistant_resolve_user(p_token);
        IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
            RETURN public.gp_resp_err(COALESCE((v_ctx->>'status')::int, 401), COALESCE(v_ctx->>'code', 'UNAUTHENTICATED'), COALESCE(v_ctx->>'message', 'Sign in to continue.'));
        END IF;
        IF (v_ctx->>'role') <> 'admin' THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
        END IF;

        v_page := GREATEST(1, COALESCE(NULLIF(v_query->>'page', '')::int, 1));
        v_limit := LEAST(100, GREATEST(1, COALESCE(NULLIF(v_query->>'limit', '')::int, 30)));
        v_offset := (v_page - 1) * v_limit;
        SELECT COUNT(*) INTO v_total FROM public.assistant_logs;
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'user_id', l.user_id,
            'role', l.role,
            'surface', l.surface,
            'tools_used', l.tools_used,
            'tool_rounds', l.tool_rounds,
            'latency_ms', l.latency_ms,
            'status', l.status,
            'error_code', l.error_code,
            'created_at', public.gp_iso(l.created_at)
        ) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
        INTO v_items
        FROM (
            SELECT * FROM public.assistant_logs ORDER BY created_at DESC, id DESC LIMIT v_limit OFFSET v_offset
        ) l;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    -- Enhanced GET /work-orders when deep-link query filters (`types`, `type`, `from`, `to`, `overdue`) are present
    IF v_method = 'GET' AND v_path = '/work-orders'
       AND (NULLIF(v_query->>'types', '') IS NOT NULL
            OR NULLIF(v_query->>'type', '') IS NOT NULL
            OR NULLIF(v_query->>'from', '') IS NOT NULL
            OR NULLIF(v_query->>'to', '') IS NOT NULL
            OR NULLIF(v_query->>'overdue', '') IS NOT NULL) THEN
        v_ctx := public.gp_assistant_resolve_user(p_token);
        IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
            RETURN public.gp_resp_err(COALESCE((v_ctx->>'status')::int, 401), COALESCE(v_ctx->>'code', 'UNAUTHENTICATED'), COALESCE(v_ctx->>'message', 'Sign in to continue.'));
        END IF;

        v_page := GREATEST(1, COALESCE(NULLIF(v_query->>'page', '')::int, 1));
        v_limit := LEAST(100, GREATEST(1, COALESCE(NULLIF(v_query->>'limit', '')::int, 20)));
        v_offset := (v_page - 1) * v_limit;
        v_q := NULLIF(TRIM(COALESCE(v_query->>'q', '')), '');

        SELECT ARRAY_AGG(LOWER(TRIM(elem)))
        INTO v_techs
        FROM unnest(string_to_array(COALESCE(NULLIF(v_query->>'types', ''), v_query->>'type', ''), ',')) elem
        WHERE LOWER(TRIM(elem)) IN ('hydro', 'solar', 'wind');
        IF v_techs IS NOT NULL AND array_length(v_techs, 1) IS NULL THEN v_techs := NULL; END IF;

        v_from := NULL;
        v_to := NULL;
        IF NULLIF(TRIM(COALESCE(v_query->>'from', '')), '') IS NOT NULL THEN
            BEGIN
                v_from := CASE WHEN LENGTH(TRIM(v_query->>'from')) <= 10
                    THEN (TRIM(v_query->>'from') || ' 00:00:00')::timestamp
                    ELSE TRIM(v_query->>'from')::timestamptz AT TIME ZONE 'UTC' END;
            EXCEPTION WHEN OTHERS THEN v_from := NULL; END;
        END IF;
        IF NULLIF(TRIM(COALESCE(v_query->>'to', '')), '') IS NOT NULL THEN
            BEGIN
                v_to := CASE WHEN LENGTH(TRIM(v_query->>'to')) <= 10
                    THEN (TRIM(v_query->>'to') || ' 23:59:59')::timestamp
                    ELSE TRIM(v_query->>'to')::timestamptz AT TIME ZONE 'UTC' END;
            EXCEPTION WHEN OTHERS THEN v_to := NULL; END;
        END IF;
        v_overdue := COALESCE(v_query->>'overdue', '') IN ('1', 'true');

        SELECT COUNT(*) INTO v_total
        FROM public.work_orders w
        JOIN public.sites s ON s.id = w.site_id
        WHERE (v_q IS NULL OR w.title ILIKE '%' || v_q || '%')
          AND (NULLIF(v_query->>'status', '') IS NULL OR w.status = v_query->>'status')
          AND (NULLIF(v_query->>'priority', '') IS NULL OR w.priority = v_query->>'priority')
          AND (NULLIF(v_query->>'site_id', '') IS NULL OR w.site_id = (v_query->>'site_id')::bigint)
          AND (NULLIF(v_query->>'assignee_id', '') IS NULL OR w.assignee_id = (v_query->>'assignee_id')::bigint)
          AND (v_techs IS NULL OR s.type = ANY(v_techs))
          AND (v_from IS NULL OR w.created_at >= v_from)
          AND (v_to IS NULL OR w.created_at <= v_to)
          AND (NOT v_overdue OR (w.status <> 'done' AND w.due_at IS NOT NULL AND w.due_at < v_now));

        SELECT COALESCE(jsonb_agg(public.gp_wo_json(w)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT w.*
            FROM public.work_orders w
            JOIN public.sites s ON s.id = w.site_id
            WHERE (v_q IS NULL OR w.title ILIKE '%' || v_q || '%')
              AND (NULLIF(v_query->>'status', '') IS NULL OR w.status = v_query->>'status')
              AND (NULLIF(v_query->>'priority', '') IS NULL OR w.priority = v_query->>'priority')
              AND (NULLIF(v_query->>'site_id', '') IS NULL OR w.site_id = (v_query->>'site_id')::bigint)
              AND (NULLIF(v_query->>'assignee_id', '') IS NULL OR w.assignee_id = (v_query->>'assignee_id')::bigint)
              AND (v_techs IS NULL OR s.type = ANY(v_techs))
              AND (v_from IS NULL OR w.created_at >= v_from)
              AND (v_to IS NULL OR w.created_at <= v_to)
              AND (NOT v_overdue OR (w.status <> 'done' AND w.due_at IS NOT NULL AND w.due_at < v_now))
            ORDER BY
                (CASE w.priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END) DESC,
                w.due_at ASC NULLS LAST,
                w.created_at DESC,
                w.id DESC
            LIMIT v_limit OFFSET v_offset
        ) w;

        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    -- Enhanced GET /audit when search/date filters (`q`, `action`, `from`, `to`) are present
    IF v_method = 'GET' AND v_path = '/audit'
       AND (NULLIF(v_query->>'q', '') IS NOT NULL
            OR NULLIF(v_query->>'action', '') IS NOT NULL
            OR NULLIF(v_query->>'from', '') IS NOT NULL
            OR NULLIF(v_query->>'to', '') IS NOT NULL) THEN
        v_ctx := public.gp_assistant_resolve_user(p_token);
        IF NOT COALESCE((v_ctx->>'authenticated')::boolean, false) THEN
            RETURN public.gp_resp_err(COALESCE((v_ctx->>'status')::int, 401), COALESCE(v_ctx->>'code', 'UNAUTHENTICATED'), COALESCE(v_ctx->>'message', 'Sign in to continue.'));
        END IF;
        IF (v_ctx->>'role') <> 'admin' THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
        END IF;

        v_page := GREATEST(1, COALESCE(NULLIF(v_query->>'page', '')::int, 1));
        v_limit := LEAST(100, GREATEST(1, COALESCE(NULLIF(v_query->>'limit', '')::int, 30)));
        v_offset := (v_page - 1) * v_limit;
        v_q := NULLIF(TRIM(COALESCE(v_query->>'q', '')), '');

        v_from := NULL;
        v_to := NULL;
        IF NULLIF(TRIM(COALESCE(v_query->>'from', '')), '') IS NOT NULL THEN
            BEGIN
                v_from := CASE WHEN LENGTH(TRIM(v_query->>'from')) <= 10
                    THEN (TRIM(v_query->>'from') || ' 00:00:00')::timestamp
                    ELSE TRIM(v_query->>'from')::timestamptz AT TIME ZONE 'UTC' END;
            EXCEPTION WHEN OTHERS THEN v_from := NULL; END;
        END IF;
        IF NULLIF(TRIM(COALESCE(v_query->>'to', '')), '') IS NOT NULL THEN
            BEGIN
                v_to := CASE WHEN LENGTH(TRIM(v_query->>'to')) <= 10
                    THEN (TRIM(v_query->>'to') || ' 23:59:59')::timestamp
                    ELSE TRIM(v_query->>'to')::timestamptz AT TIME ZONE 'UTC' END;
            EXCEPTION WHEN OTHERS THEN v_to := NULL; END;
        END IF;

        SELECT COUNT(*) INTO v_total
        FROM public.audit_logs l
        LEFT JOIN public.users u ON u.id = l.actor_id
        WHERE (NULLIF(v_query->>'action', '') IS NULL OR l.action ILIKE '%' || (v_query->>'action') || '%')
          AND (v_from IS NULL OR l.created_at >= v_from)
          AND (v_to IS NULL OR l.created_at <= v_to)
          AND (v_q IS NULL OR l.action ILIKE '%' || v_q || '%' OR l.entity_type ILIKE '%' || v_q || '%' OR COALESCE(u.name, '') ILIKE '%' || v_q || '%');

        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', l.id,
            'actor', public.gp_user_brief(l.actor_id),
            'action', l.action,
            'entity_type', l.entity_type,
            'entity_id', l.entity_id,
            'meta', CASE WHEN l.meta IS NULL THEN NULL ELSE l.meta::jsonb END,
            'ip', l.ip,
            'created_at', public.gp_iso(l.created_at)
        ) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
        INTO v_items
        FROM (
            SELECT l.*
            FROM public.audit_logs l
            LEFT JOIN public.users u ON u.id = l.actor_id
            WHERE (NULLIF(v_query->>'action', '') IS NULL OR l.action ILIKE '%' || (v_query->>'action') || '%')
              AND (v_from IS NULL OR l.created_at >= v_from)
              AND (v_to IS NULL OR l.created_at <= v_to)
              AND (v_q IS NULL OR l.action ILIKE '%' || v_q || '%' OR l.entity_type ILIKE '%' || v_q || '%' OR COALESCE(u.name, '') ILIKE '%' || v_q || '%')
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT v_limit OFFSET v_offset
        ) l;

        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    RETURN public.gp_api_v1(p_method, p_path, p_query, p_body, p_token, p_ip, p_ua);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. PRIVILEGE HARDENING
-- ----------------------------------------------------------------------------

-- Internal write/rate-limit helpers stay restricted from public PostgREST callers
REVOKE ALL ON FUNCTION public.gp_assistant_check_rate_limit(text, text, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_assistant_write_log(bigint, text, text, jsonb, int, int, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_assistant_check_rate_limit(text, text, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_write_log(bigint, text, text, jsonb, int, int, text, text, text) TO service_role;

-- Token-gated read RPCs verify `personal_access_tokens` + `users.role` inside SQL
GRANT EXECUTE ON FUNCTION public.gp_assistant_resolve_user(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_bootstrap(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_exec_tool(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_chat(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_public(text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_api(text, text, jsonb, jsonb, text, text, text) TO anon, authenticated, service_role;


GRANT EXECUTE ON FUNCTION public.gp_assistant_synthesize_operational_reply(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gp_assistant_synthesize_public_reply(text) TO anon, authenticated, service_role;
