<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import ObfuscatedEmail from '$lib/components/common/ObfuscatedEmail.svelte';
</script>

<svelte:head>
	<title>{t('legal.impressum.title')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.impressum.title')}</h1>
	</header>

	<section class="legal-card">
		<h2>{t('legal.impressum.infoTitle')}</h2>
		<!-- A postal address is a legally required verbatim detail (§ 5 DDG) and
		     reads identically in every language, so it stays literal here rather
		     than going through i18n - only the surrounding labels are translated. -->
		<address>
			Dustin Tramm<br />
			c/o Impressumservice Dein-Impressum<br />
			Stettiner Str. 41<br />
			35410 Hungen<br />
			Deutschland
		</address>
	</section>

	<section class="legal-card">
		<h2>{t('legal.impressum.contactTitle')}</h2>
		<p>{t('legal.impressum.contactEmailLabel')}: <ObfuscatedEmail /></p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.impressum.responsibleTitle')}</h2>
		<address>
			Dustin Tramm<br />
			c/o Impressumservice Dein-Impressum<br />
			Stettiner Str. 41<br />
			35410 Hungen<br />
			Deutschland
		</address>
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

	.legal-card address {
		font-size: 13px;
		line-height: 1.7;
		font-style: normal;
		color: var(--text-secondary);
	}
</style>
