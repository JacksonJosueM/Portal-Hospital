const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true, // Requerido para Mandatory encryption en conexiones remotas
    trustServerCertificate: true // Requerido para servidores on-premise
  },
  port: parseInt(process.env.DB_PORT) || 1433,
  requestTimeout: 30000,
  connectionTimeout: 30000
};

console.log('Intentando conectar a SQL Server...');

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('✅ Conectado exitosamente a SQL Server');
    return pool;
  })
  .catch(err => {
    console.error('❌ Error conectando a SQL Server:', err.message);
    process.exit(-1);
  });

const testConnection = async () => {
  try {
    await poolPromise;
    console.log('✅ Conexión a la base de datos verificada');
  } catch (error) {
    console.error('❌ Error en conexión:', error.message);
    throw error;
  }
};

module.exports = { sql, poolPromise, testConnection };