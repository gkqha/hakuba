import type {
	LedgerRow,
	ScoreBreakdown,
	StudyRecord,
	StudyRecordDraft,
	TargetLevel,
	WeeklyRecord,
	WeeklyRecordDraft
} from './types';

export const scoringRules = {
	minutesBlock: 30,
	minutesBlockPoints: 15,
	wordsBlock: 50,
	wordsBlockPoints: 10,
	weekdayTargetBonus: 10,
	weekendTargetBonus: 20,
	longStudyThreshold: 240,
	weekdayLongStudyBonus: 15,
	weekendLongStudyBonus: 20,
	chapterBonus: 30,
	wordRoundBonus: 60,
	pointsToGameMinutes: 1,
	dailyExchangeCap: 220
};

export function todayInputValue(date = new Date()) {
	const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return localDate.toISOString().slice(0, 10);
}

export function nowIso() {
	return new Date().toISOString();
}

export function isTargetLevel(value: unknown): value is TargetLevel {
	return value === 0 || value === 1 || value === 2;
}

export function clampNumber(value: unknown) {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
	return Math.round(numberValue);
}

export function isWeekend(dateString: string) {
	const date = new Date(`${dateString}T00:00:00`);
	const day = date.getDay();
	return day === 0 || day === 6;
}

export function getDefaultTargetLevel(dateString: string): TargetLevel {
	return isWeekend(dateString) ? 2 : 1;
}

export function getTargetRequirements(targetLevel: TargetLevel) {
	return targetLevel === 2
		? { studyMinutes: 300, wordCount: 200 }
		: { studyMinutes: 120, wordCount: 150 };
}

export function getTargetProgress(record: StudyRecordDraft) {
	const studyMinutes = record.calculusMinutes + record.courseMinutes;
	const requirements = getTargetRequirements(record.targetLevel);
	const studyProgress = Math.min(1, studyMinutes / requirements.studyMinutes);
	const wordProgress = Math.min(1, record.wordCount / requirements.wordCount);
	const totalProgress = (studyProgress + wordProgress) / 2;

	return {
		requirements,
		studyProgress,
		wordProgress,
		totalProgress,
		studyMinutes
	};
}

export function createDraft(date = todayInputValue()): StudyRecordDraft {
	return {
		date,
		calculusMinutes: 0,
		courseMinutes: 0,
		wordCount: 0,
		targetLevel: getDefaultTargetLevel(date),
		chapterCount: 0,
		wordRoundCount: 0,
		manualBonus: 0,
		gameMinutes: 0,
		note: ''
	};
}

export function normalizeDraft(input: Partial<StudyRecordDraft>): StudyRecordDraft {
	const date = typeof input.date === 'string' && input.date ? input.date : todayInputValue();
	const targetLevel = isTargetLevel(Number(input.targetLevel))
		? (Number(input.targetLevel) as TargetLevel)
		: getDefaultTargetLevel(date);

	return {
		date,
		calculusMinutes: clampNumber(input.calculusMinutes),
		courseMinutes: clampNumber(input.courseMinutes),
		wordCount: clampNumber(input.wordCount),
		targetLevel,
		chapterCount: clampNumber(input.chapterCount),
		wordRoundCount: clampNumber(input.wordRoundCount),
		manualBonus: clampNumber(input.manualBonus),
		gameMinutes: clampNumber(input.gameMinutes),
		note: typeof input.note === 'string' ? input.note.trim() : ''
	};
}

export function toRecord(input: Partial<StudyRecordDraft> & Partial<StudyRecord>): StudyRecord {
	const draft = normalizeDraft(input);
	const timestamp = nowIso();
	return {
		...draft,
		id: draft.date,
		createdAt: typeof input.createdAt === 'string' ? input.createdAt : timestamp,
		updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : timestamp,
		syncState: input.syncState
	};
}

export function toDraft(record: StudyRecord): StudyRecordDraft {
	return {
		date: record.date,
		calculusMinutes: record.calculusMinutes,
		courseMinutes: record.courseMinutes,
		wordCount: record.wordCount,
		targetLevel: record.targetLevel,
		chapterCount: record.chapterCount,
		wordRoundCount: record.wordRoundCount,
		manualBonus: record.manualBonus,
		gameMinutes: record.gameMinutes,
		note: record.note
	};
}

export function scoreRecord(record: StudyRecordDraft): ScoreBreakdown {
	const studyMinutes = record.calculusMinutes + record.courseMinutes;
	const targetComplete = isRecommendedTargetComplete(record);
	const studyPoints =
		Math.floor(studyMinutes / scoringRules.minutesBlock) * scoringRules.minutesBlockPoints;
	const wordPoints =
		Math.floor(record.wordCount / scoringRules.wordsBlock) * scoringRules.wordsBlockPoints;
	const targetBonus = !targetComplete
		? 0
		: record.targetLevel === 2
			? scoringRules.weekendTargetBonus
			: record.targetLevel === 1
				? scoringRules.weekdayTargetBonus
				: 0;
	const longStudyBonus =
		studyMinutes >= scoringRules.longStudyThreshold
			? record.targetLevel === 2
				? scoringRules.weekendLongStudyBonus
				: scoringRules.weekdayLongStudyBonus
			: 0;
	const extraBonus =
		record.chapterCount * scoringRules.chapterBonus +
		record.wordRoundCount * scoringRules.wordRoundBonus +
		record.manualBonus;
	const totalPoints = studyPoints + wordPoints + targetBonus + longStudyBonus + extraBonus;
	const exchangeableMinutes = Math.min(
		totalPoints * scoringRules.pointsToGameMinutes,
		scoringRules.dailyExchangeCap
	);

	return {
		studyPoints,
		wordPoints,
		targetBonus,
		longStudyBonus,
		extraBonus,
		totalPoints,
		exchangeableMinutes
	};
}

export function isRecommendedTargetComplete(record: StudyRecordDraft) {
	const studyMinutes = record.calculusMinutes + record.courseMinutes;
	const requirements = getTargetRequirements(record.targetLevel);
	return (
		record.targetLevel !== 0 &&
		studyMinutes >= requirements.studyMinutes &&
		record.wordCount >= requirements.wordCount
	);
}

export function sortRecordsAscending(records: StudyRecord[]) {
	return [...records].sort((a, b) => a.date.localeCompare(b.date));
}

export function sortRecordsDescending(records: StudyRecord[]) {
	return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

export function buildLedger(records: StudyRecord[]): LedgerRow[] {
	let balance = 0;

	return sortRecordsAscending(records).map((record) => {
		const score = scoreRecord(toDraft(record));
		const row = {
			record,
			score,
			balanceBefore: balance,
			balanceAfter: balance + score.exchangeableMinutes - record.gameMinutes
		};
		balance = row.balanceAfter;
		return row;
	});
}

export function getCurrentStreak(records: StudyRecord[], today = todayInputValue()) {
	const recordDates = new Set(records.map((record) => record.date));
	let cursor = new Date(`${today}T00:00:00`);
	let streak = 0;

	while (recordDates.has(todayInputValue(cursor))) {
		streak += 1;
		cursor = new Date(cursor.getTime() - 86_400_000);
	}

	return streak;
}

export function getMonthKey(date = todayInputValue()) {
	return date.slice(0, 7);
}

export function getWeekStart(dateString = todayInputValue()) {
	const date = new Date(`${dateString}T00:00:00`);
	const mondayOffset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - mondayOffset);
	return todayInputValue(date);
}

export function getWeekKey(dateString = todayInputValue()) {
	return getWeekStart(dateString);
}

export function createWeeklyDraft(date = todayInputValue()): WeeklyRecordDraft {
	const weekStart = getWeekStart(date);
	return {
		weekKey: weekStart,
		weekStart,
		recommendedDaysTarget: 0,
		planNote: '',
		reviewNote: ''
	};
}

export function normalizeWeeklyDraft(input: Partial<WeeklyRecordDraft>): WeeklyRecordDraft {
	const weekStart =
		typeof input.weekStart === 'string' && input.weekStart
			? getWeekStart(input.weekStart)
			: getWeekStart(typeof input.weekKey === 'string' ? input.weekKey : todayInputValue());

	return {
		weekKey: weekStart,
		weekStart,
		recommendedDaysTarget: Math.min(7, clampNumber(input.recommendedDaysTarget)),
		planNote: typeof input.planNote === 'string' ? input.planNote.trim() : '',
		reviewNote: typeof input.reviewNote === 'string' ? input.reviewNote.trim() : ''
	};
}

export function toWeeklyRecord(
	input: Partial<WeeklyRecordDraft> & Partial<WeeklyRecord>
): WeeklyRecord {
	const draft = normalizeWeeklyDraft(input);
	const timestamp = nowIso();
	return {
		...draft,
		id: draft.weekKey,
		createdAt: typeof input.createdAt === 'string' ? input.createdAt : timestamp,
		updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : timestamp,
		syncState: input.syncState
	};
}

export function toWeeklyDraft(record: WeeklyRecord): WeeklyRecordDraft {
	return {
		weekKey: record.weekKey,
		weekStart: record.weekStart,
		recommendedDaysTarget: Math.min(7, clampNumber(record.recommendedDaysTarget)),
		planNote: record.planNote,
		reviewNote: record.reviewNote
	};
}

export function toApiWeeklyRecord(record: WeeklyRecord): WeeklyRecord {
	const clean = { ...record };
	delete clean.syncState;
	return clean;
}

export function toApiRecord(record: StudyRecord): StudyRecord {
	const clean = { ...record };
	delete clean.syncState;
	return clean;
}
