<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.js';
	import { resolve } from '$app/paths';
	import {
		getNotificationPermissionState,
		requestNotificationPermission
	} from '#lib/utils/reminders.js';
	import {
		requestPersistentStorage,
		isStoragePersisted,
		getStorageEstimate,
		type StorageEstimate
	} from '#lib/utils/storage.js';
	import { eraseAllData } from '#lib/utils/eraseAllData.js';
	import { syncRunner } from '#lib/sync/runner.svelte.js';
	import { onMount } from 'svelte';
	import { profileStore } from '#lib/stores/profile.svelte.js';
	import { validatePdfFile, PdfProcessingError, type PdfErrorCode } from '#lib/utils/pdf.js';
	import { writePdfToOpfs, readPdfFromOpfs, deletePdfFromOpfs } from '#lib/utils/opfs.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';

	const CV_ERROR_KEYS: Record<PdfErrorCode, string> = {
		'too-large': 'application.pdf.errorTooLarge',
		'too-many-pages': 'application.pdf.errorTooManyPages',
		'not-a-pdf': 'application.pdf.errorNotAPdf',
		encrypted: 'application.pdf.errorEncrypted',
		corrupted: 'application.pdf.errorCorrupted',
		'no-text': 'application.pdf.errorNoText'
	};

	let cvError = $state<string | null>(null);
	let isStoringCv = $state(false);

	async function handleCvUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		// Reset so re-picking the same file after an error fires onchange again.
		target.value = '';
		if (!file) return;

		cvError = null;
		isStoringCv = true;
		try {
			await validatePdfFile(file);
			const previous = profileStore.cvRef;
			const ref = await writePdfToOpfs(file);
			profileStore.setCv(ref, file.name);
			// Only once the new ref is persisted - deleting first would leave
			// the profile pointing at a file that no longer exists.
			if (previous && previous !== ref) await deletePdfFromOpfs(previous);
			announcer.announce(file.name);
		} catch (err) {
			const code = err instanceof PdfProcessingError ? err.code : undefined;
			cvError = code ? t(CV_ERROR_KEYS[code]) : t('application.pdf.errorCorrupted');
			announcer.announce(cvError);
		} finally {
			isStoringCv = false;
		}
	}

	async function removeCv() {
		const ref = profileStore.cvRef;
		if (!ref || !confirm(t('settings.cvRemoveConfirm'))) return;
		profileStore.clearCv();
		await deletePdfFromOpfs(ref);
	}

	async function viewCv() {
		const ref = profileStore.cvRef;
		if (!ref) return;
		const blob = await readPdfFromOpfs(ref);
		if (!blob) {
			cvError = t('application.pdf.viewError');
			return;
		}
		const url = URL.createObjectURL(blob);
		window.open(url, '_blank', 'noopener,noreferrer');
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}

	let permissionState = $derived(getNotificationPermissionState());

	async function toggleNotifications() {
		const result = await requestNotificationPermission();
		permissionState = result;
	}

	let isPersisted = $state(false);
	let storageEstimate = $state<StorageEstimate | null>(null);

	onMount(() => {
		isStoragePersisted().then((value) => (isPersisted = value));
		getStorageEstimate().then((value) => (storageEstimate = value));
	});

	async function handleRequestPersist() {
		isPersisted = await requestPersistentStorage();
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		const units = ['KB', 'MB', 'GB'];
		let value = bytes / 1024;
		let unitIndex = 0;
		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex++;
		}
		return `${value.toFixed(1)} ${units[unitIndex]}`;
	}

	let isErasing = $state(false);
	// The encrypted sync files at the connected target as well (#56).
	let eraseRemote = $state(false);

	async function handleEraseAllData() {
		const remote = eraseRemote && syncRunner.target !== null;
		if (!confirm(t('settings.eraseConfirm'))) return;
		isErasing = true;
		try {
			await eraseAllData({ remote });
			window.location.reload();
		} catch (err) {
			console.error('Failed to erase all data:', err);
			alert(t(remote ? 'settings.eraseRemoteFailed' : 'settings.eraseFailed'));
			isErasing = false;
		}
	}
</script>

<svelte:head>
	<title>{t('nav.settings')} · {t('app.name')}</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<h1>{t('settings.title')}</h1>
		<p class="subtitle">{t('settings.subtitle')}</p>
	</header>

	<div class="settings-grid">
		<!-- Notification settings card -->
		<section class="settings-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.remindersTitle')}
			</h2>
			<p class="card-desc">{t('settings.remindersDesc')}</p>

			<div class="settings-control">
				<div class="status-info">
					<span class="status-label">{t('settings.statusLabel')}</span>
					<span
						class="status-badge"
						class:granted={permissionState === 'granted'}
						class:denied={permissionState === 'denied'}
					>
						{#if permissionState === 'granted'}
							{t('settings.statusActive')}
						{:else}
							{t('settings.statusInactive')}
						{/if}
					</span>
				</div>

				{#if permissionState !== 'granted'}
					<button class="btn-primary" onclick={toggleNotifications}>
						{t('settings.btnAllow')}
					</button>
				{/if}
			</div>
		</section>

		<!-- Storage durability card -->
		<section class="settings-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M4 7a8 3 0 1016 0 8 3 0 10-16 0zm0 0v10a8 3 0 0016 0V7"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.storageTitle')}
			</h2>
			<p class="card-desc">{t('settings.storageDesc')}</p>

			<div class="settings-control">
				<div class="status-info">
					<span class="status-label">{t('settings.storagePersistedLabel')}</span>
					<span class="status-badge" class:granted={isPersisted}>
						{isPersisted ? t('settings.storagePersisted') : t('settings.storageNotPersisted')}
					</span>
				</div>
				{#if !isPersisted}
					<button class="btn-primary" onclick={handleRequestPersist}>
						{t('settings.btnRequestPersist')}
					</button>
				{/if}
			</div>

			{#if storageEstimate}
				<p class="storage-usage">
					{t('settings.storageUsageLabel')}: {formatBytes(storageEstimate.usageBytes)} / {formatBytes(
						storageEstimate.quotaBytes
					)}
				</p>
			{/if}
		</section>

		<!-- Application documents: the CV and the sender block a cover letter needs -->
		<section class="settings-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.documentsTitle')}
			</h2>
			<p class="card-desc">{t('settings.documentsDesc')}</p>

			<div class="doc-block">
				<h3 class="doc-heading">{t('settings.cvLabel')}</h3>
				<p class="doc-hint" id="cv-hint">{t('settings.cvHint')}</p>

				{#if profileStore.cvName}
					<p class="doc-current">{profileStore.cvName}</p>
				{:else}
					<p class="doc-current doc-empty">{t('settings.cvNone')}</p>
				{/if}

				<div class="doc-actions">
					<label class="btn-primary doc-upload">
						<input
							type="file"
							accept=".pdf"
							class="sr-only"
							onchange={handleCvUpload}
							aria-describedby="cv-hint"
							disabled={isStoringCv}
						/>
						{profileStore.cvRef ? t('settings.cvReplace') : t('settings.cvUpload')}
					</label>
					{#if profileStore.cvRef}
						<button type="button" class="btn-flat" onclick={viewCv}>{t('settings.cvView')}</button>
						<button type="button" class="btn-flat" onclick={removeCv}>
							{t('settings.cvRemove')}
						</button>
					{/if}
				</div>

				{#if cvError}
					<p class="doc-error" role="alert">{cvError}</p>
				{/if}
			</div>

			<div class="doc-block">
				<h3 class="doc-heading">{t('settings.senderLabel')}</h3>
				<p class="doc-hint">{t('settings.senderHint')}</p>

				<div class="sender-grid">
					<div class="sender-field">
						<label for="senderName">{t('settings.senderName')}</label>
						<input
							id="senderName"
							type="text"
							value={profileStore.value.senderName}
							placeholder={t('settings.placeholderSenderName')}
							oninput={(e) => profileStore.update({ senderName: e.currentTarget.value })}
						/>
					</div>
					<div class="sender-field">
						<label for="senderStreet">{t('settings.senderStreet')}</label>
						<input
							id="senderStreet"
							type="text"
							value={profileStore.value.senderStreet}
							placeholder={t('settings.placeholderSenderStreet')}
							oninput={(e) => profileStore.update({ senderStreet: e.currentTarget.value })}
						/>
					</div>
					<div class="sender-field">
						<label for="senderCity">{t('settings.senderCity')}</label>
						<input
							id="senderCity"
							type="text"
							value={profileStore.value.senderCity}
							placeholder={t('settings.placeholderSenderCity')}
							oninput={(e) => profileStore.update({ senderCity: e.currentTarget.value })}
						/>
					</div>
					<div class="sender-field">
						<label for="senderEmail">{t('settings.senderEmail')}</label>
						<input
							id="senderEmail"
							type="email"
							value={profileStore.value.senderEmail}
							placeholder={t('settings.placeholderSenderEmail')}
							oninput={(e) => profileStore.update({ senderEmail: e.currentTarget.value })}
						/>
					</div>
					<div class="sender-field">
						<label for="senderPhone">{t('settings.senderPhone')}</label>
						<input
							id="senderPhone"
							type="tel"
							value={profileStore.value.senderPhone}
							placeholder={t('settings.placeholderSenderPhone')}
							oninput={(e) => profileStore.update({ senderPhone: e.currentTarget.value })}
						/>
					</div>
				</div>
			</div>
		</section>

		<!-- Right to erasure -->
		<section class="settings-card danger-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon danger-icon"
				>
					<path
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.eraseTitle')}
			</h2>
			<p class="card-desc">{t('settings.eraseDesc')}</p>
			{#if syncRunner.target}
				<label class="erase-remote">
					<input type="checkbox" bind:checked={eraseRemote} />
					{t('settings.eraseRemote')}
				</label>
			{/if}
			<div class="settings-control">
				<a class="export-hint-link" href={resolve('/backup')}>{t('settings.eraseExportHint')}</a>
				<button class="btn-danger" onclick={handleEraseAllData} disabled={isErasing}>
					{isErasing ? t('settings.eraseInProgress') : t('settings.eraseButton')}
				</button>
			</div>
		</section>

		<!-- Privacy & Offline Info Card -->
		<section class="settings-card">
			<h2 class="card-title">
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					class="card-icon"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linejoin="round"
					/>
				</svg>
				{t('settings.privacyTitle')}
			</h2>
			<ul class="info-list">
				<li>
					<strong>{t('settings.privacyItem1Title')}:</strong>
					{t('settings.privacyItem1Desc')}
				</li>
				<li>
					<strong>{t('settings.privacyItem2Title')}:</strong>
					{t('settings.privacyItem2Desc')}
				</li>
				<li>
					<strong>{t('settings.privacyItem3Title')}:</strong>
					{t('settings.privacyItem3Desc')}
				</li>
			</ul>
			<a class="privacy-link" href={resolve('/datenschutz')}>{t('settings.privacyPolicyLink')}</a>
		</section>
	</div>
</div>

<style>
	.settings-page {
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

	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		align-items: start;
	}

	.settings-card {
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.card-icon {
		color: var(--color-accent-600);
	}

	.card-desc {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 0;
	}

	.erase-remote {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-primary);
	}

	.erase-remote input {
		margin-top: 4px;
	}

	.settings-control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		border-top: 1px solid var(--border-default);
		padding-top: 16px;
		margin-top: 8px;
	}

	.status-info {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.status-label {
		color: var(--text-secondary);
		font-weight: 500;
	}

	.status-badge {
		font-size: 12px;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background-color: var(--surface-2);
		color: var(--text-secondary);
	}

	.status-badge.granted {
		background-color: var(--status-success-bg);
		color: var(--color-success);
	}

	.status-badge.denied {
		background-color: var(--status-danger-bg);
		color: var(--color-danger);
	}

	.doc-block {
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border-subtle);
	}

	.doc-heading {
		margin: 0 0 4px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.doc-hint {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.doc-current {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.doc-empty {
		font-weight: 400;
		color: var(--text-secondary);
	}

	.doc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* A label wrapping a file input, so it needs the button's affordances
	   spelled out - it is not a <button>. */
	.doc-upload {
		display: inline-flex;
		align-items: center;
	}

	.doc-upload:focus-within {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}

	.btn-flat {
		padding: 8px 16px;
		background: transparent;
		color: var(--text-secondary);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.btn-flat:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.doc-error {
		margin: 10px 0 0;
		padding: 8px 10px;
		background-color: var(--status-danger-bg);
		border: 1px solid var(--status-danger-border);
		border-radius: var(--radius-md);
		color: var(--color-danger);
		font-size: 12px;
	}

	.sender-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.sender-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sender-field label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.sender-field input {
		padding: 8px 10px;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
	}

	.sender-field input:focus-visible {
		border-color: var(--color-accent-500);
	}

	@media (max-width: 768px) {
		.sender-grid {
			grid-template-columns: 1fr;
		}
	}

	.btn-primary {
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

	.danger-card {
		border-color: rgba(220, 38, 38, 0.3);
	}

	.danger-icon {
		color: var(--color-danger) !important;
	}

	.export-hint-link {
		font-size: 13px;
		/* --color-accent-600 only clears 4.5:1 as text on a light surface; this
		   card's dark-theme background needs the dedicated text-role token
		   instead (see issue #17). */
		color: var(--color-accent-text);
		text-decoration: none;
	}

	.export-hint-link:hover {
		text-decoration: underline;
	}

	.btn-danger {
		padding: 8px 16px;
		background-color: var(--color-danger-solid);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
		white-space: nowrap;
	}

	.btn-danger:hover:not(:disabled) {
		background-color: #b91c1c;
	}

	.btn-danger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.storage-usage {
		font-size: 12px;
		color: var(--text-tertiary);
		margin: 0;
	}

	.info-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.info-list li {
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.privacy-link {
		display: inline-block;
		margin-top: 4px;
		font-size: 13px;
		font-weight: 600;
		/* See .export-hint-link above - same dark-theme contrast fix. */
		color: var(--color-accent-text);
		text-decoration: none;
	}

	.privacy-link:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.settings-grid {
			grid-template-columns: 1fr;
		}

		.settings-control {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
	}
</style>
