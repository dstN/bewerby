import type { Application } from '$lib/db/index.js';

/** Analytics only ever needs status/history, not every field of a row. */
export type AnalyticsRow = Pick<Application, 'status' | 'history'>;

export interface ApplicationStats {
	counts: {
		draft: number;
		sent: number;
		interview: number;
		accepted: number;
		rejected: number;
	};
	funnel: {
		sent: number;
		selection: number;
		success: number;
		selectionRate: number;
		successRate: number;
		totalConversion: number;
	};
	response: {
		avg: number;
		best: number;
		worst: number;
		count: number;
	};
}

/**
 * Computes the status funnel and response-time metrics shown on the
 * analytics page. Pure function of the row list, extracted out of the
 * component's $derived so it can be unit-tested without Svelte reactivity
 * or a Dexie-backed store.
 */
export function computeApplicationStats(list: AnalyticsRow[]): ApplicationStats {
	let draft = 0;
	let sent = 0;
	let interview = 0;
	let accepted = 0;
	let rejected = 0;

	const responseTimes: number[] = [];

	list.forEach((app) => {
		// Basic status count
		if (app.status === 'draft') draft++;
		else if (app.status === 'sent') sent++;
		else if (app.status === 'interview') interview++;
		else if (app.status === 'accepted') accepted++;
		else if (app.status === 'rejected') rejected++;

		// Calculate response time from history log
		// Time from 'sent' -> first 'interview' or 'rejected'
		// `history` is required on the type, but a row written past TypeScript
		// (a hand-edited record, a put() with a partial object) can arrive
		// without it — and one such row used to throw here and take the whole
		// statistics page down rather than just counting as having no events.
		const history = app.history ?? [];
		const sentEvent = history.find((h) => h.status === 'sent');
		const responseEvent = history.find((h) => h.status === 'interview' || h.status === 'rejected');

		if (sentEvent && responseEvent && responseEvent.timestamp > sentEvent.timestamp) {
			const durationDays = (responseEvent.timestamp - sentEvent.timestamp) / (1000 * 60 * 60 * 24);
			responseTimes.push(durationDays);
		}
	});

	// Funnel accumulation:
	// Sent stage includes anything that reached "sent", "interview", "accepted", or "rejected"
	const totalSent = sent + interview + accepted + rejected;
	const totalSelection = interview + accepted + rejected;
	const totalSuccess = accepted;

	// Percentages
	const selectionRate = totalSent > 0 ? Math.round((totalSelection / totalSent) * 100) : 0;
	const successRate = totalSelection > 0 ? Math.round((totalSuccess / totalSelection) * 100) : 0;
	const totalConversion = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;

	// Response time aggregations
	const count = responseTimes.length;
	const avg =
		count > 0 ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
	const best = count > 0 ? Math.round(Math.min(...responseTimes) * 10) / 10 : 0;
	const worst = count > 0 ? Math.round(Math.max(...responseTimes) * 10) / 10 : 0;

	return {
		counts: { draft, sent, interview, accepted, rejected },
		funnel: {
			sent: totalSent,
			selection: totalSelection,
			success: totalSuccess,
			selectionRate,
			successRate,
			totalConversion
		},
		response: {
			avg,
			best,
			worst,
			count
		}
	};
}
