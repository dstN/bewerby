<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.js';
</script>

<svelte:head>
	<title>{t('legal.nutzungsbedingungen.title')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.nutzungsbedingungen.title')}</h1>
		<p class="intro">{t('legal.nutzungsbedingungen.intro')}</p>
	</header>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.scopeTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.scopeBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.serviceTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.serviceBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.dataResponsibilityTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.dataResponsibilityBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.availabilityTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.availabilityBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.liabilityTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.liabilityBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.changesTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.changesBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.nutzungsbedingungen.lawTitle')}</h2>
		<p>{t('legal.nutzungsbedingungen.lawBody')}</p>
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
</style>
