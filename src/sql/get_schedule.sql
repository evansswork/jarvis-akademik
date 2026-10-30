-- p1 = dari, p2 = sampai (timestamptz): blok belajar Jarvis di rentang itu
select coalesce(jsonb_agg(x order by x.start_at), '[]'::jsonb) as blocks from (
  select b.id as block_id, b.task_id, t.title, t.course, b.start_at, b.end_at, b.status,
         to_char(b.start_at at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') || '-' ||
         to_char(b.end_at at time zone 'Asia/Jakarta', 'HH24:MI') as waktu
  from study_blocks b join tasks t on t.id = b.task_id
  where b.start_at >= $1::timestamptz and b.start_at < $2::timestamptz
) x;
