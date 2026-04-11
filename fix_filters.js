require('dotenv').config();
const { getConnection } = require('./src/server/db');

async function fix() {
    const db = getConnection();
    try {
        const sources = await db.any(`SELECT * FROM mqtt_sources WHERE filters IS NOT NULL AND filters != ''`);
        let count = 0;
        for (const source of sources) {
            const filters = source.filters;
            const filterList = filters.split(',').map(f => f.trim()).filter(f => f.length > 0);
            for (const f of filterList) {
                const excludeStr = f.startsWith('!') ? f.substring(1) : f;
                const exclude = excludeStr.trim().toLowerCase();
                if (exclude) {
                    const result = await db.result(`UPDATE meters SET enabled = false, displayable = false WHERE mqtt_source_id = $1 AND LOWER(identifier) LIKE $2 AND enabled = true`, [source.id, `%${exclude}%`]);
                    count += result.rowCount;
                }
            }
        }
        console.log(`Successfully disabled ${count} existing meters that matched filters.`);
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

fix();
