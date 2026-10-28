-- ============================================================================
-- GridPulse — Native Supabase Backend (PostgreSQL RPC + Telemetry Simulator + pg_cron + RLS)
-- ============================================================================
-- Runs 100% of GridPulse API v1, authentication, RBAC, audit logging, and
-- 5-second/1-minute Chitral fleet telemetry simulation natively inside Supabase.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Try enabling pg_cron (available on all hosted Supabase projects)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be enabled automatically: %', SQLERRM;
END
$$;

-- ============================================================================
-- 1. SECURITY LOCKDOWN: Enable RLS on all public tables & revoke direct table access
-- ============================================================================
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ============================================================================
-- 2. HELPER FORMATTERS & JSON SERIALIZERS (100% parity with Laravel Resources)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gp_iso(p_ts timestamp without time zone)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_ts IS NULL THEN NULL
        ELSE to_char(p_ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    END;
$$;

CREATE OR REPLACE FUNCTION public.gp_user_json(u public.users)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'role', u.role,
        'is_active', u.is_active,
        'last_login_at', public.gp_iso(u.last_login_at),
        'created_at', public.gp_iso(u.created_at)
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.gp_user_brief(p_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE WHEN p_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role)
        FROM public.users u WHERE u.id = p_id
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.gp_site_brief(p_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE WHEN p_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'type', s.type)
        FROM public.sites s WHERE s.id = p_id
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.gp_asset_brief(p_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE WHEN p_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object('id', a.id, 'name', a.name, 'tag', a.tag, 'kind', a.kind)
        FROM public.assets a WHERE a.id = p_id
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.gp_reading_json(r public.telemetry_readings)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
    SELECT CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', r.id,
        'asset_id', r.asset_id,
        'site_id', r.site_id,
        'recorded_at', public.gp_iso(r.recorded_at),
        'power_kw', ROUND(r.power_kw, 1)::float8,
        'efficiency_pct', ROUND(r.efficiency_pct, 1)::float8,
        'temperature_c', ROUND(r.temperature_c, 1)::float8,
        'irradiance_wm2', CASE WHEN r.irradiance_wm2 IS NULL THEN NULL ELSE ROUND(r.irradiance_wm2, 1)::float8 END,
        'wind_speed_ms', CASE WHEN r.wind_speed_ms IS NULL THEN NULL ELSE ROUND(r.wind_speed_ms, 1)::float8 END
    ) END;
$$;

CREATE OR REPLACE FUNCTION public.gp_site_output_kw(p_site_id bigint)
RETURNS float8
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH latest AS (
        SELECT DISTINCT ON (asset_id) power_kw
        FROM public.telemetry_readings
        WHERE site_id = p_site_id
          AND recorded_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'
        ORDER BY asset_id, recorded_at DESC
    )
    SELECT COALESCE(ROUND(SUM(power_kw), 1)::float8, 0.0) FROM latest;
$$;

CREATE OR REPLACE FUNCTION public.gp_site_json(
    s public.sites,
    p_with_extra boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_base jsonb;
    v_asset_cnt int;
    v_alert_cnt int;
    v_out_kw float8;
BEGIN
    IF s.id IS NULL THEN RETURN NULL; END IF;
    v_base := jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'code', s.code,
        'type', s.type,
        'capacity_mw', s.capacity_mw::float8,
        'status', s.status,
        'lat', s.lat::float8,
        'lng', s.lng::float8,
        'region', s.region,
        'country', s.country,
        'commissioned_at', CASE WHEN s.commissioned_at IS NULL THEN NULL ELSE to_char(s.commissioned_at, 'YYYY-MM-DD') END,
        'min_efficiency', s.min_efficiency::float8,
        'max_temperature', s.max_temperature::float8,
        'created_at', public.gp_iso(s.created_at),
        'updated_at', public.gp_iso(s.updated_at)
    );
    IF p_with_extra THEN
        SELECT COUNT(*)::int INTO v_asset_cnt FROM public.assets WHERE site_id = s.id;
        SELECT COUNT(*)::int INTO v_alert_cnt FROM public.alerts WHERE site_id = s.id AND status IN ('open', 'acknowledged');
        v_out_kw := public.gp_site_output_kw(s.id);
        v_base := v_base || jsonb_build_object(
            'asset_count', v_asset_cnt,
            'open_alerts', v_alert_cnt,
            'current_output_kw', v_out_kw
        );
    END IF;
    RETURN v_base;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_asset_json(
    a public.assets,
    p_with_latest boolean DEFAULT true,
    p_with_alerts boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_res jsonb;
    v_latest public.telemetry_readings;
    v_alerts int;
BEGIN
    IF a.id IS NULL THEN RETURN NULL; END IF;
    v_res := jsonb_build_object(
        'id', a.id,
        'site_id', a.site_id,
        'site', public.gp_site_brief(a.site_id),
        'name', a.name,
        'tag', a.tag,
        'kind', a.kind,
        'manufacturer', a.manufacturer,
        'serial_number', a.serial_number,
        'rated_kw', a.rated_kw::float8,
        'status', a.status,
        'health_score', a.health_score::float8,
        'installed_at', CASE WHEN a.installed_at IS NULL THEN NULL ELSE to_char(a.installed_at, 'YYYY-MM-DD') END,
        'created_at', public.gp_iso(a.created_at),
        'updated_at', public.gp_iso(a.updated_at)
    );
    IF p_with_latest THEN
        SELECT * INTO v_latest
        FROM public.telemetry_readings
        WHERE asset_id = a.id
        ORDER BY recorded_at DESC
        LIMIT 1;
        v_res := v_res || jsonb_build_object('latest', public.gp_reading_json(v_latest));
    END IF;
    IF p_with_alerts THEN
        SELECT COUNT(*)::int INTO v_alerts
        FROM public.alerts
        WHERE asset_id = a.id AND status IN ('open', 'acknowledged');
        v_res := v_res || jsonb_build_object('open_alerts', v_alerts);
    END IF;
    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_alert_json(
    al public.alerts,
    p_with_wo boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_res jsonb;
    v_wo public.work_orders;
BEGIN
    IF al.id IS NULL THEN RETURN NULL; END IF;
    v_res := jsonb_build_object(
        'id', al.id,
        'site_id', al.site_id,
        'asset_id', al.asset_id,
        'site', public.gp_site_brief(al.site_id),
        'asset', public.gp_asset_brief(al.asset_id),
        'type', al.type,
        'severity', al.severity,
        'status', al.status,
        'message', al.message,
        'value', CASE WHEN al.value IS NULL THEN NULL ELSE al.value::float8 END,
        'acknowledged_by', public.gp_user_brief(al.acknowledged_by),
        'acknowledged_at', public.gp_iso(al.acknowledged_at),
        'resolved_by', public.gp_user_brief(al.resolved_by),
        'resolved_at', public.gp_iso(al.resolved_at),
        'work_order_id', al.work_order_id,
        'created_at', public.gp_iso(al.created_at),
        'updated_at', public.gp_iso(al.updated_at)
    );
    IF p_with_wo AND al.work_order_id IS NOT NULL THEN
        SELECT * INTO v_wo FROM public.work_orders WHERE id = al.work_order_id;
        IF v_wo.id IS NOT NULL THEN
            v_res := v_res || jsonb_build_object('work_order', jsonb_build_object(
                'id', v_wo.id,
                'title', v_wo.title,
                'status', v_wo.status,
                'priority', v_wo.priority
            ));
        ELSE
            v_res := v_res || jsonb_build_object('work_order', NULL);
        END IF;
    END IF;
    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_wo_json(wo public.work_orders)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_al public.alerts;
    v_alert_brief jsonb := NULL;
BEGIN
    IF wo.id IS NULL THEN RETURN NULL; END IF;
    IF wo.alert_id IS NOT NULL THEN
        SELECT * INTO v_al FROM public.alerts WHERE id = wo.alert_id;
        IF v_al.id IS NOT NULL THEN
            v_alert_brief := jsonb_build_object(
                'id', v_al.id,
                'type', v_al.type,
                'severity', v_al.severity,
                'status', v_al.status
            );
        END IF;
    END IF;
    RETURN jsonb_build_object(
        'id', wo.id,
        'title', wo.title,
        'description', wo.description,
        'priority', wo.priority,
        'status', wo.status,
        'site_id', wo.site_id,
        'asset_id', wo.asset_id,
        'alert_id', wo.alert_id,
        'assignee_id', wo.assignee_id,
        'site', public.gp_site_brief(wo.site_id),
        'asset', public.gp_asset_brief(wo.asset_id),
        'alert', v_alert_brief,
        'assignee', public.gp_user_brief(wo.assignee_id),
        'created_by', public.gp_user_brief(wo.created_by),
        'due_at', public.gp_iso(wo.due_at),
        'completed_at', public.gp_iso(wo.completed_at),
        'created_at', public.gp_iso(wo.created_at),
        'updated_at', public.gp_iso(wo.updated_at)
    );
END;
$$;

-- ============================================================================
-- 3. TELEMETRY SIMULATOR & PRUNING (Exact port of TelemetrySimulator.php)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gp_noise(p_seed text, p_t double precision, p_amp double precision DEFAULT 1.0)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$
    SELECT (((('x' || substr(md5(p_seed || ':' || floor(p_t)::bigint::text), 1, 8))::bit(32)::bigint & 2147483647) % 10000)::double precision / 10000.0 - 0.5) * 2.0 * p_amp;
$$;

CREATE OR REPLACE FUNCTION public.gp_simulate_tick(p_at timestamp without time zone DEFAULT (NOW() AT TIME ZONE 'UTC'))
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    rec RECORD;
    v_epoch double precision;
    v_minute double precision;
    v_hours double precision;
    v_utc_hours double precision;
    v_local double precision;
    v_x double precision;
    v_irr double precision;
    v_wind double precision;
    v_health double precision;
    v_temp double precision;
    v_degraded double precision;
    v_cloud double precision;
    v_cf double precision;
    v_power double precision;
    v_eff double precision;
    v_stopped boolean;
    v_producing boolean;
    v_inserted int := 0;
    v_alerts int := 0;
    v_target_health numeric(5,2);
    v_next_health numeric(5,2);
    v_gap double precision;
    v_over double precision;
    v_sev text;
BEGIN
    v_epoch := EXTRACT(EPOCH FROM p_at);
    v_minute := v_epoch / 60.0;
    v_hours := v_epoch / 3600.0;
    v_utc_hours := EXTRACT(HOUR FROM p_at) + EXTRACT(MINUTE FROM p_at) / 60.0;

    FOR rec IN
        SELECT a.id AS asset_id, a.name AS asset_name, a.site_id, a.rated_kw::double precision AS rated_kw,
               a.status AS asset_status, a.health_score::double precision AS health_score,
               s.type AS site_type, s.status AS site_status, s.lng::double precision AS lng,
               s.min_efficiency::double precision AS min_efficiency, s.max_temperature::double precision AS max_temperature
        FROM public.assets a
        JOIN public.sites s ON s.id = a.site_id
    LOOP
        v_health := GREATEST(0.2, COALESCE(NULLIF(rec.health_score, 0), 100.0) / 100.0);
        v_temp := 22.0 + public.gp_noise(rec.asset_id::text, v_minute, 2.0);
        v_irr := NULL;
        v_wind := NULL;

        IF rec.site_type = 'solar' THEN
            v_local := MOD((v_utc_hours + rec.lng / 15.0 + 24.0)::numeric, 24.0)::double precision;
            v_x := (v_local - 6.0) / 14.0;
            IF v_x <= 0.0 OR v_x >= 1.0 THEN
                v_irr := 0.0;
            ELSE
                v_irr := ROUND(1000.0 * POWER(SIN(PI() * v_x), 1.4));
            END IF;
        ELSIF rec.site_type = 'wind' THEN
            v_wind := GREATEST(0.0, ROUND((8.0 + 4.0 * SIN(v_hours / 6.0 + public.gp_noise(rec.site_id::text, 0, 3.0)) + public.gp_noise(rec.site_id::text, v_hours * 4.0, 1.5))::numeric, 1)::double precision);
        END IF;

        v_stopped := (rec.asset_status IN ('offline', 'maintenance')) OR (rec.site_status = 'offline');

        IF v_stopped THEN
            v_power := 0.0;
            v_eff := 0.0;
        ELSE
            v_degraded := CASE WHEN rec.asset_status = 'degraded' OR rec.site_status = 'degraded' THEN 0.72 ELSE 1.0 END;
            IF rec.site_type = 'solar' THEN
                v_cloud := 1.0 - GREATEST(0.0, public.gp_noise(rec.asset_id::text, v_minute / 20.0, 0.25));
                v_cf := (v_irr / 1000.0) * v_cloud * v_health * v_degraded;
                v_power := rec.rated_kw * v_cf;
                v_eff := CASE WHEN v_irr > 50.0 THEN 96.0 * v_degraded + public.gp_noise(rec.asset_id::text, v_minute, 2.0) ELSE 0.0 END;
                v_temp := 22.0 + v_irr / 28.0 + public.gp_noise(rec.asset_id::text, v_minute, 3.0) + CASE WHEN v_degraded < 1.0 THEN 14.0 ELSE 0.0 END;
            ELSIF rec.site_type = 'wind' THEN
                v_cf := 0.0;
                IF v_wind >= 3.0 AND v_wind <= 25.0 THEN
                    v_cf := CASE WHEN v_wind >= 12.0 THEN 1.0 ELSE POWER((v_wind - 3.0) / 9.0, 3.0) END;
                END IF;
                v_power := rec.rated_kw * v_cf * v_health * v_degraded;
                v_eff := CASE WHEN v_cf > 0.0 THEN 94.0 * v_degraded + public.gp_noise(rec.asset_id::text, v_minute, 2.0) ELSE 0.0 END;
                v_temp := 30.0 + v_cf * 20.0 + public.gp_noise(rec.asset_id::text, v_minute, 3.0) + CASE WHEN v_degraded < 1.0 THEN 16.0 ELSE 0.0 END;
            ELSE
                v_cf := 0.82 + 0.08 * SIN(v_minute / 400.0) + public.gp_noise(rec.asset_id::text, v_minute / 10.0, 0.03);
                v_power := rec.rated_kw * v_cf * v_health * v_degraded;
                v_eff := 91.0 * v_degraded + public.gp_noise(rec.asset_id::text, v_minute, 1.5);
                v_temp := 35.0 + public.gp_noise(rec.asset_id::text, v_minute, 2.0) + CASE WHEN v_degraded < 1.0 THEN 12.0 ELSE 0.0 END;
            END IF;
        END IF;

        v_power := ROUND(GREATEST(0.0, v_power)::numeric, 1)::double precision;
        v_eff := ROUND(LEAST(100.0, GREATEST(0.0, v_eff))::numeric, 1)::double precision;
        v_temp := ROUND(v_temp::numeric, 1)::double precision;

        INSERT INTO public.telemetry_readings (asset_id, site_id, recorded_at, power_kw, efficiency_pct, temperature_c, irradiance_wm2, wind_speed_ms)
        VALUES (rec.asset_id, rec.site_id, p_at, v_power, v_eff, v_temp, v_irr, v_wind);
        v_inserted := v_inserted + 1;

        -- Update health_score EMA when producing
        IF v_eff > 0.0 THEN
            v_target_health := LEAST(100.0, v_eff + 4.0)::numeric(5,2);
            v_next_health := ROUND((rec.health_score * 0.95 + v_target_health * 0.05)::numeric, 1);
            IF ABS(v_next_health - rec.health_score) >= 0.1 THEN
                UPDATE public.assets SET health_score = v_next_health WHERE id = rec.asset_id;
            END IF;
        END IF;

        -- Alert evaluation (only for near-realtime ticks within last 2 minutes)
        IF p_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 minutes' THEN
            v_producing := (rec.site_type <> 'solar') OR (COALESCE(v_irr, 0.0) > 150.0);

            IF rec.asset_status = 'offline' THEN
                IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE asset_id = rec.asset_id AND type = 'asset_offline' AND status IN ('open', 'acknowledged')) THEN
                    INSERT INTO public.alerts (site_id, asset_id, type, severity, status, message, value, created_at, updated_at)
                    VALUES (rec.site_id, rec.asset_id, 'asset_offline', 'critical', 'open', rec.asset_name || ' is offline and not generating.', 0, p_at, p_at);
                    v_alerts := v_alerts + 1;
                END IF;
            ELSE
                IF v_producing AND v_eff > 0.0 AND v_eff < rec.min_efficiency THEN
                    v_gap := rec.min_efficiency - v_eff;
                    v_sev := CASE WHEN v_gap > 15.0 THEN 'critical' ELSE 'warning' END;
                    IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE asset_id = rec.asset_id AND type = 'low_efficiency' AND status IN ('open', 'acknowledged')) THEN
                        INSERT INTO public.alerts (site_id, asset_id, type, severity, status, message, value, created_at, updated_at)
                        VALUES (rec.site_id, rec.asset_id, 'low_efficiency', v_sev, 'open',
                                format('%s efficiency dropped to %s%% (threshold %s%%).', rec.asset_name, to_char(v_eff, 'FM990.0'), rec.min_efficiency::int),
                                v_eff, p_at, p_at);
                        v_alerts := v_alerts + 1;
                    END IF;
                END IF;

                IF v_temp > rec.max_temperature THEN
                    v_over := v_temp - rec.max_temperature;
                    v_sev := CASE WHEN v_over > 10.0 THEN 'critical' ELSE 'warning' END;
                    IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE asset_id = rec.asset_id AND type = 'high_temperature' AND status IN ('open', 'acknowledged')) THEN
                        INSERT INTO public.alerts (site_id, asset_id, type, severity, status, message, value, created_at, updated_at)
                        VALUES (rec.site_id, rec.asset_id, 'high_temperature', v_sev, 'open',
                                format('%s is running hot at %s °C (limit %s °C).', rec.asset_name, to_char(v_temp, 'FM990.0'), rec.max_temperature::int),
                                v_temp, p_at, p_at);
                        v_alerts := v_alerts + 1;
                    END IF;
                END IF;

                IF v_producing AND rec.asset_status = 'online' AND rec.site_status = 'online' AND v_power = 0.0 THEN
                    IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE asset_id = rec.asset_id AND type = 'zero_output' AND status IN ('open', 'acknowledged')) THEN
                        INSERT INTO public.alerts (site_id, asset_id, type, severity, status, message, value, created_at, updated_at)
                        VALUES (rec.site_id, rec.asset_id, 'zero_output', 'warning', 'open', rec.asset_name || ' reports zero output while marked online.', 0, p_at, p_at);
                        v_alerts := v_alerts + 1;
                    END IF;
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('inserted', v_inserted, 'alerts', v_alerts);
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_prune_telemetry(p_days int DEFAULT 7)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_deleted bigint;
BEGIN
    DELETE FROM public.telemetry_readings
    WHERE recorded_at < (NOW() AT TIME ZONE 'UTC') - make_interval(days => GREATEST(1, p_days));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_ensure_fresh_telemetry()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_max timestamp without time zone;
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
BEGIN
    IF NOT pg_try_advisory_xact_lock(715827882) THEN
        RETURN;
    END IF;
    SELECT MAX(recorded_at) INTO v_max FROM public.telemetry_readings;
    IF v_max IS NULL OR v_max < v_now - INTERVAL '5 seconds' THEN
        PERFORM public.gp_simulate_tick(v_now);
    END IF;
END;
$$;

-- Schedule pg_cron jobs if pg_cron is available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('gridpulse-tick', 'gridpulse-prune');
        PERFORM cron.schedule('gridpulse-tick', '* * * * *', $cron$SELECT public.gp_simulate_tick();$cron$);
        PERFORM cron.schedule('gridpulse-prune', '0 3 * * *', $cron$SELECT public.gp_prune_telemetry(7);$cron$);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule pg_cron jobs: %', SQLERRM;
END
$$;

-- ============================================================================
-- 4. AUTHENTICATION, TOKENS, AUDIT & ENVELOPE HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gp_verify_password(p_plain text, p_hash text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
    SELECT CASE
        WHEN p_plain IS NULL OR p_hash IS NULL OR p_hash = '' THEN false
        ELSE extensions.crypt(p_plain, regexp_replace(p_hash, '^\$2[yb]\$', '$2a$'))
             = regexp_replace(p_hash, '^\$2[yb]\$', '$2a$')
    END;
$$;

CREATE OR REPLACE FUNCTION public.gp_hash_password(p_plain text)
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
    SELECT extensions.crypt(p_plain, extensions.gen_salt('bf', 12));
$$;

CREATE OR REPLACE FUNCTION public.gp_issue_token(p_user_id bigint, p_device text DEFAULT 'api')
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_plain text;
    v_hash text;
    v_id bigint;
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
BEGIN
    v_plain := encode(extensions.gen_random_bytes(20), 'hex');
    v_hash := encode(extensions.digest(v_plain, 'sha256'), 'hex');
    INSERT INTO public.personal_access_tokens (
        tokenable_type, tokenable_id, name, token, abilities, expires_at, created_at, updated_at
    ) VALUES (
        'App\Models\User', p_user_id, COALESCE(NULLIF(LEFT(p_device, 60), ''), 'api'),
        v_hash, '["*"]', v_now + INTERVAL '7 days', v_now, v_now
    ) RETURNING id INTO v_id;
    RETURN v_id::text || '|' || v_plain;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_audit_write(
    p_actor_id bigint,
    p_action text,
    p_entity_type text,
    p_entity_id bigint DEFAULT NULL,
    p_meta jsonb DEFAULT NULL,
    p_ip text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, meta, ip, created_at)
    VALUES (
        p_actor_id,
        p_action,
        p_entity_type,
        p_entity_id,
        CASE WHEN p_meta IS NULL OR p_meta = '{}'::jsonb THEN NULL ELSE p_meta::json END,
        LEFT(p_ip, 45),
        (NOW() AT TIME ZONE 'UTC')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_resp_ok(p_data jsonb, p_status int DEFAULT 200)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
    SELECT jsonb_build_object(
        'status', p_status,
        'body', jsonb_build_object('success', true, 'data', p_data)
    );
$$;

CREATE OR REPLACE FUNCTION public.gp_resp_paged(p_items jsonb, p_page int, p_limit int, p_total bigint)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
    SELECT jsonb_build_object(
        'status', 200,
        'body', jsonb_build_object(
            'success', true,
            'data', COALESCE(p_items, '[]'::jsonb),
            'meta', jsonb_build_object(
                'page', p_page,
                'limit', p_limit,
                'total', p_total,
                'pages', GREATEST(1, CEIL(p_total::numeric / GREATEST(1, p_limit))::int)
            )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.gp_resp_err(
    p_status int,
    p_code text,
    p_message text,
    p_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
    SELECT jsonb_build_object(
        'status', p_status,
        'body', jsonb_build_object(
            'success', false,
            'error', CASE
                WHEN p_details IS NULL THEN jsonb_build_object('code', p_code, 'message', p_message)
                ELSE jsonb_build_object('code', p_code, 'message', p_message, 'details', p_details)
            END
        )
    );
$$;

-- ============================================================================
-- 5. ENERGY, TELEMETRY SERIES, DASHBOARD OVERVIEW & CSV EXPORT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gp_fleet_live_data()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_kw float8;
    v_assets int;
    v_ts timestamp without time zone;
    v_cap float8;
BEGIN
    PERFORM public.gp_ensure_fresh_telemetry();

    WITH latest AS (
        SELECT DISTINCT ON (asset_id) asset_id, power_kw, recorded_at
        FROM public.telemetry_readings
        WHERE recorded_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'
        ORDER BY asset_id, recorded_at DESC
    )
    SELECT COALESCE(ROUND(SUM(power_kw), 1)::float8, 0.0),
           COUNT(*)::int,
           MAX(recorded_at)
    INTO v_kw, v_assets, v_ts
    FROM latest;

    SELECT COALESCE(SUM(capacity_mw)::float8 * 1000.0, 0.0) INTO v_cap FROM public.sites;

    RETURN jsonb_build_object(
        'fleet_kw', v_kw,
        'reporting_assets', v_assets,
        'recorded_at', public.gp_iso(v_ts),
        'capacity_kw', v_cap
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_series_data(
    p_from timestamp without time zone,
    p_bucket_min int,
    p_site_id bigint DEFAULT NULL,
    p_with_quality boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH per_asset AS (
        SELECT (FLOOR(EXTRACT(EPOCH FROM recorded_at) / (GREATEST(1, p_bucket_min) * 60))::bigint * (GREATEST(1, p_bucket_min) * 60)) AS bucket,
               asset_id,
               AVG(power_kw) AS kw,
               AVG(efficiency_pct) AS eff,
               AVG(temperature_c) AS temp
        FROM public.telemetry_readings
        WHERE recorded_at >= p_from
          AND (p_site_id IS NULL OR site_id = p_site_id)
        GROUP BY 1, 2
    ),
    agg AS (
        SELECT bucket,
               ROUND(SUM(kw)::numeric, 1)::float8 AS kw,
               ROUND(AVG(eff)::numeric, 1)::float8 AS eff,
               ROUND(AVG(temp)::numeric, 1)::float8 AS temp
        FROM per_asset
        GROUP BY bucket
        ORDER BY bucket
    )
    SELECT COALESCE(jsonb_agg(
        CASE WHEN p_with_quality THEN
            jsonb_build_object(
                'ts', to_char(to_timestamp(bucket) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'kw', kw,
                'efficiency_pct', eff,
                'temperature_c', temp
            )
        ELSE
            jsonb_build_object(
                'ts', to_char(to_timestamp(bucket) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'kw', kw
            )
        END
        ORDER BY bucket
    ), '[]'::jsonb)
    FROM agg;
$$;

CREATE OR REPLACE FUNCTION public.gp_series_by_type_data(
    p_from timestamp without time zone,
    p_bucket_min int
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH per_asset AS (
        SELECT (FLOOR(EXTRACT(EPOCH FROM recorded_at) / (GREATEST(1, p_bucket_min) * 60))::bigint * (GREATEST(1, p_bucket_min) * 60)) AS bucket,
               asset_id,
               site_id,
               AVG(power_kw) AS kw
        FROM public.telemetry_readings
        WHERE recorded_at >= p_from
        GROUP BY 1, 2, 3
    ),
    by_type AS (
        SELECT p.bucket,
               COALESCE(ROUND(SUM(CASE WHEN s.type = 'solar' THEN p.kw ELSE 0 END)::numeric, 1)::float8, 0.0) AS solar,
               COALESCE(ROUND(SUM(CASE WHEN s.type = 'wind' THEN p.kw ELSE 0 END)::numeric, 1)::float8, 0.0) AS wind,
               COALESCE(ROUND(SUM(CASE WHEN s.type = 'hydro' THEN p.kw ELSE 0 END)::numeric, 1)::float8, 0.0) AS hydro
        FROM per_asset p
        JOIN public.sites s ON s.id = p.site_id
        GROUP BY p.bucket
        ORDER BY p.bucket
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'ts', to_char(to_timestamp(bucket) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'solar', solar,
            'wind', wind,
            'hydro', hydro
        ) ORDER BY bucket
    ), '[]'::jsonb)
    FROM by_type;
$$;

CREATE OR REPLACE FUNCTION public.gp_sparklines_data(
    p_from timestamp without time zone,
    p_bucket_min int
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH per_asset AS (
        SELECT (FLOOR(EXTRACT(EPOCH FROM recorded_at) / (GREATEST(1, p_bucket_min) * 60))::bigint * (GREATEST(1, p_bucket_min) * 60)) AS bucket,
               site_id,
               asset_id,
               AVG(power_kw) AS kw
        FROM public.telemetry_readings
        WHERE recorded_at >= p_from
        GROUP BY 1, 2, 3
    ),
    per_site_bucket AS (
        SELECT site_id, bucket, ROUND(SUM(kw)::numeric, 1)::float8 AS kw
        FROM per_asset
        GROUP BY site_id, bucket
    ),
    per_site AS (
        SELECT site_id::text AS site_key, jsonb_agg(kw ORDER BY bucket) AS arr
        FROM per_site_bucket
        GROUP BY site_id
    )
    SELECT COALESCE(jsonb_object_agg(site_key, arr), '{}'::jsonb) FROM per_site;
$$;

CREATE OR REPLACE FUNCTION public.gp_energy_data(
    p_from timestamp without time zone,
    p_to timestamp without time zone,
    p_group_by text DEFAULT 'site'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_res jsonb;
BEGIN
    IF p_group_by = 'day' THEN
        WITH per_asset_day AS (
            SELECT asset_id, site_id,
                   to_char(recorded_at, 'YYYY-MM-DD') AS day,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE recorded_at BETWEEN p_from AND p_to
            GROUP BY 1, 2, 3
        ),
        grouped AS (
            SELECT day, ROUND(SUM(kwh)::numeric, 1)::float8 AS kwh
            FROM per_asset_day
            GROUP BY day
            ORDER BY day
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('key', day, 'label', day, 'kwh', kwh) ORDER BY day), '[]'::jsonb)
        INTO v_res FROM grouped;
    ELSIF p_group_by = 'type' THEN
        WITH per_asset_day AS (
            SELECT asset_id, site_id,
                   to_char(recorded_at, 'YYYY-MM-DD') AS day,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE recorded_at BETWEEN p_from AND p_to
            GROUP BY 1, 2, 3
        ),
        grouped AS (
            SELECT s.type AS t, ROUND(SUM(e.kwh)::numeric, 1)::float8 AS kwh
            FROM per_asset_day e
            JOIN public.sites s ON s.id = e.site_id
            GROUP BY s.type
            ORDER BY s.type
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object('key', t, 'label', t, 'kwh', kwh) ORDER BY t), '[]'::jsonb)
        INTO v_res FROM grouped;
    ELSE
        WITH per_asset_day AS (
            SELECT asset_id, site_id,
                   to_char(recorded_at, 'YYYY-MM-DD') AS day,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE recorded_at BETWEEN p_from AND p_to
            GROUP BY 1, 2, 3
        ),
        grouped AS (
            SELECT e.site_id, s.name, s.code, s.type, ROUND(SUM(e.kwh)::numeric, 1)::float8 AS kwh
            FROM per_asset_day e
            JOIN public.sites s ON s.id = e.site_id
            GROUP BY e.site_id, s.name, s.code, s.type
            ORDER BY e.site_id
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'key', site_id::text,
            'label', name,
            'code', code,
            'type', type,
            'kwh', kwh
        ) ORDER BY site_id), '[]'::jsonb)
        INTO v_res FROM grouped;
    END IF;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_energy_csv_text(
    p_from timestamp without time zone,
    p_to timestamp without time zone
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_csv text := 'date,site_code,site_name,type,capacity_mw,energy_kwh,avg_efficiency_pct,peak_kw' || E'\n';
    rec RECORD;
BEGIN
    FOR rec IN
        WITH per_asset_day AS (
            SELECT asset_id, site_id,
                   to_char(recorded_at, 'YYYY-MM-DD') AS day,
                   AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh,
                   AVG(efficiency_pct) AS eff,
                   MAX(power_kw) AS peak
            FROM public.telemetry_readings
            WHERE recorded_at BETWEEN p_from AND p_to
            GROUP BY 1, 2, 3
        )
        SELECT e.day,
               s.code,
               s.name,
               s.type,
               s.capacity_mw,
               ROUND(SUM(e.kwh)::numeric, 1) AS kwh,
               ROUND(AVG(e.eff)::numeric, 1) AS eff,
               ROUND(SUM(e.peak)::numeric, 1) AS peak
        FROM per_asset_day e
        JOIN public.sites s ON s.id = e.site_id
        GROUP BY e.day, e.site_id, s.code, s.name, s.type, s.capacity_mw
        ORDER BY e.day, e.site_id
    LOOP
        v_csv := v_csv || format(
            '%s,%s,"%s",%s,%s,%s,%s,%s' || E'\n',
            rec.day,
            rec.code,
            replace(rec.name, '"', '""'),
            rec.type,
            to_char(rec.capacity_mw, 'FM999990.00'),
            to_char(rec.kwh, 'FM999999990.0'),
            to_char(COALESCE(rec.eff, 0), 'FM990.0'),
            to_char(COALESCE(rec.peak, 0), 'FM999999990.0')
        );
    END LOOP;
    RETURN v_csv;
END;
$$;

CREATE OR REPLACE FUNCTION public.gp_dashboard_overview_data()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_start_day timestamp without time zone := date_trunc('day', v_now);
    v_sites jsonb;
    v_top_sites jsonb;
    v_bottom_sites jsonb;
    v_sites_by_status jsonb;
    v_gen_by_type jsonb;
    v_alerts_by_sev jsonb;
    v_recent_alerts jsonb;
    v_wo_by_status jsonb;
    v_due_week int;
    v_total_assets int;
    v_online_assets int;
    v_total_sites int;
    v_fleet_kw float8;
    v_cap_kw float8;
    v_today_kwh float8;
    v_open_alerts int;
BEGIN
    PERFORM public.gp_ensure_fresh_telemetry();

    WITH latest_asset AS (
        SELECT DISTINCT ON (asset_id) asset_id, site_id, power_kw
        FROM public.telemetry_readings
        WHERE recorded_at >= v_now - INTERVAL '5 minutes'
        ORDER BY asset_id, recorded_at DESC
    ),
    out_by_site AS (
        SELECT site_id, ROUND(SUM(power_kw)::numeric, 1)::float8 AS kw
        FROM latest_asset
        GROUP BY site_id
    ),
    today_asset AS (
        SELECT asset_id, site_id,
               AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
        FROM public.telemetry_readings
        WHERE recorded_at BETWEEN v_start_day AND v_now
        GROUP BY asset_id, site_id
    ),
    today_site AS (
        SELECT site_id, ROUND(SUM(kwh)::numeric, 1)::float8 AS kwh
        FROM today_asset
        GROUP BY site_id
    ),
    site_rows AS (
        SELECT s.id, s.name, s.code, s.type, s.status,
               s.capacity_mw::float8 AS capacity_mw,
               (s.capacity_mw::float8 * 1000.0) AS cap_kw,
               s.lat::float8 AS lat, s.lng::float8 AS lng,
               COALESCE(o.kw, 0.0) AS current_output_kw,
               CASE WHEN s.capacity_mw > 0 THEN ROUND((COALESCE(o.kw, 0.0) / (s.capacity_mw::float8 * 1000.0) * 100.0)::numeric, 1)::float8 ELSE 0.0 END AS capacity_factor_pct,
               COALESCE(t.kwh, 0.0) AS today_energy_kwh
        FROM public.sites s
        LEFT JOIN out_by_site o ON o.site_id = s.id
        LEFT JOIN today_site t ON t.site_id = s.id
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', id, 'name', name, 'code', code, 'type', type, 'status', status,
            'capacity_mw', capacity_mw, 'lat', lat, 'lng', lng,
            'current_output_kw', current_output_kw,
            'capacity_factor_pct', capacity_factor_pct,
            'today_energy_kwh', today_energy_kwh
        ) ORDER BY id), '[]'::jsonb),
        COUNT(*)::int,
        COALESCE(ROUND(SUM(current_output_kw)::numeric, 1)::float8, 0.0),
        COALESCE(SUM(cap_kw)::float8, 0.0),
        COALESCE(ROUND(SUM(today_energy_kwh)::numeric, 1)::float8, 0.0)
    INTO v_sites, v_total_sites, v_fleet_kw, v_cap_kw, v_today_kwh
    FROM site_rows;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_top_sites
    FROM (
        SELECT elem FROM jsonb_array_elements(v_sites) AS elem
        ORDER BY (elem->>'capacity_factor_pct')::float8 DESC, (elem->>'id')::bigint ASC
        LIMIT 5
    ) q;

    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_bottom_sites
    FROM (
        SELECT elem FROM jsonb_array_elements(v_sites) AS elem
        ORDER BY (elem->>'capacity_factor_pct')::float8 ASC, (elem->>'id')::bigint DESC
        LIMIT 5
    ) q;

    SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO v_sites_by_status
    FROM (SELECT status, COUNT(*)::int AS cnt FROM public.sites GROUP BY status) q;

    SELECT COALESCE(jsonb_object_agg(t, obj), '{}'::jsonb) INTO v_gen_by_type
    FROM (
        SELECT elem->>'type' AS t,
               jsonb_build_object(
                   'kw', ROUND(SUM((elem->>'current_output_kw')::numeric), 1)::float8,
                   'capacity_kw', SUM((elem->>'capacity_mw')::float8 * 1000.0),
                   'sites', COUNT(*)::int
               ) AS obj
        FROM jsonb_array_elements(v_sites) AS elem
        GROUP BY elem->>'type'
    ) q;

    SELECT COUNT(*)::int, COALESCE(SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END)::int, 0)
    INTO v_total_assets, v_online_assets
    FROM public.assets;

    SELECT COALESCE(jsonb_object_agg(severity, cnt), '{}'::jsonb), COALESCE(SUM(cnt)::int, 0)
    INTO v_alerts_by_sev, v_open_alerts
    FROM (
        SELECT severity, COUNT(*)::int AS cnt
        FROM public.alerts
        WHERE status IN ('open', 'acknowledged')
        GROUP BY severity
    ) q;

    SELECT COALESCE(jsonb_agg(public.gp_alert_json(al, false) ORDER BY al.created_at DESC, al.id DESC), '[]'::jsonb)
    INTO v_recent_alerts
    FROM (
        SELECT * FROM public.alerts
        WHERE status IN ('open', 'acknowledged')
        ORDER BY created_at DESC, id DESC
        LIMIT 8
    ) al;

    SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO v_wo_by_status
    FROM (SELECT status, COUNT(*)::int AS cnt FROM public.work_orders GROUP BY status) q;

    SELECT COUNT(*)::int INTO v_due_week
    FROM public.work_orders
    WHERE status <> 'done' AND due_at IS NOT NULL AND due_at <= v_now + INTERVAL '7 days';

    RETURN jsonb_build_object(
        'fleet', jsonb_build_object(
            'current_output_kw', v_fleet_kw,
            'capacity_kw', v_cap_kw,
            'capacity_factor_pct', CASE WHEN v_cap_kw > 0 THEN ROUND((v_fleet_kw / v_cap_kw * 100.0)::numeric, 1)::float8 ELSE 0.0 END,
            'today_energy_kwh', v_today_kwh,
            'availability_pct', CASE WHEN v_total_assets > 0 THEN ROUND((v_online_assets::numeric / v_total_assets * 100.0), 1)::float8 ELSE 0.0 END,
            'total_sites', v_total_sites,
            'total_assets', v_total_assets
        ),
        'alerts', jsonb_build_object(
            'open', v_open_alerts,
            'by_severity', v_alerts_by_sev,
            'recent', v_recent_alerts
        ),
        'work_orders', jsonb_build_object(
            'due_this_week', v_due_week,
            'by_status', v_wo_by_status
        ),
        'sites', v_sites,
        'sites_by_status', v_sites_by_status,
        'generation_by_type', v_gen_by_type,
        'top_sites', v_top_sites,
        'bottom_sites', v_bottom_sites
    );
END;
$$;

-- ============================================================================
-- 6. UNIFIED GRIDPULSE API v1 ROUTER (PostgREST RPC + Edge Function Gateway)
-- ============================================================================

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
    v_body jsonb := COALESCE(p_body, '{}'::jsonb);
    v_now timestamp without time zone := (NOW() AT TIME ZONE 'UTC');
    v_raw_tok text;
    v_tok_id bigint;
    v_tok_plain text;
    v_tok_hash text;
    v_pat public.personal_access_tokens;
    v_user public.users;
    v_target_user public.users;
    v_site public.sites;
    v_asset public.assets;
    v_alert public.alerts;
    v_wo public.work_orders;
    v_reading public.telemetry_readings;
    v_id bigint;
    v_page int;
    v_limit int;
    v_offset int;
    v_total bigint;
    v_items jsonb;
    v_q text;
    v_sort text;
    v_new_token text;
    v_is_first boolean;
    v_from timestamp without time zone;
    v_to timestamp without time zone;
    v_code text;
    v_tag text;
    v_priority text;
    v_title text;
    v_assets_status jsonb;
    v_alerts_sev jsonb;
    v_total_cnt int;
    v_online_cnt int;
    v_out_kw float8;
    v_cap_kw float8;
    v_today_kwh float8;
BEGIN
    -- Normalize path: strip /api/v1 prefix and trailing slashes
    v_path := regexp_replace(v_path, '^/api/v1(?=/|$)', '');
    v_path := regexp_replace(v_path, '/+$', '');
    IF v_path = '' THEN v_path := '/'; END IF;
    IF LEFT(v_path, 1) <> '/' THEN v_path := '/' || v_path; END IF;

    -- ------------------------------------------------------------------------
    -- PUBLIC ROUTES
    -- ------------------------------------------------------------------------
    IF v_method = 'GET' AND v_path = '/health' THEN
        RETURN jsonb_build_object(
            'status', 200,
            'body', jsonb_build_object(
                'status', 'ok',
                'app', 'GridPulse',
                'env', 'production',
                'db', 'connected',
                'driver', 'supabase-pgsql',
                'time', public.gp_iso(v_now)
            )
        );
    END IF;

    IF v_method = 'POST' AND v_path = '/auth/register' THEN
        IF LENGTH(TRIM(COALESCE(v_body->>'name', ''))) < 2 THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Name must be at least 2 characters.', '{"name":["Name must be at least 2 characters."]}'::jsonb);
        END IF;
        IF COALESCE(v_body->>'email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Enter a valid email address.', '{"email":["Enter a valid email address."]}'::jsonb);
        END IF;
        IF EXISTS (SELECT 1 FROM public.users WHERE LOWER(email) = LOWER(TRIM(v_body->>'email'))) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'That email address is already registered.', '{"email":["That email address is already registered."]}'::jsonb);
        END IF;
        IF LENGTH(COALESCE(v_body->>'password', '')) < 8 OR COALESCE(v_body->>'password', '') !~ '[A-Za-z]' OR COALESCE(v_body->>'password', '') !~ '[0-9]' THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Password must be at least 8 characters with a letter and a number.', '{"password":["Password must be at least 8 characters with a letter and a number."]}'::jsonb);
        END IF;
        IF COALESCE(v_body->>'password', '') <> COALESCE(v_body->>'password_confirmation', '') THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Passwords do not match.', '{"password_confirmation":["Passwords do not match."]}'::jsonb);
        END IF;

        SELECT (COUNT(*) = 0) INTO v_is_first FROM public.users;
        INSERT INTO public.users (name, email, password, role, is_active, last_login_at, created_at, updated_at)
        VALUES (
            LEFT(TRIM(v_body->>'name'), 80),
            LOWER(TRIM(v_body->>'email')),
            public.gp_hash_password(v_body->>'password'),
            CASE WHEN v_is_first THEN 'admin' ELSE 'viewer' END,
            true, v_now, v_now, v_now
        ) RETURNING * INTO v_user;

        v_new_token := public.gp_issue_token(v_user.id, p_ua);
        PERFORM public.gp_audit_write(v_user.id, 'auth.register', 'User', v_user.id, jsonb_build_object('email', v_user.email), p_ip);
        RETURN public.gp_resp_ok(jsonb_build_object('token', v_new_token, 'user', public.gp_user_json(v_user)), 201);
    END IF;

    IF v_method = 'POST' AND v_path = '/auth/login' THEN
        SELECT * INTO v_user FROM public.users WHERE LOWER(email) = LOWER(TRIM(COALESCE(v_body->>'email', ''))) LIMIT 1;
        IF v_user.id IS NULL OR NOT public.gp_verify_password(v_body->>'password', v_user.password) THEN
            RETURN public.gp_resp_err(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
        END IF;
        IF NOT v_user.is_active THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'This account has been deactivated. Contact your admin.');
        END IF;

        UPDATE public.users SET last_login_at = v_now, updated_at = v_now WHERE id = v_user.id RETURNING * INTO v_user;
        v_new_token := public.gp_issue_token(v_user.id, p_ua);
        PERFORM public.gp_audit_write(v_user.id, 'auth.login', 'User', v_user.id, NULL, p_ip);
        RETURN public.gp_resp_ok(jsonb_build_object('token', v_new_token, 'user', public.gp_user_json(v_user)));
    END IF;

    -- ------------------------------------------------------------------------
    -- AUTHENTICATION MIDDLEWARE (Sanctum personal_access_tokens)
    -- ------------------------------------------------------------------------
    v_raw_tok := TRIM(regexp_replace(COALESCE(p_token, ''), '^Bearer\s+', '', 'i'));
    IF v_raw_tok = '' THEN
        RETURN public.gp_resp_err(401, 'UNAUTHENTICATED', 'Authentication required.');
    END IF;

    IF strpos(v_raw_tok, '|') > 0 THEN
        BEGIN
            v_tok_id := split_part(v_raw_tok, '|', 1)::bigint;
        EXCEPTION WHEN OTHERS THEN
            RETURN public.gp_resp_err(401, 'UNAUTHENTICATED', 'Invalid access token.');
        END;
        v_tok_plain := substr(v_raw_tok, strpos(v_raw_tok, '|') + 1);
        v_tok_hash := encode(extensions.digest(v_tok_plain, 'sha256'), 'hex');
        SELECT * INTO v_pat FROM public.personal_access_tokens
        WHERE id = v_tok_id AND token = v_tok_hash AND (expires_at IS NULL OR expires_at > v_now);
    ELSE
        v_tok_hash := encode(extensions.digest(v_raw_tok, 'sha256'), 'hex');
        SELECT * INTO v_pat FROM public.personal_access_tokens
        WHERE token = v_tok_hash AND (expires_at IS NULL OR expires_at > v_now)
        LIMIT 1;
    END IF;

    IF v_pat.id IS NULL THEN
        RETURN public.gp_resp_err(401, 'UNAUTHENTICATED', 'Session expired or invalid. Please sign in again.');
    END IF;

    SELECT * INTO v_user FROM public.users WHERE id = v_pat.tokenable_id;
    IF v_user.id IS NULL THEN
        RETURN public.gp_resp_err(401, 'UNAUTHENTICATED', 'Account not found.');
    END IF;
    IF NOT v_user.is_active THEN
        RETURN public.gp_resp_err(403, 'FORBIDDEN', 'This account has been deactivated. Contact your admin.');
    END IF;

    UPDATE public.personal_access_tokens SET last_used_at = v_now WHERE id = v_pat.id;

    -- Pagination defaults
    v_page := GREATEST(1, COALESCE(NULLIF(v_query->>'page', '')::int, 1));
    v_limit := LEAST(100, GREATEST(1, COALESCE(NULLIF(v_query->>'limit', '')::int, 20)));
    v_offset := (v_page - 1) * v_limit;
    v_q := NULLIF(TRIM(COALESCE(v_query->>'q', '')), '');
    v_sort := COALESCE(NULLIF(TRIM(COALESCE(v_query->>'sort', '')), ''), '');

    -- ------------------------------------------------------------------------
    -- AUTH SELF ROUTES
    -- ------------------------------------------------------------------------
    IF v_method = 'POST' AND v_path = '/auth/logout' THEN
        DELETE FROM public.personal_access_tokens WHERE id = v_pat.id;
        PERFORM public.gp_audit_write(v_user.id, 'auth.logout', 'User', v_user.id, NULL, p_ip);
        RETURN public.gp_resp_ok(jsonb_build_object('logged_out', true));
    END IF;

    IF v_method = 'GET' AND v_path = '/auth/me' THEN
        RETURN public.gp_resp_ok(public.gp_user_json(v_user));
    END IF;

    IF v_method = 'PATCH' AND v_path = '/auth/me' THEN
        IF LENGTH(TRIM(COALESCE(v_body->>'name', ''))) < 2 THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Name must be at least 2 characters.', '{"name":["Name must be at least 2 characters."]}'::jsonb);
        END IF;
        UPDATE public.users SET name = LEFT(TRIM(v_body->>'name'), 80), updated_at = v_now WHERE id = v_user.id RETURNING * INTO v_user;
        PERFORM public.gp_audit_write(v_user.id, 'user.update_profile', 'User', v_user.id, NULL, p_ip);
        RETURN public.gp_resp_ok(public.gp_user_json(v_user));
    END IF;

    IF v_method = 'PATCH' AND v_path = '/auth/me/password' THEN
        IF NOT public.gp_verify_password(v_body->>'current_password', v_user.password) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Current password is incorrect.', '{"current_password":["Current password is incorrect."]}'::jsonb);
        END IF;
        IF LENGTH(COALESCE(v_body->>'password', '')) < 8 OR COALESCE(v_body->>'password', '') !~ '[A-Za-z]' OR COALESCE(v_body->>'password', '') !~ '[0-9]' THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Password must be at least 8 characters with a letter and a number.', '{"password":["Password must be at least 8 characters with a letter and a number."]}'::jsonb);
        END IF;
        IF COALESCE(v_body->>'password', '') <> COALESCE(v_body->>'password_confirmation', '') THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Passwords do not match.', '{"password_confirmation":["Passwords do not match."]}'::jsonb);
        END IF;
        IF COALESCE(v_body->>'password', '') = COALESCE(v_body->>'current_password', '') THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Choose a password you have not used just now.', '{"password":["Choose a password you have not used just now."]}'::jsonb);
        END IF;

        UPDATE public.users SET password = public.gp_hash_password(v_body->>'password'), updated_at = v_now WHERE id = v_user.id RETURNING * INTO v_user;
        DELETE FROM public.personal_access_tokens WHERE tokenable_id = v_user.id AND id <> v_pat.id;
        PERFORM public.gp_audit_write(v_user.id, 'user.change_password', 'User', v_user.id, NULL, p_ip);
        RETURN public.gp_resp_ok(public.gp_user_json(v_user));
    END IF;

    -- ------------------------------------------------------------------------
    -- USERS & AUDIT (Admin only)
    -- ------------------------------------------------------------------------
    IF v_path = '/users' AND v_method = 'GET' THEN
        IF v_user.role <> 'admin' THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
        END IF;
        SELECT COUNT(*) INTO v_total FROM public.users u
        WHERE v_q IS NULL OR u.name ILIKE '%' || v_q || '%' OR u.email ILIKE '%' || v_q || '%';

        SELECT COALESCE(jsonb_agg(public.gp_user_json(u)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT * FROM public.users u
            WHERE v_q IS NULL OR u.name ILIKE '%' || v_q || '%' OR u.email ILIKE '%' || v_q || '%'
            ORDER BY
                CASE WHEN v_sort = '-created_at' THEN u.created_at END DESC,
                CASE WHEN v_sort = 'created_at' THEN u.created_at END ASC,
                CASE WHEN v_sort = 'role' THEN u.role END ASC,
                CASE WHEN v_sort = '-role' THEN u.role END DESC,
                CASE WHEN v_sort = '-name' THEN u.name END DESC,
                u.name ASC, u.id ASC
            LIMIT v_limit OFFSET v_offset
        ) u;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    IF v_path ~ '^/users/\d+$' THEN
        IF v_user.role <> 'admin' THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
        END IF;
        v_id := substring(v_path FROM '^/users/(\d+)$')::bigint;
        SELECT * INTO v_target_user FROM public.users WHERE id = v_id;
        IF v_target_user.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'User not found.');
        END IF;

        IF v_method = 'PATCH' THEN
            IF v_target_user.id = v_user.id AND (v_body ? 'role') AND (v_body->>'role') <> 'admin' THEN
                RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'You cannot remove your own admin role.');
            END IF;
            IF v_target_user.id = v_user.id AND (v_body ? 'is_active') AND NOT (v_body->>'is_active')::boolean THEN
                RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'You cannot deactivate your own account.');
            END IF;
            IF (v_body ? 'role') AND (v_body->>'role') NOT IN ('admin', 'engineer', 'viewer') THEN
                RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Invalid role.');
            END IF;

            UPDATE public.users SET
                name = CASE WHEN v_body ? 'name' THEN LEFT(TRIM(v_body->>'name'), 80) ELSE name END,
                role = CASE WHEN v_body ? 'role' THEN v_body->>'role' ELSE role END,
                is_active = CASE WHEN v_body ? 'is_active' THEN (v_body->>'is_active')::boolean ELSE is_active END,
                updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_target_user;

            IF NOT v_target_user.is_active THEN
                DELETE FROM public.personal_access_tokens WHERE tokenable_id = v_id;
            END IF;
            PERFORM public.gp_audit_write(v_user.id, 'user.update', 'User', v_id, v_body, p_ip);
            RETURN public.gp_resp_ok(public.gp_user_json(v_target_user));
        ELSIF v_method = 'DELETE' THEN
            IF v_target_user.id = v_user.id THEN
                RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'You cannot delete your own account.');
            END IF;
            PERFORM public.gp_audit_write(v_user.id, 'user.delete', 'User', v_id, jsonb_build_object('email', v_target_user.email), p_ip);
            DELETE FROM public.personal_access_tokens WHERE tokenable_id = v_id;
            DELETE FROM public.users WHERE id = v_id;
            RETURN jsonb_build_object('status', 204, 'body', NULL);
        END IF;
    END IF;

    IF v_path = '/audit' AND v_method = 'GET' THEN
        IF v_user.role <> 'admin' THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
        END IF;
        v_limit := LEAST(100, GREATEST(1, COALESCE(NULLIF(v_query->>'limit', '')::int, 30)));
        v_offset := (v_page - 1) * v_limit;
        SELECT COUNT(*) INTO v_total FROM public.audit_logs;
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
            SELECT * FROM public.audit_logs
            ORDER BY created_at DESC, id DESC
            LIMIT v_limit OFFSET v_offset
        ) l;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    -- ------------------------------------------------------------------------
    -- SITES
    -- ------------------------------------------------------------------------
    IF v_path = '/sites' AND v_method = 'GET' THEN
        SELECT COUNT(*) INTO v_total FROM public.sites s
        WHERE (v_q IS NULL OR s.name ILIKE '%' || v_q || '%' OR s.code ILIKE '%' || v_q || '%' OR s.region ILIKE '%' || v_q || '%')
          AND (NULLIF(v_query->>'type', '') IS NULL OR s.type = v_query->>'type')
          AND (NULLIF(v_query->>'status', '') IS NULL OR s.status = v_query->>'status');

        SELECT COALESCE(jsonb_agg(public.gp_site_json(s, true)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT * FROM public.sites s
            WHERE (v_q IS NULL OR s.name ILIKE '%' || v_q || '%' OR s.code ILIKE '%' || v_q || '%' OR s.region ILIKE '%' || v_q || '%')
              AND (NULLIF(v_query->>'type', '') IS NULL OR s.type = v_query->>'type')
              AND (NULLIF(v_query->>'status', '') IS NULL OR s.status = v_query->>'status')
            ORDER BY
                CASE WHEN v_sort = '-capacity_mw' THEN s.capacity_mw END DESC,
                CASE WHEN v_sort = 'capacity_mw' THEN s.capacity_mw END ASC,
                CASE WHEN v_sort = '-created_at' THEN s.created_at END DESC,
                CASE WHEN v_sort = 'code' THEN s.code END ASC,
                CASE WHEN v_sort = '-name' THEN s.name END DESC,
                s.name ASC, s.id ASC
            LIMIT v_limit OFFSET v_offset
        ) s;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    IF v_path = '/sites' AND v_method = 'POST' THEN
        IF v_user.role NOT IN ('admin', 'engineer') THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
        END IF;
        v_code := UPPER(TRIM(COALESCE(v_body->>'code', '')));
        IF LENGTH(TRIM(COALESCE(v_body->>'name', ''))) < 2 THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Site name is required.', '{"name":["Site name must be at least 2 characters."]}'::jsonb);
        END IF;
        IF v_code !~ '^[A-Z]{3}-[A-Z0-9]{2,4}-\d{2,3}$' THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Code format is TYP-RGN-01, for example SOL-TX-01.', '{"code":["Code format is TYP-RGN-01, for example SOL-TX-01."]}'::jsonb);
        END IF;
        IF EXISTS (SELECT 1 FROM public.sites WHERE code = v_code) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'That site code is already in use.', '{"code":["That site code is already in use."]}'::jsonb);
        END IF;
        IF COALESCE(v_body->>'type', '') NOT IN ('solar', 'wind', 'hydro') THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Invalid site type.', '{"type":["Select solar, wind, or hydro."]}'::jsonb);
        END IF;

        INSERT INTO public.sites (
            name, code, type, capacity_mw, status, lat, lng, region, country,
            commissioned_at, min_efficiency, max_temperature, created_by, created_at, updated_at
        ) VALUES (
            LEFT(TRIM(v_body->>'name'), 120),
            v_code,
            v_body->>'type',
            GREATEST(0.1, (v_body->>'capacity_mw')::numeric),
            COALESCE(NULLIF(v_body->>'status', ''), 'online'),
            (v_body->>'lat')::numeric,
            (v_body->>'lng')::numeric,
            LEFT(TRIM(COALESCE(v_body->>'region', 'Chitral')), 80),
            LEFT(TRIM(COALESCE(v_body->>'country', 'Pakistan')), 80),
            NULLIF(v_body->>'commissioned_at', '')::date,
            COALESCE(NULLIF(v_body->>'min_efficiency', '')::numeric, 70),
            COALESCE(NULLIF(v_body->>'max_temperature', '')::numeric, 65),
            v_user.id, v_now, v_now
        ) RETURNING * INTO v_site;

        PERFORM public.gp_audit_write(v_user.id, 'site.create', 'Site', v_site.id, jsonb_build_object('code', v_site.code), p_ip);
        RETURN public.gp_resp_ok(public.gp_site_json(v_site, true), 201);
    END IF;

    IF v_path ~ '^/sites/\d+/summary$' AND v_method = 'GET' THEN
        v_id := substring(v_path FROM '^/sites/(\d+)/summary$')::bigint;
        SELECT * INTO v_site FROM public.sites WHERE id = v_id;
        IF v_site.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Site not found.');
        END IF;

        SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb),
               COALESCE(SUM(cnt)::int, 0),
               COALESCE(SUM(CASE WHEN status = 'online' THEN cnt ELSE 0 END)::int, 0)
        INTO v_assets_status, v_total_cnt, v_online_cnt
        FROM (SELECT status, COUNT(*)::int AS cnt FROM public.assets WHERE site_id = v_id GROUP BY status) q;

        SELECT COALESCE(jsonb_object_agg(severity, cnt), '{}'::jsonb)
        INTO v_alerts_sev
        FROM (SELECT severity, COUNT(*)::int AS cnt FROM public.alerts WHERE site_id = v_id AND status IN ('open', 'acknowledged') GROUP BY severity) q;

        v_out_kw := public.gp_site_output_kw(v_id);
        v_cap_kw := v_site.capacity_mw::float8 * 1000.0;

        WITH today_asset AS (
            SELECT asset_id, AVG(power_kw) * (EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at))) / 3600.0) AS kwh
            FROM public.telemetry_readings
            WHERE site_id = v_id AND recorded_at BETWEEN date_trunc('day', v_now) AND v_now
            GROUP BY asset_id
        )
        SELECT COALESCE(ROUND(SUM(kwh)::numeric, 1)::float8, 0.0) INTO v_today_kwh FROM today_asset;

        RETURN public.gp_resp_ok(jsonb_build_object(
            'current_output_kw', v_out_kw,
            'capacity_kw', v_cap_kw,
            'capacity_factor_pct', CASE WHEN v_cap_kw > 0 THEN ROUND((v_out_kw / v_cap_kw * 100.0)::numeric, 1)::float8 ELSE 0.0 END,
            'today_energy_kwh', v_today_kwh,
            'availability_pct', CASE WHEN v_total_cnt > 0 THEN ROUND((v_online_cnt::numeric / v_total_cnt * 100.0), 1)::float8 ELSE 0.0 END,
            'assets_by_status', v_assets_status,
            'alerts_by_severity', v_alerts_sev,
            'open_work_orders', (SELECT COUNT(*)::int FROM public.work_orders WHERE site_id = v_id AND status <> 'done')
        ));
    END IF;

    IF v_path ~ '^/sites/\d+$' THEN
        v_id := substring(v_path FROM '^/sites/(\d+)$')::bigint;
        SELECT * INTO v_site FROM public.sites WHERE id = v_id;
        IF v_site.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Site not found.');
        END IF;

        IF v_method = 'GET' THEN
            RETURN public.gp_resp_ok(public.gp_site_json(v_site, true));
        ELSIF v_method = 'PATCH' THEN
            IF v_user.role NOT IN ('admin', 'engineer') THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
            END IF;
            IF v_body ? 'code' THEN
                v_code := UPPER(TRIM(COALESCE(v_body->>'code', '')));
                IF v_code !~ '^[A-Z]{3}-[A-Z0-9]{2,4}-\d{2,3}$' THEN
                    RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Code format is TYP-RGN-01, for example SOL-TX-01.', '{"code":["Code format is TYP-RGN-01, for example SOL-TX-01."]}'::jsonb);
                END IF;
                IF EXISTS (SELECT 1 FROM public.sites WHERE code = v_code AND id <> v_id) THEN
                    RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'That site code is already in use.', '{"code":["That site code is already in use."]}'::jsonb);
                END IF;
            END IF;

            UPDATE public.sites SET
                name = CASE WHEN v_body ? 'name' THEN LEFT(TRIM(v_body->>'name'), 120) ELSE name END,
                code = CASE WHEN v_body ? 'code' THEN v_code ELSE code END,
                type = CASE WHEN v_body ? 'type' THEN v_body->>'type' ELSE type END,
                capacity_mw = CASE WHEN v_body ? 'capacity_mw' THEN (v_body->>'capacity_mw')::numeric ELSE capacity_mw END,
                status = CASE WHEN v_body ? 'status' THEN v_body->>'status' ELSE status END,
                lat = CASE WHEN v_body ? 'lat' THEN (v_body->>'lat')::numeric ELSE lat END,
                lng = CASE WHEN v_body ? 'lng' THEN (v_body->>'lng')::numeric ELSE lng END,
                region = CASE WHEN v_body ? 'region' THEN LEFT(TRIM(v_body->>'region'), 80) ELSE region END,
                country = CASE WHEN v_body ? 'country' THEN LEFT(TRIM(v_body->>'country'), 80) ELSE country END,
                commissioned_at = CASE WHEN v_body ? 'commissioned_at' THEN NULLIF(v_body->>'commissioned_at', '')::date ELSE commissioned_at END,
                min_efficiency = CASE WHEN v_body ? 'min_efficiency' THEN (v_body->>'min_efficiency')::numeric ELSE min_efficiency END,
                max_temperature = CASE WHEN v_body ? 'max_temperature' THEN (v_body->>'max_temperature')::numeric ELSE max_temperature END,
                updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_site;

            PERFORM public.gp_audit_write(v_user.id, 'site.update', 'Site', v_id, jsonb_build_object('fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(v_body) k)), p_ip);
            RETURN public.gp_resp_ok(public.gp_site_json(v_site, true));
        ELSIF v_method = 'DELETE' THEN
            IF v_user.role <> 'admin' THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
            END IF;
            PERFORM public.gp_audit_write(v_user.id, 'site.delete', 'Site', v_id, jsonb_build_object('code', v_site.code), p_ip);
            DELETE FROM public.sites WHERE id = v_id;
            RETURN jsonb_build_object('status', 204, 'body', NULL);
        END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- ASSETS
    -- ------------------------------------------------------------------------
    IF v_path = '/assets' AND v_method = 'GET' THEN
        SELECT COUNT(*) INTO v_total FROM public.assets a
        WHERE (v_q IS NULL OR a.name ILIKE '%' || v_q || '%' OR a.tag ILIKE '%' || v_q || '%' OR COALESCE(a.manufacturer, '') ILIKE '%' || v_q || '%')
          AND (NULLIF(v_query->>'site_id', '') IS NULL OR a.site_id = (v_query->>'site_id')::bigint)
          AND (NULLIF(v_query->>'kind', '') IS NULL OR a.kind = v_query->>'kind')
          AND (NULLIF(v_query->>'status', '') IS NULL OR a.status = v_query->>'status');

        SELECT COALESCE(jsonb_agg(public.gp_asset_json(a, true, false)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT * FROM public.assets a
            WHERE (v_q IS NULL OR a.name ILIKE '%' || v_q || '%' OR a.tag ILIKE '%' || v_q || '%' OR COALESCE(a.manufacturer, '') ILIKE '%' || v_q || '%')
              AND (NULLIF(v_query->>'site_id', '') IS NULL OR a.site_id = (v_query->>'site_id')::bigint)
              AND (NULLIF(v_query->>'kind', '') IS NULL OR a.kind = v_query->>'kind')
              AND (NULLIF(v_query->>'status', '') IS NULL OR a.status = v_query->>'status')
            ORDER BY
                CASE WHEN v_sort = '-rated_kw' THEN a.rated_kw END DESC,
                CASE WHEN v_sort = 'rated_kw' THEN a.rated_kw END ASC,
                CASE WHEN v_sort = '-health_score' THEN a.health_score END DESC,
                CASE WHEN v_sort = 'health_score' THEN a.health_score END ASC,
                CASE WHEN v_sort = 'name' THEN a.name END ASC,
                CASE WHEN v_sort = '-tag' THEN a.tag END DESC,
                a.tag ASC, a.id ASC
            LIMIT v_limit OFFSET v_offset
        ) a;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    IF v_path = '/assets' AND v_method = 'POST' THEN
        IF v_user.role NOT IN ('admin', 'engineer') THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
        END IF;
        v_tag := UPPER(TRIM(COALESCE(v_body->>'tag', '')));
        IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = COALESCE(NULLIF(v_body->>'site_id', '')::bigint, -1)) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'The selected site does not exist.', '{"site_id":["The selected site does not exist."]}'::jsonb);
        END IF;
        IF v_tag !~ '^[A-Z]{2,4}-\d{2,4}$' THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Tag format is INV-01 or WT-003.', '{"tag":["Tag format is INV-01 or WT-003."]}'::jsonb);
        END IF;
        IF EXISTS (SELECT 1 FROM public.assets WHERE tag = v_tag) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'That asset tag is already in use.', '{"tag":["That asset tag is already in use."]}'::jsonb);
        END IF;

        INSERT INTO public.assets (
            site_id, name, tag, kind, manufacturer, serial_number, rated_kw, status, health_score, installed_at, created_at, updated_at
        ) VALUES (
            (v_body->>'site_id')::bigint,
            LEFT(TRIM(v_body->>'name'), 120),
            v_tag,
            v_body->>'kind',
            NULLIF(TRIM(COALESCE(v_body->>'manufacturer', '')), ''),
            NULLIF(TRIM(COALESCE(v_body->>'serial_number', '')), ''),
            GREATEST(1, (v_body->>'rated_kw')::numeric),
            COALESCE(NULLIF(v_body->>'status', ''), 'online'),
            COALESCE(NULLIF(v_body->>'health_score', '')::numeric, 100),
            NULLIF(v_body->>'installed_at', '')::date,
            v_now, v_now
        ) RETURNING * INTO v_asset;

        PERFORM public.gp_audit_write(v_user.id, 'asset.create', 'Asset', v_asset.id, jsonb_build_object('tag', v_asset.tag), p_ip);
        RETURN public.gp_resp_ok(public.gp_asset_json(v_asset, true, false), 201);
    END IF;

    IF v_path ~ '^/assets/\d+$' THEN
        v_id := substring(v_path FROM '^/assets/(\d+)$')::bigint;
        SELECT * INTO v_asset FROM public.assets WHERE id = v_id;
        IF v_asset.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Asset not found.');
        END IF;

        IF v_method = 'GET' THEN
            RETURN public.gp_resp_ok(public.gp_asset_json(v_asset, true, true));
        ELSIF v_method = 'PATCH' THEN
            IF v_user.role NOT IN ('admin', 'engineer') THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
            END IF;
            IF v_body ? 'tag' THEN
                v_tag := UPPER(TRIM(COALESCE(v_body->>'tag', '')));
                IF v_tag !~ '^[A-Z]{2,4}-\d{2,4}$' THEN
                    RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Tag format is INV-01 or WT-003.', '{"tag":["Tag format is INV-01 or WT-003."]}'::jsonb);
                END IF;
                IF EXISTS (SELECT 1 FROM public.assets WHERE tag = v_tag AND id <> v_id) THEN
                    RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'That asset tag is already in use.', '{"tag":["That asset tag is already in use."]}'::jsonb);
                END IF;
            END IF;

            UPDATE public.assets SET
                site_id = CASE WHEN v_body ? 'site_id' THEN (v_body->>'site_id')::bigint ELSE site_id END,
                name = CASE WHEN v_body ? 'name' THEN LEFT(TRIM(v_body->>'name'), 120) ELSE name END,
                tag = CASE WHEN v_body ? 'tag' THEN v_tag ELSE tag END,
                kind = CASE WHEN v_body ? 'kind' THEN v_body->>'kind' ELSE kind END,
                manufacturer = CASE WHEN v_body ? 'manufacturer' THEN NULLIF(TRIM(COALESCE(v_body->>'manufacturer', '')), '') ELSE manufacturer END,
                serial_number = CASE WHEN v_body ? 'serial_number' THEN NULLIF(TRIM(COALESCE(v_body->>'serial_number', '')), '') ELSE serial_number END,
                rated_kw = CASE WHEN v_body ? 'rated_kw' THEN (v_body->>'rated_kw')::numeric ELSE rated_kw END,
                status = CASE WHEN v_body ? 'status' THEN v_body->>'status' ELSE status END,
                health_score = CASE WHEN v_body ? 'health_score' THEN (v_body->>'health_score')::numeric ELSE health_score END,
                installed_at = CASE WHEN v_body ? 'installed_at' THEN NULLIF(v_body->>'installed_at', '')::date ELSE installed_at END,
                updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_asset;

            IF (v_body ? 'status') AND v_asset.status <> 'offline' THEN
                UPDATE public.alerts
                SET status = 'resolved', resolved_at = v_now, resolved_by = v_user.id, updated_at = v_now
                WHERE asset_id = v_id AND type = 'asset_offline' AND status IN ('open', 'acknowledged');
            END IF;

            PERFORM public.gp_audit_write(v_user.id, 'asset.update', 'Asset', v_id, jsonb_build_object('fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(v_body) k)), p_ip);
            RETURN public.gp_resp_ok(public.gp_asset_json(v_asset, true, false));
        ELSIF v_method = 'DELETE' THEN
            IF v_user.role <> 'admin' THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
            END IF;
            PERFORM public.gp_audit_write(v_user.id, 'asset.delete', 'Asset', v_id, jsonb_build_object('tag', v_asset.tag), p_ip);
            DELETE FROM public.assets WHERE id = v_id;
            RETURN jsonb_build_object('status', 204, 'body', NULL);
        END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- TELEMETRY
    -- ------------------------------------------------------------------------
    IF v_method = 'GET' AND v_path = '/telemetry/fleet/live' THEN
        RETURN public.gp_resp_ok(public.gp_fleet_live_data());
    END IF;

    IF v_method = 'GET' AND v_path = '/telemetry/fleet/series' THEN
        PERFORM public.gp_ensure_fresh_telemetry();
        v_from := v_now - make_interval(mins => LEAST(10080, GREATEST(5, COALESCE(NULLIF(v_query->>'minutes', '')::int, 60))));
        IF COALESCE(v_query->>'by', 'fleet') = 'type' THEN
            RETURN public.gp_resp_ok(public.gp_series_by_type_data(v_from, LEAST(240, GREATEST(1, COALESCE(NULLIF(v_query->>'bucket', '')::int, 30)))));
        END IF;
        RETURN public.gp_resp_ok(public.gp_series_data(v_from, LEAST(240, GREATEST(1, COALESCE(NULLIF(v_query->>'bucket', '')::int, 1))), NULL, false));
    END IF;

    IF v_method = 'GET' AND v_path = '/telemetry/sites/sparklines' THEN
        v_from := v_now - make_interval(hours => LEAST(168, GREATEST(1, COALESCE(NULLIF(v_query->>'hours', '')::int, 24))));
        RETURN public.gp_resp_ok(public.gp_sparklines_data(v_from, LEAST(240, GREATEST(5, COALESCE(NULLIF(v_query->>'bucket', '')::int, 60)))));
    END IF;

    IF v_method = 'GET' AND v_path ~ '^/telemetry/sites/\d+/series$' THEN
        v_id := substring(v_path FROM '^/telemetry/sites/(\d+)/series$')::bigint;
        IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_id) THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Site not found.');
        END IF;
        v_from := v_now - make_interval(hours => LEAST(168, GREATEST(1, COALESCE(NULLIF(v_query->>'hours', '')::int, 24))));
        RETURN public.gp_resp_ok(public.gp_series_data(v_from, LEAST(240, GREATEST(1, COALESCE(NULLIF(v_query->>'bucket', '')::int, 15))), v_id, true));
    END IF;

    IF v_method = 'GET' AND v_path ~ '^/telemetry/assets/\d+/latest$' THEN
        v_id := substring(v_path FROM '^/telemetry/assets/(\d+)/latest$')::bigint;
        IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = v_id) THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Asset not found.');
        END IF;
        SELECT * INTO v_reading FROM public.telemetry_readings WHERE asset_id = v_id ORDER BY recorded_at DESC LIMIT 1;
        RETURN public.gp_resp_ok(public.gp_reading_json(v_reading));
    END IF;

    IF v_method = 'GET' AND v_path = '/telemetry/energy' THEN
        v_to := COALESCE(NULLIF(v_query->>'to', '')::timestamp, v_now);
        v_from := COALESCE(NULLIF(v_query->>'from', '')::timestamp, v_to - INTERVAL '7 days');
        RETURN public.gp_resp_ok(public.gp_energy_data(v_from, v_to, COALESCE(NULLIF(v_query->>'group_by', ''), 'site')));
    END IF;

    -- ------------------------------------------------------------------------
    -- ALERTS
    -- ------------------------------------------------------------------------
    IF v_path = '/alerts' AND v_method = 'GET' THEN
        SELECT COUNT(*) INTO v_total FROM public.alerts al
        WHERE (NULLIF(v_query->>'status', '') IS NULL OR al.status = v_query->>'status')
          AND (NULLIF(v_query->>'severity', '') IS NULL OR al.severity = v_query->>'severity')
          AND (NULLIF(v_query->>'type', '') IS NULL OR al.type = v_query->>'type')
          AND (NULLIF(v_query->>'site_id', '') IS NULL OR al.site_id = (v_query->>'site_id')::bigint)
          AND (NULLIF(v_query->>'asset_id', '') IS NULL OR al.asset_id = (v_query->>'asset_id')::bigint);

        SELECT COALESCE(jsonb_agg(public.gp_alert_json(al, false)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT * FROM public.alerts al
            WHERE (NULLIF(v_query->>'status', '') IS NULL OR al.status = v_query->>'status')
              AND (NULLIF(v_query->>'severity', '') IS NULL OR al.severity = v_query->>'severity')
              AND (NULLIF(v_query->>'type', '') IS NULL OR al.type = v_query->>'type')
              AND (NULLIF(v_query->>'site_id', '') IS NULL OR al.site_id = (v_query->>'site_id')::bigint)
              AND (NULLIF(v_query->>'asset_id', '') IS NULL OR al.asset_id = (v_query->>'asset_id')::bigint)
            ORDER BY
                CASE WHEN v_sort = 'created_at' THEN al.created_at END ASC,
                al.created_at DESC, al.id DESC
            LIMIT v_limit OFFSET v_offset
        ) al;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    IF v_path ~ '^/alerts/\d+$' AND v_method = 'GET' THEN
        v_id := substring(v_path FROM '^/alerts/(\d+)$')::bigint;
        SELECT * INTO v_alert FROM public.alerts WHERE id = v_id;
        IF v_alert.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Alert not found.');
        END IF;
        RETURN public.gp_resp_ok(public.gp_alert_json(v_alert, true));
    END IF;

    IF v_path ~ '^/alerts/\d+/(acknowledge|resolve|work-order)$' AND v_method = 'POST' THEN
        IF v_user.role NOT IN ('admin', 'engineer') THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
        END IF;
        v_id := substring(v_path FROM '^/alerts/(\d+)/')::bigint;
        SELECT * INTO v_alert FROM public.alerts WHERE id = v_id;
        IF v_alert.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Alert not found.');
        END IF;

        IF v_path LIKE '%/acknowledge' THEN
            IF v_alert.status <> 'open' THEN
                RETURN public.gp_resp_err(409, 'CONFLICT', format('This alert is already %s.', v_alert.status));
            END IF;
            UPDATE public.alerts SET status = 'acknowledged', acknowledged_by = v_user.id, acknowledged_at = v_now, updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_alert;
            PERFORM public.gp_audit_write(v_user.id, 'alert.acknowledge', 'Alert', v_id, NULL, p_ip);
            RETURN public.gp_resp_ok(public.gp_alert_json(v_alert, false));
        ELSIF v_path LIKE '%/resolve' THEN
            IF v_alert.status = 'resolved' THEN
                RETURN public.gp_resp_err(409, 'CONFLICT', 'This alert is already resolved.');
            END IF;
            UPDATE public.alerts SET status = 'resolved', resolved_by = v_user.id, resolved_at = v_now, updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_alert;
            PERFORM public.gp_audit_write(v_user.id, 'alert.resolve', 'Alert', v_id, NULL, p_ip);
            RETURN public.gp_resp_ok(public.gp_alert_json(v_alert, false));
        ELSE
            IF v_alert.work_order_id IS NOT NULL THEN
                RETURN public.gp_resp_err(409, 'CONFLICT', 'A work order already exists for this alert.');
            END IF;
            SELECT * INTO v_asset FROM public.assets WHERE id = v_alert.asset_id;
            v_priority := COALESCE(NULLIF(v_body->>'priority', ''), CASE v_alert.severity
                WHEN 'critical' THEN 'urgent'
                WHEN 'warning' THEN 'high'
                ELSE 'medium'
            END);
            v_title := COALESCE(NULLIF(TRIM(COALESCE(v_body->>'title', '')), ''),
                format('Investigate %s on %s', replace(v_alert.type, '_', ' '), COALESCE(v_asset.name, 'asset')));

            INSERT INTO public.work_orders (
                title, description, priority, status, site_id, asset_id, alert_id, assignee_id, created_by, due_at, created_at, updated_at
            ) VALUES (
                LEFT(v_title, 160),
                v_alert.message,
                v_priority,
                'planned',
                v_alert.site_id,
                v_alert.asset_id,
                v_alert.id,
                NULLIF(v_body->>'assignee_id', '')::bigint,
                v_user.id,
                NULLIF(v_body->>'due_at', '')::timestamp,
                v_now, v_now
            ) RETURNING * INTO v_wo;

            UPDATE public.alerts SET
                work_order_id = v_wo.id,
                status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
                acknowledged_by = CASE WHEN status = 'open' THEN v_user.id ELSE acknowledged_by END,
                acknowledged_at = CASE WHEN status = 'open' THEN v_now ELSE acknowledged_at END,
                updated_at = v_now
            WHERE id = v_id;

            PERFORM public.gp_audit_write(v_user.id, 'alert.to_work_order', 'Alert', v_id, jsonb_build_object('work_order_id', v_wo.id), p_ip);
            RETURN public.gp_resp_ok(public.gp_wo_json(v_wo), 201);
        END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- WORK ORDERS
    -- ------------------------------------------------------------------------
    IF v_path = '/work-orders' AND v_method = 'GET' THEN
        SELECT COUNT(*) INTO v_total FROM public.work_orders w
        WHERE (v_q IS NULL OR w.title ILIKE '%' || v_q || '%')
          AND (NULLIF(v_query->>'status', '') IS NULL OR w.status = v_query->>'status')
          AND (NULLIF(v_query->>'priority', '') IS NULL OR w.priority = v_query->>'priority')
          AND (NULLIF(v_query->>'site_id', '') IS NULL OR w.site_id = (v_query->>'site_id')::bigint)
          AND (NULLIF(v_query->>'assignee_id', '') IS NULL OR w.assignee_id = (v_query->>'assignee_id')::bigint);

        SELECT COALESCE(jsonb_agg(public.gp_wo_json(w)), '[]'::jsonb) INTO v_items
        FROM (
            SELECT * FROM public.work_orders w
            WHERE (v_q IS NULL OR w.title ILIKE '%' || v_q || '%')
              AND (NULLIF(v_query->>'status', '') IS NULL OR w.status = v_query->>'status')
              AND (NULLIF(v_query->>'priority', '') IS NULL OR w.priority = v_query->>'priority')
              AND (NULLIF(v_query->>'site_id', '') IS NULL OR w.site_id = (v_query->>'site_id')::bigint)
              AND (NULLIF(v_query->>'assignee_id', '') IS NULL OR w.assignee_id = (v_query->>'assignee_id')::bigint)
            ORDER BY
                (CASE w.priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'medium' THEN 1 ELSE 0 END) DESC,
                w.due_at ASC NULLS LAST,
                w.created_at DESC,
                w.id DESC
            LIMIT v_limit OFFSET v_offset
        ) w;
        RETURN public.gp_resp_paged(v_items, v_page, v_limit, v_total);
    END IF;

    IF v_path = '/work-orders' AND v_method = 'POST' THEN
        IF v_user.role NOT IN ('admin', 'engineer') THEN
            RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
        END IF;
        IF LENGTH(TRIM(COALESCE(v_body->>'title', ''))) < 3 THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'Title must be at least 3 characters.', '{"title":["Title must be at least 3 characters."]}'::jsonb);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = COALESCE(NULLIF(v_body->>'site_id', '')::bigint, -1)) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'The selected site does not exist.', '{"site_id":["The selected site does not exist."]}'::jsonb);
        END IF;
        IF NULLIF(v_body->>'asset_id', '') IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.assets WHERE id = (v_body->>'asset_id')::bigint AND site_id = (v_body->>'site_id')::bigint
        ) THEN
            RETURN public.gp_resp_err(422, 'VALIDATION_ERROR', 'The asset must belong to the selected site.', '{"asset_id":["The asset must belong to the selected site."]}'::jsonb);
        END IF;

        INSERT INTO public.work_orders (
            title, description, priority, status, site_id, asset_id, alert_id, assignee_id, created_by, due_at, completed_at, created_at, updated_at
        ) VALUES (
            LEFT(TRIM(v_body->>'title'), 160),
            NULLIF(TRIM(COALESCE(v_body->>'description', '')), ''),
            COALESCE(NULLIF(v_body->>'priority', ''), 'medium'),
            COALESCE(NULLIF(v_body->>'status', ''), 'planned'),
            (v_body->>'site_id')::bigint,
            NULLIF(v_body->>'asset_id', '')::bigint,
            NULLIF(v_body->>'alert_id', '')::bigint,
            NULLIF(v_body->>'assignee_id', '')::bigint,
            v_user.id,
            NULLIF(v_body->>'due_at', '')::timestamp,
            CASE WHEN COALESCE(NULLIF(v_body->>'status', ''), 'planned') = 'done' THEN v_now ELSE NULL END,
            v_now, v_now
        ) RETURNING * INTO v_wo;

        IF v_wo.alert_id IS NOT NULL THEN
            UPDATE public.alerts SET work_order_id = v_wo.id, updated_at = v_now WHERE id = v_wo.alert_id;
        END IF;

        PERFORM public.gp_audit_write(v_user.id, 'work_order.create', 'WorkOrder', v_wo.id, jsonb_build_object('title', v_wo.title), p_ip);
        RETURN public.gp_resp_ok(public.gp_wo_json(v_wo), 201);
    END IF;

    IF v_path ~ '^/work-orders/\d+$' THEN
        v_id := substring(v_path FROM '^/work-orders/(\d+)$')::bigint;
        SELECT * INTO v_wo FROM public.work_orders WHERE id = v_id;
        IF v_wo.id IS NULL THEN
            RETURN public.gp_resp_err(404, 'NOT_FOUND', 'Work order not found.');
        END IF;

        IF v_method = 'GET' THEN
            RETURN public.gp_resp_ok(public.gp_wo_json(v_wo));
        ELSIF v_method = 'PATCH' THEN
            IF v_user.role NOT IN ('admin', 'engineer') THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Engineer or admin role required.');
            END IF;

            UPDATE public.work_orders SET
                title = CASE WHEN v_body ? 'title' THEN LEFT(TRIM(v_body->>'title'), 160) ELSE title END,
                description = CASE WHEN v_body ? 'description' THEN NULLIF(TRIM(COALESCE(v_body->>'description', '')), '') ELSE description END,
                priority = CASE WHEN v_body ? 'priority' THEN v_body->>'priority' ELSE priority END,
                status = CASE WHEN v_body ? 'status' THEN v_body->>'status' ELSE status END,
                site_id = CASE WHEN v_body ? 'site_id' THEN (v_body->>'site_id')::bigint ELSE site_id END,
                asset_id = CASE WHEN v_body ? 'asset_id' THEN NULLIF(v_body->>'asset_id', '')::bigint ELSE asset_id END,
                assignee_id = CASE WHEN v_body ? 'assignee_id' THEN NULLIF(v_body->>'assignee_id', '')::bigint ELSE assignee_id END,
                due_at = CASE WHEN v_body ? 'due_at' THEN NULLIF(v_body->>'due_at', '')::timestamp ELSE due_at END,
                completed_at = CASE
                    WHEN (v_body ? 'status') AND (v_body->>'status') = 'done' AND v_wo.status <> 'done' THEN v_now
                    WHEN (v_body ? 'status') AND (v_body->>'status') <> 'done' THEN NULL
                    ELSE completed_at
                END,
                updated_at = v_now
            WHERE id = v_id RETURNING * INTO v_wo;

            IF v_wo.status = 'done' AND v_wo.alert_id IS NOT NULL THEN
                UPDATE public.alerts
                SET status = 'resolved', resolved_at = v_now, resolved_by = v_user.id, updated_at = v_now
                WHERE id = v_wo.alert_id AND status <> 'resolved';
            END IF;

            PERFORM public.gp_audit_write(v_user.id, 'work_order.update', 'WorkOrder', v_id, jsonb_build_object('fields', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(v_body) k)), p_ip);
            RETURN public.gp_resp_ok(public.gp_wo_json(v_wo));
        ELSIF v_method = 'DELETE' THEN
            IF v_user.role <> 'admin' THEN
                RETURN public.gp_resp_err(403, 'FORBIDDEN', 'Admin role required.');
            END IF;
            PERFORM public.gp_audit_write(v_user.id, 'work_order.delete', 'WorkOrder', v_id, jsonb_build_object('title', v_wo.title), p_ip);
            DELETE FROM public.work_orders WHERE id = v_id;
            RETURN jsonb_build_object('status', 204, 'body', NULL);
        END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- DASHBOARD & REPORTS
    -- ------------------------------------------------------------------------
    IF v_method = 'GET' AND v_path = '/dashboard/overview' THEN
        RETURN public.gp_resp_ok(public.gp_dashboard_overview_data());
    END IF;

    IF v_method = 'GET' AND v_path = '/reports/energy.csv' THEN
        v_to := COALESCE(NULLIF(v_query->>'to', '')::timestamp, v_now);
        v_from := COALESCE(NULLIF(v_query->>'from', '')::timestamp, v_to - INTERVAL '7 days');
        RETURN jsonb_build_object(
            'status', 200,
            'is_csv', true,
            'filename', format('gridpulse-energy-%s-to-%s.csv', to_char(v_from, 'YYYY-MM-DD'), to_char(v_to, 'YYYY-MM-DD')),
            'csv', public.gp_energy_csv_text(v_from, v_to)
        );
    END IF;

    RETURN public.gp_resp_err(404, 'NOT_FOUND', format('Endpoint %s %s not found.', v_method, v_path));
END;
$$;

-- Expose ONLY gp_api RPC to Supabase API roles; keep internal helper functions locked down!
REVOKE ALL ON FUNCTION public.gp_simulate_tick(timestamp without time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_prune_telemetry(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_issue_token(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_verify_password(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_hash_password(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_audit_write(bigint, text, text, bigint, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_api(text, text, jsonb, jsonb, text, text, text) TO anon, authenticated, service_role;
