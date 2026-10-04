import { DropboxStore } from './adapters/dropbox.js';
import { FolderStore, ensureFolderPermission } from './adapters/folder.js';
import { GoogleDriveStore } from './adapters/gdrive.js';
import { OneDriveStore } from './adapters/onedrive.js';
import { ReconnectRequiredError, type RemoteStore } from './port.js';
import type { SyncState, TargetConfig } from './state.js';

/** Each empty unless the build was given that provider's client id (vite.config.ts). */
export const DROPBOX_CLIENT_ID = __SYNC_CLIENTS__.dropbox;
export const ONEDRIVE_CLIENT_ID = __SYNC_CLIENTS__.onedrive;
export const GOOGLE_CLIENT_ID = __SYNC_CLIENTS__.google;

/** Display names; a folder shows its own name instead. */
export const TARGET_NAMES: Record<Exclude<TargetConfig['kind'], 'folder'>, string> = {
	dropbox: 'Dropbox',
	onedrive: 'OneDrive',
	google: 'Google Drive'
};

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
	const persist = (next: TargetConfig) => state.updateTarget(next);
	switch (target.kind) {
		case 'dropbox':
			if (!DROPBOX_CLIENT_ID) throw new ReconnectRequiredError('Dropbox is not configured.');
			return new DropboxStore(target, DROPBOX_CLIENT_ID, persist);
		case 'onedrive':
			if (!ONEDRIVE_CLIENT_ID) throw new ReconnectRequiredError('OneDrive is not configured.');
			return new OneDriveStore(target, ONEDRIVE_CLIENT_ID, persist);
		case 'google':
			if (!GOOGLE_CLIENT_ID) throw new ReconnectRequiredError('Google Drive is not configured.');
			return new GoogleDriveStore(target, persist);
	}
}
