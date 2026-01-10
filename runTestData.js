require('dotenv').config();

require("./src/server/data/automatedTestingData")
  .insertSpecialUnitsConversionsMetersGroups()
  .then(() => {
    console.log("DONE");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
