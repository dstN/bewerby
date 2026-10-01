<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { t } from '#lib/i18n/index.svelte.js';
</script>

<svelte:head>
	<title>{t('errorPage.title')} · {t('app.name')}</title>
</svelte:head>

<div class="error-page">
	<div class="error-card">
		<h1>{t('errorPage.title')}</h1>
		<p class="message">{t('errorPage.message')}</p>
		{#if page.error?.message}
			<p class="detail">{page.error.message}</p>
		{/if}
		<div class="actions">
			<button class="btn-primary" onclick={() => window.location.reload()}>
				{t('errorPage.reload')}
			</button>
			<a class="btn-flat" href={resolve('/')}>{t('errorPage.home')}</a>
		</div>
	</div>
</div>

<style>
	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 24px;
		background-color: var(--surface-1);
	}

	.error-card {
		max-width: 420px;
		width: 100%;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		padding: 32px;
		text-align: center;
	}

	.error-card h1 {
		font-size: 20px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 12px 0;
	}

	.message {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0 0 8px 0;
	}

	.detail {
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		background-color: var(--surface-2);
		border-radius: var(--radius-md);
		padding: 8px 12px;
		margin: 12px 0 0 0;
		word-break: break-word;
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 12px;
		margin-top: 24px;
	}

	.btn-primary {
		padding: 8px 16px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-primary:hover {
		background-color: var(--color-accent-700);
	}

	.btn-flat {
		display: inline-flex;
		align-items: center;
		padding: 8px 16px;
		background: transparent;
		color: var(--text-secondary);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		font-size: 14px;
		font-weight: 500;
		text-decoration: none;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.btn-flat:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}
</style>
