/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const database = require('./database');
const sqlFile = database.sqlFile;

class MqttSource {
	/**
	 * Returns a promise to create the mqtt_sources table.
	 * @param conn the connection to use
	 * @returns {Promise.<>}
	 */
	static createTable(conn) {
		return conn.none(sqlFile('mqtt/create_mqtt_sources_table.sql'));
	}
}

module.exports = MqttSource;
