-- p1 = task id, p2 = menit dikerjakan, p3 = selesai (bool), p4 = catatan
with upd as (
  update tasks set
    done_minutes = done_minutes + greatest($2::int, 0),
    status = case when $3::boolean then 'done' else status end,
    updated_at = now()
  where id = $1::bigint
  returning id, title, effort_minutes, done_minutes, target_pct, status
), ins as (
  insert into checkins (task_id, minutes_done, finished, note)
  select id, greatest($2::int, 0), $3::boolean, nullif($4::text, '') from upd
  returning id
), blk as (
  update study_blocks set status = case when $3::boolean or $2::int > 0 then 'done' else 'missed' end
  where task_id = $1::bigint and status = 'planned' and start_at < now()
  returning id
)
select upd.*,
       greatest(0, round(upd.effort_minutes * upd.target_pct / 100.0)::int - upd.done_minutes) as remaining_minutes,
       (select count(*) from blk) as past_blocks_marked
from upd;
