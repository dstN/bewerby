<script lang="ts">
	import { t } from '$lib/i18n/index.svelte.js';
	import { renderMarkdown } from '$lib/utils/markdown.js';

	let {
		value = $bindable(''),
		id = 'cover-letter',
		oninsertTemplate
	}: {
		value?: string;
		id?: string;
		/** Omitted where there is nothing to fill a template from. */
		oninsertTemplate?: () => void;
	} = $props();

	let textareaEl: HTMLTextAreaElement | undefined = $state();

	let preview = $derived(renderMarkdown(value));

	/**
	 * The toolbar edits the text, it does not touch the DOM. That is the whole
	 * reason this is a <textarea> and not a contenteditable surface: selection,
	 * caret, undo and screen-reader behaviour all stay the browser's job, and
	 * there is no custom editing model to make accessible.
	 */
	function surround(marker: string) {
		const el = textareaEl;
		if (!el) return;
		const { selectionStart: start, selectionEnd: end } = el;
		const selected = value.slice(start, end);
		value = `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`;

		// After the value round-trips through the binding, put the caret back
		// around what the user had selected.
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + marker.length, start + marker.length + selected.length);
		});
	}

	function prefixLines(makePrefix: (index: number) => string) {
		const el = textareaEl;
		if (!el) return;
		const { selectionStart: start, selectionEnd: end } = el;

		const lineStart = value.lastIndexOf('\n', start - 1) + 1;
		const lineEndIndex = value.indexOf('\n', end);
		const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

		const block = value.slice(lineStart, lineEnd);
		const prefixed = block
			.split('\n')
			.map((line, index) => (line.trim() ? `${makePrefix(index)}${line}` : line))
			.join('\n');

		value = `${value.slice(0, lineStart)}${prefixed}${value.slice(lineEnd)}`;

		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(lineStart, lineStart + prefixed.length);
		});
	}
</script>

<div class="editor">
	<div class="toolbar" role="group" aria-label={t('coverLetter.heading')}>
		<button type="button" onclick={() => surround('**')} aria-label={t('coverLetter.bold')}>
			<span aria-hidden="true"><strong>B</strong></span>
		</button>
		<button type="button" onclick={() => surround('*')} aria-label={t('coverLetter.italic')}>
			<span aria-hidden="true"><em>I</em></span>
		</button>
		<button
			type="button"
			onclick={() => prefixLines(() => '- ')}
			aria-label={t('coverLetter.bulletList')}
		>
			<span aria-hidden="true">•</span>
		</button>
		<button
			type="button"
			onclick={() => prefixLines((index) => `${index + 1}. `)}
			aria-label={t('coverLetter.numberedList')}
		>
			<span aria-hidden="true">1.</span>
		</button>
		{#if oninsertTemplate}
			<button type="button" class="template-btn" onclick={oninsertTemplate}>
				{t('coverLetter.insertTemplate')}
			</button>
		{/if}
	</div>

	<div class="panes">
		<div class="pane">
			<label for={id}>{t('coverLetter.label')}</label>
			<textarea
				{id}
				bind:this={textareaEl}
				bind:value
				rows="14"
				aria-describedby="{id}-hint"
				spellcheck="true"></textarea>
			<p class="hint" id="{id}-hint">{t('coverLetter.hint')}</p>
		</div>

		<div class="pane">
			<!-- A plain region, deliberately not aria-live: announcing the preview
			     on every keystroke would make the editor unusable with a screen
			     reader, and the textarea already reports what was typed. -->
			<h4 id="{id}-preview-heading">{t('coverLetter.previewHeading')}</h4>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- The pane scrolls once a letter grows past its max-height, and a
			     scroll container with no focusable child is unreachable by
			     keyboard (WCAG 2.1.1). The tabindex is what makes it scrollable
			     without a mouse; the rule assumes a non-scrolling region. -->
			<div class="preview" role="region" aria-labelledby="{id}-preview-heading" tabindex="0">
				{#if value.trim()}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes every run before formatting; see markdown.test.ts -->
					{@html preview}
				{:else}
					<p class="preview-empty">{t('coverLetter.previewEmpty')}</p>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.toolbar button {
		min-width: 34px;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background-color: var(--surface-0);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) ease,
			border-color var(--duration-fast) ease;
	}

	.toolbar button:hover {
		background-color: var(--surface-2);
		border-color: var(--border-strong);
	}

	.template-btn {
		margin-left: auto;
		font-weight: 600;
	}

	.panes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.pane label,
	.pane h4 {
		margin: 0 0 4px;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	textarea {
		width: 100%;
		padding: 10px 12px;
		background-color: var(--surface-0);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 13px;
		line-height: 1.6;
		resize: vertical;
	}

	.hint {
		margin: 6px 0 0;
		font-size: 11px;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.preview {
		flex: 1;
		min-height: 200px;
		max-height: 420px;
		overflow-y: auto;
		padding: 10px 12px;
		background-color: var(--surface-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.preview :global(p) {
		margin: 0 0 10px;
	}

	.preview :global(p:last-child) {
		margin-bottom: 0;
	}

	.preview :global(ul),
	.preview :global(ol) {
		margin: 0 0 10px;
		padding-left: 20px;
	}

	.preview-empty {
		color: var(--text-secondary);
	}

	@media (max-width: 768px) {
		.panes {
			grid-template-columns: 1fr;
		}

		.preview {
			min-height: 120px;
		}
	}
</style>
