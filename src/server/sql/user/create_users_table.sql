/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY NOT NULL,
  username VARCHAR(254) UNIQUE,
  password_hash CHAR(60) NOT NULL,
  role user_type NOT NULL,
  note TEXT DEFAULT '',
  image TEXT DEFAULT '',
  mobile_no VARCHAR(20),
  email VARCHAR(254),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT
)
