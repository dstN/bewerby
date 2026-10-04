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

// The Chromium 153 build bundled with Playwright 1.63 crashes the whole
// browser when an OPFS handle comes back out of IndexedDB, which the sync
// runner does with the stored folder. Chrome 154 does not, so this file runs
// in the installed Chrome (preinstalled on GitHub's Ubuntu runners).
// ponytail: drop this once Playwright bundles a Chromium past 153.
test.use({ channel: 'chrome' });

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

/** What a sync client does: makes one folder an exact copy of the other, deletions included. */
async function mirrorFolder(from: Page, to: Page): Promise<void> {
	const contents = await readFolder(from);
	await to.evaluate(async () => {
		const root = await navigator.storage.getDirectory();
		await root.removeEntry('Nextcloud', { recursive: true }).catch(() => undefined);
	});
	await writeFolder(to, contents);
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
		expect(
			Object.keys(fromLaptop).some((path) => /^bewerby-sync\/[\w-]{22}\/0\/upd\//.test(path))
		).toBe(true);
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

	test('a key change locks a device out until it has the new passphrase; its files can be erased', async ({
		page,
		browser
	}, testInfo) => {
		const NEW_PASSPHRASE = 'ein ganz neues passwort für alle';
		const laptop = page;
		laptop.on('dialog', (dialog) => dialog.accept());
		await fakeFolderPicker(laptop.context());
		await setUpEncryption(laptop);
		await addApplication(laptop, 'Fabrikam AG');
		await laptop.goto('/backup');
		await laptop.getByRole('button', { name: 'Ordner wählen' }).click();
		await expect(
			laptop.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();

		const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
		await fakeFolderPicker(phoneContext);
		const phone = await phoneContext.newPage();
		phone.on('dialog', (dialog) => dialog.accept());
		await phone.goto('/backup');
		await writeFolder(phone, await readFolder(laptop));
		await phone.getByRole('button', { name: 'Ordner wählen' }).click();
		const join = phone.getByRole('dialog', { name: 'Mit bestehender Synchronisation verbinden' });
		await join.locator('#vault-secret').fill(PASSPHRASE);
		await join.getByRole('button', { name: 'Entsperren und verbinden' }).click();
		await expect(
			phone.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();

		// The laptop changes the key - the current passphrase first - and adds
		// an application under the new one.
		await laptop.getByRole('button', { name: 'Passwort ändern und Geräte ausschließen' }).click();
		const confirm = laptop.getByRole('dialog', {
			name: 'Neuer Schlüssel: aktuelles Passwort bestätigen'
		});
		await confirm.locator('#vault-secret').fill(PASSPHRASE);
		await confirm.getByRole('button', { name: 'Weiter' }).click();
		const setup = laptop.getByRole('dialog', { name: 'Neues Passwort und neuer Schlüssel' });
		await setup.getByLabel('Passwort', { exact: true }).fill(NEW_PASSPHRASE);
		await setup.getByLabel('Passwort wiederholen').fill(NEW_PASSPHRASE);
		await setup.getByRole('button', { name: 'Weiter' }).click();
		const recoveryKey = (await setup.getByTestId('recovery-key').textContent())!.trim();
		await setup.getByLabel('Zur Bestätigung').fill(recoveryKey.slice(-4));
		await setup.getByRole('button', { name: 'Fertig' }).click();
		await expect(setup).toBeHidden();
		await addApplication(laptop, 'Contoso GmbH');
		await laptop.goto('/backup');
		// Twice: a pass already running when the application was added would
		// be the one the first click waits for.
		const syncNow = laptop.getByRole('button', { name: 'Jetzt synchronisieren' });
		for (let i = 0; i < 2; i++) {
			await syncNow.click();
			await expect(syncNow).toBeEnabled();
		}
		// Only the new key's directory is left.
		await expect
			.poll(async () =>
				Object.keys(await readFolder(laptop)).every((path) =>
					/^bewerby-sync\/[\w-]{22}\/1\//.test(path)
				)
			)
			.toBe(true);

		// The phone, still on the old key, stops and receives nothing new.
		await mirrorFolder(laptop, phone);
		await phone.goto('/backup');
		const rekey = phone.getByRole('button', { name: 'Neues Passwort eingeben' });
		await expect(rekey).toBeVisible();
		await phone.goto('/board');
		await expect(phone.locator('.card', { hasText: 'Fabrikam AG' })).toBeVisible();
		await expect(phone.locator('.card', { hasText: 'Contoso GmbH' })).toHaveCount(0);

		// With the new passphrase it follows.
		await phone.goto('/backup');
		await rekey.click();
		const unlock = phone.getByRole('dialog', { name: 'Neuer Schlüssel', exact: true });
		await unlock.locator('#vault-secret').fill(NEW_PASSPHRASE);
		await unlock.getByRole('button', { name: 'Neues Passwort eingeben' }).click();
		await expect(unlock).toBeHidden();
		await expect(
			phone.locator('.card-desc', { hasText: /Zuletzt synchronisiert um/ })
		).toBeVisible();
		await phone.goto('/board');
		await expect(phone.locator('.card', { hasText: 'Contoso GmbH' })).toBeVisible();

		// Right to erasure: the files at the target go, the data here stays.
		await phone.goto('/backup');
		await phone.getByRole('button', { name: 'Trennen und Dateien dort löschen' }).click();
		await expect(phone.locator('.status-msg.success-msg')).toHaveText(
			'Die Dateien am Speicherort sind gelöscht, die Verbindung ist getrennt.'
		);
		// Nothing left but the marker - three bytes, no content - that keeps
		// other devices from uploading it all again.
		const left = await readFolder(phone);
		expect(Object.keys(left)).toHaveLength(1);
		expect(Object.keys(left)[0]).toMatch(/^bewerby-sync\/[\w-]{22}\/erased\.bwv$/);
		expect(Object.values(left)[0]).toEqual([0x42, 0x57, 0x56]);
		await phone.goto('/board');
		await expect(phone.locator('.card')).toHaveCount(2);

		await phoneContext.close();
	});

	test('the store on bewerby.de answers only this site, and only well-formed requests', async ({
		request
	}, testInfo) => {
		const origin = testInfo.project.use.baseURL!;
		const binary = { 'content-type': 'application/octet-stream' };
		const status = await request.post('/api/relay', {
			headers: { ...binary, origin, 'x-relay-op': 'status' }
		});
		expect(status.status()).toBe(204);
		// Ciphertext is served as octet-stream; nosniff keeps a browser from guessing otherwise.
		expect(status.headers()['x-content-type-options']).toBe('nosniff');

		const crossSite = await request.post('/api/relay', {
			headers: { ...binary, origin: 'https://evil.example', 'x-relay-op': 'list' }
		});
		expect(crossSite.status()).toBe(403);

		const space = 'a'.repeat(43);
		const malformed: Record<string, string>[] = [
			{ 'x-relay-op': 'list', 'x-relay-space': 'too-short' },
			{ 'x-relay-op': 'read', 'x-relay-space': space, 'x-relay-path': '../../app.cjs' },
			{ 'x-relay-op': 'nonsense', 'x-relay-space': space }
		];
		for (const headers of malformed) {
			const refused = await request.post('/api/relay', {
				headers: { ...binary, origin, ...headers }
			});
			expect(refused.status()).toBe(400);
		}
	});

	test('the Google token broker runs on the server and refuses cleanly without a secret', async ({
		request
	}, testInfo) => {
		const origin = testInfo.project.use.baseURL!;
		// Not configured here: no GOOGLE_CLIENT_SECRET in this server's environment.
		const unconfigured = await request.post('/api/oauth/google', {
			headers: { origin },
			data: { grant_type: 'refresh_token', refresh_token: 'x' }
		});
		expect(unconfigured.status()).toBe(503);
		expect(unconfigured.headers()['cache-control']).toBe('no-store');
		// hooks.server.ts sets the security headers on dynamic routes.
		expect(unconfigured.headers()['x-content-type-options']).toBe('nosniff');

		const crossSite = await request.post('/api/oauth/google', {
			headers: { origin: 'https://evil.example' },
			data: { grant_type: 'refresh_token', refresh_token: 'x' }
		});
		expect(crossSite.status()).toBe(403);
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
			'Die Verbindung ist nicht zustande gekommen. Es wurde nichts gespeichert.'
		);
		// The code is gone from the address bar.
		await expect(page).toHaveURL(/\/cloud\/callback$/);
	});
});
