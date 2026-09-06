/**
 * A deliberately small Markdown subset - paragraphs, bold, italic, bullet and
 * numbered lists - which is the whole of what a cover letter needs.
 *
 * No Markdown library: the alternative under consideration was a rich-text
 * editor, and the reason that was rejected (a contenteditable surface cannot
 * realistically clear this project's WCAG 2.2 AAA bar) applies to its
 * dependency weight too. CommonMark is not the goal; a letter is.
 *
 * Everything parses once into blocks, and the HTML preview, the plain-text
 * mail body and the PDF renderer are all projections of those same blocks - so
 * what the writer sees is what the PDF gets.
 */

export interface InlineRun {
	text: string;
	bold: boolean;
	italic: boolean;
}

export type MarkdownBlock =
	| { type: 'paragraph'; lines: InlineRun[][] }
	| { type: 'list'; ordered: boolean; items: InlineRun[][] };

/**
 * Splits one line into styled runs. `**` is matched before `*` so a bold span
 * is never mistaken for two italic ones, and an unclosed marker is left as
 * literal text rather than swallowing the rest of the letter.
 */
export function parseInline(line: string): InlineRun[] {
	const runs: InlineRun[] = [];
	let buffer = '';
	let bold = false;
	let italic = false;

	const flush = () => {
		if (buffer) runs.push({ text: buffer, bold, italic });
		buffer = '';
	};

	let index = 0;
	while (index < line.length) {
		const rest = line.slice(index);

		if (rest.startsWith('**')) {
			// Only treat it as a delimiter if the span is actually closed.
			if (bold || rest.indexOf('**', 2) !== -1) {
				flush();
				bold = !bold;
				index += 2;
				continue;
			}
		} else if (rest.startsWith('*')) {
			if (italic || rest.indexOf('*', 1) !== -1) {
				flush();
				italic = !italic;
				index += 1;
				continue;
			}
		}

		buffer += line[index];
		index += 1;
	}

	flush();
	return runs.length > 0 ? runs : [{ text: '', bold: false, italic: false }];
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

/** Parses Markdown into blocks. Blank lines separate blocks. */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
	const blocks: MarkdownBlock[] = [];
	const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

	let paragraph: InlineRun[][] = [];
	let list: { ordered: boolean; items: InlineRun[][] } | null = null;

	const flushParagraph = () => {
		if (paragraph.length > 0) {
			blocks.push({ type: 'paragraph', lines: paragraph });
			paragraph = [];
		}
	};
	const flushList = () => {
		if (list) {
			blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
			list = null;
		}
	};

	for (const raw of lines) {
		const line = raw.trimEnd();

		if (!line.trim()) {
			flushParagraph();
			flushList();
			continue;
		}

		const bullet = line.match(BULLET);
		const ordered = line.match(ORDERED);

		if (bullet || ordered) {
			flushParagraph();
			const isOrdered = Boolean(ordered);
			const content = (bullet ?? ordered)![1];
			if (list && list.ordered !== isOrdered) flushList();
			if (!list) list = { ordered: isOrdered, items: [] };
			list.items.push(parseInline(content));
			continue;
		}

		flushList();
		paragraph.push(parseInline(line));
	}

	flushParagraph();
	flushList();
	return blocks;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function runsToHtml(runs: InlineRun[]): string {
	return runs
		.map((run) => {
			// Escaped first, always - the preview goes through {@html}, and the
			// writer's own text is still untrusted input to the DOM.
			let html = escapeHtml(run.text);
			if (run.bold) html = `<strong>${html}</strong>`;
			if (run.italic) html = `<em>${html}</em>`;
			return html;
		})
		.join('');
}

/** Renders the subset to HTML for the live preview. Output is escaped. */
export function renderMarkdown(markdown: string): string {
	return parseMarkdown(markdown)
		.map((block) => {
			if (block.type === 'paragraph') {
				return `<p>${block.lines.map(runsToHtml).join('<br>')}</p>`;
			}
			const tag = block.ordered ? 'ol' : 'ul';
			const items = block.items.map((item) => `<li>${runsToHtml(item)}</li>`).join('');
			return `<${tag}>${items}</${tag}>`;
		})
		.join('');
}

function runsToText(runs: InlineRun[]): string {
	return runs.map((run) => run.text).join('');
}

/**
 * Flattens to plain text for the mailto body, where no markup survives
 * anyway. List markers are kept because they carry structure a reader needs.
 */
export function markdownToPlainText(markdown: string): string {
	return parseMarkdown(markdown)
		.map((block) => {
			if (block.type === 'paragraph') {
				return block.lines.map(runsToText).join('\n');
			}
			return block.items
				.map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${runsToText(item)}`)
				.join('\n');
		})
		.join('\n\n')
		.trim();
}

/** The block model the PDF renderer lays out. */
export function markdownToBlocks(markdown: string): MarkdownBlock[] {
	return parseMarkdown(markdown);
}
