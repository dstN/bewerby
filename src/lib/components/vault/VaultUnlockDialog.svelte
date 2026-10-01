<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n/index.svelte.js';
	import { VaultError, type KeyHeader } from '$lib/vault/format.js';
	import { unlockWithBytes } from '$lib/vault/vault.js';
	import VaultDialog from './VaultDialog.svelte';

	let {
		title,
		header,
		submitLabel,
		showRemember,
		note,
		extra,
		keepRaw = false,
		onunlock,
		onclose
	}: {
		title: string;
		/** The key header to unlock: this device's vault, or the one inside a file. */
		header: KeyHeader;
		submitLabel: string;
		showRemember: boolean;
		note?: string;
		/** Extra controls between the secret and the buttons (the import mode). */
		extra?: Snippet;
		/**
		 * Also hand the root's bytes to onunlock - only for passing the vault
		 * to a new device (#55); otherwise they are zeroed here.
		 */
		keepRaw?: boolean;
		/**
		 * Runs with the unlocked root. Resolves with an error message to stay
		 * open and show it, `false` to stay open silently (a declined
		 * confirm), anything else to close. A thrown VaultError is shown too.
		 */
		onunlock: (
			root: CryptoKey,
			remember: boolean,
			raw?: Uint8Array
		) => Promise<string | false | void>;
		onclose: () => void;
	} = $props();

	let method = $state<'passphrase' | 'recovery'>('passphrase');
	let secret = $state('');
	let remember = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const MESSAGES: Record<VaultError['code'], string> = {
		format: 'backup.vault.errorNotVault',
		unsupported: 'backup.vault.errorUnsupported',
		secret: 'backup.vault.errorSecret',
		corrupt: 'backup.vault.errorCorrupt'
	};

	// The field turns from type=password into type=text for the recovery key;
	// carrying a typed passphrase across would show it in clear.
	function clearSecret() {
		secret = '';
		error = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!secret.trim()) {
			error = t('backup.vault.errorSecret');
			return;
		}
		busy = true;
		try {
			const { root, raw } = await unlockWithBytes(
				header,
				method === 'passphrase' ? { passphrase: secret } : { recoveryKey: secret }
			);
			if (!keepRaw) raw.fill(0);
			const result = await onunlock(root, showRemember && remember, keepRaw ? raw : undefined);
			if (typeof result === 'string') error = result;
			else if (result !== false) onclose();
		} catch (err) {
			if (err instanceof VaultError) {
				error = t(MESSAGES[err.code]);
			} else {
				console.error('Unlocking the vault failed:', err);
				error = t('backup.vault.errorUnexpected');
			}
		} finally {
			busy = false;
		}
	}
</script>

<VaultDialog {title} closeLabel={t('backup.vault.close')} {onclose}>
	<form onsubmit={submit} novalidate>
		<fieldset>
			<legend>{t('backup.vault.methodLabel')}</legend>
			<label class="choice">
				<input
					type="radio"
					name="vault-method"
					value="passphrase"
					bind:group={method}
					onchange={clearSecret}
				/>
				{t('backup.vault.methodPassphrase')}
			</label>
			<label class="choice">
				<input
					type="radio"
					name="vault-method"
					value="recovery"
					bind:group={method}
					onchange={clearSecret}
				/>
				{t('backup.vault.methodRecovery')}
			</label>
		</fieldset>

		<div class="field">
			{#if method === 'passphrase'}
				<label for="vault-secret">{t('backup.vault.passphraseLabel')}</label>
				<input
					id="vault-secret"
					type="password"
					autocomplete="current-password"
					required
					bind:value={secret}
				/>
			{:else}
				<label for="vault-secret">{t('backup.vault.recoveryLabel')}</label>
				<input
					id="vault-secret"
					type="text"
					class="recovery-input"
					autocomplete="off"
					spellcheck="false"
					placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
					required
					bind:value={secret}
				/>
			{/if}
		</div>

		{#if extra}
			{@render extra()}
		{/if}

		{#if showRemember}
			<label class="choice">
				<input type="checkbox" bind:checked={remember} />
				{t('backup.vault.remember')}
			</label>
		{/if}

		{#if note}
			<p>{note}</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			<button type="button" class="btn-flat" onclick={onclose}>{t('actions.cancel')}</button>
			<button type="submit" class="btn-primary" disabled={busy} aria-busy={busy}>
				{busy ? t('backup.vault.unlocking') : submitLabel}
			</button>
		</div>
	</form>
</VaultDialog>

<style>
	.recovery-input {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		text-transform: uppercase;
	}

	.recovery-input::placeholder {
		text-transform: none;
	}
</style>
