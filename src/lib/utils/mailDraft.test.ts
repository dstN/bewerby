import { describe, it, expect } from 'vitest';
import { buildMailtoUrl, MAILTO_MAX_LENGTH } from './mailDraft.js';

describe('buildMailtoUrl', () => {
	it('puts recipient, subject and body into a mailto URL', () => {
		const { url } = buildMailtoUrl({
			to: 'bewerbung@ngb-gmbh.de',
			subject: 'Bewerbung als Full Stack Developer',
			body: 'Guten Tag,'
		});

		expect(url.startsWith('mailto:bewerbung%40ngb-gmbh.de?')).toBe(true);
		expect(url).toContain('subject=Bewerbung%20als%20Full%20Stack%20Developer');
		expect(url).toContain('body=Guten%20Tag%2C');
	});

	it('encodes spaces as %20, not +', () => {
		// URLSearchParams would write "+", which mail clients show literally in
		// the subject line.
		const { url } = buildMailtoUrl({ to: 'a@b.de', subject: 'zwei Woerter', body: '' });
		expect(url).toContain('%20');
		expect(url).not.toContain('+');
	});

	it('encodes umlauts and newlines', () => {
		const { url } = buildMailtoUrl({
			to: 'a@b.de',
			subject: 'Grüße',
			body: 'Zeile eins\nZeile zwei'
		});
		expect(url).toContain('Gr%C3%BC%C3%9Fe');
		expect(url).toContain('%0A');
	});

	it('omits empty parameters instead of sending blanks', () => {
		expect(buildMailtoUrl({ to: 'a@b.de', subject: '', body: '' }).url).toBe('mailto:a%40b.de');
	});

	it('leaves a short letter untouched', () => {
		const result = buildMailtoUrl({ to: 'a@b.de', subject: 'Kurz', body: 'Ein kurzer Text.' });
		expect(result.truncated).toBe(false);
	});

	it('shortens an over-long letter and says so', () => {
		const result = buildMailtoUrl({
			to: 'a@b.de',
			subject: 'Bewerbung',
			body: 'Sehr geehrte Damen und Herren, '.repeat(200)
		});

		expect(result.truncated).toBe(true);
		expect(result.url.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
		expect(decodeURIComponent(result.url)).toContain('[…]');
	});

	it('stays under the limit even when every character is multi-byte', () => {
		const result = buildMailtoUrl({ to: 'a@b.de', subject: 'Ü', body: 'ÄÖÜäöüß'.repeat(400) });
		expect(result.truncated).toBe(true);
		expect(result.url.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH);
	});

	it('still produces an openable link when the body cannot be shortened enough', () => {
		const result = buildMailtoUrl({
			to: 'a@b.de',
			subject: 'x'.repeat(MAILTO_MAX_LENGTH * 2),
			body: 'kurz'
		});
		// The subject alone busts the budget; the result is still a valid
		// mailto rather than an exception.
		expect(result.url.startsWith('mailto:')).toBe(true);
		expect(result.truncated).toBe(true);
	});
});
