<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/index.svelte.js';
	import { readCallback, takeAuthorization } from '$lib/sync/oauth.js';
	import { exchangeDropboxCode } from '$lib/sync/adapters/dropbox.js';
	import { DROPBOX_CLIENT_ID } from '$lib/sync/targets.js';
	import { JUST_CONNECTED, SyncState } from '$lib/sync/state.js';

	/**
	 * Where Dropbox sends the user back after sign-in (#53). The service
	 * worker answers this route from its cache, so the code in the URL does
	 * not reach the server at all once bewerby is installed; it is removed
	 * from the address bar and the history straight away regardless.
	 */
	let failed = $state(false);

	onMount(async () => {
		const result = readCallback(new URL(location.href));
		queueMicrotask(() => replaceState(resolve('/cloud/callback'), {}));
		const pending = takeAuthorization(result.state);
		if (!pending || result.error || !result.code || !DROPBOX_CLIENT_ID) {
			failed = true;
			return;
		}
		try {
			const target = await exchangeDropboxCode({
				clientId: DROPBOX_CLIENT_ID,
				code: result.code,
				verifier: pending.verifier,
				redirectUri: pending.redirectUri
			});
			await new SyncState().setTarget(target);
			// Tells the backup page to finish connecting (join or start syncing).
			sessionStorage.setItem(JUST_CONNECTED, 'dropbox');
			await goto(resolve('/backup'), { replaceState: true });
		} catch (err) {
			console.error('Completing the Dropbox sign-in failed:', err);
			failed = true;
		}
	});
</script>

<svelte:head>
	<title>{t('sync.callbackTitle')} · {t('app.name')}</title>
</svelte:head>

<div class="callback-page">
	<h1>{t('sync.callbackTitle')}</h1>
	{#if failed}
		<p role="alert">{t('sync.callbackFailed')}</p>
		<a href={resolve('/backup')}>{t('sync.backToBackup')}</a>
	{:else}
		<p role="status">{t('sync.callbackWorking')}</p>
	{/if}
</div>

<style>
	.callback-page {
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 560px;
	}

	h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text-primary);
	}

	p {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	a {
		color: var(--color-accent-text);
		font-size: 14px;
		font-weight: 600;
	}
</style>
