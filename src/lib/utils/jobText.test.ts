import { describe, it, expect } from 'vitest';
import {
	GENDER_TAG_REGEX,
	groupBlocks,
	isSectionHeading,
	normalizeLine,
	repairSplitTokens,
	stripBoilerplate,
	unspaceLetterSpacing,
	type DocLine
} from './jobText.js';

function line(partial: Partial<DocLine> & { text: string }): DocLine {
	return { page: 1, y: 700, size: 12, bold: false, ...partial };
}

describe('unspaceLetterSpacing', () => {
	it('closes up a heading that was set with letter-spacing', () => {
		expect(unspaceLetterSpacing('F R O N T E N D')).toBe('FRONTEND');
		expect(unspaceLetterSpacing('( M / W / D )')).toBe('(M/W/D)');
	});

	it('leaves ordinary prose untouched', () => {
		const prose = 'Wir suchen eine neue Kollegin für unser Team';
		expect(unspaceLetterSpacing(prose)).toBe(prose);
	});

	it('leaves a grouped phone number untouched', () => {
		// Its groups are two digits wide, so the single-character majority
		// rule never fires - this is the case the guard exists for.
		expect(unspaceLetterSpacing('+49 30 12 34 56')).toBe('+49 30 12 34 56');
	});

	it('needs at least four tokens before it acts', () => {
		expect(unspaceLetterSpacing('A B C')).toBe('A B C');
	});
});

describe('repairSplitTokens', () => {
	it('rejoins an e-mail address torn apart by the line reconstruction', () => {
		// Observed verbatim in a real browser print-to-PDF capture.
		expect(repairSplitTokens('Kontakt info@feneco n.de')).toBe('Kontakt info@fenecon.de');
	});

	it('rejoins a split URL host', () => {
		expect(repairSplitTokens('https://www.example .de/jobs')).toBe('https://www.example.de/jobs');
	});

	it('leaves an abbreviation followed by a word alone', () => {
		const text = 'Erfahrung z. B. mit TypeScript';
		expect(repairSplitTokens(text)).toBe(text);
	});
});

describe('groupBlocks', () => {
	it('merges a headline that wrapped onto a second line', () => {
		const blocks = groupBlocks([
			line({ y: 700, size: 20.7, text: 'Full Stack Developer (m/w/d) mit Schwerpunkt' }),
			line({ y: 676, size: 20.7, text: 'TypeScript' }),
			line({ y: 640, size: 13.6, text: 'NGB GmbH' })
		]);

		expect(blocks).toHaveLength(2);
		expect(blocks[0].text).toBe('Full Stack Developer (m/w/d) mit Schwerpunkt TypeScript');
		expect(blocks[0].lineCount).toBe(2);
		expect(blocks[1].text).toBe('NGB GmbH');
	});

	it('closes up a headline broken after a hyphen instead of inserting a space', () => {
		const blocks = groupBlocks([
			line({ y: 700, size: 29.6, text: 'FRONTEND-' }),
			line({ y: 668, size: 29.6, text: 'ENTWICKLER' })
		]);

		expect(blocks[0].text).toBe('FRONTEND-ENTWICKLER');
	});

	it('does not merge across a change in font size', () => {
		const blocks = groupBlocks([
			line({ y: 700, size: 20, text: 'Titel' }),
			line({ y: 684, size: 12, text: 'Fließtext' })
		]);

		expect(blocks).toHaveLength(2);
	});

	it('does not merge across a page break', () => {
		const blocks = groupBlocks([
			line({ page: 1, y: 60, size: 12, text: 'Ende Seite eins' }),
			line({ page: 2, y: 50, size: 12, text: 'Anfang Seite zwei' })
		]);

		expect(blocks).toHaveLength(2);
	});
});

describe('stripBoilerplate', () => {
	it('drops a running header repeated in the margin of three pages', () => {
		const lines = [1, 2, 3].flatMap((page) => [
			line({ page, y: 780, text: 'Jobbörse - Seite drucken' }),
			line({ page, y: 400, text: `Inhalt der Seite ${page}` })
		]);

		const kept = stripBoilerplate(lines).map((entry) => entry.text);
		expect(kept).not.toContain('Jobbörse - Seite drucken');
		expect(kept).toHaveLength(3);
	});

	it('keeps a repeated line that also appears in the body', () => {
		// The employer name is printed in every page header *and* in the
		// contact block. Dropping it wholesale cost the company field in three
		// of five real ads, which is why the margin position decides.
		const lines = [1, 2, 3].flatMap((page) => [
			line({ page, y: 780, text: 'Strucnamics Engineering GmbH' }),
			line({ page, y: 400, text: `Inhalt ${page}` }),
			line({ page, y: 40, text: `Seite ${page} von 3` })
		]);
		lines.push(line({ page: 3, y: 300, text: 'Strucnamics Engineering GmbH' }));

		const kept = stripBoilerplate(lines).filter(
			(entry) => entry.text === 'Strucnamics Engineering GmbH'
		);
		expect(kept).toHaveLength(1);
		expect(kept[0].y).toBe(300);
	});

	it('drops portal chrome regardless of repetition', () => {
		const kept = stripBoilerplate([
			line({ text: 'Impressum' }),
			line({ text: 'Echte Inhalte' })
		]).map((entry) => entry.text);

		expect(kept).toEqual(['Echte Inhalte']);
	});
});

describe('GENDER_TAG_REGEX', () => {
	it.each([
		'Pflegefachkraft (m/w/d)',
		'Bäcker (w/m/d)',
		'Steuerfachangestellte (m/w/x)',
		'Senior Frontend-Entwickler/in (m, w, d)',
		'Erzieher (all genders)',
		'Mitarbeiter (gn)',
		'Senior Frontend Entwickler*in (Web)',
		'Referent:in Kommunikation'
	])('recognizes %s as a job title marker', (title) => {
		expect(GENDER_TAG_REGEX.test(title)).toBe(true);
	});

	it('does not fire on ordinary prose', () => {
		expect(GENDER_TAG_REGEX.test('Wir bieten flexible Arbeitszeiten')).toBe(false);
	});
});

describe('isSectionHeading', () => {
	it.each(['Deine Aufgaben', 'Dein Profil', 'Wir bieten', 'Einleitung', 'What we offer'])(
		'treats %s as a section heading',
		(heading) => {
			expect(isSectionHeading(heading)).toBe(true);
		}
	);

	it('does not treat an employer name as a section heading', () => {
		expect(isSectionHeading('antony Groupware GmbH')).toBe(false);
	});
});

describe('normalizeLine', () => {
	it('applies unspacing and token repair together', () => {
		expect(normalizeLine('  F R O N T E N D  ')).toBe('FRONTEND');
		expect(normalizeLine('mail: info@feneco n.de')).toBe('mail: info@fenecon.de');
	});
});
