import { collectLocalRecordsToUpload, mergeRemoteRecords } from '../src/lib/study/sync';

type Record = {
	date: string;
	updatedAt: string;
	syncState?: 'synced' | 'pending' | 'local';
};

const remoteOnly = [{ date: '2026-05-15', updatedAt: '2026-05-15T08:00:00.000Z' }];
const localOnly = [
	{
		date: '2026-05-16',
		updatedAt: '2026-05-16T08:00:00.000Z',
		syncState: 'local' as const
	}
];
const staleLocal = [
	{
		date: '2026-05-15',
		updatedAt: '2026-05-15T07:00:00.000Z',
		syncState: 'local' as const
	}
];
const newerLocal = [
	{
		date: '2026-05-15',
		updatedAt: '2026-05-15T09:00:00.000Z',
		syncState: 'local' as const
	}
];

assertEqual(
	collectLocalRecordsToUpload(localOnly, remoteOnly, (record) => record.date),
	localOnly,
	'local-only records should upload'
);
assertEqual(
	collectLocalRecordsToUpload(staleLocal, remoteOnly, (record) => record.date),
	[],
	'older local records should not replace newer remote records'
);
assertEqual(
	collectLocalRecordsToUpload(newerLocal, remoteOnly, (record) => record.date),
	newerLocal,
	'newer local records should replace older remote records'
);
assertEqual(
	mergeRemoteRecords(remoteOnly, newerLocal, (record) => record.date),
	newerLocal,
	'uploaded records should replace remote records with the same date'
);

console.log('sync merge samples matched');

function assertEqual(actual: Record[], expected: Record[], message: string) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
		);
	}
}
