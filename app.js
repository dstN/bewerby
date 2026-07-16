/**
 * Phusion Passenger entry point for Netcup webhosting.
 *
 * This wraps the SvelteKit Node adapter output so Passenger can
 * start the app. Passenger provides the PORT via process.env.PORT.
 *
 * Usage on server:
 *   1. npm run build
 *   2. Set "Application Startup File" to "app.js" in Plesk/Netcup
 *   3. Set "Application Root" to the project directory
 *   4. Passenger will start this file automatically
 */
import { handler } from './build/handler.js';
import { createServer } from 'node:http';

const port = process.env.PORT || 3000;

const server = createServer(handler);

server.listen(port, () => {
	console.log(`bewerby running on port ${port}`);
});
