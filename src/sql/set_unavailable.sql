-- p1 = mulai, p2 = selesai (timestamptz), p3 = alasan
insert into unavailability (start_at, end_at, reason)
values ($1::timestamptz, $2::timestamptz, nullif($3::text, ''))
returning id, reason,
          to_char(start_at at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') as mulai,
          to_char(end_at at time zone 'Asia/Jakarta', 'Dy DD Mon HH24:MI') as selesai;
