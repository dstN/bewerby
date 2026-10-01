import type { Handle } from '@sveltejs/kit/hooks';

// Every *page* route is prerendered (see src/routes/+layout.ts), and
// adapter-node serves prerendered pages through a static-file fast path that
// never invokes this hook - verified empirically by adding a logging
// handle() and confirming it never fires for a request to any of them. The
// headers that reach a browser for those come from .htaccess instead (see
// project root), which applies at the Apache/Passenger level regardless of
// how the Node backend served the bytes.
//
// This hook was written as future-proofing for "the moment any route stops
// being prerendered (a dynamic API endpoint, for instance)". That moment
// arrived: /api/fetch-ad sets `prerender = false`, so this is now the code
// that actually sets the headers on that response.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
	);
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
	}

	return response;
};
