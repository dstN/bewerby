<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';
	import type { KeyHeader } from '#lib/vault/format.js';
	import {
		PairingHost,
		formatPairingCode,
		pairingLink,
		type HostState
	} from '#lib/sync/live/pairing.js';
	import { relayAvailable } from '#lib/sync/adapters/relay.js';
	import { syncRunner } from '#lib/sync/runner.svelte.js';
	import { SyncState, type TargetConfig } from '#lib/sync/state.js';
	import { TARGET_NAMES } from '#lib/sync/targets.js';
	import QrCode from './QrCode.svelte';
	import VaultDialog from './VaultDialog.svelte';

	/**
	 * The existing device's side of adding a device (#55). Opened right after
	 * the user re-entered the passphrase or recovery key, which is what yields
	 * `raw` - the stored key itself cannot be exported.
	 */
	let { header, raw, onclose }: { header: KeyHeader; raw: Uint8Array; onclose: () => void } =
		$props();

	let pairing = $state<HostState>({ step: 'waiting' });
	// Without a target of its own, this device can start syncing through
	// bewerby.de with the new one (#58): on unless the user says otherwise.
	let relayOffered = $state(false);
	let useRelay = $state(true);

	/** Where the new device should sync; asked for once it has the key. */
	async function shareTarget(): Promise<TargetConfig | null> {
		const state = new SyncState();
		const target = await state.target();
		if (target) return target;
		if (!relayOffered || !useRelay) return null;
		await state.setTarget({ kind: 'relay' });
		void syncRunner.start();
		return { kind: 'relay' };
	}

	// The host is created once, from the props as they were when opened.
	// svelte-ignore state_referenced_locally
	const host = new PairingHost(
		header,
		raw,
		(next) => {
			pairing = next;
			if (next.step === 'done') announcer.announce(t('pair.done'));
			if (next.step === 'failed') announcer.announce(t('pair.failed'));
		},
		shareTarget
	);
	const link = pairingLink(host.secret);
	const code = formatPairingCode(host.secret);

	onMount(() => {
		void relayAvailable().then((available) => (relayOffered = available));
		void host.run();
		return () => host.cancel();
	});

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			announcer.announce(t('pair.linkCopied'));
		} catch (err) {
			console.warn('Copying the pairing link failed:', err);
		}
	}
</script>

<VaultDialog title={t('pair.title')} closeLabel={t('backup.vault.close')} {onclose}>
	<div class="pair">
		{#if pairing.step === 'waiting'}
			<p>{t('pair.scan')}</p>
			<div class="qr-box">
				<QrCode value={link} label={t('pair.qrLabel')} />
			</div>
			<p class="link" data-testid="pair-link">{link}</p>
			<div class="actions start">
				<button type="button" class="btn-flat" onclick={copyLink}>{t('pair.copyLink')}</button>
			</div>
			<p>{t('pair.typeCode')}</p>
			<p class="code" data-testid="pair-code">{code}</p>
			{#if syncRunner.target === 'folder'}
				<p class="hint">{t('pair.targetFolder')}</p>
			{:else if syncRunner.target}
				<p class="hint">
					{t('pair.targetShared').replace('{name}', TARGET_NAMES[syncRunner.target])}
				</p>
			{:else if relayOffered}
				<label class="choice">
					<input type="checkbox" bind:checked={useRelay} aria-describedby="pair-relay-hint" />
					<span>
						{t('pair.relayLabel')}
						<span class="hint" id="pair-relay-hint">{t('pair.relayHint')}</span>
					</span>
				</label>
			{/if}
			<p class="hint" role="status">{t('pair.waiting')}</p>
		{:else if pairing.step === 'confirm'}
			<p>{t('pair.compare').replace('{peer}', pairing.peer)}</p>
			<p class="compare" data-testid="pair-compare">
				{pairing.code.slice(0, 3)}
				{pairing.code.slice(3)}
			</p>
			<div class="actions">
				<button type="button" class="btn-flat" onclick={() => host.confirm(false)}>
					{t('pair.differs')}
				</button>
				<button type="button" class="btn-primary" onclick={() => host.confirm(true)}>
					{t('pair.matches')}
				</button>
			</div>
		{:else if pairing.step === 'sending'}
			<p role="status">{t('pair.sending')}</p>
		{:else if pairing.step === 'done'}
			<p>{t('pair.done')}</p>
			<div class="actions">
				<button type="button" class="btn-primary" onclick={onclose}
					>{t('backup.vault.close')}</button
				>
			</div>
		{:else}
			<p class="error" role="alert">{t('pair.failed')}</p>
			<div class="actions">
				<button type="button" class="btn-flat" onclick={onclose}>{t('backup.vault.close')}</button>
			</div>
		{/if}
		<p class="hint">{t('pair.privacyNote')}</p>
	</div>
</VaultDialog>

<style>
	.pair {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.qr-box {
		display: flex;
		justify-content: center;
		padding: 12px;
		background-color: #ffffff;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
	}

	.link,
	.code {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.code {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: 0.06em;
	}

	.compare {
		font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-align: center;
		color: var(--text-primary);
	}

	.start {
		justify-content: flex-start;
	}
</style>
