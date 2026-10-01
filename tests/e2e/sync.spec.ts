import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PASSPHRASE, setUpEncryption } from './fixtures/vault.js';

/**
 * Folder sync between two devices (#53). A native folder picker cannot be
 * driven by Playwright, so the picker returns a folder in the origin's
 * private file system instead - same FileSystemDirectoryHandle API - and the
 * test itself plays the sync client, copying the folder between the two
 * browser contexts.
 */
async function fakeFolderPicker(context: BrowserContext) {
	await context.addInitScript(() => {
		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async () =>
				(await navigator.storage.getDirectory()).getDirectoryHandle('Nextcloud', { create: true })
		});
		const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
		proto.queryPermission ??= async () => 'granted';
		proto.requestPermission ??= async () => 'granted';
	});
}

type FolderContents = Record<string, number[]>;

function readFolder(page: Page): Promise<FolderContents> {
	return page.evaluate(async () => {
		const out: Record<string, number[]> = {};
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Nextcloud', {
			create: true
		});
		const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
			for await (const [name, handle] of dir.entries()) {
				if (handle.kind === 'directory') {
					await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
				} else {
					const file = await (handle as FileSystemFileHandle).getFile();
					out[`${prefix}${name}`] = [...new Uint8Array(await file.arrayBuffer())];
				}
			}
		};
		await walk(root, '');
		return out;
	});
}

function writeFolder(page: Page, contents: FolderContents): Promise<void> {
	return page.evaluate(async (files) => {
		const root = await (
			await navigator.storage.getDirectory()
		).getDirectoryHandle('Nextcloud', {
			create: true
		});
		for (const [path, bytes] of Object.entries(files)) {
			const parts = path.split('/');
			const name = parts.pop()!;
			let dir = root;
			for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
			const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
			await writable.write(new Uint8Array(bytes));
			await writable.close();
		}
	}, contents);
}

async function addApplication(page: Page, company: string) {
	await page.goto('/board');
	await page.getByRole('button', { name: 'Bewerbung hinzufügen' }).click();
	const modal = page.locator('dialog.modal-content');
	await modal.locator('#title').fill('Entwickler');
	await modal.locator('#company').fill(company);
	await modal.getByRole('button', { name: 'Speichern' }).click();
	await expect(modal).toBeHidden();
}

test.describe('Sync between devices', () => {
	test('two devices sync through a folder a sync client keeps in step', async ({
		page,
		browser
	}, testInfo) => {
		const laptop = page;
		laptop.on('dialog', (dialog) => dialog.accept());
		await fakeFolderPicker(laptop.context());
		await setUpEncryption(laptop);
		await addApplication(laptop, 'Fabrikam AG');

		await laptop.goto('/backup');
		await laptop.getByRole('button', { name: 'Ordner wählen' }).click();
		await expect(laptop.getByText('Verbunden mit dem Ordner „Nextcloud“.')).toBeVisible();
		await expect(
			laptop.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();
		const fromLaptop = await readFolder(laptop);
		expect(Object.keys(fromLaptop).some((path) => path.startsWith('bewerby-sync/upd/'))).toBe(true);
		// What a sync client would carry: ciphertext only.
		for (const bytes of Object.values(fromLaptop)) {
			expect(Buffer.from(bytes).includes('Fabrikam')).toBe(false);
		}

		// A second device with an application of its own joins the sync.
		const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		await fakeFolderPicker(phoneContext);
		const phone = await phoneContext.newPage();
		phone.on('dialog', (dialog) => dialog.accept());
		await addApplication(phone, 'Northwind GmbH');
		await phone.goto('/backup');
		await writeFolder(phone, fromLaptop);
		await phone.getByRole('button', { name: 'Ordner wählen' }).click();
		const join = phone.getByRole('dialog', { name: 'Mit bestehender Synchronisation verbinden' });
		await join.locator('#vault-secret').fill(PASSPHRASE);
		await join.getByRole('button', { name: 'Entsperren und verbinden' }).click();
		await expect(join).toBeHidden();
		await expect(
			phone.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();
		await phone.goto('/board');
		await expect(phone.locator('.card')).toHaveCount(2);

		// The phone's own application travels back to the laptop.
		await writeFolder(laptop, await readFolder(phone));
		await laptop.goto('/backup');
		await laptop.getByRole('button', { name: 'Jetzt synchronisieren' }).click();
		await expect(
			laptop.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();
		await laptop.goto('/board');
		await expect(laptop.locator('.card')).toHaveCount(2);
		await expect(laptop.locator('.card', { hasText: 'Northwind GmbH' })).toBeVisible();

		await phoneContext.close();
	});

	test('the sign-in return page is answered without the server once bewerby is installed', async ({
		page
	}) => {
		await page.goto('/');
		await page.evaluate(async () => {
			const registration = await navigator.serviceWorker.ready;
			if (!registration.active) throw new Error('service worker never activated');
		});
		await page.reload();

		const response = await page.goto('/cloud/callback?code=secret-code&state=forged');
		expect(response?.fromServiceWorker()).toBe(true);
		// No sign-in of this tab's own to finish: refused, nothing stored.
		await expect(page.getByRole('alert')).toHaveText(
			'Die Verbindung mit Dropbox ist nicht zustande gekommen. Es wurde nichts gespeichert.'
		);
		// The code is gone from the address bar.
		await expect(page).toHaveURL(/\/cloud\/callback$/);
	});
});
