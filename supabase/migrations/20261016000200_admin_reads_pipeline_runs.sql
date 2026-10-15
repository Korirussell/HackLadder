-- Admins see pipeline run history on /admin (crawls, rating runs, their status and config snapshot).
grant select on public.pipeline_runs to authenticated;
create policy "admins read pipeline runs" on public.pipeline_runs
  for select to authenticated using ((select public.is_admin()));
