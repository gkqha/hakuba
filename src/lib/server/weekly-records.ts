import { toWeeklyRecord } from '$lib/study/scoring';
import type { WeeklyRecord } from '$lib/study/types';

type WeeklyRecordRow = {
	id: string;
	week_key: string;
	week_start: string;
	study_minutes_target: number;
	word_count_target: number;
	game_minutes_budget: number;
	plan_note: string;
	review_note: string;
	created_at: string;
	updated_at: string;
};

const columns = `
	id,
	week_key,
	week_start,
	study_minutes_target,
	word_count_target,
	game_minutes_budget,
	plan_note,
	review_note,
	created_at,
	updated_at
`;

function fromRow(row: WeeklyRecordRow): WeeklyRecord {
	return {
		id: row.id,
		weekKey: row.week_key,
		weekStart: row.week_start,
		studyMinutesTarget: row.study_minutes_target,
		wordCountTarget: row.word_count_target,
		gameMinutesBudget: row.game_minutes_budget,
		planNote: row.plan_note,
		reviewNote: row.review_note,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export async function listWeeklyRecords(db: D1Database) {
	const result = await db
		.prepare(`SELECT ${columns} FROM weekly_records ORDER BY week_start ASC`)
		.all<WeeklyRecordRow>();
	return result.results.map(fromRow);
}

export async function getWeeklyRecord(db: D1Database, weekKey: string) {
	const row = await db
		.prepare(`SELECT ${columns} FROM weekly_records WHERE week_key = ?`)
		.bind(weekKey)
		.first<WeeklyRecordRow>();

	return row ? fromRow(row) : null;
}

export async function upsertWeeklyRecord(db: D1Database, input: Partial<WeeklyRecord>) {
	const weeklyRecord = toWeeklyRecord(input);
	const existing = await getWeeklyRecord(db, weeklyRecord.weekKey);
	const createdAt = existing?.createdAt ?? weeklyRecord.createdAt;

	await db
		.prepare(
			`
			INSERT INTO weekly_records (
				id,
				week_key,
				week_start,
				study_minutes_target,
				word_count_target,
				game_minutes_budget,
				plan_note,
				review_note,
				created_at,
				updated_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(week_key) DO UPDATE SET
				week_start = excluded.week_start,
				study_minutes_target = excluded.study_minutes_target,
				word_count_target = excluded.word_count_target,
				game_minutes_budget = excluded.game_minutes_budget,
				plan_note = excluded.plan_note,
				review_note = excluded.review_note,
				updated_at = excluded.updated_at
		`
		)
		.bind(
			weeklyRecord.id,
			weeklyRecord.weekKey,
			weeklyRecord.weekStart,
			weeklyRecord.studyMinutesTarget,
			weeklyRecord.wordCountTarget,
			weeklyRecord.gameMinutesBudget,
			weeklyRecord.planNote,
			weeklyRecord.reviewNote,
			createdAt,
			weeklyRecord.updatedAt
		)
		.run();

	const saved = await getWeeklyRecord(db, weeklyRecord.weekKey);
	if (!saved) throw new Error('Weekly record was not saved');
	return saved;
}
