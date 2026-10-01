import { browser } from '$app/env';
import { activeSync } from '#lib/crdt/session.js';
import { onVaultChange, unlockedVault } from '#lib/vault/session.js';
import { DropboxStore } from './adapters/dropbox.js';
import { GoogleDriveStore } from './adapters/gdrive.js';
import { SyncEngine, type SyncReport } from './engine.js';
import { ReconnectRequiredError } from './port.js';
import { SyncState, type TargetConfig } from './state.js';
import { openStore } from './targets.js';

/**
 * Runs the sync engine while bewerby is open (#53): once on start, shortly
 * after a change on this device, every minute for other devices' changes,
 * and when the tab comes back into view. Like the reminders, nothing runs
 * while no tab is open - there is no server to do it.
 */

export type SyncStatus = 'off' | 'locked' | 'reconnect' | 'idle' | 'syncing' | 'error';

/** After a local change: long enough to bundle a burst of edits into one file. */
const PUSH_DELAY = 20_000;
const POLL_EVERY = 60_000;

class SyncRunner {
	status = $state<SyncStatus>('off');
	target = $state<TargetConfig['kind'] | null>(null);
	targetName = $state<string | null>(null);
	lastSync = $state<number | null>(null);
	lastReport = $state.raw<SyncReport | null>(null);

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
		const target = await this.state.target();
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
			const store = await openStore(target, this.state, interactive);
			this.lastReport = await new SyncEngine(runtime, store, vault, this.state).run();
			this.lastSync = Date.now();
			this.status = 'idle';
		} catch (err) {
			console.error('Sync failed:', err);
			this.status = err instanceof ReconnectRequiredError ? 'reconnect' : 'error';
		}
	}

	/** Forgets the target here; the files stay where they are. Revokes tokens where possible. */
	async disconnect(): Promise<void> {
		this.stopTimers();
		const target = await this.state.target();
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
		this.status = 'off';
	}
}

export const syncRunner = new SyncRunner();
