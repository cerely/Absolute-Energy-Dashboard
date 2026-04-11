const fs = require('fs');
const { execSync } = require('child_process');
try {
  const output = execSync('docker exec oed-test-database-1 psql -U oed -d oed -P format=json -P tuples_only=on -c "SELECT id, identifier, displayable, mqtt_source_id FROM meters ORDER BY id DESC LIMIT 20;"');
  console.log(output.toString());
} catch(e) {
  console.error(e.toString());
}
