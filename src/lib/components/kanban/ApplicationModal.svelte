<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import { db, type Application } from '$lib/db/index.js';
	import { extractTextFromPdf, parseJobDetailsFromText } from '$lib/utils/pdf.js';
	import { writePdfToOpfs, readPdfFromOpfs, deletePdfFromOpfs } from '$lib/utils/opfs.js';
	import DatePicker from '$lib/components/common/DatePicker.svelte';
	import { colorStore } from '$lib/stores/colors.svelte.js';

	let {
		application = null,
		initialStatus = 'draft',
		onclose,
		onsave
	}: {
		application?: Application | null;
		initialStatus?: 'draft' | 'sent' | 'interview' | 'accepted' | 'rejected';
		onclose: () => void;
		onsave: () => void;
	} = $props();

	function formatDateForInput(ts?: number): string {
		const d = ts ? new Date(ts) : new Date();
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function parseDateInput(dateStr: string): number {
		if (!dateStr) return Date.now();
		const parts = dateStr.split('-');
		if (parts.length === 3) {
			const year = parseInt(parts[0], 10);
			const month = parseInt(parts[1], 10) - 1;
			const day = parseInt(parts[2], 10);
			return new Date(year, month, day, 12, 0, 0).getTime(); // Noon local time prevents timezone/DST shifts
		}
		return new Date(dateStr).getTime();
	}

	// Form states
	let title = $state('');
	let company = $state('');
	let url = $state('');
	let salary = $state('');
	let contactName = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let priority = $state<'low' | 'medium' | 'high'>('medium');
	let reminderInterval = $state<Application['reminderInterval']>('none');
	let cardColor = $state<string | undefined>(undefined);
	let notes = $state('');
	let tagInput = $state('');
	let tags = $state<string[]>([]);
	let pdfName = $state('');
	// The OPFS ref that will be saved. originalPdfRef is a plain (non-reactive)
	// snapshot of what was loaded, so save() can tell whether the PDF was
	// replaced and clean up the old OPFS file only once the new ref is
	// actually persisted - never before, or a cancelled edit would leave the
	// row pointing at a file that no longer exists.
	let pdfRef = $state<string | undefined>(undefined);
	let originalPdfRef: string | undefined;
	let isParsingPdf = $state(false);
	let isViewingPdf = $state(false);
	let appliedDateStr = $state(formatDateForInput());

	// Load existing application data if editing
	$effect(() => {
		if (application) {
			title = application.title;
			company = application.company;
			url = application.url;
			salary = application.salary;
			contactName = application.contactName;
			contactEmail = application.contactEmail;
			contactPhone = application.contactPhone;
			priority = application.priority;
			reminderInterval = application.reminderInterval;
			cardColor = application.cardColor;
			notes = application.notes;
			tags = [...application.tags];
			pdfName = application.pdfName || '';
			pdfRef = application.pdfRef;
			originalPdfRef = application.pdfRef;
			appliedDateStr = formatDateForInput(
				application.appliedAt || application.createdAt || Date.now()
			);
		} else {
			cardColor = undefined;
			originalPdfRef = undefined;
			appliedDateStr = formatDateForInput(Date.now());
		}
	});

	function addTag() {
		const clean = tagInput.trim().toLowerCase();
		if (clean && !tags.includes(clean)) {
			tags = [...tags, clean];
		}
		tagInput = '';
	}

	function removeTag(tagToRemove: string) {
		tags = tags.filter((t) => t !== tagToRemove);
	}

	async function handlePdfUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		isParsingPdf = true;

		try {
			pdfRef = await writePdfToOpfs(file);
			pdfName = file.name;
		} catch (err) {
			console.error('Failed to store PDF:', err);
			const message = err instanceof Error ? err.message : String(err);
			alert('Fehler beim Speichern der PDF: ' + message);
			isParsingPdf = false;
			return;
		}

		try {
			const text = await extractTextFromPdf(file);
			const parsed = parseJobDetailsFromText(text);

			// Autofill extracted job details (only if field is currently empty)
			if (!title) title = parsed.title;
			if (!company) company = parsed.company;
			if (!contactName) contactName = parsed.contactName;
			if (!contactEmail) contactEmail = parsed.contactEmail;
			if (!contactPhone) contactPhone = parsed.contactPhone;
			if (!url) url = parsed.url;
		} catch (err) {
			console.error('Failed to parse PDF:', err);
			const message = err instanceof Error ? err.message : String(err);
			alert('Fehler beim Scannen der PDF: ' + message);
		} finally {
			isParsingPdf = false;
		}
	}

	async function viewPdf() {
		if (!pdfRef) return;
		isViewingPdf = true;
		try {
			const blob = await readPdfFromOpfs(pdfRef);
			if (!blob) {
				alert(t('application.pdf.viewError'));
				return;
			}
			const url = URL.createObjectURL(blob);
			window.open(url, '_blank', 'noopener,noreferrer');
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} finally {
			isViewingPdf = false;
		}
	}

	async function save() {
		if (!title.trim() || !company.trim()) {
			return;
		}

		const now = Date.now();
		const currentStatus = application ? application.status : initialStatus;
		const parsedAppliedAt = appliedDateStr
			? parseDateInput(appliedDateStr)
			: application?.appliedAt || application?.createdAt || now;

		const appData: Omit<Application, 'id'> = {
			title: title.trim(),
			company: company.trim(),
			url: url.trim(),
			salary: salary.trim(),
			contactName: contactName.trim(),
			contactEmail: contactEmail.trim(),
			contactPhone: contactPhone.trim(),
			priority,
			status: currentStatus,
			tags: $state.snapshot(tags),
			reminderInterval,
			cardColor: cardColor === 'none' ? undefined : cardColor,
			notes: notes.trim(),
			pdfName,
			pdfRef,
			appliedAt: parsedAppliedAt,
			createdAt: application ? application.createdAt : now,
			updatedAt: now,
			history: $state.snapshot(
				application
					? application.history
					: [{ status: currentStatus, timestamp: currentStatus === 'sent' ? parsedAppliedAt : now }]
			)
		};

		if (application?.id) {
			// Update status history logs if status somehow changed (typically done on board drag)
			await db.applications.update(application.id, $state.snapshot(appData));
		} else {
			await db.applications.add($state.snapshot(appData) as Application);
		}

		// Only now that the new pdfRef is persisted is it safe to remove the
		// replaced file - if the row still referenced it (e.g. this write had
		// failed), deleting it here would have orphaned live data.
		if (originalPdfRef && originalPdfRef !== pdfRef) {
			await deletePdfFromOpfs(originalPdfRef);
		}

		onsave();
	}
</script>

<div class="modal-backdrop" onclick={onclose} role="presentation">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="modal-content"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<header class="modal-header">
			<h2 id="modal-title">{application ? t('kanban.actions.edit') : t('kanban.actions.add')}</h2>
			<button class="btn-icon-close" onclick={onclose} aria-label={t('actions.cancel')}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M18 6L6 18M6 6l12 12"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</header>

		<div class="modal-body">
			<!-- PDF parsing section -->
			<div class="form-section-pdf">
				<label class="pdf-upload-box" class:parsing={isParsingPdf}>
					<input type="file" accept=".pdf" onchange={handlePdfUpload} class="sr-only" />
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
						class="pdf-icon"
					>
						<path
							d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linejoin="round"
						/>
						<path
							d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
					</svg>
					<span class="pdf-upload-text">
						{#if isParsingPdf}
							{t('application.pdf.scanning')}
						{:else if pdfName}
							{pdfName}
						{:else}
							{t('application.pdf.uploadText')}
						{/if}
					</span>
				</label>
				{#if pdfRef && !isParsingPdf}
					<button type="button" class="btn-view-pdf" onclick={viewPdf} disabled={isViewingPdf}>
						{t('application.pdf.view')}
					</button>
				{/if}
			</div>

			<div class="form-grid">
				<div class="form-group col-span-2">
					<label for="title">{t('application.title')} *</label>
					<input
						id="title"
						type="text"
						bind:value={title}
						required
						placeholder={t('application.placeholderTitle')}
					/>
				</div>

				<div class="form-group col-span-2">
					<label for="company">{t('application.company')} *</label>
					<input
						id="company"
						type="text"
						bind:value={company}
						required
						placeholder={t('application.placeholderCompany')}
					/>
				</div>

				<div class="form-group col-span-2">
					<label for="url">{t('application.url')}</label>
					<input
						id="url"
						type="url"
						bind:value={url}
						placeholder={t('application.placeholderUrl')}
					/>
				</div>

				<div class="form-group">
					<label for="appliedAt">{t('application.appliedAt')}</label>
					<DatePicker id="appliedAt" bind:value={appliedDateStr} />
				</div>

				<div class="form-group">
					<label for="priority">{t('application.priority')}</label>
					<select id="priority" bind:value={priority}>
						<option value="low">{t('application.priorities.low')}</option>
						<option value="medium">{t('application.priorities.medium')}</option>
						<option value="high">{t('application.priorities.high')}</option>
					</select>
				</div>

				<div class="form-group col-span-2">
					<label for="salary">{t('application.salary')}</label>
					<input
						id="salary"
						type="text"
						bind:value={salary}
						placeholder={t('application.placeholderSalary')}
					/>
				</div>

				<div class="form-group col-span-2">
					<h3 class="subsection-title">{t('application.contact')}</h3>
				</div>

				<div class="form-group">
					<label for="contactName">{t('application.contactName')}</label>
					<input
						id="contactName"
						type="text"
						bind:value={contactName}
						placeholder={t('application.placeholderContactName')}
					/>
				</div>

				<div class="form-group">
					<label for="contactEmail">{t('application.contactEmail')}</label>
					<input
						id="contactEmail"
						type="email"
						bind:value={contactEmail}
						placeholder={t('application.placeholderContactEmail')}
					/>
				</div>

				<div class="form-group">
					<label for="contactPhone">{t('application.contactPhone')}</label>
					<input
						id="contactPhone"
						type="tel"
						bind:value={contactPhone}
						placeholder={t('application.placeholderContactPhone')}
					/>
				</div>

				<div class="form-group">
					<label for="reminder">{t('application.reminder')}</label>
					<select id="reminder" bind:value={reminderInterval}>
						<option value="none">{t('reminders.none')}</option>
						<option value="10s">{t('reminders.seconds10')}</option>
						<option value="24h">{t('reminders.hours24')}</option>
						<option value="48h">{t('reminders.hours48')}</option>
						<option value="7d">{t('reminders.days7')}</option>
						<option value="14d">{t('reminders.days14')}</option>
					</select>
				</div>

				<div class="form-group col-span-2">
					<span class="form-label" id="card-color-label">{t('application.cardColor')}</span>
					<div class="color-swatches-row" role="radiogroup" aria-labelledby="card-color-label">
						<!-- None / Clear option -->
						<button
							type="button"
							class="color-swatch swatch-none"
							class:active={!cardColor || cardColor === 'none'}
							onclick={() => (cardColor = 'none')}
							title={t('application.colorNone')}
							aria-label={t('application.colorNone')}
							aria-checked={!cardColor || cardColor === 'none'}
							role="radio"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M18 6L6 18"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</button>

						<!-- Preset Auto Colors -->
						{#each colorStore.auto as preset (preset.id)}
							<button
								type="button"
								class="color-swatch"
								style:--swatch-color={preset.hex}
								class:active={cardColor?.toLowerCase() === preset.hex.toLowerCase()}
								onclick={() => (cardColor = preset.hex)}
								title={preset.labelKey || preset.hex}
								aria-label={preset.labelKey || preset.hex}
								aria-checked={cardColor?.toLowerCase() === preset.hex.toLowerCase()}
								role="radio"
							>
								{#if cardColor?.toLowerCase() === preset.hex.toLowerCase()}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="check-icon">
										<path
											d="M20 6L9 17l-5-5"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
							</button>
						{/each}

						<!-- Custom Saved Colors -->
						{#each colorStore.custom as customHex (customHex)}
							<div class="custom-swatch-wrapper">
								<button
									type="button"
									class="color-swatch"
									style:--swatch-color={customHex}
									class:active={cardColor?.toLowerCase() === customHex.toLowerCase()}
									onclick={() => (cardColor = customHex)}
									title={customHex}
									aria-label={customHex}
									aria-checked={cardColor?.toLowerCase() === customHex.toLowerCase()}
									role="radio"
								>
									{#if cardColor?.toLowerCase() === customHex.toLowerCase()}
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="check-icon">
											<path
												d="M20 6L9 17l-5-5"
												stroke="currentColor"
												stroke-width="2.5"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									{/if}
								</button>
								<button
									type="button"
									class="btn-swatch-remove"
									onclick={(e) => {
										e.stopPropagation();
										colorStore.removeCustomColor(customHex);
										if (cardColor?.toLowerCase() === customHex.toLowerCase()) cardColor = 'none';
									}}
									title="Entfernen"
									aria-label="Farbe löschen">×</button
								>
							</div>
						{/each}

						<!-- Add Custom Color Button -->
						<label class="btn-add-color" title={t('application.addCustomColor')}>
							<input
								type="color"
								class="hidden-color-input"
								onchange={(e) => {
									const input = e.currentTarget as HTMLInputElement;
									if (input && input.value) {
										colorStore.addCustomColor(input.value);
										cardColor = input.value;
									}
								}}
							/>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 5v14M5 12h14"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</label>
					</div>
				</div>

				<div class="form-group col-span-2">
					<label for="tags">{t('application.tags')}</label>
					<div class="tags-input-container">
						<input
							id="tags"
							type="text"
							bind:value={tagInput}
							placeholder={t('application.placeholderTags')}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addTag();
								}
							}}
						/>
						<button type="button" class="btn-secondary" onclick={addTag}
							>{t('actions.addTag')}</button
						>
					</div>
					{#if tags.length > 0}
						<div class="tags-list">
							{#each tags as tag (tag)}
								<span class="tag-badge">
									{tag}
									<button
										type="button"
										class="btn-tag-remove"
										onclick={() => removeTag(tag)}
										aria-label="Tag löschen">×</button
									>
								</span>
							{/each}
						</div>
					{/if}
				</div>

				<div class="form-group col-span-2">
					<label for="notes">{t('application.notes')}</label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="4"
						placeholder={t('application.placeholderNotes')}></textarea>
				</div>
			</div>
		</div>

		<footer class="modal-footer">
			<button class="btn-flat" onclick={onclose}>{t('actions.cancel')}</button>
			<button class="btn-primary" onclick={save} disabled={!title.trim() || !company.trim()}>
				{t('actions.save')}
			</button>
		</footer>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(15, 23, 42, 0.4);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 16px;
	}

	:root.dark .modal-backdrop {
		background-color: rgba(0, 0, 0, 0.6);
	}

	.modal-content {
		width: 100%;
		max-width: 640px;
		max-height: 90dvh;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: modal-enter var(--duration-normal) var(--ease-out-expo);
	}

	@keyframes modal-enter {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-default);
		flex-shrink: 0;
	}

	.modal-header h2 {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.btn-icon-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-icon-close:hover {
		background-color: var(--surface-2);
		color: var(--text-primary);
	}

	.modal-body {
		flex: 1;
		padding: 20px;
		overflow-y: auto;
		position: relative;
		z-index: 50;
	}

	.form-section-pdf {
		display: flex;
		align-items: stretch;
		gap: 10px;
		margin-bottom: 20px;
	}

	.pdf-upload-box {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 2px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		padding: 16px;
		cursor: pointer;
		text-align: center;
		transition:
			border-color var(--duration-fast) ease,
			background-color var(--duration-fast) ease;
	}

	.btn-view-pdf {
		flex-shrink: 0;
		padding: 0 16px;
		background-color: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-view-pdf:hover:not(:disabled) {
		background-color: var(--surface-3);
	}

	.btn-view-pdf:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.pdf-upload-box:hover {
		border-color: var(--color-accent-500);
		background-color: var(--surface-1);
	}

	.pdf-upload-box.parsing {
		border-color: var(--color-warning);
		background-color: var(--surface-1);
		cursor: not-allowed;
	}

	.pdf-icon {
		color: var(--text-secondary);
	}

	.pdf-upload-text {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.col-span-2 {
		grid-column: span 2;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label,
	.form-group .form-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.form-group input,
	.form-group select {
		height: 36px;
	}

	.form-group input,
	.form-group select,
	.form-group textarea {
		padding: 8px 12px;
		box-sizing: border-box;
		background-color: var(--surface-0);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 14px;
		outline: none;
		transition: border-color var(--duration-fast) ease;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		border-color: var(--color-accent-500);
	}

	.subsection-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 12px 0 4px 0;
		border-bottom: 1px solid var(--border-default);
		padding-bottom: 4px;
	}

	.tags-input-container {
		display: flex;
		gap: 8px;
	}

	.tags-input-container input {
		flex: 1;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.tag-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background-color: var(--surface-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-pill);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.btn-tag-remove {
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
		font-size: 14px;
		padding: 0;
		line-height: 1;
	}

	.btn-tag-remove:hover {
		color: var(--color-danger);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid var(--border-default);
		background-color: var(--surface-1);
		flex-shrink: 0;
		position: relative;
		z-index: 10;
	}

	.btn-primary {
		padding: 8px 16px;
		background-color: var(--color-accent-600);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: var(--color-accent-700);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-flat {
		padding: 8px 16px;
		background: transparent;
		color: var(--text-secondary);
		border: none;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
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

	.btn-secondary {
		padding: 0 16px;
		background-color: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 16px;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-secondary:hover {
		background-color: var(--surface-3);
	}

	.color-swatches-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 4px 0;
	}

	.color-swatch {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		background-color: var(--swatch-color);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
		box-shadow: var(--shadow-sm);
		transition:
			transform var(--duration-fast) var(--ease-out-expo),
			box-shadow var(--duration-fast) ease;
	}

	.color-swatch:hover {
		transform: scale(1.15);
		box-shadow: 0 4px 12px -2px var(--swatch-color, rgba(0, 0, 0, 0.2));
	}

	.color-swatch.active {
		transform: scale(1.15);
		box-shadow:
			0 0 0 2px var(--surface-0),
			0 0 0 4px var(--swatch-color, var(--text-primary));
	}

	.swatch-none {
		background-color: transparent;
		border: 2px dashed var(--border-strong);
		color: var(--text-secondary);
	}

	.swatch-none.active {
		border-color: var(--color-accent-500);
		color: var(--color-accent-500);
		box-shadow:
			0 0 0 2px var(--surface-0),
			0 0 0 4px var(--color-accent-500);
	}

	.check-icon {
		color: #ffffff;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
	}

	.custom-swatch-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-swatch-remove {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background-color: var(--color-danger);
		color: #ffffff;
		border: 1px solid var(--surface-0);
		font-size: 11px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--duration-fast) ease;
	}

	.custom-swatch-wrapper:hover .btn-swatch-remove {
		opacity: 1;
	}

	.btn-add-color {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 2px dashed var(--border-strong);
		background-color: var(--surface-1);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		position: relative;
		transition:
			border-color var(--duration-fast) ease,
			color var(--duration-fast) ease,
			transform var(--duration-fast) var(--ease-out-expo);
	}

	.btn-add-color:hover {
		border-color: var(--color-accent-500);
		color: var(--color-accent-500);
		transform: scale(1.1);
	}

	.hidden-color-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
</style>
