const { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras } = require('./utils');

const denylist = new Set([
  'CONSECUTIVO', 'ID_ORDEN', 'TIPO_ORDEN', 'ID_PRESTADOR', 'ID_SERVICIO',
  'ID_ESTRUCTURA', 'ID_PLANTILLA', 'ID_PROCEDIMIENTO', 'ID_ATENCION',
  'USER_NAME', 'USUARIO', 'ID_EMPLEADO', 'ID_DX', 'ID_ARTICULO', 'ID_BODEGA'
]);

function renderRecordsets(titulo, recordsets) {
  let out = '';
  let primero = true;
  for (const rs of recordsets || []) {
    if (!rs || rs.length === 0) continue;
    if (primero) {
      out += `<h2 class="seccion">${titulo}</h2>`;
      primero = false;
    }

    // Filtrar columnas
    const allCols = Object.keys(rs[0]);
    const cols = allCols.filter(c => !denylist.has(c.toUpperCase()));

    out += '<table class="tabla-dinamica"><thead><tr>';
    for (const c of cols) {
      // Limpiar nombres de columnas (quitar guiones bajos por espacios para mejor wrap)
      const label = c.replace(/_/g, ' ');
      out += `<th>${escapeHtml(label)}</th>`;
    }
    out += '</tr></thead><tbody>';

    for (const r of rs) {
      out += '<tr>';
      for (const c of cols) {
        out += `<td>${escapeHtml(r[c])}</td>`;
      }
      out += '</tr>';
    }
    out += '</tbody></table>';
  }
  return out;
}

function renderDiagnosticos(payload) {
  const dx = payload.clinico.diagnosticos || [];
  if (!dx.length) return '';

  const esPrincipal = (d) => {
    const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
    const tipoRips = d.ID_TIPO_DIAGNOSTICO_RIPS;
    return d.PRINCIPAL === 1
      || d.ES_PRINCIPAL === 1
      || tipoRips === 0
      || tipoRips === '0'
      || tipo.includes('PRINCIPAL')
      || tipo.includes('INGRESO');
  };

  const principal = dx.find(esPrincipal) || dx[0];
  const relacionados = dx.filter(d => d !== principal);

  const codigoPrincipal = principal.CODIGO_CIE || principal.CIE || '';
  const descripcionPrincipal = principal.DESCRIPCION_CIE || principal.DESCRIPCION || '';
  const tipoPrincipal = principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || principal.TIPO || '';

  let html = '<h3 class="seccion">DIAGN&Oacute;STICOS</h3>';
  html += `<div class="campo-line"><b>Principal Ingreso:</b> <span class="val">${escapeHtml(`${codigoPrincipal} - ${descripcionPrincipal}`.trim().replace(/^-\s*/, ''))}</span></div>`;

  if (tipoPrincipal || relacionados.length) {
    let lineaRelacionados = '';
    if (relacionados.length) {
      const rel = relacionados
        .map((d, i) => {
          const cod = d.CODIGO_CIE || d.CIE || '';
          const des = d.DESCRIPCION_CIE || d.DESCRIPCION || '';
          return `Relacionado ${i + 1} Ingreso: ${cod} - ${des}`.replace(/\s-\s$/, '');
        })
        .join('  ');
      lineaRelacionados = rel;
    }

    const baseTipo = tipoPrincipal ? `Tipo principal: ${tipoPrincipal}` : '';
    const contenido = [baseTipo, lineaRelacionados].filter(Boolean).join('    ');
    html += `<div class="campo-line"><span class="val">${escapeHtml(contenido)}</span></div>`;
  }

  return html;
}

function renderAlergias(payload) {
  const al = payload.paciente.alergias || [];
  if (!al.length) return '';
  let html = '<h3 class="seccion">ALERGIAS</h3><ul>';
  for (const a of al) {
    html += `<li>${escapeHtml(a.NOMBRE || a.CODIGO || '')}${a.ADICION ? ' â€” ' + escapeHtml(a.ADICION) : ''}</li>`;
  }
  html += '</ul>';
  return html;
}

function renderAntecedentes(payload) {
  const ant = payload.paciente.antecedentes || [];
  if (!ant.length) return '';

  const validos = [];
  for (const a of ant) {
    if (!a.ANTECEDENTE) continue;
    const textOnly = String(a.ANTECEDENTE).replace(/<[^>]*>/g, '').trim();
    // Omitir si es un "1", est&aacute; vac&iacute;o, o son solo fechas basura
    if (textOnly === '' || textOnly === '1' || /^[\d\s\/:\.ampAMP,\-]+$/.test(textOnly)) {
      continue;
    }
    validos.push(a.ANTECEDENTE);
  }

  if (validos.length === 0) return '';

  let html = '<h3 class="seccion">ANTECEDENTES PERSONALES</h3>';
  for (const v of validos) {
    html += `<div class="campo-line">${escapeHtml(v)}</div>`;
  }
  return html;
}

function renderSintomas(payload) {
  const sin = payload.clinico.sintomas || [];
  if (!sin.length) return '';
  let html = '<h3 class="seccion">S&Iacute;NTOMAS</h3><ul>';
  for (const s of sin) {
    html += `<li>${escapeHtml(s.NOMBRE_SINTOMA || s.NOMBRE || '')}</li>`;
  }
  html += '</ul>';
  return html;
}

function renderCalculosRiesgo(payload) {
  const cr = payload.clinico.calculosRiesgo || [];
  if (!cr.length) return '';
  let html = '<h2 class="seccion">CÃLCULOS DE RIESGO</h2><table class="tabla-dinamica"><thead><tr><th>Nombre</th><th>Interpretaci&oacute;n</th><th>Puntaje Total</th><th>Observaciones</th></tr></thead><tbody>';
  for (const c of cr) {
    html += `<tr>
      <td>${escapeHtml(c.NOMBRE || '')}</td>
      <td>${escapeHtml(c.INTERPRETACION || '')}</td>
      <td>${escapeHtml(c.TOTAL || '')}</td>
      <td>${escapeHtml(c.OBSERVACIONES || '')}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function renderNotas(payload) {
  const notas = payload.clinico.notas || [];
  if (!notas.length) return '';
  let html = '<h2 class="seccion">NOTAS ACLARATORIAS</h2>';
  for (const n of notas) {
    html += `<div class="campo-line"><b>${escapeHtml(formatFecha(n.FECHA_REGISTRO))}:</b> <span class="val">${escapeHtml(n.NOTA || '')}</span></div>`;
  }
  return html;
}

function renderGraficas(payload) {
  const graficas = payload.clinico.graficas || [];
  if (!graficas.length) return '';
  let html = '<h2 class="seccion">GRÃFICAS E IMÃGENES DE ATENCI&Oacute;N</h2>';
  for (const g of graficas) {
    if (!g.GRAFICA_BYTES) continue;
    const url = bytesToDataUrl(g.GRAFICA_BYTES, g.TIPO_MIME || 'image/png');
    html += `<div class="campo-block"><b>${escapeHtml(g.NOMBRE || 'Gr&aacute;fica')}</b><br><img src="${url}" style="max-width:100%; margin-top:8px;"></div>`;
  }
  return html;
}

function renderTratamientosOdonto(payload) {
  const tratamientos = payload.clinico.tratamientosOdonto || [];
  if (!tratamientos || tratamientos.length === 0) return '';
  return renderRecordsets('TRATAMIENTOS ODONTOL&Oacute;GICOS', tratamientos);
}
module.exports = { renderRecordsets, renderDiagnosticos, renderAlergias, renderAntecedentes, renderSintomas, renderCalculosRiesgo, renderNotas, renderGraficas, renderTratamientosOdonto };
