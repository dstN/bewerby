import { browser } from '$app/env';
import { activeSync } from '#lib/crdt/session.js';
import type { KeyHeader } from '#lib/vault/format.js';
import { loadStoredVault } from '#lib/vault/keystore.js';
import { adoptVault, onVaultChange, unlockedVault } from '#lib/vault/session.js';
import type { UnlockedVault } from '#lib/vault/vault.js';
import { DropboxStore } from './adapters/dropbox.js';
import { GoogleDriveStore } from './adapters/gdrive.js';
import { relaySpace } from './adapters/relay.js';
import { SyncEngine, announceKey, eraseVaultFiles, type SyncReport } from './engine.js';
import { ReconnectRequiredError } from './port.js';
import { SyncState, type TargetConfig } from './state.js';
import { openStore } from './targets.js';

/**
 * Runs the sync engine while bewerby is open (#53): once on start, shortly
 * after a change on this device, every minute for other devices' changes,
 * and when the tab comes back into view. Like the reminders, nothing runs
 * while no tab is open - there is no server to do it.
 */

export type SyncStatus = 'off' | 'locked' | 'reconnect' | 'rekey' | 'idle' | 'syncing' | 'error';

/** After a local change: long enough to bundle a burst of edits into one file. */
const PUSH_DELAY = 20_000;
const POLL_EVERY = 60_000;

class SyncRunner {
	status = $state<SyncStatus>('off');
	target = $state<TargetConfig['kind'] | null>(null);
	targetName = $state<string | null>(null);
	lastSync = $state<number | null>(null);
	lastReport = $state.raw<SyncReport | null>(null);
	/** With status 'rekey': the newer key another device made, to unlock (#56). */
	newerKey = $state.raw<KeyHeader | null>(null);
	/** Another device erased the target's files, and this one disconnected (#56). */
	erasedAt = $state<number | null>(null);

	private readonly state = new SyncState();
	private running: Promise<void> | null = null;
	private pushTimer: ReturnType<typeof setTimeout> | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private stopListening: (() => void) | undefined;
	private started = false;

	private stopTimers() {
		clearTimeout(this.pushTimer);
		clearInterval(this.pollTimer);
		this.stopListening?.();
		this.stopListening = undefined;
	}

	/** (Re)reads the target and starts the schedule. Safe to call repeatedly. */
	async start(): Promise<void> {
		if (!browser) return;
		this.stopTimers();
		if (!this.started) {
			this.started = true;
			onVaultChange(() => void this.start());
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible' && this.status === 'idle') void this.syncNow();
			});
		}
		const target = await this.state.target();
		this.target = target?.kind ?? null;
		this.targetName = target?.kind === 'folder' ? target.name : null;
		this.erasedAt = (await this.state.erasedAt()) ?? null;
		const runtime = target ? await activeSync() : null;
		if (!target || !runtime) {
			this.status = 'off';
			return;
		}
		// Listening even while locked: a deletion moves no state vector, so
		// only this flag tells the next pass there is something to push.
		this.stopListening = runtime.onLocalChange(() => {
			void this.state.markDirty();
			clearTimeout(this.pushTimer);
			this.pushTimer = setTimeout(() => void this.syncNow(), PUSH_DELAY);
		});
		this.pollTimer = setInterval(() => void this.syncNow(), POLL_EVERY);
		await this.syncNow();
	}

	/** One pass now. `interactive` may show a permission prompt (needs a click). */
	syncNow(interactive = false): Promise<void> {
		this.running ??= this.pass(interactive).finally(() => (this.running = null));
		return this.running;
	}

	private async pass(interactive: boolean): Promise<void> {
		let target = await this.state.target();
		const runtime = target ? await activeSync() : null;
		if (!target || !runtime) {
			this.status = 'off';
			return;
		}
		const vault = await unlockedVault();
		if (!vault) {
			this.status = 'locked';
			return;
		}
		this.status = 'syncing';
		try {
			// The bewerby.de space follows the key: a new one after a key change.
			if (target.kind === 'relay') {
				const space = await relaySpace(vault.root);
				if (target.space !== space) {
					target = { kind: 'relay', space };
					await this.state.updateTarget(target);
				}
			}
			const store = await openStore(target, this.state, interactive);
			const report = await new SyncEngine(runtime, store, vault, this.state).run();
			if (report.erased) {
				// Erased on purpose from another device: refilling it would undo that.
				this.stopTimers();
				await this.forget(target);
				await this.state.markErased();
				this.erasedAt = Date.now();
				return;
			}
			this.lastReport = report;
			this.newerKey = report.newerKey ?? null;
			if (report.newerKey) {
				this.status = 'rekey';
				return;
			}
			this.lastSync = Date.now();
			this.status = 'idle';
		} catch (err) {
			console.error('Sync failed:', err);
			this.status = err instanceof ReconnectRequiredError ? 'reconnect' : 'error';
		}
	}

	/**
	 * Key change (#56): first everything the other devices pushed under the
	 * old key, then the new key takes over. Its first pass writes the whole
	 * document under the new key and removes the old key's files; the other
	 * devices find the new key there and ask for the new passphrase.
	 */
	async rotate(next: UnlockedVault, remember: boolean): Promise<void> {
		const target = await this.state.target();
		if (target) {
			await this.syncNow(true);
			try {
				await announceKey(await openStore(target, this.state, true), next);
			} catch (err) {
				// Devices on a folder or Dropbox still find the new key's files;
				// only the old bewerby.de space misses the notice.
				console.warn('Announcing the new key failed:', err);
			}
		}
		await adoptVault(next.header, next.root, remember);
	}

	/**
	 * Forgets the target here and revokes its tokens where possible. With
	 * `erase`, this vault's files there go first (right to erasure, #56) -
	 * that throws when the target cannot be reached, so nothing is claimed
	 * deleted that is not.
	 */
	async disconnect(erase = false): Promise<void> {
		this.stopTimers();
		// A pass still running would write files again after the erase.
		await this.running;
		const target = await this.state.target();
		if (erase && target) {
			const stored = await loadStoredVault();
			if (stored) {
				await eraseVaultFiles(await openStore(target, this.state, true), stored.header.vaultId);
			}
		}
		await this.forget(target);
	}

	/** Revokes the target's token where the provider allows it, and lets go of it. */
	private async forget(target: TargetConfig | undefined): Promise<void> {
		// OneDrive has no revocation endpoint for a single-page app; its refresh
		// token expires within 24 hours anyway.
		if (target?.kind === 'dropbox' || target?.kind === 'google') {
			try {
				const store = await openStore(target, this.state, false);
				if (store instanceof DropboxStore || store instanceof GoogleDriveStore) {
					await store.revoke();
				}
			} catch (err) {
				console.warn('Revoking the access token failed:', err);
			}
		}
		await this.state.clearTarget();
		this.target = null;
		this.targetName = null;
		this.lastReport = null;
		this.newerKey = null;
		this.status = 'off';
	}
}

export const syncRunner = new SyncRunner();
