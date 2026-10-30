-- p1 = key, p2 = value, p3 = tambahkan (true) atau ganti (false).
-- Key sudah divalidasi di Code node.
insert into settings (key, value, updated_at) values ($1::text, $2::text, now())
on conflict (key) do update set
  value = case
    when $3::boolean and settings.value <> '' then settings.value || ', ' || excluded.value
    else excluded.value
  end,
  updated_at = now()
returning key, value;
