# Deployment Runbook — Netcup / Plesk (Phusion Passenger)

This describes how to get bewerby running on Netcup webhosting via Plesk's
Node.js (Phusion Passenger) support. It was originally written from Phusion
Passenger's own source/documentation without a live instance to test
against; it has since been exercised against the real bewerby.de host, and
the sections below marked "verified live" reflect what that run actually
found, not just what the docs predicted.

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
  `index.js`, `handler.js`, `adapter-node.js`, and their `.map` files)
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
   - **Node.js version**: 26 - what production runs, and the same version
     as local dev and CI (`package.json`'s `engines` field, `>=26.0.0`).
     Strictly, the server only needs SvelteKit 3's minimum of 22.17: it never
     runs npm at all, only the already-bundled `build/handler.js`, which uses
     nothing beyond Node's own built-in modules (see "What actually needs to
     be on the server"). The `engines` floor is for `npm install`/build (see
     "Build & deploy" below); pdfjs-dist's own install-time floor is lower
     still (`>=22.13`).
2. Confirm `mod_headers`, `mod_rewrite`, `mod_expires` and `mod_mime` are
   enabled for the vhost — `build/client/.htaccess` (generated from
   `static/.htaccess`) depends on all four for security headers, the
   pre-compressed asset rewrite rules, and cache-control.
3. **Do not add `PassengerAppType`/`PassengerStartupFile`/`PassengerNodejs`
   to the Application Root's `.htaccess`.** Verified live: Apache on this
   Netcup/Plesk host rejects Passenger directives in a `.htaccess` file
   (`[core:alert] ... PassengerAppType not allowed here`), which fails
   `.htaccess` parsing entirely and 500s **every** request under the vhost,
   including static files. The panel's Application Root/Document
   Root/Application Startup File/Node.js version fields above are the only
   place to configure this on this host — see "Known limitations" below.

## Build & deploy

```sh
# 1. Build locally (or in CI) - never build directly on the shared host.
#    Requires Node >=26 (package.json's engines field, enforced by
#    .npmrc's engine-strict) - the same version the server runs (see the
#    Node.js version note in "First-time setup" above).
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

## Automated deploy (CI/CD)

`.github/workflows/deploy.yml` runs the steps above automatically on every
successful `CI` run on `master`: it downloads the exact build artifact CI
just tested, uploads it to a staging directory over SSH, activates it with
an atomic directory rename, restarts Passenger, runs a smoke test (the root
page returns real content, `manifest.json`/`service-worker.js`/`robots.txt`
are reachable), verifies the Application Root itself isn't web-readable
(the exact misconfiguration warned about above), and rolls back
automatically if the smoke test fails.

**Secrets** (GitHub → Settings → Environments → `production` - environment
secrets, not repository secrets, so a pushed branch can never read them
without passing the environment's protection rules):

| Secret                | Value                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_HOST`     | `bewerby.de`                                                                                                                                                                                                           |
| `DEPLOY_SSH_USER`     | The Plesk system user for this subscription                                                                                                                                                                            |
| `DEPLOY_SSH_PASSWORD` | That user's password (Netcup exposes no key auth in the panel)                                                                                                                                                         |
| `DEPLOY_PATH`         | `/bewerby.de` - the Application Root. Netcup's SSH is chrooted with the subscription root as `/`, so this is exactly what `pwd` shows after login, not a `/var/www/vhosts/...` path                                    |
| `DEPLOY_DOMAIN`       | `bewerby.de` - host only, for the post-deploy smoke test                                                                                                                                                               |
| `DEPLOY_SSH_HOSTKEY`  | _Optional but recommended._ Output of `ssh-keyscan -t ed25519 bewerby.de`. Without it the deploy trusts whatever key it fetches at connect time, and with password auth a MITM would collect the password in cleartext |

**Verified live**: the first real run against bewerby.de surfaced a genuine
bug in this runbook, not in the workflow — see "Known limitations" below.
Once `.htaccess` was corrected, the pipeline itself (build download, SSH
upload, atomic activation, restart, smoke test) worked as designed. Keep
watching new deploys for assumptions that don't hold; fix the workflow
rather than trusting a green run blindly.

## Rollback

The automated deploy above rolls back on a failed smoke test by itself
(swapping back to `build.prev`) - the steps below are the manual fallback,
e.g. if a bad release passed the smoke test but broke something the smoke
test doesn't check.

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

**Resolved, verified live (first production deploy):** the Application
Root's `.htaccess` originally carried `PassengerAppType node` and
`PassengerStartupFile app.cjs`, on the assumption (from Passenger's generic
Apache docs, written before any live Plesk instance was available) that
`.htaccess` was a valid place to set them as a fallback/documentation aid.
It is not, on this host: Apache's error log showed
`[core:alert] .../.htaccess: PassengerAppType not allowed here`, which
means Apache failed to parse `.htaccess` at all and returned 500 for every
request under the vhost — including static files like `/favicon.ico`, not
just app routes. Plesk's Node.js panel (Application Root, Document Root,
Application Startup File, Node.js version) already configures the
equivalent Passenger settings at the vhost level; `.htaccess` must not
duplicate them. Fixed by removing both directives from `.htaccess` — see
the comment left in that file for the full explanation.

Still unverified against the live host:

- Exact Plesk UI field labels/locations may differ by Plesk version.
- Whether Netcup's specific Passenger build enables `mod_rewrite`/
  `mod_expires` by default, or whether they need requesting from support.
- The exact app-restart mechanism Netcup's Plesk exposes beyond
  `tmp/restart.txt`, which is confirmed to work.

If any of these differ from what's documented here, please update this file
once verified against the real environment.
