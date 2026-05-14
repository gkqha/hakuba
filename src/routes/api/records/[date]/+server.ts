import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authorize, getDatabase } from '$lib/server/auth';
import { deleteRecord } from '$lib/server/study-records';

export const DELETE: RequestHandler = async (event) => {
	const authFailure = authorize(event);
	if (authFailure) return authFailure;

	const db = getDatabase(event);
	if (!db) return json({ message: 'D1 binding DB is not configured' }, { status: 503 });

	await deleteRecord(db, event.params.date);
	return json({ ok: true });
};
