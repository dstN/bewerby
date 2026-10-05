<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { db } from '#lib/db/index.js';
	import { importApplications } from '#lib/data/applications.js';
	import { readPdfFromOpfs, writePdfToOpfs } from '#lib/utils/opfs.js';
	import {
		buildBackupPayload,
		parseBackupPayload,
		prepareImportRows,
		type BackupPayload
	} from '#lib/utils/backup.js';
	import { profileStore } from '#lib/stores/profile.svelte.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';
	import { VaultError, type KeyHeader } from '#lib/vault/format.js';
	import { forgetRoot, loadStoredVault, storeVault } from '#lib/vault/keystore.js';
	import { openFile, readFileHeader, sealFile, type UnlockedVault } from '#lib/vault/vault.js';
	import { activeSync, enableSync, useRuntime } from '#lib/crdt/session.js';
	import { decodeSnapshot, encodeSnapshot } from '#lib/crdt/snapshot.js';
	import { adoptVault as adoptVaultForDevice, setUnlockedVault } from '#lib/vault/session.js';
	import { syncRunner } from '#lib/sync/runner.svelte.js';
	import { parsePath } from '#lib/sync/engine.js';
	import { JUST_CONNECTED, SyncState } from '#lib/sync/state.js';
	import { isFolderSyncSupported, pickSyncFolder } from '#lib/sync/adapters/folder.js';
	import { dropboxAuthorizeUrl } from '#lib/sync/adapters/dropbox.js';
	import { googleAuthorizeUrl } from '#lib/sync/adapters/gdrive.js';
	import { oneDriveAuthorizeUrl } from '#lib/sync/adapters/onedrive.js';
	import { pkcePair, redirectUri, rememberAuthorization, type Provider } from '#lib/sync/oauth.js';
	import {
		DROPBOX_CLIENT_ID,
		GOOGLE_CLIENT_ID,
		ONEDRIVE_CLIENT_ID,
		TARGET_NAMES,
		openStore
	} from '#lib/sync/targets.js';
	import { liveSync } from '#lib/sync/live/live.svelte.js';
	import PairDialog from '#lib/components/vault/PairDialog.svelte';
	import VaultSetupDialog from '#lib/components/vault/VaultSetupDialog.svelte';
	import VaultUnlockDialog from '#lib/components/vault/VaultUnlockDialog.svelte';

	// File System Access API isn't part of lib.dom.d.ts yet; declare just enough
	// of it for the feature-detected local dump below.
	interface FileSystemWritableFileStream {
		write(data: string): Promise<void>;
		close(): Promise<void>;
	}
	interface FileSystemFileHandle {
		createWritable(): Promise<FileSystemWritableFileStream>;
	}
	interface FileSystemDirectoryHandle {
		getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
	}
	interface WindowWithDirectoryPicker extends Window {
		showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
	}

	let importStatus = $state('');
	let importError = $state('');
	let localDumpStatus = $state('');
	let importMode = $state<'merge' | 'replace'>('merge');

	// ENCRYPTED BACKUP (#50): this device's vault, and its root key when it
	// is remembered or was unlocked during this visit.
	let vaultHeader = $state.raw<KeyHeader | null>(null);
	let vaultRoot = $state.raw<CryptoKey | null>(null);
	let rememberedKey = $state(false);
	let vaultStatus = $state('');
	let vaultError = $state('');
	let setupOpen = $state(false);
	let canShareFiles = $state(false);
	type UnlockRequest =
		{ kind: 'export'; share: boolean } | { kind: 'import'; bytes: Uint8Array; header: KeyHeader };
	let unlockRequest = $state.raw<UnlockRequest | null>(null);

	// SYNC (#53): the target, its status and the schedule live in syncRunner;
	// this page only connects, disconnects and shows them.
	const syncState = new SyncState();
	let folderSyncSupported = $state(false);
	let syncNotice = $state('');
	let joinHeader = $state.raw<KeyHeader | null>(null);
	let syncUnlockOpen = $state(false);
	// Adding a device (#55): the passphrase first, which yields the key bytes
	// the new device receives, then the pairing dialog.
	let pairUnlockOpen = $state(false);
	let pairRaw = $state.raw<Uint8Array | null>(null);
	// Key change (#56): the current passphrase first, then the new one.
	let rotateStep = $state<'confirm' | 'new' | null>(null);
	// Another device changed the key: unlock the new one here.
	let rekeyOpen = $state(false);
	let syncError = $state('');

	onMount(() => {
		loadStoredVault()
			.then((stored) => {
				vaultHeader = stored?.header ?? null;
				vaultRoot = stored?.root ?? null;
				rememberedKey = Boolean(stored?.root);
			})
			.catch((err) => console.error('Loading the vault failed:', err));
		// Probed with the exact name and type the export shares: browsers only
		// promise to share a list of common file types (see MDN on
		// navigator.share), and .bwv is not one of them. Where canShare says
		// no, the download is the way; on iOS that lands in the Files app too.
		folderSyncSupported = isFolderSyncSupported();
		// Back from Dropbox's sign-in (see /cloud/callback).
		if (sessionStorage.getItem(JUST_CONNECTED)) {
			sessionStorage.removeItem(JUST_CONNECTED);
			void afterConnect();
		} else {
			void syncRunner.start();
		}
		canShareFiles =
			typeof navigator.canShare === 'function' &&
			navigator.canShare({
				files: [new File([''], 'probe.bwv', { type: 'application/octet-stream' })]
			});
	});

	/** Makes a vault this device's own; from here on it syncs (#52). */
	async function adoptVault(header: KeyHeader, root: CryptoKey, remember: boolean) {
		await adoptVaultForDevice(header, root, remember);
		vaultHeader = header;
		vaultRoot = root;
		rememberedKey = remember;
	}

	async function onVaultCreated(vault: UnlockedVault, remember: boolean) {
		await adoptVault(vault.header, vault.root, remember);
	}

	function exportEncrypted(share: boolean) {
		vaultStatus = '';
		vaultError = '';
		if (!vaultRoot) {
			unlockRequest = { kind: 'export', share };
			return;
		}
		void writeEncryptedBackup(vaultRoot, share);
	}

	async function writeEncryptedBackup(root: CryptoKey, share: boolean) {
		if (!vaultHeader) return;
		try {
			// A syncing device exports its document, so importing the file elsewhere
			// merges instead of duplicating; the plain backup is the fallback
			// should the sync layer not have started.
			const sync = await activeSync();
			const vault = { header: vaultHeader, root };
			const bytes = sync
				? await sealFile(vault, 'sync', encodeSnapshot(await sync.exportSnapshot()))
				: await sealFile(vault, 'backup', await currentBackup());
			const name = `bewerby-backup-${today()}.bwv`;
			const blob = new Blob([bytes], { type: 'application/octet-stream' });
			if (share) {
				try {
					await navigator.share({ files: [new File([blob], name, { type: blob.type })] });
				} catch (err) {
					if (err instanceof DOMException && err.name === 'AbortError') return;
					// Sharing needs a fresh tap; deriving the key in the unlock
					// dialog can outlast it. The key stays unlocked for this visit.
					if (err instanceof DOMException && err.name === 'NotAllowedError') {
						vaultStatus = 'backup.vault.shareAgain';
						return;
					}
					throw err;
				}
			} else {
				downloadBlob(blob, name);
			}
			vaultStatus = 'backup.vault.exported';
			announcer.announce(t('backup.vault.exported'));
		} catch (err) {
			console.error('Encrypted export failed:', err);
			vaultError = 'backup.vault.errorExport';
		}
	}

	async function unlockedForExport(root: CryptoKey, remember: boolean, share: boolean) {
		if (remember && vaultHeader) {
			await storeVault(vaultHeader, root);
			rememberedKey = true;
		}
		vaultRoot = root;
		if (vaultHeader) setUnlockedVault({ header: vaultHeader, root });
		await writeEncryptedBackup(root, share);
	}

	async function chooseEncryptedFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		vaultStatus = '';
		vaultError = '';
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			unlockRequest = { kind: 'import', bytes, header: readFileHeader(bytes) };
		} catch (err) {
			vaultError =
				err instanceof VaultError && err.code === 'unsupported'
					? 'backup.vault.errorUnsupported'
					: 'backup.vault.errorNotVault';
		}
	}

	/**
	 * True when importing this file should make its vault this device's own:
	 * no vault here yet, a newer key of this vault (how a device without a
	 * shared target follows a key change, #56), or the same key while it is
	 * not remembered. Never an older key.
	 */
	function adoptsVault(header: KeyHeader): boolean {
		if (!vaultHeader) return true;
		if (vaultHeader.vaultId !== header.vaultId) return false;
		return (
			header.epoch > vaultHeader.epoch || (header.epoch === vaultHeader.epoch && !rememberedKey)
		);
	}

	async function rotated(vault: UnlockedVault, remember: boolean) {
		await syncRunner.rotate(vault, remember);
		vaultHeader = vault.header;
		vaultRoot = vault.root;
		rememberedKey = remember;
		vaultStatus = 'backup.vault.rotated';
		vaultError = '';
	}

	async function unlockedForImport(
		request: Extract<UnlockRequest, { kind: 'import' }>,
		root: CryptoKey,
		remember: boolean
	): Promise<string | false | void> {
		const { kind, json } = await openFile(request.bytes, root);
		// A device without a vault of its own takes over the file's, so its own
		// encrypted backups open with the same passphrase and recovery key.
		const adopt = adoptsVault(request.header);

		if (kind === 'sync') {
			const snapshot = decodeSnapshot(json);
			if (!snapshot) return t('backup.errorFormat');
			if (importMode === 'replace' && !confirm(t('backup.confirmReplace'))) return false;
			// Adopt first: merging needs the sync layer, which needs a vault.
			if (adopt) await adoptVault(request.header, root, remember);
			const sync = await enableSync();
			if (!sync) return t('backup.vault.errorUnexpected');
			try {
				if (importMode === 'replace') useRuntime(await sync.replaceWith(snapshot));
				else await sync.merge(snapshot);
			} catch (err) {
				console.error('Merging the encrypted backup failed:', err);
				return t('backup.vault.errorCorrupt');
			}
		} else {
			const parsed = parseBackupPayload(json);
			if (!parsed.ok) {
				return t(parsed.error === 'format' ? 'backup.errorFormat' : 'backup.errorValidation');
			}
			if (!(await applyBackup(parsed.data))) return false;
			if (adopt) await adoptVault(request.header, root, remember);
		}
		vaultStatus = 'backup.vault.imported';
		announcer.announce(t('backup.vault.imported'));
	}

	async function connectFolder() {
		syncNotice = '';
		try {
			const { handle, name } = await pickSyncFolder();
			await syncState.setTarget({ kind: 'folder', handle, name });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			console.error('Connecting the sync folder failed:', err);
			syncNotice = 'sync.statusError';
			return;
		}
		await afterConnect();
	}

	/** Only the providers this build has a client id for (vite.config.ts). */
	const cloudProviders = [
		{
			provider: 'dropbox' as const,
			clientId: DROPBOX_CLIENT_ID,
			authorizeUrl: dropboxAuthorizeUrl,
			label: 'sync.connectDropbox',
			hint: 'sync.connectDropboxHint'
		},
		{
			provider: 'onedrive' as const,
			clientId: ONEDRIVE_CLIENT_ID,
			authorizeUrl: oneDriveAuthorizeUrl,
			label: 'sync.connectOneDrive',
			hint: 'sync.connectOneDriveHint'
		},
		{
			provider: 'google' as const,
			clientId: GOOGLE_CLIENT_ID,
			authorizeUrl: googleAuthorizeUrl,
			label: 'sync.connectGoogle',
			hint: 'sync.connectGoogleHint'
		}
	].filter((entry) => entry.clientId);

	/** Off to the provider's sign-in; it comes back through /cloud/callback. */
	async function connectCloud(provider: Provider) {
		const entry = cloudProviders.find((candidate) => candidate.provider === provider);
		if (!entry) return;
		const { verifier, challenge } = await pkcePair();
		const uri = redirectUri();
		const state = rememberAuthorization(provider, verifier, uri);
		location.assign(
			entry.authorizeUrl({ clientId: entry.clientId, redirectUri: uri, challenge, state })
		);
	}

	/**
	 * After a target was connected: sync, if this device has a vault - or,
	 * if not, offer to join the sync already there, unlocked with its
	 * passphrase or recovery key like an imported file.
	 */
	async function afterConnect() {
		if (vaultHeader) {
			await syncRunner.start();
			return;
		}
		const target = await syncState.target();
		if (!target) return;
		try {
			const store = await openStore(target, syncState, true);
			// The newest key first, and update files before snapshots: they are
			// small, and any one carries the key header.
			const files = (await store.list())
				.map((path) => ({ path, parsed: parsePath(path) }))
				.filter(({ parsed }) => parsed && parsed.kind !== 'blob')
				.sort(
					(a, b) =>
						b.parsed!.epoch - a.parsed!.epoch ||
						Number(b.parsed!.kind === 'upd') - Number(a.parsed!.kind === 'upd')
				)
				.map(({ path }) => path);
			for (const path of files) {
				try {
					joinHeader = readFileHeader(await store.read(path));
					return;
				} catch {
					// Not a vault file; try the next one.
				}
			}
			syncNotice = 'sync.joinEmpty';
		} catch (err) {
			console.error('Reading the sync target failed:', err);
			syncNotice = 'sync.statusError';
		}
		await syncRunner.start();
	}

	async function joinedSync(header: KeyHeader, root: CryptoKey, remember: boolean) {
		await adoptVault(header, root, remember);
		syncNotice = 'sync.joined';
		announcer.announce(t('sync.joined'));
	}

	async function unlockedForSync(root: CryptoKey, remember: boolean) {
		if (!vaultHeader) return;
		if (remember && !rememberedKey) {
			await storeVault(vaultHeader, root);
			rememberedKey = true;
		}
		vaultRoot = root;
		setUnlockedVault({ header: vaultHeader, root });
	}

	async function syncNowClicked() {
		syncNotice = '';
		await syncRunner.syncNow(true);
		announcer.announce(
			syncRunner.status === 'idle' ? statusText(syncRunner.lastSync) : t('sync.statusError')
		);
	}

	async function reconnectSync() {
		const target = syncRunner.target;
		if (target && target !== 'folder') await connectCloud(target);
		else await syncRunner.syncNow(true);
	}

	/** With `erase`, this vault's files at the target are deleted first (#56). */
	async function disconnectSync(erase = false) {
		if (!confirm(t(erase ? 'sync.eraseConfirm' : 'sync.disconnectConfirm'))) return;
		syncNotice = '';
		syncError = '';
		try {
			await syncRunner.disconnect(erase);
		} catch (err) {
			console.error('Deleting the sync files failed:', err);
			syncError = 'sync.eraseFailed';
			void syncRunner.start();
			return;
		}
		syncNotice = erase ? 'sync.erased' : 'sync.disconnected';
		announcer.announce(t(syncNotice));
	}

	function statusText(lastSync: number | null): string {
		if (!lastSync) return '';
		return t('sync.statusIdle').replace(
			'{time}',
			new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		);
	}

	let syncStatusText = $derived.by(() => {
		switch (syncRunner.status) {
			case 'idle':
				return statusText(syncRunner.lastSync);
			case 'syncing':
				return t('sync.statusSyncing');
			case 'error':
				return t('sync.statusError');
			case 'locked':
				return t('sync.statusLocked');
			case 'rekey':
				return t('sync.statusRekey');
			case 'reconnect':
				return syncRunner.target && syncRunner.target !== 'folder'
					? t('sync.statusReconnectCloud').replace('{name}', TARGET_NAMES[syncRunner.target])
					: t('sync.statusReconnectFolder');
			default:
				return vaultHeader ? '' : t('sync.statusOff');
		}
	});

	async function forgetKey() {
		if (!confirm(t('backup.vault.forgetConfirm'))) return;
		await forgetRoot();
		rememberedKey = false;
		vaultRoot = null;
		setUnlockedVault(null);
		vaultStatus = 'backup.vault.forgotten';
		vaultError = '';
	}

	function today(): string {
		return new Date().toISOString().slice(0, 10);
	}

	function downloadBlob(blob: Blob, fileName: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	async function currentBackup(): Promise<BackupPayload> {
		const applications = await db.applications.toArray();
		return buildBackupPayload(applications, readPdfFromOpfs, profileStore.value);
	}

	/**
	 * Writes a validated backup into this browser. Shared by the JSON and the
	 * encrypted import, so both merge and replace identically. Returns false
	 * when the user declined the replace confirmation.
	 */
	async function applyBackup(data: BackupPayload): Promise<boolean> {
		if (importMode === 'replace' && !confirm(t('backup.confirmReplace'))) {
			return false;
		}

		const { rows: rowsToInsert, profile: importedProfile } = await prepareImportRows(
			data,
			writePdfToOpfs
		);

		await importApplications(rowsToInsert, importMode);

		// Only after the rows are committed, and only on a replace - merging
		// into an existing setup must not silently overwrite the sender
		// details this browser already holds. Version-2 files carry none.
		if (importedProfile && importMode === 'replace') {
			profileStore.replaceAll(importedProfile);
		}
		return true;
	}

	// TIER 1: JSON Export
	async function exportDatabase() {
		try {
			const json = JSON.stringify(await currentBackup(), null, 2);
			downloadBlob(
				new Blob([json], { type: 'application/json' }),
				`bewerby-backup-${today()}.json`
			);
		} catch (err) {
			console.error('Database export failed:', err);
			alert(t('backup.errorSaveFail'));
		}
	}

	// TIER 1: JSON Import
	async function importDatabase(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		importStatus = '';
		importError = '';

		try {
			const text = await file.text();
			const parsed = parseBackupPayload(text);
			if (!parsed.ok) {
				importError = parsed.error === 'format' ? 'backup.errorFormat' : 'backup.errorValidation';
				return;
			}

			if (!(await applyBackup(parsed.data))) return;
			importStatus = 'backup.successImport';
		} catch (err) {
			console.error('Database import failed:', err);
			importError = 'backup.errorRead';
		} finally {
			target.value = ''; // Reset uploader input
		}
	}

	// TIER 2: Local Directory Dump (File System Access API)
	async function triggerLocalDump() {
		localDumpStatus = '';
		if (!('showDirectoryPicker' in window)) {
			alert(t('backup.errorDirectSave'));
			return;
		}

		try {
			// Ask user to pick a folder
			const handle = await (window as unknown as WindowWithDirectoryPicker).showDirectoryPicker();
			const applications = await db.applications.toArray();
			const backupData = await buildBackupPayload(applications, readPdfFromOpfs);
			const json = JSON.stringify(backupData, null, 2);

			// Create file inside folder
			const fileHandle = await handle.getFileHandle(
				`bewerby-local-dump-${new Date().toISOString().slice(0, 10)}.json`,
				{ create: true }
			);
			const writable = await fileHandle.createWritable();
			await writable.write(json);
			await writable.close();

			localDumpStatus = 'backup.successLocal';
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				// User cancelled directory picker
				return;
			}
			console.error('Local directory dump failed:', err);
			alert(t('backup.errorSaveFail'));
		}
	}
</script>

<svelte:head>
	<title>{t('nav.backup')} · {t('app.name')}</title>
</svelte:head>

<div class="backup-page">
	<header class="page-header">
		<h1>{t('backup.title')}</h1>
		<p class="subtitle">{t('backup.subtitle')}</p>
	</header>

	<div class="backup-grid">
		<!-- Encrypted backup (#50): the recommended way to keep a copy anywhere. -->
		<section class="card wide-card" aria-labelledby="vault-title">
			<div class="card-meta">
				<span class="recommended-tag">{t('backup.vault.recommended')}</span>
				<h2 class="card-title" id="vault-title">{t('backup.vault.title')}</h2>
			</div>
			<p class="card-desc">{t('backup.vault.desc')}</p>
			{#if vaultHeader}
				<p class="vault-state">
					{rememberedKey ? t('backup.vault.statusRemembered') : t('backup.vault.statusLocked')}
				</p>
			{/if}

			<div class="action-row">
				{#if vaultHeader}
					<button class="btn-primary" onclick={() => exportEncrypted(false)}>
						{t('backup.vault.exportButton')}
					</button>
					{#if canShareFiles}
						<button class="btn-secondary" onclick={() => exportEncrypted(true)}>
							{t('backup.vault.shareButton')}
						</button>
					{/if}
				{:else}
					<button class="btn-primary" onclick={() => (setupOpen = true)}>
						{t('backup.vault.setupButton')}
					</button>
				{/if}
				<label class="btn-secondary file-uploader">
					<!-- application/octet-stream as well: iOS greys out files whose
					     extension it does not know when only ".bwv" is listed. -->
					<input
						type="file"
						accept=".bwv,application/octet-stream"
						onchange={chooseEncryptedFile}
						class="sr-only"
					/>
					{t('backup.vault.importButton')}
				</label>
				{#if vaultHeader}
					<button class="btn-text" onclick={() => (rotateStep = 'confirm')}>
						{t('backup.vault.rotateButton')}
					</button>
				{/if}
				{#if rememberedKey}
					<button class="btn-text" onclick={forgetKey}>{t('backup.vault.forgetButton')}</button>
				{/if}
			</div>

			{#if vaultStatus}
				<div class="status-msg success-msg">{t(vaultStatus)}</div>
			{/if}
			{#if vaultError}
				<div class="status-msg error-msg" role="alert">{t(vaultError)}</div>
			{/if}
		</section>

		<!-- Tier 1 Card -->
		<section class="card">
			<div class="card-meta">
				<span class="tier-tag">Tier 1</span>
				<h2 class="card-title">{t('backup.manualTitle')}</h2>
			</div>
			<p class="card-desc">{t('backup.manualDesc')}</p>

			<fieldset class="import-mode-group">
				<legend>{t('backup.importModeLabel')}</legend>
				<label class="import-mode-option">
					<input type="radio" name="importMode" value="merge" bind:group={importMode} />
					{t('backup.importModeMerge')}
				</label>
				<label class="import-mode-option">
					<input type="radio" name="importMode" value="replace" bind:group={importMode} />
					{t('backup.importModeReplace')}
				</label>
			</fieldset>

			<div class="action-row">
				<button class="btn-secondary" onclick={exportDatabase}>
					{t('backup.exportJson')}
				</button>

				<label class="btn-primary file-uploader">
					<input type="file" accept=".json" onchange={importDatabase} class="sr-only" />
					{t('backup.importJson')}
				</label>
			</div>

			{#if importStatus}
				<div class="status-msg success-msg">{t('backup.successImport')}</div>
			{/if}
			{#if importError}
				<div class="status-msg error-msg">{t(importError)}</div>
			{/if}
		</section>

		<!-- Tier 2 Card -->
		<section class="card">
			<div class="card-meta">
				<span class="tier-tag">Tier 2</span>
				<h2 class="card-title">{t('backup.localTitle')}</h2>
			</div>
			<p class="card-desc">{t('backup.localDesc')}</p>

			<div class="action-row">
				<button class="btn-secondary" onclick={triggerLocalDump}>
					{t('backup.localButton')}
				</button>
			</div>

			{#if localDumpStatus}
				<div class="status-msg success-msg">{t('backup.successLocal')}</div>
			{/if}
		</section>

		<!-- Tier 3: sync between devices (#53). Deliberately no live region on
		     the status line - it changes every minute in the background; only
		     results the user asked for are announced. -->
		<section class="card wide-card" id="sync" aria-labelledby="sync-title">
			<div class="card-meta">
				<span class="tier-tag">Tier 3</span>
				<h2 class="card-title" id="sync-title">{t('sync.title')}</h2>
			</div>
			<p class="card-desc">{t('sync.desc')}</p>

			{#if syncRunner.target}
				<p class="vault-state">
					{syncRunner.target === 'folder'
						? t('sync.connectedFolder').replace('{name}', syncRunner.targetName ?? '')
						: t('sync.connectedCloud').replace('{name}', TARGET_NAMES[syncRunner.target])}
				</p>
				{#if syncStatusText}
					<p class="card-desc">{syncStatusText}</p>
				{/if}
				{#if syncRunner.lastReport?.foreign}
					<p class="card-desc">{t('sync.foreign')}</p>
				{/if}
				<div class="action-row">
					{#if syncRunner.status === 'locked'}
						<button class="btn-primary" onclick={() => (syncUnlockOpen = true)}>
							{t('sync.unlock')}
						</button>
					{:else if syncRunner.status === 'rekey'}
						<button class="btn-primary" onclick={() => (rekeyOpen = true)}>
							{t('sync.rekeyButton')}
						</button>
					{:else if syncRunner.status === 'reconnect'}
						<button class="btn-primary" onclick={reconnectSync}>{t('sync.reconnect')}</button>
					{:else if vaultHeader}
						<button
							class="btn-primary"
							onclick={syncNowClicked}
							disabled={syncRunner.status === 'syncing'}
						>
							{t('sync.syncNow')}
						</button>
					{/if}
					<button class="btn-text" onclick={() => disconnectSync()}>{t('sync.disconnect')}</button>
					<button class="btn-text" onclick={() => disconnectSync(true)}>
						{t('sync.eraseButton')}
					</button>
				</div>
			{:else}
				{#if syncRunner.erasedAt}
					<p class="status-msg success-msg">{t('sync.erasedElsewhere')}</p>
				{/if}
				{#if !vaultHeader}
					<p class="card-desc">{t('sync.needsVault')}</p>
				{/if}
				{#if folderSyncSupported || cloudProviders.length > 0}
					<div class="sync-options">
						{#if folderSyncSupported}
							<div class="sync-option">
								<button class="btn-primary" onclick={connectFolder}>
									{t('sync.connectFolder')}
								</button>
								<p class="card-desc">{t('sync.connectFolderHint')}</p>
							</div>
						{/if}
						{#each cloudProviders as entry (entry.provider)}
							<div class="sync-option">
								<button class="btn-secondary" onclick={() => connectCloud(entry.provider)}>
									{t(entry.label)}
								</button>
								<p class="card-desc">{t(entry.hint)}</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="card-desc">{t('sync.unavailable')}</p>
				{/if}
			{/if}

			{#if syncNotice}
				<div class="status-msg success-msg">{t(syncNotice)}</div>
			{/if}
			{#if syncError}
				<div class="status-msg error-msg" role="alert">{t(syncError)}</div>
			{/if}

			{#if vaultHeader}
				<div class="device-link">
					<div class="sync-option">
						<button class="btn-secondary" onclick={() => (pairUnlockOpen = true)}>
							{t('pair.addDevice')}
						</button>
						<p class="card-desc">{t('pair.addDeviceHint')}</p>
					</div>
					<label class="import-mode-option">
						<input
							type="checkbox"
							checked={liveSync.enabled}
							onchange={(event) => liveSync.setEnabled(event.currentTarget.checked)}
							aria-describedby="live-hint"
						/>
						{t('pair.liveLabel')}
					</label>
					<p class="card-desc" id="live-hint">{t('pair.liveHint')}</p>
					{#if liveSync.peers > 0}
						<p class="vault-state">
							{t('pair.livePeers').replace('{count}', String(liveSync.peers))}
						</p>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

{#if setupOpen}
	<VaultSetupDialog onclose={() => (setupOpen = false)} oncreated={onVaultCreated} />
{/if}

{#if rotateStep === 'confirm' && vaultHeader}
	<!-- The current secret first, so a device left unlocked cannot lock the
	     owner's other devices out. -->
	<VaultUnlockDialog
		title={t('backup.vault.rotateConfirmTitle')}
		header={vaultHeader}
		submitLabel={t('backup.vault.next')}
		showRemember={false}
		onunlock={async (root) => {
			// Unlocked for this visit, so the key change can fetch the other
			// devices' latest changes under the old key first.
			if (vaultHeader) setUnlockedVault({ header: vaultHeader, root });
			vaultRoot = root;
			rotateStep = 'new';
		}}
		onclose={() => {
			if (rotateStep === 'confirm') rotateStep = null;
		}}
	/>
{:else if rotateStep === 'new' && vaultHeader}
	<VaultSetupDialog
		previous={vaultHeader}
		title={t('backup.vault.rotateTitle')}
		intro={t('backup.vault.rotateIntro')}
		doneMessage={t('backup.vault.rotated')}
		onclose={() => (rotateStep = null)}
		oncreated={rotated}
	/>
{/if}

{#if rekeyOpen && syncRunner.newerKey}
	{@const header = syncRunner.newerKey}
	<VaultUnlockDialog
		title={t('sync.rekeyTitle')}
		{header}
		submitLabel={t('sync.rekeyButton')}
		showRemember={true}
		note={t('sync.rekeyNote')}
		onunlock={(root, remember) => adoptVault(header, root, remember)}
		onclose={() => (rekeyOpen = false)}
	/>
{/if}

{#if joinHeader}
	{@const header = joinHeader}
	<VaultUnlockDialog
		title={t('sync.joinTitle')}
		{header}
		submitLabel={t('sync.joinSubmit')}
		showRemember={true}
		note={t('sync.joinNote')}
		onunlock={(root, remember) => joinedSync(header, root, remember)}
		onclose={() => (joinHeader = null)}
	/>
{/if}

{#if pairUnlockOpen && vaultHeader}
	<VaultUnlockDialog
		title={t('pair.unlockTitle')}
		header={vaultHeader}
		submitLabel={t('pair.unlockSubmit')}
		showRemember={false}
		keepRaw={true}
		onunlock={async (_root, _remember, raw) => {
			pairRaw = raw ?? null;
		}}
		onclose={() => (pairUnlockOpen = false)}
	/>
{/if}

{#if pairRaw && vaultHeader}
	<PairDialog header={vaultHeader} raw={pairRaw} onclose={() => (pairRaw = null)} />
{/if}

{#if syncUnlockOpen && vaultHeader}
	<VaultUnlockDialog
		title={t('sync.unlockTitle')}
		header={vaultHeader}
		submitLabel={t('sync.unlock')}
		showRemember={!rememberedKey}
		onunlock={unlockedForSync}
		onclose={() => (syncUnlockOpen = false)}
	/>
{/if}

{#if unlockRequest?.kind === 'export' && vaultHeader}
	{@const share = unlockRequest.share}
	<VaultUnlockDialog
		title={t('backup.vault.unlockExportTitle')}
		header={vaultHeader}
		submitLabel={t('backup.vault.unlockSubmit')}
		showRemember={!rememberedKey}
		onunlock={(root, remember) => unlockedForExport(root, remember, share)}
		onclose={() => (unlockRequest = null)}
	/>
{:else if unlockRequest?.kind === 'import'}
	{@const request = unlockRequest}
	<VaultUnlockDialog
		title={t('backup.vault.unlockImportTitle')}
		header={request.header}
		submitLabel={t('backup.vault.importSubmit')}
		showRemember={adoptsVault(request.header)}
		note={vaultHeader ? undefined : t('backup.vault.adoptNote')}
		onunlock={(root, remember) => unlockedForImport(request, root, remember)}
		onclose={() => (unlockRequest = null)}
	>
		{#snippet extra()}
			<fieldset>
				<legend>{t('backup.importModeLabel')}</legend>
				<label class="choice">
					<input type="radio" name="vault-import-mode" value="merge" bind:group={importMode} />
					{t('backup.importModeMerge')}
				</label>
				<label class="choice">
					<input type="radio" name="vault-import-mode" value="replace" bind:group={importMode} />
					{t('backup.importModeReplace')}
				</label>
			</fieldset>
		{/snippet}
	</VaultUnlockDialog>
{/if}

<style>
	.backup-page {
		display: flex;
		flex-direction: column;
		gap: 24px;
		height: 100%;
		width: 100%;
	}

	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--text-primary);
		margin: 0;
	}

	.subtitle {
		font-size: 13px;
		color: var(--text-secondary);
		margin: 4px 0 0 0;
	}

	.backup-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}

	.card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 24px;
		box-shadow: var(--shadow-sm);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tier-tag {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background-color: var(--surface-2);
		color: var(--text-secondary);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-subtle);
	}

	/* Same treatment as .tier-tag (not a dimmed/opacity-based style) so this
	   badge's text meets the same contrast floor as the rest of the app - see
	   issue #28, which specifically flagged opacity-based "disabled" styling
	   for failing contrast. */
	/* Accent text on the neutral tag surface: --color-accent-text is the
	   shade tuned for AAA contrast in both themes (see app.css). */
	.recommended-tag {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background-color: var(--surface-2);
		color: var(--color-accent-text);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-subtle);
	}

	.wide-card {
		grid-column: span 2;
	}

	.sync-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.device-link {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 16px;
		border-top: 1px solid var(--border-default);
	}

	.sync-option {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.vault-state {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.btn-text {
		align-self: center;
		padding: 8px 4px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 13px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.btn-text:hover {
		color: var(--text-primary);
	}

	.card-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.card-desc {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0;
	}

	.import-mode-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: 12px 14px;
		margin: 0;
	}

	.import-mode-group legend {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		padding: 0 4px;
	}

	.import-mode-option {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--text-primary);
		cursor: pointer;
	}

	.action-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: auto;
		padding-top: 8px;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 16px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-primary:hover {
		background-color: var(--color-accent-700);
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px 16px;
		background-color: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-secondary:hover {
		background-color: var(--surface-3);
	}

	.file-uploader {
		position: relative;
	}

	/* The real <input type="file"> inside is visually hidden (.sr-only), so a
	   focus ring on the input itself would be imperceptible; show it on this
	   label instead when the hidden input receives keyboard focus. */
	.file-uploader:focus-within {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}

	.status-msg {
		font-size: 13px;
		font-weight: 500;
		padding: 10px 12px;
		border-radius: var(--radius-md);
		margin-top: 4px;
	}

	.success-msg {
		background-color: var(--status-success-bg);
		color: var(--color-success);
		border: 1px solid var(--status-success-border);
	}

	.error-msg {
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
		border: 1px solid var(--status-danger-border);
	}

	@media (max-width: 768px) {
		.backup-grid {
			grid-template-columns: 1fr;
		}

		.wide-card {
			grid-column: span 1;
		}

		.action-row {
			flex-direction: column;
			align-items: stretch;
		}

		.sync-options {
			grid-template-columns: 1fr;
		}
	}
</style>
