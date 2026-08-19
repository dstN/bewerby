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
			row('rejected')
		]);
		// sent stage = sent + interview + accepted + rejected (draft excluded)
		expect(stats.funnel.sent).toBe(4);
		// selection stage = interview + accepted + rejected (excludes plain "sent")
		expect(stats.funnel.selection).toBe(3);
		expect(stats.funnel.success).toBe(1);
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

	it('ignores response time when the response event precedes the sent event (bad/out-of-order data)', () => {
		const stats = computeApplicationStats([
			row('interview', [
				{ status: 'interview', timestamp: 0 },
				{ status: 'sent', timestamp: 1000 }
			])
		]);
		expect(stats.response.count).toBe(0);
	});

	it('excludes applications with no history from response-time stats without crashing', () => {
		const stats = computeApplicationStats([row('draft', []), row('sent', [])]);
		expect(stats.response.count).toBe(0);
		expect(stats.response.avg).toBe(0);
	});
});
