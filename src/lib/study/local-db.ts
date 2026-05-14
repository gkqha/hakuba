import Dexie, { type Table } from 'dexie';
import type { DeletedRecord, StudyRecord } from './types';

class HakubaDatabase extends Dexie {
	records!: Table<StudyRecord, string>;
	deletions!: Table<DeletedRecord, string>;

	constructor() {
		super('hakuba-study');
		this.version(1).stores({
			records: 'id, date, updatedAt, syncState',
			deletions: 'date, deletedAt'
		});
	}
}

export const localDb = new HakubaDatabase();
