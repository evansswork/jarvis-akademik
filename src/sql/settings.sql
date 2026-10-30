select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) as settings from settings;
