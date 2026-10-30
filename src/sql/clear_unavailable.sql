-- p1 = mulai, p2 = selesai: hapus semua periode tidak tersedia yang beririsan
with del as (
  delete from unavailability
  where start_at < $2::timestamptz and end_at > $1::timestamptz
  returning id
)
select count(*) as removed from del;
