CREATE TABLE IF NOT EXISTS study_records (
	id TEXT PRIMARY KEY,
	date TEXT NOT NULL UNIQUE,
	calculus_minutes INTEGER NOT NULL DEFAULT 0,
	course_minutes INTEGER NOT NULL DEFAULT 0,
	word_count INTEGER NOT NULL DEFAULT 0,
	target_level INTEGER NOT NULL DEFAULT 0 CHECK (target_level IN (0, 1, 2)),
	chapter_count INTEGER NOT NULL DEFAULT 0,
	word_round_count INTEGER NOT NULL DEFAULT 0,
	manual_bonus INTEGER NOT NULL DEFAULT 0,
	game_minutes INTEGER NOT NULL DEFAULT 0,
	note TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS study_records_date_idx ON study_records (date);
