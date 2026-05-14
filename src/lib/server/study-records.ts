import { toRecord } from '$lib/study/scoring';
import type { StudyRecord, TargetLevel } from '$lib/study/types';

type StudyRecordRow = {
	id: string;
	date: string;
	calculus_minutes: number;
	course_minutes: number;
	word_count: number;
	target_level: TargetLevel;
	chapter_count: number;
	word_round_count: number;
	manual_bonus: number;
	game_minutes: number;
	note: string;
	created_at: string;
	updated_at: string;
};

const columns = `
	id,
	date,
	calculus_minutes,
	course_minutes,
	word_count,
	target_level,
	chapter_count,
	word_round_count,
	manual_bonus,
	game_minutes,
	note,
	created_at,
	updated_at
`;

function fromRow(row: StudyRecordRow): StudyRecord {
	return {
		id: row.id,
		date: row.date,
		calculusMinutes: row.calculus_minutes,
		courseMinutes: row.course_minutes,
		wordCount: row.word_count,
		targetLevel: row.target_level,
		chapterCount: row.chapter_count,
		wordRoundCount: row.word_round_count,
		manualBonus: row.manual_bonus,
		gameMinutes: row.game_minutes,
		note: row.note,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export async function listRecords(db: D1Database) {
	const result = await db
		.prepare(`SELECT ${columns} FROM study_records ORDER BY date ASC`)
		.all<StudyRecordRow>();
	return result.results.map(fromRow);
}

export async function getRecord(db: D1Database, date: string) {
	const row = await db
		.prepare(`SELECT ${columns} FROM study_records WHERE date = ?`)
		.bind(date)
		.first<StudyRecordRow>();

	return row ? fromRow(row) : null;
}

export async function upsertRecord(db: D1Database, input: Partial<StudyRecord>) {
	const record = toRecord(input);
	const existing = await getRecord(db, record.date);
	const createdAt = existing?.createdAt ?? record.createdAt;

	await db
		.prepare(
			`
			INSERT INTO study_records (
				id,
				date,
				calculus_minutes,
				course_minutes,
				word_count,
				target_level,
				chapter_count,
				word_round_count,
				manual_bonus,
				game_minutes,
				note,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(date) DO UPDATE SET
				calculus_minutes = excluded.calculus_minutes,
				course_minutes = excluded.course_minutes,
				word_count = excluded.word_count,
				target_level = excluded.target_level,
				chapter_count = excluded.chapter_count,
				word_round_count = excluded.word_round_count,
				manual_bonus = excluded.manual_bonus,
				game_minutes = excluded.game_minutes,
				note = excluded.note,
				updated_at = excluded.updated_at
		`
		)
		.bind(
			record.id,
			record.date,
			record.calculusMinutes,
			record.courseMinutes,
			record.wordCount,
			record.targetLevel,
			record.chapterCount,
			record.wordRoundCount,
			record.manualBonus,
			record.gameMinutes,
			record.note,
			createdAt,
			record.updatedAt
		)
		.run();

	const saved = await getRecord(db, record.date);
	if (!saved) throw new Error('Record was not saved');
	return saved;
}

export async function deleteRecord(db: D1Database, date: string) {
	await db.prepare('DELETE FROM study_records WHERE date = ?').bind(date).run();
}
