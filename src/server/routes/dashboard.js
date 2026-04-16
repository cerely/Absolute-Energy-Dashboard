const express = require('express');
const { getConnection } = require('../db');
const router = express.Router();

router.get('/stats', async (req, res) => {
    try {
        const db = getConnection();

        // ── Determine which MQTT source to filter by ──
        let sourceFilter = '';
        const sourceId = parseInt(req.query.sourceId, 10);
        if (!isNaN(sourceId) && sourceId > 0) {
            sourceFilter = `AND m.mqtt_source_id = ${sourceId}`;
        } else {
            // Fallback: check active source from global_settings
            const activeRow = await db.oneOrNone(
                `SELECT value FROM global_settings WHERE key = 'active_mqtt_source_id'`
            );
            if (activeRow && activeRow.value) {
                sourceFilter = `AND m.mqtt_source_id = ${parseInt(activeRow.value, 10)}`;
            }
        }
        
        // Total kWh: Sum of the latest reading for any meter that is a kWh meter
        let kwhQuery = `
            SELECT SUM(latest.reading) as total
            FROM (
                SELECT DISTINCT ON (r.meter_id) r.reading
                FROM readings r
                JOIN meters m ON r.meter_id = m.id
                JOIN units u ON m.unit_id = u.id
                WHERE u.name ILIKE '%kwh%' {METER_FILTER} ${sourceFilter}
                ORDER BY r.meter_id, r.start_timestamp DESC
            ) latest;
        `;
        
        let meterFilter = 'AND 1=0'; // Default to nothing unless meters are specified
        if (req.query.meters) {
            const meterIds = req.query.meters.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (meterIds.length > 0) {
                meterFilter = `AND r.meter_id IN (${meterIds.join(',')})`;
            }
        }
        kwhQuery = kwhQuery.replace('{METER_FILTER}', meterFilter);


        // Separate filter for demand calculation (if provided)
        let demandMeterFilter = 'AND 1=0'; // Default to nothing
        if (req.query.demandMeters) {
            const dMeterIds = req.query.demandMeters.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (dMeterIds.length > 0) {
                demandMeterFilter = `AND r.meter_id IN (${dMeterIds.join(',')})`;
            }
        }

        // Read client-provided settings for gauges (passed as query params)
        // contractDemand: sanctioned/contracted load in kW (from tariff settings)
        // energyBudgetKwh: monthly energy budget in kWh (optional, defaults to 0 = disabled)
        const contractDemand = parseFloat(req.query.contractDemand) || 100;
        const energyBudgetKwh = parseFloat(req.query.energyBudgetKwh) || 0;
        
        const totalKwhRow = await db.oneOrNone(kwhQuery);
        const totalKwh = totalKwhRow && totalKwhRow.total ? parseFloat(totalKwhRow.total) : 0;

        // Total kVAh query
        let kvahQuery = kwhQuery.replace(/ILIKE '%kwh%'/gi, "ILIKE '%kvah%'");
        const totalKvahRow = await db.oneOrNone(kvahQuery);
        const totalKvah = totalKvahRow && totalKvahRow.total ? parseFloat(totalKvahRow.total) : 0;

        // Power Factor (PF) Calculation
        let powerFactor = 1.0;
        let pfMeterFilter = 'AND 1=0';
        if (req.query.powerFactorMeters) {
            const pfMeterIds = req.query.powerFactorMeters.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (pfMeterIds.length > 0) {
                pfMeterFilter = `AND r.meter_id IN (${pfMeterIds.join(',')})`;
                
                const directPfRow = await db.oneOrNone(`
                    SELECT AVG(latest.reading) as avg_pf
                    FROM (
                        SELECT DISTINCT ON (r.meter_id) r.reading
                        FROM readings r
                        JOIN meters m ON r.meter_id = m.id
                        WHERE 1=1 AND r.reading IS NOT NULL ${pfMeterFilter} ${sourceFilter}
                        ORDER BY r.meter_id, r.start_timestamp DESC
                    ) latest;
                `);
                
                if (directPfRow && directPfRow.avg_pf !== null) {
                    powerFactor = parseFloat(directPfRow.avg_pf);
                }
            }
        } 
        
        if (!pfMeterFilter) {
            // Fallback: Power Factor (PF) = Total kWh / Total kVAh (Cumulative)
            powerFactor = (totalKvah > 0 && totalKwh > 0) ? Math.min(1.0, totalKwh / totalKvah) : 1.0;
        }

        // Peak Demand (kW) = ΔEnergy (kWh) / Time (hours)
        // Uses LAG() to diff consecutive readings, handling cumulative meter readings correctly.
        // If readings are already differential, the diff is still valid (current - prev ≈ current interval energy).
        // Current Demand (kW) calculation
        // Supports two modes: 
        // 1. Direct kW meters: If unit is kW, use latest reading directly.
        // 2. Cumulative kWh: Calculate ΔEnergy (kWh) / ΔTime (hours) between consecutive readings.
        const demandRow = await db.oneOrNone(`
            WITH intervals AS (
                SELECT
                    r.meter_id,
                    u.name as unit,
                    r.reading,
                    r.start_timestamp,
                    CASE
                        WHEN u.name ILIKE '%kwh%' THEN
                            (r.reading - LAG(r.reading) OVER (PARTITION BY r.meter_id ORDER BY r.start_timestamp)) /
                            NULLIF(EXTRACT(EPOCH FROM (r.start_timestamp - LAG(r.start_timestamp) OVER (PARTITION BY r.meter_id ORDER BY r.start_timestamp))) / 3600.0, 0)
                        ELSE
                            r.reading
                    END as demand,
                    ROW_NUMBER() OVER (PARTITION BY r.meter_id ORDER BY r.start_timestamp DESC) as rn
                FROM readings r
                JOIN meters m ON r.meter_id = m.id
                JOIN units u ON m.unit_id = u.id
                WHERE (u.name ILIKE '%kwh%' OR u.name ILIKE '%kw%') ${demandMeterFilter} ${sourceFilter}
                  AND r.start_timestamp IS NOT NULL
            )
            SELECT 
                COALESCE(SUM(CASE WHEN rn = 1 THEN demand ELSE 0 END), 0) as current_demand,
                COALESCE(SUM(CASE WHEN rn = 2 THEN demand ELSE 0 END), 0) as prev_demand,
                MAX(CASE WHEN rn = 1 THEN start_timestamp ELSE NULL END) as latest_ts
            FROM intervals
            WHERE rn <= 2;
        `);
        let currentDemand = demandRow ? parseFloat(demandRow.current_demand) : 0;
        let prevDemand = demandRow ? parseFloat(demandRow.prev_demand) : 0;

        // Fallback: If latest is 0, it might be an open/empty interval. Use rn=2 as "current" and rn=3 as "prev"?
        // Or just show rn=2 if it's the latest stable value.
        if (currentDemand === 0 && prevDemand > 0) {
            currentDemand = prevDemand;
            // Get prev_demand from rn=3 if we want a real trend, but for now we fallback for value stability.
        }

        const demandTrend = currentDemand >= prevDemand ? 'up' : 'down';
        
        // For backward compatibility or internal usage, keep peakDemand as the max if needed 
        // (but for this dashboard update we'll use currentDemand as primary)
        const peakDemand = currentDemand; 
        
        // Load utilization = (Peak Demand kW / Contracted Load kW) × 100
        // Uses contractDemand from the client's tariff settings
        const loadUtil = contractDemand > 0 && peakDemand > 0
            ? Math.min(100, (peakDemand / contractDemand) * 100)
            : 0;

        // Calculate Monthly Consumption for the Budget Gauge
        const startOfMonth = new Date();
        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(0, 0, 0, 0);
        const startOfMonthISO = startOfMonth.toISOString();

        // ── Budget Meter Filter ──
        let budgetMeterFilter = meterFilter;
        if (req.query.budgetMeters) {
            const bMeterIds = req.query.budgetMeters.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (bMeterIds.length > 0) {
                budgetMeterFilter = `AND r.meter_id IN (${bMeterIds.join(',')})`;
            }
        }

        const consumptionQuery = `
            SELECT SUM(latest.reading - first.reading) as total
            FROM (
                SELECT DISTINCT ON (r.meter_id) r.reading, r.meter_id
                FROM readings r
                JOIN meters m ON r.meter_id = m.id
                JOIN units u ON m.unit_id = u.id
                WHERE u.name ILIKE '%kwh%' ${budgetMeterFilter} ${sourceFilter}
                  AND r.start_timestamp >= '${startOfMonthISO}'
                ORDER BY r.meter_id, r.start_timestamp ASC
            ) first
            JOIN (
                SELECT DISTINCT ON (r.meter_id) r.reading, r.meter_id
                FROM readings r
                JOIN meters m ON r.meter_id = m.id
                JOIN units u ON m.unit_id = u.id
                WHERE u.name ILIKE '%kwh%' ${budgetMeterFilter} ${sourceFilter}
                ORDER BY r.meter_id, r.start_timestamp DESC
            ) latest ON first.meter_id = latest.meter_id;
        `;
        const consumptionRow = await db.oneOrNone(consumptionQuery);
        const monthlyConsumption = consumptionRow && consumptionRow.total ? parseFloat(consumptionRow.total) : 0;

        const energyRate = parseFloat(req.query.energyRate) || 0;

        // Energy budget = (((Monthly consumption * rate) / Monthly budget limit) × 100)
        // If energyRate is 0, we treat the budget limit as a kWh limit directly.
        const energyBudget = energyBudgetKwh > 0
            ? Math.min(100, (energyRate > 0 
                ? ((monthlyConsumption * energyRate) / energyBudgetKwh) * 100
                : (monthlyConsumption / energyBudgetKwh) * 100))
            : 0;
        
        res.json({
            totalKwh: totalKwh.toFixed(2),
            currentDemand: currentDemand.toFixed(2),
            demandTrend: demandTrend, // 'up' or 'down'
            loadUtil: loadUtil.toFixed(1),
            energyBudget: energyBudget.toFixed(1),
            powerFactor: powerFactor.toFixed(3),
            latestTs: demandRow ? demandRow.latest_ts : null
        });
    } catch (e) {
        console.error("Dashboard stats error: ", e);
        res.status(500).send('Error calculation dashboard stats');
    }
});

router.get('/get-logo', async (req, res) => {
    try {
        const db = getConnection();
        const row = await db.oneOrNone('SELECT value FROM global_settings WHERE key = $1', ['siteLogoDataUrl']);
        if (row && row.value) {
            return res.json({ logoUrl: row.value });
        }
        res.json({ logoUrl: null });
    } catch (e) {
        console.error("Error fetching logo: ", e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/set-logo', async (req, res) => {
    try {
        const db = getConnection();
        const { logoUrl } = req.body;
        if (!logoUrl) {
           await db.none('DELETE FROM global_settings WHERE key = $1', ['siteLogoDataUrl']);
        } else {
           await db.none(`
               INSERT INTO global_settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = $2
           `, ['siteLogoDataUrl', logoUrl]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Error saving logo: ", e);
        res.status(500).json({ error: 'Database error' });
    }
});

/* ─────────────────────────────────────────────
   GET /api/dashboard/active-meter-ids
   Returns meter IDs belonging to the active MQTT source
   ───────────────────────────────────────────── */
router.get('/active-meter-ids', async (req, res) => {
    try {
        const db = getConnection();
        const activeRow = await db.oneOrNone(
            `SELECT value FROM global_settings WHERE key = 'active_mqtt_source_id'`
        );
        if (!activeRow || !activeRow.value) {
            return res.json({ sourceId: null, meterIds: [] });
        }
        const sourceId = parseInt(activeRow.value, 10);
        const rows = await db.any(
            `SELECT id FROM meters WHERE mqtt_source_id = $1 AND enabled = true`,
            [sourceId]
        );
        res.json({
            sourceId,
            meterIds: rows.map(r => r.id)
        });
    } catch (e) {
        console.error('Error fetching active meter ids:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const db = getConnection();
        const row = await db.oneOrNone('SELECT value FROM global_settings WHERE key = $1', ['dashboard_settings']);
        if (row && row.value) {
            return res.json(JSON.parse(row.value));
        }
        res.json({});
    } catch (e) {
        console.error("Error fetching dashboard settings: ", e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const db = getConnection();
        const settings = req.body;
        await db.none(`
            INSERT INTO global_settings (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = $2
        `, ['dashboard_settings', JSON.stringify(settings)]);
        res.json({ success: true });
    } catch (e) {
        console.error("Error saving dashboard settings: ", e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/mail-monthly-bill', async (req, res) => {
    try {
        const { sendMonthlyBill } = require('../services/billMailer');
        const { reportId } = req.body;
        await sendMonthlyBill(reportId);
        res.json({ success: true, message: 'Report email triggered successfully.' });
    } catch (error) {
        console.error('Error triggering manual bill email:', error);
        res.status(500).json({ success: false, error: 'Failed to send report email.' });
    }
});

module.exports = router;
