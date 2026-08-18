<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
</script>

<svelte:head>
	<title>{t('legal.datenschutz.title')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.datenschutz.title')}</h1>
		<p class="intro">{t('legal.datenschutz.intro')}</p>
	</header>

	<div class="placeholder-banner" role="note">
		{t('legal.placeholderBanner')}
	</div>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.controllerTitle')}</h2>
		<p class="placeholder">{t('legal.datenschutz.controllerPlaceholder')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.principleTitle')}</h2>
		<p>{t('legal.datenschutz.principleBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.storageTitle')}</h2>
		<div class="storage-item">
			<h3>{t('legal.datenschutz.storageIndexedDbTitle')}</h3>
			<p>{t('legal.datenschutz.storageIndexedDbDesc')}</p>
		</div>
		<div class="storage-item">
			<h3>{t('legal.datenschutz.storageOpfsTitle')}</h3>
			<p>{t('legal.datenschutz.storageOpfsDesc')}</p>
		</div>
		<div class="storage-item">
			<h3>{t('legal.datenschutz.storageLocalTitle')}</h3>
			<p>{t('legal.datenschutz.storageLocalDesc')}</p>
			<table class="storage-table">
				<thead>
					<tr>
						<th scope="col">{t('legal.datenschutz.storageTableKeyHeader')}</th>
						<th scope="col">{t('legal.datenschutz.storageTablePurposeHeader')}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td><code>bewerby-theme</code></td>
						<td>{t('legal.datenschutz.storageKeyThemeDesc')}</td>
					</tr>
					<tr>
						<td><code>bewerby-locale</code></td>
						<td>{t('legal.datenschutz.storageKeyLocaleDesc')}</td>
					</tr>
					<tr>
						<td><code>bewerby_custom_colors</code></td>
						<td>{t('legal.datenschutz.storageKeyColorsDesc')}</td>
					</tr>
					<tr>
						<td><code>bewerby_notified_*</code></td>
						<td>{t('legal.datenschutz.storageKeyNotifiedDesc')}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.noTrackingTitle')}</h2>
		<p>{t('legal.datenschutz.noTrackingBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.hostingTitle')}</h2>
		<p>{t('legal.datenschutz.hostingBody')}</p>
		<p class="placeholder">{t('legal.datenschutz.hostingPlaceholder')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.rightsTitle')}</h2>
		<p>{t('legal.datenschutz.rightsBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.contactRightsTitle')}</h2>
		<p class="placeholder">{t('legal.datenschutz.contactRightsPlaceholder')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.changesTitle')}</h2>
		<p>{t('legal.datenschutz.changesBody')}</p>
	</section>
</div>

<style>
	.legal-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 720px;
	}

	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		margin: 0;
	}

	.intro {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 6px 0 0 0;
		line-height: 1.6;
	}

	.placeholder-banner {
		background-color: rgba(217, 119, 6, 0.1);
		border: 1px solid rgba(217, 119, 6, 0.3);
		border-radius: var(--radius-lg);
		padding: 14px 16px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--color-warning);
		font-weight: 500;
	}

	:root.dark .placeholder-banner {
		background-color: rgba(217, 119, 6, 0.15);
	}

	.legal-card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.legal-card h2 {
		font-size: 15px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 4px 0;
	}

	.legal-card p {
		font-size: 13px;
		line-height: 1.7;
		color: var(--text-secondary);
		margin: 0;
		white-space: pre-line;
	}

	.storage-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 8px;
		border-top: 1px solid var(--border-subtle);
	}

	.storage-item:first-of-type {
		padding-top: 0;
		border-top: none;
	}

	.storage-item h3 {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.storage-table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 8px;
		font-size: 12px;
	}

	.storage-table th,
	.storage-table td {
		text-align: left;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border-subtle);
		color: var(--text-secondary);
	}

	.storage-table th {
		font-weight: 600;
		color: var(--text-primary);
	}

	.storage-table code {
		font-family: var(--font-mono);
		font-size: 11px;
		background-color: var(--surface-2);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.placeholder {
		font-family: var(--font-mono);
		color: var(--color-warning);
		background-color: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 6px 10px;
		display: inline-block;
		width: fit-content;
	}
</style>
