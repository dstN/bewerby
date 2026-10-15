<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.js';
	import { ARCHIVE_REASONS, type Application, type ArchiveReason } from '#lib/db/index.js';
	import {
		createApplication,
		updateApplication,
		type NewApplication
	} from '#lib/data/applications.js';
	import {
		extractJobDocument,
		parseJobDocument,
		parseJobText,
		validatePdfFile,
		PdfProcessingError,
		type PdfErrorCode,
		type ParsedJobField
	} from '#lib/utils/pdf.js';
	import { writePdfToOpfs, readPdfFromOpfs, deletePdfFromOpfs } from '#lib/utils/opfs.js';
	import DatePicker from '#lib/components/common/DatePicker.svelte';
	import { INTERVAL_MS, getAppliedAt, getArchivedAt, getRejectedAt } from '#lib/utils/reminders.js';
	import { colorStore } from '#lib/stores/colors.svelte.js';
	import { announcer } from '#lib/stores/announcer.svelte.js';

	let {
		application = null,
		initialStatus = 'draft',
		onclose,
		onsave
	}: {
		application?: Application | null;
		initialStatus?: Application['status'];
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

	// Snapshot the prop once via untrack(): the parent only ever renders this
	// component inside {#if showModal}, so a fresh instance is mounted per
	// open/edit and `application` never changes during this instance's
	// lifetime - the same guarantee {#key} would otherwise exist to provide.
	// Reading it directly in each $state(...) initializer below still triggers
	// Svelte's "state_referenced_locally" warning (it can't tell a deliberate
	// one-time snapshot from a forgotten reactive binding), so it's captured
	// into a plain, non-reactive local once instead.
	const initialApp = untrack(() => application);
	const initialStat = untrack(() => initialStatus);

	// Form states, initialized directly from initialApp (or its absence)
	// instead of via a prop-sync $effect.
	let title = $state(initialApp?.title ?? '');
	let company = $state(initialApp?.company ?? '');
	let url = $state(initialApp?.url ?? '');
	let salary = $state(initialApp?.salary ?? '');
	let contactName = $state(initialApp?.contactName ?? '');
	let contactEmail = $state(initialApp?.contactEmail ?? '');
	let contactPhone = $state(initialApp?.contactPhone ?? '');
	let location = $state(initialApp?.location ?? '');
	let referenceNumber = $state(initialApp?.referenceNumber ?? '');
	let priority = $state<'low' | 'medium' | 'high'>(initialApp?.priority ?? 'medium');
	let status = $state<Application['status']>(initialApp?.status ?? initialStat);
	let reminderInterval = $state<Application['reminderInterval']>(
		initialApp?.reminderInterval ?? 'none'
	);
	// Only read when the interval is 'custom'; pre-filled with whatever the row
	// is currently due on so switching to it starts from the real date rather
	// than from today.
	let reminderDateStr = $state(formatDateForInput(initialApp?.reminderAt));
	let cardColor = $state<string | undefined>(initialApp?.cardColor);
	let notes = $state(initialApp?.notes ?? '');
	let tagInput = $state('');
	let tags = $state<string[]>(initialApp ? [...initialApp.tags] : []);
	let pdfName = $state(initialApp?.pdfName || '');
	// The OPFS ref that will be saved. originalPdfRef is a plain (non-reactive)
	// snapshot of what was loaded, so save() can tell whether the PDF was
	// replaced and clean up the old OPFS file only once the new ref is
	// actually persisted - never before, or a cancelled edit would leave the
	// row pointing at a file that no longer exists.
	let pdfRef = $state<string | undefined>(initialApp?.pdfRef);
	let originalPdfRef: string | undefined = initialApp?.pdfRef;
	let isParsingPdf = $state(false);
	// The paste-an-ad path: same parser, same review panel, no file involved.
	let pasteOpen = $state(false);
	let pastedText = $state('');
	let adUrl = $state('');
	let isFetchingAd = $state(false);
	let fetchError = $state<string | null>(null);
	let isViewingPdf = $state(false);
	let pdfError = $state<string | null>(null);

	/**
	 * What the parser read out of the uploaded ad, shown for confirmation
	 * instead of being written straight into the form. Autofill used to happen
	 * silently and only into empty fields, so a wrong guess beat a missing one
	 * and the user never learned either had happened.
	 */
	type ReviewEntry = {
		field: ParsedJobField;
		labelKey: string;
		value: string;
		uncertain: boolean;
		selected: boolean;
	};
	let review = $state<ReviewEntry[] | null>(null);
	// Pre-filled with what the card and the export show (getAppliedAt), so an
	// untouched field never differs from them.
	const initialAppliedDateStr = formatDateForInput(
		initialApp ? getAppliedAt(initialApp) : undefined
	);
	let appliedDateStr = $state(initialAppliedDateStr);
	// Only shown while the status is "Absage", pre-filled with what the export
	// prints: the entered date, else the move into "Absage" - which for a row
	// not rejected yet is this save, i.e. today. Empty for an old row that
	// records neither, rather than claiming a date nobody entered.
	const shownRejectedAt =
		initialApp?.status === 'rejected' ? getRejectedAt(initialApp) : Date.now();
	const initialRejectedDateStr =
		shownRejectedAt === undefined ? '' : formatDateForInput(shownRejectedAt);
	let rejectedDateStr = $state(initialRejectedDateStr);
	// Only shown while the status is "Archiv" (#60). Preselected like the
	// board's archive dialog: never sent for a draft, no response otherwise.
	let archiveReason = $state<ArchiveReason>(
		initialApp?.archiveReason ??
			((initialApp?.status ?? initialStat) === 'draft' ? 'not-sent' : 'no-response')
	);
	// The end date, only asked for when the user ended it: it is what the
	// Nachweis prints after "Zurückgezogen". Pre-filled like the rejection's.
	const shownArchivedAt =
		initialApp?.status === 'archived' ? getArchivedAt(initialApp) : Date.now();
	const initialArchivedDateStr =
		shownArchivedAt === undefined ? '' : formatDateForInput(shownArchivedAt);
	let archivedDateStr = $state(initialArchivedDateStr);
	let dialogEl: HTMLDialogElement;

	function snapshotFields(): string {
		return JSON.stringify({
			title,
			company,
			url,
			salary,
			contactName,
			contactEmail,
			contactPhone,
			location,
			referenceNumber,
			priority,
			status,
			reminderInterval,
			reminderDateStr,
			cardColor,
			notes,
			tags,
			appliedDateStr,
			rejectedDateStr,
			archiveReason,
			archivedDateStr,
			pdfRef
		});
	}

	// Captured once, from the initial values above, so isDirty only reflects
	// actual user edits.
	let baselineSnapshot = $state(snapshotFields());

	let isDirty = $derived(snapshotFields() !== baselineSnapshot);

	let justSaved = false;

	onMount(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		dialogEl.showModal();
		return () => {
			document.body.style.overflow = previousBodyOverflow;
			previouslyFocused?.focus?.();
		};
	});

	function requestClose() {
		if (isDirty && !confirm(t('application.confirmDiscard'))) {
			return;
		}
		dialogEl.close();
	}

	function handleCancelEvent(event: Event) {
		// Fired on Escape before the dialog closes - block the automatic close
		// so unsaved changes get the same confirmation as every other exit path.
		if (isDirty) {
			event.preventDefault();
			if (confirm(t('application.confirmDiscard'))) {
				dialogEl.close();
			}
		}
	}

	const FOCUSABLE_SELECTOR =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	// Chromium's native <dialog> inert-containment stops Tab from reaching
	// background content, but does not reliably wrap focus from the last
	// element back to the first (it can fall through to <body>) - verified
	// directly rather than assumed. This closes that gap manually.
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

	function handleDialogClose() {
		if (justSaved) {
			onsave();
		} else {
			onclose();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target !== dialogEl) return;
		const rect = dialogEl.getBoundingClientRect();
		const clickedInside =
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom;
		if (!clickedInside) {
			requestClose();
		}
	}

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

	const PDF_ERROR_KEYS: Record<PdfErrorCode, string> = {
		'too-large': 'application.pdf.errorTooLarge',
		'too-many-pages': 'application.pdf.errorTooManyPages',
		'not-a-pdf': 'application.pdf.errorNotAPdf',
		encrypted: 'application.pdf.errorEncrypted',
		corrupted: 'application.pdf.errorCorrupted',
		'no-text': 'application.pdf.errorNoText'
	};

	function showPdfError(message: string) {
		pdfError = message;
		announcer.announce(message);
	}

	const REVIEW_FIELDS: { field: ParsedJobField; labelKey: string }[] = [
		{ field: 'title', labelKey: 'application.title' },
		{ field: 'company', labelKey: 'application.company' },
		{ field: 'location', labelKey: 'application.location' },
		{ field: 'salary', labelKey: 'application.salary' },
		{ field: 'contactName', labelKey: 'application.contactName' },
		{ field: 'contactEmail', labelKey: 'application.contactEmail' },
		{ field: 'contactPhone', labelKey: 'application.contactPhone' },
		{ field: 'referenceNumber', labelKey: 'application.referenceNumber' },
		{ field: 'url', labelKey: 'application.url' }
	];

	function currentValue(field: ParsedJobField): string {
		switch (field) {
			case 'title':
				return title;
			case 'company':
				return company;
			case 'location':
				return location;
			case 'salary':
				return salary;
			case 'contactName':
				return contactName;
			case 'contactEmail':
				return contactEmail;
			case 'contactPhone':
				return contactPhone;
			case 'referenceNumber':
				return referenceNumber;
			case 'url':
				return url;
		}
	}

	function assignValue(field: ParsedJobField, value: string) {
		switch (field) {
			case 'title':
				title = value;
				break;
			case 'company':
				company = value;
				break;
			case 'location':
				location = value;
				break;
			case 'salary':
				salary = value;
				break;
			case 'contactName':
				contactName = value;
				break;
			case 'contactEmail':
				contactEmail = value;
				break;
			case 'contactPhone':
				contactPhone = value;
				break;
			case 'referenceNumber':
				referenceNumber = value;
				break;
			case 'url':
				url = value;
				break;
		}
	}

	function buildReview(
		info: Record<ParsedJobField, string>,
		confidence: Partial<Record<ParsedJobField, 'high' | 'low'>>
	): ReviewEntry[] {
		return REVIEW_FIELDS.filter(({ field }) => info[field]).map(({ field, labelKey }) => {
			const uncertain = confidence[field] !== 'high';
			return {
				field,
				labelKey,
				value: info[field],
				uncertain,
				// Pre-selected only where the target is still empty *and* the
				// value is a confident one - never overwrite the user's typing,
				// never nudge them into accepting a guess.
				selected: !currentValue(field) && !uncertain
			};
		});
	}

	function applyReview() {
		if (!review) return;
		let applied = 0;
		for (const entry of review) {
			if (!entry.selected) continue;
			assignValue(entry.field, entry.value);
			applied += 1;
		}
		review = null;
		pasteOpen = false;
		pastedText = '';
		if (applied > 0) announcer.announce(t('application.pdf.review.applied'));
	}

	/**
	 * Shows the review panel for a parse result. Fields the source *stated*
	 * about itself (schema.org JSON-LD on a fetched page) override what the
	 * heuristics guessed and are marked `high`, because they are the
	 * employer's own data rather than an inference off the layout.
	 */
	function reviewParsed(text: string, stated: Partial<Record<ParsedJobField, string>> = {}) {
		const parsed = parseJobText(text);
		const info = { ...parsed.info };
		const confidence = { ...parsed.confidence };
		for (const [field, value] of Object.entries(stated)) {
			if (!value) continue;
			info[field as ParsedJobField] = value;
			confidence[field as ParsedJobField] = 'high';
		}
		review = buildReview(info, confidence);
		announcer.announce(
			review.length > 0
				? t('application.pdf.review.heading')
				: t('application.pdf.review.nothingFound')
		);
	}

	/**
	 * Parses an ad the user pasted in as plain text - copied off a job board,
	 * or the posting plus an Impressum block. Runs the exact same parser and
	 * feeds the exact same review panel as the PDF path, so neither route can
	 * silently overwrite a field the other would have asked about.
	 */
	function parsePastedAd() {
		const text = pastedText.trim();
		if (!text) return;
		pdfError = null;
		reviewParsed(text);
	}

	const FETCH_ERROR_KEYS: Record<string, string> = {
		'invalid-url': 'application.fetch.errorUrl',
		blocked: 'application.fetch.errorBlocked',
		unreachable: 'application.fetch.errorUnreachable',
		'http-error': 'application.fetch.errorUnreachable',
		'not-html': 'application.fetch.errorNotHtml',
		'too-large': 'application.fetch.errorTooLarge',
		'rate-limited': 'application.fetch.errorRateLimited'
	};

	/**
	 * Has the server fetch the posting and parse what comes back.
	 *
	 * This is the only request bewerby ever makes with a user's input in it,
	 * and it carries exactly one thing: the public URL of a job ad, in the
	 * POST body so it cannot land in an access log. No application data goes
	 * with it and nothing is stored. Any failure falls back to the paste box,
	 * which is why that stays open underneath rather than being replaced.
	 */
	async function fetchAdFromUrl() {
		const url = adUrl.trim();
		if (!url || isFetchingAd) return;

		isFetchingAd = true;
		fetchError = null;
		try {
			const response = await fetch('/api/fetch-ad', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const payload: unknown = await response.json();
			if (!response.ok) {
				const code = (payload as { error?: string } | null)?.error ?? 'unreachable';
				const message = t(FETCH_ERROR_KEYS[code] ?? 'application.fetch.errorUnreachable');
				fetchError = message;
				announcer.announce(message);
				return;
			}
			const { text, fields } = payload as {
				text: string;
				fields: Partial<Record<ParsedJobField, string>>;
			};
			// Keep the fetched text in the box: if the parse missed something,
			// the user can see what the page actually said and correct it.
			pastedText = text;
			reviewParsed(text, fields);
		} catch (err) {
			console.error('Failed to fetch the job ad:', err);
			// Offline is the likeliest cause by far in an offline-first app.
			const message = t(
				navigator.onLine ? 'application.fetch.errorUnreachable' : 'application.fetch.errorOffline'
			);
			fetchError = message;
			announcer.announce(message);
		} finally {
			isFetchingAd = false;
		}
	}

	async function handlePdfUpload(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		// Reset the input so re-selecting the same file after an error fires
		// onchange again instead of being silently ignored as "unchanged".
		target.value = '';
		if (!file) return;

		pdfError = null;
		review = null;
		isParsingPdf = true;

		try {
			await validatePdfFile(file);
		} catch (err) {
			const code = err instanceof PdfProcessingError ? err.code : undefined;
			showPdfError(code ? t(PDF_ERROR_KEYS[code]) : t('application.pdf.errorCorrupted'));
			isParsingPdf = false;
			return;
		}

		// A second upload in the same edit replaces a file nothing else points
		// at yet; the stored one (originalPdfRef) is save()'s to delete.
		const superseded = pdfRef;
		try {
			pdfRef = await writePdfToOpfs(file);
			pdfName = file.name;
			if (superseded && superseded !== originalPdfRef) await deletePdfFromOpfs(superseded);
		} catch (err) {
			console.error('Failed to store PDF:', err);
			const message = err instanceof Error ? err.message : String(err);
			showPdfError(t('errors.pdfSaveFailed') + message);
			isParsingPdf = false;
			return;
		}

		try {
			const doc = await extractJobDocument(file);
			const parsed = parseJobDocument(doc, { fileName: file.name });
			review = buildReview(parsed.info, parsed.confidence);
			announcer.announce(
				review.length > 0
					? t('application.pdf.review.heading')
					: t('application.pdf.review.nothingFound')
			);
		} catch (err) {
			console.error('Failed to parse PDF:', err);
			if (err instanceof PdfProcessingError) {
				showPdfError(t(PDF_ERROR_KEYS[err.code]));
			} else {
				const message = err instanceof Error ? err.message : String(err);
				showPdfError(t('errors.pdfScanFailed') + message);
			}
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

	/**
	 * The absolute moment this application's follow-up is due.
	 *
	 * Changing the interval restarts the countdown here and now - that is the
	 * whole point of changing it, and anchoring it on the application date
	 * instead made "remind me again in 7 days" fire instantly on anything sent
	 * more than a week ago. Leaving the interval alone keeps the pending date
	 * untouched, so saving an unrelated edit never moves a follow-up.
	 */
	function computeReminderAt(): number | undefined {
		if (reminderInterval === 'none') return undefined;
		if (reminderInterval === 'custom') return parseDateInput(reminderDateStr);
		if (!application || reminderInterval === application.reminderInterval) {
			// undefined on a row written before reminderAt existed, which keeps it
			// on the interval-from-"sent" fallback in getReminderDueAt().
			return application?.reminderAt;
		}
		return Date.now() + (INTERVAL_MS[reminderInterval] ?? 0);
	}

	/**
	 * Stored only when the user changed the date: left alone, it keeps
	 * following the move into "Absage" instead of freezing a copy of it.
	 * Leaving "Absage" drops it, exactly as a move on the board does.
	 */
	function computeRejectedAt(): number | undefined {
		if (status !== 'rejected' || !rejectedDateStr) return undefined;
		if (rejectedDateStr !== initialRejectedDateStr) return parseDateInput(rejectedDateStr);
		return application?.status === 'rejected' ? application.rejectedAt : undefined;
	}

	/** Same rule as computeRejectedAt, for the day a withdrawn application ended. */
	function computeArchivedAt(): number | undefined {
		if (status !== 'archived' || archiveReason !== 'withdrawn' || !archivedDateStr) {
			return undefined;
		}
		if (archivedDateStr !== initialArchivedDateStr) return parseDateInput(archivedDateStr);
		return application?.status === 'archived' ? application.archivedAt : undefined;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		await save();
	}

	async function save() {
		if (!title.trim() || !company.trim()) {
			return;
		}

		const now = Date.now();
		const statusChanged = application ? application.status !== status : false;
		const parsedAppliedAt = appliedDateStr
			? parseDateInput(appliedDateStr)
			: application?.appliedAt || application?.createdAt || now;

		// Complete enough to create a row; as an update it is a full field set.
		const appData: NewApplication = {
			title: title.trim(),
			company: company.trim(),
			url: url.trim(),
			salary: salary.trim(),
			contactName: contactName.trim(),
			contactEmail: contactEmail.trim(),
			contactPhone: contactPhone.trim(),
			location: location.trim(),
			referenceNumber: referenceNumber.trim(),
			priority,
			status,
			tags: $state.snapshot(tags),
			reminderInterval,
			reminderAt: computeReminderAt(),
			cardColor: cardColor === 'none' ? undefined : cardColor,
			notes: notes.trim(),
			pdfName,
			pdfRef,
			appliedAt: parsedAppliedAt,
			// Stored only when the user changed the date, like computeRejectedAt:
			// left alone, it keeps following the move into "Versendet".
			sentAt:
				appliedDateStr && appliedDateStr !== initialAppliedDateStr
					? parsedAppliedAt
					: application?.sentAt,
			rejectedAt: computeRejectedAt(),
			archiveReason: status === 'archived' ? archiveReason : undefined,
			archivedAt: computeArchivedAt()
		};

		try {
			// The repository logs the status, dated now; the entered date is
			// sentAt above, never a log entry (#59).
			if (application?.id) {
				await updateApplication(application.id, $state.snapshot(appData), now);
			} else {
				await createApplication($state.snapshot(appData), now);
			}
		} catch (err) {
			console.error('Failed to save application:', err);
			alert(t('errors.saveFailed'));
			return; // keep the modal open with the user's input intact
		}

		// Only now that the new pdfRef is persisted is it safe to remove the
		// replaced file - if the row still referenced it (e.g. this write had
		// failed), deleting it here would have orphaned live data.
		if (originalPdfRef && originalPdfRef !== pdfRef) {
			await deletePdfFromOpfs(originalPdfRef);
		}

		if (statusChanged) {
			announcer.announce(
				t('kanban.statusChangedAnnouncement')
					.replace('{company}', company.trim())
					.replace('{status}', t(`kanban.columns.${status}`))
			);
		} else {
			announcer.announce(t('kanban.savedAnnouncement').replace('{company}', company.trim()));
		}

		justSaved = true;
		dialogEl.close();
	}
</script>

<dialog
	bind:this={dialogEl}
	class="modal-content"
	aria-labelledby="modal-title"
	onclose={handleDialogClose}
	oncancel={handleCancelEvent}
	onclick={handleBackdropClick}
	onkeydown={handleDialogKeydown}
>
	<form onsubmit={handleSubmit}>
		<header class="modal-header">
			<h2 id="modal-title">{application ? t('kanban.actions.edit') : t('kanban.actions.add')}</h2>
			<button
				type="button"
				class="btn-icon-close"
				onclick={requestClose}
				aria-label={t('actions.cancel')}
			>
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

			<div class="paste-import">
				<button
					type="button"
					class="btn-paste-toggle"
					aria-expanded={pasteOpen}
					aria-controls="paste-ad"
					onclick={() => (pasteOpen = !pasteOpen)}
				>
					{t('application.paste.toggle')}
				</button>
				{#if pasteOpen}
					<div id="paste-ad">
						<label class="field-label" for="ad-url">{t('application.fetch.label')}</label>
						<div class="url-import-row">
							<input
								id="ad-url"
								type="url"
								inputmode="url"
								bind:value={adUrl}
								placeholder={t('application.fetch.placeholder')}
								onkeydown={(event) => {
									// Enter inside a <form> would submit the whole dialog.
									if (event.key === 'Enter') {
										event.preventDefault();
										void fetchAdFromUrl();
									}
								}}
							/>
							<button
								type="button"
								class="btn-review-apply"
								onclick={fetchAdFromUrl}
								disabled={!adUrl.trim() || isFetchingAd}
							>
								{isFetchingAd ? t('application.fetch.working') : t('application.fetch.parse')}
							</button>
						</div>
						<p class="field-hint">{t('application.fetch.hint')}</p>
						{#if fetchError}
							<p class="fetch-error" role="alert">{fetchError}</p>
						{/if}

						<label class="field-label" for="paste-ad-text">{t('application.paste.label')}</label>
						<textarea
							id="paste-ad-text"
							rows="6"
							bind:value={pastedText}
							placeholder={t('application.paste.placeholder')}></textarea>
						<p class="field-hint">{t('application.paste.hint')}</p>
						<button
							type="button"
							class="btn-review-apply"
							onclick={parsePastedAd}
							disabled={!pastedText.trim()}
						>
							{t('application.paste.parse')}
						</button>
					</div>
				{/if}
			</div>

			{#if pdfError}
				<div class="pdf-error-banner" role="alert">
					<span>{pdfError}</span>
					<button
						type="button"
						class="btn-dismiss-pdf-error"
						onclick={() => (pdfError = null)}
						aria-label={t('application.pdf.dismissError')}
					>
						×
					</button>
				</div>
			{/if}

			{#if review}
				{#if review.length === 0}
					<p class="review-empty">{t('application.pdf.review.nothingFound')}</p>
				{:else}
					<fieldset class="review-panel">
						<legend>{t('application.pdf.review.heading')}</legend>
						<p class="review-hint" id="review-hint">{t('application.pdf.review.hint')}</p>
						<ul class="review-list" aria-describedby="review-hint">
							{#each review as entry (entry.field)}
								<li>
									<label class="review-item">
										<input type="checkbox" bind:checked={entry.selected} />
										<span class="review-label">{t(entry.labelKey)}</span>
										<span class="review-value">{entry.value}</span>
										{#if entry.uncertain}
											<span class="review-uncertain">{t('application.pdf.review.uncertain')}</span>
										{/if}
									</label>
								</li>
							{/each}
						</ul>
						<div class="review-actions">
							<button type="button" class="btn-review-apply" onclick={applyReview}>
								{t('application.pdf.review.apply')}
							</button>
							<button type="button" class="btn-review-dismiss" onclick={() => (review = null)}>
								{t('application.pdf.review.dismiss')}
							</button>
						</div>
					</fieldset>
				{/if}
			{/if}

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
					<label for="status">{t('application.status')}</label>
					<select id="status" bind:value={status}>
						<option value="draft">{t('kanban.columns.draft')}</option>
						<option value="sent">{t('kanban.columns.sent')}</option>
						<option value="interview">{t('kanban.columns.interview')}</option>
						<option value="accepted">{t('kanban.columns.accepted')}</option>
						<option value="rejected">{t('kanban.columns.rejected')}</option>
						<option value="archived">{t('kanban.columns.archived')}</option>
					</select>
				</div>

				{#if status === 'rejected'}
					<div class="form-group col-span-2">
						<label for="rejectedAt">{t('application.rejectedAt')}</label>
						<DatePicker id="rejectedAt" bind:value={rejectedDateStr} />
						<p class="field-hint">{t('application.rejectedAtHint')}</p>
					</div>
				{/if}

				{#if status === 'archived'}
					<div class="form-group col-span-2">
						<label for="archiveReason">{t('application.archiveReason')}</label>
						<select id="archiveReason" bind:value={archiveReason}>
							{#each ARCHIVE_REASONS as reason (reason)}
								<option value={reason}>{t(`kanban.archive.reasons.${reason}`)}</option>
							{/each}
						</select>
					</div>
					{#if archiveReason === 'withdrawn'}
						<div class="form-group col-span-2">
							<label for="archivedAt">{t('application.archivedAt')}</label>
							<DatePicker id="archivedAt" bind:value={archivedDateStr} />
							<p class="field-hint">{t('application.archivedAtHint')}</p>
						</div>
					{/if}
				{/if}

				<div class="form-group col-span-2">
					<label for="salary">{t('application.salary')}</label>
					<input
						id="salary"
						type="text"
						bind:value={salary}
						placeholder={t('application.placeholderSalary')}
					/>
				</div>

				<div class="form-group">
					<label for="location">{t('application.location')}</label>
					<input
						id="location"
						type="text"
						bind:value={location}
						placeholder={t('application.placeholderLocation')}
					/>
				</div>

				<div class="form-group">
					<label for="referenceNumber">{t('application.referenceNumber')}</label>
					<input
						id="referenceNumber"
						type="text"
						bind:value={referenceNumber}
						placeholder={t('application.placeholderReferenceNumber')}
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
						<option value="24h">{t('reminders.hours24')}</option>
						<option value="48h">{t('reminders.hours48')}</option>
						<option value="7d">{t('reminders.days7')}</option>
						<option value="14d">{t('reminders.days14')}</option>
						<option value="custom">{t('reminders.custom')}</option>
					</select>
					{#if reminderInterval !== 'none'}
						<p class="field-hint">
							{reminderInterval === 'custom'
								? t('reminders.customHint')
								: t('reminders.intervalHint')}
						</p>
					{/if}
				</div>

				{#if reminderInterval === 'custom'}
					<div class="form-group">
						<label for="reminderDate">{t('reminders.customDate')}</label>
						<DatePicker id="reminderDate" bind:value={reminderDateStr} />
					</div>
				{/if}

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
									title={t('application.removeCustomColor')}
									aria-label={t('application.removeCustomColor')}>×</button
								>
							</div>
						{/each}

						<!-- Add Custom Color Button -->
						<label class="btn-add-color" title={t('application.addCustomColor')}>
							<input
								type="color"
								class="hidden-color-input"
								aria-label={t('application.addCustomColor')}
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
										aria-label={t('application.removeTag').replace('{tag}', tag)}>×</button
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
			<button type="button" class="btn-flat" onclick={requestClose}>{t('actions.cancel')}</button>
			<button type="submit" class="btn-primary" disabled={!title.trim() || !company.trim()}>
				{t('actions.save')}
			</button>
		</footer>
	</form>
</dialog>

<style>
	.modal-content::backdrop {
		background-color: rgba(15, 23, 42, 0.4);
		backdrop-filter: blur(4px);
	}

	:root.dark .modal-content::backdrop {
		background-color: rgba(0, 0, 0, 0.6);
	}

	/* No `width: 100%` here: for a fixed-position box, percentage widths resolve
	   against the viewport, not the box `inset: 16px` carves out - so 100% made
	   the dialog exactly viewport-wide, over-constraining left/right and pushing
	   it 16px past the right edge on a phone. Leaving width auto lets the insets
	   size it, max-width cap it, and `margin: auto` centre it. */
	.modal-content {
		position: fixed;
		inset: 16px;
		margin: auto;
		max-width: 640px;
		max-height: 90dvh;
		height: fit-content;
		padding: 0;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: modal-enter var(--duration-normal) var(--ease-out-expo);
	}

	.modal-content form {
		display: contents;
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

	.review-panel {
		margin: -10px 0 20px;
		padding: 12px 14px 14px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background-color: var(--surface-2);
	}

	.review-panel legend {
		padding: 0 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.paste-import {
		margin: -8px 0 16px;
	}

	.btn-paste-toggle {
		padding: 0;
		background: none;
		border: none;
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		/* Not --color-accent-600: that shade is tuned for white text *on* it and
		   only reaches 2.7:1 as text on the dark surface. --color-accent-text is
		   the theme-aware pair that clears the contrast bar in both themes. */
		color: var(--color-accent-text);
		cursor: pointer;
		text-decoration: underline;
	}

	.paste-import .field-label {
		display: block;
		margin-top: 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.paste-import textarea {
		width: 100%;
		margin-top: 6px;
		resize: vertical;
	}

	.url-import-row {
		display: flex;
		gap: 8px;
		margin-top: 6px;
	}

	.url-import-row input {
		flex: 1;
		min-width: 0;
	}

	.paste-import .btn-review-apply {
		margin-top: 4px;
		white-space: nowrap;
	}

	.url-import-row .btn-review-apply {
		margin-top: 0;
	}

	.fetch-error {
		margin: 6px 0 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--color-danger);
	}

	@media (max-width: 480px) {
		.url-import-row {
			flex-direction: column;
		}
	}

	.field-hint {
		margin: 6px 0 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-secondary);
	}

	.review-hint,
	.review-empty {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.review-empty {
		margin: -10px 0 20px;
		padding: 10px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background-color: var(--surface-2);
	}

	.review-list {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.review-item {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		cursor: pointer;
	}

	.review-item:hover {
		background-color: var(--surface-3);
	}

	.review-item input {
		flex-shrink: 0;
		align-self: center;
	}

	.review-label {
		min-width: 96px;
		color: var(--text-secondary);
	}

	.review-value {
		flex: 1;
		min-width: 0;
		color: var(--text-primary);
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	/* The semantic warning colour measures 4.07:1 (light) and 4.51:1 (dark) on
	   this surface - short of the 7:1 this project holds itself to - so the
	   badge carries its meaning in the word and the outline instead, and takes
	   the text colour that does clear AAA (8.6:1 in both themes). */
	.review-uncertain {
		flex-shrink: 0;
		padding: 1px 6px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		color: var(--text-secondary);
		font-size: 11px;
		font-weight: 600;
	}

	.review-actions {
		display: flex;
		gap: 8px;
	}

	.btn-review-apply,
	.btn-review-dismiss {
		padding: 6px 14px;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color var(--duration-fast) ease;
	}

	.btn-review-apply {
		border: none;
		background-color: var(--color-accent-600);
		color: white;
	}

	.btn-review-apply:hover {
		background-color: var(--color-accent-700);
	}

	.btn-review-dismiss {
		border: 1px solid var(--border-strong);
		background: transparent;
		color: var(--text-secondary);
	}

	.btn-review-dismiss:hover {
		background-color: var(--surface-3);
		color: var(--text-primary);
	}

	.pdf-error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: -10px 0 20px;
		padding: 10px 12px;
		background-color: var(--status-danger-bg);
		border: 1px solid var(--status-danger-border);
		border-radius: var(--radius-md);
		color: var(--color-danger);
		font-size: 13px;
	}

	.btn-dismiss-pdf-error {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--color-danger);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.btn-dismiss-pdf-error:hover {
		background-color: var(--status-danger-border);
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

	/* The real <input type="file"> is visually hidden (.sr-only) so the label
	   provides the click target; without this, a keyboard user tabbing to
	   that input would see no focus indicator at all. */
	.pdf-upload-box:focus-within {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
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

	/* A grid item's default `min-width: auto` refuses to shrink below its
	   content's minimum - a long <select> option or the date picker's trigger
	   label then widens its 1fr column and the whole grid overflows the dialog
	   body instead of the text wrapping/truncating. */
	.form-grid > * {
		min-width: 0;
	}

	.col-span-2 {
		grid-column: span 2;
	}

	/* Below this width two columns leave each field too narrow to read; stack
	   them. `span 2` has to be reset alongside, or it would create a phantom
	   second column in the now single-column grid. */
	@media (max-width: 560px) {
		.form-grid {
			grid-template-columns: 1fr;
		}

		.col-span-2 {
			grid-column: span 1;
		}
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

	/* An <input> carries a default intrinsic width (roughly 20 characters) that
	   flex will not shrink below without `min-width: 0` - on a 320px viewport
	   that alone plus the button pushed the row past the dialog's edge. */
	.tags-input-container input {
		flex: 1;
		min-width: 0;
	}

	.tags-input-container .btn-secondary {
		flex-shrink: 0;
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
		color: var(--color-accent-text);
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
		background-color: var(--color-danger-solid);
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

	.custom-swatch-wrapper:hover .btn-swatch-remove,
	.custom-swatch-wrapper:focus-within .btn-swatch-remove,
	.btn-swatch-remove:focus-visible {
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
		color: var(--color-accent-text);
		transform: scale(1.1);
	}

	/* The real <input type="color"> is visually hidden (.hidden-color-input)
	   so this button-styled label provides the visible target; without this,
	   a keyboard user tabbing to that input would see no focus indicator. */
	.btn-add-color:focus-within {
		outline: 2px solid var(--color-accent-500);
		outline-offset: 2px;
		border-color: var(--color-accent-500);
		color: var(--color-accent-text);
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
