import * as Y from 'yjs';
import { describe, it, expect } from 'vitest';
import { applyChanges, moveTo, newRowMap, readRow, setText, type DocRow } from './schema.js';

const base: DocRow = {
	uid: 'u1',
	title: 'Entwickler',
	company: 'Contoso GmbH',
	url: '',
	salary: '',
	contactName: '',
	contactEmail: '',
	contactPhone: '',
	notes: 'Hallo Welt',
	priority: 'medium',
	status: 'sent',
	tags: ['remote'],
	reminderInterval: 'none',
	createdAt: 1,
	updatedAt: 1,
	history: [{ status: 'sent', timestamp: 1 }]
};

function apps(doc: Y.Doc) {
	return doc.getMap<Y.Map<unknown>>('apps');
}

function row(doc: Y.Doc, uid = 'u1') {
	return readRow(uid, apps(doc).get(uid)!);
}

/** Two-way sync, exactly what two devices exchanging their states do. */
function sync(a: Y.Doc, b: Y.Doc) {
	Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
	Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

/** Two devices that both start from `base`, with fixed client ids. */
function pair(firstId: number, secondId: number) {
	const a = new Y.Doc();
	a.clientID = firstId;
	const b = new Y.Doc();
	b.clientID = secondId;
	apps(a).set(base.uid, newRowMap(base, 1));
	sync(a, b);
	return [a, b] as const;
}

describe('crdt schema', () => {
	it('reads back exactly the row it was given', () => {
		const doc = new Y.Doc();
		apps(doc).set(base.uid, newRowMap({ ...base, cardColor: '#10b981', rejectedAt: 7 }, 1));
		expect(row(doc)).toEqual({ ...base, cardColor: '#10b981', rejectedAt: 7 });
	});

	it('reads back an archived row with its reason and end date (#60)', () => {
		const doc = new Y.Doc();
		const archived: DocRow = {
			...base,
			status: 'archived',
			archiveReason: 'withdrawn',
			archivedAt: 9,
			history: [...base.history, { status: 'archived', timestamp: 2 }]
		};
		apps(doc).set(base.uid, newRowMap(archived, 2));
		expect(row(doc)).toEqual(archived);
	});

	it('shows a status it does not know in the column before it', () => {
		// What a device on an older build sees of a card archived elsewhere:
		// the move and the stored status are skipped, nothing is lost.
		const doc = new Y.Doc();
		apps(doc).set(base.uid, newRowMap(base, 1));
		const map = apps(doc).get(base.uid)!;
		(map.get('history') as Y.Array<unknown>).push([{ status: 'ghosted', timestamp: 2 }]);
		map.set('status', { s: 'ghosted', t: 2 });
		map.set('archiveReason', 'bored');
		expect(row(doc)).toMatchObject({
			status: 'sent',
			history: base.history,
			archiveReason: 'no-response'
		});
	});

	it('keeps both edits when two devices change the notes at the same time', () => {
		const [a, b] = pair(1, 2);
		setText(apps(a).get('u1')!.get('notes') as Y.Text, 'Hallo schöne Welt');
		setText(apps(b).get('u1')!.get('notes') as Y.Text, 'Hallo Welt!');
		sync(a, b);
		expect(row(a).notes).toBe('Hallo schöne Welt!');
		expect(row(b).notes).toBe(row(a).notes);
	});

	it('lets the later move win, whichever device the conflict favours', () => {
		for (const [first, second] of [
			[1, 2],
			[2, 1]
		]) {
			const [a, b] = pair(first, second);
			moveTo(apps(a).get('u1')!, 'interview', 10);
			moveTo(apps(b).get('u1')!, 'rejected', 20);
			sync(a, b);
			expect(row(a).status).toBe('rejected');
			expect(row(b).status).toBe('rejected');
			// Both moves are kept, in the order they happened.
			expect(row(a).history.map((entry) => entry.status)).toEqual([
				'sent',
				'interview',
				'rejected'
			]);
		}
	});

	it('leaves an old row alone whose history stops short of its status', () => {
		// Before 2026-08-18 the edit dialog changed a status without logging it.
		const legacy = {
			...base,
			status: 'rejected' as const,
			history: [{ status: 'draft' as const, timestamp: 1 }]
		};
		const doc = new Y.Doc();
		apps(doc).set(legacy.uid, newRowMap(legacy, 5));
		expect(row(doc).status).toBe('rejected');
	});

	it('keeps tags both devices added, once each', () => {
		const [a, b] = pair(1, 2);
		applyChanges(apps(a).get('u1')!, { tags: ['remote', 'berlin'] });
		applyChanges(apps(b).get('u1')!, { tags: ['remote', 'berlin', 'teilzeit'] });
		sync(a, b);
		expect([...row(a).tags].sort()).toEqual(['berlin', 'remote', 'teilzeit']);
		expect(row(b).tags).toEqual(row(a).tags);
	});

	it('writes nothing for a value that did not change', () => {
		const doc = new Y.Doc();
		apps(doc).set(base.uid, newRowMap(base, 1));
		let updates = 0;
		doc.on('update', () => updates++);
		applyChanges(apps(doc).get('u1')!, { title: base.title, notes: base.notes, tags: base.tags });
		expect(updates).toBe(0);
	});

	it('drops a field set to undefined', () => {
		const doc = new Y.Doc();
		apps(doc).set(base.uid, newRowMap({ ...base, cardColor: '#10b981' }, 1));
		applyChanges(apps(doc).get('u1')!, { cardColor: undefined });
		expect(row(doc)).not.toHaveProperty('cardColor');
	});

	it('turns whatever another device wrote into a valid row', () => {
		const doc = new Y.Doc();
		const map = new Y.Map<unknown>();
		apps(doc).set('x', map);
		map.set('title', 42);
		map.set('priority', 'urgent');
		map.set('status', { s: 'parked', t: 'soon' });
		map.set('history', Y.Array.from([{ status: 'nope', timestamp: 1 }, 'junk']));
		map.set('tags', 'not-an-array');
		const read = readRow('x', map);
		expect(read).toMatchObject({
			title: '',
			priority: 'medium',
			status: 'draft',
			history: [],
			tags: []
		});
	});
});

describe('crdt convergence', () => {
	it('ends in the same state on every device, whatever order the updates arrive in', () => {
		let seed = 1234;
		const random = () => {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			return seed / 2 ** 31;
		};
		const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
		const docs = [1, 2, 3].map((id) => {
			const doc = new Y.Doc();
			doc.clientID = id;
			return doc;
		});
		const statuses = ['draft', 'sent', 'interview', 'accepted', 'rejected'] as const;
		let created = 0;

		for (let step = 1; step <= 400; step++) {
			const doc = pick(docs);
			const map = apps(doc);
			const uids = [...map.keys()];
			const action = random();
			if (action < 0.15 || uids.length === 0) {
				const uid = `u${++created}`;
				map.set(uid, newRowMap({ ...base, uid, title: `T${created}` }, step));
			} else {
				const uid = pick(uids);
				const target = map.get(uid)!;
				if (action < 0.25) map.delete(uid);
				else if (action < 0.45) applyChanges(target, { title: `T${step}` });
				else if (action < 0.65) {
					const notes = (target.get('notes') as Y.Text).toString();
					const at = Math.floor(random() * (notes.length + 1));
					setText(
						target.get('notes') as Y.Text,
						notes.slice(0, at) + String(step % 10) + notes.slice(at)
					);
				} else if (action < 0.85) moveTo(target, pick(statuses), step);
				else applyChanges(target, { tags: [...readRow(uid, target).tags, `t${step % 7}`] });
			}
			if (random() < 0.3) sync(pick(docs), pick(docs));
		}

		for (let round = 0; round < 2; round++) {
			sync(docs[0], docs[1]);
			sync(docs[1], docs[2]);
			sync(docs[0], docs[2]);
		}
		const states = docs.map((doc) =>
			JSON.stringify([...apps(doc).keys()].sort().map((uid) => readRow(uid, apps(doc).get(uid)!)))
		);
		expect(states[1]).toBe(states[0]);
		expect(states[2]).toBe(states[0]);
		expect(JSON.parse(states[0]).length).toBeGreaterThan(0);
	});
});
