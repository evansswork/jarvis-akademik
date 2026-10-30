-- p1 = session id (chat id), p2 = isi pesan. Menyimpan pesan check-in sebagai
-- pesan "AI" di memori agent, agar balasan user ("udah", "belum") dipahami.
insert into n8n_chat_histories (session_id, message)
values ($1::text, jsonb_build_object(
  'type', 'ai',
  'data', jsonb_build_object(
    'content', $2::text, 'tool_calls', '[]'::jsonb, 'invalid_tool_calls', '[]'::jsonb,
    'additional_kwargs', '{}'::jsonb, 'response_metadata', '{}'::jsonb)))
returning id;
