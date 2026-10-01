import { argon2id } from 'hash-wasm';

export interface Argon2Input {
	password: string;
	salt: Uint8Array;
	/** Memory in KiB. */
	m: number;
	t: number;
	p: number;
}

/**
 * The one place Argon2id runs - imported by the worker in the browser and
 * called directly where there is no Worker (Vitest under Node). WebCrypto has
 * no Argon2 yet (WICG webcrypto-modern-algos proposes it); hash-wasm is
 * checked against Node's native implementation in vault.test.ts.
 */
export async function runArgon2(input: Argon2Input): Promise<Uint8Array<ArrayBuffer>> {
	const out = await argon2id({
		password: input.password,
		salt: input.salt,
		parallelism: input.p,
		iterations: input.t,
		memorySize: input.m,
		hashLength: 32,
		outputType: 'binary'
	});
	return new Uint8Array(out);
}
