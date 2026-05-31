const { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras } = require('./utils');
const { renderIdentificacionPaciente, renderEncabezado, renderFirma, renderProfesionalInfo } = require('./identificacion');
const { renderDiagnosticos } = require('./clinico');
const { buildEstilos } = require('./styles');

function renderOrdenesPanacea(recordsets) {
  let hasData = false;
  let firstTpl = '';
  for (const rs of recordsets) {
    if (rs && rs.length && rs[0].NOMBRE_PLANTILLA) {
      firstTpl = rs[0].NOMBRE_PLANTILLA;
      break;
    }
  }
  const titulo = (firstTpl || 'ORDEN DE LABORATORIO').toUpperCase();

  let htmlTable = `
    <div style="margin-top: 14px; clear: both; display: block; width: 100%;">
      <h3 class="seccion" style="margin-bottom: 6px;">${escapeHtml(titulo)}</h3>
      <table class="orden-table">
        <colgroup>
          <col style="width: 4%">
          <col style="width: 60%">
          <col style="width: 9%">
          <col style="width: 9%">
          <col style="width: 9%">
          <col style="width: 9%">
        </colgroup>
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th>Servicio/Procedimiento</th>
            <th style="text-align:center;">Cantidad</th>
            <th>Estado</th>
            <th>Prioridad</th>
            <th>Tipo uso</th>
          </tr>
        </thead>
        <tbody>
  `;

  let idx = 1;
  for (const rs of recordsets) {
    if (!rs || !rs.length) continue;
    hasData = true;
    const cleanStr = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    for (const f of rs) {
      const codigo = cleanStr(f.CODIGO_PROCEDIMIENTO);
      let desc = cleanStr(f.DESCRIPCION_PROCEDIMIENTO || f.PRUEBA || f.NOMBRE_SERVICIO || f.NOMBRE || f.DESCRIPCION || '');

      // Fallback para filas de incapacidad/licencia donde los campos de descripci&oacute;n vienen null.
      // Panacea muestra: "23/04/2025 10:00 - INCAPACIDADES O LICENCIAS - MEDICINA GENERAL - SABRINA JOHANA CAAMANO BANOL"
      if (!desc && f.NOMBRE_PLANTILLA) {
        const partes = [];
        if (f.FECHA_EXPEDICION) {
          const d = new Date(f.FECHA_EXPEDICION);
          if (!isNaN(d)) {
            const pad = (n) => String(n).padStart(2, '0');
            partes.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
          }
        }
        partes.push(cleanStr(f.NOMBRE_PLANTILLA));
        if (f.NOMBRE_ESPECIALIDAD) partes.push(cleanStr(f.NOMBRE_ESPECIALIDAD));
        if (f.NOMBRE_COMPLETO_PRESTADOR) partes.push(cleanStr(f.NOMBRE_COMPLETO_PRESTADOR));
        desc = partes.join(' - ');
      }

      const srv = codigo ? `${codigo} - ${desc}` : desc;
      const cant = cleanStr(f.CANTIDAD || '1');
      const area = cleanStr(f.AREA_CORPORAL);
      const lat = cleanStr(f.LATERALIDAD);
      const est = cleanStr(f.ESTADO_ORDEN || f.ESTADO || 'Solicitada');
      const prio = cleanStr(f.PRIORIDAD || 'Programada');
      const uso = cleanStr(f.TIPO_USO || 'Externo');

      let srvHtml = escapeHtml(srv);
      const obs = cleanStr(f.OBSERVACIONES);
      const com = cleanStr(f.COMENTARIO);
      if (com) srvHtml += `<br><small><b>Comentario:</b> ${escapeHtml(com)}</small>`;
      if (obs) srvHtml += `<br><small><b>Obs:</b> ${escapeHtml(obs)}</small>`;

      htmlTable += `
        <tr>
          <td style="text-align:center;">${idx++}</td>
          <td>${srvHtml}</td>
          <td style="text-align:center;">${escapeHtml(cant)}</td>
          <td>${escapeHtml(est)}</td>
          <td>${escapeHtml(prio)}</td>
          <td>${escapeHtml(uso)}</td>
        </tr>
      `;
    }
  }

  htmlTable += `</tbody></table></div>`;

  return hasData ? htmlTable : '';
}

function getFormaFarmaceutica(nombreMedicamento) {
  const n = String(nombreMedicamento || '').toUpperCase();
  if (n.includes('AMPOLLA')) return 'Ampolla';
  if (n.includes('TABLETA DISPERSABLE')) return 'Tableta dispersable';
  if (n.includes('TABLETA') || n.includes('TAB')) return 'Tableta';
  if (n.includes('CAPSULA') || n.includes('CAP')) return 'Cápsula';
  if (n.includes('JARABE')) return 'Jarabe';
  if (n.includes('SUSPENSION')) return 'Suspensión';
  if (n.includes('GOTAS')) return 'Gotas';
  if (n.includes('CREMA')) return 'Crema';
  if (n.includes('UNGUENTO')) return 'Ungüento';
  if (n.includes('LOCION')) return 'Loción';
  if (n.includes('GEL')) return 'Gel';
  if (n.includes('SOLUCION')) return 'Solución';
  if (n.includes('POLVO')) return 'Polvo';
  if (n.includes('AEROSOL') || n.includes('INHALADOR')) return 'Inhalador';
  if (n.includes('SUPOSITORIO')) return 'Supositorio';
  if (n.includes('INYECCION') || n.includes('INYECTABLE')) return 'Inyectable';
  if (n.includes('SOBRE')) return 'Sobre';
  if (n.includes('JERINGA')) return 'Jeringa';
  if (n.includes('TUBO')) return 'Tubo';
  if (n.includes('VIAL')) return 'Vial';
  if (n.includes('PARCHE')) return 'Parche';
  return '';
}

function renderFormulaMedicaPanacea(formulacionRS, ordenesRS, opts = {}, op2Rows = []) {
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
  html += `
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
  `;

  let idx = 1;
  for (const r of filas) {
    const codigo = r.CODIGO_PROCEDIMIENTO || '';
    const desc = r.DESCRIPCION_PROCEDIMIENTO || r.PRUEBA || r.NOMBRE_SERVICIO || '';
    const medicamento = codigo ? `${codigo} - ${desc}` : desc;

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
      dosisText = `${dosisVal} cada 24 horas`;
    }
    const dias = r.DIAS_TRATAMIENTO;
    if (dias && !dosisText.toLowerCase().includes('durante')) {
      dosisText += ` durante ${dias} d\u00edas`;
    }

    try {
      require('fs').appendFileSync('C:/Nueva carpeta (2)/Portal-Hospital/backend/debug_med.json', JSON.stringify({ r, op2Row }) + '\n');
    } catch(e) {}
    
    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;
    if (cantTotalVal == null) {
      cantTotalVal = '1';
    } else {
      cantTotalVal = Number(cantTotalVal);
    }
    
    // PRIORIDAD PANACEA EXCLUSIVA (IGNORAR DEDUCCION SI NO HAY)
    // Extraemos la forma de todas las posibles columnas que usa Panacea
    const formaRaw = op2Row.TEXTO_ORDEN || r.FORMA_FARMACEUTICA || r.FORMA || op2Row.FORMA_FARMACEUTICA || op2Row.FORMA || r.UNIDAD_MEDIDA || '';
    const formaPanacea = String(formaRaw).trim();
    
    // Solo usamos el fallback si Panacea de verdad viene en blanco
    const forma = formaPanacea || getFormaFarmaceutica(desc);
    
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = `${cantTotalVal} (${cantLetras}) ${forma}`.trim();
    cantidadTotalText = cantidadTotalText.replace(/\s+/g, ' ');

    html += `
      <tr>
        <td style="text-align:center;">${idx++}</td>
        <td>${escapeHtml(medicamento)}</td>
        <td style="text-align:center;">${viaAdmin}</td>
        <td>${escapeHtml(dosisText)}</td>
        <td style="text-align:center;">${escapeHtml(cantidadTotalText)}</td>
        <td style="text-align:center;">Autorizado</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  return html;
}

function renderOrdenesYFormulacion(payload) {
  const ordenesRS = payload.clinico.ordenes || [];
  const formulacionRS = payload.clinico.formulacion || [];

  const cleanStr = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Agrupar recordsets por TIPO DE ORDEN
  const grupos = new Map();

  const procesarFilas = (rsArray, isMedicamentoDefault) => {
    for (const rs of rsArray) {
      if (!rs || !rs.length) continue;
      for (const fila of rs) {
        let tpl = cleanStr(fila.NOMBRE_PLANTILLA || '');
        const tplUpper = tpl.toUpperCase();
        let tipoGrupo = tplUpper;

        if (tplUpper.includes('IMAGENOLOG')) tipoGrupo = 'ORDEN DE IMAGENOLOG&Iacute;A:';
        else if (tplUpper.includes('LABORATORIO') || tplUpper.includes('LAB.')) tipoGrupo = 'ORDEN DE LABORATORIO:';
        else if (tplUpper.includes('MEDICAMENTO') || tplUpper.includes('FARMACIA') || isMedicamentoDefault) tipoGrupo = 'ORDEN DE MEDICAMENTO:';
        else if (tplUpper.includes('INCAPACIDAD') || tplUpper.includes('LICENCIA')) tipoGrupo = 'ORDEN DE INCAPACIDAD:';
        else tipoGrupo = (tpl ? `ORDEN DE ${tplUpper}:` : 'ORDEN:');

        if (!grupos.has(tipoGrupo)) {
          grupos.set(tipoGrupo, []);
        }
        grupos.get(tipoGrupo).push(fila);
      }
    }
  };

  procesarFilas(ordenesRS, false);
  procesarFilas(formulacionRS, true);

  if (grupos.size === 0) return '';

  let html = '';

  for (const [titulo, filas] of grupos) {
    // Agrupar filas por cabecera de sub-orden (Fecha - Plantilla - Especialidad - Prestador)
    const subOrdenes = new Map();
    for (const f of filas) {
      const partesCab = [];
      if (f.FECHA_EXPEDICION) {
        const d = new Date(f.FECHA_EXPEDICION);
        if (!isNaN(d)) {
          const pad = (n) => String(n).padStart(2, '0');
          partesCab.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
        }
      }
      if (f.NOMBRE_PLANTILLA) partesCab.push(cleanStr(f.NOMBRE_PLANTILLA));
      if (f.NOMBRE_ESPECIALIDAD) partesCab.push(cleanStr(f.NOMBRE_ESPECIALIDAD));
      if (f.NOMBRE_COMPLETO_PRESTADOR) partesCab.push(cleanStr(f.NOMBRE_COMPLETO_PRESTADOR));
      const cabecera = partesCab.join(' - ') || 'ORDEN';

      // Incluir ID_ORDEN en la clave para no mezclar &oacute;rdenes diferentes con la misma cabecera
      const idOrden = f.ID_ORDEN || '_';
      const key = `${idOrden}|${cabecera}`;

      if (!subOrdenes.has(key)) subOrdenes.set(key, { cabecera, items: [] });
      subOrdenes.get(key).items.push(f);
    }

    const isMed = titulo === 'ORDEN DE MEDICAMENTO:';

    if (isMed) {
      html += `
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:10px; line-height:1.3; font-family:Arial,sans-serif;" border="0">
          <colgroup>
            <col style="width:60%">
            <col style="width:10%">
            <col style="width:15%">
            <col style="width:15%">
          </colgroup>
          <thead>
            <tr>
              <th style="text-align:left; font-weight:bold; padding-bottom:4px;">${escapeHtml(titulo)}</th>
              <th style="text-align:center; font-weight:bold; padding-bottom:4px;">Cantidad</th>
              <th style="text-align:center; font-weight:bold; padding-bottom:4px;">D&iacute;as<br>Tratamiento</th>
              <th style="text-align:left; font-weight:bold; padding-bottom:4px;">V&iacute;a administraci&oacute;n</th>
            </tr>
          </thead>
          <tbody>`;
    } else {
      html += `
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:10px; line-height:1.3; font-family:Arial,sans-serif;" border="0">
          <colgroup>
            <col style="width:85%">
            <col style="width:15%">
          </colgroup>
          <thead>
            <tr>
              <th style="text-align:left; font-weight:bold; padding-bottom:4px;">${escapeHtml(titulo)}</th>
              <th style="text-align:center; font-weight:bold; padding-bottom:4px;">Cantidad</th>
            </tr>
          </thead>
          <tbody>`;
    }

    for (const [, sub] of subOrdenes) {
      // Fila de cabecera de sub-orden
      const colspan = isMed ? 4 : 2;
      html += `
        <tr>
          <td colspan="${colspan}" style="padding-top:2px; padding-bottom:2px; font-size:9.5px;">
            ${escapeHtml(sub.cabecera)}
          </td>
        </tr>`;

      // Filas de items
      for (const f of sub.items) {
        const codigo = cleanStr(f.CODIGO_PROCEDIMIENTO);
        const desc = cleanStr(f.DESCRIPCION_PROCEDIMIENTO || f.PRUEBA || f.NOMBRE_SERVICIO || f.ITEM || '');
        const srv = codigo ? `${codigo} ${desc}` : desc;

        if (isMed) {
          let cant = cleanStr(String(f.CANTIDAD_TOTAL || f.CANT_DOSIS || f.CANTIDAD_FOFA || f.CANTIDAD || '1'));
          const dias = cleanStr(String(f.DIAS_TRATAMIENTO || ''));
          const via = cleanStr(f.VIA_ADMINISTRACION || f.VIA || 'Oral');

          html += `
            <tr>
              <td style="padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(srv)}</td>
              <td style="text-align:center; padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(cant)}</td>
              <td style="text-align:center; padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(dias)}</td>
              <td style="text-align:left; padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(via)}</td>
            </tr>`;
        } else {
          let cant = cleanStr(String(f.CANTIDAD || '1'));
          // Las incapacidades pueden no tener cantidad y solo la descripci&oacute;n
          if (titulo === 'ORDEN DE INCAPACIDAD:') cant = '';

          html += `
            <tr>
              <td style="padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(srv)}</td>
              <td style="text-align:center; padding-top:2px; padding-bottom:2px; font-size:9.5px;">${escapeHtml(cant)}</td>
            </tr>`;
        }
      }
    }

    html += `</tbody></table>`;
  }

  return html;
}

function clasificarTodasLasOrdenes(ordenesRS, formulacionRS) {
  const laboratorio = [];
  const imagenologia = [];
  const medicamentos = [];
  const incapacidades = [];
  const otras = [];

  const clasificarRS = (rs, isFormulacion) => {
    if (!rs || !rs.length) return;

    const labRows = [];
    const imgRows = [];
    const medRows = [];
    const incRows = [];
    const otrRows = [];

    rs.forEach(row => {
      const plantilla = String(row.NOMBRE_PLANTILLA || '').toUpperCase();
      const servicio = String(row.NOMBRE_SERVICIO || '').toUpperCase();
      const desc = String(row.DESCRIPCION_PROCEDIMIENTO || '').toUpperCase();
      const tipo = String(row.ID_TIPO_ORDEN || '').toUpperCase();

      const combined = `${plantilla} ${servicio} ${desc} ${tipo}`;
      console.log('Fila encontrada:', combined);

      if (plantilla.includes('INCAPACIDAD') || plantilla.includes('LICENCIA')) {
        // Las incapacidades/licencias tienen su propio render (bloque de texto, no tabla)
        incRows.push(row);
      } else if (combined.includes('LABORATORIO') || combined.includes('LAB.') || combined.includes('HEMOGRAMA') || combined.includes('ORINA') || combined.includes('VIH') || combined.includes('RPR')) {
        labRows.push(row);
      } else if (combined.includes('IMAGEN') || combined.includes('RADIOLOG') || combined.includes('RADIOGRAFIA') || combined.includes('RX') || combined.includes('ECOGRAF') || combined.includes('TAC') || combined.includes('RESONAN')) {
        imgRows.push(row);
      } else if (combined.includes('MEDICAMENTO') || combined.includes('FARMACIA') || combined.includes('FORMULA') || isFormulacion) {
        medRows.push(row);
      } else {
        otrRows.push(row);
      }
    });

    if (labRows.length > 0) laboratorio.push(labRows);
    if (imgRows.length > 0) imagenologia.push(imgRows);
    if (medRows.length > 0) medicamentos.push(medRows);
    if (incRows.length > 0) incapacidades.push(incRows);
    if (otrRows.length > 0) otras.push(otrRows);
  };

  (ordenesRS || []).forEach(rs => clasificarRS(rs, false));
  (formulacionRS || []).forEach(rs => clasificarRS(rs, true));

  return { laboratorio, imagenologia, medicamentos, incapacidades, otras };
}

function renderHtmlOrdenPorTipo(payload, tituloDoc, tituloTabla, recordsets) {
  const estilos = buildEstilos(payload.parametros);
  let tablaHtml = renderOrdenesPanacea(recordsets);
  if (!tablaHtml) return null;

  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      <h1 class="seccion" style="text-align:center">${escapeHtml(tituloDoc)}</h1>
      ${renderIdentificacionPaciente(payload)}
      ${renderDiagnosticos(payload)}
      
      ${tablaHtml}
      
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${escapeHtml(payload.atencion.ID || '')}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

function renderHtmlFormula(payload, recordsets, datosOrden = null, op2Rows = []) {
  const estilos = buildEstilos(payload.parametros);
  if (!recordsets || !recordsets.length) return null;

  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};
  // datosOrden: primera fila de Historia.QRY_IMPRESION_ORDENES_FORMATOS OPERACION=2
  // op2Rows: todas las filas del mismo SP (una por medicamento, para DISTANCIA/dosis)
  const dO = datosOrden || {};
  const esc = escapeHtml;
  const cl = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  const pad2 = n => String(n).padStart(2, '0');
  const fmtDT = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };
  const fmtD = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  };

  // â”€â”€ Datos del paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const apellidos = esc(cl(b3.APELLIDOS_PACIENTE || t['APELLIDOS_PACIENTE'] || ''));
  const nombres = esc(cl(b3.NOMBRES_PACIENTE || t['NOMBRES_PACIENTE'] || ''));
  const tipoId = esc(cl(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || ''));
  const numId = esc(cl(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || ''));
  const fechaNac = esc(fmtD(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad = esc(cl(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? String(b3.EDAD_PACIENTE) + ' A\u00f1os' : '') || t['EDAD'] || ''));
  const genN = b3.GENERO_PACIENTE;
  const genero = esc(genN === 1 ? 'Masculino' : genN === 2 ? 'Femenino' : cl(b3.SEXO_PACIENTE || t['SEXO'] || ''));
  const ocupacion = esc(cl(b3.OCUPACION || t['OCUPACION'] || ''));
  const direccion = esc(cl(b3.DIRECCION || t['DIRECCION'] || ''));
  const telefono = esc(cl(b3.TELEFONO || t['TELEFONO'] || ''));
  const cliente = esc(cl(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE || t['CLIENTE'] || ''));
  const convenio = esc(cl(b3.NOMBRE_CONVENIO || at.CONVENIO || t['CONVENIO'] || ''));
  const fechaReg = esc(fmtDT(b3.FECHA_REGISTRO || at.FECHA_REGISTRO));
  const fechaAten = esc(fmtDT(b3.FECHA_ATENCION || at.FECHA_ATENCION));

  // â”€â”€ Datos de la orden (primer rengl&oacute;n del primer recordset) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // IMPORTANTE: las filas de formulaci&oacute;n traen datos del encuentro (TIPO_USO, VIA_INGRESO, etc.)
  const allRows = (recordsets || []).flatMap(rs => rs || []);
  const pFila = allRows[0] || {};
  // NUMERO_ORDEN: usar el n&uacute;mero p&uacute;blico de la orden (NUMERO_ORDEN de Op2), no el ID interno
  const ordenNum = esc(cl(String(dO.NUMERO_ORDEN || pFila.NUMERO_ORDEN || pFila.ID_ORDEN || '')));
  const ordenTipo = esc(cl(pFila.NOMBRE_PLANTILLA || 'Orden Medicamentos'));
  const ordenCodigo = esc(cl(String(pFila.ID_TIPO_PLANTILLA || pFila.ID_TIPO_ORDEN || '')));
  const ordenFecha = esc(fmtDT(pFila.FECHA_EXPEDICION));
  const posfechado = pFila.POSFECHADO != null ? (pFila.POSFECHADO ? 'S\u00ed' : 'No') : 'No';
  const observaciones = esc(cl(dO.OBSERVACIONES || pFila.OBSERVACIONES || ''));

  // Vigencia: FECHA_INICIO / FECHA_TERMINACION vienen de Op2 (OPERACION=2)
  const vigDesde = fmtD(dO.FECHA_INICIO || dO.VIGENCIA_DESDE || pFila.VIGENCIA_DESDE || pFila.FECHA_INICIO_VIGENCIA);
  const vigHasta = fmtD(dO.FECHA_TERMINACION || dO.VIGENCIA_HASTA || pFila.VIGENCIA_HASTA || pFila.FECHA_FIN_VIGENCIA || pFila.FECHA_VENCIMIENTO);
  const vigencia = esc([vigDesde, vigHasta].filter(Boolean).join(' - '));

  // Mappings num&eacute;ricos del Op2
  const VIA_MAP = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalizaci\u00f3n', 3: 'Remitido' };
  const AMBITO_MAP = { 1: 'Ambulatorio', 2: 'Hospitalario', 3: 'Domiciliario', 4: 'Urgencias' };
  const TIPUSO_MAP = { 0: 'Externo', 1: 'Externo', 2: 'Interno' };

  // VIA_INGRESO: Op2 usa ID_ORIGEN_VIA_INGRESO (num&eacute;rico)
  const viaN = dO.ID_ORIGEN_VIA_INGRESO != null ? dO.ID_ORIGEN_VIA_INGRESO
    : (dO.VIA_INGRESO ?? pFila.VIA_INGRESO ?? b3.VIA_INGRESO ?? at.VIA_INGRESO);
  const viaIngreso = esc(VIA_MAP[viaN] ?? cl(dO.NOMBRE_VIA_INGRESO || pFila.NOMBRE_VIA_INGRESO || b3.NOMBRE_VIA_INGRESO || t['VIA_INGRESO'] || ''));

  // TIPO_USUARIO: texto directo en Op2
  const tipoUsr = esc(cl(dO.TIPO_USUARIO || pFila.TIPO_USUARIO || b3.TIPO_USUARIO || at.TIPO_USUARIO || t['TIPO_USUARIO'] || ''));

  // CATEGORIA: Op2 llama al campo CATEGORIA_CONVENIO
  const categoria = esc(cl(dO.CATEGORIA_CONVENIO || dO.CATEGORIA || pFila.CATEGORIA || b3.CATEGORIA || t['CATEGORIA'] || ''));

  // AMBITO: Op2 devuelve ID_AMBITO num&eacute;rico
  const ambitoN = dO.ID_AMBITO;
  const ambito = esc(ambitoN != null ? (AMBITO_MAP[ambitoN] || String(ambitoN))
    : cl(dO.AMBITO_ATENCION || dO.AMBITO || pFila.AMBITO || b3.AMBITO_ATENCION || t['AMBITO'] || ''));

  // TIPO_USO: Op2 devuelve TIPO_USO num&eacute;rico (1 = Externo)
  const tipoUsoN = dO.TIPO_USO;
  const tipoUso = esc(tipoUsoN != null ? (TIPUSO_MAP[tipoUsoN] || String(tipoUsoN))
    : cl(pFila.TIPO_USO || b3.TIPO_USO || t['TIPO_USO'] || ''));

  // â”€â”€ Estilos de celda de la tabla â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const thS = 'padding:3px 5px; border:1px solid #000; background:#d9d9d9; font-weight:bold; font-size:9.5px; line-height:1.3; white-space:nowrap;';
  const tdS = 'padding:3px 5px; border:1px solid #000; font-size:9.5px; line-height:1.3; word-break:break-word;';

  // â”€â”€ Encabezado de orden â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ordenHeaderHtml = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <b>Orden N&ordm;: ${ordenNum}</b>
      &nbsp;&nbsp; ${ordenTipo}
      &nbsp;&nbsp; C&oacute;digo: ${ordenCodigo}
      &nbsp;&nbsp; Fecha y hora: ${ordenFecha}
    </div>`;

  // â”€â”€ Tabla del paciente 4 columnas (estilo Panacea) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tablaPaciente = `
    <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
      <colgroup>
        <col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%">
      </colgroup>
      <tr>
        <td style="${thS}">Apellidos:</td><td style="${tdS}">${apellidos}</td>
        <td style="${thS}">Nombres:</td><td style="${tdS}">${nombres}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo Identificaci&oacute;n:</td><td style="${tdS}">${tipoId}</td>
        <td style="${thS}">N&uacute;mero documento:</td><td style="${tdS}">${numId}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha de Nacimiento:</td><td style="${tdS}">${fechaNac}</td>
        <td style="${thS}">Edad:</td><td style="${tdS}">${edad}</td>
      </tr>
      <tr>
        <td style="${thS}">G&eacute;nero:</td><td style="${tdS}">${genero}</td>
        <td style="${thS}">Ocupaci&oacute;n:</td><td style="${tdS}">${ocupacion}</td>
      </tr>
      <tr>
        <td style="${thS}">Direcci&oacute;n:</td><td style="${tdS}">${direccion}</td>
        <td style="${thS}">Tel&eacute;fono:</td><td style="${tdS}">${telefono}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha registro :</td><td style="${tdS}">${fechaReg}</td>
        <td style="${thS}">Fecha atenci&oacute;n:</td><td style="${tdS}">${fechaAten}</td>
      </tr>
      <tr>
        <td style="${thS}">Nombre del Cliente:</td><td style="${tdS}">${cliente}</td>
        <td style="${thS}">Convenio:</td><td style="${tdS}">${convenio}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo de usuario:</td><td style="${tdS}">${tipoUsr}</td>
        <td style="${thS}">Categor&iacute;a:</td><td style="${tdS}">${categoria}</td>
      </tr>
      <tr>
        <td style="${thS}">V&iacute;a de ingreso:</td><td style="${tdS}">${viaIngreso}</td>
        <td style="${thS}">&Aacute;mbito:</td><td style="${tdS}">${ambito}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo uso:</td><td style="${tdS}">${tipoUso}</td>
        <td style="${thS}">Vigencia:</td><td style="${tdS}">${vigencia}</td>
      </tr>
    </table>`;

  // â”€â”€ Diagn&oacute;sticos compactos â€” formato Panacea â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Ref: "Diagn&oacute;sticosPrincipal Ingreso: D649  Tipo principal: Confirmado nuevo"
  //       "Relacionado 1 Ingreso: K922"
  const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
  let dxHtml = '';
  if (dxList.length) {
    const esPpal = (d) => {
      const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
      return d.PRINCIPAL === 1 || d.ES_PRINCIPAL === 1
        || d.ID_TIPO_DIAGNOSTICO_RIPS === 0 || d.ID_TIPO_DIAGNOSTICO_RIPS === '0'
        || tipo.includes('PRINCIPAL') || tipo.includes('INGRESO');
    };
    const principal = dxList.find(esPpal) || dxList[0];
    const relacionados = dxList.filter(d => d !== principal);

    const codPpal = esc(cl(principal.CODIGO_CIE || principal.CIE || principal.CODIGO_DX || ''));
    const tipoPpal = esc(cl(principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || ''));

    let primeraLinea = `<b>Diagn&oacute;sticos</b>Principal Ingreso: ${codPpal}`;
    if (tipoPpal) primeraLinea += `&nbsp;&nbsp;Tipo principal: ${tipoPpal}`;

    const relLineas = relacionados.map((d, i) => {
      const cod = esc(cl(d.CODIGO_CIE || d.CIE || d.CODIGO_DX || ''));
      return `<div style="font-size:9.5px; line-height:1.35;">Relacionado ${i + 1} Ingreso: ${cod}</div>`;
    }).join('');

    dxHtml = `<div style="font-size:9.5px; margin-top:6px; line-height:1.35;">`
      + `<div>${primeraLinea}</div>${relLineas}`
      + `</div>`;
  }

  // â”€â”€ Tabla de medicamentos (sin t&iacute;tulo) â€” pasar op2Rows para DISTANCIA/dosis â”€â”€
  const tablaHtml = renderFormulaMedicaPanacea(recordsets, [], { showTitle: false }, op2Rows);
  if (!tablaHtml) return null;

  // â”€â”€ Posfechado / Observaciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const piePdf = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <div>Posfechado: ${posfechado}</div>
      <div>Observaciones: ${observaciones}</div>
    </div>`;

  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${ordenHeaderHtml}
      ${tablaPaciente}
      ${dxHtml}
      ${tablaHtml}
      ${piePdf}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${esc(String(at.ID || ''))}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

function renderHtmlIncapacidades(payload, recordsets, datosDinamicos = {}) {
  const estilos = buildEstilos(payload.parametros);
  const cleanStr = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = escapeHtml;

  const formatFechaHora = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return formatSoloFecha(v);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };

  const GENERO_MAP = { 1: 'Masculino', 2: 'Femenino', 3: 'Indeterminado' };
  const VIA_INGRESO_MAP = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalizaci&oacute;n', 3: 'Remitido' };

  // GUIDs fijos del formato de incapacidad (estructura op=1)
  const GUID_AMBITO = '2E70F5DD-3E27-4738-A7C4-208A5B098B43';
  const GUID_ORIGEN = '94F03BF9-70CA-4F94-8895-8F567F0781C1';
  const GUID_MODALIDAD = 'AE0B1652-DA41-4886-B4C6-E6E86561A896';

  let blocksHtml = '';

  for (const rs of recordsets || []) {
    if (!rs || !rs.length) continue;
    for (const f of rs) {
      const idOrden = f.ID_ORDEN != null ? Number(f.ID_ORDEN) : null;

      const datos = idOrden && datosDinamicos.ordenesDatosPorId
        ? datosDinamicos.ordenesDatosPorId.get(idOrden)
        : null;

      // #region agent log
      fetch('http://127.0.0.1:7484/ingest/1b468bd2-7ffd-4415-8c1e-811e7c186967', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6767d5' }, body: JSON.stringify({ sessionId: '6767d5', location: 'plantilla.render.js:renderHtmlIncapacidades', message: 'orden procesada', data: { idOrden, hasDatos: !!datos, datosKeys: datos ? Object.keys(datos).slice(0, 10) : null, hasDatosDinamicos: Object.keys(datosDinamicos) }, timestamp: Date.now(), hypothesisId: 'H1-H5' }) }).catch(() => { });
      // #endregion

      if (!datos) {
        // â”€â”€â”€ Fallback: solo l&iacute;nea descriptiva â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let desc = cleanStr(f.DESCRIPCION_PROCEDIMIENTO || f.PRUEBA || f.NOMBRE_SERVICIO || '');
        if (!desc && f.NOMBRE_PLANTILLA) {
          const partes = [];
          if (f.FECHA_EXPEDICION) {
            const d = new Date(f.FECHA_EXPEDICION);
            if (!isNaN(d)) {
              const pad = n => String(n).padStart(2, '0');
              partes.push(`${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`);
            }
          }
          partes.push(cleanStr(f.NOMBRE_PLANTILLA));
          if (f.NOMBRE_ESPECIALIDAD) partes.push(cleanStr(f.NOMBRE_ESPECIALIDAD));
          if (f.NOMBRE_COMPLETO_PRESTADOR) partes.push(cleanStr(f.NOMBRE_COMPLETO_PRESTADOR));
          desc = partes.join(' - ');
        }
        if (!desc) continue;
        blocksHtml += `<div style="margin-top:12px;font-size:10px;"><strong>ORDEN DE INCAPACIDAD:</strong> ${esc(desc)}</div>`;
        continue;
      }

      // â”€â”€â”€ Render con datos completos de OPERACION=0 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const listaRows = idOrden && datosDinamicos.ordenesListaPorId
        ? (datosDinamicos.ordenesListaPorId.get(idOrden) || [])
        : [];
      const valorListaPorGuid = new Map(listaRows.map(r => [r.ID_ESTRUCTURA_PLANTILLA, r.VALOR_LISTA]));

      const textoRows = idOrden && datosDinamicos.ordenesTextoPorId
        ? (datosDinamicos.ordenesTextoPorId.get(idOrden) || [])
        : [];
      const valorTextoPorGuid = new Map(textoRows.map(r => [r.ID_ESTRUCTURA_PLANTILLA, r.VALOR_TEXTO]));

      const ambito = cleanStr(valorTextoPorGuid.get(GUID_AMBITO) || '');
      const origenInc = cleanStr(valorListaPorGuid.get(GUID_ORIGEN) || '');
      const modalidad = cleanStr(valorListaPorGuid.get(GUID_MODALIDAD) || '');

      // T&iacute;tulo de tipo de orden en t&iacute;tulo case
      const tipoOrdenNombre = cleanStr(f.NOMBRE_PLANTILLA || 'INCAPACIDADES O LICENCIAS')
        .toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      // G&eacute;nero y v&iacute;a de ingreso
      const generoTexto = GENERO_MAP[datos.GENERO_PACIENTE] || '';
      const viaIngreso = VIA_INGRESO_MAP[datos.ID_ORIGEN_VIA_INGRESO] != null
        ? VIA_INGRESO_MAP[datos.ID_ORIGEN_VIA_INGRESO]
        : '';

      // Vigencia
      const vi = formatSoloFecha(datos.FECHA_INICIO);
      const vf = formatSoloFecha(datos.FECHA_TERMINACION);
      const vigencia = vi && vf ? `${vi} - ${vf}` : (vi || vf || '');

      // Diagn&oacute;sticos compactos desde payload general
      const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
      const dxPpal = dxList.find(d => {
        const t = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || '').toUpperCase();
        return d.ES_PRINCIPAL === 1 || d.PRINCIPAL === 1 || t.includes('INGRESO') || t.includes('PRINCIPAL');
      }) || dxList[0];

      // L&iacute;neas multi-campo igual que Panacea
      const causaLine = [
        datos.CAUSA_EXTERNA ? `Causa externa: ${esc(cleanStr(datos.CAUSA_EXTERNA))}` : '',
        datos.OCUPACION ? `Ocupaci\u00f3n: ${esc(cleanStr(datos.OCUPACION))}` : 'Ocupaci\u00f3n:',
        datos.TIPO_VINCULACION ? `Tipo vinculaci\u00f3n: ${esc(cleanStr(datos.TIPO_VINCULACION))}` : '',
      ].filter(Boolean).join(' &nbsp; ');

      const diasLine = [
        datos.DIAS_INCAPACIDAD != null ? `D\u00edas de incapacidad: ${datos.DIAS_INCAPACIDAD}` : '',
        `Pr\u00f3rroga: ${datos.PRORROGA === true || datos.PRORROGA === 1 ? 'S\u00ed' : 'No'}`,
      ].filter(Boolean).join(' &nbsp; ');

      const ambitoLine = [
        ambito ? `\u00c1mbito de atenci\u00f3n: ${esc(ambito)}` : '',
        origenInc ? `Origen Incapacidad: ${esc(origenInc)}` : '',
        modalidad ? `Modalidad Tec. Salud: ${esc(modalidad)}` : '',
      ].filter(Boolean).join(' &nbsp; ');

      // Tabla de identificaci&oacute;n del paciente espec&iacute;fica para incapacidad
      // line-height:1.4 anula el line-height:0.1 del body (par&aacute;metros Panacea)
      const tdS = 'border:1px solid #000; padding:3px 5px; vertical-align:top; font-size:9.5px; line-height:1.4; width:50%; word-wrap:break-word; word-break:break-word;';
      const lb = (label, val) => `<b>${label}:</b> ${esc(cleanStr(String(val ?? '')))}`;
      const tablaPaciente = `
        <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
          <tr>
            <td style="${tdS}">${lb('Apellidos', datos.APELLIDOS_PACIENTE)}</td>
            <td style="${tdS}">${lb('Nombres', datos.NOMBRES_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Tipo Identificaci\u00f3n', datos.TIPO_IDENTIFICACION_PACIENTE)}</td>
            <td style="${tdS}">${lb('N\u00famero documento', datos.NUMERO_IDENTIFICACION_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Fecha de Nacimiento', formatSoloFecha(datos.FECHA_NACIMIENTO))}</td>
            <td style="${tdS}">${lb('Edad', datos.UNIDAD_MEDIDA_EDAD)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('G\u00e9nero', generoTexto)}</td>
            <td style="${tdS}">${lb('Ocupaci\u00f3n', datos.OCUPACION)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Direcci\u00f3n', datos.DIRECCION_PACIENTE)}</td>
            <td style="${tdS}">${lb('Tel\u00e9fono', datos.TELEFONO_PACIENTE)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Nombre del Cliente', datos.NOMBRE_TERCERO)}</td>
            <td style="${tdS}">${lb('Convenio', datos.CONVENIO)}</td>
          </tr>
          <tr>
            <td style="${tdS}">${lb('Fecha registro', formatFechaHora(datos.FECHA_EXPEDICION))}</td>
            <td style="${tdS}">${lb('Fecha atenci\u00f3n', formatFechaHora(datos.FECHA_INICIO))}</td>
          </tr>
        </table>`;

      blocksHtml += `
        <div style="font-size:9.5px; margin-top:6px;">
          <b>Orden N\u00b0: ${esc(datos.NUMERO_ORDEN || '')}</b>
          &nbsp; Orden ${esc(tipoOrdenNombre)}
          &nbsp; C\u00f3digo: ${esc(datos.CODIGO_PLANTILLA || '')}
          &nbsp; Fecha y hora: ${esc(formatFechaHora(datos.FECHA_EXPEDICION))}
        </div>
        ${tablaPaciente}
        <div style="font-size:9.5px; margin-top:8px; line-height:1.65;">
          ${vigencia ? `<div>Vigencia: ${esc(vigencia)}</div>` : ''}
          ${datos.TIPO_USUARIO ? `<div>Tipo de usuario: ${esc(cleanStr(datos.TIPO_USUARIO))}</div>` : ''}
          ${viaIngreso ? `<div>V\u00eda de ingreso: ${esc(viaIngreso)}</div>` : ''}
          ${dxList.length ? `
            <div><b>Diagn\u00f3sticos</b></div>
            ${dxPpal ? `<div>Principal Ingreso: ${esc(dxPpal.CODIGO_CIE || '')} &nbsp; Tipo principal: ${esc(dxPpal.DESCRIPCION_TIPO_DX_PPAL || '')},</div>` : ''}
          ` : ''}
          ${causaLine ? `<div>${causaLine}</div>` : ''}
          ${diasLine ? `<div>${diasLine}</div>` : ''}
          ${datos.ITEM ? `<div>Diagn\u00f3stico: ${esc(cleanStr(datos.ITEM))}</div>` : ''}
          ${ambitoLine ? `<div>${ambitoLine}</div>` : ''}
          <div>Observaciones: ${esc(cleanStr(datos.OBSERVACIONES || ''))}</div>
        </div>`;
    }
  }

  if (!blocksHtml) return null;

  // Wrapper con padding-right para que la tabla no llegue al borde del papel
  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${blocksHtml}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${escapeHtml(payload.atencion.ID || '')}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

function renderHtmlOrdenImagenologia(payload, recordsets, datosOrden = null, op1Rows = []) {
  const estilos = buildEstilos(payload.parametros);
  if (!recordsets || !recordsets.length) return null;

  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};
  const dO = datosOrden || {};
  const esc = escapeHtml;
  const cl = (s) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

  const pad2 = n => String(n).padStart(2, '0');
  const fmtDT = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };
  const fmtD = (v) => {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  };

  // â”€â”€ Datos del paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const apellidos = esc(cl(b3.APELLIDOS_PACIENTE || t['APELLIDOS_PACIENTE'] || ''));
  const nombres = esc(cl(b3.NOMBRES_PACIENTE || t['NOMBRES_PACIENTE'] || ''));
  const tipoId = esc(cl(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || ''));
  const numId = esc(cl(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || ''));
  const fechaNac = esc(fmtD(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad = esc(cl(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? String(b3.EDAD_PACIENTE) + ' A&ntilde;os' : '') || t['EDAD'] || ''));
  const genN = b3.GENERO_PACIENTE;
  const genero = esc(genN === 1 ? 'Masculino' : genN === 2 ? 'Femenino' : cl(b3.SEXO_PACIENTE || t['SEXO'] || ''));
  const ocupacion = esc(cl(b3.OCUPACION || t['OCUPACION'] || ''));
  const direccion = esc(cl(b3.DIRECCION || t['DIRECCION'] || ''));
  const telefono = esc(cl(b3.TELEFONO || t['TELEFONO'] || ''));
  const cliente = esc(cl(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE || t['CLIENTE'] || ''));
  const convenio = esc(cl(b3.NOMBRE_CONVENIO || at.CONVENIO || t['CONVENIO'] || ''));
  const fechaReg = esc(fmtDT(b3.FECHA_REGISTRO || at.FECHA_REGISTRO));
  const fechaAten = esc(fmtDT(b3.FECHA_ATENCION || at.FECHA_ATENCION));

  // â”€â”€ Datos de la orden â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allRows = (recordsets || []).flatMap(rs => rs || []);
  const pFila = allRows[0] || {};
  const ordenNum = esc(cl(String(dO.NUMERO_ORDEN || pFila.NUMERO_ORDEN || pFila.ID_ORDEN || '')));
  const ordenTipo = esc(cl(dO.NOMBRE_PLANTILLA || pFila.NOMBRE_PLANTILLA || 'Orden Imagenolog&iacute;a'));
  const ordenCod = esc(cl(String(dO.ID_TIPO_PLANTILLA || pFila.ID_TIPO_PLANTILLA || pFila.ID_TIPO_ORDEN || '')));
  const ordenFecha = esc(fmtDT(dO.FECHA_EXPEDICION || pFila.FECHA_EXPEDICION));
  const observaciones = esc(cl(dO.OBSERVACIONES || pFila.OBSERVACIONES || ''));

  const VIA_MAP = { 0: 'Consulta externa', 1: 'Urgencias', 2: 'Hospitalizaci&oacute;n', 3: 'Remitido' };
  const viaN = dO.ID_ORIGEN_VIA_INGRESO;
  const viaIngreso = esc(VIA_MAP[viaN] != null ? VIA_MAP[viaN] : cl(dO.NOMBRE_VIA_INGRESO || pFila.NOMBRE_VIA_INGRESO || b3.NOMBRE_VIA_INGRESO || t['VIA_INGRESO'] || ''));
  const tipoUsr = esc(cl(dO.TIPO_USUARIO || pFila.TIPO_USUARIO || b3.TIPO_USUARIO || at.TIPO_USUARIO || t['TIPO_USUARIO'] || ''));
  const vigDesde = fmtD(dO.FECHA_INICIO || dO.VIGENCIA_DESDE || pFila.VIGENCIA_DESDE);
  const vigHasta = fmtD(dO.FECHA_TERMINACION || dO.VIGENCIA_HASTA || pFila.VIGENCIA_HASTA);
  const vigencia = esc([vigDesde, vigHasta].filter(Boolean).join(' - '));

  // â”€â”€ Estilos de celda â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const thS = 'padding:3px 5px; border:1px solid #000; background:#d9d9d9; font-weight:bold; font-size:9.5px; line-height:1.3; white-space:nowrap;';
  const tdS = 'padding:3px 5px; border:1px solid #000; font-size:9.5px; line-height:1.3; word-break:break-word;';

  // â”€â”€ Encabezado de orden â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ordenHeaderHtml = `
    <div style="font-size:9.5px; margin-top:6px; line-height:1.5;">
      <b>Orden N&ordm;: ${ordenNum}</b>
      &nbsp;&nbsp; ${ordenTipo}
      &nbsp;&nbsp; C&oacute;digo: ${ordenCod}
      &nbsp;&nbsp; Fecha y hora: ${ordenFecha}
    </div>`;

  // â”€â”€ Tabla del paciente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tablaPaciente = `
    <table style="border-collapse:collapse; width:100%; table-layout:fixed; margin-top:4px;">
      <colgroup>
        <col style="width:16%"><col style="width:34%"><col style="width:16%"><col style="width:34%">
      </colgroup>
      <tr>
        <td style="${thS}">Apellidos:</td><td style="${tdS}">${apellidos}</td>
        <td style="${thS}">Nombres:</td><td style="${tdS}">${nombres}</td>
      </tr>
      <tr>
        <td style="${thS}">Tipo Identificaci&oacute;n:</td><td style="${tdS}">${tipoId}</td>
        <td style="${thS}">N&uacute;mero documento:</td><td style="${tdS}">${numId}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha de Nacimiento:</td><td style="${tdS}">${fechaNac}</td>
        <td style="${thS}">Edad:</td><td style="${tdS}">${edad}</td>
      </tr>
      <tr>
        <td style="${thS}">G&eacute;nero:</td><td style="${tdS}">${genero}</td>
        <td style="${thS}">Ocupaci&oacute;n:</td><td style="${tdS}">${ocupacion}</td>
      </tr>
      <tr>
        <td style="${thS}">Direcci&oacute;n:</td><td style="${tdS}">${direccion}</td>
        <td style="${thS}">Tel&eacute;fono:</td><td style="${tdS}">${telefono}</td>
      </tr>
      <tr>
        <td style="${thS}">Fecha registro :</td><td style="${tdS}">${fechaReg}</td>
        <td style="${thS}">Fecha atenci&oacute;n:</td><td style="${tdS}">${fechaAten}</td>
      </tr>
      <tr>
        <td style="${thS}">Nombre del Cliente:</td><td style="${tdS}">${cliente}</td>
        <td style="${thS}">Convenio:</td><td style="${tdS}">${convenio}</td>
      </tr>
    </table>`;

  // â”€â”€ Diagn&oacute;sticos compactos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dxList = (payload.clinico && payload.clinico.diagnosticos) || [];
  let dxHtml = '';
  if (dxList.length) {
    const esPpal = (d) => {
      const tipo = String(d.DESCRIPCION_TIPO_DX_PPAL || d.TIPO_DX || d.TIPO || '').toUpperCase();
      return d.PRINCIPAL === 1 || d.ES_PRINCIPAL === 1
        || d.ID_TIPO_DIAGNOSTICO_RIPS === 0 || d.ID_TIPO_DIAGNOSTICO_RIPS === '0'
        || tipo.includes('PRINCIPAL') || tipo.includes('INGRESO');
    };
    const principal = dxList.find(esPpal) || dxList[0];
    const relacionados = dxList.filter(d => d !== principal);

    const codPpal = esc(cl(principal.CODIGO_CIE || principal.CIE || principal.CODIGO_DX || ''));
    const tipoPpal = esc(cl(principal.DESCRIPCION_TIPO_DX_PPAL || principal.TIPO_DX || ''));

    let primeraLinea = `<b>Diagn&oacute;sticos</b>Principal Ingreso: ${codPpal}`;
    if (tipoPpal) primeraLinea += `&nbsp;&nbsp;Tipo principal: ${tipoPpal}`;

    const relLineas = relacionados.map((d, i) => {
      const cod = esc(cl(d.CODIGO_CIE || d.CIE || d.CODIGO_DX || ''));
      return `<div style="font-size:9.5px; line-height:1.35;">Relacionado ${i + 1} Ingreso: ${cod}</div>`;
    }).join('');

    dxHtml = `<div style="font-size:9.5px; margin-top:6px; line-height:1.35;">
      <div>${primeraLinea}</div>${relLineas}
      <div>Observaciones: ${observaciones}</div>
    </div>`;
  }

  // â”€â”€ Tabla de procedimientos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Usar las filas de OPERACION=1 si est&aacute;n disponibles (tienen AREA_CORPORAL,
  // LATERALIDAD, ESTADO, PRIORIDAD, TIPO_USO, COMENTARIO); si no, usar las de ordenes.
  const rowsParaTabla = op1Rows && op1Rows.length ? [op1Rows] : recordsets;
  const tablaHtml = renderOrdenesPanacea(rowsParaTabla);
  if (!tablaHtml) return null;

  const html = `
    <div style="padding: 0 12mm 0 6mm;">
      ${renderEncabezado(payload)}
      ${ordenHeaderHtml}
      ${tablaPaciente}
      ${dxHtml}
      ${tablaHtml}
      ${renderFirma(payload)}
      <div class="footer">Atenci&oacute;n: ${esc(String(at.ID || ''))}</div>
    </div>
  `;

  const body = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${estilos}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: body, parametros: (payload.parametros && payload.parametros[0]) || {} };
}
module.exports = { renderOrdenesPanacea, getFormaFarmaceutica, renderFormulaMedicaPanacea, renderOrdenesYFormulacion, clasificarTodasLasOrdenes, renderHtmlOrdenPorTipo, renderHtmlFormula, renderHtmlIncapacidades, renderHtmlOrdenImagenologia };
