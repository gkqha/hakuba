import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize, getDatabase } from '$lib/server/auth';
import { listRecords, upsertRecord } from '$lib/server/study-records';
import type { StudyRecord } from '$lib/study/types';

export const GET: RequestHandler = async (event) => {
	const authFailure = authorize(event);
	if (authFailure) return authFailure;

	const db = getDatabase(event);
	if (!db) return json({ message: 'D1 binding DB is not configured' }, { status: 503 });

	const records = await listRecords(db);
	return json({ records });
};

export const POST: RequestHandler = async (event) => {
	const authFailure = authorize(event);
	if (authFailure) return authFailure;

	const db = getDatabase(event);
	if (!db) return json({ message: 'D1 binding DB is not configured' }, { status: 503 });

	const payload = (await event.request.json()) as Partial<StudyRecord>;
	const record = await upsertRecord(db, payload);
	return json({ record });
};
