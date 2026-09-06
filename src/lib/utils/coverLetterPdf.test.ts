import { describe, it, expect } from 'vitest';
import { toWinAnsi, wrapRuns, type MeasureText } from './coverLetterPdf.js';
import { parseInline } from './markdown.js';

/** One unit per character, so the expected breaks are countable by hand. */
const measure: MeasureText = (text) => text.length;

function textOf(lines: ReturnType<typeof wrapRuns>): string[] {
	return lines.map((line) => line.map((segment) => segment.text).join(''));
}

describe('wrapRuns', () => {
	it('breaks a line at the last word that fits', () => {
		const lines = wrapRuns(parseInline('eins zwei drei vier'), measure, 10);
		expect(textOf(lines)).toEqual(['eins zwei', 'drei vier']);
	});

	it('keeps everything on one line when it fits', () => {
		expect(textOf(wrapRuns(parseInline('kurz'), measure, 40))).toEqual(['kurz']);
	});

	it('never drops a word that is wider than the line', () => {
		// Better an overlong line than silently losing the word.
		const lines = wrapRuns(parseInline('Arbeitsunfaehigkeitsbescheinigung ok'), measure, 10);
		expect(textOf(lines)).toEqual(['Arbeitsunfaehigkeitsbescheinigung', 'ok']);
	});

	it('carries the style of each segment through the break', () => {
		const lines = wrapRuns(parseInline('normal **fett** normal'), measure, 11);
		const styled = lines.flat().filter((segment) => segment.bold);
		expect(styled.map((segment) => segment.text)).toEqual(['fett']);
	});

	it('does not insert a space where the markup had none', () => {
		// "**b**c" is one word split across two runs; wrapping must not glue a
		// space between them.
		expect(textOf(wrapRuns(parseInline('**b**c'), measure, 40))).toEqual(['bc']);
	});

	it('drops a trailing space rather than letting it widen the line', () => {
		const lines = wrapRuns(parseInline('eins zwei '), measure, 40);
		expect(lines[0][lines[0].length - 1].text).not.toBe(' ');
	});

	it('returns a single empty line for empty input', () => {
		expect(textOf(wrapRuns(parseInline(''), measure, 40))).toEqual(['']);
	});
});

describe('toWinAnsi', () => {
	it('keeps German text unchanged', () => {
		expect(toWinAnsi('Grüße aus Köln, Straße 1')).toBe('Grüße aus Köln, Straße 1');
	});

	it('keeps the typographic characters cp1252 does cover', () => {
		expect(toWinAnsi('„Zitat“ – Gedankenstrich … •')).toBe('„Zitat“ – Gedankenstrich … •');
	});

	it('drops characters the standard fonts cannot encode', () => {
		// pdf-lib throws on an unencodable glyph rather than skipping it, so one
		// stray emoji would otherwise fail the whole export.
		expect(toWinAnsi('Fertig 🎉')).toBe('Fertig ');
		expect(toWinAnsi('λόγος')).toBe('');
	});

	it('expands a tab, which the standard fonts have no glyph for', () => {
		expect(toWinAnsi('a\tb')).toBe('a    b');
	});
});
