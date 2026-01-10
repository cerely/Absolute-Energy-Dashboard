const mqtt = require('mqtt');
const { getConnection } = require('./db');
const { refreshAllReadingViews } = require('./services/refreshAllReadingViews');

const db = getConnection();

/**
 * Get or create a unit by name
 */
async function getOrCreateUnit(unitName = 'kWh') {
  try {
    let unitRow = await db.oneOrNone(
      `SELECT id FROM units WHERE name = $1`,
      [unitName]
    );
    
    if (!unitRow) {
      unitRow = await db.one(
        `INSERT INTO units (name) VALUES ($1) RETURNING id`,
        [unitName]
      );
      console.log(`Created new unit: ${unitName}, id = ${unitRow.id}`);
    }
    
    return unitRow.id;
  } catch (err) {
    console.error('ERROR managing unit:', unitName, err.message);
    // Fallback to first available unit
    const fallbackUnit = await db.oneOrNone(`SELECT id FROM units LIMIT 1`);
    return fallbackUnit ? fallbackUnit.id : null;
  }
}

/**
 * Parse meter metadata from identifier
 * Extracts unit type and meter type from the identifier string
 */
function parseIdentifierMetadata(identifier) {
  const metadata = {
    unit: 'kWh',  // default unit
    meterType: 'other',  // default meter type
    displayName: identifier
  };

  // Try to extract unit from identifier (e.g., "kWh", "W", "A")
  if (identifier.includes('kWh')) {
    metadata.unit = 'kWh';
    metadata.meterType = 'electric';
  } else if (identifier.includes('W')) {
    metadata.unit = 'W';
    metadata.meterType = 'electric';
  } else if (identifier.includes('A')) {
    metadata.unit = 'A';
    metadata.meterType = 'electric';
  } else if (identifier.includes('V')) {
    metadata.unit = 'V';
    metadata.meterType = 'electric';
  } else if (identifier.includes('Temp')) {
    metadata.unit = '°C';
    metadata.meterType = 'temperature';
  } else if (identifier.includes('Pressure')) {
    metadata.unit = 'Pa';
    metadata.meterType = 'pressure';
  }

  return metadata;
}

/**
 * 1) Dynamically create/update meters from MQTT identifiers
 * 2) Load their ids into memory, organized by type and unit
 */
async function registerMeterIfNeeded(identifier) {
  // Check if meter already exists
  let row = await db.oneOrNone(
    `SELECT id, unit_id, meter_type FROM meters WHERE identifier = $1`,
    [identifier]
  );

  if (row) {
    // Meter exists, return it
    return row;
  }

  // Parse metadata from identifier
  const metadata = parseIdentifierMetadata(identifier);
  
  // Get or create the appropriate unit
  let unitId;
  try {
    unitId = await getOrCreateUnit(metadata.unit);
  } catch (err) {
    console.error('ERROR getting unit for', identifier, ':', err.message);
    return null;
  }

  // Create new meter with detected metadata
  try {
    row = await db.one(
      `INSERT INTO meters
        (name, identifier, enabled, displayable, meter_type, unit_id, default_graphic_unit, reading_frequency)
      VALUES
        ($1, $2, true, true, $3, $4, $4, '00:15:00')
      RETURNING id, unit_id, meter_type`,
      [identifier, identifier, metadata.meterType, unitId]
    );
    console.log(`✓ Created meter: ${identifier} (type: ${metadata.meterType}, unit: ${metadata.unit}, id: ${row.id})`);
    return row;
  } catch (err) {
    console.error('ERROR creating meter:', identifier, err.message);
    return null;
  }
}

/**
 * Insert into readings table
 */
async function insertReading(meterId, value) {
  try {
    await db.none(
      `INSERT INTO readings (meter_id, reading, start_timestamp, end_timestamp)
        VALUES ($1, $2,
                CURRENT_TIMESTAMP - INTERVAL '1 second',
                CURRENT_TIMESTAMP)`,
      [meterId, value]
    );
  } catch (err) {
    console.error('ERROR inserting reading for meter', meterId, ':', err.message);
    throw err;
  }
}

/**
 * MQTT setup
 */
const client = mqtt.connect({
  host: '0a8926ff283644b5894dedaed07f99a2.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'testing',
  password: 'Test@123',
  rejectUnauthorized: false
});

const TOPIC = 'devices/Device01/telemetry';

let meterMap = {}; // identifier → {id, meter_type, unit_id}
let metersByType = {}; // meter_type → [identifiers]
let metersByUnit = {}; // unit_id → [identifiers]
let lastRefreshTime = 0;
const REFRESH_INTERVAL = 60000; // Refresh views every 60 seconds max (in milliseconds)

/**
 * Register meter dynamically and organize into classification maps
 */
async function classifyAndRegisterMeter(identifier) {
  // Check if already registered
  if (identifier in meterMap) {
    return meterMap[identifier];
  }

  // Register new meter
  const meterData = await registerMeterIfNeeded(identifier);
  
  if (!meterData) {
    return null;
  }

  // Store in meterMap with full metadata
  meterMap[identifier] = {
    id: meterData.id,
    meter_type: meterData.meter_type,
    unit_id: meterData.unit_id
  };

  // Classify by meter type
  if (!metersByType[meterData.meter_type]) {
    metersByType[meterData.meter_type] = [];
  }
  metersByType[meterData.meter_type].push(identifier);

  // Classify by unit
  if (!metersByUnit[meterData.unit_id]) {
    metersByUnit[meterData.unit_id] = [];
  }
  metersByUnit[meterData.unit_id].push(identifier);

  console.log(`[CLASSIFICATION] Registered: ${identifier} → Type: ${meterData.meter_type}, Unit ID: ${meterData.unit_id}`);
  
  return meterMap[identifier];
}

/**
 * MQTT events
 */
client.on('connect', () => {
  console.log('MQTT CONNECTED');
  client.subscribe(TOPIC, () => {
    console.log('Subscribed to', TOPIC);
  });
});

client.on('message', async (topic, message) => {
  let text = message.toString();
  let d;

  try {
    d = JSON.parse(text);
  } catch {
    console.log('Not JSON → skipped');
    return;
  }

  // flatten array payload like [{a:1},{b:2}]
  if (Array.isArray(d)) {
    const flat = {};
    for (const o of d) Object.assign(flat, o);
    d = flat;
  }

  // iterate through ALL incoming keys (not just predefined ones)
  for (const [key, value] of Object.entries(d)) {
    const numericValue = Number(value);

    // Skip non-numeric values
    if (Number.isNaN(numericValue)) {
      console.log(`[SKIP] Non-numeric value: ${key} = ${value}`);
      continue;
    }

    // Register/classify the meter if not already done
    let meterData = meterMap[key];
    if (!meterData) {
      meterData = await classifyAndRegisterMeter(key);
    }

    // If registration failed, skip this reading
    if (!meterData) {
      console.error(`[ERROR] Failed to register meter: ${key}`);
      continue;
    }

    // Insert reading using the registered meter ID
    try {
      await insertReading(meterData.id, numericValue);
      console.log(
        `✓ Reading saved: ${key} = ${numericValue} → meter_id ${meterData.id} (type: ${meterData.meter_type}, unit: ${meterData.unit_id})`
      );
    } catch (err) {
      console.error(`[ERROR] Failed to insert reading for ${key}:`, err.message);
    }
  }

  // Refresh materialized views periodically so graphs can display the new data
  const now = Date.now();
  if (now - lastRefreshTime >= REFRESH_INTERVAL) {
    lastRefreshTime = now;
    console.log('Refreshing reading views for graphs...');
    try {
      await refreshAllReadingViews();
      console.log('✓ Reading views refreshed successfully');
    } catch (err) {
      console.error('✗ Error refreshing reading views:', err.message);
    }
  }
});

client.on('error', e => console.error('MQTT error:', e.message));
client.on('close', () => console.log('MQTT connection closed'));
client.on('reconnect', () => console.log('Reconnecting…'));
