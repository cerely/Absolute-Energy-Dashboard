/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

-- Add a temporary column with the new type
ALTER TABLE preferences 
    ADD COLUMN default_meter_disable_checks_temp disable_checks_type NOT NULL DEFAULT 'reject_all';

-- Update the temporary column based on the current boolean values in disable_checks
UPDATE preferences
SET default_meter_disable_checks_temp = 
    CASE 
        WHEN default_meter_disable_checks = true THEN 'reject_none'::disable_checks_type
        WHEN default_meter_disable_checks = false THEN 'reject_all'::disable_checks_type
    END;

-- Drop the old column
ALTER TABLE preferences 
    DROP COLUMN default_meter_disable_checks;

-- Rename the temporary column to the original column name
ALTER TABLE preferences 
    RENAME COLUMN default_meter_disable_checks_temp TO default_meter_disable_checks;

