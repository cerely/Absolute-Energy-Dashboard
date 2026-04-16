const { getConnection } = require('../src/server/db'); 
(async () => { 
	const conn = getConnection(); 
	try { 
		const readings = await conn.any("SELECT * FROM meter_line_readings_unit(ARRAY[22], 33, '2021-01-01', '2027-01-01', 'raw', 2000, 1440) LIMIT 5"); 
		console.log('Readings:', JSON.stringify(readings, null, 2)); 
	} catch (e) { 
		console.error(e); 
	} 
	process.exit(0); 
})();
