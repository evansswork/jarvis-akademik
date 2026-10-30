-- Bahan pesan check-in malam.
with day0 as (
  select (date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta') as d
)
select
  (select value from settings where key = 'telegram_chat_id') as chat_id,
  (select coalesce(jsonb_agg(x order by x.start_at), '[]'::jsonb) from (
     select b.id, b.task_id, t.title, t.course, b.start_at, b.end_at, b.status,
            to_char(b.start_at at time zone 'Asia/Jakarta', 'HH24:MI') || '-' ||
            to_char(b.end_at at time zone 'Asia/Jakarta', 'HH24:MI') as jam
     from study_blocks b join tasks t on t.id = b.task_id, day0
     where b.start_at >= day0.d and b.start_at < now() and t.status = 'open') x) as today_blocks,
  (select coalesce(jsonb_agg(x order by x.start_at), '[]'::jsonb) from (
     select b.task_id, t.title, t.course, b.start_at,
            to_char(b.start_at at time zone 'Asia/Jakarta', 'HH24:MI') || '-' ||
            to_char(b.end_at at time zone 'Asia/Jakarta', 'HH24:MI') as jam
     from study_blocks b join tasks t on t.id = b.task_id, day0
     where b.start_at >= day0.d + interval '1 day' and b.start_at < day0.d + interval '2 day') x) as tomorrow_blocks,
  (select coalesce(jsonb_agg(x order by x.deadline), '[]'::jsonb) from (
     select id, title, course, deadline,
            to_char(deadline at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') as deadline_wib
     from tasks where status = 'open' and deadline between now() and now() + interval '3 days') x) as due_soon;
