<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
</script>

<svelte:head>
	<title>{t('legal.impressum.title')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.impressum.title')}</h1>
	</header>

	<div class="placeholder-banner" role="note">
		{t('legal.placeholderBanner')}
	</div>

	<section class="legal-card">
		<h2>{t('legal.impressum.infoTitle')}</h2>
		<p class="placeholder">{t('legal.impressum.namePlaceholder')}</p>
		<p class="placeholder">{t('legal.impressum.addressPlaceholder')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.impressum.contactTitle')}</h2>
		<p class="placeholder">{t('legal.impressum.contactPlaceholder')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.impressum.responsibleTitle')}</h2>
		<p class="placeholder">{t('legal.impressum.responsiblePlaceholder')}</p>
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
	}

	.legal-card h2 {
		font-size: 15px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 12px 0;
	}

	.legal-card p {
		font-size: 13px;
		line-height: 1.7;
		color: var(--text-secondary);
		margin: 0 0 4px 0;
		white-space: pre-line;
	}

	.placeholder {
		font-family: var(--font-mono);
		color: var(--color-warning);
		background-color: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 6px 10px;
		display: inline-block;
	}
</style>
