/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getConnection } = require('../server/db');

/**
 * Simple script to wait for the database to be TRULY ready for queries.
 * Exits with 0 when ready, 1 on temporary errors (to be retried by bash).
 */
(async function waitForDB() {
	const conn = getConnection();
	try {
		await conn.one('SELECT 1');
		console.log('Database is ready for queries.');
		process.exit(0);
	} catch (err) {
		const msg = err.message || String(err);
		console.error(`Database not ready: ${msg}`);
		
		// Map known "starting up" errors to exit code 1 for retry
		if (msg.includes('starting up') || 
		    msg.includes('not yet accepting connections') || 
		    msg.includes('ECONNREFUSED')) {
			process.exit(1);
		}
		
		// For unknown/fatal errors, exit with something else
		process.exit(2);
	}
}());
