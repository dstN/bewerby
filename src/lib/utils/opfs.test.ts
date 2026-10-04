import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$app/env', () => ({ browser: true }));

type OpfsModule = typeof import('./opfs.js');

const PDF_DIRECTORY = 'application-pdfs';

/**
 * A minimal in-memory stand-in for the parts of the File System Access API
 * that opfs.ts actually uses. Node has no OPFS, and the real thing cannot be
 * exercised outside a browser at all - but the module's own logic (unique
 * ref generation, graceful reads of a missing file, orphan cleanup) is worth
 * testing independently of the browser implementing it.
 */
class FakeDirectoryHandle {
	files = new Map<string, File>();
	private children = new Map<string, FakeDirectoryHandle>();
	/** Set by a test to make the next operation fail like a quota error would. */
	failWith: Error | null = null;

	async getDirectoryHandle(name: string, options?: { create?: boolean }) {
		if (this.failWith) throw this.failWith;
		let child = this.children.get(name);
		if (!child) {
			if (!options?.create) throw new Error('NotFoundError');
			child = new FakeDirectoryHandle();
			this.children.set(name, child);
		}
		return child;
	}

	async getFileHandle(name: string, options?: { create?: boolean }) {
		if (!this.files.has(name)) {
			if (!options?.create) throw new Error('NotFoundError');
			this.files.set(name, new File([], name));
		}
		return {
			getFile: async () => this.files.get(name)!,
			createWritable: async () => ({
				// A File, as the real thing hands back: it carries when it was written.
				write: async (blob: Blob) =>
					void this.files.set(name, new File([blob], name, { lastModified: Date.now() })),
				close: async () => {}
			})
		};
	}

	async removeEntry(name: string, options?: { recursive?: boolean }) {
		const child = this.children.get(name);
		if (child) {
			if (!options?.recursive && child.files.size > 0) {
				throw new Error('InvalidModificationError');
			}
			this.children.delete(name);
			return;
		}
		if (!this.files.delete(name)) throw new Error('NotFoundError');
	}

	async *keys() {
		yield* [...this.files.keys(), ...this.children.keys()];
	}
}

let root: FakeDirectoryHandle;

function installOpfs({ supported = true } = {}) {
	root = new FakeDirectoryHandle();
	vi.stubGlobal(
		'navigator',
		supported ? { storage: { getDirectory: async () => root } } : { storage: {} }
	);
	return root;
}

/** The directory opfs.ts creates lazily under the OPFS root. */
function pdfDir(): Promise<FakeDirectoryHandle> {
	return root.getDirectoryHandle(PDF_DIRECTORY, { create: true });
}

async function loadOpfs(): Promise<OpfsModule> {
	vi.resetModules();
	return import('./opfs.js');
}

const pdfBlob = (text: string) => new Blob([text], { type: 'application/pdf' });

beforeEach(() => {
	installOpfs();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('isOpfsSupported', () => {
	it('is true when navigator.storage.getDirectory exists', async () => {
		const { isOpfsSupported } = await loadOpfs();
		expect(isOpfsSupported()).toBe(true);
	});

	it('is false on a browser without getDirectory', async () => {
		installOpfs({ supported: false });
		const { isOpfsSupported } = await loadOpfs();
		expect(isOpfsSupported()).toBe(false);
	});
});

describe('writePdfToOpfs', () => {
	it('stores the bytes and returns a .pdf ref', async () => {
		const { writePdfToOpfs } = await loadOpfs();
		const ref = await writePdfToOpfs(pdfBlob('%PDF-1.4 hello'));

		expect(ref.endsWith('.pdf')).toBe(true);
		const dir = await pdfDir();
		await expect(dir.files.get(ref)!.text()).resolves.toBe('%PDF-1.4 hello');
	});

	it('never reuses a ref, so two identical uploads cannot overwrite each other', async () => {
		const { writePdfToOpfs } = await loadOpfs();
		const refs = await Promise.all([
			writePdfToOpfs(pdfBlob('same bytes')),
			writePdfToOpfs(pdfBlob('same bytes')),
			writePdfToOpfs(pdfBlob('same bytes'))
		]);
		expect(new Set(refs).size).toBe(3);
		expect((await pdfDir()).files.size).toBe(3);
	});

	it('propagates a write failure so the caller can keep the modal open', async () => {
		const { writePdfToOpfs } = await loadOpfs();
		root.failWith = new Error('QuotaExceededError');
		await expect(writePdfToOpfs(pdfBlob('x'))).rejects.toThrow('QuotaExceededError');
	});
});

describe('readPdfFromOpfs', () => {
	it('reads back exactly what was written', async () => {
		const { writePdfToOpfs, readPdfFromOpfs } = await loadOpfs();
		const ref = await writePdfToOpfs(pdfBlob('%PDF-1.4 round trip'));
		const blob = await readPdfFromOpfs(ref);
		expect(blob).not.toBeNull();
		await expect(blob!.text()).resolves.toBe('%PDF-1.4 round trip');
	});

	it('returns null (not a throw) for a stale ref left by a crashed delete', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { readPdfFromOpfs } = await loadOpfs();
		await expect(readPdfFromOpfs('never-written.pdf')).resolves.toBeNull();
		expect(errorSpy).toHaveBeenCalled();
	});
});

describe('deletePdfFromOpfs', () => {
	it('removes the file', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { writePdfToOpfs, deletePdfFromOpfs, readPdfFromOpfs } = await loadOpfs();
		const ref = await writePdfToOpfs(pdfBlob('to be deleted'));

		await deletePdfFromOpfs(ref);
		expect((await pdfDir()).files.has(ref)).toBe(false);
		await expect(readPdfFromOpfs(ref)).resolves.toBeNull();
	});

	it('resolves quietly when the file is already gone (double delete)', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { writePdfToOpfs, deletePdfFromOpfs } = await loadOpfs();
		const ref = await writePdfToOpfs(pdfBlob('x'));

		await deletePdfFromOpfs(ref);
		await expect(deletePdfFromOpfs(ref)).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
	});
});

describe('cleanupOrphanedPdfs', () => {
	/** The sweep leaves files younger than a minute alone; most tests are about older ones. */
	function aMinuteLater() {
		vi.setSystemTime(Date.now() + 61_000);
	}

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('deletes exactly the files no application row still references', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		const { writePdfToOpfs, cleanupOrphanedPdfs } = await loadOpfs();

		const kept = await writePdfToOpfs(pdfBlob('still referenced'));
		const orphanA = await writePdfToOpfs(pdfBlob('orphan a'));
		const orphanB = await writePdfToOpfs(pdfBlob('orphan b'));
		aMinuteLater();

		await cleanupOrphanedPdfs(new Set([kept]));

		const dir = await pdfDir();
		expect([...dir.files.keys()]).toEqual([kept]);
		expect(dir.files.has(orphanA)).toBe(false);
		expect(dir.files.has(orphanB)).toBe(false);
	});

	it('spares a file written in the last minute, whose reference may not be saved yet', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		const { writePdfToOpfs, cleanupOrphanedPdfs } = await loadOpfs();
		const old = await writePdfToOpfs(pdfBlob('long orphaned'));
		aMinuteLater();
		// Uploaded while the sweep runs on start: not in the set it was given.
		const fresh = await writePdfToOpfs(pdfBlob('just uploaded'));

		await cleanupOrphanedPdfs(new Set());

		const dir = await pdfDir();
		expect(dir.files.has(old)).toBe(false);
		expect(dir.files.has(fresh)).toBe(true);
	});

	it('keeps every file when all of them are still referenced, and logs nothing', async () => {
		const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const { writePdfToOpfs, cleanupOrphanedPdfs } = await loadOpfs();
		const refs = [await writePdfToOpfs(pdfBlob('a')), await writePdfToOpfs(pdfBlob('b'))];

		await cleanupOrphanedPdfs(new Set(refs));

		expect((await pdfDir()).files.size).toBe(2);
		expect(infoSpy).not.toHaveBeenCalled();
	});

	it('tolerates a validRefs entry that no longer exists on disk', async () => {
		const { writePdfToOpfs, cleanupOrphanedPdfs } = await loadOpfs();
		const ref = await writePdfToOpfs(pdfBlob('a'));
		await expect(
			cleanupOrphanedPdfs(new Set([ref, 'referenced-but-missing.pdf']))
		).resolves.toBeUndefined();
		expect((await pdfDir()).files.size).toBe(1);
	});

	it('is a no-op where OPFS is unsupported, rather than throwing on app start', async () => {
		installOpfs({ supported: false });
		const { cleanupOrphanedPdfs } = await loadOpfs();
		await expect(cleanupOrphanedPdfs(new Set())).resolves.toBeUndefined();
	});

	it('swallows a directory-level failure so app startup is never blocked', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { cleanupOrphanedPdfs } = await loadOpfs();
		root.failWith = new Error('UnknownError');
		await expect(cleanupOrphanedPdfs(new Set())).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalled();
	});
});
