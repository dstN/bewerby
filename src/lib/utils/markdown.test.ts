import { describe, it, expect } from 'vitest';
import { markdownToPlainText, parseInline, parseMarkdown, renderMarkdown } from './markdown.js';

describe('renderMarkdown - escaping', () => {
	it('never lets markup from the letter reach the preview as elements', () => {
		// The preview goes through {@html}, so this is the one property that
		// must hold no matter what the writer types.
		const html = renderMarkdown('<script>alert(1)</script>');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('escapes quotes and ampersands', () => {
		const html = renderMarkdown('Tom & Jerry sagten "hallo"');
		expect(html).toContain('&amp;');
		expect(html).toContain('&quot;');
	});

	it('escapes inside a bold span too', () => {
		expect(renderMarkdown('**<b>nope</b>**')).toBe(
			'<p><strong>&lt;b&gt;nope&lt;/b&gt;</strong></p>'
		);
	});
});

describe('renderMarkdown - the supported subset', () => {
	it('wraps text in paragraphs and keeps single newlines as line breaks', () => {
		expect(renderMarkdown('Zeile eins\nZeile zwei')).toBe('<p>Zeile eins<br>Zeile zwei</p>');
	});

	it('separates paragraphs on a blank line', () => {
		expect(renderMarkdown('Erster\n\nZweiter')).toBe('<p>Erster</p><p>Zweiter</p>');
	});

	it('renders bold and italic', () => {
		expect(renderMarkdown('**fett** und *kursiv*')).toBe(
			'<p><strong>fett</strong> und <em>kursiv</em></p>'
		);
	});

	it('renders a bullet list', () => {
		expect(renderMarkdown('- eins\n- zwei')).toBe('<ul><li>eins</li><li>zwei</li></ul>');
	});

	it('renders a numbered list', () => {
		expect(renderMarkdown('1. eins\n2. zwei')).toBe('<ol><li>eins</li><li>zwei</li></ol>');
	});

	it('does not merge a bullet list into a numbered one', () => {
		const blocks = parseMarkdown('- eins\n1. zwei');
		expect(blocks).toHaveLength(2);
	});
});

describe('parseInline', () => {
	it('leaves an unclosed marker as literal text', () => {
		// Otherwise a stray asterisk would silently italicise the rest of the
		// letter while the writer is still typing.
		expect(parseInline('5 * 3 = 15')).toEqual([{ text: '5 * 3 = 15', bold: false, italic: false }]);
		expect(parseInline('**offen')).toEqual([{ text: '**offen', bold: false, italic: false }]);
	});

	it('prefers bold over two italics', () => {
		expect(parseInline('**x**')).toEqual([{ text: 'x', bold: true, italic: false }]);
	});

	it('handles bold and italic in the same line', () => {
		expect(parseInline('a **b** c *d*')).toEqual([
			{ text: 'a ', bold: false, italic: false },
			{ text: 'b', bold: true, italic: false },
			{ text: ' c ', bold: false, italic: false },
			{ text: 'd', bold: false, italic: true }
		]);
	});
});

describe('markdownToPlainText', () => {
	it('drops the markers but keeps the words', () => {
		expect(markdownToPlainText('**Sehr geehrte** Frau *Musterfrau*,')).toBe(
			'Sehr geehrte Frau Musterfrau,'
		);
	});

	it('keeps list structure a reader still needs', () => {
		expect(markdownToPlainText('- eins\n- zwei')).toBe('- eins\n- zwei');
		expect(markdownToPlainText('1. eins\n2. zwei')).toBe('1. eins\n2. zwei');
	});

	it('separates paragraphs with a blank line', () => {
		expect(markdownToPlainText('Erster\n\nZweiter')).toBe('Erster\n\nZweiter');
	});

	it('returns an empty string for empty input', () => {
		expect(markdownToPlainText('')).toBe('');
		expect(markdownToPlainText('   \n\n  ')).toBe('');
	});
});

describe('parseMarkdown - block model shared with the PDF renderer', () => {
	it('models a letter as paragraphs and lists', () => {
		const blocks = parseMarkdown(
			['Sehr geehrte Frau Musterfrau,', '', 'ich bringe mit:', '', '- Erfahrung', '- Neugier'].join(
				'\n'
			)
		);

		expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'list']);
		expect(blocks[2]).toMatchObject({ type: 'list', ordered: false });
	});

	it('normalises CRLF line endings', () => {
		expect(parseMarkdown('a\r\n\r\nb')).toHaveLength(2);
	});
});
