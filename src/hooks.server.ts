import type { Handle } from '@sveltejs/kit';

// Defense in depth / future-proofing: every current route is prerendered
// (see src/routes/+layout.ts), and adapter-node serves prerendered pages
// through a static-file fast path that never invokes this hook - verified
// empirically by adding a logging handle() and confirming it never fires for
// a request to any of the app's routes. The headers that actually reach a
// real deployment come from .htaccess instead (see project root), which
// applies at the Apache/Passenger level regardless of how the Node backend
// served the bytes. This hook exists so the same headers are set correctly
// the moment any route stops being prerendered (a dynamic API endpoint, for
// instance) - it costs nothing to have it right even though it does nothing
// today.
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
