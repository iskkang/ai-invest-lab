-- Pin the lookup path of immutable-record trigger functions.
-- The functions do not reference application tables, so an empty search_path
-- is safe and prevents role-controlled schema search-path injection.
ALTER FUNCTION public.ail_forbid_change() SET search_path = '';
ALTER FUNCTION public.ail_guard_decision() SET search_path = '';
ALTER FUNCTION public.ail_guard_order() SET search_path = '';
ALTER FUNCTION public.ail_guard_round() SET search_path = '';
