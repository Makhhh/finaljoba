const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString:'postgresql://makhambet:U9VW6fpU15xtvNIubgDeXCRiN2EgITEp@dpg-d289g0e3jp1c73857ii0-a.oregon-postgres.render.com/faceid_db',
  ssl: {rejectUnauthorized: false}
});

module.exports = pool;
