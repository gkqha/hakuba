<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Archive,
		BadgePlus,
		BookMarked,
		BookOpen,
		Brain,
		Calculator,
		CalendarDays,
		CalendarCheck,
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
	type WeeklyNumericDraftField = 'studyMinutesTarget' | 'wordCountTarget' | 'gameMinutesBudget';
	type IconComponent = typeof Coins;
	type Tone = 'default' | 'red';
	type StatCard = {
		icon: IconComponent;
		label: string;
		value: string | number;
		tone?: Tone;
		valueClass?: string;
	};
	type InventoryRow = {
		icon: IconComponent;
		label: string;
		value: string | number;
	};

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
	let monthGameMinutes = $derived(monthRows.reduce((sum, row) => sum + row.record.gameMinutes, 0));
	let calendarDays = $derived(buildCalendarDays(ledger, monthKey));
	let weekKey = $derived(getWeekKey(cleanedDraft.date));
	let cleanedWeeklyDraft = $derived(normalizeWeeklyDraft(weeklyDraft));
	let currentStreak = $derived(getCurrentStreak(records));
	let pendingCount = $derived(records.filter((record) => record.syncState === 'pending').length);
	let weeklyPendingCount = $derived(
		weeklyRecords.filter((record) => record.syncState === 'pending').length
	);
	let meterRotation = $derived(Math.min(220, Math.max(0, previewScore.totalPoints)) - 110);
	let previewNetMinutes = $derived(previewScore.exchangeableMinutes - cleanedDraft.gameMinutes);
	let targetProgress = $derived(getTargetProgress(cleanedDraft));
	let targetProgressPercent = $derived(Math.round(targetProgress.totalProgress * 100));
	let studyProgressPercent = $derived(Math.round(targetProgress.studyProgress * 100));
	let wordProgressPercent = $derived(Math.round(targetProgress.wordProgress * 100));
	let adventureLevel = $derived(Math.max(1, Math.floor(monthPoints / 500) + 1));
	let levelBasePoints = $derived((adventureLevel - 1) * 500);
	let levelProgressPercent = $derived(
		Math.min(100, Math.round(((monthPoints - levelBasePoints) / 500) * 100))
	);
	let bossHpPercent = $derived(Math.max(0, 100 - targetProgressPercent));
	let adventureRank = $derived(
		targetProgressPercent >= 100 ? '通关' : targetProgressPercent >= 50 ? '破防' : '开战'
	);
	let accountMood = $derived(currentBalance >= 0 ? '可出征' : '冷却中');
	let netValueClass = $derived(
		previewNetMinutes < 0 ? 'text-[oklch(0.42_0.1_42)]' : 'text-[oklch(0.36_0.1_145)]'
	);
	let dashboardStats = $derived<StatCard[]>([
		{ icon: Coins, label: '可兑换', value: `${previewScore.exchangeableMinutes}分` },
		{
			icon: Gamepad2,
			label: '实际游戏',
			value: `-${cleanedDraft.gameMinutes}分`,
			tone: 'red',
			valueClass: 'text-[oklch(0.42_0.1_42)]'
		},
		{
			icon: Sparkles,
			label: '净变化',
			value: `${previewNetMinutes >= 0 ? '+' : ''}${previewNetMinutes}分`,
			valueClass: netValueClass
		},
		{ icon: Archive, label: '结转', value: currentBalance },
		{ icon: Trophy, label: '本月积分', value: monthPoints },
		{ icon: Clock3, label: '本月游戏', value: monthGameMinutes },
		{ icon: Flame, label: '连续', value: `${currentStreak}天` },
		{ icon: Cloud, label: '待同步', value: pendingCount + weeklyPendingCount }
	]);
	let weekRows = $derived(
		ledger.filter((row) => row.record.date >= weekKey && row.record.date < addDays(weekKey, 7))
	);
	let weekStudyMinutes = $derived(
		weekRows.reduce((sum, row) => sum + row.record.calculusMinutes + row.record.courseMinutes, 0)
	);
	let weekWords = $derived(weekRows.reduce((sum, row) => sum + row.record.wordCount, 0));
	let weekGameMinutes = $derived(weekRows.reduce((sum, row) => sum + row.record.gameMinutes, 0));
	let weekExchangeableMinutes = $derived(
		weekRows.reduce((sum, row) => sum + row.score.exchangeableMinutes, 0)
	);
	let weekNetMinutes = $derived(weekExchangeableMinutes - weekGameMinutes);
	let weekStudyProgress = $derived(
		cleanedWeeklyDraft.studyMinutesTarget
			? Math.min(100, Math.round((weekStudyMinutes / cleanedWeeklyDraft.studyMinutesTarget) * 100))
			: 0
	);
	let weekWordProgress = $derived(
		cleanedWeeklyDraft.wordCountTarget
			? Math.min(100, Math.round((weekWords / cleanedWeeklyDraft.wordCountTarget) * 100))
			: 0
	);
	let weekGameProgress = $derived(
		cleanedWeeklyDraft.gameMinutesBudget
			? Math.min(100, Math.round((weekGameMinutes / cleanedWeeklyDraft.gameMinutesBudget) * 100))
			: 0
	);
	let weeklySummaryStats = $derived<StatCard[]>([
		{ icon: BookOpen, label: '学习', value: formatMinutes(weekStudyMinutes) },
		{ icon: Brain, label: '单词', value: weekWords },
		{ icon: Coins, label: '可兑换', value: `+${weekExchangeableMinutes}` },
		{
			icon: Gamepad2,
			label: '游戏',
			value: `-${weekGameMinutes}`,
			tone: 'red',
			valueClass: 'text-[oklch(0.42_0.1_42)]'
		}
	]);
	let inventoryRows = $derived<InventoryRow[]>([
		{ icon: Server, label: '主库', value: passcode ? 'Cloudflare D1' : '未连接' },
		{ icon: HardDrive, label: '本地缓存', value: 'IndexedDB' },
		{ icon: Archive, label: '记录数', value: records.length }
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

	async function saveLocalRecord(record: StudyRecord) {
		await localDb.records.put(record);
		records = sortRecordsAscending(await localDb.records.toArray());
	}

	async function saveLocalWeeklyRecord(record: WeeklyRecord) {
		await localDb.weeklyRecords.put(record);
		weeklyRecords = sortWeeklyRecordsAscending(await localDb.weeklyRecords.toArray());
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
			await localDb.records.clear();
			await localDb.records.bulkPut(
				remoteRecords.map((record) => ({ ...record, syncState: 'synced' }))
			);
			await localDb.weeklyRecords.clear();
			await localDb.weeklyRecords.bulkPut(
				remoteWeeklyRecords.map((record) => ({ ...record, syncState: 'synced' }))
			);
			records = sortRecordsAscending(await localDb.records.toArray());
			weeklyRecords = sortWeeklyRecordsAscending(await localDb.weeklyRecords.toArray());
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
		const value = (event.currentTarget as HTMLInputElement).value;
		draft[field] = value === '' ? 0 : Number(value);
	}

	function setWeeklyDraftNumber(field: WeeklyNumericDraftField, event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		weeklyDraft[field] = value === '' ? 0 : Number(value);
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
		records = sortRecordsAscending(await localDb.records.toArray());
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
			records = sortRecordsAscending(await localDb.records.toArray());
			weeklyRecords = sortWeeklyRecordsAscending(await localDb.weeklyRecords.toArray());
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
</script>

<svelte:head>
	<title>Hakuba 学习账本</title>
	<meta
		name="description"
		content="个人学习积分账本，使用 Cloudflare D1 持久化保存，支持本地缓存和 Excel 导出。"
	/>
</svelte:head>

{#snippet iconText(Icon: IconComponent, label: string, size = 15)}
	<span class="flex items-center gap-1.5">
		<Icon {size} />
		{label}
	</span>
{/snippet}

{#snippet statCard(stat: StatCard)}
	{@const Icon = stat.icon}
	<div
		class={['adventure-stat rounded-[6px] p-3', stat.tone === 'red' ? 'adventure-stat-red' : '']}
	>
		<p class={['adventure-stat-label', stat.tone === 'red' ? 'adventure-stat-label-red' : '']}>
			<Icon size={14} />
			{stat.label}
		</p>
		<p class={['ink-numbers mt-1 text-2xl font-semibold', stat.valueClass ?? '']}>
			{stat.value}
		</p>
	</div>
{/snippet}

{#snippet compactStatCard(stat: StatCard)}
	{@const Icon = stat.icon}
	<div
		class={[
			'rounded-[6px] bg-[oklch(0.99_0.006_92/0.72)] p-2.5',
			stat.tone === 'red' ? 'bg-[oklch(0.985_0.018_45/0.76)]' : ''
		]}
	>
		<p class={['adventure-stat-label', stat.tone === 'red' ? 'adventure-stat-label-red' : '']}>
			<Icon size={14} />
			{stat.label}
		</p>
		<p class={['ink-numbers mt-1 font-semibold', stat.valueClass ?? '']}>{stat.value}</p>
	</div>
{/snippet}

{#snippet tableHeading(Icon: IconComponent, label: string, align: 'left' | 'right' = 'left')}
	<span class={['adventure-table-heading', align === 'right' ? 'justify-end' : '']}>
		<Icon size={13} />
		{label}
	</span>
{/snippet}

<main id="main-content" class="min-h-screen px-4 py-5 text-[oklch(0.23_0.03_75)] sm:px-6 lg:px-8">
	<div class="mx-auto max-w-7xl">
		<header class="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
			<div>
				<p class="mb-1 flex items-center gap-2 text-sm font-semibold text-[oklch(0.43_0.07_145)]">
					<NotebookPen size={18} strokeWidth={1.8} />
					Hakuba adventure ledger
				</p>
				<h1
					class="max-w-3xl text-4xl font-semibold tracking-[-0.022em] text-[oklch(0.21_0.036_74)] sm:text-5xl"
				>
					学习冒险计划本
				</h1>
				<div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
					<span class="adventure-chip adventure-chip-green">
						<Trophy size={14} />
						Lv.{adventureLevel}
					</span>
					<span class="adventure-chip adventure-chip-gold">
						<Flame size={14} />
						连续 {currentStreak}天
					</span>
					<span
						class={[
							'adventure-chip',
							currentBalance >= 0 ? 'adventure-chip-green' : 'adventure-chip-red'
						]}
					>
						<Gamepad2 size={14} />
						{accountMood}
					</span>
				</div>
			</div>

			<div class="paper-sheet rounded-[8px] px-4 py-3">
				<div class="flex flex-wrap items-end gap-2">
					<label class="grid gap-1 text-xs font-semibold text-[oklch(0.42_0.028_75)]">
						D1 口令
						<input
							class="h-10 w-44 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-sm shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
							type="password"
							autocomplete="current-password"
							bind:value={passcode}
						/>
					</label>
					<button
						class="inline-flex h-10 items-center gap-2 rounded-[6px] bg-[oklch(0.23_0.03_75)] px-3 text-sm font-semibold text-[oklch(0.98_0.012_92)] shadow-[0_2px_4px_oklch(0.24_0.03_75/0.18)] transition-transform duration-150 active:scale-[0.96] disabled:opacity-55"
						type="button"
						disabled={isSyncing}
						onclick={syncRecords}
					>
						<RefreshCw size={16} class={isSyncing ? 'animate-spin' : ''} />
						同步
					</button>
				</div>
				<p class="mt-2 flex items-center gap-2 text-xs text-[oklch(0.42_0.028_75)]">
					{#if passcode}
						<Cloud size={14} /> {statusText}
					{:else}
						<Database size={14} /> 本地账本
					{/if}
				</p>
			</div>
		</header>

		<section class="adventure-board mb-5 rounded-[8px] p-4">
			<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
				<div>
					<div class="mb-2 flex items-center justify-between gap-3">
						<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.27_0.07_145)]">
							<Swords size={18} />
							本月冒险经验
						</p>
						<p class="ink-numbers text-sm font-semibold text-[oklch(0.35_0.09_145)]">
							{monthPoints - levelBasePoints}/500 XP
						</p>
					</div>
					<div
						class="relative h-7 overflow-hidden rounded-[7px] bg-[oklch(0.86_0.035_86)] shadow-[inset_0_2px_3px_oklch(0.3_0.035_75/0.18)]"
					>
						<div
							class="adventure-xp-fill absolute inset-y-0 left-0 rounded-[7px]"
							style={`width: ${levelProgressPercent}%;`}
						></div>
						<div class="absolute inset-0 grid grid-cols-5">
							<span class="border-r border-[oklch(0.26_0.04_75/0.16)]"></span>
							<span class="border-r border-[oklch(0.26_0.04_75/0.16)]"></span>
							<span class="border-r border-[oklch(0.26_0.04_75/0.16)]"></span>
							<span class="border-r border-[oklch(0.26_0.04_75/0.16)]"></span>
							<span></span>
						</div>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div class="adventure-stamp">
						<span><Target size={13} /> 今日战况</span>
						<strong>{adventureRank}</strong>
					</div>
					<div class="adventure-stamp adventure-stamp-gold">
						<span><Gamepad2 size={13} /> 游戏账户</span>
						<strong>{currentBalance}分</strong>
					</div>
				</div>
			</div>
		</section>

		{#if errorText}
			<p
				class="mb-4 rounded-[6px] bg-[oklch(0.96_0.045_32)] px-3 py-2 text-sm font-medium text-[oklch(0.38_0.11_32)]"
			>
				{errorText}
			</p>
		{/if}

		<section class="grid gap-5 lg:grid-cols-[380px_1fr]">
			<form class="paper-sheet rounded-[8px] p-5" onsubmit={(event) => event.preventDefault()}>
				<div class="mb-5 flex items-center justify-between gap-3">
					<div>
						<p
							class="text-xs font-semibold tracking-[0.12em] text-[oklch(0.48_0.032_75)] uppercase"
						>
							Daily entry
						</p>
						<h2 class="mt-1 text-2xl font-semibold tracking-[-0.012em]">今日页</h2>
					</div>
					<div
						class="rounded-full bg-[oklch(0.91_0.05_146)] px-3 py-1 text-sm font-semibold text-[oklch(0.36_0.1_145)]"
					>
						+{previewScore.totalPoints}
					</div>
				</div>

				<div class="grid gap-4">
					<label class="grid gap-1 text-sm font-semibold">
						{@render iconText(CalendarCheck, '日期')}
						<input
							class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
							type="date"
							value={draft.date}
							onchange={(event) => selectDate((event.currentTarget as HTMLInputElement).value)}
						/>
					</label>

					<section
						class="rounded-[8px] bg-[oklch(0.965_0.018_92/0.76)] p-3 shadow-[inset_0_0_0_1px_oklch(0.74_0.035_74/0.34)]"
					>
						<div class="mb-3 flex items-center justify-between gap-3">
							<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.37_0.08_145)]">
								<Sparkles size={17} />
								学习收入攻击
							</p>
							<div
								class="grid grid-cols-2 rounded-[6px] bg-[oklch(0.99_0.006_92/0.7)] p-1 text-xs font-semibold shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.38)]"
							>
								<label
									class={[
										'inline-flex h-8 cursor-pointer items-center justify-center rounded-[5px] px-2 transition-transform duration-150 active:scale-[0.96]',
										cleanedDraft.targetLevel === 1
											? 'bg-[oklch(0.38_0.11_145)] text-[oklch(0.98_0.012_92)] shadow-[0_1px_3px_oklch(0.27_0.08_145/0.2)]'
											: 'text-[oklch(0.42_0.028_75)]'
									]}
								>
									<input
										class="sr-only"
										type="radio"
										name="target-level"
										checked={cleanedDraft.targetLevel === 1}
										onchange={() => setTargetLevel(1)}
									/>
									工作日副本
								</label>
								<label
									class={[
										'inline-flex h-8 cursor-pointer items-center justify-center rounded-[5px] px-2 transition-transform duration-150 active:scale-[0.96]',
										cleanedDraft.targetLevel === 2
											? 'bg-[oklch(0.42_0.1_42)] text-[oklch(0.99_0.012_92)] shadow-[0_1px_3px_oklch(0.35_0.08_42/0.2)]'
											: 'text-[oklch(0.42_0.028_75)]'
									]}
								>
									<input
										class="sr-only"
										type="radio"
										name="target-level"
										checked={cleanedDraft.targetLevel === 2}
										onchange={() => setTargetLevel(2)}
									/>
									周末副本
								</label>
							</div>
						</div>

						<div class="grid gap-3">
							<div class="grid grid-cols-2 gap-3">
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(Calculator, '高数分钟')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(draft.calculusMinutes)}
										oninput={(event) => setDraftNumber('calculusMinutes', event)}
									/>
								</label>
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(BookOpen, '专业分钟')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(draft.courseMinutes)}
										oninput={(event) => setDraftNumber('courseMinutes', event)}
									/>
								</label>
							</div>

							<label class="grid gap-1 text-sm font-semibold">
								{@render iconText(Brain, '单词数')}
								<input
									class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
									type="number"
									min="0"
									value={numberInputValue(draft.wordCount)}
									oninput={(event) => setDraftNumber('wordCount', event)}
								/>
							</label>

							<div class="grid grid-cols-3 gap-3">
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(BookMarked, '章节')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(draft.chapterCount)}
										oninput={(event) => setDraftNumber('chapterCount', event)}
									/>
								</label>
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(Repeat2, '轮背')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(draft.wordRoundCount)}
										oninput={(event) => setDraftNumber('wordRoundCount', event)}
									/>
								</label>
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(BadgePlus, '附加')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(draft.manualBonus)}
										oninput={(event) => setDraftNumber('manualBonus', event)}
									/>
								</label>
							</div>
						</div>
					</section>

					<section
						class="rounded-[8px] bg-[oklch(0.96_0.026_42/0.58)] p-3 shadow-[inset_0_0_0_1px_oklch(0.74_0.07_42/0.3)]"
					>
						<div class="mb-3 flex items-center justify-between gap-3">
							<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.4_0.09_42)]">
								<Gamepad2 size={17} />
								游戏支出
							</p>
							<span class="ink-numbers text-xs font-semibold text-[oklch(0.42_0.08_42)]">
								账户 {previewNetMinutes >= 0 ? '+' : ''}{previewNetMinutes}分
							</span>
						</div>
						<label class="grid gap-1 text-sm font-semibold">
							{@render iconText(Clock3, '实际游戏')}
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.06_42/0.48)] focus:shadow-[inset_0_0_0_2px_oklch(0.54_0.12_42)] focus:outline-none"
								type="number"
								min="0"
								value={numberInputValue(draft.gameMinutes)}
								oninput={(event) => setDraftNumber('gameMinutes', event)}
							/>
						</label>
					</section>

					<label class="grid gap-1 text-sm font-semibold">
						{@render iconText(ScrollText, '备注')}
						<textarea
							class="min-h-24 resize-y rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 py-2 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
							bind:value={draft.note}
						></textarea>
					</label>
				</div>

				<div class="mt-5 grid grid-cols-[1fr_auto] gap-3">
					<button
						class="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] bg-[oklch(0.38_0.11_145)] px-4 text-sm font-semibold text-[oklch(0.98_0.012_92)] shadow-[0_2px_5px_oklch(0.27_0.08_145/0.22)] transition-transform duration-150 active:scale-[0.96] disabled:opacity-60"
						type="button"
						disabled={isSaving}
						onclick={saveRecord}
					>
						<Save size={17} />
						结算今日
					</button>
					<button
						class="inline-flex h-11 w-11 items-center justify-center rounded-[6px] bg-[oklch(0.96_0.035_32)] text-[oklch(0.43_0.12_32)] shadow-[inset_0_0_0_1px_oklch(0.76_0.08_32/0.45)] transition-transform duration-150 active:scale-[0.96]"
						type="button"
						aria-label="删除当天记录"
						onclick={deleteSelectedRecord}
					>
						<Trash2 size={17} />
					</button>
				</div>
			</form>

			<div class="grid gap-5">
				<section class="paper-sheet rounded-[8px] p-5">
					<div class="grid gap-5">
						<div class="quest-progress rounded-[8px] p-3">
							<div class="mb-2 flex items-center justify-between gap-3">
								<div>
									<p
										class="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[oklch(0.37_0.08_145)] uppercase"
									>
										<Swords size={15} />
										今日战斗
									</p>
									<p class="mt-1 text-xs font-semibold text-[oklch(0.45_0.035_75)]">
										学习收入打怪，游戏支出扣账户
									</p>
								</div>
								<div class="adventure-badge">
									<span>{adventureRank}</span>
									<strong class="ink-numbers">{targetProgressPercent}%</strong>
								</div>
							</div>
							<div class="mb-2 flex items-center justify-between gap-3">
								<p class="text-sm font-semibold text-[oklch(0.33_0.09_42)]">拖延怪 HP</p>
								<p class="ink-numbers text-sm font-semibold text-[oklch(0.42_0.1_42)]">
									{bossHpPercent}%
								</p>
							</div>
							<div
								class="relative h-7 overflow-hidden rounded-[7px] bg-[oklch(0.88_0.035_80)] shadow-[inset_0_1px_2px_oklch(0.32_0.04_74/0.18)]"
							>
								<div
									class="quest-progress-fill absolute inset-y-0 left-0 rounded-[7px]"
									style={`width: ${targetProgressPercent}%;`}
								></div>
								<div
									class="absolute inset-y-0 right-0 rounded-[7px] bg-[oklch(0.58_0.14_38/0.78)]"
									style={`width: ${bossHpPercent}%;`}
								></div>
								<div class="absolute inset-y-0 left-1/2 w-px bg-[oklch(0.23_0.03_75/0.3)]"></div>
								{#if targetProgressPercent >= 100}
									<div class="adventure-clear-stamp">CLEAR</div>
								{/if}
							</div>
							<div
								class="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-[oklch(0.45_0.035_75)]"
							>
								<span class="ink-numbers quest-subgoal">
									学习 {targetProgress.studyMinutes}/{targetProgress.requirements.studyMinutes}分 · {studyProgressPercent}%
								</span>
								<span class="ink-numbers quest-subgoal text-right">
									单词 {cleanedDraft.wordCount}/{targetProgress.requirements.wordCount} · {wordProgressPercent}%
								</span>
							</div>
						</div>

						<div class="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
							<div>
								<div class="mb-4 flex items-center justify-between">
									<p
										class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]"
									>
										<Gauge size={18} />
										战斗仪表
									</p>
									<span
										class="rounded-full bg-[oklch(0.94_0.04_78)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.42_0.08_78)]"
									>
										Lv.{adventureLevel}
									</span>
								</div>

								<div class="meter-pop relative mx-auto h-56 w-56">
									<div
										class="points-meter absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_oklch(0.74_0.035_74/0.45),0_10px_24px_oklch(0.25_0.03_70/0.14)]"
									></div>
									<div
										class="absolute inset-[18px] rounded-full bg-[oklch(0.985_0.011_92)] shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.35)]"
									></div>
									<div
										class="absolute top-1/2 left-1/2 h-[86px] w-[3px] origin-bottom rounded-full bg-[oklch(0.23_0.03_75)] transition-transform duration-300"
										style={`transform: translate(-50%, -100%) rotate(${meterRotation}deg);`}
									></div>
									<div
										class="absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.23_0.03_75)]"
									></div>
									<div class="absolute inset-x-0 bottom-12 text-center">
										<p class="ink-numbers text-5xl font-semibold tracking-[-0.022em]">
											{previewScore.totalPoints}
										</p>
										<p
											class="mt-1 text-xs font-semibold tracking-[0.12em] text-[oklch(0.49_0.03_75)] uppercase"
										>
											points
										</p>
									</div>
								</div>
								<div class="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
									<span class="adventure-mini-stamp">XP +{previewScore.totalPoints}</span>
									<span class="adventure-mini-stamp adventure-mini-stamp-gold">
										<Gamepad2 size={13} />
										{accountMood}
									</span>
								</div>
							</div>

							<div class="grid grid-cols-2 content-start gap-3 sm:grid-cols-4">
								{#each dashboardStats as stat (stat.label)}
									{@render statCard(stat)}
								{/each}
							</div>
						</div>

						<div>
							<div class="mb-4 flex items-center justify-between">
								<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]">
									<CalendarDays size={18} />
									{monthKey} 关卡地图
								</p>
								<p class="text-xs font-medium text-[oklch(0.48_0.028_75)]">
									学习 {formatMinutes(totalStudyMinutes)} · 单词 {totalWords}
								</p>
							</div>

							<div
								class="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[oklch(0.5_0.03_75)]"
							>
								<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span
									>六</span
								><span>日</span>
							</div>
							<div class="mt-2 grid grid-cols-7 gap-1.5">
								{#each calendarDays as day (day.date)}
									<button
										class={[
											'calendar-stage min-h-18 rounded-[6px] p-2 text-left shadow-[inset_0_0_0_1px_oklch(0.75_0.03_74/0.32)] transition-transform duration-150 active:scale-[0.96]',
											day.inMonth
												? 'bg-[oklch(0.99_0.006_92/0.78)]'
												: 'bg-[oklch(0.93_0.012_88/0.45)] text-[oklch(0.58_0.02_75)]',
											day.hasRecord ? 'calendar-stage-cleared' : '',
											day.netMinutes < 0 ? 'shadow-[inset_0_0_0_1px_oklch(0.58_0.12_42/0.62)]' : '',
											day.date === cleanedDraft.date
												? 'shadow-[inset_0_0_0_2px_oklch(0.45_0.11_145)]'
												: '',
											day.date === highlightedDate ? 'saved-day-pulse' : ''
										]}
										type="button"
										onclick={() => selectDate(day.date)}
									>
										<span class="flex items-center justify-between gap-1">
											<span class="ink-numbers text-sm font-semibold">{day.day}</span>
											{#if day.hasRecord}
												<span class="stage-star">★</span>
											{/if}
										</span>
										{#if day.hasRecord}
											<span class="mt-2 block h-1.5 rounded-full bg-[oklch(0.42_0.11_145)]"></span>
											<span class="mt-1 grid gap-0.5">
												<span
													class="ink-numbers block text-[10px] font-semibold text-[oklch(0.38_0.07_145)]"
												>
													+{day.exchangeableMinutes}
												</span>
												{#if day.gameMinutes > 0}
													<span class="mt-0.5 block h-1.5 rounded-full bg-[oklch(0.56_0.12_42)]"
													></span>
													<span
														class="ink-numbers block text-[10px] font-semibold text-[oklch(0.43_0.1_42)]"
													>
														-{day.gameMinutes}
													</span>
												{/if}
											</span>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					</div>
				</section>

				<section class="paper-sheet rounded-[8px] p-5">
					<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]">
								<ClipboardList size={18} />
								周计划
							</p>
							<h2 class="mt-1 text-xl font-semibold tracking-[-0.012em]">本周作战纸</h2>
						</div>
						<p class="ink-numbers text-xs font-semibold text-[oklch(0.48_0.028_75)]">
							{formatWeekRange(cleanedWeeklyDraft.weekStart)}
						</p>
					</div>

					<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
						<div
							class="rounded-[8px] bg-[oklch(0.965_0.018_92/0.76)] p-3 shadow-[inset_0_0_0_1px_oklch(0.74_0.035_74/0.34)]"
						>
							<div class="mb-3 flex items-center justify-between gap-3">
								<p
									class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.37_0.08_145)]"
								>
									<ListChecks size={16} />
									计划
								</p>
								<span
									class="inline-flex items-center gap-1 rounded-full bg-[oklch(0.91_0.05_146)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.36_0.1_145)]"
								>
									<Target size={13} />
									target
								</span>
							</div>

							<div class="grid grid-cols-3 gap-3">
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(BookOpen, '学习分钟')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(weeklyDraft.studyMinutesTarget)}
										oninput={(event) => setWeeklyDraftNumber('studyMinutesTarget', event)}
									/>
								</label>
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(Brain, '单词数')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(weeklyDraft.wordCountTarget)}
										oninput={(event) => setWeeklyDraftNumber('wordCountTarget', event)}
									/>
								</label>
								<label class="grid gap-1 text-sm font-semibold">
									{@render iconText(Gamepad2, '游戏预算')}
									<input
										class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.06_42/0.48)] focus:shadow-[inset_0_0_0_2px_oklch(0.54_0.12_42)] focus:outline-none"
										type="number"
										min="0"
										value={numberInputValue(weeklyDraft.gameMinutesBudget)}
										oninput={(event) => setWeeklyDraftNumber('gameMinutesBudget', event)}
									/>
								</label>
							</div>

							<label class="mt-3 grid gap-1 text-sm font-semibold">
								{@render iconText(ScrollText, '计划备注')}
								<textarea
									class="min-h-24 resize-y rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 py-2 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
									bind:value={weeklyDraft.planNote}
								></textarea>
							</label>
						</div>

						<div
							class="rounded-[8px] bg-[oklch(0.97_0.02_88/0.72)] p-3 shadow-[inset_0_0_0_1px_oklch(0.72_0.05_74/0.34)]"
						>
							<div class="mb-3 flex items-center justify-between gap-3">
								<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.39_0.07_75)]">
									<ScrollText size={17} />
									周复盘
								</p>
								<span
									class={[
										'ink-numbers rounded-full px-2.5 py-1 text-xs font-semibold',
										weekNetMinutes < 0
											? 'bg-[oklch(0.96_0.035_42)] text-[oklch(0.42_0.1_42)]'
											: 'bg-[oklch(0.91_0.05_146)] text-[oklch(0.36_0.1_145)]'
									]}
								>
									净 {weekNetMinutes >= 0 ? '+' : ''}{weekNetMinutes}分
								</span>
							</div>

							<div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
								{#each weeklySummaryStats as stat (stat.label)}
									{@render compactStatCard(stat)}
								{/each}
							</div>

							<div class="mt-3 grid gap-2">
								<div>
									<div
										class="mb-1 flex justify-between text-xs font-semibold text-[oklch(0.45_0.035_75)]"
									>
										<span>学习计划</span><span class="ink-numbers">{weekStudyProgress}%</span>
									</div>
									<div class="h-2 overflow-hidden rounded-full bg-[oklch(0.88_0.03_86)]">
										<div
											class="adventure-week-fill h-full rounded-full"
											style={`width: ${weekStudyProgress}%;`}
										></div>
									</div>
								</div>
								<div>
									<div
										class="mb-1 flex justify-between text-xs font-semibold text-[oklch(0.45_0.035_75)]"
									>
										<span>单词计划</span><span class="ink-numbers">{weekWordProgress}%</span>
									</div>
									<div class="h-2 overflow-hidden rounded-full bg-[oklch(0.88_0.03_86)]">
										<div
											class="adventure-week-fill adventure-week-fill-gold h-full rounded-full"
											style={`width: ${weekWordProgress}%;`}
										></div>
									</div>
								</div>
								<div>
									<div
										class="mb-1 flex justify-between text-xs font-semibold text-[oklch(0.45_0.035_75)]"
									>
										<span>游戏预算</span><span class="ink-numbers">{weekGameProgress}%</span>
									</div>
									<div class="h-2 overflow-hidden rounded-full bg-[oklch(0.88_0.03_86)]">
										<div
											class="adventure-week-fill adventure-week-fill-red h-full rounded-full"
											style={`width: ${weekGameProgress}%;`}
										></div>
									</div>
								</div>
							</div>

							<label class="mt-3 grid gap-1 text-sm font-semibold">
								{@render iconText(History, '复盘')}
								<textarea
									class="min-h-24 resize-y rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 py-2 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
									bind:value={weeklyDraft.reviewNote}
								></textarea>
							</label>
						</div>
					</div>

					<button
						class="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[6px] bg-[oklch(0.23_0.03_75)] px-3 text-sm font-semibold text-[oklch(0.98_0.012_92)] transition-transform duration-150 active:scale-[0.96]"
						type="button"
						onclick={saveWeeklyRecord}
					>
						<Save size={16} />
						保存周计划和复盘
					</button>
				</section>

				<aside class="paper-sheet rounded-[8px] p-5">
					<div class="mb-4 flex items-center justify-between">
						<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]">
							<ShieldCheck size={18} />
							冒险背包
						</p>
						<span
							class="rounded-full bg-[oklch(0.93_0.035_145)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.35_0.09_145)]"
						>
							{persistStatus === 'granted'
								? '持久化'
								: persistStatus === 'denied'
									? '需备份'
									: persistStatus === 'unsupported'
										? '浏览器缓存'
										: '检查中'}
						</span>
					</div>

					<div class="grid gap-2">
						<button
							class="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[oklch(0.23_0.03_75)] px-3 text-sm font-semibold text-[oklch(0.98_0.012_92)] transition-transform duration-150 active:scale-[0.96]"
							type="button"
							onclick={() => exportXlsx(records)}
						>
							<FileSpreadsheet size={16} />
							导出 Excel
						</button>
						<button
							class="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[oklch(0.96_0.026_78)] px-3 text-sm font-semibold text-[oklch(0.31_0.04_78)] shadow-[inset_0_0_0_1px_oklch(0.72_0.04_78/0.46)] transition-transform duration-150 active:scale-[0.96]"
							type="button"
							onclick={() => exportJson(records, weeklyRecords)}
						>
							<Download size={16} />
							导出备份
						</button>
						<button
							class="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[oklch(0.96_0.026_78)] px-3 text-sm font-semibold text-[oklch(0.31_0.04_78)] shadow-[inset_0_0_0_1px_oklch(0.72_0.04_78/0.46)] transition-transform duration-150 active:scale-[0.96]"
							type="button"
							onclick={() => fileInput?.click()}
						>
							<FileUp size={16} />
							导入备份
						</button>
						<input
							class="hidden"
							type="file"
							accept="application/json,.json"
							bind:this={fileInput}
							onchange={importBackup}
						/>
					</div>

					<div class="mt-5 space-y-3 text-sm">
						{#each inventoryRows as row (row.label)}
							{@const Icon = row.icon}
							<div class="flex justify-between gap-3">
								<span class="flex items-center gap-1.5 text-[oklch(0.48_0.028_75)]">
									<Icon size={14} />
									{row.label}
								</span>
								<span class="ink-numbers font-semibold">{row.value}</span>
							</div>
						{/each}
					</div>
				</aside>
			</div>
		</section>

		<section class="paper-sheet mt-5 rounded-[8px] p-5">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="flex items-center gap-2 text-xl font-semibold tracking-[-0.012em]">
					<History size={20} />
					战斗日志
				</h2>
				<p class="flex items-center gap-1.5 text-sm text-[oklch(0.48_0.028_75)]">
					<ListChecks size={15} />
					最近 8 条
				</p>
			</div>

			<div class="grid gap-3 md:hidden">
				{#each recentRows as record (record.date)}
					{@const row = ledger.find((item) => item.record.date === record.date)}
					<button
						class="adventure-log-card rounded-[6px] p-3 text-left transition-transform duration-150 active:scale-[0.96]"
						type="button"
						onclick={() => selectDate(record.date)}
					>
						<div class="flex items-start justify-between gap-3">
							<p class="ink-numbers flex items-center gap-1.5 font-semibold">
								<CalendarCheck size={14} />
								{record.date}
							</p>
							<p class="ink-numbers text-lg font-semibold text-[oklch(0.36_0.1_145)]">
								+{row?.score.exchangeableMinutes ?? 0}
							</p>
						</div>
						<div class="mt-2 grid grid-cols-3 gap-2 text-xs text-[oklch(0.46_0.028_75)]">
							<span class="flex items-center gap-1">
								<BookOpen size={13} />
								学习 {record.calculusMinutes + record.courseMinutes}
							</span>
							<span class="flex items-center gap-1 text-[oklch(0.43_0.1_42)]">
								<Gamepad2 size={13} />
								游戏 -{record.gameMinutes}
							</span>
							<span class="flex items-center gap-1">
								<Archive size={13} />
								结转 {row?.balanceAfter ?? 0}
							</span>
						</div>
						<p class="ink-numbers mt-1 text-xs font-semibold text-[oklch(0.36_0.1_145)]">
							净变化 {(row?.score.exchangeableMinutes ?? 0) - record.gameMinutes >= 0 ? '+' : ''}
							{(row?.score.exchangeableMinutes ?? 0) - record.gameMinutes}分
						</p>
						{#if record.note}
							<p class="mt-2 line-clamp-2 text-sm text-[oklch(0.38_0.028_75)]">{record.note}</p>
						{/if}
					</button>
				{/each}
				{#if recentRows.length === 0}
					<p class="py-8 text-center text-[oklch(0.48_0.028_75)]">还没有记录</p>
				{/if}
			</div>

			<div class="hidden overflow-x-auto md:block">
				<table class="w-full min-w-[820px] table-fixed border-collapse text-sm">
					<colgroup>
						<col class="w-[7.25rem]" />
						<col class="w-[4.75rem]" />
						<col class="w-[4.75rem]" />
						<col class="w-[5.25rem]" />
						<col class="w-[5.75rem]" />
						<col class="w-[5.25rem]" />
						<col class="w-[4.5rem]" />
						<col />
					</colgroup>
					<thead>
						<tr
							class="border-b border-[oklch(0.74_0.035_74/0.5)] text-left text-xs font-semibold tracking-[0.08em] text-[oklch(0.48_0.028_75)] uppercase"
						>
							<th class="py-2 pr-3">
								{@render tableHeading(CalendarCheck, '日期')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(BookOpen, '学习', 'right')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(Brain, '单词', 'right')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(Coins, '可兑换', 'right')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(Gamepad2, '实际游戏', 'right')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(Sparkles, '净变化', 'right')}
							</th>
							<th class="py-2 pr-3 text-right">
								{@render tableHeading(Archive, '结转', 'right')}
							</th>
							<th class="py-2">
								{@render tableHeading(ScrollText, '备注')}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each recentRows as record (record.date)}
							{@const row = ledger.find((item) => item.record.date === record.date)}
							<tr class="border-b border-[oklch(0.8_0.025_74/0.36)]">
								<td class="ink-numbers py-3 pr-3 font-semibold whitespace-nowrap">{record.date}</td>
								<td class="ink-numbers py-3 pr-3 text-right">
									{record.calculusMinutes + record.courseMinutes}
								</td>
								<td class="ink-numbers py-3 pr-3 text-right">{record.wordCount}</td>
								<td class="ink-numbers py-3 pr-3 text-right font-semibold">
									+{row?.score.exchangeableMinutes ?? 0}
								</td>
								<td class="ink-numbers py-3 pr-3 text-right text-[oklch(0.43_0.1_42)]">
									-{record.gameMinutes}
								</td>
								<td
									class={[
										'ink-numbers py-3 pr-3 text-right font-semibold',
										(row?.score.exchangeableMinutes ?? 0) - record.gameMinutes < 0
											? 'text-[oklch(0.43_0.1_42)]'
											: 'text-[oklch(0.36_0.1_145)]'
									]}
								>
									{(row?.score.exchangeableMinutes ?? 0) - record.gameMinutes >= 0 ? '+' : ''}
									{(row?.score.exchangeableMinutes ?? 0) - record.gameMinutes}
								</td>
								<td class="ink-numbers py-3 pr-3 text-right">{row?.balanceAfter ?? 0}</td>
								<td class="min-w-[220px] truncate py-3 text-[oklch(0.42_0.028_75)]">
									{record.note}
								</td>
							</tr>
						{/each}
						{#if recentRows.length === 0}
							<tr>
								<td class="py-8 text-center text-[oklch(0.48_0.028_75)]" colspan="8">还没有记录</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</main>
