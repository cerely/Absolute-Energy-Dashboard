/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

CREATE TABLE IF NOT EXISTS mqtt_sources (
    id SERIAL PRIMARY KEY,
    broker_url VARCHAR(255),
    topic VARCHAR(255),
    client_id VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255),
    filters TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
