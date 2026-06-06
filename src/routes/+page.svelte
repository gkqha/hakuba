<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Archive,
		BadgePlus,
		BookMarked,
		BookOpen,
		Brain,
		Calculator,
		CalendarCheck,
		CalendarDays,
		ClipboardList,
		Clock3,
		Coins,
		Cloud,
		Database,
		Download,
		FileSpreadsheet,
		FileUp,
		Flame,
		Gamepad2,
		Gauge,
		HardDrive,
		History,
		ListChecks,
		NotebookPen,
		RefreshCw,
		Repeat2,
		Save,
		ScrollText,
		Server,
		ShieldCheck,
		Sparkles,
		Swords,
		Target,
		Trophy,
		Trash2
	} from 'lucide-svelte';
	import {
		deleteRemoteRecord,
		fetchRemoteRecords,
		fetchRemoteWeeklyRecords,
		saveRemoteRecord,
		saveRemoteWeeklyRecord
	} from '$lib/study/api';
	import { buildCalendarDays } from '$lib/study/calendar';
	import type { CalendarDay } from '$lib/study/calendar';
	import { exportJson, exportXlsx, readBackupFile } from '$lib/study/export';
	import { localDb } from '$lib/study/local-db';
	import {
		buildLedger,
		createDraft,
		createWeeklyDraft,
		getCurrentStreak,
		getDefaultTargetLevel,
		getMonthKey,
		getTargetProgress,
		getWeekKey,
		isRecommendedTargetComplete,
		normalizeDraft,
		normalizeWeeklyDraft,
		scoreRecord,
		sortRecordsAscending,
		sortRecordsDescending,
		toDraft,
		toRecord,
		toWeeklyDraft,
		toWeeklyRecord
	} from '$lib/study/scoring';
	import { collectLocalRecordsToUpload, mergeRemoteRecords } from '$lib/study/sync';
	import type {
		StudyRecord,
		StudyRecordDraft,
		TargetLevel,
		WeeklyRecord,
		WeeklyRecordDraft
	} from '$lib/study/types';

	type PersistStatus = 'checking' | 'granted' | 'denied' | 'unsupported';
	type NumericDraftField =
		| 'calculusMinutes'
		| 'courseMinutes'
		| 'wordCount'
		| 'chapterCount'
		| 'wordRoundCount'
		| 'manualBonus'
		| 'gameMinutes';
	type WeeklyNumericDraftField = 'recommendedDaysTarget';
	type IconComponent = typeof Coins;
	type Tone = 'mint' | 'amber' | 'coral';
	type Metric = {
		icon: IconComponent;
		label: string;
		value: string | number;
		tone?: Tone;
	};
	type DraftField<T> = {
		field: T;
		icon: IconComponent;
		label: string;
		tone?: Tone;
	};
	type MoodName = 'blank' | 'sleep' | 'work' | 'clear' | 'cap' | 'danger';
	type MoodCard = {
		icon: IconComponent;
		label: string;
		value: string;
		detail: string;
		tone: Tone;
		mood: MoodName;
	};

	const studyMinuteFields: DraftField<NumericDraftField>[] = [
		{ field: 'calculusMinutes', icon: Calculator, label: '高数分钟' },
		{ field: 'courseMinutes', icon: BookOpen, label: '专业分钟' }
	];
	const bonusFields: DraftField<NumericDraftField>[] = [
		{ field: 'chapterCount', icon: BookMarked, label: '章节' },
		{ field: 'wordRoundCount', icon: Repeat2, label: '轮背' },
		{ field: 'manualBonus', icon: BadgePlus, label: '附加' }
	];
	const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

	let records = $state<StudyRecord[]>([]);
	let weeklyRecords = $state<WeeklyRecord[]>([]);
	let draft = $state<StudyRecordDraft>(createDraft());
	let weeklyDraft = $state<WeeklyRecordDraft>(createWeeklyDraft());
	let passcode = $state('');
	let statusText = $state('读取本地账本');
	let errorText = $state('');
	let persistStatus = $state<PersistStatus>('checking');
	let isSaving = $state(false);
	let isSyncing = $state(false);
	let highlightedDate = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let highlightTimer: ReturnType<typeof setTimeout> | undefined;

	let cleanedDraft = $derived(normalizeDraft(draft));
	let previewScore = $derived(scoreRecord(cleanedDraft));
	let ledger = $derived(buildLedger(records));
	let recentRows = $derived(sortRecordsDescending(records).slice(0, 8));
	let currentBalance = $derived(ledger.at(-1)?.balanceAfter ?? 0);
	let totalStudyMinutes = $derived(
		records.reduce((sum, record) => sum + record.calculusMinutes + record.courseMinutes, 0)
	);
	let totalWords = $derived(records.reduce((sum, record) => sum + record.wordCount, 0));
	let monthKey = $derived(getMonthKey(cleanedDraft.date));
	let monthRows = $derived(ledger.filter((row) => row.record.date.startsWith(monthKey)));
	let monthPoints = $derived(monthRows.reduce((sum, row) => sum + row.score.totalPoints, 0));
	let monthExchangeableMinutes = $derived(
		monthRows.reduce((sum, row) => sum + row.score.exchangeableMinutes, 0)
	);
	let monthGameMinutes = $derived(monthRows.reduce((sum, row) => sum + row.record.gameMinutes, 0));
	let monthNetMinutes = $derived(monthExchangeableMinutes - monthGameMinutes);
	let monthStudyMinutes = $derived(
		monthRows.reduce((sum, row) => sum + row.record.calculusMinutes + row.record.courseMinutes, 0)
	);
	let monthCalculusMinutes = $derived(
		monthRows.reduce((sum, row) => sum + row.record.calculusMinutes, 0)
	);
	let monthCourseMinutes = $derived(
		monthRows.reduce((sum, row) => sum + row.record.courseMinutes, 0)
	);
	let monthWords = $derived(monthRows.reduce((sum, row) => sum + row.record.wordCount, 0));
	let monthCompletedDays = $derived(
		monthRows.filter((row) => isRecommendedTargetComplete(toDraft(row.record))).length
	);
	let monthOverdrawDays = $derived(
		monthRows.filter((row) => row.record.gameMinutes > row.score.exchangeableMinutes).length
	);
	let calendarDays = $derived(buildCalendarDays(ledger, monthKey));
	let reportDays = $derived(calendarDays.filter((day) => day.inMonth));
	let dailyBarMax = $derived(
		Math.max(1, ...reportDays.map((day) => Math.max(day.exchangeableMinutes, day.gameMinutes)))
	);
	let trendSeries = $derived(
		(() => {
			let exchange = 0;
			let game = 0;
			let balance = 0;
			return reportDays.map((day) => {
				exchange += day.exchangeableMinutes;
				game += day.gameMinutes;
				balance += day.netMinutes;
				return { date: day.date, exchange, game, balance };
			});
		})()
	);
	let trendMin = $derived(
		Math.min(0, ...trendSeries.flatMap((point) => [point.exchange, point.game, point.balance]))
	);
	let trendMax = $derived(
		Math.max(1, ...trendSeries.flatMap((point) => [point.exchange, point.game, point.balance]))
	);
	let exchangeLinePoints = $derived(
		chartPoints(
			trendSeries.map((point) => point.exchange),
			trendMin,
			trendMax
		)
	);
	let gameLinePoints = $derived(
		chartPoints(
			trendSeries.map((point) => point.game),
			trendMin,
			trendMax
		)
	);
	let balanceLinePoints = $derived(
		chartPoints(
			trendSeries.map((point) => point.balance),
			trendMin,
			trendMax
		)
	);
	let weekKey = $derived(getWeekKey(cleanedDraft.date));
	let cleanedWeeklyDraft = $derived(normalizeWeeklyDraft(weeklyDraft));
	let currentStreak = $derived(getCurrentStreak(records));
	let pendingCount = $derived(records.filter((record) => record.syncState === 'pending').length);
	let weeklyPendingCount = $derived(
		weeklyRecords.filter((record) => record.syncState === 'pending').length
	);
	let targetProgress = $derived(getTargetProgress(cleanedDraft));
	let targetProgressPercent = $derived(Math.round(targetProgress.totalProgress * 100));
	let studyProgressPercent = $derived(Math.round(targetProgress.studyProgress * 100));
	let wordProgressPercent = $derived(Math.round(targetProgress.wordProgress * 100));
	let adventureLevel = $derived(Math.max(1, Math.floor(monthPoints / 500) + 1));
	let levelBasePoints = $derived((adventureLevel - 1) * 500);
	let levelProgressPercent = $derived(
		Math.min(100, Math.round(((monthPoints - levelBasePoints) / 500) * 100))
	);
	let previewNetMinutes = $derived(previewScore.exchangeableMinutes - cleanedDraft.gameMinutes);
	let bossHpPercent = $derived(Math.max(0, 100 - targetProgressPercent));
	let adventureRank = $derived(
		targetProgressPercent >= 100 ? '通关' : targetProgressPercent >= 50 ? '破防' : '开战'
	);
	let accountMood = $derived(currentBalance >= 0 ? '可出征' : '冷却中');
	let monthTitle = $derived(formatMonthTitle(monthKey));
	let monthStudyHours = $derived(Math.round(monthStudyMinutes / 60));
	let timeDonutStyle = $derived(
		buildTimeDonut(monthCalculusMinutes, monthCourseMinutes, monthGameMinutes)
	);
	let monthCompletionRate = $derived(
		monthRows.length ? Math.round((monthCompletedDays / monthRows.length) * 100) : 0
	);
	let reportMetrics = $derived<Metric[]>([
		{ icon: Coins, label: '本月可兑换', value: `+${monthExchangeableMinutes}` },
		{ icon: Gamepad2, label: '本月游戏', value: `-${monthGameMinutes}`, tone: 'coral' },
		{
			icon: Archive,
			label: '净结转',
			value: signedNumber(monthNetMinutes),
			tone: monthNetMinutes < 0 ? 'coral' : 'mint'
		},
		{ icon: CalendarCheck, label: '推荐量完成', value: `${monthCompletedDays}天` }
	]);
	let moodCards = $derived<MoodCard[]>([
		{
			icon: Trophy,
			label: '通关',
			value: `${monthCompletedDays} 天`,
			detail: `完成率 ${monthCompletionRate}%`,
			tone: 'mint',
			mood: 'clear'
		},
		{
			icon: Flame,
			label: '连续',
			value: `${currentStreak} 天`,
			detail: `等级 LVL ${adventureLevel}`,
			tone: 'amber',
			mood: currentStreak > 0 ? 'cap' : 'sleep'
		},
		{
			icon: Gamepad2,
			label: '透支',
			value: `${monthOverdrawDays} 天`,
			detail: currentBalance >= 0 ? '账户安全' : '账户冷却',
			tone: 'coral',
			mood: monthOverdrawDays > 0 ? 'danger' : 'work'
		}
	]);
	let dashboardStats = $derived<Metric[]>([
		{ icon: Coins, label: '可兑换', value: `${previewScore.exchangeableMinutes}分` },
		{ icon: Gamepad2, label: '实际游戏', value: `-${cleanedDraft.gameMinutes}分`, tone: 'coral' },
		{
			icon: Sparkles,
			label: '净变化',
			value: `${previewNetMinutes >= 0 ? '+' : ''}${previewNetMinutes}分`,
			tone: previewNetMinutes < 0 ? 'coral' : 'mint'
		},
		{
			icon: Target,
			label: '推荐量',
			value: `${targetProgressPercent}%`,
			tone: targetProgressPercent >= 100 ? 'mint' : 'amber'
		}
	]);
	let weekRows = $derived(
		ledger.filter((row) => row.record.date >= weekKey && row.record.date < addDays(weekKey, 7))
	);
	let weekGameMinutes = $derived(weekRows.reduce((sum, row) => sum + row.record.gameMinutes, 0));
	let weekExchangeableMinutes = $derived(
		weekRows.reduce((sum, row) => sum + row.score.exchangeableMinutes, 0)
	);
	let weekRecommendedDays = $derived(
		weekRows.filter((row) => isRecommendedTargetComplete(toDraft(row.record))).length
	);
	let weeklySummaryStats = $derived<Metric[]>([
		{ icon: Coins, label: '可兑换', value: `+${weekExchangeableMinutes}` },
		{ icon: Gamepad2, label: '游戏', value: `-${weekGameMinutes}`, tone: 'coral' },
		{
			icon: CalendarCheck,
			label: '推荐量完成',
			value: cleanedWeeklyDraft.recommendedDaysTarget
				? `${weekRecommendedDays}/${cleanedWeeklyDraft.recommendedDaysTarget}天`
				: `${weekRecommendedDays}天`
		}
	]);
	let inventoryRows = $derived<Metric[]>([
		{ icon: Server, label: '主库', value: passcode ? 'Cloudflare D1' : '未连接' },
		{ icon: HardDrive, label: '本地缓存', value: 'IndexedDB' },
		{ icon: Archive, label: '记录数', value: records.length },
		{ icon: Cloud, label: '待同步', value: pendingCount + weeklyPendingCount },
		{ icon: Clock3, label: '累计学习', value: formatMinutes(totalStudyMinutes) },
		{ icon: Brain, label: '累计单词', value: totalWords }
	]);

	onMount(async () => {
		passcode = localStorage.getItem('hakuba-passcode') ?? '';
		await requestPersistentStorage();
		await loadLocalRecords();
		if (passcode) await syncRecords();
		else statusText = '本地账本已打开';
	});

	async function requestPersistentStorage() {
		if (!navigator.storage?.persist) {
			persistStatus = 'unsupported';
			return;
		}

		const persisted = await navigator.storage.persisted();
		persistStatus = persisted || (await navigator.storage.persist()) ? 'granted' : 'denied';
	}

	async function loadLocalRecords() {
		const localRecords = await localDb.records.toArray();
		const localWeeklyRecords = await localDb.weeklyRecords.toArray();
		records = sortRecordsAscending(localRecords);
		weeklyRecords = sortWeeklyRecordsAscending(localWeeklyRecords);
		const current = records.find((record) => record.date === draft.date);
		if (current) draft = withDefaultTargetLevel(toDraft(current));
		loadWeeklyDraft(draft.date);
	}

	async function refreshRecords() {
		records = sortRecordsAscending(await localDb.records.toArray());
	}

	async function refreshWeeklyRecords() {
		weeklyRecords = sortWeeklyRecordsAscending(await localDb.weeklyRecords.toArray());
	}

	async function saveLocalRecord(record: StudyRecord) {
		await localDb.records.put(record);
		await refreshRecords();
	}

	async function saveLocalWeeklyRecord(record: WeeklyRecord) {
		await localDb.weeklyRecords.put(record);
		await refreshWeeklyRecords();
	}

	async function saveRecord() {
		isSaving = true;
		errorText = '';
		const existing = records.find((record) => record.date === cleanedDraft.date);
		const localRecord = toRecord({
			...cleanedDraft,
			id: cleanedDraft.date,
			createdAt: existing?.createdAt,
			syncState: passcode ? 'pending' : 'local'
		});

		try {
			await saveLocalRecord(localRecord);
			if (passcode) {
				const remoteRecord = await saveRemoteRecord(passcode, localRecord);
				await saveLocalRecord({ ...remoteRecord, syncState: 'synced' });
				statusText = 'D1 已保存';
			} else {
				statusText = '已保存到本地';
			}
			highlightSavedDate(localRecord.date);
		} catch (error) {
			errorText = error instanceof Error ? error.message : '保存失败';
			statusText = '本地有待同步记录';
		} finally {
			isSaving = false;
		}
	}

	function highlightSavedDate(date: string) {
		highlightedDate = '';
		if (highlightTimer) clearTimeout(highlightTimer);

		requestAnimationFrame(() => {
			highlightedDate = date;
			highlightTimer = setTimeout(() => {
				highlightedDate = '';
			}, 1100);
		});
	}

	async function syncRecords() {
		if (!passcode) {
			statusText = '请输入口令';
			return;
		}

		isSyncing = true;
		errorText = '';
		localStorage.setItem('hakuba-passcode', passcode);

		try {
			const pendingRecords = await localDb.records.where('syncState').equals('pending').toArray();
			const pendingWeeklyRecords = await localDb.weeklyRecords
				.where('syncState')
				.equals('pending')
				.toArray();
			const deletions = await localDb.deletions.toArray();

			for (const record of pendingRecords) {
				const saved = await saveRemoteRecord(passcode, record);
				await localDb.records.put({ ...saved, syncState: 'synced' });
			}

			for (const record of pendingWeeklyRecords) {
				const saved = await saveRemoteWeeklyRecord(passcode, record);
				await localDb.weeklyRecords.put({ ...saved, syncState: 'synced' });
			}

			for (const deletion of deletions) {
				await deleteRemoteRecord(passcode, deletion.date);
				await localDb.deletions.delete(deletion.date);
			}

			const remoteRecords = await fetchRemoteRecords(passcode);
			const remoteWeeklyRecords = await fetchRemoteWeeklyRecords(passcode);
			const localRecords = await localDb.records.toArray();
			const localWeeklyRecords = await localDb.weeklyRecords.toArray();
			const localRecordsToUpload = collectLocalRecordsToUpload(
				localRecords,
				remoteRecords,
				(record) => record.date
			);
			const localWeeklyRecordsToUpload = collectLocalRecordsToUpload(
				localWeeklyRecords,
				remoteWeeklyRecords,
				(record) => record.weekKey
			);
			const uploadedRecords = await Promise.all(
				localRecordsToUpload.map((record) => saveRemoteRecord(passcode, record))
			);
			const uploadedWeeklyRecords = await Promise.all(
				localWeeklyRecordsToUpload.map((record) => saveRemoteWeeklyRecord(passcode, record))
			);
			const mergedRemoteRecords = mergeRemoteRecords(
				remoteRecords,
				uploadedRecords,
				(record) => record.date
			);
			const mergedRemoteWeeklyRecords = mergeRemoteRecords(
				remoteWeeklyRecords,
				uploadedWeeklyRecords,
				(record) => record.weekKey
			);
			await localDb.records.clear();
			await localDb.records.bulkPut(
				mergedRemoteRecords.map((record) => ({ ...record, syncState: 'synced' }))
			);
			await localDb.weeklyRecords.clear();
			await localDb.weeklyRecords.bulkPut(
				mergedRemoteWeeklyRecords.map((record) => ({ ...record, syncState: 'synced' }))
			);
			await refreshRecords();
			await refreshWeeklyRecords();
			loadWeeklyDraft(cleanedDraft.date);
			statusText = 'D1 已同步';
		} catch (error) {
			errorText = error instanceof Error ? error.message : '同步失败';
			statusText = '离线账本可用';
		} finally {
			isSyncing = false;
		}
	}

	function selectDate(date: string) {
		const existing = records.find((record) => record.date === date);
		draft = existing ? withDefaultTargetLevel(toDraft(existing)) : createDraft(date);
		loadWeeklyDraft(date);
	}

	function loadWeeklyDraft(date: string) {
		const nextWeekKey = getWeekKey(date);
		const existing = weeklyRecords.find((record) => record.weekKey === nextWeekKey);
		weeklyDraft = existing ? toWeeklyDraft(existing) : createWeeklyDraft(date);
	}

	function withDefaultTargetLevel(record: StudyRecordDraft): StudyRecordDraft {
		return record.targetLevel === 0
			? { ...record, targetLevel: getDefaultTargetLevel(record.date) }
			: record;
	}

	function setTargetLevel(targetLevel: TargetLevel) {
		draft.targetLevel = targetLevel;
	}

	function numberInputValue(value: number) {
		return value === 0 ? '' : String(value);
	}

	function setDraftNumber(field: NumericDraftField, event: Event) {
		draft[field] = eventNumber(event);
	}

	function setWeeklyDraftNumber(field: WeeklyNumericDraftField, event: Event) {
		weeklyDraft[field] = eventNumber(event);
	}

	function eventNumber(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		return value === '' ? 0 : Number(value);
	}

	function sortWeeklyRecordsAscending(records: WeeklyRecord[]) {
		return [...records].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
	}

	function addDays(dateString: string, days: number) {
		const date = new Date(new Date(`${dateString}T00:00:00`).getTime() + days * 86_400_000);
		const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
		return localDate.toISOString().slice(0, 10);
	}

	async function saveWeeklyRecord() {
		errorText = '';
		const existing = weeklyRecords.find((record) => record.weekKey === cleanedWeeklyDraft.weekKey);
		const localRecord = toWeeklyRecord({
			...cleanedWeeklyDraft,
			createdAt: existing?.createdAt,
			syncState: passcode ? 'pending' : 'local'
		});

		try {
			await saveLocalWeeklyRecord(localRecord);
			if (passcode) {
				const remoteRecord = await saveRemoteWeeklyRecord(passcode, localRecord);
				await saveLocalWeeklyRecord({ ...remoteRecord, syncState: 'synced' });
				statusText = '周记录已保存到 D1';
			} else {
				statusText = '周记录已保存到本地';
			}
		} catch (error) {
			errorText = error instanceof Error ? error.message : '周记录保存失败';
			statusText = '周记录待同步';
		}
	}

	async function deleteSelectedRecord() {
		const date = cleanedDraft.date;
		await localDb.records.delete(date);
		if (passcode) {
			await localDb.deletions.put({ date, deletedAt: new Date().toISOString() });
			try {
				await deleteRemoteRecord(passcode, date);
				await localDb.deletions.delete(date);
				statusText = '记录已删除';
			} catch {
				statusText = '删除已记入待同步';
			}
		}
		await refreshRecords();
		draft = createDraft(date);
	}

	async function importBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		errorText = '';
		try {
			const imported = await readBackupFile(file);
			const nextRecords = imported.records.map((record) =>
				toRecord({ ...record, syncState: passcode ? 'pending' : 'local' })
			);
			const nextWeeklyRecords = imported.weeklyRecords.map((record) =>
				toWeeklyRecord({ ...record, syncState: passcode ? 'pending' : 'local' })
			);
			await localDb.records.bulkPut(nextRecords);
			if (nextWeeklyRecords.length > 0) await localDb.weeklyRecords.bulkPut(nextWeeklyRecords);
			await refreshRecords();
			await refreshWeeklyRecords();
			loadWeeklyDraft(cleanedDraft.date);
			statusText = passcode ? '备份已导入，等待同步' : '备份已导入本地';
			if (passcode) await syncRecords();
		} catch (error) {
			errorText = error instanceof Error ? error.message : '导入失败';
		} finally {
			input.value = '';
		}
	}

	function formatMinutes(minutes: number) {
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		if (hours === 0) return `${rest}分`;
		return rest === 0 ? `${hours}时` : `${hours}时${rest}分`;
	}

	function formatWeekRange(weekStart: string) {
		return `${weekStart} 至 ${addDays(weekStart, 6)}`;
	}

	function formatMonthTitle(monthKey: string) {
		const [year, month] = monthKey.split('-');
		return `${year} 年 ${Number(month)} 月`;
	}

	function shortDate(date: string) {
		const [, month, day] = date.split('-');
		return `${Number(month)}/${Number(day)}`;
	}

	function signedNumber(value: number) {
		return `${value >= 0 ? '+' : ''}${value}`;
	}

	function barHeight(value: number, max: number) {
		return `${Math.max(3, Math.round((value / max) * 100))}%`;
	}

	function dayMood(day: CalendarDay): MoodName {
		if (!day.inMonth) return 'blank';
		if (!day.hasRecord) return 'sleep';
		if (day.gameMinutes > day.exchangeableMinutes) return 'danger';
		if (day.exchangeableMinutes >= 220) return 'cap';
		if (day.exchangeableMinutes > 0) return 'clear';
		return 'work';
	}

	function dayMoodLabel(day: CalendarDay) {
		if (!day.inMonth) return '';
		if (!day.hasRecord) return `${day.date} 未记录`;
		if (day.gameMinutes > day.exchangeableMinutes) return `${day.date} 游戏超支`;
		if (day.exchangeableMinutes >= 220) return `${day.date} 满额通关`;
		if (day.exchangeableMinutes > 0) return `${day.date} 已获得 ${day.exchangeableMinutes} 分`;
		return `${day.date} 记录中`;
	}

	function chartPoints(values: number[], min: number, max: number, width = 300, height = 170) {
		const span = max - min || 1;
		const lastIndex = Math.max(values.length - 1, 1);
		return values
			.map((value, index) => {
				const x = (index / lastIndex) * width;
				const y = height - ((value - min) / span) * height;
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	function buildTimeDonut(calculusMinutes: number, courseMinutes: number, gameMinutes: number) {
		const total = Math.max(1, calculusMinutes + courseMinutes + gameMinutes);
		const calculusDeg = (calculusMinutes / total) * 360;
		const courseDeg = calculusDeg + (courseMinutes / total) * 360;
		return `background: conic-gradient(
			oklch(0.72 0.13 166) 0deg ${calculusDeg}deg,
			oklch(0.79 0.15 84) ${calculusDeg}deg ${courseDeg}deg,
			oklch(0.68 0.17 38) ${courseDeg}deg 360deg
		);`;
	}
</script>

<svelte:head>
	<title>Hakuba 学习冒险月报</title>
	<meta
		name="description"
		content="个人学习积分账本，使用 Cloudflare D1 持久化保存，支持本地缓存和 Excel 导出。"
	/>
</svelte:head>

{#snippet moodFace(mood: MoodName, label = '')}
	<span class={['mood-face', `mood-${mood}`]} aria-label={label} title={label}>
		<i></i>
	</span>
{/snippet}

{#snippet reportMetric(metric: Metric)}
	{@const Icon = metric.icon}
	<div class={['report-metric', metric.tone ? `tone-${metric.tone}` : '']}>
		<p>
			<Icon size={15} />
			{metric.label}
		</p>
		<strong class="ink-numbers">{metric.value}</strong>
	</div>
{/snippet}

{#snippet moodCard(card: MoodCard)}
	{@const Icon = card.icon}
	<div class={['mood-card', `tone-${card.tone}`]}>
		<div class="mood-card-head">
			<div>
				<p>
					<Icon size={16} />
					{card.label}
				</p>
				<strong class="ink-numbers">{card.value}</strong>
				<span>{card.detail}</span>
			</div>
			{@render moodFace(card.mood, card.label)}
		</div>
	</div>
{/snippet}

{#snippet numberField(field: DraftField<NumericDraftField>)}
	{@const Icon = field.icon}
	<label class="battle-field">
		<span>
			<Icon size={15} />
			{field.label}
		</span>
		<input
			class={['battle-input', field.tone === 'coral' ? 'battle-input-coral' : '']}
			type="number"
			min="0"
			value={numberInputValue(draft[field.field])}
			oninput={(event) => setDraftNumber(field.field, event)}
		/>
	</label>
{/snippet}

{#snippet weeklyNumberField(field: DraftField<WeeklyNumericDraftField>)}
	{@const Icon = field.icon}
	<label class="battle-field">
		<span>
			<Icon size={15} />
			{field.label}
		</span>
		<input
			class="battle-input"
			type="number"
			min="0"
			max="7"
			value={numberInputValue(weeklyDraft[field.field])}
			oninput={(event) => setWeeklyDraftNumber(field.field, event)}
		/>
	</label>
{/snippet}

<main id="main-content" class="report-shell">
	<div class="report-grid">
		<section class="month-report" aria-label="月度冒险报告">
			<header class="report-hero">
				<div>
					<p class="brand-line">
						<NotebookPen size={18} />
						Hakuba adventure report
					</p>
					<h1>学习冒险月报</h1>
					<div class="color-bars" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
				</div>
				<div class="level-chip">
					<Trophy size={16} />
					LVL {adventureLevel}
				</div>
				<p class="month-title">{monthTitle}</p>
				<div class="level-track" aria-label={`本级经验进度 ${levelProgressPercent}%`}>
					<span style={`width: ${levelProgressPercent}%;`}></span>
				</div>
			</header>

			<section class="report-card calendar-card">
				<div class="report-section-title">
					<p>
						<CalendarDays size={16} />
						本月状态格
					</p>
					<span>{monthCompletedDays} 天通关</span>
				</div>
				<div class="weekday-row">
					{#each weekdays as weekday (weekday)}
						<span>{weekday}</span>
					{/each}
				</div>
				<div class="mood-calendar">
					{#each calendarDays as day (day.date)}
						<button
							class={[
								'mood-day',
								day.inMonth ? '' : 'is-outside',
								day.date === cleanedDraft.date ? 'is-selected' : '',
								day.date === highlightedDate ? 'saved-day-pulse' : ''
							]}
							type="button"
							disabled={!day.inMonth}
							aria-label={dayMoodLabel(day)}
							onclick={() => selectDate(day.date)}
						>
							{@render moodFace(dayMood(day), dayMoodLabel(day))}
							<span class="ink-numbers">{day.day}</span>
						</button>
					{/each}
				</div>
			</section>

			<div class="report-strip">
				<Flame size={16} />
				累计签到 {records.length} 日，连续签到 {currentStreak} 日
			</div>
			<div class="report-strip">
				<Target size={16} />
				本月获得 {monthCompletedDays} 次推荐量完成，累计单词 {monthWords}
			</div>

			<section class="report-card">
				<div class="report-section-title">
					<p>
						<Coins size={16} />
						每日兑换与游戏
					</p>
					<span class="ink-numbers">MAX {dailyBarMax}</span>
				</div>
				<div class="daily-bars" style={`--days: ${reportDays.length};`}>
					{#each reportDays as day (day.date)}
						<div
							class="bar-column"
							title={`${shortDate(day.date)} +${day.exchangeableMinutes} -${day.gameMinutes}`}
						>
							<div class="bar-track">
								<span
									class="bar-fill bar-earned"
									style={`height: ${barHeight(day.exchangeableMinutes, dailyBarMax)};`}
								></span>
								<span
									class="bar-fill bar-game"
									style={`height: ${barHeight(day.gameMinutes, dailyBarMax)};`}
								></span>
							</div>
							<span class="ink-numbers">
								{day.day === 1 || day.day % 5 === 0 || day.day === reportDays.length ? day.day : ''}
							</span>
						</div>
					{/each}
				</div>
				<div class="chart-legend">
					<span><i class="legend-earned"></i>可兑换</span>
					<span><i class="legend-game"></i>实际游戏</span>
				</div>
			</section>

			{#each reportMetrics as metric (metric.label)}
				{@const Icon = metric.icon}
				<div class="report-strip metric-strip">
					<Icon size={16} />
					{metric.label} <strong class="ink-numbers">{metric.value}</strong>
				</div>
			{/each}

			<section class="report-card">
				<div class="report-section-title">
					<p>
						<Gauge size={16} />
						累计趋势
					</p>
					<span>{monthRows.length} 条记录</span>
				</div>
				<svg class="trend-chart" viewBox="0 0 300 190" role="img" aria-label="本月累计趋势">
					<line x1="0" y1="170" x2="300" y2="170"></line>
					<line x1="0" y1="113" x2="300" y2="113"></line>
					<line x1="0" y1="56" x2="300" y2="56"></line>
					<polyline class="line-earned" points={exchangeLinePoints}></polyline>
					<polyline class="line-game" points={gameLinePoints}></polyline>
					<polyline class="line-balance" points={balanceLinePoints}></polyline>
				</svg>
				<div class="chart-legend stacked">
					<span><i class="legend-earned"></i>累计可兑换 {monthExchangeableMinutes}</span>
					<span><i class="legend-game"></i>累计游戏 {monthGameMinutes}</span>
					<span><i class="legend-balance"></i>累计结转 {monthNetMinutes}</span>
				</div>
			</section>

			<div class="mood-card-grid">
				{#each moodCards as card (card.label)}
					{@render moodCard(card)}
				{/each}
			</div>

			<section class="report-card donut-card">
				<div class="time-donut" style={timeDonutStyle}>
					<span></span>
				</div>
				<div class="donut-legend">
					<p><i class="legend-earned"></i>高数 {formatMinutes(monthCalculusMinutes)}</p>
					<p><i class="legend-amber"></i>专业 {formatMinutes(monthCourseMinutes)}</p>
					<p><i class="legend-game"></i>游戏 {formatMinutes(monthGameMinutes)}</p>
				</div>
			</section>

			<div class="report-strip">
				<Clock3 size={16} />
				本月学习时长 {formatMinutes(monthStudyMinutes)}，约 {monthStudyHours} 小时
			</div>

			<footer class="report-mascot" aria-hidden="true">
				<div class="heart-card"><span></span></div>
				<div class="mascot-body">
					<span class="mascot-eye"></span>
					<span class="mascot-mark"></span>
				</div>
			</footer>
		</section>

		<section class="battle-console" aria-label="学习账本操作区">
			<div class="console-head">
				<div>
					<p class="brand-line">
						<Swords size={18} />
						Today battle
					</p>
					<h2>今日结算台</h2>
				</div>
				<div class={['account-pill', currentBalance >= 0 ? 'is-safe' : 'is-cooldown']}>
					<Gamepad2 size={16} />
					{accountMood}
					{currentBalance}分
				</div>
			</div>

			<section class="sync-card">
				<label>
					<span>
						<Cloud size={15} />
						D1 口令
					</span>
					<input
						class="battle-input"
						type="password"
						autocomplete="current-password"
						bind:value={passcode}
					/>
				</label>
				<button class="primary-button" type="button" disabled={isSyncing} onclick={syncRecords}>
					<RefreshCw size={17} class={isSyncing ? 'animate-spin' : ''} />
					同步
				</button>
				<p>
					{#if passcode}
						<Cloud size={14} /> {statusText}
					{:else}
						<Database size={14} /> 本地账本
					{/if}
				</p>
			</section>

			{#if errorText}
				<p class="error-banner">{errorText}</p>
			{/if}

			<form class="console-panel" onsubmit={(event) => event.preventDefault()}>
				<div class="panel-title">
					<p>
						<ClipboardList size={17} />
						每日记录
					</p>
					<span class="score-bubble">+{previewScore.totalPoints}</span>
				</div>

				<label class="battle-field">
					<span>
						<CalendarCheck size={15} />
						日期
					</span>
					<input
						class="battle-input"
						type="date"
						value={draft.date}
						onchange={(event) => selectDate((event.currentTarget as HTMLInputElement).value)}
					/>
				</label>

				<div class="target-toggle" aria-label="推荐量规则">
					<label class={cleanedDraft.targetLevel === 1 ? 'is-active' : ''}>
						<input
							class="sr-only"
							type="radio"
							name="target-level"
							checked={cleanedDraft.targetLevel === 1}
							onchange={() => setTargetLevel(1)}
						/>
						工作日
					</label>
					<label class={cleanedDraft.targetLevel === 2 ? 'is-active is-weekend' : ''}>
						<input
							class="sr-only"
							type="radio"
							name="target-level"
							checked={cleanedDraft.targetLevel === 2}
							onchange={() => setTargetLevel(2)}
						/>
						周末
					</label>
				</div>

				<div class="field-grid two">
					{#each studyMinuteFields as field (field.field)}
						{@render numberField(field)}
					{/each}
				</div>

				{@render numberField({ field: 'wordCount', icon: Brain, label: '单词数' })}

				<div class="field-grid three">
					{#each bonusFields as field (field.field)}
						{@render numberField(field)}
					{/each}
				</div>

				{@render numberField({
					field: 'gameMinutes',
					icon: Gamepad2,
					label: '实际游戏',
					tone: 'coral'
				})}

				<label class="battle-field">
					<span>
						<ScrollText size={15} />
						备注
					</span>
					<textarea class="battle-textarea" bind:value={draft.note}></textarea>
				</label>

				<div class="action-row">
					<button class="primary-button" type="button" disabled={isSaving} onclick={saveRecord}>
						<Save size={17} />
						结算今日
					</button>
					<button
						class="danger-button"
						type="button"
						aria-label="删除当天记录"
						onclick={deleteSelectedRecord}
					>
						<Trash2 size={17} />
					</button>
				</div>
			</form>

			<section class="console-panel">
				<div class="panel-title">
					<p>
						<Target size={17} />
						拖延怪 HP
					</p>
					<span class="score-bubble">{adventureRank} {bossHpPercent}%</span>
				</div>
				<div class="boss-bar">
					<span class="boss-fill" style={`width: ${bossHpPercent}%;`}></span>
					<span class="clear-fill" style={`width: ${targetProgressPercent}%;`}></span>
				</div>
				<div class="sub-progress">
					<span
						>学习 {targetProgress.studyMinutes}/{targetProgress.requirements.studyMinutes} 分 · {studyProgressPercent}%</span
					>
					<span
						>单词 {cleanedDraft.wordCount}/{targetProgress.requirements.wordCount} · {wordProgressPercent}%</span
					>
				</div>
				<div class="metric-grid">
					{#each dashboardStats as stat (stat.label)}
						{@render reportMetric(stat)}
					{/each}
				</div>
			</section>

			<section class="console-panel">
				<div class="panel-title">
					<p>
						<ClipboardList size={17} />
						本周作战
					</p>
					<span>{formatWeekRange(cleanedWeeklyDraft.weekStart)}</span>
				</div>
				<div class="week-layout">
					<div class="week-box">
						<p class="week-box-title">
							<ListChecks size={16} />
							周计划
						</p>
						{@render weeklyNumberField({
							field: 'recommendedDaysTarget',
							icon: CalendarCheck,
							label: '预计推荐量完成天数'
						})}
						<label class="battle-field">
							<span>
								<ScrollText size={15} />
								计划备注
							</span>
							<textarea class="battle-textarea" bind:value={weeklyDraft.planNote}></textarea>
						</label>
					</div>
					<div class="week-box">
						<p class="week-box-title">
							<History size={16} />
							周复盘
							<span>{weekRecommendedDays}/7 天</span>
						</p>
						<div class="metric-grid compact">
							{#each weeklySummaryStats as stat (stat.label)}
								{@render reportMetric(stat)}
							{/each}
						</div>
						<label class="battle-field">
							<span>
								<ScrollText size={15} />
								复盘
							</span>
							<textarea class="battle-textarea" bind:value={weeklyDraft.reviewNote}></textarea>
						</label>
					</div>
				</div>
				<button class="primary-button full" type="button" onclick={saveWeeklyRecord}>
					<Save size={17} />
					保存周计划和复盘
				</button>
			</section>

			<section class="console-panel">
				<div class="panel-title">
					<p>
						<ShieldCheck size={17} />
						冒险背包
					</p>
					<span>
						{persistStatus === 'granted'
							? '持久化'
							: persistStatus === 'denied'
								? '需备份'
								: persistStatus === 'unsupported'
									? '浏览器缓存'
									: '检查中'}
					</span>
				</div>
				<div class="export-row">
					<button class="secondary-button" type="button" onclick={() => exportXlsx(records)}>
						<FileSpreadsheet size={16} />
						Excel
					</button>
					<button
						class="secondary-button"
						type="button"
						onclick={() => exportJson(records, weeklyRecords)}
					>
						<Download size={16} />
						备份
					</button>
					<button class="secondary-button" type="button" onclick={() => fileInput?.click()}>
						<FileUp size={16} />
						导入
					</button>
					<input
						class="hidden"
						type="file"
						accept="application/json,.json"
						bind:this={fileInput}
						onchange={importBackup}
					/>
				</div>
				<div class="inventory-grid">
					{#each inventoryRows as row (row.label)}
						{@render reportMetric(row)}
					{/each}
				</div>
			</section>

			<section class="console-panel">
				<div class="panel-title">
					<p>
						<History size={17} />
						历史流水
					</p>
					<span>最近 8 条</span>
				</div>
				<div class="log-list">
					{#each recentRows as record (record.date)}
						{@const row = ledger.find((item) => item.record.date === record.date)}
						<button class="log-row" type="button" onclick={() => selectDate(record.date)}>
							<span class="ink-numbers log-date">{record.date}</span>
							<span>
								<BookOpen size={13} />
								{record.calculusMinutes + record.courseMinutes}
							</span>
							<span>
								<Brain size={13} />
								{record.wordCount}
							</span>
							<strong class="ink-numbers">+{row?.score.exchangeableMinutes ?? 0}</strong>
							<em class="ink-numbers">-{record.gameMinutes}</em>
							<p>{record.note || '无备注'}</p>
						</button>
					{/each}
					{#if recentRows.length === 0}
						<p class="empty-state">还没有记录</p>
					{/if}
				</div>
			</section>
		</section>
	</div>
</main>
