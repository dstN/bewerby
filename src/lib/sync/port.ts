/**
 * Where encrypted sync files live: a folder a sync client watches, Dropbox,
 * later OneDrive and Google Drive (#53, #54). Paths are relative and use '/'
 * as separator: `upd/<device>/<n>.bwv`, `snap/<device>-<n>.bwv`,
 * `blob/<blobId>.bwv`. Everything stored is ciphertext; see engine.ts.
 */
export interface RemoteStore {
	/** Every file below the root, as relative paths. */
	list(): Promise<string[]>;
	read(path: string): Promise<Uint8Array>;
	write(path: string, bytes: Uint8Array): Promise<void>;
	/** Not an error when the file is already gone. */
	remove(path: string): Promise<void>;
}

/** The target needs the user again: a permission prompt or a new sign-in. */
export class ReconnectRequiredError extends Error {
	constructor(message = 'The sync target needs to be reconnected.') {
		super(message);
		this.name = 'ReconnectRequiredError';
	}
}
