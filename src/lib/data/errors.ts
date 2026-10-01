/** Thrown by every write path when the row to change no longer exists. */
export class MissingApplicationError extends Error {
	constructor(readonly id: number) {
		super(`No application row matched id ${id}.`);
		this.name = 'MissingApplicationError';
	}
}
