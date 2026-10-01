/// <reference lib="webworker" />
import { runArgon2, type Argon2Input } from './argon2.js';

// Argon2id with 64 MiB takes about a second on a phone. On the main thread
// that second freezes the page - including the "working" message that
// tells a screen reader user something is happening.
self.onmessage = async (event: MessageEvent<Argon2Input>) => {
	try {
		const out = await runArgon2(event.data);
		self.postMessage(out, [out.buffer]);
	} catch {
		self.postMessage(null);
	}
};
