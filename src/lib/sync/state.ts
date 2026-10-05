import { db, type BewerbyDatabase } from '#lib/db/index.js';

/**
 * Per-device sync bookkeeping in the syncState table: which target is
 * connected, what was applied from it and pushed to it. None of it is
 * synced, and all of it is erased with the database.
 */

/** sessionStorage marker: the OAuth callback just saved a target. */
export const JUST_CONNECTED = 'bewerby-sync-connected';

/** A cloud target signed in with OAuth; the tokens stay in this browser. */
export interface OAuthTarget<K extends 'dropbox' | 'onedrive' | 'google'> {
	kind: K;
	refreshToken: string;
	accessToken?: string;
	/** Epoch ms after which the access token is stale. */
	expiresAt?: number;
}

export type TargetConfig =
	| { kind: 'folder'; handle: FileSystemDirectoryHandle; name: string }
	| OAuthTarget<'dropbox'>
	| OAuthTarget<'onedrive'>
	| OAuthTarget<'google'>;

export interface Progress {
	/** Remote files applied or written here; a compaction may delete these. */
	seen: string[];
	/**
	 * Remote files of another vault, or unreadable: not downloaded again,
	 * and never deleted - they are not this vault's to remove.
	 */
	skipped?: string[];
	/** What the remote is known to have, as a Yjs state vector. */
	remoteSV?: Uint8Array;
	/** A change was made on this device that has not been pushed yet. */
	dirty: boolean;
	/** The `<vault>/<epoch>/` this progress was made in; another key starts over. */
	base?: string;
	/**
	 * Set when the user connects the target, until the first pass: such a
	 * device may lift an erasure marker, an old connection must not (#56).
	 */
	connected?: boolean;
}

export class SyncState {
	constructor(private readonly database: BewerbyDatabase = db) {}

	private async get<T>(key: string): Promise<T | undefined> {
		return (await this.database.syncState.get(key))?.value as T | undefined;
	}

	private async set(key: string, value: unknown): Promise<void> {
		await this.database.syncState.put({ key, value });
	}

	/** A random id for this device's files, made once. */
	async deviceId(): Promise<string> {
		const existing = await this.get<string>('deviceId');
		if (existing) return existing;
		const id = crypto.randomUUID();
		await this.set('deviceId', id);
		return id;
	}

	target(): Promise<TargetConfig | undefined> {
		return this.get<TargetConfig>('target');
	}

	/** A new target starts from nothing: everything is pushed to it once. */
	async setTarget(target: TargetConfig): Promise<void> {
		await this.set('target', target);
		await this.setProgress({ seen: [], dirty: true, connected: true });
		await this.database.syncState.delete('erasedAt');
	}

	/** When another device erased the target's files and this one let go of it (#56). */
	async erasedAt(): Promise<number | undefined> {
		return this.get<number>('erasedAt');
	}

	async markErased(): Promise<void> {
		await this.set('erasedAt', Date.now());
	}

	/**
	 * Lets go of a target of a kind this build does not offer (a store tried
	 * once and removed again), instead of failing on it every minute.
	 */
	async dropUnknownTarget(): Promise<void> {
		const target = (await this.get<{ kind: string }>('target'))?.kind;
		if (target && !['folder', 'dropbox', 'onedrive', 'google'].includes(target)) {
			await this.clearTarget();
		}
	}

	/** Token refreshes, without resetting what was synced. */
	async updateTarget(target: TargetConfig): Promise<void> {
		await this.set('target', target);
	}

	async clearTarget(): Promise<void> {
		await this.database.syncState.bulkDelete(['target', 'progress']);
	}

	async progress(): Promise<Progress> {
		return (await this.get<Progress>('progress')) ?? { seen: [], dirty: true };
	}

	async setProgress(progress: Progress): Promise<void> {
		await this.set('progress', progress);
	}

	async markDirty(): Promise<void> {
		const progress = await this.progress();
		if (!progress.dirty) await this.setProgress({ ...progress, dirty: true });
	}
}
