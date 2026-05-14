<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CalendarDays,
		Cloud,
		Database,
		Download,
		FileSpreadsheet,
		FileUp,
		Gauge,
		NotebookPen,
		RefreshCw,
		Save,
		ShieldCheck,
		Trash2
	} from 'lucide-svelte';
	import { deleteRemoteRecord, fetchRemoteRecords, saveRemoteRecord } from '$lib/study/api';
	import { buildCalendarDays } from '$lib/study/calendar';
	import { exportJson, exportXlsx, readBackupFile } from '$lib/study/export';
	import { localDb } from '$lib/study/local-db';
	import {
		buildLedger,
		createDraft,
		getCurrentStreak,
		getMonthKey,
		getSuggestedTargetLevel,
		normalizeDraft,
		scoreRecord,
		sortRecordsAscending,
		sortRecordsDescending,
		toDraft,
		toRecord
	} from '$lib/study/scoring';
	import type { StudyRecord, StudyRecordDraft } from '$lib/study/types';

	type PersistStatus = 'checking' | 'granted' | 'denied' | 'unsupported';

	let records = $state<StudyRecord[]>([]);
	let draft = $state<StudyRecordDraft>(createDraft());
	let passcode = $state('');
	let statusText = $state('读取本地账本');
	let errorText = $state('');
	let persistStatus = $state<PersistStatus>('checking');
	let isSaving = $state(false);
	let isSyncing = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

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
	let currentStreak = $derived(getCurrentStreak(records));
	let suggestedTarget = $derived(getSuggestedTargetLevel(cleanedDraft));
	let pendingCount = $derived(records.filter((record) => record.syncState === 'pending').length);
	let meterRotation = $derived(Math.min(220, Math.max(0, previewScore.totalPoints)) - 110);

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
		records = sortRecordsAscending(localRecords);
		const current = records.find((record) => record.date === draft.date);
		if (current) draft = toDraft(current);
	}

	async function saveLocalRecord(record: StudyRecord) {
		await localDb.records.put(record);
		records = sortRecordsAscending(await localDb.records.toArray());
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
		} catch (error) {
			errorText = error instanceof Error ? error.message : '保存失败';
			statusText = '本地有待同步记录';
		} finally {
			isSaving = false;
		}
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
			const deletions = await localDb.deletions.toArray();

			for (const record of pendingRecords) {
				const saved = await saveRemoteRecord(passcode, record);
				await localDb.records.put({ ...saved, syncState: 'synced' });
			}

			for (const deletion of deletions) {
				await deleteRemoteRecord(passcode, deletion.date);
				await localDb.deletions.delete(deletion.date);
			}

			const remoteRecords = await fetchRemoteRecords(passcode);
			await localDb.records.clear();
			await localDb.records.bulkPut(
				remoteRecords.map((record) => ({ ...record, syncState: 'synced' }))
			);
			records = sortRecordsAscending(await localDb.records.toArray());
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
		draft = existing ? toDraft(existing) : createDraft(date);
	}

	function applySuggestedTarget() {
		draft.targetLevel = suggestedTarget;
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
			const nextRecords = imported.map((record) =>
				toRecord({ ...record, syncState: passcode ? 'pending' : 'local' })
			);
			await localDb.records.bulkPut(nextRecords);
			records = sortRecordsAscending(await localDb.records.toArray());
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
</script>

<svelte:head>
	<title>Hakuba 学习账本</title>
	<meta
		name="description"
		content="个人学习积分账本，使用 Cloudflare D1 持久化保存，支持本地缓存和 Excel 导出。"
	/>
</svelte:head>

<main id="main-content" class="min-h-screen px-4 py-5 text-[oklch(0.23_0.03_75)] sm:px-6 lg:px-8">
	<div class="mx-auto max-w-7xl">
		<header class="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
			<div>
				<p class="mb-1 flex items-center gap-2 text-sm font-semibold text-[oklch(0.43_0.07_145)]">
					<NotebookPen size={18} strokeWidth={1.8} />
					Hakuba study ledger
				</p>
				<h1
					class="max-w-3xl text-4xl font-semibold tracking-[-0.022em] text-[oklch(0.21_0.036_74)] sm:text-5xl"
				>
					学习积分计划本
				</h1>
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
						日期
						<input
							class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
							type="date"
							value={draft.date}
							onchange={(event) => selectDate((event.currentTarget as HTMLInputElement).value)}
						/>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<label class="grid gap-1 text-sm font-semibold">
							高数分钟
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.calculusMinutes}
							/>
						</label>
						<label class="grid gap-1 text-sm font-semibold">
							专业分钟
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.courseMinutes}
							/>
						</label>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<label class="grid gap-1 text-sm font-semibold">
							单词数
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.wordCount}
							/>
						</label>
						<label class="grid gap-1 text-sm font-semibold">
							游戏分钟
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.gameMinutes}
							/>
						</label>
					</div>

					<div class="grid gap-2">
						<div class="flex items-center justify-between">
							<label class="text-sm font-semibold" for="target-level">推荐量</label>
							<button
								class="h-8 rounded-[6px] px-2 text-xs font-semibold text-[oklch(0.42_0.09_145)] shadow-[inset_0_0_0_1px_oklch(0.65_0.07_145/0.45)] transition-transform duration-150 active:scale-[0.96]"
								type="button"
								onclick={applySuggestedTarget}
							>
								按规则
							</button>
						</div>
						<select
							id="target-level"
							class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
							bind:value={draft.targetLevel}
						>
							<option value={0}>未完成</option>
							<option value={1}>工作日完成</option>
							<option value={2}>周末完成</option>
						</select>
					</div>

					<div class="grid grid-cols-3 gap-3">
						<label class="grid gap-1 text-sm font-semibold">
							章节
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.chapterCount}
							/>
						</label>
						<label class="grid gap-1 text-sm font-semibold">
							轮背
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.wordRoundCount}
							/>
						</label>
						<label class="grid gap-1 text-sm font-semibold">
							附加
							<input
								class="h-11 rounded-[6px] border-0 bg-[oklch(0.99_0.006_92)] px-3 text-right shadow-[inset_0_0_0_1px_oklch(0.72_0.035_72/0.5)] focus:shadow-[inset_0_0_0_2px_oklch(0.52_0.12_145)] focus:outline-none"
								type="number"
								min="0"
								bind:value={draft.manualBonus}
							/>
						</label>
					</div>

					<label class="grid gap-1 text-sm font-semibold">
						备注
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
						保存
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
						<div class="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
							<div>
								<div class="mb-4 flex items-center justify-between">
									<p
										class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]"
									>
										<Gauge size={18} />
										积分仪表
									</p>
									<span
										class="rounded-full bg-[oklch(0.94_0.04_78)] px-2.5 py-1 text-xs font-semibold text-[oklch(0.42_0.08_78)]"
									>
										今日
									</span>
								</div>

								<div class="relative mx-auto h-56 w-56">
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

								<div class="mt-4 grid grid-cols-2 gap-2 text-sm">
									<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.76)] p-3">
										<p class="text-xs text-[oklch(0.48_0.028_75)]">可兑换</p>
										<p class="ink-numbers mt-1 text-xl font-semibold">
											{previewScore.exchangeableMinutes}分
										</p>
									</div>
									<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.76)] p-3">
										<p class="text-xs text-[oklch(0.48_0.028_75)]">结转</p>
										<p class="ink-numbers mt-1 text-xl font-semibold">{currentBalance}</p>
									</div>
								</div>
							</div>

							<div class="grid grid-cols-2 content-start gap-3">
								<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.7)] p-3">
									<p class="text-xs text-[oklch(0.48_0.028_75)]">本月积分</p>
									<p class="ink-numbers mt-1 text-2xl font-semibold">{monthPoints}</p>
								</div>
								<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.7)] p-3">
									<p class="text-xs text-[oklch(0.48_0.028_75)]">本月游戏</p>
									<p class="ink-numbers mt-1 text-2xl font-semibold">{monthGameMinutes}</p>
								</div>
								<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.7)] p-3">
									<p class="text-xs text-[oklch(0.48_0.028_75)]">连续</p>
									<p class="ink-numbers mt-1 text-2xl font-semibold">{currentStreak}天</p>
								</div>
								<div class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.7)] p-3">
									<p class="text-xs text-[oklch(0.48_0.028_75)]">待同步</p>
									<p class="ink-numbers mt-1 text-2xl font-semibold">{pendingCount}</p>
								</div>
							</div>
						</div>

						<div>
							<div class="mb-4 flex items-center justify-between">
								<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]">
									<CalendarDays size={18} />
									{monthKey}
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
											'min-h-18 rounded-[6px] p-2 text-left shadow-[inset_0_0_0_1px_oklch(0.75_0.03_74/0.32)] transition-transform duration-150 active:scale-[0.96]',
											day.inMonth
												? 'bg-[oklch(0.99_0.006_92/0.78)]'
												: 'bg-[oklch(0.93_0.012_88/0.45)] text-[oklch(0.58_0.02_75)]',
											day.date === cleanedDraft.date
												? 'shadow-[inset_0_0_0_2px_oklch(0.45_0.11_145)]'
												: ''
										]}
										type="button"
										onclick={() => selectDate(day.date)}
									>
										<span class="ink-numbers text-sm font-semibold">{day.day}</span>
										{#if day.hasRecord}
											<span class="mt-2 block h-1.5 rounded-full bg-[oklch(0.42_0.11_145)]"></span>
											<span
												class="ink-numbers mt-1 block text-[10px] font-semibold text-[oklch(0.38_0.07_145)]"
											>
												+{day.totalPoints}
											</span>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					</div>
				</section>

				<aside class="paper-sheet rounded-[8px] p-5">
					<div class="mb-4 flex items-center justify-between">
						<p class="flex items-center gap-2 text-sm font-semibold text-[oklch(0.42_0.03_75)]">
							<ShieldCheck size={18} />
							保存状态
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
							onclick={() => exportJson(records)}
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
						<div class="flex justify-between gap-3">
							<span class="text-[oklch(0.48_0.028_75)]">主库</span>
							<span class="font-semibold">{passcode ? 'Cloudflare D1' : '未连接'}</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-[oklch(0.48_0.028_75)]">本地缓存</span>
							<span class="font-semibold">IndexedDB</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-[oklch(0.48_0.028_75)]">记录数</span>
							<span class="ink-numbers font-semibold">{records.length}</span>
						</div>
					</div>
				</aside>
			</div>
		</section>

		<section class="paper-sheet mt-5 rounded-[8px] p-5">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xl font-semibold tracking-[-0.012em]">历史流水</h2>
				<p class="text-sm text-[oklch(0.48_0.028_75)]">最近 8 条</p>
			</div>

			<div class="grid gap-3 md:hidden">
				{#each recentRows as record (record.date)}
					{@const row = ledger.find((item) => item.record.date === record.date)}
					<button
						class="rounded-[6px] bg-[oklch(0.99_0.006_92/0.72)] p-3 text-left shadow-[inset_0_0_0_1px_oklch(0.75_0.03_74/0.32)] transition-transform duration-150 active:scale-[0.96]"
						type="button"
						onclick={() => selectDate(record.date)}
					>
						<div class="flex items-start justify-between gap-3">
							<p class="ink-numbers font-semibold">{record.date}</p>
							<p class="ink-numbers text-lg font-semibold">+{row?.score.totalPoints ?? 0}</p>
						</div>
						<div class="mt-2 grid grid-cols-3 gap-2 text-xs text-[oklch(0.46_0.028_75)]">
							<span>学习 {record.calculusMinutes + record.courseMinutes}</span>
							<span>单词 {record.wordCount}</span>
							<span>结转 {row?.balanceAfter ?? 0}</span>
						</div>
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
				<table class="w-full min-w-[760px] border-collapse text-sm">
					<thead>
						<tr
							class="border-b border-[oklch(0.74_0.035_74/0.5)] text-left text-xs font-semibold tracking-[0.08em] text-[oklch(0.48_0.028_75)] uppercase"
						>
							<th class="py-2 pr-4">日期</th>
							<th class="py-2 pr-4 text-right">学习</th>
							<th class="py-2 pr-4 text-right">单词</th>
							<th class="py-2 pr-4 text-right">积分</th>
							<th class="py-2 pr-4 text-right">游戏</th>
							<th class="py-2 pr-4 text-right">结转</th>
							<th class="py-2">备注</th>
						</tr>
					</thead>
					<tbody>
						{#each recentRows as record (record.date)}
							{@const row = ledger.find((item) => item.record.date === record.date)}
							<tr class="border-b border-[oklch(0.8_0.025_74/0.36)]">
								<td class="ink-numbers py-3 pr-4 font-semibold">{record.date}</td>
								<td class="ink-numbers py-3 pr-4 text-right">
									{record.calculusMinutes + record.courseMinutes}
								</td>
								<td class="ink-numbers py-3 pr-4 text-right">{record.wordCount}</td>
								<td class="ink-numbers py-3 pr-4 text-right font-semibold">
									{row?.score.totalPoints ?? 0}
								</td>
								<td class="ink-numbers py-3 pr-4 text-right">{record.gameMinutes}</td>
								<td class="ink-numbers py-3 pr-4 text-right">{row?.balanceAfter ?? 0}</td>
								<td class="max-w-[280px] truncate py-3 text-[oklch(0.42_0.028_75)]"
									>{record.note}</td
								>
							</tr>
						{/each}
						{#if recentRows.length === 0}
							<tr>
								<td class="py-8 text-center text-[oklch(0.48_0.028_75)]" colspan="7">还没有记录</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</main>
