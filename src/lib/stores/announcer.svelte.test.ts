import { describe, it, expect, vi } from 'vitest';

type AnnouncerModule = typeof import('./announcer.svelte.js');

async function loadAnnouncer(): Promise<AnnouncerModule> {
	vi.resetModules();
	return import('./announcer.svelte.js');
}

/** announce() defers the actual write to a microtask (see the store). */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('announcer', () => {
	it('starts silent so nothing is announced on page load', async () => {
		const { announcer } = await loadAnnouncer();
		expect(announcer.message).toBe('');
	});

	it('publishes the announced text', async () => {
		const { announcer } = await loadAnnouncer();
		announcer.announce('Bewerbung gespeichert');
		await flushMicrotasks();
		expect(announcer.message).toBe('Bewerbung gespeichert');
	});

	it('clears the region first, so aria-live sees a real text change', async () => {
		const { announcer } = await loadAnnouncer();
		announcer.announce('erste Meldung');
		await flushMicrotasks();

		announcer.announce('zweite Meldung');
		// Synchronously after the call the region must be empty, not still
		// holding the previous text - that blank frame is what makes the next
		// message a change rather than a no-op for the screen reader.
		expect(announcer.message).toBe('');
		await flushMicrotasks();
		expect(announcer.message).toBe('zweite Meldung');
	});

	it('re-announces an identical message (the reason for the clear-first dance)', async () => {
		const { announcer } = await loadAnnouncer();
		const seen: string[] = [];

		announcer.announce('Contoso GmbH verschoben');
		await flushMicrotasks();
		seen.push(announcer.message);

		announcer.announce('Contoso GmbH verschoben');
		seen.push(announcer.message); // the intermediate blank
		await flushMicrotasks();
		seen.push(announcer.message);

		expect(seen).toEqual(['Contoso GmbH verschoben', '', 'Contoso GmbH verschoben']);
	});

	it('keeps only the latest of two announcements made in the same tick', async () => {
		const { announcer } = await loadAnnouncer();
		announcer.announce('erste');
		announcer.announce('zweite');
		await flushMicrotasks();
		expect(announcer.message).toBe('zweite');
	});

	it('exposes message as read-only (components must go through announce())', async () => {
		const { announcer } = await loadAnnouncer();
		expect(() => {
			(announcer as { message: string }).message = 'direkt gesetzt';
		}).toThrow();
	});
});
