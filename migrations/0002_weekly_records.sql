CREATE TABLE IF NOT EXISTS weekly_records (
	id TEXT PRIMARY KEY,
	week_key TEXT NOT NULL UNIQUE,
	week_start TEXT NOT NULL,
	study_minutes_target INTEGER NOT NULL DEFAULT 0,
	word_count_target INTEGER NOT NULL DEFAULT 0,
	game_minutes_budget INTEGER NOT NULL DEFAULT 0,
	plan_note TEXT NOT NULL DEFAULT '',
	review_note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS weekly_records_week_key_idx ON weekly_records (week_key);
