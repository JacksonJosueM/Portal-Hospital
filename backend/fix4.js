const fs = require('fs');
const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `function renderFormulaMedicaPanacea(formulacionRS, ordenesRS, opts = {}, op2Rows = []) {
  const { showTitle = true } = opts;
  const medRsFromOrdenes = (ordenesRS || []).filter(rs =>
    rs && rs.length && String(rs[0].NOMBRE_PLANTILLA).toUpperCase().includes('MEDICAMENTO')
  );
  const allFormulaRS = [...(formulacionRS || []), ...medRsFromOrdenes];

  const filas = [];
  for (const rs of allFormulaRS) {
    if (!rs || !rs.length) continue;
    for (const r of rs) {
      filas.push(r);
    }
  }
  if (!filas.length) return '';

  let html = '';
  if (showTitle) html += '<h3 class="seccion">ORDEN DE MEDICAMENTO:</h3>';
  html += \`
    <table class="orden-table">
      <colgroup>
        <col style="width: 4%"/>
        <col style="width: 40%"/>
        <col style="width: 12%"/>
        <col style="width: 24%"/>
        <col style="width: 12%"/>
        <col style="width: 8%"/>
      </colgroup>
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>Medicamento</th>
          <th style="text-align:center;">V&iacute;a<br>administraci&oacute;n</th>
          <th style="text-align:center;">Dosis</th>
          <th style="text-align:center;">Cantidad total</th>
          <th style="text-align:center;">Estado</th>
        </tr>
      </thead>
      <tbody>
  \`;

  let idx = 1;
  for (const r of filas) {
    const codigo = r.CODIGO_PROCEDIMIENTO || '';
    const desc = r.DESCRIPCION_PROCEDIMIENTO || r.PRUEBA || r.NOMBRE_SERVICIO || '';
    const medicamento = codigo ? \`\${codigo} - \${desc}\` : desc;

    const viaAdmin = escapeHtml(r.VIA_ADMINISTRACION || r.VIA || 'Oral');

    let dosisText = '';
    const codigoMed = (r.CODIGO_PROCEDIMIENTO || '').trim();
    const op2Row = op2Rows.find(row => {
      const itemCode = (String(row.ITEM || '')).split(' - ')[0].trim();
      return itemCode === codigoMed;
    }) || {};
    const dosisTextoRaw = op2Row.DISTANCIA
      || r.DOSIS_ESPECIAL_TEXTO || r.INDICACIONES || r.POSOLOGIA
      || r.DESCRIPCION_POSOLOGIA || r.FRECUENCIA_TEXTO || r.DOSIS_DESCRIPCION;
    if (dosisTextoRaw && String(dosisTextoRaw).trim()) {
      dosisText = String(dosisTextoRaw).trim();
    } else {
      const dosisVal = r.DOSIS || r.CANTIDAD || '1';
      dosisText = \`\${dosisVal} cada 24 horas\`;
    }
    const dias = r.DIAS_TRATAMIENTO;
    if (dias && !dosisText.toLowerCase().includes('durante')) {
      dosisText += \` durante \${dias} d\\u00edas\`;
    }

    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;
    if (cantTotalVal == null) {
      cantTotalVal = '1';
    } else {
      cantTotalVal = Number(cantTotalVal);
    }
    
    // PRIORIDAD PANACEA
    const forma = (op2Row.FORMA_FARMACEUTICA ? String(op2Row.FORMA_FARMACEUTICA).trim() : '') || getFormaFarmaceutica(desc);
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = \`\${cantTotalVal} (\${cantLetras}) \${forma}\`.trim();
    cantidadTotalText = cantidadTotalText.replace(/\\s+/g, ' ');

    html += \`
      <tr>
        <td style="text-align:center;">\${idx++}</td>
        <td>\${escapeHtml(medicamento)}</td>
        <td style="text-align:center;">\${viaAdmin}</td>
        <td>\${escapeHtml(dosisText)}</td>
        <td style="text-align:center;">\${escapeHtml(cantidadTotalText)}</td>
        <td style="text-align:center;">Autorizado</td>
      </tr>
    \`;
  }

  html += \`</tbody></table>\`;
  return html;
}`;

const startIndex = content.indexOf('function renderFormulaMedicaPanacea');
const endIndex = content.indexOf('function renderOrdenesYFormulacion(payload) {');

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + replacement + '\n\n' + content.substring(endIndex);
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('REPLACED WHOLE FUNCTION SUCCESSFULLY');
} else {
    console.log('INDICES NOT FOUND', startIndex, endIndex);
}
