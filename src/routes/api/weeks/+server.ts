import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize, getDatabase } from '$lib/server/auth';
import { listWeeklyRecords, upsertWeeklyRecord } from '$lib/server/weekly-records';
import type { WeeklyRecord } from '$lib/study/types';

export const GET: RequestHandler = async (event) => {
	const authFailure = authorize(event);
	if (authFailure) return authFailure;

	const db = getDatabase(event);
	if (!db) return json({ message: 'D1 binding DB is not configured' }, { status: 503 });

	const weeklyRecords = await listWeeklyRecords(db);
	return json({ weeklyRecords });
};

export const POST: RequestHandler = async (event) => {
	const authFailure = authorize(event);
	if (authFailure) return authFailure;

	const db = getDatabase(event);
	if (!db) return json({ message: 'D1 binding DB is not configured' }, { status: 503 });

	const payload = (await event.request.json()) as Partial<WeeklyRecord>;
	const weeklyRecord = await upsertWeeklyRecord(db, payload);
	return json({ weeklyRecord });
};
