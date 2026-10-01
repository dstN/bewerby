<script lang="ts">
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db/index.js';
	import { t } from '$lib/i18n/index.svelte.js';
	import { computeApplicationStats, type AnalyticsRow } from '$lib/utils/analytics.js';

	// Analytics only ever reads status, history and the entered dates - project down to that instead
	// of holding every field (title, notes, contact info, pdfRef, ...) of
	// every application in the reactive store.
	const applicationsStore = liveQuery(async (): Promise<AnalyticsRow[]> =>
		(await db.applications.toArray()).map(({ status, history, sentAt, rejectedAt }) => ({
			status,
			history,
			sentAt,
			rejectedAt
		}))
	);

	// Funnel and Response Time metrics; the actual computation is a plain,
	// unit-tested function (see analytics.test.ts) - this just feeds it the
	// live query's current value reactively.
	let stats = $derived(computeApplicationStats($applicationsStore ?? []));
</script>

<svelte:head>
	<title>{t('nav.analytics')} · {t('app.name')}</title>
</svelte:head>

<div class="analytics-page">
	<header class="page-header">
		<h1>{t('nav.analytics')}</h1>
		<p class="subtitle">{t('analytics.subtitle')}</p>
	</header>

	{#if ($applicationsStore ?? []).length === 0}
		<div class="empty-container">
			<div class="empty-state">
				<div class="empty-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M3 3v18h18"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path
							d="M7 17l4-5 4 3 5-7"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
				<p>{t('empty.analytics')}</p>
			</div>
		</div>
	{:else}
		<div class="analytics-grid">
			<!-- Metrics panel -->
			<section class="card stats-summary">
				<h2 class="section-title">{t('analytics.statusOverview')}</h2>
				<div class="metrics-row">
					<div class="metric-box">
						<span class="metric-val">{stats.counts.draft}</span>
						<span class="metric-label">{t('kanban.columns.draft')}</span>
					</div>
					<div class="metric-box">
						<span class="metric-val">{stats.counts.sent}</span>
						<span class="metric-label">{t('kanban.columns.sent')}</span>
					</div>
					<div class="metric-box">
						<span class="metric-val">{stats.counts.interview}</span>
						<span class="metric-label">{t('kanban.columns.interview')}</span>
					</div>
					<div class="metric-box">
						<span class="metric-val text-success">{stats.counts.accepted}</span>
						<span class="metric-label">{t('kanban.columns.accepted')}</span>
					</div>
					<div class="metric-box">
						<span class="metric-val text-danger">{stats.counts.rejected}</span>
						<span class="metric-label">{t('kanban.columns.rejected')}</span>
					</div>
				</div>
			</section>

			<!-- Funnel analysis -->
			<section class="card funnel-card">
				<h2 class="section-title">{t('analytics.funnelTitle')}</h2>
				<p class="card-desc">{t('analytics.funnelDesc')}</p>

				<div class="funnel-visualization">
					<!-- Funnel Step 1 -->
					<div class="funnel-step">
						<div class="step-meta">
							<span class="step-num">1</span>
							<span class="step-name">{t('kanban.columns.sent')}</span>
						</div>
						<div class="step-bar-wrapper">
							<div class="step-bar" style:width="100%"></div>
							<span class="step-count">{stats.funnel.sent}</span>
						</div>
					</div>

					<!-- Funnel Step 2 -->
					<div class="funnel-step">
						<div class="step-meta">
							<span class="step-num">2</span>
							<span class="step-name">{t('analytics.stepSelection')}</span>
						</div>
						<div class="step-bar-wrapper">
							<div
								class="step-bar accent-bar"
								style:width="{stats.funnel.sent > 0
									? (stats.funnel.selection / stats.funnel.sent) * 100
									: 0}%"
							></div>
							<span class="step-count">{stats.funnel.selection}</span>
						</div>
						{#if stats.funnel.sent > 0}
							<span class="step-percentage"
								>↳ {stats.funnel.selectionRate}% {t('analytics.selectionRate')}</span
							>
						{/if}
					</div>

					<!-- Funnel Step 3 -->
					<div class="funnel-step">
						<div class="step-meta">
							<span class="step-num">3</span>
							<span class="step-name">{t('kanban.columns.accepted')}</span>
						</div>
						<div class="step-bar-wrapper">
							<div
								class="step-bar success-bar"
								style:width="{stats.funnel.sent > 0
									? (stats.funnel.success / stats.funnel.sent) * 100
									: 0}%"
							></div>
							<span class="step-count text-success">{stats.funnel.success}</span>
						</div>
						{#if stats.funnel.selection > 0}
							<span class="step-percentage text-success"
								>↳ {stats.funnel.successRate}% {t('analytics.successRate')}</span
							>
						{/if}
					</div>
				</div>

				<div class="funnel-totals">
					<div class="total-box">
						<span class="total-val">{stats.funnel.totalConversion}%</span>
						<span class="total-label">{t('analytics.totalConversion')}</span>
					</div>
				</div>
			</section>

			<!-- Response time panel -->
			<section class="card response-card">
				<h2 class="section-title">{t('analytics.responseTitle')}</h2>
				<p class="card-desc">{t('analytics.responseDesc')}</p>

				{#if stats.response.count === 0}
					<div class="no-times-alert">
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
							class="info-icon"
						>
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" />
							<path
								d="M12 16v-4M12 8h.01"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						{t('analytics.noDataAlert')}
					</div>
				{:else}
					<div class="times-grid">
						<div class="time-box">
							<span class="time-label">{t('analytics.bestTime')}</span>
							<span class="time-val text-success"
								>{stats.response.best} <span class="time-unit">{t('analytics.days')}</span></span
							>
						</div>

						<div class="time-box">
							<span class="time-label">{t('analytics.avgTime')}</span>
							<span class="time-val"
								>{stats.response.avg} <span class="time-unit">{t('analytics.days')}</span></span
							>
						</div>

						<div class="time-box">
							<span class="time-label">{t('analytics.worstTime')}</span>
							<span class="time-val text-danger"
								>{stats.response.worst} <span class="time-unit">{t('analytics.days')}</span></span
							>
						</div>
					</div>
					<div class="times-meta">
						{t('analytics.basedOn').replace('{count}', stats.response.count.toString())}
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.analytics-page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		height: 100%;
		width: 100%;
	}

	.page-header h1 {
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

	.analytics-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 20px;
	}

	.card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 24px;
		box-shadow: var(--shadow-sm);
	}

	.section-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 16px 0;
		letter-spacing: -0.01em;
	}

	.card-desc {
		font-size: 13px;
		color: var(--text-secondary);
		margin: -8px 0 20px 0;
	}

	.metrics-row {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 12px;
	}

	.metric-box {
		background-color: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 16px 12px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.metric-val {
		font-size: 22px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.metric-label {
		font-size: 12px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.text-success {
		color: var(--color-success);
	}

	.text-danger {
		color: var(--color-danger);
	}

	.funnel-visualization {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 24px;
	}

	.funnel-step {
		display: grid;
		grid-template-columns: 180px 1fr 120px;
		align-items: center;
		gap: 16px;
	}

	.step-meta {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.step-num {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background-color: var(--surface-2);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
	}

	.step-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.step-bar-wrapper {
		height: 28px;
		background-color: var(--surface-1);
		border-radius: var(--radius-sm);
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		padding: 0 12px;
	}

	.step-bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background-color: var(--text-tertiary);
		opacity: 0.8;
		transition: width var(--duration-slow) var(--ease-out-expo);
	}

	.accent-bar {
		background-color: var(--color-accent-500);
		opacity: 1;
	}

	.success-bar {
		background-color: var(--color-success);
		opacity: 1;
	}

	.step-count {
		font-size: 13px;
		font-weight: 700;
		position: relative;
		z-index: 1;
		color: var(--text-primary);
		background-color: var(--surface-0);
		padding: 1px 6px;
		border-radius: var(--radius-pill);
	}

	.step-percentage {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		text-align: right;
	}

	.funnel-totals {
		border-top: 1px solid var(--border-default);
		padding-top: 16px;
	}

	.total-box {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.total-val {
		font-size: 24px;
		font-weight: 700;
		/* --color-accent-600 only clears 4.5:1 as text on a light surface; the
		   dedicated text-role token is needed in the dark theme (see #17). */
		color: var(--color-accent-text);
	}

	.total-label {
		font-size: 13px;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.no-times-alert {
		display: flex;
		align-items: center;
		gap: 8px;
		background-color: var(--surface-1);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: 16px;
		font-size: 13px;
		color: var(--text-secondary);
	}

	.info-icon {
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.times-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin-bottom: 12px;
	}

	.time-box {
		background-color: var(--surface-1);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.time-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.time-val {
		font-size: 24px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.time-unit {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-tertiary);
	}

	.times-meta {
		font-size: 11px;
		color: var(--text-tertiary);
	}

	.empty-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
	}

	.empty-icon {
		color: var(--text-tertiary);
		margin-bottom: 12px;
	}

	@media (max-width: 768px) {
		.metrics-row {
			grid-template-columns: 1fr 1fr;
		}

		.funnel-step {
			grid-template-columns: 1fr;
			gap: 8px;
			align-items: stretch;
		}

		.step-percentage {
			text-align: left;
			padding-left: 34px;
		}

		.times-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
