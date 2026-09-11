<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { i18n, t } from '$lib/i18n/index.svelte.js';
	import { db, type Application } from '$lib/db/index.js';
	import { profileStore } from '$lib/stores/profile.svelte.js';
	import { announcer } from '$lib/stores/announcer.svelte.js';
	import { validatePdfFile, PdfProcessingError, type PdfErrorCode } from '$lib/utils/pdf.js';
	import { writePdfToOpfs, readPdfFromOpfs, deletePdfFromOpfs } from '$lib/utils/opfs.js';
	import { markdownToBlocks, markdownToPlainText } from '$lib/utils/markdown.js';
	import { renderCoverLetterPdf } from '$lib/utils/coverLetterPdf.js';
	import { mergePdfs } from '$lib/utils/mergePdf.js';
	import { buildMailtoUrl } from '$lib/utils/mailDraft.js';
	import {
		applyTemplate,
		buildTemplateContext,
		tidyFilledTemplate
	} from '$lib/utils/coverLetterTemplate.js';
	import CoverLetterEditor from './CoverLetterEditor.svelte';

	let { application, onclose }: { application: Application; onclose: () => void } = $props();

	// Snapshotted once - the parent mounts a fresh instance per open, the same
	// guarantee ApplicationModal relies on.
	const initial = untrack(() => application);

	let coverLetter = $state(initial.coverLetter ?? '');
	let cvRef = $state<string | undefined>(initial.cvRef);
	let cvName = $state<string | undefined>(initial.cvName);
	const originalCvRef = initial.cvRef;

	let output = $state<'combined' | 'separate'>('combined');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let dialogEl: HTMLDialogElement;

	const PDF_ERROR_KEYS: Record<PdfErrorCode, string> = {
		'too-large': 'application.pdf.errorTooLarge',
		'too-many-pages': 'application.pdf.errorTooManyPages',
		'not-a-pdf': 'application.pdf.errorNotAPdf',
		encrypted: 'application.pdf.errorEncrypted',
		corrupted: 'application.pdf.errorCorrupted',
		'no-text': 'application.pdf.errorNoText'
	};

	/** The application's own CV wins; otherwise the one from settings. */
	let effectiveCvRef = $derived(cvRef ?? profileStore.cvRef);
	let canShare = $state(false);

	const FOCUSABLE_SELECTOR =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	onMount(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialogEl.showModal();
		canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
		return () => {
			document.body.style.overflow = previousBodyOverflow;
			previouslyFocused?.focus?.();
		};
	});

	// Chromium's native dialog does not wrap Tab (see #18), so the trap is
	// hand-rolled here exactly as in ApplicationModal.
	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function insertTemplate() {
		const context = buildTemplateContext(
			application,
			profileStore.value,
			i18n.locale === 'en' ? 'en' : 'de'
		);
		const filled = tidyFilledTemplate(applyTemplate(t('coverLetter.defaultTemplate'), context));
		if (coverLetter.trim() && !confirm(t('coverLetter.templateConfirm'))) return;
		coverLetter = filled;
		announcer.announce(t('coverLetter.templateInserted'));
	}

	async function handleCvUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (!file) return;

		error = null;
		try {
			await validatePdfFile(file);
			cvRef = await writePdfToOpfs(file);
			cvName = file.name;
		} catch (err) {
			const code = err instanceof PdfProcessingError ? err.code : undefined;
			error = code ? t(PDF_ERROR_KEYS[code]) : t('dispatch.errorGenerate');
		}
	}

	function resetCv() {
		cvRef = undefined;
		cvName = undefined;
	}

	async function persist() {
		// Both of these used to pass silently. `id` is optional on Application,
		// so a row that never reached the database returned here and the caller
		// went on to report success; and Dexie's update() resolves with the
		// number of rows it changed rather than rejecting, so a key matching
		// nothing is a no-op that looks exactly like a successful write.
		if (!application.id) {
			throw new Error('The application has no id, so there is no row to update.');
		}
		const changed = await db.applications.update(application.id, {
			coverLetter,
			cvRef,
			cvName,
			updatedAt: Date.now()
		});
		if (changed === 0) {
			throw new Error(`No application row matched id ${application.id}.`);
		}
		// Only once the row points at the new file: deleting first would orphan
		// a live reference if the write had failed.
		if (originalCvRef && originalCvRef !== cvRef) {
			await deletePdfFromOpfs(originalCvRef);
		}
	}

	async function save() {
		error = null;
		try {
			await persist();
		} catch (err) {
			// Staying open matters: the cover letter and the uploaded CV only live
			// in this component's state until the write lands, so closing on a
			// failed save is what actually loses them.
			console.error('Saving the dispatch dialog failed:', err);
			error = t('dispatch.errorSave');
			return;
		}
		announcer.announce(t('dispatch.saved'));
		close();
	}

	function close() {
		dialogEl.close();
		onclose();
	}

	function safeFileName(base: string): string {
		return (
			base
				.replace(/[^\p{L}\p{N}\s-]/gu, '')
				.trim()
				.replace(/\s+/g, '-')
				.slice(0, 60) || 'bewerbung'
		);
	}

	function downloadBytes(bytes: Uint8Array, fileName: string) {
		const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = fileName;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}

	async function buildLetterPdf(): Promise<Uint8Array> {
		return renderCoverLetterPdf({
			sender: profileStore.value,
			recipient: { company: application.company, contactName: application.contactName },
			blocks: markdownToBlocks(coverLetter)
		});
	}

	async function readCvBytes(): Promise<Uint8Array | null> {
		if (!effectiveCvRef) return null;
		const blob = await readPdfFromOpfs(effectiveCvRef);
		return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
	}

	async function withBusy(work: () => Promise<void>) {
		error = null;
		notice = null;
		busy = true;
		try {
			await work();
		} catch (err) {
			console.error('Dispatch failed:', err);
			const code = err instanceof PdfProcessingError ? err.code : undefined;
			error = code ? t(PDF_ERROR_KEYS[code]) : t('dispatch.errorGenerate');
		} finally {
			busy = false;
		}
	}

	async function download() {
		if (!coverLetter.trim()) {
			error = t('dispatch.errorNoLetter');
			return;
		}
		await withBusy(async () => {
			await persist();
			const letter = await buildLetterPdf();
			const base = safeFileName(`${application.company}-${application.title}`);
			const cv = await readCvBytes();

			if (output === 'combined' && cv) {
				downloadBytes(await mergePdfs([letter, cv]), `Bewerbung-${base}.pdf`);
			} else {
				downloadBytes(letter, `Anschreiben-${base}.pdf`);
				if (cv) downloadBytes(cv, `Lebenslauf-${base}.pdf`);
			}
			announcer.announce(t('dispatch.downloaded'));
		});
	}

	function mailSubject(): string {
		return t('dispatch.mailSubject')
			.replace('{title}', application.title)
			.replace('{company}', application.company);
	}

	function openMail() {
		if (!application.contactEmail) {
			error = t('dispatch.noRecipient');
			return;
		}
		const { url, truncated } = buildMailtoUrl({
			to: application.contactEmail,
			subject: mailSubject(),
			body: markdownToPlainText(coverLetter)
		});
		notice = truncated ? t('dispatch.mailTruncated') : null;
		if (truncated) announcer.announce(notice ?? '');
		window.location.href = url;
	}

	async function copyLetter() {
		try {
			await navigator.clipboard.writeText(markdownToPlainText(coverLetter));
			notice = t('dispatch.copied');
			announcer.announce(notice);
		} catch {
			error = t('dispatch.copyFailed');
		}
	}

	async function share() {
		if (!coverLetter.trim()) {
			error = t('dispatch.errorNoLetter');
			return;
		}
		await withBusy(async () => {
			await persist();
			const letter = await buildLetterPdf();
			const cv = await readCvBytes();
			const base = safeFileName(`${application.company}-${application.title}`);

			const files =
				output === 'combined' && cv
					? [
							new File([(await mergePdfs([letter, cv])) as BlobPart], `Bewerbung-${base}.pdf`, {
								type: 'application/pdf'
							})
						]
					: [
							new File([letter as BlobPart], `Anschreiben-${base}.pdf`, {
								type: 'application/pdf'
							}),
							...(cv
								? [
										new File([cv as BlobPart], `Lebenslauf-${base}.pdf`, {
											type: 'application/pdf'
										})
									]
								: [])
						];

			if (!navigator.canShare?.({ files })) {
				error = t('dispatch.errorGenerate');
				return;
			}
			await navigator.share({ files, title: mailSubject() });
		});
	}
</script>

<dialog
	bind:this={dialogEl}
	class="dispatch-dialog"
	aria-labelledby="dispatch-title"
	onkeydown={handleDialogKeydown}
	oncancel={close}
>
	<header>
		<h2 id="dispatch-title">{t('dispatch.title')}</h2>
		<button type="button" class="btn-icon-close" onclick={close} aria-label={t('dispatch.close')}>
			<span aria-hidden="true">×</span>
		</button>
	</header>

	<div class="dispatch-body">
		<fieldset>
			<legend>{t('dispatch.cvSection')}</legend>
			{#if cvName}
				<p class="cv-state">{t('dispatch.cvOwn').replace('{name}', cvName)}</p>
			{:else if profileStore.cvName}
				<p class="cv-state">{t('dispatch.cvGlobal').replace('{name}', profileStore.cvName)}</p>
			{:else}
				<p class="cv-state cv-missing">{t('dispatch.cvNone')}</p>
			{/if}

			<div class="row">
				<label class="btn-flat file-label">
					<input type="file" accept=".pdf" class="sr-only" onchange={handleCvUpload} />
					{cvRef ? t('dispatch.cvReplace') : t('dispatch.cvUpload')}
				</label>
				{#if cvRef}
					<button type="button" class="btn-flat" onclick={resetCv}>{t('dispatch.cvReset')}</button>
				{/if}
			</div>
		</fieldset>

		<fieldset>
			<legend>{t('coverLetter.heading')}</legend>
			<CoverLetterEditor
				bind:value={coverLetter}
				id="dispatch-letter"
				oninsertTemplate={insertTemplate}
			/>
		</fieldset>

		<fieldset>
			<legend>{t('dispatch.outputSection')}</legend>
			<div role="radiogroup" aria-label={t('dispatch.outputSection')} class="options">
				<label class="option">
					<input type="radio" name="dispatch-output" value="combined" bind:group={output} />
					<span>
						<strong>{t('dispatch.outputCombined')}</strong>
						<small>{t('dispatch.outputCombinedDesc')}</small>
					</span>
				</label>
				<label class="option">
					<input type="radio" name="dispatch-output" value="separate" bind:group={output} />
					<span>
						<strong>{t('dispatch.outputSeparate')}</strong>
						<small>{t('dispatch.outputSeparateDesc')}</small>
					</span>
				</label>
			</div>

			<div class="row actions">
				<button type="button" class="btn-primary" onclick={download} disabled={busy}>
					{busy ? t('dispatch.generating') : t('dispatch.download')}
				</button>
				<button type="button" class="btn-flat" onclick={openMail} disabled={busy}>
					{t('dispatch.openMail')}
				</button>
				<button type="button" class="btn-flat" onclick={copyLetter} disabled={busy}>
					{t('dispatch.copyLetter')}
				</button>
				{#if canShare}
					<button type="button" class="btn-flat" onclick={share} disabled={busy}>
						{t('dispatch.share')}
					</button>
				{/if}
			</div>

			<p class="mail-hint">{t('dispatch.mailHint')}</p>

			{#if notice}
				<p class="notice" role="status">{notice}</p>
			{/if}
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
		</fieldset>
	</div>

	<footer>
		<button type="button" class="btn-flat" onclick={close}>{t('dispatch.close')}</button>
		<button type="button" class="btn-primary" onclick={save}>{t('dispatch.save')}</button>
	</footer>
</dialog>

<style>
	.dispatch-dialog {
		width: min(900px, calc(100vw - 32px));
		max-height: calc(100dvh - 48px);
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		background-color: var(--surface-0);
		color: var(--text-primary);
		box-shadow: var(--shadow-lg);
	}

	.dispatch-dialog::backdrop {
		background-color: rgba(15, 23, 42, 0.45);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-default);
	}

	header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
	}

	.btn-icon-close {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}

	.btn-icon-close:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.dispatch-body {
		padding: 16px 20px;
		overflow-y: auto;
		max-height: calc(100dvh - 180px);
	}

	fieldset {
		margin: 0 0 20px;
		padding: 0;
		border: none;
	}

	legend {
		padding: 0;
		margin-bottom: 8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.cv-state {
		margin: 0 0 10px;
		font-size: 13px;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.cv-missing {
		color: var(--text-secondary);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.actions {
		margin-top: 12px;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}

	.option {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background-color: var(--surface-0);
		cursor: pointer;
	}

	.option:hover {
		background-color: var(--surface-2);
	}

	.option span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option strong {
		font-size: 13px;
		font-weight: 600;
	}

	.option small {
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-secondary);
	}

	.mail-hint {
		margin: 12px 0 0;
		font-size: 12px;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.notice,
	.error {
		margin: 10px 0 0;
		padding: 8px 10px;
		border-radius: var(--radius-md);
		font-size: 12px;
		line-height: 1.5;
	}

	.notice {
		background-color: var(--surface-2);
		border: 1px solid var(--border-default);
		color: var(--text-primary);
	}

	.error {
		background-color: var(--status-danger-bg);
		border: 1px solid var(--status-danger-border);
		color: var(--color-danger);
	}

	footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 14px 20px;
		border-top: 1px solid var(--border-default);
	}

	.btn-primary {
		padding: 8px 16px;
		border: none;
		border-radius: var(--radius-md);
		background-color: var(--color-accent-600);
		color: white;
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: var(--color-accent-700);
	}

	.btn-primary:disabled,
	.btn-flat:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.btn-flat {
		padding: 8px 16px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.btn-flat:hover:not(:disabled) {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.file-label {
		display: inline-flex;
		align-items: center;
	}

	.file-label:focus-within {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
	}

	@media (max-width: 768px) {
		.options {
			grid-template-columns: 1fr;
		}

		.dispatch-body {
			padding: 14px 16px;
		}
	}
</style>
