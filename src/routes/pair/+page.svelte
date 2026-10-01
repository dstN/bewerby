<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/index.svelte.js';
	import { announcer } from '$lib/stores/announcer.svelte.js';
	import { joinAsGuest, parsePairingCode, type GuestState } from '$lib/sync/live/pairing.js';

	/**
	 * The new device's side of adding a device (#55). The pairing secret
	 * arrives in the URL fragment - which browsers never send to a server -
	 * or typed in. It is removed from the address bar right away.
	 */
	let pairing = $state<GuestState | null>(null);
	let typed = $state('');
	let error = $state<string | null>(null);
	let remember = $state(true);
	const abort = new AbortController();

	function start(secret: Uint8Array<ArrayBuffer>) {
		error = null;
		void joinAsGuest(
			secret,
			remember,
			(next) => {
				pairing = next;
				if (next.step === 'done') announcer.announce(t('pair.joinedDone'));
				if (next.step === 'failed') announcer.announce(t('pair.joinFailed'));
			},
			abort
		);
	}

	onMount(() => {
		const secret = parsePairingCode(new URLSearchParams(location.hash.slice(1)).get('p') ?? '');
		if (location.hash) queueMicrotask(() => replaceState(resolve('/pair'), {}));
		if (secret) start(secret);
		return () => abort.abort();
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const secret = parsePairingCode(typed);
		if (!secret) {
			error = t('pair.codeInvalid');
			return;
		}
		start(secret);
	}
</script>

<svelte:head>
	<title>{t('pair.joinTitle')} · {t('app.name')}</title>
</svelte:head>

<div class="pair-page">
	<h1>{t('pair.joinTitle')}</h1>

	{#if pairing === null || pairing.step === 'failed'}
		{#if pairing?.step === 'failed'}
			<p class="error" role="alert">{t('pair.joinFailed')}</p>
		{/if}
		<p>{t('pair.joinIntro')}</p>
		<form onsubmit={submit} novalidate>
			<label for="pair-code">{t('pair.codeLabel')}</label>
			<input
				id="pair-code"
				type="text"
				autocomplete="off"
				spellcheck="false"
				placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
				aria-describedby={error ? 'pair-code-error' : undefined}
				bind:value={typed}
			/>
			<label class="choice">
				<input type="checkbox" bind:checked={remember} />
				{t('backup.vault.remember')}
			</label>
			{#if error}
				<p class="error" id="pair-code-error" role="alert">{error}</p>
			{/if}
			<button type="submit" class="btn-primary">{t('pair.join')}</button>
		</form>
	{:else if pairing.step === 'connecting'}
		<p role="status">{t('pair.connecting')}</p>
	{:else if pairing.step === 'compare'}
		<p>{t('pair.compareGuest')}</p>
		<p class="compare" data-testid="pair-compare">
			{pairing.code.slice(0, 3)}
			{pairing.code.slice(3)}
		</p>
	{:else if pairing.step === 'syncing'}
		<p role="status">{t('pair.syncing')}</p>
	{:else}
		<p>{t('pair.joinedDone')}</p>
		<a class="btn-primary" href={resolve('/board')}>{t('pair.toBoard')}</a>
	{/if}
</div>

<style>
	.pair-page {
		display: flex;
		flex-direction: column;
		gap: 14px;
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

	form {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	input[type='text'] {
		width: 100%;
		height: 36px;
		padding: 8px 12px;
		box-sizing: border-box;
		background-color: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 14px;
		text-transform: uppercase;
	}

	input[type='text']::placeholder {
		text-transform: none;
	}

	.choice {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 500;
		font-size: 13px;
		color: var(--text-primary);
	}

	.compare {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--text-primary);
	}

	.error {
		padding: 8px 10px;
		border: 1px solid var(--status-danger-border);
		border-radius: var(--radius-md);
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
		font-size: 13px;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		padding: 8px 16px;
		border: none;
		border-radius: var(--radius-md);
		background-color: var(--color-accent-600);
		color: white;
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}

	.btn-primary:hover {
		background-color: var(--color-accent-700);
	}
</style>
