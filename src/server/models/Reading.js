/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const database = require('./database');
const { mapToObject, threeDHoleAlgorithm } = require('../util');
const determineMaxPoints = require('../util/determineMaxPoints');
const log = require('../log');
const { all } = require('axios');

const sqlFile = database.sqlFile;

class Reading {
	/**
	 * Creates a new reading
	 * @param meterID
	 * @param reading
	 * @param {Moment} startTimestamp
	 * @param {Moment} endTimestamp
	 */
	constructor(meterID, reading, startTimestamp, endTimestamp) {
		this.meterID = meterID;
		this.reading = reading;
		this.startTimestamp = startTimestamp;
		this.endTimestamp = endTimestamp;
	}

	/**
	 * Returns a promise to create the readings table.
	 * @param conn the database connection to use
	 * @returns {Promise.<>}
	 */
	static createTable(conn) {
		return conn.none(sqlFile('reading/create_readings_table.sql'));
	}

	/**
	 * Returns a promise to create the function and materialized views that aggregate
	 * readings by various time intervals.
	 * @param conn the database connection to use
	 * @returns {Promise<void>}
	 */
	static createReadingsMaterializedViews(conn) {
		return conn.none(sqlFile('reading/create_reading_views.sql'));
	}

	/**
	 * Returns a promise to create the compare function
	 * @param conn the database connection to use
	 */
	static createCompareReadingsFunction(conn) {
		return conn.none(sqlFile('reading/create_function_get_compare_readings.sql'));
	}

	/**
	 * Returns a promise to create the reading_line_accuracy type.
	 * This needs to be run before Reading.createTable().
	 * @param conn the connection to use
	 * @return {Promise<void>}
	 */
	static createReadingLineAccuracyEnum(conn) {
		return conn.none(sqlFile('reading/create_reading_line_accuracy_enum.sql'));
	}

	/**
	 * Returns a promise to create the 3D readings function
	 * @param conn the database connection to use
	 */
	static create3DReadingsFunction(conn) {
		return conn.none(sqlFile('reading/create_function_get_3d_readings.sql'));
	}

	/**
	 * Refreshes the daily readings view.
	 * Should be called at least once a day, preferably in the middle of the night.
	 * @param conn The connection to use
	 * @returns {Promise<void>}
	 */
	static refreshDailyReadings(conn) {
		// This can't be a function because you can't call REFRESH inside a function
		return conn.none('REFRESH MATERIALIZED VIEW CONCURRENTLY daily_readings_unit');
	}


	/**
	 * Refreshes the hourly readings view.
	 * Should be called at least once a day but need to do hourly if the site wants zooming in
	 * to see hourly data as it is available. This function can take more time than refreshing
	 * the daily readings so be sure calling it more frequently does not impact the
	 * server response time. If only called once a day, then probably best to do so in the middle
	 * of the night as suggested for daily refresh.
	 * @param conn The connection to use
	 * @returns {Promise<void>}
	 */
	static refreshHourlyReadings(conn) {
		// This can't be a function because you can't call REFRESH inside a function
		// TODO This will be removed once we completely transition to the unit version.
		return conn.none('REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_readings_unit');
	}

	/**
	 * Because moment allows modification of its values, this creates a new Reading where all the timestamps
	 * are cloned so they cannot change unless you modify this new one.
	 * 
	 * @returns a duplicate of the reading where the moment timestamps are cloned so cannot change.
	 */
	clone() {
		return new Reading(this.meterID, this.reading, this.startTimestamp.clone(), this.endTimestamp.clone());
	}

	/**
	 * Change a row from the readings table into a Reading object.
	 * @param row The row from the table to be changed.
	 * @returns Reading object from row
	 */
	static mapRow(row) {
		return new Reading(row.meter_id, row.reading, row.start_timestamp, row.end_timestamp);
	}

	/**
	 * Returns the number of readings which exist in the database, total.
	 * @param conn the connection to use
	 * @returns {number} the number of readings in the entire readings table
	 */
	static async count(conn) {
		const { count } = await conn.one('SELECT COUNT(*) as count FROM readings');
		return parseInt(count);
	}

	/**
	 * Returns a promise to insert all of the given readings into the database (as a transaction)
	 * @param {array<Reading>} readings the readings to insert
	 * @param conn is the connection to use.
	 * @returns {Promise.<>}
	 */
	static insertAll(readings, conn) {
		return conn.tx(t => t.sequence(function seq(i) {
			const seqT = this;
			return readings[i] && readings[i].insert(seqT);
		}));
	}

	/**
	 * Returns a promise to insert or update all of the given readings into the database (as a transaction)
	 * @param {array<Reading>} readings the readings to insert or update
	 * @param conn is the connection to use.
	 * @returns {Promise.<>}
	 */
	static insertOrUpdateAll(readings, conn) {
		return conn.tx(t => t.sequence(function seq(i) {
			const seqT = this;
			return readings[i] && readings[i].insertOrUpdate(seqT);
		}));
	}

	/**
	 * Returns a promise to insert or ignore all of the given readings into the database (as a transaction)
	 * @param {array<Reading>} readings the readings to insert or update
	 * @param conn is the connection to use.
	 * @returns {Promise<any>}
	 */
	static insertOrIgnoreAll(readings, conn) {
		return conn.tx(t => t.sequence(function seq(i) {
			const seqT = this;
			return readings[i] && readings[i].insertOrIgnore(seqT);
		}));
	}

	/**
	 * Returns the count(number of rows) for a meter
	 * @param meterID 
	 * @param conn 
	 */
	static async getCountByMeterIDAndDateRange(meterID, startDate, endDate, conn) {
		const row = await conn.any(sqlFile('reading/get_count_by_meter_id_and_date_range.sql'), {
			meterID: meterID,
			startDate: startDate,
			endDate: endDate
		});
		return parseInt(row[0].count);
	}

	/**
	 * Returns a promise to get all of the readings for this meter from the database.
	 * @param meterID The id of the meter to find readings for
	 * @param conn is the connection to use.
	 * @returns {Promise.<array.<Reading>>}
	 */
	static async getAllByMeterID(meterID, conn) {
		const rows = await conn.any(sqlFile('reading/get_all_readings_by_meter_id.sql'), { meterID: meterID });
		return rows.map(Reading.mapRow);
	}

	/**
	 * Returns a promise to get all of the readings (so raw) for this meter within (inclusive) a specified date range from the
	 * database. If no startDate is specified, all readings from the beginning of time to the endDate are returned.
	 * If no endDate is specified, all readings after and including the startDate are returned.
	 * @param meterID
	 * @param {Date} startDate
	 * @param {Date} endDate
	 * @param conn is the connection to use.
	 * @returns {Promise.<array.<Reading>>}
	 */
	static async getReadingsByMeterIDAndDateRange(meterID, startDate, endDate, conn) {
		const rows = await conn.any(sqlFile('reading/get_readings_by_meter_id_and_date_range.sql'), {
			meterID: meterID,
			startDate: startDate,
			endDate: endDate
		});
		// This does not do the usual row mapping because the identifiers are not the usual ones and there
		// is no meter id. All this is to make the data smaller.
		return rows;
	}

	/**
	 * Returns a promise to insert this reading into the database.
	 * @param conn is the connection to use.
	 * @returns {Promise.<>}
	 */
	insert(conn) {
		return conn.none(sqlFile('reading/insert_new_reading.sql'), this);
	}

	/**
	 * Returns a promise to insert this reading into the database, or update it if it already exists.
	 * @param conn is the connection to use.
	 * @returns {Promise.<>}
	 */
	insertOrUpdate(conn) {
		return conn.none(sqlFile('reading/insert_or_update_reading.sql'), this);
	}

	/**
	 * Returns a promise to insert this reading into the database, or ignore it if it already exists.
	 * @param conn is the connection to use.
	 * @returns {Promise.<>}
	 */
	insertOrIgnore(conn) {
		return conn.none(sqlFile('reading/insert_or_ignore_reading.sql'), this);
	}

	static async getLinkedMeterIDs(meterIDs, conn) {
		if (!meterIDs || meterIDs.length === 0) return { map: {}, all: [], reverseMap: {} };
		const rows = await conn.any(`
			SELECT r.id as requested, l.id as linked
			FROM meters r
			JOIN meters l 
			  ON COALESCE(r.logical_meter_id, r.identifier) = COALESCE(l.logical_meter_id, l.identifier)
			WHERE r.id IN ($1:csv)
		`, [meterIDs]);

		const map = {};
		const reverseMap = {};
		for (const id of meterIDs) map[String(id)] = [];
		for (const row of rows) {
			const req = String(row.requested);
			const link = row.linked;
			if (!map[req]) map[req] = [];
			map[req].push(link);
			if (!reverseMap[link]) reverseMap[link] = [];
			if (!reverseMap[link].includes(req)) reverseMap[link].push(req);
		}
		const all = [...new Set(rows.map(r => r.linked))];
		return { map, all: all.length ? all : meterIDs, reverseMap };
	}

	/**
	 * Gets line readings for meters for the given time range
	 * @param meterIDs The meter IDs to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp An optional start point for the time range of readings returned
	 * @param toTimestamp An optional end point for the time range of readings returned
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getMeterLineReadings(meterIDs, graphicUnitId, fromTimestamp = null, toTimestamp = null, conn) {
		// Normalize timestamps so a same-day range returns data for the whole day
		let from = fromTimestamp || '-infinity';
		let to = toTimestamp || 'infinity';

		// Helper to parse Moment or Date/string to Date
		const parseToDate = v => {
			if (!v) return null;
			if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate(); // moment
			const d = new Date(v);
			return isNaN(d.getTime()) ? null : d;
		};

		if (from !== '-infinity' && to !== 'infinity') {
			const fromDate = parseToDate(from);
			const toDate = parseToDate(to);
			if (fromDate && toDate) {
				// If same calendar day, extend `to` to next day's 00:00:00 to include the whole day
				if (fromDate.getFullYear() === toDate.getFullYear() &&
					fromDate.getMonth() === toDate.getMonth() &&
					fromDate.getDate() === toDate.getDate()) {
					toDate.setDate(toDate.getDate() + 1);
				}
				from = fromDate.toISOString();
				to = toDate.toISOString();
			}
		}

		// Use raw point accuracy instead of 'auto' to avoid the materialized views
		// which incorrectly inflate cumulative meter readings by treating them as
		// interval quantities (multiplying by 3600/interval_seconds).
		// Raw mode returns actual reading values with just the CIK conversion applied.

		const linked = await Reading.getLinkedMeterIDs(meterIDs, conn);
		const allMeterLineReadings = await conn.func('meter_line_readings_unit', [linked.all, graphicUnitId, from, to, 'raw', 2000, 1440]);

		const readingsByMeterID = Object.fromEntries(meterIDs.map(id => [String(id), []]));
		for (const row of allMeterLineReadings) {
			for (const req of (linked.reverseMap[row.meter_id] || [])) {
				readingsByMeterID[req].push({ reading_rate: row.reading_rate, min_rate: row.min_rate, max_rate: row.max_rate, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp });
			}
		}
		
		// Sort readings to avoid timeline looping if multiple meters overlap
		for (const id in readingsByMeterID) {
			readingsByMeterID[id].sort((a, b) => new Date(a.start_timestamp) - new Date(b.start_timestamp));
		}
		
		return readingsByMeterID;
	}

	/**
	 * Gets line readings for groups for the given time range
	 * @param groupIDs The group IDs to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp An optional start point for the time range of readings returned
	 * @param toTimestamp An optional end point for the time range of readings returned
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getGroupLineReadings(groupIDs, graphicUnitId, fromTimestamp, toTimestamp, conn) {
		const [maxRawPoints, maxHourlyPoints] = determineMaxPoints();
		const allGroupLineReadings = await conn.func('group_line_readings_unit',
			[groupIDs, graphicUnitId, fromTimestamp || '-infinity', toTimestamp || 'infinity', 'auto', maxHourlyPoints]
		);

		const readingsByGroupID = mapToObject(groupIDs, () => []);
		for (const row of allGroupLineReadings) {
			readingsByGroupID[row.group_id].push(
				{ reading_rate: row.reading_rate, min_rate: row.min_rate || 0, max_rate: row.max_rate || 0, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp }
			);
		}

		// Sort readings by timestamp to prevent graph looping artifacts
		for (const id in readingsByGroupID) {
			readingsByGroupID[id].sort((a, b) => new Date(a.start_timestamp) - new Date(b.start_timestamp));
		}

		return readingsByGroupID;
	}

	/**
	 * Gets barchart readings for the given time range for the given meters
	 * @param meterIDs The meters to get barchart readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp The start of the barchart interval
	 * @param toTimestamp the end of the barchart interval
	 * @param barWidthDays the width of each bar in days
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading: number, start_timestamp: Moment, end_timestamp: Moment}>>>}
	 */
	static async getMeterBarReadings(meterIDs, graphicUnitId, fromTimestamp, toTimestamp, barWidthDays, conn) {
		let from = fromTimestamp || '-infinity';
		let to = toTimestamp || 'infinity';

		const parseToDate = v => {
			if (!v) return null;
			if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate(); // moment
			const d = new Date(v);
			return isNaN(d.getTime()) ? null : d;
		};

		if (from !== '-infinity' && to !== 'infinity') {
			const fromDate = parseToDate(from);
			const toDate = parseToDate(to);
			if (fromDate && toDate) {
				// If same calendar day, extend `to` to next day's 00:00:00 to include the whole day
				if (fromDate.getFullYear() === toDate.getFullYear() &&
					fromDate.getMonth() === toDate.getMonth() &&
					fromDate.getDate() === toDate.getDate()) {
					toDate.setDate(toDate.getDate() + 1);
				}
				from = fromDate.toISOString();
				to = toDate.toISOString();
			} else {
				if (fromTimestamp && typeof fromTimestamp.toISOString === 'function') from = fromTimestamp.toISOString();
				if (toTimestamp && typeof toTimestamp.toISOString === 'function') to = toTimestamp.toISOString();
			}
		} else {
			if (fromTimestamp && typeof fromTimestamp.toISOString === 'function') from = fromTimestamp.toISOString();
			if (toTimestamp && typeof toTimestamp.toISOString === 'function') to = toTimestamp.toISOString();
		}

		const linked = await Reading.getLinkedMeterIDs(meterIDs, conn);
		const allBarReadings = await conn.func('meter_bar_readings_unit', [linked.all, graphicUnitId, barWidthDays, from, to]);
		const barReadingsByMeterID = mapToObject(meterIDs, () => []);
		for (const row of allBarReadings) {
			for (const req of (linked.reverseMap[row.meter_id] || [])) {
				barReadingsByMeterID[req].push(
					{ reading: row.reading, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp }
				);
			}
		}
		for (const id in barReadingsByMeterID) {
			barReadingsByMeterID[id].sort((a, b) => new Date(a.start_timestamp) - new Date(b.start_timestamp));
		}
		return barReadingsByMeterID;
	}

	/**
	 * Gets barchart readings for the given time range for the given groups
	 * @param groupIDs The groups to get barchart readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp The start of the barchart interval
	 * @param toTimestamp the end of the barchart interval
	 * @param barWidthDays the width of each bar in days
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading: number, start_timestamp: Moment, end_timestamp: Moment}>>>}
	 */
	static async getGroupBarReadings(groupIDs, graphicUnitId, fromTimestamp, toTimestamp, barWidthDays, conn) {
		let from = fromTimestamp || '-infinity';
		let to = toTimestamp || 'infinity';

		const parseToDate = v => {
			if (!v) return null;
			if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate(); // moment
			const d = new Date(v);
			return isNaN(d.getTime()) ? null : d;
		};

		if (from !== '-infinity' && to !== 'infinity') {
			const fromDate = parseToDate(from);
			const toDate = parseToDate(to);
			if (fromDate && toDate) {
				// If same calendar day, extend `to` to next day's 00:00:00 to include the whole day
				if (fromDate.getFullYear() === toDate.getFullYear() &&
					fromDate.getMonth() === toDate.getMonth() &&
					fromDate.getDate() === toDate.getDate()) {
					toDate.setDate(toDate.getDate() + 1);
				}
				from = fromDate.toISOString();
				to = toDate.toISOString();
			} else {
				if (fromTimestamp && typeof fromTimestamp.toISOString === 'function') from = fromTimestamp.toISOString();
				if (toTimestamp && typeof toTimestamp.toISOString === 'function') to = toTimestamp.toISOString();
			}
		} else {
			if (fromTimestamp && typeof fromTimestamp.toISOString === 'function') from = fromTimestamp.toISOString();
			if (toTimestamp && typeof toTimestamp.toISOString === 'function') to = toTimestamp.toISOString();
		}

		const allBarReadings = await conn.func('group_bar_readings_unit', [groupIDs, graphicUnitId, barWidthDays, from, to]);
		const barReadingsByGroupID = mapToObject(groupIDs, () => []);
		for (const row of allBarReadings) {
			barReadingsByGroupID[row.group_id].push(
				{ reading: row.reading, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp }
			);
		}
		return barReadingsByGroupID;
	}

	/**
	 * Gets compare chart readings for the given time range and shift for the given meters
	 * @param meterIDs The meters to get compare chart readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param {Moment} currStartTimestamp start of current/this compare period
	 * @param {Moment} currEndTimestamp end of current/this compare period
	 * @param {Duration} compareShift how far to shift back in time from current period to previous period
	 * @param conn the connection to use.
	 * @returns {Promise<void>}
	 */
	static async getMeterCompareReadings(meterIDs, graphicUnitId, currStartTimestamp, currEndTimestamp, compareShift, conn) {
		const linked = await Reading.getLinkedMeterIDs(meterIDs, conn);
		const allCompareReadings = await conn.func(
			'meter_compare_readings_unit',
			[linked.all, graphicUnitId, currStartTimestamp, currEndTimestamp, compareShift.toISOString()]);
		const compareReadingsByMeterID = {};
		for (const row of allCompareReadings) {
			for (const req of (linked.reverseMap[row.meter_id] || [])) {
				if (!compareReadingsByMeterID[req]) {
					compareReadingsByMeterID[req] = { curr_use: 0, prev_use: 0 };
				}
				compareReadingsByMeterID[req].curr_use += (row.curr_use || 0);
				compareReadingsByMeterID[req].prev_use += (row.prev_use || 0);
			}
		}
		return compareReadingsByMeterID;
	}

	/**
	 * Gets compare chart readings for the given time range and shift for the given groups
	 * @param groupIDs The groups to get compare chart readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param {Moment} currStartTimestamp start of current/this compare period
	 * @param {Moment} currEndTimestamp end of current/this compare period
	 * @param {Duration} compareShift how far to shift back in time from current period to previous period
	 * @param conn the connection to use.
	 * @returns {Promise<void>}
	 */
	static async getGroupCompareReadings(groupIDs, graphicUnitId, currStartTimestamp, currEndTimestamp, compareShift, conn) {
		const allCompareReadings = await conn.func(
			'group_compare_readings_unit',
			[groupIDs, graphicUnitId, currStartTimestamp, currEndTimestamp, compareShift.toISOString()]);
		const compareReadingsByGroupID = {};
		for (const row of allCompareReadings) {
			compareReadingsByGroupID[row.group_id] = {
				curr_use: row.curr_use,
				prev_use: row.prev_use
			};
		}
		return compareReadingsByGroupID;
	}

	/**
	 * Gets radar line readings for meters for the given time range
	 * @param meterIDs The meter IDs to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp An optional start point for the time range of readings returned
	 * @param toTimestamp An optional end point for the time range of readings returned
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getMeterRadarReadings(meterIDs, graphicUnitId, fromTimestamp = null, toTimestamp = null, conn) {
		const [maxRawPoints, maxHourlyPoints] = determineMaxPoints();
		/**
		 * @type {array<{meter_id: int, reading_rate: Number, max_rate: Number, min_rate: Number, start_timestamp: Moment, end_timestamp: Moment}>}
		 */
		const linked = await Reading.getLinkedMeterIDs(meterIDs, conn);
		//Using the same data from meter line readings because they are identical to radar readings.
		const allMeterRadarReadings = await conn.func('meter_line_readings_unit',
			[linked.all, graphicUnitId, fromTimestamp || '-infinity', toTimestamp || 'infinity', 'auto', maxRawPoints, maxHourlyPoints]
		);
		const radarReadingsByMeterID = mapToObject(meterIDs, () => []);
		for (const row of allMeterRadarReadings) {
			for (const req of (linked.reverseMap[row.meter_id] || [])) {
				radarReadingsByMeterID[req].push(
					{ reading_rate: row.reading_rate, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp }
				);
			}
		}
		for (const id in radarReadingsByMeterID) {
			radarReadingsByMeterID[id].sort((a, b) => new Date(a.start_timestamp) - new Date(b.start_timestamp));
		}
		return radarReadingsByMeterID;
	}

	/**
	 * Gets radar readings for groups for the given time range
	 * @param groupIDs The group IDs to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp An optional start point for the time range of readings returned
	 * @param toTimestamp An optional end point for the time range of readings returned
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getGroupRadarReadings(groupIDs, graphicUnitId, fromTimestamp, toTimestamp, conn) {
		// maxRawPoints is not used for groups.
		const [maxRawPoints, maxHourlyPoints] = determineMaxPoints();
		/**
		 * @type {array<{group_id: int, reading_rate: Number, start_timestamp: Moment, end_timestamp: Moment}>}
		 */
		//Using the same data from group line readings because they are identical to group radar readings.
		const allGroupRadarReadings = await conn.func('group_line_readings_unit',
			[groupIDs, graphicUnitId, fromTimestamp, toTimestamp, 'auto', maxHourlyPoints]
		);

		const radarReadingsByGroupID = mapToObject(groupIDs, () => []);
		for (const row of allGroupRadarReadings) {
			radarReadingsByGroupID[row.group_id].push(
				{ reading_rate: row.reading_rate, start_timestamp: row.start_timestamp, end_timestamp: row.end_timestamp }
			);
		}
		return radarReadingsByGroupID;
	}

	/**
	 * Gets hour or multiple hour readings for meters for the given time range
	 * @param meterIDs The meter IDs to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp Start point for the time range of readings returned
	 * @param toTimestamp End point for the time range of readings returned
	 * @param readingInterval number of hours per reading
	 * @param conn the connection to use.
	 * @return {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getThreeDReadings(meterIDs, graphicUnitId, fromTimestamp, toTimestamp, readingInterval, conn) {
		/**
		 * @type {array<{meter_id: int, reading_rate: Number, start_timestamp: Moment, end_timestamp: Moment}>}
		*/
		const linked = await Reading.getLinkedMeterIDs(meterIDs, conn);
		const allMeterThreeDReadings = await conn.func('meter_3d_readings_unit', [linked.all, graphicUnitId, fromTimestamp, toTimestamp, readingInterval]);
		
		const mergedThreeD = [];
		for (const row of allMeterThreeDReadings) {
			for (const req of (linked.reverseMap[row.meter_id] || [])) {
				mergedThreeD.push({
					meter_id: Number(req),
					reading_rate: row.reading_rate,
					start_timestamp: row.start_timestamp,
					end_timestamp: row.end_timestamp
				});
			}
		}

		mergedThreeD.sort((a, b) => new Date(a.start_timestamp) - new Date(b.start_timestamp));
		const meterThreeDData = threeDHoleAlgorithm(mergedThreeD, fromTimestamp, toTimestamp);
		return meterThreeDData;
	}

	/**
	 * Gets hour or multiple hour readings for groups for the given time range
	 * @param groupID The group ID to get readings for
	 * @param graphicUnitId The unit id that the reading should be returned in, i.e., the graphic unit
	 * @param fromTimestamp Start point for the time range of readings returned
	 * @param toTimestamp End point for the time range of readings returned
	 * @param readingInterval rate of hours per reading
	 * @param conn the connection to use.
	 * @returns {Promise<object<int, array<{reading_rate: number, start_timestamp: }>>>}
	 */
	static async getGroupThreeDReadings(groupID, graphicUnitId, fromTimestamp, toTimestamp, readingInterval, conn) {
		/**
		 * @type {array<{group_id: int, reading_rate: Number, start_timestamp: Moment, end_timestamp: Moment}>}
		 */
		const allGroupThreeDReadings = await conn.func('group_3d_readings_unit', [groupID, graphicUnitId, fromTimestamp, toTimestamp, readingInterval]);
		const groupThreeDData = threeDHoleAlgorithm(allGroupThreeDReadings, fromTimestamp, toTimestamp);
		return groupThreeDData;
	}

	toString() {
		return `Reading [id: ${this.meterID}, reading: ${this.reading}, startTimestamp: ${this.startTimestamp}, endTimestamp: ${this.endTimestamp}]`;
	}
}

module.exports = Reading;
