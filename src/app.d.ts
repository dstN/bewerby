// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// pdfjs-dist ships no .d.ts next to this minified subpath (only the plain
// 'pdfjs-dist' entry point has one, with an identical API). A shorthand
// ambient declaration is required here specifically - TypeScript only lets
// the bodyless form override a specifier that already resolves to a real
// file on disk; a `declare module '...' { export * from 'pdfjs-dist' }`
// re-export is silently ignored once the real .mjs file is found, leaving
// the import untyped again. The call site in pdf.ts casts to
// `typeof import('pdfjs-dist')` to get real types back from this `any`.
declare module 'pdfjs-dist/build/pdf.min.mjs';

export {};
