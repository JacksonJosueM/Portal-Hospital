const sql = require('mssql');
require('dotenv').config();

// ════════════════════════════════════════════════════════════════════════════
//  POOLS DE CONEXIÓN
// ════════════════════════════════════════════════════════════════════════════
//
//  • portalPool   → BD propia del portal (codigos_otp y vistas auxiliares
//                    como vw_pacientes_portal, etc.). Sirve también como pool
//                    legacy a través del export `poolPromise`.
//  • panaceaPool  → Conexión directa a la BD PANACEA para ejecutar los SPs
//                    nativos (Historia.*, Dinamico.*, Parametrizacion.*,
//                    Administracion.*, Laboratorio.*, Odontologia.*) tal y
//                    como lo hace la aplicación Silverlight de Panacea.
//
//  Ambas conexiones usan el mismo servidor por defecto (las dos BDs viven
//  en el Servidor 1 = 10.10.0.10) pero se pueden separar si se desea.
// ════════════════════════════════════════════════════════════════════════════

const sharedOptions = {
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 90000, // Aumentar a 90s
  connectionTimeout: 45000, // Aumentar a 45s
};

const portalConfig = {
  ...sharedOptions,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10) || 1433,
};

const panaceaConfig = {
  ...sharedOptions,
  server: process.env.PANACEA_DB_SERVER || portalConfig.server,
  database: process.env.PANACEA_DB_NAME || 'PRUEBAS',
  user: process.env.PANACEA_DB_USER || portalConfig.user,
  password: process.env.PANACEA_DB_PASSWORD || portalConfig.password,
  port: parseInt(process.env.PANACEA_DB_PORT, 10) || portalConfig.port,
};

console.log('🔌 Inicializando pools SQL Server...');
console.log(`   • Portal:  ${portalConfig.server} / ${portalConfig.database}`);
console.log(`   • Panacea: ${panaceaConfig.server} / ${panaceaConfig.database}`);

function buildPool(label, cfg) {
  return new sql.ConnectionPool(cfg)
    .connect()
    .then((pool) => {
      console.log(`✅ Pool ${label} conectado`);
      return pool;
    })
    .catch((err) => {
      console.error(`❌ Pool ${label} falló:`, err.message);
      throw err;
    });
}

const portalPool = buildPool('Portal', portalConfig);
const panaceaPool = buildPool('Panacea', panaceaConfig);

const testConnection = async () => {
  await Promise.all([portalPool, panaceaPool]);
  console.log('✅ Conexiones a SQL Server verificadas');
};

module.exports = {
  sql,
  // Compatibilidad con el código existente que importa `poolPromise`
  poolPromise: portalPool,
  portalPool,
  panaceaPool,
  testConnection,
};
