import type { LedgerRow } from './types';

export type CalendarDay = {
	date: string;
	day: number;
	inMonth: boolean;
	totalPoints: number;
	gameMinutes: number;
	balanceAfter: number | null;
	hasRecord: boolean;
};

function toDateInputValue(date: Date) {
	const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return localDate.toISOString().slice(0, 10);
}

export function buildCalendarDays(ledger: LedgerRow[], monthKey: string): CalendarDay[] {
	const rowsByDate = new Map(ledger.map((row) => [row.record.date, row]));
	const firstDay = new Date(`${monthKey}-01T00:00:00`);
	const start = new Date(firstDay);
	const mondayOffset = (firstDay.getDay() + 6) % 7;
	start.setDate(firstDay.getDate() - mondayOffset);

	const days: CalendarDay[] = [];
	for (let index = 0; index < 42; index += 1) {
		const cursor = new Date(start);
		cursor.setDate(start.getDate() + index);
		const date = toDateInputValue(cursor);
		const row = rowsByDate.get(date);

		days.push({
			date,
			day: cursor.getDate(),
			inMonth: date.startsWith(monthKey),
			totalPoints: row?.score.totalPoints ?? 0,
			gameMinutes: row?.record.gameMinutes ?? 0,
			balanceAfter: row?.balanceAfter ?? null,
			hasRecord: Boolean(row)
		});
	}

	return days;
}
