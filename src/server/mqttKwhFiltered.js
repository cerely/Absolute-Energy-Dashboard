const mqtt = require('mqtt');
const { getConnection } = require('./db');
const { refreshAllReadingViews } = require('./services/refreshAllReadingViews');

// Backfill timezone for existing MQTT meters that were created without one.
// Runs once at startup — safe to re-run (only updates NULL rows).
async function migrateNullTimezoneMeters() {
  try {
    const db = getConnection();
    const result = await db.result(
      `UPDATE meters
         SET default_timezone_meter = 'Asia/Kolkata'
       WHERE mqtt_source_id IS NOT NULL
         AND (default_timezone_meter IS NULL OR default_timezone_meter = '')`
    );
    if (result.rowCount > 0) {
      console.log(`MQTT: Backfilled timezone 'Asia/Kolkata' on ${result.rowCount} existing meter(s).`);
    }
  } catch (err) {
    // DB may not be ready yet on first start — mqttClient retries handle that
    console.warn('MQTT: Could not migrate meter timezones (will retry on next start):', err.message);
  }
}


/* =====================================================
   UNIT HANDLING
===================================================== */

async function getOrCreateUnit(unitName = 'unitless') {
  const db = getConnection();
  let row = await db.oneOrNone(
    `SELECT id FROM units WHERE name = $1`,
    [unitName]
  );

  if (row) return row.id;

  row = await db.one(
    `INSERT INTO units
      (name, identifier, unit_represent, type_of_unit, displayable, preferred_display)
     VALUES
      ($1, $2, 'quantity', 'unit', 'all', true)
     RETURNING id`,
    [
      unitName,
      unitName.toLowerCase().replace(/\s+|°|\/|\(|\)/g, '_')
    ]
  );

  // Add identity conversion in CIK table so OED recognises this unit as
  // compatible for graphing (unit → itself, slope 1, intercept 0).
  await db.none(
    `INSERT INTO cik (source_id, destination_id, slope, intercept)
     VALUES ($1, $1, 1, 0)
     ON CONFLICT DO NOTHING`,
    [row.id]
  );

  return row.id;
}

/* =====================================================
   ✅ FIXED UNIT DETECTION (ONLY CHANGE)
===================================================== */

function parseIdentifierMetadata(identifier) {
  const text = identifier.toLowerCase();

  const UNIT_TOKENS = [
    // ENERGY (longest wins)
    { token: 'kvarh', unit: 'kVArh' },
    { token: 'kvah', unit: 'kVAh' },
    { token: 'kwh', unit: 'kWh' },

    // POWER
    { token: 'kvar', unit: 'kVAr' },
    { token: 'kva', unit: 'kVA' },
    { token: 'kw', unit: 'kW' },

    // ELECTRICAL
    { token: 'voltage', unit: 'V' },
    { token: 'current', unit: 'A' },
    { token: 'freq', unit: 'Hz' },

    // OTHER
    { token: 'pf', unit: 'PF' },
    { token: 'thd', unit: '%' },
    { token: 'temp', unit: '°C' },
    { token: 'flow', unit: 'm³/h' },
    { token: 'pressure', unit: 'Pa' },
    { token: 'level', unit: 'level' },
    { token: 'status', unit: 'status' },
    { token: 'running', unit: 'status' }
  ];

  const matches = UNIT_TOKENS.filter(u => text.includes(u.token));

  if (matches.length === 0) {
    return {
      unit: 'unitless',
      meterType: 'other',
      displayName: identifier
    };
  }

  // 🔑 Longest token wins → kWh beats kW
  matches.sort((a, b) => b.token.length - a.token.length);

  return {
    unit: matches[0].unit,
    meterType: 'other',
    displayName: identifier
  };
}

/* =====================================================
   METER REGISTRATION
===================================================== */

async function registerMeterIfNeeded(identifier, sourceId, fullPath = null) {
  const db = getConnection();

  // 1. Check if the simplified identifier already exists FOR THIS SOURCE
  let row = await db.oneOrNone(
    `SELECT id, unit_id, meter_type, logical_meter_id FROM meters WHERE identifier = $1 AND mqtt_source_id = $2`,
    [identifier, sourceId]
  );

  // 2. If not found, check if the full path exists for this source (Handle Migration)
  if (!row && fullPath && fullPath !== identifier) {
    row = await db.oneOrNone(
      `SELECT id, unit_id, meter_type, logical_meter_id FROM meters WHERE identifier = $1 AND mqtt_source_id = $2`,
      [fullPath, sourceId]
    );

    if (row) {
      console.log(`MQTT: Migrating meter identifier for ID ${row.id}: ${fullPath} -> ${identifier}`);
      await db.none(
        `UPDATE meters SET identifier = $1 WHERE id = $2`,
        [identifier, row.id]
      );
      // Fall through to return the updated row
    }
  }

  // 🔒 DO NOT mutate existing unit
  if (row) {
    return row;
  }

  const metadata = parseIdentifierMetadata(identifier);
  const unitId = await getOrCreateUnit(metadata.unit);

  // Retain connection to the physical meter across topic changes
  const prev = await db.oneOrNone(
    `SELECT logical_meter_id FROM meters WHERE identifier = $1 AND logical_meter_id IS NOT NULL LIMIT 1`,
    [identifier]
  );
  const logicalMeterId = prev ? prev.logical_meter_id : identifier;

  return await db.one(
    `INSERT INTO meters
      (name, identifier, enabled, displayable,
       meter_type, unit_id, default_graphic_unit, reading_frequency,
       mqtt_source_id, logical_meter_id, default_timezone_meter)
     VALUES
      ($1, $2, true, true, $3, $4, $4, '00:15:00', $5, $6, 'Asia/Kolkata')
     RETURNING id, unit_id, meter_type, logical_meter_id`,
    [identifier, identifier, metadata.meterType, unitId, sourceId, logicalMeterId]
  );
}


/* =====================================================
   READINGS
===================================================== */

async function insertReading(meterId, value) {
  const db = getConnection();
  try {
    // Use clock_timestamp() (real wall-clock time) instead of CURRENT_TIMESTAMP
    // (which is fixed for the whole transaction). This guarantees unique microsecond
    // timestamps even when multiple readings arrive within the same second, preventing
    // the ON CONFLICT clause from silently dropping them.
    await db.none(
      `INSERT INTO readings
        (meter_id, reading, start_timestamp, end_timestamp)
       VALUES
        ($1, $2,
         clock_timestamp() - INTERVAL '1 second',
         clock_timestamp())
       ON CONFLICT (meter_id, start_timestamp) DO NOTHING`,
      [meterId, value]
    );
    return true;
  } catch (err) {
    if (err.message && err.message.includes('foreign key constraint "readings_meter_id_fkey"')) {
      console.warn(`MQTT Warning: Failed to insert reading. Meter ID ${meterId} no longer exists in database. Cache invalidated.`);
      return false; // Return false so the payload processor can invalidate the cache
    }
    throw err;
  }
}


/* =====================================================
   MQTT SETUP AND LOGIC
===================================================== */

let currentClient = null;

async function startMqttClient() {
  if (currentClient) {
    console.log('Stopping existing MQTT client...');
    currentClient.end(true);
    currentClient = null;
  }

  let retryCount = 0;
  const maxRetries = 30;
  let sources = [];

  while (retryCount < maxRetries) {
    try {
      const db = getConnection();

      // Read the active MQTT source ID from global_settings
      const activeRow = await db.oneOrNone(
        `SELECT value FROM global_settings WHERE key = 'active_mqtt_source_id'`
      );

      if (activeRow && activeRow.value) {
        const activeId = parseInt(activeRow.value, 10);
        const src = await db.oneOrNone('SELECT * FROM mqtt_sources WHERE id = $1', [activeId]);
        sources = src ? [src] : [];
      } else {
        // Fallback: pick the latest source that is not disabled
        sources = await db.any(`SELECT * FROM mqtt_sources WHERE broker_url != '' AND broker_url IS NOT NULL ORDER BY id DESC LIMIT 1`);
      }


      break;
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes('starting up') || msg.includes('not yet accepting connections') || msg.includes('ECONNREFUSED')) {
        console.log(`Database not ready for MQTT config (attempt ${retryCount + 1}/${maxRetries}), waiting...`);
        await new Promise(r => setTimeout(r, 5000));
        retryCount++;
      } else {
        throw err;
      }
    }
  }

  // Backfill timezone on all existing MQTT meters that have NULL timezone
  await migrateNullTimezoneMeters();

  if (sources.length === 0) {
    console.log('No MQTT sources configured. Idle.');
    return;
  }


  const config = sources[0];
  const sourceId = config.id;
  let brokerUrl = config.broker_url || '';

  // Auto-prefix mqtt:// or mqtts:// if missing
  if (!brokerUrl.includes('://')) {
    brokerUrl = (config.port === 8883 ? 'mqtts://' : 'mqtt://') + brokerUrl;
  }

  if (!brokerUrl) {
    console.log('MQTT Source was disabled (empty brokerUrl).');
    return;
  }

  try {
    urlObj = new URL(brokerUrl);
  } catch (err) {
    console.error('Invalid MQTT Broker URL:', brokerUrl);
    return;
  }

  const options = {
    host: urlObj.hostname,
    port: parseInt(urlObj.port || (urlObj.protocol === 'mqtts:' ? 8883 : 1883)),
    protocol: urlObj.protocol.replace(':', ''),
    username: config.username,
    password: config.password,
    clientId: config.client_id || 'OED_MQTT_Client_' + Math.random().toString(16).substr(2, 8),
    rejectUnauthorized: false
  };

  console.log(`Starting MQTT client for broker: ${options.host}:${options.port}...`);
  currentClient = mqtt.connect(options);

  const TOPIC = config.topic || '#';
  const filtersText = config.filters || '';
  const filterList = filtersText.split(',')
    .map(f => {
      let excludeStr = f.trim();
      if (excludeStr.startsWith('!')) excludeStr = excludeStr.substring(1).trim();
      return excludeStr.toLowerCase();
    })
    .filter(f => f.length > 0);

  const meterMap = {};
  const REFRESH_INTERVAL = 120000;

  currentClient.on('connect', () => {
    console.log('MQTT CONNECTED to', options.host);
    currentClient.subscribe(TOPIC);
  });

  // Concurrency lock for view refreshes
  let isRefreshing = false;

  // Run view refresh on a dedicated timer — independent of message arrival.
  // This ensures the materialized views (hourly/daily) stay up-to-date
  // even if MQTT message rate slows or stops temporarily.
  let refreshTimer = setInterval(async () => {
    if (isRefreshing) {
      console.log('MQTT: Skipping view refresh, previous refresh still in progress.');
      return;
    }
    isRefreshing = true;
    try {
      await refreshAllReadingViews();
    } catch (err) {
      console.error('refreshAllReadingViews timer error:', err);
    } finally {
      isRefreshing = false;
    }
  }, REFRESH_INTERVAL);

  // Clean up the timer when the client is stopped
  const _end = currentClient.end.bind(currentClient);
  currentClient.end = function(...args) {
    clearInterval(refreshTimer);
    return _end(...args);
  };

  async function processPayload(data, currentKey, currentTopic) {
    if (data === null || data === undefined) return;

    if (typeof data === 'number' || (typeof data === 'string' && !isNaN(Number(data)) && data.trim() !== '')) {
      const value = Number(data);
      const fullPath = currentKey ? `${currentTopic}/${currentKey}` : currentTopic;
      const checkPath = currentKey ? currentKey : currentTopic;
      const lowerFullPath = fullPath.toLowerCase();
      const lowerCheck = checkPath.toLowerCase();

      // All filters are treated as exclusions (ignored prefixes) as per the UI description.
      for (const exclude of filterList) {
        if (lowerFullPath.includes(exclude) || lowerCheck.includes(exclude)) {
          return;
        }
      }

      // Simplify the identifier to "meter/tag" (last two components)
      const parts = fullPath.split('/');
      const identifier = parts.length >= 2 ? parts.slice(-2).join('/') : fullPath;


      if (!meterMap[identifier]) {
        console.log(`MQTT: Registering new meter from MQTT: ${identifier}`);
        meterMap[identifier] = await registerMeterIfNeeded(identifier, sourceId, fullPath);
      }
      const success = await insertReading(meterMap[identifier].id, value);
      if (!success) {
        // Cache is stale! The meter was deleted from the database out from under us.
        delete meterMap[identifier];
      }
      return;
    }

    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        await processPayload(data[i], currentKey ? `${currentKey}[${i}]` : `[${i}]`, currentTopic);
      }
    } else if (typeof data === 'object') {
      for (const [key, val] of Object.entries(data)) {
        const newKey = currentKey ? `${currentKey}/${key}` : key;
        await processPayload(val, newKey, currentTopic);
      }
    }
  }

  let lastLogTime = 0;

  currentClient.on('message', async (topic, message) => {
    const messageStr = message.toString();

    const nowOuter = Date.now();
    if (nowOuter - lastLogTime > 5000) {
      console.log(`\n[MQTT DEBUG] Received incoming data from ${topic}\nPayload Preview: ${messageStr.slice(0, 150)}...\n`);
      lastLogTime = nowOuter;
    }
    let payload;

    try {
      // Handle non-standard JSON that might include 'nan' or '-nan' (case-insensitive)
      const fixedMessage = messageStr.replace(/:\s*-?nan\b/gi, ': null');
      payload = JSON.parse(fixedMessage);
    } catch {
      // If not JSON, it might be a raw number
      const num = Number(messageStr);
      if (!Number.isNaN(num)) {
        payload = num;
      } else {
        console.log(`MQTT: Received invalid payload on topic ${topic}: ${messageStr}`);
        return;
      }
    }

    await processPayload(payload, null, topic);
  });

  currentClient.on('error', e => console.error('MQTT error:', e.message));
  currentClient.on('close', () => console.log('MQTT closed'));
  currentClient.on('reconnect', () => console.log('MQTT reconnecting'));


}

// Automatically start if called directly or on require
startMqttClient();

module.exports = {
  startMqttClient
};
