<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import { db, type Application } from '$lib/db/index.js';

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

	// TIER 1: JSON Export
	async function exportDatabase() {
		try {
			const applications = await db.applications.toArray();
			const backupData = {
				version: 1,
				exportedAt: Date.now(),
				applications
			};

			const json = JSON.stringify(backupData, null, 2);
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			const a = document.createElement('a');
			a.href = url;
			a.download = `bewerby-backup-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
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
			const data = JSON.parse(text);

			if (data.version !== 1 || !Array.isArray(data.applications)) {
				importError = 'backup.errorFormat';
				return;
			}

			// Simple verification of keys
			const appsToImport = data.applications as Application[];
			const isValid = appsToImport.every(
				(app) => typeof app.title === 'string' && typeof app.company === 'string'
			);

			if (!isValid) {
				importError = 'backup.errorValidation';
				return;
			}

			// Clear IndexedDB and bulk add
			await db.applications.clear();
			// Strip autoincrement ID if we want fresh insertions or preserve existing IDs
			await db.applications.bulkAdd(appsToImport);

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
			const backupData = {
				version: 1,
				exportedAt: Date.now(),
				applications
			};

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

<div class="backup-page">
	<header class="page-header">
		<h1>{t('backup.title')}</h1>
		<p class="subtitle">{t('backup.subtitle')}</p>
	</header>

	<div class="backup-grid">
		<!-- Tier 1 Card -->
		<section class="card">
			<div class="card-meta">
				<span class="tier-tag">Tier 1</span>
				<h2 class="card-title">{t('backup.manualTitle')}</h2>
			</div>
			<p class="card-desc">{t('backup.manualDesc')}</p>

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

		<!-- Tier 3 Card (Cloud Sync Placeholder) -->
		<section class="card disabled-card">
			<div class="card-meta">
				<span class="tier-tag">Tier 3</span>
				<h2 class="card-title">{t('backup.cloudTitle')}</h2>
			</div>
			<p class="card-desc">{t('backup.cloudDesc')}</p>

			<div class="cloud-providers">
				<div class="provider-box">
					<span class="provider-name">Google Drive</span>
					<span class="provider-status">{t('backup.inactive')}</span>
				</div>
				<div class="provider-box">
					<span class="provider-name">Dropbox</span>
					<span class="provider-status">{t('backup.inactive')}</span>
				</div>
			</div>

			<div class="disabled-notice">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="lock-icon"
				>
					<rect
						x="3"
						y="11"
						width="18"
						height="11"
						rx="2"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
					<path
						d="M7 11V7a5 5 0 0110 0v4"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span>{t('backup.cloudSyncDisabled')}</span>
			</div>
		</section>
	</div>
</div>

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

	.action-row {
		display: flex;
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

	.status-msg {
		font-size: 13px;
		font-weight: 500;
		padding: 10px 12px;
		border-radius: var(--radius-md);
		margin-top: 4px;
	}

	.success-msg {
		background-color: rgba(22, 163, 74, 0.1);
		color: var(--color-success);
		border: 1px solid rgba(22, 163, 74, 0.2);
	}

	.error-msg {
		background-color: rgba(220, 38, 38, 0.1);
		color: var(--color-danger);
		border: 1px solid rgba(220, 38, 38, 0.2);
	}

	/* Disabled / Greyed out state (Cloud sync) */
	.disabled-card {
		grid-column: span 2;
		opacity: 0.6;
		background-color: var(--surface-1);
		border-style: dashed;
		pointer-events: none;
	}

	.cloud-providers {
		display: flex;
		gap: 16px;
		margin: 8px 0;
	}

	.provider-box {
		flex: 1;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.provider-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.provider-status {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-tertiary);
		text-transform: uppercase;
	}

	.disabled-notice {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--text-secondary);
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 8px 12px;
	}

	.lock-icon {
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.backup-grid {
			grid-template-columns: 1fr;
		}

		.disabled-card {
			grid-column: span 1;
		}

		.action-row {
			flex-direction: column;
			align-items: stretch;
		}

		.cloud-providers {
			flex-direction: column;
		}
	}
</style>
