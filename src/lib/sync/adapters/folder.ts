import { ReconnectRequiredError, type RemoteStore } from '../port.js';

/**
 * Sync through a folder that a sync client of the user's choice watches:
 * Nextcloud, iCloud for Windows, Proton Drive, Synology Drive, Syncthing.
 * bewerby itself transmits nothing - it writes encrypted files into the
 * folder, and the client moves them (#53). File System Access only exists
 * in Chromium-based desktop browsers.
 */

// Permission methods and the picker are not part of lib.dom yet.
interface PermissionedHandle {
	queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
	requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface WindowWithPicker {
	showDirectoryPicker(options?: {
		id?: string;
		mode?: 'read' | 'readwrite';
	}): Promise<FileSystemDirectoryHandle>;
}

export const SYNC_FOLDER_NAME = 'bewerby-sync';

export function isFolderSyncSupported(): boolean {
	return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Lets the user pick a folder and returns a `bewerby-sync` folder inside it,
 * so the encrypted files do not end up loose among the user's own.
 */
export async function pickSyncFolder(): Promise<{
	handle: FileSystemDirectoryHandle;
	/** The folder the user picked, for display - the handle is the one inside it. */
	name: string;
}> {
	const picked = await (window as unknown as WindowWithPicker).showDirectoryPicker({
		id: 'bewerby-sync',
		mode: 'readwrite'
	});
	return {
		handle: await picked.getDirectoryHandle(SYNC_FOLDER_NAME, { create: true }),
		name: picked.name
	};
}

/**
 * A stored handle loses its permission when the tab closes; asking again
 * needs a click, which is why `interactive` exists.
 */
export async function ensureFolderPermission(
	handle: FileSystemDirectoryHandle,
	interactive: boolean
): Promise<boolean> {
	const permissioned = handle as unknown as PermissionedHandle;
	if ((await permissioned.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
	if (!interactive) return false;
	return (await permissioned.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export class FolderStore implements RemoteStore {
	constructor(private readonly root: FileSystemDirectoryHandle) {}

	private async directory(
		parts: string[],
		create: boolean
	): Promise<FileSystemDirectoryHandle | null> {
		let dir = this.root;
		for (const part of parts) {
			try {
				dir = await dir.getDirectoryHandle(part, { create });
			} catch (err) {
				if (err instanceof DOMException && err.name === 'NotFoundError') return null;
				throw this.translate(err);
			}
		}
		return dir;
	}

	private translate(err: unknown): unknown {
		return err instanceof DOMException && err.name === 'NotAllowedError'
			? new ReconnectRequiredError('The sync folder needs permission again.')
			: err;
	}

	private split(path: string): { parts: string[]; name: string } {
		const parts = path.split('/');
		const name = parts.pop()!;
		return { parts, name };
	}

	async list(): Promise<string[]> {
		const out: string[] = [];
		const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
			for await (const [name, handle] of dir.entries()) {
				// Sync clients and Chromium leave temporary files next to real ones.
				if (name.startsWith('.') || name.endsWith('.crswap')) continue;
				if (handle.kind === 'directory') {
					await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
				} else {
					out.push(`${prefix}${name}`);
				}
			}
		};
		try {
			await walk(this.root, '');
		} catch (err) {
			throw this.translate(err);
		}
		return out;
	}

	async read(path: string): Promise<Uint8Array> {
		const { parts, name } = this.split(path);
		const dir = await this.directory(parts, false);
		if (!dir) throw new Error(`No such file: ${path}`);
		try {
			const file = await (await dir.getFileHandle(name)).getFile();
			return new Uint8Array(await file.arrayBuffer());
		} catch (err) {
			throw this.translate(err);
		}
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		const { parts, name } = this.split(path);
		const dir = await this.directory(parts, true);
		try {
			// createWritable writes into a swap file and swaps it in on close(),
			// so a sync client never picks up half a file.
			const writable = await (await dir!.getFileHandle(name, { create: true })).createWritable();
			await writable.write(new Uint8Array(bytes));
			await writable.close();
		} catch (err) {
			throw this.translate(err);
		}
	}

	async remove(path: string): Promise<void> {
		const { parts, name } = this.split(path);
		const dir = await this.directory(parts, false);
		if (!dir) return;
		try {
			await dir.removeEntry(name);
		} catch (err) {
			if (err instanceof DOMException && err.name === 'NotFoundError') return;
			throw this.translate(err);
		}
	}
}
