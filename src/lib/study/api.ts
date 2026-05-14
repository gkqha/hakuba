import type { StudyRecord } from './types';

const passcodeHeader = 'x-hakuba-passcode';

async function parseResponse<T>(response: Response): Promise<T> {
	const body = (await response.json().catch(() => ({}))) as { message?: unknown };
	if (!response.ok) {
		throw new Error(typeof body.message === 'string' ? body.message : '请求失败');
	}
	return body as T;
}

export async function fetchRemoteRecords(passcode: string) {
	const response = await fetch('/api/records', {
		headers: { [passcodeHeader]: passcode }
	});
	const body = await parseResponse<{ records: StudyRecord[] }>(response);
	return body.records;
}

export async function saveRemoteRecord(passcode: string, record: StudyRecord) {
	const response = await fetch('/api/records', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			[passcodeHeader]: passcode
		},
		body: JSON.stringify(record)
	});
	const body = await parseResponse<{ record: StudyRecord }>(response);
	return body.record;
}

export async function deleteRemoteRecord(passcode: string, date: string) {
	const response = await fetch(`/api/records/${encodeURIComponent(date)}`, {
		method: 'DELETE',
		headers: { [passcodeHeader]: passcode }
	});
	await parseResponse<{ ok: true }>(response);
}
