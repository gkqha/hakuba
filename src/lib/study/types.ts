export const targetLevels = [0, 1, 2] as const;

export type TargetLevel = (typeof targetLevels)[number];
export type SyncState = 'synced' | 'pending' | 'local';

export type StudyRecord = {
	id: string;
	date: string;
	calculusMinutes: number;
	courseMinutes: number;
	wordCount: number;
	targetLevel: TargetLevel;
	chapterCount: number;
	wordRoundCount: number;
	manualBonus: number;
	gameMinutes: number;
	note: string;
	createdAt: string;
	updatedAt: string;
	syncState?: SyncState;
};

export type StudyRecordDraft = Omit<StudyRecord, 'id' | 'createdAt' | 'updatedAt' | 'syncState'>;

export type ScoreBreakdown = {
	studyPoints: number;
	wordPoints: number;
	targetBonus: number;
	longStudyBonus: number;
	extraBonus: number;
	totalPoints: number;
	exchangeableMinutes: number;
};

export type LedgerRow = {
	record: StudyRecord;
	score: ScoreBreakdown;
	balanceBefore: number;
	balanceAfter: number;
};

export type DeletedRecord = {
	date: string;
	deletedAt: string;
};

export type BackupPayload = {
	version: 1;
	exportedAt: string;
	records: StudyRecord[];
};
