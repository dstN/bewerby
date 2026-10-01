import { DropboxStore } from './adapters/dropbox.js';
import { FolderStore, ensureFolderPermission } from './adapters/folder.js';
import { ReconnectRequiredError, type RemoteStore } from './port.js';
import type { SyncState, TargetConfig } from './state.js';

/** Empty unless the build was given a Dropbox app key (vite.config.ts). */
export const DROPBOX_CLIENT_ID = __SYNC_CLIENTS__.dropbox;

/**
 * The store behind a saved target. A folder whose permission lapsed with the
 * last tab needs a click to be asked again, hence `interactive`.
 */
export async function openStore(
	target: TargetConfig,
	state: SyncState,
	interactive: boolean
): Promise<RemoteStore> {
	if (target.kind === 'folder') {
		if (!(await ensureFolderPermission(target.handle, interactive))) {
			throw new ReconnectRequiredError();
		}
		return new FolderStore(target.handle);
	}
	if (!DROPBOX_CLIENT_ID) throw new ReconnectRequiredError('Dropbox is not configured.');
	return new DropboxStore(target, DROPBOX_CLIENT_ID, (next) => state.updateTarget(next));
}
