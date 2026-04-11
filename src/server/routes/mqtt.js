const express = require('express');
const { getConnection } = require('../db');
const { startMqttClient } = require('../mqttKwhFiltered');
const router = express.Router();

/* ─────────────────────────────────────────────
   Helper: get / set the active MQTT source id
   stored in global_settings table
   ───────────────────────────────────────────── */

async function getActiveMqttSourceId() {
    const db = getConnection();
    const row = await db.oneOrNone(
        `SELECT value FROM global_settings WHERE key = 'active_mqtt_source_id'`
    );
    if (row && row.value) return parseInt(row.value, 10);

    // Fallback: pick the latest source that is not disabled
    const latest = await db.oneOrNone(`SELECT id FROM mqtt_sources WHERE broker_url != '' AND broker_url IS NOT NULL ORDER BY id DESC LIMIT 1`);
    if (latest) {

        await setActiveMqttSourceId(latest.id);
        return latest.id;
    }
    return null;
}

async function setActiveMqttSourceId(id) {
    const db = getConnection();
    await db.none(
        `INSERT INTO global_settings (key, value)
         VALUES ('active_mqtt_source_id', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(id)]
    );
}

/* ─────────────────────────────────────────────
   GET /api/mqtt — list ALL MQTT sources
   ───────────────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const db = getConnection();
        const sources = await db.any(
            `SELECT * FROM mqtt_sources WHERE broker_url IS NOT NULL AND broker_url != '' ORDER BY id ASC`
        );
        const activeId = await getActiveMqttSourceId();
        res.json({ sources, activeId });
    } catch (error) {
        console.error('Error fetching MQTT sources:', error);
        res.status(500).send('Internal Server Error');
    }
});

/* ─────────────────────────────────────────────
   GET /api/mqtt/active — get the currently active source
   ───────────────────────────────────────────── */
router.get('/active', async (req, res) => {
    try {
        const db = getConnection();
        const activeId = await getActiveMqttSourceId();
        if (!activeId) return res.json(null);

        const source = await db.oneOrNone(
            `SELECT * FROM mqtt_sources WHERE id = $1`,
            [activeId]
        );
        res.json(source);
    } catch (error) {
        console.error('Error fetching active MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

/* ─────────────────────────────────────────────
   PUT /api/mqtt/active/:id — switch active topic
   Context switch only: no data deletion!
   ───────────────────────────────────────────── */
router.put('/active/:id', async (req, res) => {
    try {
        const db = getConnection();
        const id = parseInt(req.params.id, 10);

        // Verify the source exists
        const source = await db.oneOrNone(
            `SELECT * FROM mqtt_sources WHERE id = $1`,
            [id]
        );
        if (!source) {
            return res.status(404).json({ error: 'MQTT source not found' });
        }

        await setActiveMqttSourceId(id);

        // Restart MQTT client with the newly active source
        await startMqttClient();

        res.json({ success: true, activeId: id, source });
    } catch (error) {
        console.error('Error switching active MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

/* ─────────────────────────────────────────────
   POST /api/mqtt — create a NEW MQTT source
   Sets it as active and restarts the client
   ───────────────────────────────────────────── */
router.post('/', async (req, res) => {
    try {
        const { broker_url, topic, client_id, username, password, filters } = req.body;
        const db = getConnection();
        
        // Insert new source (immutable append model)
        const newSource = await db.one(
            `INSERT INTO mqtt_sources (broker_url, topic, client_id, username, password, filters) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [broker_url, topic, client_id, username, password, filters]
        );
        
        // Set as active
        await setActiveMqttSourceId(newSource.id);

        // Clean up any existing meters that match the new filters for this source just in case
        if (filters && filters.trim().length > 0) {
            const filterList = filters.split(',').map(f => f.trim()).filter(f => f.length > 0);
            for (const f of filterList) {
                const excludeStr = f.startsWith('!') ? f.substring(1) : f;
                const exclude = excludeStr.trim().toLowerCase();
                if (exclude) {
                    await db.none(`UPDATE meters SET enabled = false, displayable = false WHERE mqtt_source_id = $1 AND LOWER(identifier) LIKE $2`, [newSource.id, `%${exclude}%`]);
                }
            }
        }

        // Restart the MQTT client with the new settings
        await startMqttClient();
        
        res.json(newSource);
    } catch (error) {
        console.error('Error saving MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

/* ─────────────────────────────────────────────
   PUT /api/mqtt/:id — update an existing source
   ───────────────────────────────────────────── */
router.put('/:id', async (req, res) => {
    try {
        const db = getConnection();
        const id = parseInt(req.params.id, 10);
        const { broker_url, topic, client_id, username, password, filters } = req.body;

        const updated = await db.oneOrNone(
            `UPDATE mqtt_sources
             SET broker_url = $1, topic = $2, client_id = $3,
                 username = $4, password = $5, filters = $6
             WHERE id = $7
             RETURNING *`,
            [broker_url, topic, client_id, username, password, filters, id]
        );

        if (!updated) {
            return res.status(404).json({ error: 'MQTT source not found' });
        }

        // Clean up any existing meters that match the updated filters for this source
        if (filters && filters.trim().length > 0) {
            const filterList = filters.split(',').map(f => f.trim()).filter(f => f.length > 0);
            for (const f of filterList) {
                const excludeStr = f.startsWith('!') ? f.substring(1) : f;
                const exclude = excludeStr.trim().toLowerCase();
                if (exclude) {
                    await db.none(`UPDATE meters SET enabled = false, displayable = false WHERE mqtt_source_id = $1 AND LOWER(identifier) LIKE $2`, [id, `%${exclude}%`]);
                }
            }
        }

        // If this is the active source, restart client
        const activeId = await getActiveMqttSourceId();
        if (activeId === id) {
            await startMqttClient();
        }

        res.json(updated);
    } catch (error) {
        console.error('Error updating MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

/* ─────────────────────────────────────────────
   DELETE /api/mqtt/:id — soft-disable a source
   Does NOT delete meters or readings!
   ───────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
    try {
        const db = getConnection();
        const id = parseInt(req.params.id, 10);

        // Soft-disable: clear broker_url so it won't connect
        await db.none(
            `UPDATE mqtt_sources SET broker_url = '' WHERE id = $1`,
            [id]
        );

        // If this was the active source, switch to another or stop
        const activeId = await getActiveMqttSourceId();
        if (activeId === id) {
            const nextSource = await db.oneOrNone(
                `SELECT id FROM mqtt_sources WHERE broker_url != '' AND id != $1 ORDER BY id DESC LIMIT 1`,
                [id]
            );
            if (nextSource) {
                await setActiveMqttSourceId(nextSource.id);
            } else {
                await db.none(`DELETE FROM global_settings WHERE key = 'active_mqtt_source_id'`);
            }
            await startMqttClient();

        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error disabling MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Legacy DELETE / (no ID) — stop the active source
router.delete('/', async (req, res) => {
    try {
        const activeId = await getActiveMqttSourceId();
        if (activeId) {
            const db = getConnection();
            await db.none(`INSERT INTO mqtt_sources (broker_url, topic) VALUES ('', '')`);
        }
        await startMqttClient();
        res.sendStatus(200);
    } catch (error) {
        console.error('Error removing MQTT source:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
