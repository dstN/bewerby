import type { Application } from '#lib/db/index.js';
import { getRejectedAt, getSentAt, wasSent } from '#lib/utils/reminders.js';

/** Analytics only ever needs status, history and the entered dates. */
export type AnalyticsRow = Pick<Application, 'status' | 'history' | 'sentAt' | 'rejectedAt'>;

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

/** Days since 1970-01-01 of the local date: the same day counts as 0 apart, DST or not. */
function calendarDay(timestamp: number): number {
	const date = new Date(timestamp);
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
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
	// Rejections that came after an interview. Only those belong in the
	// selection stage: a rejection straight after sending was never selected.
	let rejectedAfterInterview = 0;
	let totalSent = 0;

	const responseTimes: number[] = [];

	list.forEach((app) => {
		// Basic status count
		if (app.status === 'draft') draft++;
		else if (app.status === 'sent') sent++;
		else if (app.status === 'interview') interview++;
		else if (app.status === 'accepted') accepted++;
		else if (app.status === 'rejected') rejected++;

		// `history` is required on the type, but a row written past TypeScript
		// (a hand-edited record, a put() with a partial object) can arrive
		// without it — and one such row used to throw here and take the whole
		// statistics page down rather than just counting as having no events.
		const history = app.history ?? [];
		if (wasSent(app)) totalSent++;
		if (app.status === 'rejected' && history.some((h) => h.status === 'interview')) {
			rejectedAfterInterview++;
		}
		// Response time: from the send to the first answer - a move into
		// interview, offer or rejection, each by its entered date where there
		// is one. Nothing else is an answer: a card still waiting, or one put
		// away without ever hearing back, has no response time. The current
		// rejection's logged move is left out when getRejectedAt stands in for it.
		const sentAt = getSentAt(app);
		if (sentAt !== undefined) {
			const rejectedAt = getRejectedAt(app);
			const responses = history
				.filter(
					(h, i) =>
						h.status === 'interview' ||
						h.status === 'accepted' ||
						(h.status === 'rejected' && (rejectedAt === undefined || i < history.length - 1))
				)
				.map((h) => h.timestamp);
			if (rejectedAt !== undefined) responses.push(rejectedAt);
			// In calendar days: an entered date is noon of its day, a move is the
			// moment it happened, so counting milliseconds was off by up to half
			// a day either way, and dropped an answer from the same morning.
			// Only answers from the day of the send on: a card put into "Absage"
			// as a draft and sent later carries an earlier entry that is none.
			const sentDay = calendarDay(sentAt);
			const after = responses.map(calendarDay).filter((day) => day >= sentDay);
			if (after.length > 0) responseTimes.push(Math.min(...after) - sentDay);
		}
	});

	// Funnel accumulation. Each stage is a subset of the one before: a
	// rejection after an interview also has "interview" in its history, so it
	// counts as sent too.
	// Accepted stays in unconditionally: an offer implies selection, and
	// leaving it out would push the success rate past 100 %.
	const totalSelection = interview + accepted + rejectedAfterInterview;
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
