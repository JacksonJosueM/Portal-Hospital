/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PLANTILLA RENDER · Motor de impresión dinámico estilo Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Recibe el `printPayload` que arma `historia.print.service.js` y produce
 *  un HTML listo para Puppeteer, replicando la maqueta que Panacea
 *  Silverlight imprime: encabezado con IPS+sede, identificación del
 *  paciente, secciones de la plantilla iteradas en orden, datos clínicos,
 *  diagnósticos, órdenes, formulación médica, notas y firma del médico.
 *
 *  El motor es **completamente dinámico**: no hardcodea nombres de campos.
 *  Usa la columna ID_TIPO_DATO/TIPO_DATO de cada nodo para escoger el
 *  formateador correcto (texto, decimal, entero, lista, fecha, tabla,
 *  sección/grupo, texto libre, etc.).
 *
 *  Si en el futuro las columnas exactas de QRY_ESTRUCTURA_PLANA_PLANTILLA
 *  difieren un poco, basta con ajustar `getNodeKind()` y los formatters
 *  sin tocar el resto.
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Tipos de dato fijos que entiende el motor ─────────────────────────────
// (corresponden a Dinamico.TP_TIPOS_DATOS_FIJOS de Panacea)
const TIPO = {
  TEXTO: 1,
  DECIMAL: 2,
  ENTERO: 3,
  FECHA: 4,
  LISTA: 5,
  TABLA: 6,
  SECCION: 7,       // contenedor sin valor propio (encabezado/grupo)
  TEXTO_LIBRE: 8,   // texto literal de la plantilla
  IMAGEN: 9,
};

// ── Helpers de formato ────────────────────────────────────────────────────
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\r?\n/g, '<br>');
}

function formatFecha(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDecimal(value, decimales = 2) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function bytesToDataUrl(bytes, mime = 'image/png') {
  if (!bytes) return '';
  if (typeof bytes === 'string' && bytes.startsWith('data:')) return bytes;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ── Lookup por id_estructura_plantilla ────────────────────────────────────
function pickValor(records, preferKeys = ['VALOR', 'valor']) {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  for (const k of preferKeys) {
    if (rec[k] != null) return rec[k];
  }
  return null;
}

function getNodeFieldId(nodo) {
  return (
    nodo.ID_DATO ?? nodo.IdDato ?? nodo.id_dato ??
    nodo.ID_ORIGEN ?? nodo.id_origen ?? null
  );
}

function getNodeStructureId(nodo) {
  return (
    nodo.ID_ESTRUCTURA_PLANTILLA ?? nodo.IdEstructuraPlantilla ??
    nodo.id_estructura_plantilla ?? nodo.ID ?? nodo.id ?? null
  );
}

function getNodeName(nodo, datoMeta) {
  return (
    nodo.NOMBRE ?? nodo.nombre ?? nodo.DESCRIPCION ??
    nodo.TITULO ?? nodo.titulo ??
    (datoMeta && (datoMeta.NOMBRE ?? datoMeta.nombre)) ??
    ''
  );
}

function getNodeTipoDato(nodo, datoMeta) {
  // Prioriza el TIPO declarado en la estructura; si no, el del meta del dato.
  return (
    nodo.ID_TIPO_DATO_FIJO ?? nodo.id_tipo_dato_fijo ??
    nodo.ID_TIPO_DATO ?? nodo.id_tipo_dato ??
    (datoMeta && (datoMeta.ID_TIPO_DATO_FIJO ?? datoMeta.ID_TIPO_DATO)) ??
    null
  );
}

function getNodeNivel(nodo) {
  return nodo.NIVEL ?? nodo.nivel ?? nodo.PROFUNDIDAD ?? 0;
}

// ── Resolución de macros tipo {{NOMBRE_TOKEN}} ────────────────────────────
function resolverTokens(texto, tokens) {
  if (!texto || typeof texto !== 'string') return texto || '';
  return texto.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key) => {
    const v = tokens[key];
    return v == null ? '' : escapeHtml(v);
  });
}

// ── Formateo del valor de un nodo según su tipo ───────────────────────────
function renderValorCampo(nodo, payload) {
  const idEstructura = getNodeStructureId(nodo);
  const idDato = getNodeFieldId(nodo);
  const datoMeta = idDato != null ? payload.datos.get(idDato) : null;
  const tipo = getNodeTipoDato(nodo, datoMeta && datoMeta.meta);
  const decimales = (datoMeta && datoMeta.meta && datoMeta.meta.DECIMALES) || 2;

  const valores = payload.valoresPorEstructura;

  switch (tipo) {
    case TIPO.TEXTO: {
      const recs = valores.texto.get(idEstructura) || valores.laboratorioTexto.get(idEstructura);
      return escapeHtml(pickValor(recs));
    }
    case TIPO.DECIMAL: {
      const recs = valores.decimal.get(idEstructura);
      const v = pickValor(recs);
      return formatDecimal(v, decimales);
    }
    case TIPO.ENTERO: {
      const recs = valores.enteros.get(idEstructura);
      const v = pickValor(recs);
      return v == null ? '' : escapeHtml(parseInt(v, 10));
    }
    case TIPO.FECHA: {
      const recs = valores.fecha.get(idEstructura);
      return formatFecha(pickValor(recs));
    }
    case TIPO.LISTA: {
      const recs = valores.lista.get(idEstructura) || [];
      // Una lista puede tener múltiples valores seleccionados
      return recs
        .map((r) => escapeHtml(r.VALOR ?? r.DESCRIPCION ?? r.valor))
        .filter(Boolean)
        .join(', ');
    }
    case TIPO.TABLA: {
      return renderTabla(nodo, datoMeta, valores.tabla.get(idEstructura) || []);
    }
    case TIPO.IMAGEN: {
      // Las imágenes a nivel de plantilla suelen venir en STP_DATOS_IMAGENES
      const img = datoMeta && datoMeta.imagenes && datoMeta.imagenes[0];
      if (!img) return '';
      const url = img.IMAGEN
        ? bytesToDataUrl(img.IMAGEN, img.TIPO_MIME || 'image/png')
        : (img.RUTA || '');
      return `<img src="${url}" alt="${escapeHtml(img.NOMBRE || '')}" style="max-width:100%;">`;
    }
    case TIPO.TEXTO_LIBRE:
    default: {
      // Si no se reconoce el tipo, intentar todos los buckets en orden
      for (const bucket of ['texto', 'decimal', 'enteros', 'fecha', 'lista', 'laboratorioTexto']) {
        const recs = valores[bucket].get(idEstructura);
        if (recs && recs.length) {
          return bucket === 'fecha' ? formatFecha(pickValor(recs)) : escapeHtml(pickValor(recs));
        }
      }
      return '';
    }
  }
}

function renderTabla(nodo, datoMeta, filas) {
  if (!filas || filas.length === 0) return '<em>(sin datos)</em>';
  const columnasMeta = (datoMeta && datoMeta.camposTabla) || [];

  // Columnas únicas detectadas en las filas
  const columnasDetectadas = new Set();
  for (const f of filas) {
    if (f.COLUMNA != null) columnasDetectadas.add(f.COLUMNA);
  }
  const columnas = Array.from(columnasDetectadas).sort((a, b) => a - b);

  // Filas únicas
  const filasIds = Array.from(new Set(filas.map((f) => f.FILA))).sort((a, b) => a - b);

  // Headers
  let html = '<table class="tabla-dinamica"><thead><tr>';
  for (const col of columnas) {
    const meta = columnasMeta.find((c) => (c.ID_DATO_COLUMNA ?? c.ORDEN) === col);
    html += `<th>${escapeHtml((meta && (meta.NOMBRE || meta.DESCRIPCION)) || `Col ${col}`)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const filaId of filasIds) {
    html += '<tr>';
    for (const col of columnas) {
      const celda = filas.find((f) => f.FILA === filaId && f.COLUMNA === col);
      html += `<td>${escapeHtml(celda ? celda.VALOR : '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ── Render de la plantilla completa ──────────────────────────────────────
function renderEstructura(payload) {
  const estructura = payload.plantilla.estructura || [];
  let html = '';
  for (const nodo of estructura) {
    const idDato = getNodeFieldId(nodo);
    const datoMeta = idDato != null ? payload.datos.get(idDato) : null;
    const tipo = getNodeTipoDato(nodo, datoMeta && datoMeta.meta);
    const nivel = getNodeNivel(nodo);
    const nombre = escapeHtml(getNodeName(nodo, datoMeta && datoMeta.meta));

    // Sección / grupo: sólo encabezado
    if (tipo === TIPO.SECCION || idDato == null) {
      const tag = nivel <= 1 ? 'h2' : 'h3';
      if (nombre) html += `<${tag} class="seccion">${nombre}</${tag}>`;
      continue;
    }

    // Texto libre de la plantilla
    if (tipo === TIPO.TEXTO_LIBRE) {
      const literal = nodo.VALOR_LITERAL ?? nodo.DESCRIPCION ?? '';
      html += `<p class="texto-libre">${resolverTokens(literal, payload.tokens)}</p>`;
      continue;
    }

    // Campo con valor
    const valor = renderValorCampo(nodo, payload);
    if (tipo === TIPO.TABLA || tipo === TIPO.IMAGEN) {
      html += `<div class="campo-block"><b>${nombre}</b>${valor ? `<div>${valor}</div>` : ''}</div>`;
    } else {
      html += `<div class="campo-line"><b>${nombre}:</b> ${valor || ''}</div>`;
    }
  }
  return html;
}

// ── Bloques específicos: identificación, diagnósticos, órdenes, etc. ─────
function renderEncabezado(payload) {
  const ips = payload.ips || {};
  const sede = payload.sede || {};
  const logo = payload.logoIps && payload.logoIps.LOGO
    ? bytesToDataUrl(payload.logoIps.LOGO, payload.logoIps.TIPO_MIME || 'image/png')
    : '';

  const razonSocial = ips.RAZON_SOCIAL || ips.razon_social || '';
  const sigla = ips.SIGLA || ips.sigla || '';
  const nombreSede = sede.NOMBRE || sede.nombre || '';
  const direccion = sede.DIRECCION || ips.DIRECCION || '';
  const telefono = sede.TELEFONO || ips.TELEFONO || '';

  const fechaImpresion = new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return `
    <table class="header-table">
      <tr>
        <td style="width:80px">${logo ? `<img src="${logo}" style="max-width:80px;max-height:80px;">` : ''}</td>
        <td class="header-center">
          <b>${escapeHtml(razonSocial)}</b><br>
          ${sigla ? escapeHtml(sigla) + '<br>' : ''}
          ${nombreSede ? escapeHtml(nombreSede) + '<br>' : ''}
          ${escapeHtml(direccion)} ${telefono ? '· ' + escapeHtml(telefono) : ''}
        </td>
        <td class="header-right">
          Fecha impresión: ${fechaImpresion}<br>
          Copia
        </td>
      </tr>
    </table>
  `;
}

function renderDiagnosticos(payload) {
  const dx = payload.clinico.diagnosticos || [];
  if (!dx.length) return '';
  let html = '<h2 class="seccion">DIAGNÓSTICOS</h2><table class="tabla-dinamica"><thead><tr><th>CIE</th><th>Descripción</th><th>Tipo</th></tr></thead><tbody>';
  for (const d of dx) {
    html += `<tr>
      <td>${escapeHtml(d.CODIGO_CIE)}</td>
      <td>${escapeHtml(d.DESCRIPCION_CIE)}</td>
      <td>${escapeHtml(d.DESCRIPCION_TIPO_DX_PPAL || d.ID_TIPO_DIAGNOSTICO || '')}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function renderAlergias(payload) {
  const al = payload.paciente.alergias || [];
  if (!al.length) return '';
  let html = '<h3 class="seccion">ALERGIAS</h3><ul>';
  for (const a of al) {
    html += `<li>${escapeHtml(a.NOMBRE || a.CODIGO || '')}${a.ADICION ? ' — ' + escapeHtml(a.ADICION) : ''}</li>`;
  }
  html += '</ul>';
  return html;
}

function renderAntecedentes(payload) {
  const ant = payload.paciente.antecedentes || [];
  if (!ant.length) return '';
  let html = '<h3 class="seccion">ANTECEDENTES PERSONALES</h3>';
  for (const a of ant) {
    if (!a.ANTECEDENTE) continue;
    html += `<div class="campo-line">${escapeHtml(a.ANTECEDENTE)}</div>`;
  }
  return html;
}

function renderOrdenesYFormulacion(payload) {
  const ordenesRS = payload.clinico.ordenes || [];
  const formulacionRS = payload.clinico.formulacion || [];
  let html = '';

  // Las QRY_* devuelven varios recordsets; renderizamos cada uno como tabla
  const renderRecordsets = (titulo, recordsets) => {
    let out = '';
    let primero = true;
    for (const rs of recordsets || []) {
      if (!rs || rs.length === 0) continue;
      if (primero) {
        out += `<h2 class="seccion">${titulo}</h2>`;
        primero = false;
      }
      const cols = Object.keys(rs[0]);
      out += '<table class="tabla-dinamica"><thead><tr>';
      for (const c of cols) out += `<th>${escapeHtml(c)}</th>`;
      out += '</tr></thead><tbody>';
      for (const r of rs) {
        out += '<tr>';
        for (const c of cols) out += `<td>${escapeHtml(r[c])}</td>`;
        out += '</tr>';
      }
      out += '</tbody></table>';
    }
    return out;
  };

  html += renderRecordsets('ÓRDENES', ordenesRS);
  html += renderRecordsets('FÓRMULA MÉDICA', formulacionRS);
  return html;
}

function renderFirma(payload) {
  const prof = payload.profesional && payload.profesional.meta;
  if (!prof) return '';
  const nombre = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ');
  const ident = `${prof.ID_TIPO_IDENTIFICACION || ''} ${prof.NUMERO_IDENTIFICACION || ''}`.trim();

  const firmaRec = (payload.profesional.firma || [])[0];
  const firmaImg = firmaRec && firmaRec.IMAGEN
    ? `<img src="${bytesToDataUrl(firmaRec.IMAGEN, firmaRec.TIPO_MIME || 'image/png')}" style="max-height:60px;">`
    : '';

  return `
    <div class="firma-block">
      ${firmaImg}
      <div class="firma-line"></div>
      <div><b>${escapeHtml(nombre)}</b></div>
      <div>${escapeHtml(ident)}</div>
      <div>${escapeHtml(prof.DESCRIPCION || '')}</div>
    </div>
  `;
}

// ── Estilos derivados de STP_PARAMETROS_IMPRESION ────────────────────────
function buildEstilos(parametros) {
  const p = (parametros && parametros[0]) || {};
  const tamanio = p.TAMANIO_FUENTE || 9;
  const interlineado = (p.INTERLINEADO || 14) / 10;
  const mt = p.MARGEN_SUPERIOR ?? 12;
  const mb = p.MARGEN_INFERIOR ?? 12;
  const ml = p.MARGEN_IZQUIERDO ?? 10;
  const mr = p.MARGEN_DERECHO ?? 10;

  return `
    @page { size: Letter; margin: ${mt}mm ${mr}mm ${mb}mm ${ml}mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: ${tamanio}px; color: #000; line-height: ${interlineado}; margin: 0; padding: 0; }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .header-table td { vertical-align: middle; padding: 2px 4px; border: none; }
    .header-center { text-align: center; }
    .header-right { text-align: right; font-size: 8px; }
    h2.seccion { font-size: ${tamanio + 1}px; text-transform: uppercase; text-decoration: underline; margin: 10px 0 4px 0; }
    h3.seccion { font-size: ${tamanio}px; text-transform: uppercase; text-decoration: underline; margin: 6px 0 3px 0; }
    .campo-line { margin: 1px 0; }
    .campo-block { margin: 4px 0; }
    .texto-libre { margin: 4px 0; }
    .tabla-dinamica { width: 100%; border-collapse: collapse; margin: 4px 0; }
    .tabla-dinamica th, .tabla-dinamica td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; font-size: ${tamanio}px; }
    .tabla-dinamica th { background: #f0f0f0; font-weight: bold; }
    .firma-block { margin-top: 40px; }
    .firma-line { border-top: 1px solid #000; width: 250px; margin: 6px 0 2px 0; }
    .footer { margin-top: 12px; text-align: right; font-size: 7px; color: #444; }
  `;
}

/**
 * Genera el HTML completo a partir del `printPayload`.
 *
 * @param {object} payload  Resultado de `historia.print.service.imprimirAtencion()`
 * @returns {{ html: string, parametros: object }}
 */
function renderHtml(payload) {
  const estilos = buildEstilos(payload.parametros);

  const cuerpo = `
    ${renderEncabezado(payload)}
    <h1 class="seccion" style="text-align:center">${escapeHtml(payload.plantilla.meta && (payload.plantilla.meta.NOMBRE || payload.plantilla.meta.IDENTIFICADOR) || 'HISTORIA CLÍNICA')}</h1>
    ${renderEstructura(payload)}
    ${renderAlergias(payload)}
    ${renderAntecedentes(payload)}
    ${renderDiagnosticos(payload)}
    ${renderOrdenesYFormulacion(payload)}
    ${renderFirma(payload)}
    <div class="footer">Atención: ${escapeHtml(payload.atencion.ID || payload.atencion.ID_ATENCION || '')} · Plantilla: ${escapeHtml((payload.plantilla.meta && payload.plantilla.meta.ID) || '')}</div>
  `;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>${estilos}</style>
</head>
<body>
${cuerpo}
</body>
</html>`;

  return {
    html,
    parametros: (payload.parametros && payload.parametros[0]) || {},
  };
}

module.exports = { renderHtml };
