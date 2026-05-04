/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PLANTILLA RENDER · Motor de impresión dinámico estilo Panacea
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Recibe el `printPayload` que arma `historia.print.service.js` y produce
 *  un HTML listo para Puppeteer, replicando la maqueta que Panacea
 *  Silverlight imprime.
 *
 *  Todas las columnas ya vienen normalizadas a UPPER_SNAKE_CASE por la
 *  capa de wrappers SP (normalizeColumns.js).
 *
 *  Estructura de la plantilla (QRY_ESTRUCTURA_PLANA_PLANTILLA):
 *    ORIGEN          3=pestaña(sección), 2=grupo, 1=dato
 *    ID              GUID — PK del nodo
 *    ID_ESTRUCTURA   int  — ID del dato/grupo/pestaña subyacente
 *    ID_ESTRUCTURA_PADRE  GUID — nodo padre (permite árbol multinivel)
 *    TIPO_DATO_FIJO  int  — tipo fijo (1=texto,2=decimal,...,9=imagen)
 *    TIPO_DATO       int  — tipo genérico (cuando TIPO_DATO_FIJO=0)
 *    NOMBRE          string
 *    ORDEN           int  — orden dentro de su padre
 *
 *  Los STM_DATOS_* usan ID_ESTRUCTURA_PLANTILLA (GUID) = nodo.ID
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Tipos de dato fijo (TIPO_DATO_FIJO de Panacea) ───────────────────────
const TIPO_FIJO = {
  SISTEMA: 1,       // dato fijo del sistema (rellenado por el token, no por STM_DATOS_*)
  DECIMAL: 2,
  ENTERO: 3,
  SELECCION: 4,     // selección / combo
  LISTA: 5,
  TABLA: 6,
  SECCION: 7,
  TEXTO_LIBRE: 8,
  IMAGEN: 9,
};

// ── Tipos de dato genérico (TIPO_DATO cuando TIPO_DATO_FIJO=0) ───────────
const TIPO_DATO = {
  NUMERICO: 1,
  DECIMAL: 2,
  LISTA_VALORES: 4,
  TEXTO: 5,          // texto multilínea
  FECHA: 8,
  LOGICO: 10,        // booleano
  CALCULADO: 11,
  TEXTO_LARGO: 17,   // texto lista/largo
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

// ── Resolución de macros tipo {{NOMBRE_TOKEN}} ────────────────────────────
function resolverTokens(texto, tokens) {
  if (!texto || typeof texto !== 'string') return texto || '';
  return texto.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (m, key) => {
    const v = tokens[key];
    return v == null ? '' : escapeHtml(v);
  });
}

// ── Árbol de la plantilla ─────────────────────────────────────────────────
/**
 * Reconstruye el árbol de la estructura plana usando ID_ESTRUCTURA_PADRE.
 * Retorna los nodos raíz con propiedad `children` agregada.
 */
function buildTree(estructura) {
  const byId = new Map();
  for (const nodo of estructura) {
    nodo.children = [];
    byId.set(nodo.ID, nodo);
  }

  const roots = [];
  for (const nodo of estructura) {
    const parentId = nodo.ID_ESTRUCTURA_PADRE;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(nodo);
    } else {
      roots.push(nodo);
    }
  }

  // Ordenar hijos por ORDEN
  const sortChildren = (nodes) => {
    nodes.sort((a, b) => (a.ORDEN || 0) - (b.ORDEN || 0));
    for (const n of nodes) {
      if (n.children.length) sortChildren(n.children);
    }
  };
  sortChildren(roots);

  return roots;
}

// ── Resolución del valor de un campo ──────────────────────────────────────
function getValor(nodo, payload) {
  const guid = nodo.ID; // GUID del nodo → clave en valoresPorEstructura
  const valores = payload.valoresPorEstructura;
  const tipoFijo = nodo.TIPO_DATO_FIJO || 0;
  const tipoDato = nodo.TIPO_DATO || 0;
  const decimales = nodo.DECIMALES || 2;

  // Si es dato del sistema (TIPO_DATO_FIJO=1), buscar en tokens
  if (tipoFijo === TIPO_FIJO.SISTEMA) {
    const paramSp = nodo.PARAMETRO_SP;
    if (paramSp && payload.tokens[paramSp] != null) {
      return escapeHtml(payload.tokens[paramSp]);
    }
    return '';
  }

  // Determinar el tipo efectivo
  let efectivo = tipoFijo;
  if (tipoFijo === 0 || tipoFijo == null) {
    // Usar TIPO_DATO para mapear al bucket correcto
    switch (tipoDato) {
      case TIPO_DATO.TEXTO:
      case TIPO_DATO.TEXTO_LARGO:
        efectivo = 'texto';
        break;
      case TIPO_DATO.NUMERICO:
      case TIPO_DATO.CALCULADO:
        efectivo = 'enteros';
        break;
      case TIPO_DATO.DECIMAL:
        efectivo = 'decimal';
        break;
      case TIPO_DATO.LISTA_VALORES:
        efectivo = 'lista';
        break;
      case TIPO_DATO.FECHA:
        efectivo = 'fecha';
        break;
      case TIPO_DATO.LOGICO:
        efectivo = 'enteros';
        break;
      default:
        efectivo = null;
        break;
    }

    // Acceso directo por bucket name
    if (typeof efectivo === 'string') {
      const recs = valores[efectivo].get(guid) || valores.laboratorioTexto.get(guid);
      if (recs && recs.length) {
        if (efectivo === 'fecha') return formatFecha(pickValor(recs));
        if (efectivo === 'decimal') return formatDecimal(pickValor(recs), decimales);
        if (efectivo === 'lista') {
          return recs
            .map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? r.DESCRIPCION ?? ''))
            .filter(Boolean)
            .join(', ');
        }
        return escapeHtml(pickValor(recs));
      }
      return '';
    }
  }

  // Resolver por TIPO_DATO_FIJO
  switch (efectivo) {
    case TIPO_FIJO.DECIMAL: {
      const recs = valores.decimal.get(guid);
      return formatDecimal(pickValor(recs), decimales);
    }
    case TIPO_FIJO.ENTERO: {
      const recs = valores.enteros.get(guid);
      const v = pickValor(recs);
      return v == null ? '' : escapeHtml(parseInt(v, 10));
    }
    case TIPO_FIJO.SELECCION:
    case TIPO_FIJO.LISTA: {
      const recs = valores.lista.get(guid) || [];
      return recs
        .map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? r.DESCRIPCION ?? ''))
        .filter(Boolean)
        .join(', ');
    }
    case TIPO_FIJO.TABLA: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      return renderTabla(datoMeta, valores.tabla.get(guid) || []);
    }
    case TIPO_FIJO.IMAGEN: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      const img = datoMeta && datoMeta.imagenes && datoMeta.imagenes[0];
      if (!img) return '';
      const url = img.IMAGEN
        ? bytesToDataUrl(img.IMAGEN, img.TIPO_MIME || 'image/png')
        : (img.RUTA || '');
      return `<img src="${url}" alt="${escapeHtml(img.NOMBRE || '')}" style="max-width:100%;">`;
    }
    default: {
      // Fallback: probar todos los buckets
      for (const bucket of ['texto', 'decimal', 'enteros', 'fecha', 'lista', 'laboratorioTexto']) {
        const recs = valores[bucket].get(guid);
        if (recs && recs.length) {
          if (bucket === 'fecha') return formatFecha(pickValor(recs));
          if (bucket === 'decimal') return formatDecimal(pickValor(recs), decimales);
          if (bucket === 'lista') {
            return recs.map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? '')).filter(Boolean).join(', ');
          }
          return escapeHtml(pickValor(recs));
        }
      }
      return '';
    }
  }
}

function pickValor(records) {
  if (!records || records.length === 0) return null;
  const rec = records[0];
  // Intentar todas las variantes de nombre de valor
  return (
    rec.VALOR ?? rec.VALOR_TEXTO ?? rec.VALOR_ENTEROS ??
    rec.VALOR_DECIMAL ?? rec.VALOR_FECHA ?? rec.VALOR_LISTA ?? null
  );
}

function renderTabla(datoMeta, filas) {
  if (!filas || filas.length === 0) return '';
  const columnasMeta = (datoMeta && datoMeta.camposTabla) || [];

  const columnasDetectadas = new Set();
  for (const f of filas) {
    if (f.COLUMNA != null) columnasDetectadas.add(f.COLUMNA);
  }
  const columnas = Array.from(columnasDetectadas).sort((a, b) => a - b);
  const filasIds = Array.from(new Set(filas.map(f => f.FILA))).sort((a, b) => a - b);

  let html = '<table class="tabla-dinamica"><thead><tr>';
  for (const col of columnas) {
    const meta = columnasMeta.find(c => (c.ID_DATO_COLUMNA ?? c.ORDEN) === col);
    html += `<th>${escapeHtml((meta && (meta.NOMBRE || meta.DESCRIPCION)) || `Col ${col}`)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const filaId of filasIds) {
    html += '<tr>';
    for (const col of columnas) {
      const celda = filas.find(f => f.FILA === filaId && f.COLUMNA === col);
      html += `<td>${escapeHtml(celda ? (celda.VALOR ?? celda.VALOR_TEXTO ?? '') : '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ── Recorrido del árbol (depth-first) ─────────────────────────────────────
function renderNodo(nodo, payload, depth, parentNombre) {
  const origen = nodo.ORIGEN;
  const nombre = escapeHtml(nodo.NOMBRE || nodo.DESCRIPCION || '');
  let html = '';

  // Pestaña (sección de nivel superior)
  if (origen === 3) {
    if (nombre) html += `<h2 class="seccion">${nombre}</h2>`;
    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre);
    }
    return html;
  }

  // Grupo (subsección) — omite el encabezado si repite el nombre de la pestaña padre
  if (origen === 2) {
    const mostrarNombre = nombre && nombre !== parentNombre;
    if (mostrarNombre) {
      const tag = depth <= 2 ? 'h3' : 'h4';
      html += `<${tag} class="seccion">${nombre}</${tag}>`;
    }
    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre);
    }
    return html;
  }

  // Dato (campo con valor)
  if (origen === 1) {
    const tipoFijo = nodo.TIPO_DATO_FIJO || 0;

    // Sección decorativa (TIPO_DATO_FIJO=7)
    if (tipoFijo === TIPO_FIJO.SECCION) {
      if (nombre && nombre !== parentNombre) html += `<h4 class="seccion">${nombre}</h4>`;
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, nombre);
      }
      return html;
    }

    // Texto libre (TIPO_DATO_FIJO=8)
    if (tipoFijo === TIPO_FIJO.TEXTO_LIBRE) {
      const literal = nodo.DESCRIPCION || '';
      html += `<p class="texto-libre">${resolverTokens(literal, payload.tokens)}</p>`;
      return html;
    }

    // Campo con valor
    const valor = getValor(nodo, payload);
    if (tipoFijo === TIPO_FIJO.TABLA || tipoFijo === TIPO_FIJO.IMAGEN) {
      if (valor) {
        html += `<div class="campo-block"><b>${nombre}</b><div>${valor}</div></div>`;
      }
    } else {
      html += `<div class="campo-line"><b>${nombre}:</b><span class="val">${valor || ''}</span></div>`;
    }

    // Un dato puede tener sub-datos (raro pero posible)
    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre);
    }
    return html;
  }

  return html;
}

function renderEstructura(payload) {
  const estructura = payload.plantilla.estructura || [];
  const tree = buildTree(estructura);
  let html = '';
  for (const root of tree) {
    html += renderNodo(root, payload, 0, '');
  }
  return html;
}

// ── Bloques específicos ──────────────────────────────────────────────────
function renderEncabezado(payload) {
  const ips = payload.ips || {};
  const sede = payload.sede || {};
  const logo = payload.logoIps && payload.logoIps.LOGO
    ? bytesToDataUrl(payload.logoIps.LOGO, payload.logoIps.TIPO_MIME || 'image/png')
    : '';

  const razonSocial = ips.RAZON_SOCIAL || '';
  const sigla = ips.SIGLA || '';
  const nombreSede = sede.NOMBRE || '';
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
      <td>${escapeHtml(d.DESCRIPCION_TIPO_DX_PPAL || '')}</td>
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
  const ident = `${prof.TIPO_IDENTIFICACION || prof.ID_TIPO_IDENTIFICACION || ''} ${prof.NUMERO_IDENTIFICACION || ''}`.trim();

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

// ── Estilos ──────────────────────────────────────────────────────────────
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
    h2.seccion { font-size: ${tamanio + 2}px; text-transform: uppercase; text-decoration: underline; margin: 12px 0 4px 0; page-break-after: avoid; }
    h3.seccion { font-size: ${tamanio + 1}px; text-transform: uppercase; text-decoration: underline; margin: 8px 0 3px 0; page-break-after: avoid; }
    h4.seccion { font-size: ${tamanio}px; font-weight: bold; margin: 6px 0 2px 0; page-break-after: avoid; }
    .campo-line { display: flex; align-items: flex-start; margin: 2px 0; }
    .campo-line b { min-width: 150px; width: 150px; flex-shrink: 0; padding-right: 6px; }
    .campo-line .val { flex: 1; word-break: break-word; }
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
 */
function renderHtml(payload) {
  const estilos = buildEstilos(payload.parametros);
  const plantillaNombre = (payload.plantilla.meta && (payload.plantilla.meta.NOMBRE || payload.plantilla.meta.IDENTIFICADOR)) || 'HISTORIA CLÍNICA';

  const cuerpo = `
    ${renderEncabezado(payload)}
    <h1 class="seccion" style="text-align:center">${escapeHtml(plantillaNombre)}</h1>
    ${renderEstructura(payload)}
    ${renderOrdenesYFormulacion(payload)}
    ${renderFirma(payload)}
    <div class="footer">Atención: ${escapeHtml(payload.atencion.ID || '')} · Plantilla: ${escapeHtml((payload.plantilla.meta && payload.plantilla.meta.ID) || '')}</div>
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
