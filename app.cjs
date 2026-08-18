/**
 * Phusion Passenger entry point for Netcup/Plesk webhosting.
 *
 * This file MUST be loadable via CommonJS require() - Passenger's Node.js
 * loader (node-loader.js) does exactly that internally, regardless of the
 * "type": "module" in package.json, and require() cannot load an ES module
 * (Node throws ERR_REQUIRE_ESM). Passenger has never fixed this (an attempt,
 * phusion/passenger#2366, was closed unmerged in 2021) and there is no
 * version of Passenger or Node that changes it - it's an architectural limit
 * of how Passenger's loader works, not a compatibility gap to wait out.
 *
 * The .cjs extension forces Node to treat this one file as CommonJS no
 * matter what "type" the nearest package.json declares, which is what makes
 * it require()-able. It then reaches the real (ESM) SvelteKit build output
 * via a dynamic import(), which - unlike a static `import` statement - is
 * valid inside a CommonJS file and returns a promise.
 *
 * Usage on server:
 *   1. npm run build
 *   2. Set "Application Startup File" to "app.cjs" in Plesk's Node.js panel
 *      (NOT app.js)
 *   3. Set "Application Root" to this project's root directory
 *   4. Set "Document Root" to build/client (see DEPLOYMENT.md - this must
 *      NOT be the same as Application Root, or source files become public)
 *   5. Passenger will start this file automatically
 */
async function main() {
	const { handler } = await import('./build/handler.js');
	const { createServer } = await import('node:http');

	const port = process.env.PORT || 3000;

	const server = createServer(handler);

	server.listen(port, () => {
		console.log(`bewerby running on port ${port}`);
	});
}

main().catch((err) => {
	console.error('Failed to start bewerby:', err);
	process.exit(1);
});
