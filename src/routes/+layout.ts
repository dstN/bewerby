// bewerby is a 100%-local app: every route renders from Dexie/IndexedDB in
// the browser, so there is nothing for the server to render per request.
// Disabling SSR and prerendering instead turns each route into a static HTML
// shell built once - fixing the previous "SSR renders an empty shell, then
// hydrates" cost on every cold load, and giving the service worker (#3) an
// actual document to precache and serve offline.
export const ssr = false;
export const prerender = true;
