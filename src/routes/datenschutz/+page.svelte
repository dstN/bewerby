<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import { resolve } from '$app/paths';
	import ObfuscatedEmail from '$lib/components/common/ObfuscatedEmail.svelte';
</script>

<svelte:head>
	<title>{t('legal.datenschutz.title')} · {t('app.name')}</title>
</svelte:head>

<div class="legal-page">
	<header class="page-header">
		<h1>{t('legal.datenschutz.title')}</h1>
		<p class="intro">{t('legal.datenschutz.intro')}</p>
	</header>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.controllerTitle')}</h2>
		<!-- Verbatim, not i18n'd - see the identical note on the Impressum page. -->
		<address>
			Dustin Tramm<br />
			c/o Impressumservice Dein-Impressum<br />
			Stettiner Str. 41<br />
			35410 Hungen<br />
			Deutschland
		</address>
		<p><ObfuscatedEmail /></p>
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
			<h3>{t('legal.datenschutz.storageKeysTitle')}</h3>
			<p>{t('legal.datenschutz.storageKeysDesc')}</p>
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
						<td><code>bewerby-profile</code></td>
						<td>{t('legal.datenschutz.storageKeyProfileDesc')}</td>
					</tr>
					<tr>
						<td><code>bewerby_notified_*</code></td>
						<td>{t('legal.datenschutz.storageKeyNotifiedDesc')}</td>
					</tr>
					<tr>
						<td><code>bewerby-collapsed-cards</code></td>
						<td>{t('legal.datenschutz.storageKeyCollapsedDesc')}</td>
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
		<!-- Netcup's own registered business address - real, verbatim, not i18n'd. -->
		<address>
			Netcup GmbH<br />
			Daimlerstraße 25<br />
			76185 Karlsruhe<br />
			Deutschland
		</address>
		<p>{t('legal.datenschutz.hostingProcessing')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.rightsTitle')}</h2>
		<p>{t('legal.datenschutz.rightsBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.adFetchTitle')}</h2>
		<p>{t('legal.datenschutz.adFetchBody')}</p>
		<p>{t('legal.datenschutz.adFetchStorage')}</p>
		<p>{t('legal.datenschutz.adFetchThirdParty')}</p>
	</section>

	<section class="legal-card" id="synchronisation">
		<h2>{t('legal.datenschutz.syncTitle')}</h2>
		<p>{t('legal.datenschutz.syncBody')}</p>
		<p>{t('legal.datenschutz.syncFolderBody')}</p>
		<p>{t('legal.datenschutz.syncDropboxBody')}</p>
		<p>{t('legal.datenschutz.syncReturnBody')}</p>
	</section>

	<section class="legal-card" id="kontaktformular">
		<h2>{t('legal.datenschutz.contactFormTitle')}</h2>
		<p>{t('legal.datenschutz.contactFormBody')}</p>
	</section>

	<section class="legal-card">
		<h2>{t('legal.datenschutz.contactRightsTitle')}</h2>
		<p><ObfuscatedEmail /> · <a href={resolve('/kontakt')}>{t('nav.kontakt')}</a></p>
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

	/*
	 * `table-layout: fixed` because the automatic algorithm sizes columns by their
	 * content's minimum width, and the longest key (`bewerby_custom_colors`) has no
	 * break opportunity — so at 320px the table ran 3px past the viewport instead
	 * of wrapping. Only 3px, and only on Linux, where Lexend renders a shade wider
	 * than on Windows: the reason this passed locally while failing in CI. Fixed
	 * layout takes the widths from the header row rather than from the content, so
	 * the outcome no longer depends on font metrics.
	 */
	.storage-table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		margin-top: 8px;
		font-size: 12px;
	}

	/* The key column holds identifiers, the purpose column holds prose. Without
	   this split the fixed algorithm would give both an equal share. */
	.storage-table th:first-child {
		width: 40%;
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
		/* Storage keys are single unbroken tokens, so without this they would
		   overflow their column however wide the column is told to be. */
		overflow-wrap: anywhere;
	}

	.legal-card address {
		font-size: 13px;
		line-height: 1.7;
		font-style: normal;
		color: var(--text-secondary);
	}

	.legal-card a {
		color: var(--color-accent-text);
	}
</style>
