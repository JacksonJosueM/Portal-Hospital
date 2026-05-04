require('dotenv').config();
const { poolPromise } = require('./config/db');

async function run() {
  const pool = await poolPromise;
  try {
     await pool.query(`ALTER TABLE codigos_otp ADD intentos INT DEFAULT 0;`);
     console.log('Columna intentos añadida');
  } catch(e) {
     console.log('Error o ya existe:', e.message);
  }
  try {
     await pool.query(`ALTER TABLE codigos_otp ADD bloqueado BIT DEFAULT 0;`);
     console.log('Columna bloqueado añadida');
  } catch(e) {
     console.log('Error o ya existe:', e.message);
  }
  process.exit();
}
run();
