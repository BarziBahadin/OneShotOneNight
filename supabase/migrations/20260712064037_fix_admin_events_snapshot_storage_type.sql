do $$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('public.admin_events_snapshot(text,text,text)'::regprocedure)
  into definition;

  corrected := replace(
    definition,
    E'    coalesce(p.bytes, 0) + coalesce(m.bytes, 0)\n  from selected_events e',
    E'    (coalesce(p.bytes, 0) + coalesce(m.bytes, 0))::bigint\n  from selected_events e'
  );

  if corrected = definition then
    raise exception 'admin_events_snapshot storage expression was not found';
  end if;

  execute corrected;
end;
$$;
