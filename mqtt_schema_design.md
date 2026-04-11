## 1. Database Schema

### `mqtt_sources` (Immutable Configuration Versions)
Instead of deleting and updating the MQTT target, each topic/broker configuration change triggers an **append-only insertion**.
- `id`: `SERIAL PRIMARY KEY`
- `broker_url`, `topic`, `client_id`, `username`, `password`, `filters`: Credentials and setup metadata.
- `created_at`: Tracks when this version was established.

### `meters` (Entity Tracking & Relationships)
When an MQTT configuration is changed, new `meters` rows are created for the new MQTT topic. This preserves data continuity.
- `id`: `SERIAL PRIMARY KEY`
- `name`: Human-readable name. (Constraint: `UNIQUE (name, mqtt_source_id)`)
- `identifier`: The base tag for the payload (e.g. `MainDevice/Tag`), used dynamically. (Constraint: `UNIQUE (identifier, mqtt_source_id)`)
- `mqtt_source_id`: `INTEGER FOREIGN KEY REFERENCES mqtt_sources(id) ON DELETE SET NULL`
- `logical_meter_id`: `TEXT` acts as the unifying identifier mapping all physical meter iterations together.

### `readings` (Historical Telemetry Logging)
Old readings strictly reference the **frozen** meter entity mapped to the previous `mqtt_source_id`.
- `meter_id`: `INTEGER FOREIGN KEY REFERENCES meters(id)`
- `reading`: `DOUBLE PRECISION`
- `start_timestamp`: `TIMESTAMP`
- `end_timestamp`: `TIMESTAMP`
- (Constraint: `PRIMARY KEY (meter_id, start_timestamp)`)

---

## 2. Application Logic

### A) Handling Topic Change
When the user updates the MQTT settings via the frontend, the backend `POST /api/mqtt` has been updated:
- The system **No longer executes** `TRUNCATE TABLE mqtt_sources CASCADE`. This destructive command was erasing historical records.
- Instead, the backend **inserts** a brand new row mapping the new state, and the daemon intelligently queries `SELECT * FROM mqtt_sources ORDER BY id DESC LIMIT 1`.
- When an MQTT connection is removed (`DELETE /api/mqtt`), a tombstone (an empty mapping) is added rather than destructively truncating.

### B) Handling New MQTT Messages
In `mqttKwhFiltered.js`, the process to register newly discovered meters has evolved:
- `Source Isolation`: Looking up existing meters now strictly evaluates `identifier = $1 AND mqtt_source_id = $2`. This guarantees that old payloads from previous contexts won't mistakenly bleed records.
- `Logical Meter Tracking`: When a meter matching the `identifier` is found to be missing from the active source, the backend queries historically. If previous versions exist with the same identifier, their `logical_meter_id` is adopted. Thus providing an architectural bridge spanning historical variations.

No active data is wiped, telemetry retains original routing identifiers strictly through foreign keys bound safely beneath their original, isolated source versions.
