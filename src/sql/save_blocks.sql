-- p1 = JSON array blok baru [{task_id,start_at,end_at,gcal_event_id}]
-- Blok "planned" yang belum dimulai diganti seluruhnya.
with del as (
  delete from study_blocks where status = 'planned' and start_at >= now() returning id
), ins as (
  insert into study_blocks (task_id, start_at, end_at, gcal_event_id)
  select x.task_id, x.start_at, x.end_at, x.gcal_event_id
  from jsonb_to_recordset($1::jsonb) as x(task_id bigint, start_at timestamptz, end_at timestamptz, gcal_event_id text)
  returning id
)
select (select count(*) from del) as deleted, (select count(*) from ins) as inserted;
