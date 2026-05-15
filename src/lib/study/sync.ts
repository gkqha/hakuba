type UpdatedRecord = {
	updatedAt: string;
	syncState?: 'synced' | 'pending' | 'local';
};

export function collectLocalRecordsToUpload<T extends UpdatedRecord, K>(
	localRecords: T[],
	remoteRecords: T[],
	getKey: (record: T) => K
) {
	const remoteByKey = new Map(remoteRecords.map((record) => [getKey(record), record]));

	return localRecords.filter((record) => {
		if (record.syncState !== 'local') return false;

		const remoteRecord = remoteByKey.get(getKey(record));
		return !remoteRecord || record.updatedAt > remoteRecord.updatedAt;
	});
}

export function mergeRemoteRecords<T, K>(
	remoteRecords: T[],
	uploadedRecords: T[],
	getKey: (record: T) => K
) {
	const merged = new Map(remoteRecords.map((record) => [getKey(record), record]));
	for (const record of uploadedRecords) merged.set(getKey(record), record);
	return [...merged.values()];
}
