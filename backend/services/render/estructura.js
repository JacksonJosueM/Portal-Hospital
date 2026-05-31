const { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras } = require('./utils');
const { OMITIR_RUBRICAS_ESTRUCTURA, TIPO_FIJO, TIPO_DATO } = require('./constants');
const { renderIdentificacionPaciente } = require('./identificacion');

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

function getValor(nodo, payload) {
  const guid = nodo.ID; // GUID del nodo â†’ clave en valoresPorEstructura
  const valores = payload.valoresPorEstructura;
  const tipoFijo = nodo.TIPO_DATO_FIJO || 0;
  const tipoDato = nodo.TIPO_DATO || 0;
  const decimales = nodo.DECIMALES || 2;

  // Si es dato del sistema (TIPO_DATO_FIJO=1), buscar en tokens
  if (tipoFijo === TIPO_FIJO.SISTEMA) {
    const paramSp = nodo.PARAMETRO_SP;
    const tokenVal = paramSp != null ? payload.tokens[paramSp] : undefined;
    if (tokenVal != null && tokenVal !== undefined && String(tokenVal) !== 'undefined' && String(tokenVal).trim() !== '') {
      return escapeHtml(tokenVal);
    }
    return null;
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
        const val = pickValor(recs);
        return val != null ? escapeHtml(val) : '';
      }
    }
  }

  // Resolver por TIPO_DATO_FIJO
  switch (efectivo) {
    case TIPO_FIJO.DECIMAL: {
      const recs = valores.decimal.get(guid);
      if (recs && recs.length) return formatDecimal(pickValor(recs), decimales);
      break;
    }
    case TIPO_FIJO.ENTERO: {
      const recs = valores.enteros.get(guid);
      if (recs && recs.length) {
        const v = pickValor(recs);
        return v == null ? null : escapeHtml(parseInt(v, 10));
      }
      break;
    }
    case TIPO_FIJO.SELECCION:
    case TIPO_FIJO.LISTA: {
      const recs = valores.lista.get(guid) || [];
      if (recs.length) {
        return recs
          .map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? r.DESCRIPCION ?? ''))
          .filter(Boolean)
          .join(', ');
      }
      break;
    }
    case TIPO_FIJO.TABLA: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      const recs = valores.tabla.get(guid) || [];
      if (recs.length) return renderTabla(datoMeta, recs);
      break;
    }
    case TIPO_FIJO.IMAGEN: {
      const datoMeta = nodo.ID_ESTRUCTURA ? payload.datos.get(nodo.ID_ESTRUCTURA) : null;
      const img = datoMeta && datoMeta.imagenes && datoMeta.imagenes[0];
      if (img) {
        const url = img.IMAGEN
          ? bytesToDataUrl(img.IMAGEN, img.TIPO_MIME || 'image/png')
          : (img.RUTA || '');
        return `<img src="${url}" alt="${escapeHtml(img.NOMBRE || '')}" style="max-width:100%;">`;
      }
      break;
    }
  }

  // Fallback: probar todos los buckets
  for (const bucket of ['texto', 'decimal', 'enteros', 'fecha', 'lista', 'laboratorioTexto']) {
    const recs = valores[bucket].get(guid);
    if (recs && recs.length) {
      if (bucket === 'fecha') return formatFecha(pickValor(recs));
      if (bucket === 'decimal') return formatDecimal(pickValor(recs), decimales);
      if (bucket === 'lista') {
        return recs.map(r => escapeHtml(r.VALOR_LISTA ?? r.VALOR ?? '')).filter(Boolean).join(', ');
      }
      const val = pickValor(recs);
      return val != null ? escapeHtml(val) : '';
    }
  }
  return null;
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

function renderNodo(nodo, payload, depth, parentNombre, context = {}) {
  const origen = nodo.ORIGEN;
  const nombre = escapeHtml(nodo.NOMBRE || nodo.DESCRIPCION || '');
  const nombrePlano = String(nodo.NOMBRE || nodo.DESCRIPCION || '').trim();
  const nombrePlanoUpper = nombrePlano.toUpperCase();
  const nombrePlanoUpperClean = nombrePlanoUpper.replace(/:$/, '').trim();
  let html = '';

  // Pesta&ntilde;a (secci&oacute;n de nivel superior)
  if (origen === 3) {
    const upperNombre = nombre.toUpperCase();
    
    // Propagar contexto de gineco-obstetricia desde la pesta&ntilde;a
    const isGineco = context.isGineco || esTituloGinecoObstetrico(upperNombre);
    const newContext = { ...context, isGineco };

    if (upperNombre.includes('INFORMACION DEL PACIENTE') || upperNombre.includes('IDENTIFICACION DEL PACIENTE')) {
      html += renderIdentificacionPaciente(payload);
      for (const child of nodo.children) {
        const childUpper = String(child.NOMBRE || child.DESCRIPCION || '').toUpperCase();
        if (childUpper.includes('INFORMACION DEL PACIENTE') || childUpper.includes('IDENTIFICACION DEL PACIENTE')) {
          continue; // Saltamos el grupo interno de identificaci&oacute;n para no duplicar campos
        }
        html += renderNodo(child, payload, depth + 1, nombre, newContext);
      }
      return html;
    }

    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';
    if (context.isMale && esTituloGinecoObstetrico(nombrePlanoUpper)) return '';
    if (nombre) html += `<h2 class="seccion">${nombre}</h2>`;

    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, newContext);
    }
    return html;
  }

  // Grupo (subsecci&oacute;n) â€” omite el encabezado si repite el nombre de la pesta&ntilde;a padre
  if (origen === 2) {
    if (OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper) || OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)) {
      // Mantener los hijos, omitiendo solo el t&iacute;tulo redundante.
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, parentNombre, context);
      }
      return html;
    }

    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';

    const upperNombre = nombre.toUpperCase();
    if (context.isMale && esTituloGinecoObstetrico(upperNombre)) return '';
    if (upperNombre.includes('INFORMACION DEL PACIENTE') || upperNombre.includes('IDENTIFICACION DEL PACIENTE')) {
      return renderIdentificacionPaciente(payload);
    }
    const mostrarNombre = nombre && nombre !== parentNombre;
    if (mostrarNombre) {
      const tag = depth <= 2 ? 'h3' : 'h4';
      html += `<${tag} class="seccion">${nombre}</${tag}>`;
    }

    // Propagar si estamos dentro de una secci&oacute;n de gineco-obstetricia
    const isGineco = context.isGineco || esTituloGinecoObstetrico(upperNombre);
    const newContext = { ...context, isGineco };

    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, newContext);
    }
    return html;
  }

  // Dato (campo con valor)
  if (origen === 1) {
    const tipoFijo = nodo.TIPO_DATO_FIJO || 0;

    // Secci&oacute;n decorativa (TIPO_DATO_FIJO=7)
    if (tipoFijo === TIPO_FIJO.SECCION) {
      if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';
      if (context.isMale && esTituloGinecoObstetrico(nombrePlanoUpper)) return '';
      
      let childrenHtml = '';
      for (const child of nodo.children) {
        childrenHtml += renderNodo(child, payload, depth + 1, nombre, context);
      }

      if (nombrePlanoUpperClean === 'ANTECEDENTES PERSONALES') {
        const textOnly = childrenHtml.replace(/<[^>]*>/g, '').trim();
        if (textOnly === '' || textOnly === '1' || /^[\d\s\/:\.ampAMP,\-]+$/.test(textOnly)) {
          return '';
        }
      }

      if (
        !OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper)
        && !OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)
        && nombre
        && nombre !== parentNombre
      ) {
        html += `<h4 class="seccion">${nombre}</h4>`;
      }
      
      html += childrenHtml;
      return html;
    }

    // Texto libre (TIPO_DATO_FIJO=8)
    if (tipoFijo === TIPO_FIJO.TEXTO_LIBRE) {
      const literal = nodo.DESCRIPCION || '';
      html += `<p class="texto-libre">${resolverTokens(literal, payload.tokens)}</p>`;
      return html;
    }

    // Campo con valor (t&iacute;tulo duplicado de profesional como nodo suelto)
    if (esTituloProfesionalSalud(nombrePlanoUpperClean)) return '';

    let valor = getValor(nodo, payload);
    if (valor === null) valor = ''; // Restaurar la impresi&oacute;n de campos vac&iacute;os como Talla, Peso, etc.
    if (valor === '') {
      const fallback = getFallbackCampoPorNombre(payload, nombrePlano);
      if (fallback) valor = escapeHtml(fallback);
    }

    // Evitar que r&oacute;tulos t&eacute;cnicos/redundantes salgan como l&iacute;neas vac&iacute;as.
    if (OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpper) || OMITIR_RUBRICAS_ESTRUCTURA.has(nombrePlanoUpperClean)) {
      for (const child of nodo.children) {
        html += renderNodo(child, payload, depth + 1, nombre, context);
      }
      return html;
    }

    const label = nombre.endsWith(':') ? nombre : `${nombre}:`;

    // Filtro para ocultar campos ginecobst&eacute;tricos exclusivamente a hombres
    // Solo se aplica si estamos dentro de una secci&oacute;n marcada como GINECO/OBSTETRI o si el nombre es claramente femenino
    if (context.isMale) {
      const nUpper = nombre.toUpperCase().replace(':', '').trim();
      const nUpperNoTilde = nUpper
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const femaleFields = [
        'G', 'P', 'A', 'V', 'C', 'M',
        'FECHA &Uacute;LTIMO PARTO', '&Uacute;LTIMA CITOLOG&Iacute;A', 'MENARQUIA', 'CICLOS',
        'F.U.P', 'F.U.R', 'FECHA DE ULTIMO PARTO', 'ULTIMA CITOLOGIA',
        'ULTIMA FECHA DE MENSTRUACION', 'FECHA ULTIMA MENSTRUACION', 'F.U.M', 'FUM', 'FUR',
        'FECHA DE ULTIMA MENSTRUACION'
      ];

      const esCampoFemenino = femaleFields.includes(nUpper) || femaleFields.includes(nUpperNoTilde);
      // Solo ocultamos si es campo femenino Y estamos en secci&oacute;n de gineco, o si es un campo largo inequ&iacute;voco
      if (esCampoFemenino && (context.isGineco || nUpper.length > 5)) {
        return ''; // Omitir el campo completo
      }
    }

    if (tipoFijo === TIPO_FIJO.TABLA || tipoFijo === TIPO_FIJO.IMAGEN) {
      if (valor !== '') {
        html += `<div class="campo-block"><b>${label}</b><div>${valor}</div></div>`;
      }
    } else {
      html += `<div class="campo-line"><b>${label}</b><span class="val">${valor}</span></div>`;
    }

    // Un dato puede tener sub-datos (raro pero posible)
    for (const child of nodo.children) {
      html += renderNodo(child, payload, depth + 1, nombre, context);
    }
    return html;
  }

  return html;
}

function renderEstructura(payload) {
  const estructura = payload.plantilla.estructura || [];
  const tree = buildTree(estructura);

  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};
  const generoVal = b3.GENERO_PACIENTE === 1 ? 'Masculino' : b3.GENERO_PACIENTE === 2 ? 'Femenino' : t['SEXO'] || t['GENERO'] || '';
  const generoNormalizado = (generoVal || '').toString().trim().toUpperCase();
  const isMale = b3.GENERO_PACIENTE === 1
    || ['M', 'MASCULINO', 'HOMBRE', 'MALE'].includes(generoNormalizado);

  let html = '';
  for (const root of tree) {
    html += renderNodo(root, payload, 0, '', { isMale });
  }
  return html;
}
module.exports = { buildTree, getValor, pickValor, renderTabla, renderNodo, renderEstructura };
