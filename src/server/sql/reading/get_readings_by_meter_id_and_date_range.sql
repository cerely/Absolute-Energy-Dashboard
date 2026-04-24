/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

-- Gets raw meter readings by id and date range. This is then ordered by time ascending.
-- Timestamps are converted from TIMESTAMPTZ (stored in UTC) to the meter's local timezone
-- so the frontend receives wall-clock-correct, timezone-agnostic strings.
SELECT
  -- Short column names are used to make the data smaller.
  -- There is no meter id as usual for readings since special for raw export.
  r.reading as r,
  r.start_timestamp AT TIME ZONE COALESCE(m.default_timezone_meter, 'UTC') as s,
  r.end_timestamp   AT TIME ZONE COALESCE(m.default_timezone_meter, 'UTC') as e
FROM readings r
JOIN meters m ON m.id = r.meter_id
WHERE r.meter_id = ${meterID}
  AND r.start_timestamp >= COALESCE(${startDate}, '-infinity'::TIMESTAMPTZ)
	AND r.end_timestamp <= COALESCE(${endDate}, 'infinity'::TIMESTAMPTZ)
ORDER BY r.start_timestamp ASC;
