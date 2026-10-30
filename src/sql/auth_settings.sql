-- p1 = chat id Telegram pengirim. Chat pertama yang mengirim pesan otomatis
-- menjadi pemilik bot; chat lain ditolak.
with reg as (
  update settings set value = $1::text, updated_at = now()
  where key = 'telegram_chat_id' and coalesce(value, '') = ''
  returning value
)
select
  coalesce((select value from reg), (select value from settings where key = 'telegram_chat_id')) as owner_chat_id,
  (select value from reg) is not null as just_registered,
  (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from settings) as settings;
