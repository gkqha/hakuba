import Dexie, { type Table } from 'dexie';
import type { DeletedRecord, StudyRecord, WeeklyRecord } from './types';

class HakubaDatabase extends Dexie {
	records!: Table<StudyRecord, string>;
	weeklyRecords!: Table<WeeklyRecord, string>;
	deletions!: Table<DeletedRecord, string>;

	constructor() {
		super('hakuba-study');
		this.version(1).stores({
			records: 'id, date, updatedAt, syncState',
			deletions: 'date, deletedAt'
		});
		this.version(2).stores({
			records: 'id, date, updatedAt, syncState',
			weeklyRecords: 'id, weekKey, weekStart, updatedAt, syncState',
			deletions: 'date, deletedAt'
		});
	}
}

export const localDb = new HakubaDatabase();
