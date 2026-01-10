/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Conversion = require('../../models/Conversion');
const Unit = require('../../models/Unit');

/**
 * Ensures all necessary conversions exist for meter to graphic unit conversions.
 * This is called after database initialization to persist conversions across restarts.
 * @param {*} conn Database connection
 */
async function ensureConversionsExist(conn) {
	try {
		// Define required standard conversions for your system
		const requiredConversions = [
			{
				sourceName: 'Electric_Utility',
				destinationName: 'kWh',
				bidirectional: false,
				slope: 1,
				intercept: 0,
				note: 'Electric_Utility → kWh'
			},
			{
				sourceName: 'Electric_Utility',
				destinationName: 'kW',
				bidirectional: false,
				slope: 1,
				intercept: 0,
				note: 'Electric_Utility → kW'
			}
		];

		// Get all existing conversions
		const existingConversions = await Conversion.getAll(conn);
		
		// Check which conversions already exist
		for (const reqConversion of requiredConversions) {
			const sourceId = await getUnitId(reqConversion.sourceName, conn);
			const destinationId = await getUnitId(reqConversion.destinationName, conn);

			const exists = existingConversions.some(existing =>
				existing.sourceId === sourceId &&
				existing.destinationId === destinationId
			);

			if (!exists && sourceId && destinationId) {
				// Create conversion object with IDs instead of names
				const conversion = new Conversion(
					sourceId,
					destinationId,
					reqConversion.bidirectional,
					reqConversion.slope,
					reqConversion.intercept,
					reqConversion.note
				);

				await conversion.insert(conn);
				console.log(`Created conversion: ${reqConversion.sourceName} → ${reqConversion.destinationName}`);
			}
		}

		console.log('Conversion initialization complete');
	} catch (error) {
		console.error('Error initializing conversions:', error.message);
		// Don't throw - this shouldn't break startup if conversions exist
	}
}

/**
 * Get unit ID by name
 * @param {string} unitName
 * @param {*} conn
 * @returns {number|null}
 */
async function getUnitId(unitName, conn) {
	try {
		const result = await conn.oneOrNone(
			'SELECT id FROM units WHERE name = $1',
			[unitName]
		);
		return result ? result.id : null;
	} catch (error) {
		console.error(`Error getting unit ID for ${unitName}:`, error.message);
		return null;
	}
}

module.exports = {
	ensureConversionsExist
};
