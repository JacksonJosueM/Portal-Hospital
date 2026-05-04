require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');

const dbConfig = {
  server: process.env.DB_SERVER || '10.10.0.10',
  database: process.env.DB_NAME || 'PortalPacientes',
  user: process.env.DB_USER || 'ADMIN',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  port: parseInt(process.env.DB_PORT) || 1433
};

async function getColumns() {
  try {
    const pool = await new sql.ConnectionPool(dbConfig).connect();
    
    // Check columns of codigos_otp
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'codigos_otp'
    `);

    fs.writeFileSync('codigos_otp_schema.json', JSON.stringify(result.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

getColumns();
