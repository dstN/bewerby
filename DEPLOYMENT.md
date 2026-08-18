# Deployment Runbook — Netcup / Plesk (Phusion Passenger)

This describes how to get bewerby running on Netcup webhosting via Plesk's
Node.js (Phusion Passenger) support. It has been written from the actual
build output and from Phusion Passenger's own source/documentation, but has
**not** been exercised against a live Netcup/Plesk instance — verify each
step on first deploy and adjust if your panel's exact field names differ.

## Architecture: two roots, not one

Passenger needs two _separate_ directories, and getting this wrong is a real
security issue, not just a style preference:

| Concept                                   | Points at        | Contains                                                |
| ----------------------------------------- | ---------------- | ------------------------------------------------------- |
| **Application Root** (`PassengerAppRoot`) | the project root | `app.cjs`, `package.json`, `build/`                     |
| **Document Root**                         | `build/client/`  | only the prerendered HTML + fingerprinted static assets |

Apache serves any file that physically exists under Document Root directly,
**bypassing Passenger/Node entirely** — this is documented, standard
Passenger behavior ("static assets are accelerated", see
[Passenger's Node.js troubleshooting guide](https://www.phusionpassenger.com/library/admin/apache/troubleshooting/nodejs/)
and the canonical deploy layout in
[Passenger's Node.js deploy guide](https://www.phusionpassenger.com/library/deploy/apache/deploy/nodejs/),
both of which set `DocumentRoot` to the app's `public`-equivalent
subdirectory while the application root stays one level up).

If Document Root were set to the project root instead, requests like
`GET /package.json`, `GET /.git/config`, or `GET /src/lib/db/index.ts` would
be served as plain static files — publishing source code and internals to
every visitor. Plesk's Node.js panel exposes "Application Root" and
"Document Root" as two distinct fields for exactly this reason; as of this
writing Plesk does not warn if both are left identical (there's an
[open feature request for that warning](https://talk.plesk.com/threads/add-warning-when-document-root-equals-application-root-in-node-js-apps.391992/)),
so this is an easy, real misconfiguration to make, not a hypothetical one.

## Why the startup file is `app.cjs`, not `app.js`

Passenger's Node.js loader (`node-loader.js`) loads the startup file via
`require()` internally — confirmed directly from Passenger's source. Since
this project's `package.json` sets `"type": "module"`, a plain `app.js` would
be treated as an ES module, and `require()` cannot load an ES module (Node
throws `ERR_REQUIRE_ESM`). This is not version-gated and has never been
fixed in Passenger (a 2021 attempt, phusion/passenger#2366, was closed
unmerged because the alternative approach it tried broke the HTTP handoff).

The `.cjs` extension forces Node to treat `app.cjs` as CommonJS regardless of
`package.json`'s `"type"` field, so `require()` can load it; it then reaches
the real ESM build output via a dynamic `import()`, which is valid inside a
CommonJS file. Do not rename it back to `app.js` or change the extension.

## What actually needs to be on the server

The build output is fully self-contained: `build/index.js` and everything it
imports reference only Node's own built-in modules (`node:http`, `node:fs`,
`node:crypto`, …) and the app's own bundled chunk files — verified by
grepping the built output for bare package imports and finding none. **No
`node_modules` directory is needed on the server at all.** Upload only:

- `app.cjs`
- `build/` (the entire directory — `client/`, `server/`, `prerendered/`,
  `index.js`, `handler.js`, `env.js`, `shims.js`, and their `.map` files)
- `.htaccess` (Application Root config)
- `package.json` (Passenger reads this for app metadata)

Do **not** upload `node_modules/`, `src/`, `.git/`, `static/` (already
merged into `build/client/` by the build), or any of the dev-only config
files (`vite.config.ts`, `eslint.config.js`, `tsconfig.json`, …). Keeping
these off the server entirely is a second, independent layer of protection
on top of the Document Root fix above — belt and suspenders, not a
replacement for it.

## First-time setup (Plesk panel)

1. Under the domain's **Node.js** settings, set:
   - **Application Root**: the directory you'll upload the project to
     (e.g. `/bewerby`)
   - **Document Root**: `/bewerby/build/client` — a subdirectory of
     Application Root, never the same path
   - **Application Startup File**: `app.cjs`
   - **Node.js version**: 20 or newer (see `package.json`'s `engines` field)
2. Confirm `mod_headers`, `mod_rewrite`, `mod_expires` and `mod_mime` are
   enabled for the vhost — `build/client/.htaccess` (generated from
   `static/.htaccess`) depends on all four for security headers, the
   pre-compressed asset rewrite rules, and cache-control.
3. If Plesk's panel doesn't directly expose a raw Node.js path, `.htaccess`'s
   commented-out `PassengerNodejs` directive documents the fallback: find the
   binary via `which node` over SSH.

## Build & deploy

```sh
# 1. Build locally (or in CI) - never build directly on the shared host.
npm ci
npm run lint && npm run check
npm run build

# 2. Upload app.cjs, build/, .htaccess, and package.json to Application Root.
#    Do not upload node_modules/, src/, or any dotfiles beyond .htaccess.

# 3. Restart the Passenger application (Plesk: "Restart App" button, or
#    touch tmp/restart.txt under Application Root if your panel uses that
#    convention).

# 4. Smoke-test: load the site, confirm the four routes (/, /analytics,
#    /backup, /settings) return the prerendered shell, and check the
#    response headers include Content-Security-Policy and X-Frame-Options.
```

## Rollback

Keep the previous `build/` output and `app.cjs` (e.g. as a dated tarball)
before overwriting them on the server. To roll back:

1. Replace `build/` and `app.cjs` at Application Root with the previous
   version's files.
2. Restart the Passenger application the same way as in step 3 above.

Because `build/client/**` under `_app/immutable/` is content-hashed and
cached for a year (`Cache-Control: public, max-age=31536000, immutable` -
see `static/.htaccess`), a rollback that reintroduces old filenames is safe:
nothing serves a mismatched hash, since the prerendered HTML for the rolled-
back version references exactly the immutable filenames that exist in the
rolled-back `build/client/`.

## Known limitations of this runbook

This has been verified against the actual build output and against
Passenger's documented behavior and source code, but **not against a live
Netcup/Plesk deployment** - no such instance was available while writing it.
Specifically unverified:

- Exact Plesk UI field labels/locations may differ by Plesk version.
- Whether Netcup's specific Passenger build enables `mod_rewrite`/
  `mod_expires` by default, or whether they need requesting from support.
- The exact app-restart mechanism Netcup's Plesk exposes.

If any of these differ from what's documented here, please update this file
once verified against the real environment - this is the last update to it
before v1 uses whatever process actually works in production.
