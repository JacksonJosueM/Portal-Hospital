const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: 'localhost',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
  port: 1433
};

sql.connect(dbConfig).then(pool => {
  return pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME IN ('pacientes', 'historias_clinicas', 'resultados_laboratorio')
  `);
}).then(result => {
  let out = '';
  result.recordset.forEach(row => { out += `${row.TABLE_NAME} -> ${row.COLUMN_NAME} (${row.DATA_TYPE})\n`; });
  require('fs').writeFileSync('schema.txt', out, 'utf8');
  process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
