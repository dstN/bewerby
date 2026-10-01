<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '$lib/i18n/index.svelte.js';
	import { announcer } from '$lib/stores/announcer.svelte.js';
	import { normalizeRecoveryInput } from '$lib/vault/crypto.js';
	import { createVault, type UnlockedVault } from '$lib/vault/vault.js';
	import VaultDialog from './VaultDialog.svelte';

	let {
		onclose,
		oncreated
	}: {
		onclose: () => void;
		/** Persists the new vault; the dialog closes once this resolves. */
		oncreated: (vault: UnlockedVault, remember: boolean) => Promise<void>;
	} = $props();

	const MIN_LENGTH = 12;

	let step = $state<'passphrase' | 'recovery'>('passphrase');
	let passphrase = $state('');
	let confirmation = $state('');
	let remember = $state(true);
	let busy = $state(false);
	let error = $state<string | null>(null);
	// Nothing is stored until the recovery key is confirmed: closing the
	// dialog before that leaves no half-set-up vault behind.
	let created = $state.raw<UnlockedVault | null>(null);
	let recoveryKey = $state('');
	let lastGroup = $state('');
	let recoveryHeading = $state<HTMLElement>();

	async function submitPassphrase(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (passphrase.length < MIN_LENGTH) {
			error = t('backup.vault.errorShort');
			return;
		}
		if (passphrase !== confirmation) {
			error = t('backup.vault.errorMismatch');
			return;
		}
		busy = true;
		try {
			const result = await createVault(passphrase);
			created = result.vault;
			recoveryKey = result.recoveryKey;
			passphrase = '';
			confirmation = '';
			step = 'recovery';
			await tick();
			// Move focus to the new content so a screen reader reads the key's
			// explanation instead of staying on a button that no longer exists.
			recoveryHeading?.focus();
		} catch (err) {
			console.error('Creating the vault failed:', err);
			error = t('backup.vault.errorUnexpected');
		} finally {
			busy = false;
		}
	}

	async function copyRecoveryKey() {
		try {
			await navigator.clipboard.writeText(recoveryKey);
			announcer.announce(t('backup.vault.copied'));
		} catch (err) {
			console.warn('Copying the recovery key failed:', err);
		}
	}

	function downloadRecoveryKey() {
		const text = t('backup.vault.recoveryFile')
			.replace('{key}', recoveryKey)
			.replace('{date}', new Date().toLocaleDateString());
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = 'bewerby-recovery-key.txt';
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}

	async function finish(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!created) return;
		if (normalizeRecoveryInput(lastGroup) !== normalizeRecoveryInput(recoveryKey).slice(-4)) {
			error = t('backup.vault.errorGroup');
			return;
		}
		busy = true;
		try {
			await oncreated(created, remember);
			announcer.announce(t('backup.vault.created'));
			onclose();
		} catch (err) {
			console.error('Storing the vault failed:', err);
			error = t('backup.vault.errorUnexpected');
		} finally {
			busy = false;
		}
	}
</script>

<VaultDialog title={t('backup.vault.setupTitle')} closeLabel={t('backup.vault.close')} {onclose}>
	{#if step === 'passphrase'}
		<form onsubmit={submitPassphrase} novalidate>
			<div class="field">
				<label for="vault-passphrase">{t('backup.vault.passphraseLabel')}</label>
				<input
					id="vault-passphrase"
					type="password"
					autocomplete="new-password"
					minlength={MIN_LENGTH}
					required
					aria-describedby="vault-passphrase-hint"
					bind:value={passphrase}
				/>
				<span class="hint" id="vault-passphrase-hint">{t('backup.vault.passphraseHint')}</span>
			</div>
			<div class="field">
				<label for="vault-confirmation">{t('backup.vault.confirmLabel')}</label>
				<input
					id="vault-confirmation"
					type="password"
					autocomplete="new-password"
					required
					bind:value={confirmation}
				/>
			</div>
			<label class="choice">
				<input type="checkbox" bind:checked={remember} aria-describedby="vault-remember-hint" />
				<span>
					{t('backup.vault.remember')}
					<span class="hint" id="vault-remember-hint">{t('backup.vault.rememberHint')}</span>
				</span>
			</label>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<div class="actions">
				<button type="button" class="btn-flat" onclick={onclose}>{t('actions.cancel')}</button>
				<button type="submit" class="btn-primary" disabled={busy} aria-busy={busy}>
					{busy ? t('backup.vault.working') : t('backup.vault.next')}
				</button>
			</div>
		</form>
	{:else}
		<form onsubmit={finish} novalidate>
			<h3 class="recovery-title" tabindex="-1" bind:this={recoveryHeading}>
				{t('backup.vault.recoveryTitle')}
			</h3>
			<p>{t('backup.vault.recoveryIntro')}</p>
			<p class="recovery-key" data-testid="recovery-key">{recoveryKey}</p>
			<div class="actions start">
				<button type="button" class="btn-flat" onclick={copyRecoveryKey}>
					{t('backup.vault.copy')}
				</button>
				<button type="button" class="btn-flat" onclick={downloadRecoveryKey}>
					{t('backup.vault.download')}
				</button>
			</div>
			<div class="field">
				<label for="vault-last-group">{t('backup.vault.confirmGroupLabel')}</label>
				<input
					id="vault-last-group"
					type="text"
					class="group-input"
					autocomplete="off"
					spellcheck="false"
					maxlength="4"
					required
					bind:value={lastGroup}
				/>
			</div>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<div class="actions">
				<button type="submit" class="btn-primary" disabled={busy}>
					{t('backup.vault.finish')}
				</button>
			</div>
		</form>
	{/if}
</VaultDialog>

<style>
	.recovery-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.recovery-title:focus {
		outline: none;
	}

	.recovery-key {
		padding: 14px 16px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background-color: var(--surface-1);
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: 0.06em;
		line-height: 1.7;
		color: var(--text-primary);
		overflow-wrap: anywhere;
		user-select: all;
	}

	.start {
		justify-content: flex-start;
	}

	.group-input {
		width: 8ch;
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		text-transform: uppercase;
	}
</style>
