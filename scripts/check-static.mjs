#!/usr/bin/env node
// Fails the build if static/ contains a file that isn't explicitly allowed.
// static/ is shipped verbatim into build/client and precached by the
// service worker — anything unexpected here becomes public and offline-cached.
// See ROADMAP.md #1 (personal PDFs were shipped this way) and #2 (dead pdf.js
// bundles were shipped this way).
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_DIR = fileURLToPath(new URL('../static', import.meta.url));

const ALLOWED_FILES = new Set(['.gitignore', '.htaccess', 'manifest.json', 'robots.txt']);
// Each allowed directory also fixes what may live inside it, at any depth:
// allowing the directory alone would let a CV dropped into static/fonts/
// ship exactly the way ROADMAP.md #1 describes.
const ALLOWED_DIRS = new Map([
	['fonts', /\.woff2$/],
	['app-icons', /\.(png|svg|ico)$/],
	['screenshots', /\.png$/]
]);

function walk(dir, allowedName) {
	const violations = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		const isRoot = dir === STATIC_DIR;
		if (entry.isDirectory()) {
			const pattern = isRoot ? ALLOWED_DIRS.get(entry.name) : allowedName;
			if (pattern) violations.push(...walk(full, pattern));
			else violations.push(relative(STATIC_DIR, full) + '/');
		} else if (isRoot ? !ALLOWED_FILES.has(entry.name) : !allowedName.test(entry.name)) {
			violations.push(relative(STATIC_DIR, full));
		}
	}
	return violations;
}

const violations = walk(STATIC_DIR);

if (violations.length > 0) {
	console.error('\nBuild guard: unexpected file(s) in static/\n');
	for (const v of violations) console.error('  - static/' + v);
	console.error(
		'\nEverything in static/ is copied verbatim into the client build and precached\n' +
			'by the service worker, i.e. published to every visitor. Only files in the\n' +
			'allowlist (scripts/check-static.mjs) may live there. If this file belongs in\n' +
			'the repo, it does not belong in static/ — move it elsewhere (e.g. test\n' +
			'fixtures under tests/fixtures/). If it is meant to ship, add it to the\n' +
			'allowlist explicitly.\n'
	);
	process.exit(1);
}

console.log('static/ contains only allowed files.');
