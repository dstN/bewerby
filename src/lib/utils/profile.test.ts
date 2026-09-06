import { describe, it, expect } from 'vitest';
import { emptyProfile, parseProfile } from './profile.js';

describe('parseProfile', () => {
	it('reads a well-formed profile', () => {
		const profile = parseProfile(
			JSON.stringify({
				cvRef: 'cv-1.pdf',
				cvName: 'lebenslauf.pdf',
				senderName: 'Petra Musterfrau',
				senderStreet: 'Musterweg 1',
				senderCity: '12345 Musterstadt',
				senderEmail: 'petra@example.com',
				senderPhone: '+49 30 12345678'
			})
		);

		expect(profile.cvRef).toBe('cv-1.pdf');
		expect(profile.senderName).toBe('Petra Musterfrau');
		expect(profile.senderPhone).toBe('+49 30 12345678');
	});

	it('returns the empty profile for absent, blank or malformed input', () => {
		expect(parseProfile(null)).toEqual(emptyProfile());
		expect(parseProfile('')).toEqual(emptyProfile());
		expect(parseProfile('not json at all')).toEqual(emptyProfile());
		expect(parseProfile('"a string"')).toEqual(emptyProfile());
		expect(parseProfile('null')).toEqual(emptyProfile());
	});

	it('drops fields of the wrong type rather than passing them through', () => {
		// localStorage and imported backups are both user-writable, so a
		// number or an object here must not reach the UI or a generated PDF.
		const profile = parseProfile(
			JSON.stringify({
				cvRef: 42,
				senderName: { evil: true },
				senderStreet: ['nope'],
				senderCity: null,
				senderEmail: 'ok@example.com'
			})
		);

		expect(profile.cvRef).toBeUndefined();
		expect(profile.senderName).toBe('');
		expect(profile.senderStreet).toBe('');
		expect(profile.senderCity).toBe('');
		expect(profile.senderEmail).toBe('ok@example.com');
	});

	it('treats an empty cvRef as no CV at all', () => {
		expect(parseProfile(JSON.stringify({ cvRef: '' })).cvRef).toBeUndefined();
	});

	it('ignores unknown extra fields', () => {
		const profile = parseProfile(JSON.stringify({ senderName: 'A', somethingElse: 'B' }));
		expect(profile).toEqual({ ...emptyProfile(), senderName: 'A' });
	});
});
