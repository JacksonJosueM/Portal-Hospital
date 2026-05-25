'use strict';
// Genera solo el HTML del PDF de fórmula médica para verificación visual
// Evita muhammara/PDF para poder inspeccionar el layout en el navegador

const path = require('path');
const fs   = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
// Cambia este ID por uno que tenga fórmula médica
const ID_ATENCION = 198865;

require('dotenv').config({ path: path.join(__dirname, '.env') });
const HistoriaPrintService = require('./services/historia.print.service');
const { clasificarTodasLasOrdenes, renderHtmlFormula } = require('./services/plantilla.render');
const HistoriaSP = require('./services/panacea/historiaSP');

async function main() {
  console.log(`\n📄 Cargando atención ${ID_ATENCION}...`);
  const payload = await HistoriaPrintService.imprimirAtencion(ID_ATENCION, {
    registrarCopia: false,
    numeroCopias: 0,
  });
  console.log('✅ Datos obtenidos.');

  const clasificados = clasificarTodasLasOrdenes(
    payload.clinico.ordenes     || [],
    payload.clinico.formulacion || []
  );
  const rsMedicamentos = clasificados.medicamentos || [];

  if (!rsMedicamentos.length) {
    console.log('⚠️  No hay fórmulas médicas en esta atención.');
    process.exit(0);
  }

  // ── Datos de diagnóstico ─────────────────────────────────────────────────
  const primeraFila = (rsMedicamentos[0] || [])[0] || {};
  const b3 = (payload.atencion && payload.atencion.basico_op3) || {};
  const at = payload.atencion || {};
  const prof = payload.profesional && payload.profesional.meta;
  const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];

  console.log('\n🔍 [H1] Campos primera fila de fórmula (dosis, vigencia, etc.):');
  Object.entries(primeraFila).forEach(([k, v]) => {
    if (v != null && v !== '') console.log(`   ${k}: ${JSON.stringify(v)}`);
  });

  console.log('\n🔍 [H2] Campos b3 (tipo_usuario, categoria, via_ingreso, ambito):');
  Object.entries(b3).forEach(([k, v]) => {
    if (v != null && v !== '') console.log(`   ${k}: ${JSON.stringify(v)}`);
  });

  console.log('\n🔍 [H3] Campos payload.atencion (top-level):');
  Object.entries(at).forEach(([k, v]) => {
    if (v != null && v !== '' && typeof v !== 'object') console.log(`   ${k}: ${JSON.stringify(v)}`);
  });

  console.log('\n🔍 [H4] Primer diagnóstico:');
  if (dxList[0]) Object.entries(dxList[0]).forEach(([k, v]) => {
    if (v != null && v !== '') console.log(`   ${k}: ${JSON.stringify(v)}`);
  });

  console.log('\n🔍 [H5] Profesional meta:');
  if (prof) Object.entries(prof).forEach(([k, v]) => {
    if (v != null && v !== '') console.log(`   ${k}: ${JSON.stringify(v)}`);
  });

  // #region agent log
  fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6767d5' },
    body: JSON.stringify({
      sessionId: '6767d5', location: 'test_formula_html.js:diagnóstico',
      message: 'datos formula diagnóstico',
      data: {
        primeraFila,
        b3_keys: Object.keys(b3).filter(k => b3[k] != null && b3[k] !== ''),
        at_keys: Object.keys(at).filter(k => at[k] != null && at[k] !== '' && typeof at[k] !== 'object'),
        dx0: dxList[0] || null,
        prof_meta: prof || null,
      },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion

  // ── CONFIRMADO: usar getOrdenesFormatosOp2 (OPERACION=2) para datos completos ──
  let datosOrdenFormula = null;
  let op2RowsFormula    = [];

  const ID_ORDEN = 138150;

  // H_OP2: QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2 — la llamada real que hace Panacea
  console.log(`\n🔍 [H_OP2] QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2 (ID_ITEM=${ID_ORDEN})`);
  try {
    const op2 = await HistoriaSP.getOrdenesFormatosOp2(ID_ORDEN);
    console.log(`   → Filas: ${op2.length}`);
    if (op2.length) {
      op2RowsFormula    = op2;
      datosOrdenFormula = op2[0];
      console.log('   ✅ CONFIRMADO — asignado datosOrdenFormula y op2RowsFormula');
      console.log(`   TIPO_USUARIO: ${op2[0].TIPO_USUARIO}`);
      console.log(`   CATEGORIA_CONVENIO: ${op2[0].CATEGORIA_CONVENIO}`);
      console.log(`   ID_ORIGEN_VIA_INGRESO: ${op2[0].ID_ORIGEN_VIA_INGRESO}`);
      console.log(`   ID_AMBITO: ${op2[0].ID_AMBITO}`);
      console.log(`   TIPO_USO: ${op2[0].TIPO_USO}`);
      console.log(`   FECHA_INICIO: ${op2[0].FECHA_INICIO}`);
      console.log(`   FECHA_TERMINACION: ${op2[0].FECHA_TERMINACION}`);
      console.log(`   DISTANCIA[0]: ${op2[0].DISTANCIA}`);
    }
    // #region agent log
    fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'test_formula_html.js:H_OP2',message:'QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2',hypothesisId:'H_OP2',data:{rowCount:op2.length,fila0:op2[0]||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch(e) { console.log(`   Error: ${e.message}`); }

  // H_OP1: QRY_IMPRESION_ORDENES_FORMATOS OPERACION=1
  console.log(`\n🔍 [H_OP1] QRY_IMPRESION_ORDENES_FORMATOS OPERACION=1 (ID_ITEM=${ID_ORDEN})`);
  try {
    const op1 = await HistoriaSP.getOrdenesFormatosOp1(ID_ORDEN);
    console.log(`   → Filas: ${op1.length}`);
    if (op1.length) {
      Object.entries(op1[0]).forEach(([k,v]) => { if (v != null) console.log(`   ${k}: ${JSON.stringify(v)}`); });
    }
    // #region agent log
    fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'test_formula_html.js:H_OP1',message:'QRY_IMPRESION_ORDENES_FORMATOS OPERACION=1',hypothesisId:'H_OP1',data:{rowCount:op1.length,fila0:op1[0]||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch(e) { console.log(`   Error: ${e.message}`); }

  // H_FORMATOS: STM_FORMATOS OPERACION=3
  console.log(`\n🔍 [H_FORMATOS] STM_FORMATOS OPERACION=3 (ID=${ID_ORDEN})`);
  try {
    const fmt = await HistoriaSP.getFormatos(ID_ORDEN);
    console.log(`   → Resultado:`, fmt ? 'OK' : 'null');
    if (fmt) Object.entries(fmt).forEach(([k,v]) => { if (v != null && v !== '') console.log(`   ${k}: ${JSON.stringify(v)}`); });
    // #region agent log
    fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'test_formula_html.js:H_FORMATOS',message:'STM_FORMATOS OPERACION=3',hypothesisId:'H_FORMATOS',data:{fmt},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch(e) { console.log(`   Error: ${e.message}`); }

  // H_TEXTO: STM_ORDENES_TEXTO OPERACION=4 — posible texto de dosis
  console.log(`\n🔍 [H_TEXTO] STM_ORDENES_TEXTO OPERACION=4 (ID_ORDEN=${ID_ORDEN})`);
  try {
    const texto = await HistoriaSP.getOrdenesTexto(ID_ORDEN);
    console.log(`   → Filas: ${texto.length}`);
    texto.forEach((r,i) => { console.log(`   [${i}]`); Object.entries(r).forEach(([k,v]) => { if (v != null && v !== '') console.log(`      ${k}: ${JSON.stringify(v)}`); }); });
    // #region agent log
    fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'test_formula_html.js:H_TEXTO',message:'STM_ORDENES_TEXTO OPERACION=4',hypothesisId:'H_TEXTO',data:{rows:texto},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch(e) { console.log(`   Error: ${e.message}`); }

  // H_DX_ORDEN: STM_ORDENES_DIAGNOSTICOS OPERACION=4
  console.log(`\n🔍 [H_DX_ORDEN] STM_ORDENES_DIAGNOSTICOS OPERACION=4 (ID_ORDEN=${ID_ORDEN})`);
  try {
    const dxOrden = await HistoriaSP.getOrdenesDiagnosticos(ID_ORDEN);
    console.log(`   → Filas: ${dxOrden.length}`);
    dxOrden.forEach((r,i) => { console.log(`   [${i}]`); Object.entries(r).forEach(([k,v]) => { if (v != null && v !== '') console.log(`      ${k}: ${JSON.stringify(v)}`); }); });
    // #region agent log
    fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6767d5'},body:JSON.stringify({sessionId:'6767d5',location:'test_formula_html.js:H_DX_ORDEN',message:'STM_ORDENES_DIAGNOSTICOS OPERACION=4',hypothesisId:'H_DX_ORDEN',data:{rows:dxOrden},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch(e) { console.log(`   Error: ${e.message}`); }

  const resultado = renderHtmlFormula(payload, rsMedicamentos, datosOrdenFormula, op2RowsFormula);

  if (!resultado) {
    console.log('⚠️  renderHtmlFormula devolvió null/undefined.');
    process.exit(1);
  }

  const outPath = path.join(__dirname, 'test_formula_output.html');
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
