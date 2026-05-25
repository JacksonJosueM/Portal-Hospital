'use strict';
// Script mínimo para generar solo el HTML de incapacidad y guardarlo como .html
// Evita muhammara / PDF encryption para inspección visual rápida

const path = require('path');
const fs   = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────
const ID_ATENCION = 57552;

// ── Dependencias ─────────────────────────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '.env') });
const HistoriaPrintService = require('./services/historia.print.service');
const { clasificarTodasLasOrdenes, renderHtmlIncapacidades } = require('./services/plantilla.render');
const HistoriaSP = require('./services/panacea/historiaSP');
const pLimit     = require('p-limit');

async function main() {
  console.log(`\n📄 Cargando atención ${ID_ATENCION}...`);
  const payload = await HistoriaPrintService.imprimirAtencion(ID_ATENCION, {
    registrarCopia: false,
    numeroCopias: 0,
  });
  console.log('✅ Datos obtenidos.');

  const clasificados  = clasificarTodasLasOrdenes(
    payload.clinico.ordenes    || [],
    payload.clinico.formulacion || []
  );
  const rsIncapacidades = clasificados.incapacidades || [];
  if (!rsIncapacidades.length) {
    console.log('⚠️  No hay órdenes de incapacidad en esta atención.');
    process.exit(0);
  }

  // ── Cargar datos dinámicos ────────────────────────────────────────────────
  const ordenesInfo = new Map();
  const idIps = (payload.atencion && payload.atencion.ID_IPS) || 21;
  for (const rs of rsIncapacidades) {
    for (const row of rs || []) {
      if (row.ID_ORDEN != null) {
        const idOrden = Number(row.ID_ORDEN);
        if (!ordenesInfo.has(idOrden)) {
          ordenesInfo.set(idOrden, { idTipoOrden: Number(row.ID_TIPO_ORDEN || 58) });
        }
      }
    }
  }
  const ordenesDatosPorId     = new Map();
  const ordenesFechasPorId    = new Map();
  const ordenesListaPorId     = new Map();
  const ordenesTextoPorId     = new Map();
  const ordenesEstructuraPorId = new Map();
  if (ordenesInfo.size > 0) {
    const limitInc = pLimit(3);
    await Promise.all([...ordenesInfo.entries()].map(([idOrden, info]) => limitInc(async () => {
      const [datos, fechas, lista, texto, estructura] = await Promise.all([
        HistoriaSP.getOrdenesFormatos(idOrden, idIps, info.idTipoOrden),
        HistoriaSP.getOrdenesFecha(idOrden),
        HistoriaSP.getOrdenesLista(idOrden),
        HistoriaSP.getOrdenesTexto(idOrden),
        HistoriaSP.getOrdenesImpresionFormatos(idOrden, 1),
      ]);
      ordenesDatosPorId.set(idOrden, datos[0] || null);
      ordenesFechasPorId.set(idOrden, fechas);
      ordenesListaPorId.set(idOrden, lista);
      ordenesTextoPorId.set(idOrden, texto);
      ordenesEstructuraPorId.set(idOrden, estructura);
    })));
  }

  const resultado = renderHtmlIncapacidades(payload, rsIncapacidades, {
    ordenesDatosPorId,
    ordenesFechasPorId,
    ordenesListaPorId,
    ordenesTextoPorId,
    ordenesEstructuraPorId,
  });

  if (!resultado) {
    console.log('⚠️  renderHtmlIncapacidades devolvió null/undefined.');
    process.exit(1);
  }

  const outPath = path.join(__dirname, 'test_incapacidad_output.html');
  fs.writeFileSync(outPath, resultado.html, 'utf8');
  console.log(`\n✅ HTML guardado en: ${outPath}`);
  console.log('   Ábrelo en el navegador para verificar el layout.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
