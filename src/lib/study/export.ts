import * as XLSX from 'xlsx';
import {
	buildLedger,
	scoreRecord,
	sortRecordsAscending,
	todayInputValue,
	toApiRecord,
	toApiWeeklyRecord,
	toDraft
} from './scoring';
import type { BackupPayload, StudyRecord, WeeklyRecord } from './types';

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function exportJson(records: StudyRecord[], weeklyRecords: WeeklyRecord[] = []) {
	const payload: BackupPayload = {
		version: 3,
		exportedAt: new Date().toISOString(),
		records: sortRecordsAscending(records).map(toApiRecord),
		weeklyRecords: [...weeklyRecords]
			.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
			.map(toApiWeeklyRecord)
	};
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	downloadBlob(blob, `hakuba-backup-${todayInputValue()}.json`);
}

export function exportXlsx(records: StudyRecord[]) {
	const ledger = buildLedger(records);
	const rows = ledger.map((row) => ({
		日期: row.record.date,
		高数时长分钟: row.record.calculusMinutes,
		专业课政治英语时长分钟: row.record.courseMinutes,
		背单词数量: row.record.wordCount,
		推荐完成: row.record.targetLevel,
		章节附加次数: row.record.chapterCount,
		单词轮次附加次数: row.record.wordRoundCount,
		手动附加分: row.record.manualBonus,
		当日总积分: row.score.totalPoints,
		可兑换游戏分钟: row.score.exchangeableMinutes,
		实际游戏分钟: row.record.gameMinutes,
		结转积分: row.balanceAfter,
		备注: row.record.note
	}));

	const summary = sortRecordsAscending(records).map((record) => {
		const score = scoreRecord(toDraft(record));
		return {
			日期: record.date,
			学习积分: score.studyPoints,
			单词积分: score.wordPoints,
			推荐奖励: score.targetBonus,
			长时奖励: score.longStudyBonus,
			附加分: score.extraBonus
		};
	});

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '学习记录');
	XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), '积分拆分');
	XLSX.writeFile(workbook, `hakuba-study-${todayInputValue()}.xlsx`, { compression: true });
}

export async function readBackupFile(file: File) {
	const text = await file.text();
	const payload = JSON.parse(text) as Partial<BackupPayload>;
	if (
		(payload.version !== 1 && payload.version !== 2 && payload.version !== 3) ||
		!Array.isArray(payload.records)
	) {
		throw new Error('备份文件格式不匹配');
	}
	return {
		records: payload.records,
		weeklyRecords: Array.isArray(payload.weeklyRecords) ? payload.weeklyRecords : []
	};
}
