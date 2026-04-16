/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { SemicolonPreference } = require('typescript');
const Unit = require('../../models/Unit');
const { getPath } = require('./createConversionGraph');
const { pathConversion } = require('./pathConversion');

/**
 * Returns the Cik which gives the slope, intercept and suffix name between each meter and unit 
 * where it is NaN, Nan, '' if no conversion.
 * @param {*} graph The conversion graph.
 * @param {*} conn The connection to use.
 * @returns 
 */
async function createCikArray(graph, conn) {
	// Get the vertices associated with the sources (meters) and destinations (units, suffix).
	// We get ALL units that are actually used by meters (regardless of their type_of_unit classification)
	// to ensure we include units like kWh that are used as meter units but classified as type='unit'
	const meterUnitRows = await conn.any(
		`SELECT DISTINCT u.id, u.name, u.unit_represent, u.displayable 
		 FROM units u 
		 WHERE u.id IN (SELECT DISTINCT unit_id FROM meters)`
	);
	const sources = meterUnitRows.map(row => ({
		id: row.id,
		name: row.name,
		unitRepresent: row.unit_represent,
		displayable: row.displayable
	}));
	
	// This excludes units that have displayable none since cannot be graphed.
	const destinations = (await Unit.getTypeUnit(conn)).concat(await Unit.getTypeSuffix(conn));
	// Size of each of these.
	// Create an array to hold the values. Each entry will have integer souce it, integer destination id, double slope,
	// double intercept, and string suffix.
	const c = [];
	for (const source of sources) {
		for (const destination of destinations) {
			const sourceId = source.id;
			const destinationId = destination.id;
			// The shortest path from source to destination.
			const path = getPath(graph, sourceId, destinationId);
			// Check if the path exists.
			if (path !== null) {
				const [slope, intercept] = await pathConversion(path, conn);
				// All suffix units were dealt in src/server/services/graph/handleSuffixUnits.js
				// so all units with suffix have displayable of none.
				// This means this path has a suffix of "" (empty) so it does not matter.
				// The name of any unit associated with a suffix was already set correctly.
				// Thus, we can just use the destination identifier as the unit name.
				c.push({ source: sourceId, destination: destinationId, slope: slope, intercept: intercept });
			} else if (sourceId === destinationId) {
				// Add identity conversion (meter unit to itself) when no conversion path exists
				// This is critical for graphs to render when selecting the native meter unit
				c.push({ source: sourceId, destination: destinationId, slope: 1, intercept: 0 });
			}
		}
	}

	// NEW: Ensure all destination units have an identity mapping in CIK, 
	// even if they are not in 'sources' (not used by any meter).
	// This prevents front-end errors when switching to a unit that 
	// has no active meters but is otherwise valid.
	for (const dest of destinations) {
		const destId = dest.id;
		if (!c.some(item => item.source === destId && item.destination === destId)) {
			c.push({ source: destId, destination: destId, slope: 1, intercept: 0 });
		}
	}

	// TODO: The table in the database for the logical Cik needs to be wiped and these values stored. This code 
	// will be added once the database table for using it to get readings is set.
	// At the moment, we just return the array.
	// WARNING: Currently this function is used to simulate deletion of conversions in conversions.js,
	// if at some point we do change the database when the function is called
	// then we can have an optional parameter to not write to the database. or resolve it however you see fit.
	return c;
}

module.exports = {
	createCikArray
}
