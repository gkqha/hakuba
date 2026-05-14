import { json, type RequestEvent } from '@sveltejs/kit';

const passcodeHeader = 'x-hakuba-passcode';

export function authorize(event: RequestEvent) {
	const expected = event.platform?.env.APP_PASSCODE;
	if (!expected) {
		return json({ message: 'Cloudflare secret APP_PASSCODE is not configured' }, { status: 503 });
	}

	const provided = event.request.headers.get(passcodeHeader);
	if (!provided || provided !== expected) {
		return json({ message: '口令不正确' }, { status: 401 });
	}

	return null;
}

export function getDatabase(event: RequestEvent) {
	const db = event.platform?.env.DB;
	if (!db) {
		return null;
	}
	return db;
}
