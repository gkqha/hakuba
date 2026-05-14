import { buildLedger, scoreRecord } from '../src/lib/study/scoring';
import type { StudyRecord } from '../src/lib/study/types';

const timestamp = '2026-05-14T00:00:00.000Z';

const records: StudyRecord[] = [
	{
		id: '2026-05-14',
		date: '2026-05-14',
		calculusMinutes: 90,
		courseMinutes: 60,
		wordCount: 100,
		targetLevel: 1,
		chapterCount: 0,
		wordRoundCount: 0,
		manualBonus: 0,
		gameMinutes: 60,
		note: '',
		createdAt: timestamp,
		updatedAt: timestamp
	},
	{
		id: '2026-05-15',
		date: '2026-05-15',
		calculusMinutes: 70,
		courseMinutes: 0,
		wordCount: 150,
		targetLevel: 0,
		chapterCount: 0,
		wordRoundCount: 0,
		manualBonus: 0,
		gameMinutes: 80,
		note: '',
		createdAt: timestamp,
		updatedAt: timestamp
	},
	{
		id: '2026-05-16',
		date: '2026-05-16',
		calculusMinutes: 120,
		courseMinutes: 0,
		wordCount: 150,
		targetLevel: 1,
		chapterCount: 0,
		wordRoundCount: 0,
		manualBonus: 0,
		gameMinutes: 120,
		note: '',
		createdAt: timestamp,
		updatedAt: timestamp
	},
	{
		id: '2026-05-17',
		date: '2026-05-17',
		calculusMinutes: 300,
		courseMinutes: 0,
		wordCount: 200,
		targetLevel: 2,
		chapterCount: 0,
		wordRoundCount: 0,
		manualBonus: 0,
		gameMinutes: 180,
		note: '',
		createdAt: timestamp,
		updatedAt: timestamp
	}
];

const expected = new Map([
	['2026-05-14', { totalPoints: 95, exchangeableMinutes: 95, balanceAfter: 35 }],
	['2026-05-15', { totalPoints: 45, exchangeableMinutes: 45, balanceAfter: 0 }],
	['2026-05-16', { totalPoints: 85, exchangeableMinutes: 85, balanceAfter: -35 }],
	['2026-05-17', { totalPoints: 210, exchangeableMinutes: 210, balanceAfter: -5 }]
]);

for (const record of records) {
	const score = scoreRecord(record);
	const target = expected.get(record.date);
	if (!target) throw new Error(`Missing expectation for ${record.date}`);

	if (
		score.totalPoints !== target.totalPoints ||
		score.exchangeableMinutes !== target.exchangeableMinutes
	) {
		throw new Error(
			`${record.date} expected total/exchange ${target.totalPoints}/${target.exchangeableMinutes}, got ${score.totalPoints}/${score.exchangeableMinutes}`
		);
	}
}

for (const row of buildLedger(records)) {
	const target = expected.get(row.record.date);
	if (!target) throw new Error(`Missing expectation for ${row.record.date}`);
	if (row.balanceAfter !== target.balanceAfter) {
		throw new Error(
			`${row.record.date} expected balance ${target.balanceAfter}, got ${row.balanceAfter}`
		);
	}
}

console.log('ref.xls scoring samples matched');
