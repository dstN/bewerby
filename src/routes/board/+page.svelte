<script lang="ts">
	import { onMount } from 'svelte';
	import { liveQuery } from 'dexie';
	import { SvelteSet } from 'svelte/reactivity';
	import { db, type Application } from '#lib/db/index.js';
	import { t, i18n } from '#lib/i18n/index.svelte.js';
	import ApplicationModal from '#lib/components/kanban/ApplicationModal.svelte';
	import ApplicationDispatchDialog from '#lib/components/application/ApplicationDispatchDialog.svelte';
	import { colorStore } from '#lib/stores/colors.svelte.js';
	import { deletePdfFromOpfs } from '#lib/utils/opfs.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';
	import { getAppliedAt, getReminderDueAt, wasSent } from '#lib/utils/reminders.js';
	import { buildApplicationCsv, exportFileName } from '#lib/utils/applicationExport.js';
	import { renderApplicationListPdf } from '#lib/utils/applicationListPdf.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	// Columns definition
	const columns = [
		{ id: 'draft', labelKey: 'kanban.columns.draft', color: 'var(--color-kanban-draft)' },
		{ id: 'sent', labelKey: 'kanban.columns.sent', color: 'var(--color-kanban-sent)' },
		{
			id: 'interview',
			labelKey: 'kanban.columns.interview',
			color: 'var(--color-kanban-interview)'
		},
		{ id: 'accepted', labelKey: 'kanban.columns.accepted', color: 'var(--color-kanban-accepted)' },
		{ id: 'rejected', labelKey: 'kanban.columns.rejected', color: 'var(--color-kanban-rejected)' }
	] as const;

	type Status = (typeof columns)[number]['id'];

	// Reactive Live Query for applications
	const applicationsStore = liveQuery(() => db.applications.toArray());

	// Dashboard filter states
	let searchFilter = $state('');
	let selectedTag = $state('');
	let selectedPriority = $state<string>('');
	let selectedColor = $state<string>('');
	let selectedSortBy = $state<'default' | 'color' | 'priority' | 'date'>('default');

	// Derived lists of matching applications
	let filteredApplications = $derived.by(() => {
		const list = $applicationsStore ?? [];
		const filtered = list.filter((app) => {
			const matchesSearch =
				app.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
				app.company.toLowerCase().includes(searchFilter.toLowerCase()) ||
				app.notes.toLowerCase().includes(searchFilter.toLowerCase());
			const matchesTag = !selectedTag || app.tags.includes(selectedTag);
			const matchesPriority = !selectedPriority || app.priority === selectedPriority;
			const matchesColor =
				!selectedColor ||
				(selectedColor === 'colored' && !!app.cardColor && app.cardColor !== 'none') ||
				(selectedColor === 'uncolored' && (!app.cardColor || app.cardColor === 'none')) ||
				app.cardColor?.toLowerCase() === selectedColor.toLowerCase();
			return matchesSearch && matchesTag && matchesPriority && matchesColor;
		});

		return filtered.sort((a, b) => {
			if (selectedSortBy === 'color') {
				const aColor = a.cardColor && a.cardColor !== 'none' ? a.cardColor.toLowerCase() : '';
				const bColor = b.cardColor && b.cardColor !== 'none' ? b.cardColor.toLowerCase() : '';
				if (aColor && !bColor) return -1;
				if (!aColor && bColor) return 1;
				if (aColor !== bColor) return aColor.localeCompare(bColor);
				return (b.updatedAt || 0) - (a.updatedAt || 0);
			} else if (selectedSortBy === 'priority') {
				const weight: Record<string, number> = { high: 3, medium: 2, low: 1 };
				return (weight[b.priority] || 0) - (weight[a.priority] || 0);
			} else if (selectedSortBy === 'date') {
				return getAppliedAt(b) - getAppliedAt(a);
			}
			return 0;
		});
	});

	// Groups the filtered list by column once per render instead of the board
	// re-filtering the same list once per column (5x) in the template.
	let applicationsByColumn = $derived.by(() => {
		const grouped: Record<Status, Application[]> = {
			draft: [],
			sent: [],
			interview: [],
			accepted: [],
			rejected: []
		};
		for (const app of filteredApplications) {
			grouped[app.status].push(app);
		}
		return grouped;
	});

	// Collapsed cards keep company, priority, date and the icon buttons. The
	// set of collapsed ids is a view preference, so it lives in localStorage
	// next to theme and locale rather than on the application record.
	const COLLAPSED_STORAGE_KEY = 'bewerby-collapsed-cards';

	function readCollapsedIds(): number[] {
		try {
			const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '[]');
			return Array.isArray(parsed)
				? parsed.filter((id: unknown): id is number => Number.isInteger(id))
				: [];
		} catch {
			return [];
		}
	}

	const collapsedIds = new SvelteSet<number>(readCollapsedIds());

	$effect(() => {
		try {
			localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsedIds]));
		} catch {
			// Storage full or blocked: the toggle still works for this session.
		}
	});
	let allCollapsed = $derived(
		filteredApplications.length > 0 &&
			filteredApplications.every((app) => collapsedIds.has(app.id!))
	);

	function toggleAllCollapsed() {
		if (allCollapsed) collapsedIds.clear();
		else for (const app of filteredApplications) collapsedIds.add(app.id!);
	}

	function toggleCollapsed(id: number) {
		if (!collapsedIds.delete(id)) collapsedIds.add(id);
	}

	// Get unique tags for filter dropdown
	let allTags = $derived.by(() => {
		const list = $applicationsStore ?? [];
		const tagsSet = new SvelteSet<string>();
		list.forEach((app) => app.tags.forEach((t) => tagsSet.add(t)));
		return Array.from(tagsSet);
	});

	// Check due reminders (In-app startup check). Uses the same
	// getReminderDueAt() the notification engine schedules against, so the
	// banner and the actual notification can never disagree about what's due.
	let activeAlerts = $derived.by(() => {
		const list = $applicationsStore ?? [];
		const now = Date.now();
		return list.filter((app) => {
			const dueAt = getReminderDueAt(app);
			return dueAt !== null && dueAt <= now;
		});
	});

	// Modal states
	let showModal = $state(false);
	// $state.raw: this reference is only ever swapped wholesale (never mutated
	// through), so a deep reactive proxy over its tags/history arrays buys
	// nothing.
	let selectedApp = $state.raw<Application | null>(null);
	let modalInitialStatus = $state<Status>('draft');

	function openAddModal(status: Status) {
		selectedApp = null;
		modalInitialStatus = status;
		showModal = true;
	}

	let dispatchApp = $state<Application | null>(null);

	function openDispatch(app: Application) {
		dispatchApp = app;
	}

	function openEditModal(app: Application) {
		selectedApp = app;
		showModal = true;
	}

	// The manifest's "New application" shortcut (long-press the installed
	// app icon) launches here with ?new=1. Consuming it once via onMount and
	// stripping the param immediately means reloading or reopening the tab
	// later never re-triggers the modal from stale history/bookmark state.
	onMount(() => {
		if (new URLSearchParams(window.location.search).has('new')) {
			openAddModal('draft');
			// A shallow, replacing goto() is SvelteKit 3's replaceState(): it
			// rewrites the history entry without re-running the route.
			// Deferred to a microtask: calling it synchronously inside this
			// same onMount - before the initial mount/hydration cycle has fully
			// settled - crashed the render ("Cannot read properties of
			// undefined ($set)"). Queuing it for the next tick avoids the
			// reentrant update.
			queueMicrotask(() => goto(resolve('/board'), { shallow: true, replace: true }));
		}
	});

	function closeModal() {
		showModal = false;
		selectedApp = null;
	}

	async function deleteApp(id: number, company: string) {
		if (!confirm(t('kanban.confirmDelete'))) return;
		try {
			const app = await db.applications.get(id);
			await db.applications.delete(id);
			collapsedIds.delete(id);
			if (app?.pdfRef) {
				await deletePdfFromOpfs(app.pdfRef);
			}
			announcer.announce(t('kanban.deletedAnnouncement').replace('{company}', company));
		} catch (err) {
			console.error('Failed to delete application:', err);
			alert(t('errors.deleteFailed'));
		}
	}

	let isExporting = $state(false);

	/** Shared by both export formats - see downloadBlob below. */
	function exportLabels() {
		return {
			header: [
				t('kanban.export.columnDate'),
				t('kanban.export.columnCompany'),
				t('kanban.export.columnStatus')
			] as [string, string, string],
			status: {
				draft: t('kanban.columns.draft'),
				sent: t('kanban.columns.sent'),
				interview: t('kanban.columns.interview'),
				accepted: t('kanban.columns.accepted'),
				rejected: t('kanban.columns.rejected')
			}
		};
	}

	let exportLocale = $derived(i18n.locale === 'de' ? 'de-DE' : 'en-GB');
	// What the export will actually list: toExportRows drops everything that
	// was never sent, so the buttons and the announcement count the same way.
	let exportCount = $derived(filteredApplications.filter(wasSent).length);

	function downloadBlob(blob: Blob, fileName: string) {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = fileName;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		announcer.announce(t('kanban.export.doneAnnouncement').replace('{count}', String(exportCount)));
	}

	/**
	 * Downloads the proof-of-applications list the Agentur für Arbeit asks
	 * for. Exports what the filter bar currently shows rather than adding a
	 * second set of controls next to it - minus anything never sent, which is
	 * not an application and has no place on a Nachweis.
	 */
	function exportCsv() {
		const csv = buildApplicationCsv(filteredApplications, exportLabels(), exportLocale);
		downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), exportFileName('csv'));
	}

	/** The printable version of the same list, for handing in on paper. */
	async function exportPdf() {
		isExporting = true;
		try {
			const bytes = await renderApplicationListPdf(
				filteredApplications,
				{
					...exportLabels(),
					heading: t('kanban.export.pdfHeading'),
					generated: t('kanban.export.pdfGenerated'),
					pageLabel: t('kanban.export.pdfPage')
				},
				exportLocale
			);
			downloadBlob(
				new Blob([bytes as BlobPart], { type: 'application/pdf' }),
				exportFileName('pdf')
			);
		} catch (err) {
			console.error('Failed to render the application list PDF:', err);
			alert(t('errors.exportFailed'));
		} finally {
			isExporting = false;
		}
	}

	// Native drag and drop logic
	let draggedId = $state<number | null>(null);
	let activeDragOverColumn = $state<string | null>(null);

	function handleDragStart(event: DragEvent, id: number) {
		draggedId = id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			// Firefox will not start a drag whose dataTransfer is empty. The
			// payload is never read back - see handleDrop.
			event.dataTransfer.setData('text/plain', String(id));
		}
	}

	function handleDragEnd() {
		draggedId = null;
		activeDragOverColumn = null;
	}

	// Shared by drag-and-drop and the card's keyboard/touch-friendly status
	// select, so both mausfreie and mouse paths move a card identically.
	async function moveApp(id: number, targetStatus: Status) {
		const app = ($applicationsStore ?? []).find((a) => a.id === id);
		if (!app) {
			// A move that does nothing and says nothing looks exactly like a
			// dead drop target - name the row instead.
			console.warn(`Cannot move application ${String(id)}: no row with that id`);
			return;
		}
		if (app.status === targetStatus) return;

		const now = Date.now();
		const currentHistory = $state.snapshot(app.history) || [];
		const updatedHistory = [...currentHistory, { status: targetStatus, timestamp: now }];
		try {
			await db.applications.update(id, {
				status: targetStatus,
				updatedAt: now,
				history: updatedHistory,
				// An entered rejection date belongs to the rejection it was entered
				// for; undefined makes Dexie drop the field.
				rejectedAt: undefined
			});
			announcer.announce(
				t('kanban.statusChangedAnnouncement')
					.replace('{company}', app.company)
					.replace('{status}', t(`kanban.columns.${targetStatus}`))
			);
		} catch (err) {
			console.error('Failed to move application:', err);
			alert(t('errors.moveFailed'));
		}
	}

	async function handleDrop(event: DragEvent, targetStatus: Status) {
		event.preventDefault();
		activeDragOverColumn = null;

		// The id comes from the dragstart this page saw, not from dataTransfer.
		// Reading it back as text and parseInt()ing it used to break silently
		// for every key that is not a plain integer - a row written past
		// TypeScript (see analytics.ts) has one - and matched a stray text
		// drop from any other window against a card by accident. draggedId is
		// the row key exactly as the status <select> hands it to moveApp().
		const id = draggedId;
		draggedId = null;
		if (id === null) return;

		await moveApp(id, targetStatus);
	}

	async function handleStatusSelect(event: Event, id: number) {
		const target = event.target as HTMLSelectElement;
		await moveApp(id, target.value as Status);
	}

	function handleDragOver(event: DragEvent, status: Status) {
		event.preventDefault();
		activeDragOverColumn = status;
	}

	function handleDragLeave() {
		activeDragOverColumn = null;
	}
</script>

<svelte:head>
	<title>{t('nav.kanban')} · {t('app.name')}</title>
</svelte:head>

<div class="dashboard">
	<!-- Active local in-app warnings -->
	{#if activeAlerts.length > 0}
		<div class="alerts-banner" role="alert">
			<div class="alerts-header">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="alert-icon"
				>
					<path
						d="M12 9v4M12 17h.01"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
					<path
						d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="alerts-title">{t('kanban.dueAlerts')} ({activeAlerts.length})</span>
			</div>
			<ul class="alerts-list">
				{#each activeAlerts as alert (alert.id)}
					<li>
						<strong>{alert.company}</strong> ({alert.title}) — {t('application.reminder')}
						{t('kanban.requiresFollowUp')}.
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="dashboard-header">
		<div>
			<h1>{t('nav.kanban')}</h1>
			<p class="subtitle">{t('kanban.subtitle')}</p>
		</div>
		<div class="header-actions">
			<button
				class="btn-secondary"
				onclick={exportPdf}
				disabled={exportCount === 0 || isExporting}
				title={t('kanban.export.hintPdf')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{isExporting ? t('kanban.export.working') : t('kanban.export.actionPdf')}
			</button>
			<button
				class="btn-secondary"
				onclick={exportCsv}
				disabled={exportCount === 0}
				title={t('kanban.export.hintCsv')}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('kanban.export.actionCsv')}
			</button>
			<button class="btn-primary" onclick={() => openAddModal('draft')}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M12 5v14M5 12h14"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
				{t('kanban.actions.add')}
			</button>
		</div>
	</div>

	<!-- Filter Toolbars -->
	<div class="filter-bar">
		<div class="search-input-wrapper">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
				class="search-icon"
			>
				<circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5" />
				<path
					d="M21 21l-4.35-4.35"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
			<input
				type="text"
				bind:value={searchFilter}
				placeholder={t('kanban.searchPlaceholder')}
				aria-label={t('actions.search')}
			/>
		</div>

		<div class="filter-dropdowns">
			<select bind:value={selectedTag} aria-label={t('application.tags')}>
				<option value="">{t('kanban.allTags')}</option>
				{#each allTags as tag (tag)}
					<option value={tag}>{tag}</option>
				{/each}
			</select>

			<select bind:value={selectedPriority} aria-label={t('application.priority')}>
				<option value="">{t('kanban.allPriorities')}</option>
				<option value="low">{t('application.priorities.low')}</option>
				<option value="medium">{t('application.priorities.medium')}</option>
				<option value="high">{t('application.priorities.high')}</option>
			</select>

			<select bind:value={selectedColor} aria-label={t('kanban.allColors')}>
				<option value="">{t('kanban.allColors')}</option>
				<option value="colored">✦ {t('kanban.coloredOnly')}</option>
				<option value="uncolored">{t('kanban.uncoloredOnly')}</option>
				{#each colorStore.auto as preset (preset.id)}
					<option value={preset.hex}>● {preset.labelKey || preset.hex}</option>
				{/each}
				{#each colorStore.custom as customHex (customHex)}
					<option value={customHex}>● {customHex}</option>
				{/each}
			</select>

			<select bind:value={selectedSortBy} aria-label={t('kanban.sortBy')}>
				<option value="default">{t('kanban.sortBy')}: {t('kanban.sortDefault')}</option>
				<option value="color">✦ {t('kanban.sortColor')}</option>
				<option value="priority">🔥 {t('kanban.sortPriority')}</option>
				<option value="date">📅 {t('kanban.sortDate')}</option>
			</select>

			<button
				type="button"
				class="btn-collapse-all"
				onclick={toggleAllCollapsed}
				disabled={filteredApplications.length === 0}
			>
				{allCollapsed ? t('kanban.expandAll') : t('kanban.collapseAll')}
			</button>
		</div>
	</div>

	<!-- Kanban Workspace -->
	<div class="kanban-board">
		{#each columns as col (col.id)}
			{@const columnApps = applicationsByColumn[col.id]}
			<div
				class="kanban-column"
				class:drag-over={activeDragOverColumn === col.id}
				ondragover={(e) => handleDragOver(e, col.id)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, col.id)}
				role="region"
				aria-label={t(col.labelKey)}
			>
				<header class="column-header" style:--col-color={col.color}>
					<div class="column-indicator"></div>
					<h2 class="column-title">{t(col.labelKey)}</h2>
					<span class="column-badge">{columnApps.length}</span>
					<button
						class="btn-col-add"
						onclick={() => openAddModal(col.id)}
						aria-label={t('kanban.addToColumn').replace('{status}', t(col.labelKey))}
					>
						+
					</button>
				</header>

				<ul class="cards-list">
					{#each columnApps as app (app.id)}
						{@const collapsed = collapsedIds.has(app.id!)}
						<li
							class="card"
							class:collapsed
							class:specular-card={!!app.cardColor && app.cardColor !== 'none'}
							style:--card-glow-color={app.cardColor && app.cardColor !== 'none'
								? app.cardColor
								: 'transparent'}
							draggable="true"
							ondragstart={(e) => handleDragStart(e, app.id!)}
							ondragend={handleDragEnd}
						>
							<div class="card-head">
								<button
									type="button"
									class="card-collapse-btn"
									onclick={() => toggleCollapsed(app.id!)}
									aria-expanded={!collapsed}
									aria-label={t(collapsed ? 'kanban.expandCard' : 'kanban.collapseCard').replace(
										'{company}',
										app.company
									)}
								>
									<span
										class="card-color-dot"
										class:uncolored={!app.cardColor || app.cardColor === 'none'}
										style:--dot-color={app.cardColor && app.cardColor !== 'none'
											? app.cardColor
											: undefined}
									></span>
								</button>
								<button type="button" class="card-open-btn" onclick={() => openEditModal(app)}>
									<div class="card-top">
										<span class="card-company">{app.company}</span>
										<span
											class="card-priority"
											class:priority-high={app.priority === 'high'}
											class:priority-low={app.priority === 'low'}
										>
											{t(`application.priorities.${app.priority}`)}
										</span>
									</div>
									{#if !collapsed}
										<h3 class="card-title">{app.title}</h3>

										{#if app.salary}
											<span class="card-salary">{app.salary}</span>
										{/if}
									{/if}

									{#if app.tags.length > 0 && !collapsed}
										<div class="card-tags">
											{#each app.tags.slice(0, 3) as tag (tag)}
												<span class="card-tag">{tag}</span>
											{/each}
											{#if app.tags.length > 3}
												<span class="card-tag-more">+{app.tags.length - 3}</span>
											{/if}
										</div>
									{/if}
								</button>
							</div>

							<footer class="card-footer">
								<span class="card-date">
									{new Date(getAppliedAt(app)).toLocaleDateString(i18n.locale, {
										day: 'numeric',
										month: 'short'
									})}
								</span>
								{#if !collapsed}
									<select
										class="card-status-select"
										value={app.status}
										onclick={(e) => e.stopPropagation()}
										onchange={(e) => {
											e.stopPropagation();
											handleStatusSelect(e, app.id!);
										}}
										aria-label={t('kanban.changeStatus').replace('{company}', app.company)}
									>
										{#each columns as statusOption (statusOption.id)}
											<option value={statusOption.id}>{t(statusOption.labelKey)}</option>
										{/each}
									</select>
								{/if}
								<button
									class="btn-card-dispatch"
									onclick={(e) => {
										e.stopPropagation();
										openDispatch(app);
									}}
									aria-label={t('dispatch.open')}
									title={t('dispatch.open')}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M4 6h16v12H4zM4 7l8 6 8-6"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
								<button
									class="btn-card-delete"
									onclick={(e) => {
										e.stopPropagation();
										deleteApp(app.id!, app.company);
									}}
									aria-label={t('kanban.deleteApplication').replace('{company}', app.company)}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							</footer>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	{#if dispatchApp}
		<ApplicationDispatchDialog application={dispatchApp} onclose={() => (dispatchApp = null)} />
	{/if}

	<!-- Modal -->
	{#if showModal}
		<ApplicationModal
			application={selectedApp}
			initialStatus={modalInitialStatus}
			onclose={closeModal}
			onsave={() => {
				closeModal();
			}}
		/>
	{/if}
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: 20px;
		height: 100%;
	}

	/* Amber is deliberately hardcoded rather than themed: this banner keeps its
	   warning colour in both themes. The text is deepened from #92400e (6.4:1)
	   so it clears AAA's 7:1 against the amber fill. */
	.alerts-banner {
		background-color: #fef3c7;
		border: 1px solid #fde68a;
		border-radius: var(--radius-lg);
		padding: 16px;
		color: #873b0d;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	:root.dark .alerts-banner {
		background-color: rgba(217, 119, 6, 0.15);
		border-color: rgba(217, 119, 6, 0.3);
		color: #f59e0b;
	}

	.alerts-header {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
	}

	.alert-icon {
		flex-shrink: 0;
	}

	.alerts-list {
		margin: 0;
		padding-left: 20px;
		font-size: 13px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dashboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.dashboard-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		margin: 0;
	}

	.subtitle {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 4px 0 0 0;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			transform var(--duration-fast) ease;
	}

	.btn-primary:hover {
		background-color: var(--color-accent-700);
	}

	.btn-primary:active {
		transform: scale(0.98);
	}

	.header-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		background-color: var(--surface-0);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			transform var(--duration-fast) ease;
	}

	.btn-secondary:hover:not(:disabled) {
		background-color: var(--surface-2);
	}

	.btn-secondary:active:not(:disabled) {
		transform: scale(0.98);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.filter-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: 12px 16px;
	}

	.search-input-wrapper {
		position: relative;
		flex: 1;
		max-width: 320px;
	}

	.search-icon {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-secondary);
	}

	.search-input-wrapper input {
		width: 100%;
		padding: 8px 12px 8px 36px;
		background-color: var(--surface-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		transition: border-color var(--duration-fast) ease;
	}

	.search-input-wrapper input:focus {
		border-color: var(--color-accent-500);
	}

	.filter-dropdowns {
		display: flex;
		gap: 8px;
	}

	.filter-dropdowns select {
		padding: 6px 12px;
		background-color: var(--surface-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}

	.btn-collapse-all {
		padding: 6px 12px;
		background-color: var(--surface-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		white-space: nowrap;
		cursor: pointer;
	}

	.btn-collapse-all:hover:not(:disabled) {
		background-color: var(--surface-2);
	}

	.kanban-board {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 16px;
		align-items: start;
		flex: 1;
		min-height: 500px;
		overflow-x: auto;
		padding-bottom: 20px;
	}

	.kanban-column {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 450px;
		transition:
			border-color var(--duration-fast) ease,
			background-color var(--duration-fast) ease;
	}

	.kanban-column.drag-over {
		border-color: var(--color-accent-500);
		background-color: var(--surface-1);
	}

	.column-header {
		display: flex;
		align-items: center;
		gap: 8px;
		--col-color: var(--color-kanban-draft);
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: 8px;
	}

	.column-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: var(--col-color);
	}

	.column-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		flex: 1;
	}

	.column-badge {
		font-size: 11px;
		font-weight: 600;
		background-color: var(--surface-2);
		color: var(--text-secondary);
		padding: 2px 6px;
		border-radius: var(--radius-pill);
	}

	.btn-col-add {
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 18px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-md);
		transition: background-color var(--duration-fast) ease;
	}

	.btn-col-add:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.cards-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 380px;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.card {
		background-color: var(--surface-1);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 12px;
		cursor: grab;
		display: flex;
		flex-direction: column;
		gap: 12px;
		transition:
			transform var(--duration-fast) var(--ease-out-expo),
			box-shadow var(--duration-fast) var(--ease-out-expo),
			border-color var(--duration-fast) ease;
	}

	/* Opens the edit modal - wraps everything except the footer controls
	   (status select, delete) so those stay independently reachable instead
	   of nesting interactive elements inside this button (see issue #20). */
	.card-open-btn {
		display: block;
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.card.collapsed {
		gap: 6px;
	}

	.card:hover {
		border-color: var(--border-strong);
		box-shadow: var(--shadow-md);
	}

	.card.specular-card {
		border: 1.5px solid color-mix(in srgb, var(--card-glow-color) 65%, var(--border-default));
		box-shadow:
			0 4px 24px -6px color-mix(in srgb, var(--card-glow-color) 35%, transparent),
			inset 0 1px 2px 0 color-mix(in srgb, var(--card-glow-color) 25%, transparent);
		position: relative;
		overflow: hidden;
	}

	/* Specular shining reflection effect inspired by reactbits.dev specular-button */
	.card.specular-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: -150%;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			115deg,
			transparent 20%,
			color-mix(in srgb, var(--card-glow-color) 65%, white) 50%,
			transparent 80%
		);
		transform: skewX(-25deg);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--duration-normal) ease;
	}

	.card.specular-card:hover {
		border-color: var(--card-glow-color);
		box-shadow:
			0 8px 32px -4px color-mix(in srgb, var(--card-glow-color) 65%, transparent),
			0 0 18px -2px color-mix(in srgb, var(--card-glow-color) 45%, transparent),
			inset 0 1px 3px 0 color-mix(in srgb, var(--card-glow-color) 50%, white);
		transform: translateY(-3px) scale(1.01);
	}

	.card.specular-card:hover::before {
		opacity: 0.4;
		animation: specular-shine-sweep 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes specular-shine-sweep {
		0% {
			left: -150%;
			opacity: 0.1;
		}
		50% {
			opacity: 0.45;
		}
		100% {
			left: 150%;
			opacity: 0;
		}
	}

	.card:active {
		cursor: grabbing;
	}

	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}

	.card-head {
		display: flex;
		align-items: flex-start;
		gap: 2px;
	}

	/* 24px target (WCAG 2.5.8) around a 10px dot; the negative margin lets it
	   reach into the card padding instead of pushing the text over. */
	.card-collapse-btn {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		margin: -6px 0 -6px -7px;
		padding: 0;
		background: none;
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}

	.card-collapse-btn:hover {
		background-color: var(--surface-3);
	}

	.card-color-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: var(--dot-color);
		box-shadow: 0 0 8px var(--dot-color);
	}

	.card-color-dot.uncolored {
		background-color: var(--text-tertiary);
		box-shadow: none;
	}

	.card-head .card-open-btn {
		flex: 1;
		min-width: 0;
	}

	.card-company {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.card-priority {
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		background-color: var(--surface-3);
		color: var(--text-secondary);
	}

	.card-priority.priority-high {
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
	}

	.card-priority.priority-low {
		background-color: rgba(107, 114, 128, 0.1);
		color: var(--text-tertiary);
	}

	.card-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		line-height: 1.4;
	}

	.card-salary {
		font-size: 12px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.card-tag {
		font-size: 10px;
		font-weight: 500;
		background-color: var(--surface-2);
		border: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		padding: 2px 6px;
		border-radius: var(--radius-pill);
	}

	.card-tag-more {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-tertiary);
		align-self: center;
	}

	.card-footer {
		display: flex;
		align-items: center;
		gap: 6px;
		border-top: 1px solid var(--border-subtle);
		padding-top: 8px;
		margin-top: 4px;
	}

	.card-date {
		flex: 1;
		font-size: 10px;
		color: var(--text-tertiary);
	}

	.card-status-select {
		font-size: 10px;
		font-family: inherit;
		color: var(--text-secondary);
		background-color: var(--surface-2);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		padding: 3px 4px;
		max-width: 90px;
		cursor: pointer;
	}

	.btn-card-dispatch {
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.btn-card-dispatch:hover {
		background-color: var(--surface-2);
		color: var(--color-accent-text);
	}

	.btn-card-delete {
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.btn-card-delete:hover {
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
	}

	@media (max-width: 1024px) {
		.kanban-board {
			grid-template-columns: repeat(5, 240px);
		}
	}

	@media (max-width: 768px) {
		.dashboard-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}

		.header-actions {
			width: 100%;
		}

		.btn-primary,
		.btn-secondary {
			flex: 1;
			justify-content: center;
		}

		.filter-bar {
			flex-direction: column;
			align-items: stretch;
		}

		.search-input-wrapper {
			max-width: none;
		}

		/* Stacked full-width rather than wrapped: `flex: 1` on the selects below
		   sets `flex-basis: 0%`, which lets every item shrink to fit one line
		   instead of ever triggering `flex-wrap` - so on a phone all four selects
		   used to cram onto one row at ~75px each, truncating every label to a
		   couple of characters ("Alle Tags" -> "Al"). A 2-column grid was tried
		   first, but "Sortieren nach: Standard" (the sort select's default
		   label) doesn't fit in half of even a 390px screen without clipping;
		   full-width rows are what actually keeps every label readable. */
		.filter-dropdowns {
			flex-direction: column;
			align-items: stretch;
		}

		.filter-dropdowns select {
			width: 100%;
		}

		/* Below tablet width the board reflows into a vertical stack of full-
		   width columns instead of forcing horizontal overflow. */
		.kanban-board {
			grid-template-columns: 1fr;
			overflow-x: visible;
		}

		.kanban-column {
			min-height: 0;
		}

		.cards-list {
			min-height: 0;
		}
	}
</style>
