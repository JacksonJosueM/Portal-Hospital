const { enviarHistoria } = require('./services/envio.historia.service.js');
async function run() {
  await enviarHistoria({ tipo_documento: 'PT', numero_documento: '5369102' });
  console.log('Done!');
  process.exit(0);
}
run().catch(console.error);
