<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import {
		getNotificationPermissionState,
		requestNotificationPermission
	} from '$lib/utils/reminders.js';

	let permissionState = $derived(getNotificationPermissionState());

	async function toggleNotifications() {
		const result = await requestNotificationPermission();
		permissionState = result;
	}
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>{t('settings.title')}</h1>
		<p class="subtitle">{t('settings.subtitle')}</p>
	</header>

	<div class="settings-grid">
		<!-- Notification settings card -->
		<section class="settings-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.remindersTitle')}
			</h2>
			<p class="card-desc">{t('settings.remindersDesc')}</p>

			<div class="settings-control">
				<div class="status-info">
					<span class="status-label">{t('settings.statusLabel')}</span>
					<span
						class="status-badge"
						class:granted={permissionState === 'granted'}
						class:denied={permissionState === 'denied'}
					>
						{#if permissionState === 'granted'}
							{t('settings.statusActive')}
						{:else}
							{t('settings.statusInactive')}
						{/if}
					</span>
				</div>

				{#if permissionState !== 'granted'}
					<button class="btn-primary" onclick={toggleNotifications}>
						{t('settings.btnAllow')}
					</button>
				{/if}
			</div>
		</section>

		<!-- Privacy & Offline Info Card -->
		<section class="settings-card info-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.privacyTitle')}
			</h2>
			<ul class="info-list">
				<li>
					<strong>{t('settings.privacyItem1Title')}:</strong>
					{t('settings.privacyItem1Desc')}
				</li>
				<li>
					<strong>{t('settings.privacyItem2Title')}:</strong>
					{t('settings.privacyItem2Desc')}
				</li>
				<li>
					<strong>{t('settings.privacyItem3Title')}:</strong>
					{t('settings.privacyItem3Desc')}
				</li>
			</ul>
		</section>
	</div>
</div>

<style>
	.settings-page {
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

	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		align-items: start;
	}

	.settings-card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.card-icon {
		color: var(--color-accent-600);
	}

	.card-desc {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0;
	}

	.settings-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		border-top: 1px solid var(--border-default);
		padding-top: 16px;
		margin-top: 8px;
	}

	.status-info {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.status-label {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.status-badge {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background-color: var(--surface-2);
		color: var(--text-secondary);
	}

	.status-badge.granted {
		background-color: rgba(22, 163, 74, 0.1);
		color: var(--color-success);
	}

	.status-badge.denied {
		background-color: rgba(220, 38, 38, 0.1);
		color: var(--color-danger);
	}

	.btn-primary {
		padding: 8px 16px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-primary:hover {
		background-color: var(--color-accent-700);
	}

	.info-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.info-list li {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	@media (max-width: 768px) {
		.settings-grid {
			grid-template-columns: 1fr;
		}

		.settings-control {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
	}
</style>
