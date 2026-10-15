import { describe, it, expect } from 'vitest';
import { computeApplicationStats, type AnalyticsRow } from './analytics.js';

function row(status: AnalyticsRow['status'], history: AnalyticsRow['history'] = []): AnalyticsRow {
	return { status, history };
}

describe('computeApplicationStats', () => {
	it('returns all-zero stats for an empty list', () => {
		const stats = computeApplicationStats([]);
		expect(stats.counts).toEqual({ draft: 0, sent: 0, interview: 0, accepted: 0, rejected: 0 });
		expect(stats.funnel).toEqual({
			sent: 0,
			selection: 0,
			success: 0,
			selectionRate: 0,
			successRate: 0,
			totalConversion: 0
		});
		expect(stats.response).toEqual({ avg: 0, best: 0, worst: 0, count: 0 });
	});

	it('survives a row whose history field is missing', () => {
		// Not reachable through the UI, but a record written past TypeScript can
		// arrive like this — a put() with a partial object replaces the row and
		// drops every field it omits. One such row used to throw inside .find()
		// and take the whole statistics page down.
		const broken = { status: 'sent' } as unknown as AnalyticsRow;
		const stats = computeApplicationStats([broken, row('sent'), row('interview')]);
		expect(stats.counts.sent).toBe(2);
		expect(stats.counts.interview).toBe(1);
		expect(stats.response.count).toBe(0);
	});

	it('counts each status independently', () => {
		const stats = computeApplicationStats([
			row('draft'),
			row('draft'),
			row('sent'),
			row('interview'),
			row('accepted'),
			row('rejected')
		]);
		expect(stats.counts).toEqual({ draft: 2, sent: 1, interview: 1, accepted: 1, rejected: 1 });
	});

	it('computes the funnel as a cumulative pipeline (sent includes everything past it)', () => {
		const stats = computeApplicationStats([
			row('draft'),
			row('sent'),
			row('interview'),
			row('accepted'),
			row('rejected', [
				{ status: 'sent', timestamp: 1 },
				{ status: 'interview', timestamp: 2 },
				{ status: 'rejected', timestamp: 3 }
			])
		]);
		// sent stage = sent + interview + accepted + rejected (draft excluded)
		expect(stats.funnel.sent).toBe(4);
		// selection stage = interview + accepted + a rejection after an interview
		expect(stats.funnel.selection).toBe(3);
		expect(stats.funnel.success).toBe(1);
	});

	it('does not count a draft rejected straight from the draft column as sent', () => {
		const stats = computeApplicationStats([
			// Posting gone before it was ever sent: archived via "Absage".
			row('rejected', [
				{ status: 'draft', timestamp: 1 },
				{ status: 'rejected', timestamp: 2 }
			]),
			// Sent, then rejected.
			row('rejected', [
				{ status: 'draft', timestamp: 1 },
				{ status: 'sent', timestamp: 2 },
				{ status: 'rejected', timestamp: 3 }
			]),
			// Logged after the fact straight into the rejected column: no draft
			// ever existed, so the entry records a real rejection.
			row('rejected', [{ status: 'rejected', timestamp: 1 }]),
			row('draft', [{ status: 'draft', timestamp: 1 }])
		]);
		expect(stats.counts.rejected).toBe(3);
		expect(stats.funnel.sent).toBe(2);
		expect(stats.funnel.selection).toBe(0);
	});

	it('counts an old row whose history stops short of its status as sent', () => {
		// Before 2026-08-18 the edit dialog changed a status without logging
		// it: created as a draft, set to "Absage" in the dialog, the history
		// still reads [draft]. That cannot prove the card was never sent.
		const stats = computeApplicationStats([
			row('rejected', [{ status: 'draft', timestamp: 1 }]),
			row('interview', [{ status: 'draft', timestamp: 1 }])
		]);
		expect(stats.funnel.sent).toBe(2);
		// An interview is only proven by the status itself, not by the gap.
		expect(stats.funnel.selection).toBe(1);
	});

	it('does not count a rejection as selection unless it went through an interview', () => {
		const stats = computeApplicationStats([
			// Rejected straight after sending: never selected.
			row('rejected', [
				{ status: 'sent', timestamp: 1 },
				{ status: 'rejected', timestamp: 2 }
			]),
			// Rejected after the interview: selected, then turned down.
			row('rejected', [
				{ status: 'sent', timestamp: 1 },
				{ status: 'interview', timestamp: 2 },
				{ status: 'rejected', timestamp: 3 }
			]),
			// No history at all (legacy or hand-edited row): nothing proves an interview.
			row('rejected')
		]);
		expect(stats.counts.rejected).toBe(3);
		expect(stats.funnel.sent).toBe(3);
		expect(stats.funnel.selection).toBe(1);
		expect(stats.funnel.selectionRate).toBe(Math.round((1 / 3) * 100));
	});

	it('computes funnel percentages rounded to the nearest integer', () => {
		const stats = computeApplicationStats([
			row('sent'),
			row('sent'),
			row('sent'),
			row('interview'), // 1 of 4 "sent" reached selection = 25%
			row('accepted') // wait: accepted counts as sent+selection+success too
		]);
		// sent total = interview(1) + accepted(1) = 2 (the three plain "sent" rows
		// don't count toward selection/success, only toward the sent stage)
		expect(stats.funnel.sent).toBe(5);
		expect(stats.funnel.selection).toBe(2);
		expect(stats.funnel.success).toBe(1);
		expect(stats.funnel.selectionRate).toBe(Math.round((2 / 5) * 100));
		expect(stats.funnel.successRate).toBe(Math.round((1 / 2) * 100));
		expect(stats.funnel.totalConversion).toBe(Math.round((1 / 5) * 100));
	});

	it('computes response time from the first "sent" to the first "interview"/"rejected" event', () => {
		const oneDayMs = 24 * 60 * 60 * 1000;
		const stats = computeApplicationStats([
			row('interview', [
				{ status: 'sent', timestamp: 0 },
				{ status: 'interview', timestamp: 3 * oneDayMs }
			]),
			row('rejected', [
				{ status: 'sent', timestamp: 0 },
				{ status: 'rejected', timestamp: 7 * oneDayMs }
			])
		]);
		expect(stats.response.count).toBe(2);
		expect(stats.response.best).toBe(3);
		expect(stats.response.worst).toBe(7);
		expect(stats.response.avg).toBe(5);
	});

	it('measures the response between the entered dates, over the logged moves', () => {
		const day = 24 * 60 * 60 * 1000;
		const history: AnalyticsRow['history'] = [
			{ status: 'sent', timestamp: 2 * day },
			{ status: 'rejected', timestamp: 20 * day }
		];
		const stats = computeApplicationStats([
			{ status: 'rejected', history, sentAt: 1 * day, rejectedAt: 9 * day },
			// Only the rejection entered: the move into "sent" still anchors it.
			{ status: 'rejected', history, rejectedAt: 6 * day }
		]);
		expect(stats.response.best).toBe(4);
		expect(stats.response.worst).toBe(8);
	});

	it('measures the response from the send, not from an earlier rejection', () => {
		// Archived as a draft, later sent and turned down: the first "rejected"
		// entry predates the send and must not hide the real response.
		const day = 24 * 60 * 60 * 1000;
		const stats = computeApplicationStats([
			row('rejected', [
				{ status: 'draft', timestamp: 0 },
				{ status: 'rejected', timestamp: 1 * day },
				{ status: 'sent', timestamp: 2 * day },
				{ status: 'rejected', timestamp: 6 * day }
			])
		]);
		expect(stats.response.count).toBe(1);
		expect(stats.response.avg).toBe(4);
	});

	it('ignores response time when the response event precedes the sent event (bad/out-of-order data)', () => {
		const day = 24 * 60 * 60 * 1000;
		const stats = computeApplicationStats([
			row('interview', [
				{ status: 'interview', timestamp: 0 },
				{ status: 'sent', timestamp: 2 * day }
			])
		]);
		expect(stats.response.count).toBe(0);
	});

	it('counts in calendar days, whatever the hour (#59)', () => {
		const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
		const stats = computeApplicationStats([
			// Applied on 1 Oct (entered, noon), turned down on 5 Oct in the evening.
			{
				status: 'rejected',
				history: [{ status: 'rejected', timestamp: at(5, 21) }],
				sentAt: at(1, 12)
			},
			// Entered as sent today (noon), turned down the same morning.
			{
				status: 'rejected',
				history: [
					{ status: 'sent', timestamp: at(14, 8) },
					{ status: 'rejected', timestamp: at(14, 10) }
				],
				sentAt: at(14, 12)
			}
		]);
		expect(stats.response.count).toBe(2);
		expect(stats.response.worst).toBe(4);
		expect(stats.response.best).toBe(0);
	});

	it('times only real answers: an offer counts, waiting does not', () => {
		const day = 24 * 60 * 60 * 1000;
		const stats = computeApplicationStats([
			row('accepted', [
				{ status: 'sent', timestamp: 0 },
				{ status: 'accepted', timestamp: 3 * day }
			]),
			row('sent', [{ status: 'sent', timestamp: 0 }])
		]);
		expect(stats.response.count).toBe(1);
		expect(stats.response.avg).toBe(3);
	});

	it('excludes applications with no history from response-time stats without crashing', () => {
		const stats = computeApplicationStats([row('draft', []), row('sent', [])]);
		expect(stats.response.count).toBe(0);
		expect(stats.response.avg).toBe(0);
	});
});
