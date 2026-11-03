ALTER FUNCTION public.gp_assistant_chat(text, text, jsonb) SET statement_timeout = '60s';
ALTER FUNCTION public.gp_assistant_public(text, jsonb, text) SET statement_timeout = '60s';
ALTER FUNCTION public.gp_api(text, text, jsonb, jsonb, text, text, text) SET statement_timeout = '60s';
