/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

SELECT DISTINCT ON (identifier) *
FROM meters
WHERE (mqtt_source_id = (
    SELECT COALESCE(
        (SELECT value::int FROM global_settings WHERE key = 'active_mqtt_source_id'),
        (SELECT id FROM mqtt_sources WHERE broker_url != '' AND broker_url IS NOT NULL ORDER BY id DESC LIMIT 1)
    )

)  OR mqtt_source_id IS NULL)
  AND enabled = true
ORDER BY identifier, id DESC;

