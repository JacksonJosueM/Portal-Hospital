/**
 * RENDER AUTORIZACIÓN — Solicitud de Autorización de Servicios de Salud
 * Ministerio de la Protección Social · Resolución 3047/2008
 *
 * Layout: SOLO tablas HTML (sin flex/grid).
 * Logo: embebido desde templates/Logo.png (via logoColombiaBase64.js).
 * Tamaño: optimizado para caber en UNA sola hoja A4.
 */

'use strict';

// Logo de Colombia embebido en base64 (generado con: node -e "..." en deploy)
let LOGO_DATA = '';
try {
  LOGO_DATA = require('./logoColombiaBase64');
} catch (_) {
  LOGO_DATA = ''; // sin logo si no existe el archivo
}

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtFecha(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function fmtHora(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

// Estilos compactos para que todo entre en UNA hoja A4
const CSS = `
@page { margin: 15mm; }
* { box-sizing: border-box; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 7.5pt;
  color: #000;
  margin: 0;
  padding: 0;
  background: #fff;
}
table { border-collapse: collapse; width: 100%; }
td, th { vertical-align: top; }
.sec {
  background-color: transparent;
  color: #000;
  font-weight: bold;
  font-size: 7.5pt;
  text-transform: uppercase;
  padding: 3px 4px;
  text-align: center;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
}
.sec-center { text-align: center; }
.etiq { font-weight: bold; white-space: nowrap; }
.tbl-data td { padding: 2px 3px; font-size: 7.5pt; }
.tbl-cups th {
  background: transparent;
  font-weight: bold;
  padding: 3px 4px;
  border: 1px solid #ccc;
  text-align: left;
  font-size: 7.5pt;
}
.tbl-cups td { padding: 3px 4px; border: 1px solid #ccc; font-size: 7.5pt; }
.manejo  { font-weight: bold; padding: 3px 3px; border-top:1px solid #000; border-bottom:1px solid #000; font-size:7.5pt; }
.just    { font-weight: bold; padding: 2px 3px; font-size:7.5pt; }
.nom-etiq { font-size: 6.5pt; color: #333; }
`;

/**
 * @param {object} payload   printPayload de historia.print.service.js
 * @param {object} autorData { autorizacion, min[], dx[], atencion[] }
 * @returns {{ html: string, parametros: object } | null}
 */
function renderHtmlAutorizacion(payload, autorData) {
  const { autorizacion, min = [], dx = [], atencion = [] } = autorData || {};
  if (!autorizacion && !min.length) return null;

  // ── Fuentes de datos ────────────────────────────────────────────────────
  const enc  = min[0] || {};
  const at   = payload.atencion || {};
  const b3   = at.basico_op3 || {};
  const tok  = payload.tokens || {};
  const ips  = payload.ips   || {};
  const sede = payload.sede  || {};

  // Prestador
  const razonSocial = esc(enc.NOMBRE_PRESTADOR    || enc.NOMBRE_IPS    || ips.RAZON_SOCIAL          || 'E.S.E.HOSPITAL SAN JUAN DE DIOS MARINILLA');
  const nit         = esc(enc.NUMERO_IDENTIFICA_PRESTADOR || enc.NIT_IPS       || ips.NUMERO_IDENTIFICACION || '890980752');
  const codigoIps   = esc(enc.CODIGO_PRESTADOR    || enc.CODIGO_IPS    || ips.CODIGO                || '054400527301');
  const dirPresta   = esc(enc.DIRECCION_PRESTADOR || enc.DIRECCION_IPS || sede.DIRECCION            || ips.DIRECCION || 'CARRERA 36 N 28 - 85');
  const telPresta   = esc(enc.TELEFONO_PRESTADOR  || enc.TELEFONO_IPS  || sede.TELEFONO             || ips.TELEFONO  || '6045484044');
  const depto       = esc(enc.DEPARTAMENTO_PRESTADOR || enc.DEPARTAMENTO  || 'ANTIOQUIA');
  const codDepto    = esc(enc.CODIGO_DEPARTAMENTO_PRESTADOR || enc.CODIGO_DEPTO  || '05');
  const municipio   = esc(enc.CIUDAD_PRESTADOR || enc.MUNICIPIO     || 'Marinilla');
  const codMun      = esc(enc.CODIGO_CIUDAD_PRESTADOR || enc.CODIGO_MUNICIPIO || enc.CODIGO_MUN || '440');

  // EPS (Priorizar Cliente / Pagador sobre Convenio)
  const eps    = esc(enc.NOMBRE_TERCERO || enc.NOMBRE_CLIENTE_CONVENIO || enc.NOMBRE_CLIENTE || enc.CLIENTE || enc.NOMBRE_PAGADOR || enc.ENTIDAD_PAGADORA || enc.NOMBRE_EPS || at.CLIENTE || b3.NOMBRE_CLIENTE_CONVENIO || enc.NOMBRE_CONVENIO || at.CONVENIO || b3.NOMBRE_CONVENIO || '');
  const codEps = esc(enc.NUMERO_IDENTIFICA_TERCERO || enc.CODIGO_TERCERO || enc.CODIGO_CLIENTE_CONVENIO || enc.CODIGO_CLIENTE || enc.CODIGO_PAGADOR || enc.CODIGO_EPS || at.CODIGO_CLIENTE || b3.CODIGO_CLIENTE || tok['CODIGO_CLIENTE'] || enc.CODIGO_CONVENIO || b3.CODIGO_CONVENIO || at.CODIGO_CONVENIO || tok['CODIGO_CONVENIO'] || '');

  // Solicitud
  const numSol   = esc(enc.NUMERO_SOLICITUD || enc.NUMERO_AUTORIZACION || (autorizacion && autorizacion.NUMERO_AUTORIZACION) || '');
  const rawF     = enc.FECHA_SOLICITUD || enc.FECHA || (autorizacion && autorizacion.FECHA);
  const fechaSol = fmtFecha(rawF);
  const horaSol  = fmtHora(rawF);

  // Paciente
  const apell1    = esc(enc.PRIMER_APELLIDO  || b3.APELLIDOS_PACIENTE || tok['APELLIDOS_PACIENTE'] || '');
  const apell2    = esc(enc.SEGUNDO_APELLIDO || '');
  const nom1      = esc(enc.PRIMER_NOMBRE   || b3.NOMBRES_PACIENTE   || tok['NOMBRES_PACIENTE']   || '');
  const nom2      = esc(enc.SEGUNDO_NOMBRE  || '');
  
  // Buscar descripción completa del tipo de documento si está disponible
  let tipoIdVal = enc.TIPO_IDENTIFICA_PACIENTE || enc.TIPO_DOCUMENTO || b3.TIPO_IDENTIFICACION || tok['TIPO_IDENTIFICACION_DESC'] || b3.CODIGO_TIPO_IDENTIFICACION || tok['TIPO_IDENTIFICACION'] || '';
  if (tipoIdVal === 'PT') tipoIdVal = 'Permiso por protección temporal';
  if (tipoIdVal === 'CC') tipoIdVal = 'Cédula de ciudadanía';
  if (tipoIdVal === 'TI') tipoIdVal = 'Tarjeta de identidad';
  if (tipoIdVal === 'RC') tipoIdVal = 'Registro civil';
  if (tipoIdVal === 'CE') tipoIdVal = 'Cédula de extranjería';
  const tipoId    = esc(tipoIdVal);

  const numId     = esc(enc.NUMERO_IDENTIFICA_PACIENTE || enc.NUMERO_DOCUMENTO || b3.NUMERO_IDENTIFICACION_PACIENTE || tok['IDENTIFICACION_PACIENTE'] || '');
  const fechaNac  = esc(fmtFecha(enc.FECHA_NACIMIENTO_PACIENTE || enc.FECHA_NACIMIENTO || b3.FECHA_NACIMIENTO_PACIENTE));
  const dirPac    = esc(enc.DIRECCION_PACIENTE || b3.DIRECCION || tok['DIRECCION'] || '');
  const telPac    = esc(enc.TELEFONO_PACIENTE  || b3.TELEFONO  || tok['TELEFONO']  || '');
  const deptoPac  = esc(enc.DEPARTAMENTO_PACIENTE || enc.DEPARTAMENTO_PAC  || depto);
  const codDPac   = esc(enc.CODIGO_DEPARTAMENTO_PACIENTE || enc.CODIGO_DEPTO_PAC  || codDepto);
  const munPac    = esc(enc.CIUDAD_PACIENTE || enc.MUNICIPIO_PAC     || municipio);
  const codMPac   = esc(enc.CODIGO_CIUDAD_PACIENTE || enc.CODIGO_MUN_PAC    || codMun);
  const telCel    = esc(enc.TELEFONO_MOVIL_PACIENTE || enc.TELEFONO_CELULAR  || '');
  const correo    = esc(autorData.pacienteEmail || enc.EMAIL_PACIENTE || enc.EMAIL_PAC || '');
  const cobertura = esc(enc.COBERTURA_SALUD || enc.NOMBRE_COBERTURA  || enc.NOMBRE_CONVENIO || eps);

  // Atención
  const r0        = atencion[0] || {};
  const causa     = esc(r0.CAUSAEXTERNA       || r0.CAUSA_EXTERNA      || 'Enfermedad general');
  const tipoServ  = esc(r0.TIPOSERVICIOORIGEN || r0.TIPO_SERVICIO_ORIGEN || 'Servicios electivos');
  const priorid   = esc(r0.PRIORIDADATENCION  || r0.PRIORIDAD_ATENCION  || 'Prioritaria');
  const ubicPac   = esc(r0.UBICACIONPACIENTE  || r0.UBICACION_PACIENTE  || 'Consulta externa');
  const servUbic  = esc(r0.SERVICIOUBICACION  || r0.SERVICIO_UBICACION  || '');
  const cama      = esc(r0.CAMA               || '');
  const manejo    = esc(r0.MANEJOINTEGRAL     || r0.MANEJO_INTEGRAL     || (autorizacion && autorizacion.MANEJO_INTEGRAL) || '');
  const justClin  = esc(r0.OBSERVACIONES      || (autorizacion && autorizacion.OBSERVACIONES) || 'EVALUACION');

  // Médico
  const nomMed    = esc(r0.NOMBREPRESTADORORIGEN  || r0.NOMBRE_PRESTADOR_ORIGEN   || enc.NOMBRE_PRESTADOR   || '');
  const cargoMed  = esc(r0.CARGOPRESTADOR         || r0.CARGO_PRESTADOR           || 'MEDICO');
  const telMed    = esc(r0.TELEFONOPRESTADORORIGEN || r0.TELEFONO_PRESTADOR_ORIGEN || enc.TELEFONO_PRESTADOR || '');

  // ── Filas tabla CUPS ──────────────────────────────────────────────────
  const filasServ = atencion.length
    ? atencion.map(row => {
        const tipo = esc(row.TIPOSERVICIO   || row.TIPO_SERVICIO   || '');
        const cod  = esc(row.CODIGOSERVICIO || row.CODIGO_SERVICIO || '');
        const cant = esc(row.CANTIDAD != null ? String(row.CANTIDAD) : '1');
        const desc = esc(row.DESCRIPCIONSERVICIO || row.DESCRIPCION_SERVICIO
                      || row.NOMBRESERVICIO      || row.NOMBRE_SERVICIO       || '');
        return `<tr>
          <td style="width:18%;">${tipo}</td>
          <td style="width:14%;">${cod}</td>
          <td style="width:10%;text-align:center;">${cant}</td>
          <td>${desc}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" style="color:#666;font-style:italic;padding:3px;">Sin servicios registrados</td></tr>`;

  // ── Filas diagnósticos (solo las que tienen datos) ─────────────────────
  let filasDx = '';
  // Filtrar diagnósticos que realmente tienen código
  const validDx = dx.filter(d => {
    const cod = String(d.CODIGO_CIE || d.CODIGOCIE || d.CODIGO || '').trim();
    return cod.length > 0;
  });
  
  if (validDx.length) {
    // Asignar el primer diagnóstico válido como Principal, el segundo como Relacionado 1, etc.
    const principal = validDx[0];
    const relacionados = validDx.slice(1);
    
    const items = [
      { label: 'Principal',     row: principal },
      { label: 'Relacionado 1', row: relacionados[0] },
      { label: 'Relacionado 2', row: relacionados[1] },
    ].filter(x => x.row);

    filasDx = items.map(({ label, row }) => {
      const cod  = esc(row.CODIGO_CIE     || row.CODIGOCIE     || row.CODIGO      || '');
      const desc = esc(row.DESCRIPCION_CIE || row.DESCRIPCIONCIE || row.DESCRIPCION || '');
      return `<tr>
        <td style="width:26%;">${label}</td>
        <td style="width:17%;">${cod}</td>
        <td>${desc}</td>
      </tr>`;
    }).join('');
  }

  // ── Logo ───────────────────────────────────────────────────────────────
  const logoHtml = LOGO_DATA
    ? `<img src="${LOGO_DATA}" height="62" alt="">`
    : '';

  // ── HTML ──────────────────────────────────────────────────────────────
  const html = `
<table width="100%" cellpadding="0" cellspacing="0" style="padding:5mm 8mm 4mm 8mm;">
<tr><td>

  <!-- ① ENCABEZADO -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:3px;">
    <tr>
      <td width="70" valign="middle" align="center">${logoHtml}</td>
      <td align="center" valign="middle" style="padding:2px 0;">
        <div style="font-size:8.5pt;font-weight:bold;">MINISTERIO DE LA PROTECCIÓN SOCIAL</div>
        <div style="font-size:10pt;font-weight:bold;margin-top:3px;">SOLICITUD DE AUTORIZACIÓN DE SERVICIOS DE SALUD</div>
      </td>
      <td width="70"></td>
    </tr>
  </table>

  <!-- ② Número / Fecha / Hora -->
  <table width="100%" cellpadding="2" cellspacing="0"
         style="border-top:2px solid #000;border-bottom:2px solid #000;margin-bottom:0;">
    <tr>
      <td width="34%" align="center"><b>NÚMERO DE SOLICITUD:</b>&nbsp;${numSol}</td>
      <td width="33%" align="center"><b>FECHA:</b>&nbsp;${fechaSol}</td>
      <td width="33%" align="center"><b>HORA:</b>&nbsp;${horaSol}</td>
    </tr>
  </table>

  <!-- ③ PRESTADOR -->
  <table class="tbl-data" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="4" class="sec" style="border-top:2px solid #000;">
        INFORMACIÓN DEL PRESTADOR (Solicitante)
      </td>
    </tr>
    <tr>
      <td width="9%"><span class="etiq">Nombre:</span></td>
      <td width="55%">${razonSocial}</td>
      <td width="6%"><span class="etiq">NIT:</span></td>
      <td>NIT ${nit}</td>
    </tr>
    <tr>
      <td><span class="etiq">Código:</span></td>
      <td>${codigoIps}</td>
      <td><span class="etiq">Dirección prestador:</span></td>
      <td>${dirPresta}</td>
    </tr>
    <tr>
      <td><span class="etiq">Teléfono:</span></td>
      <td>${telPresta}&nbsp;&nbsp;&nbsp;<span class="etiq">Departamento:</span>&nbsp;${depto}&nbsp;${codDepto}</td>
      <td><span class="etiq">Municipio:</span></td>
      <td>${municipio}&nbsp;${codMun}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="etiq">ENTIDAD A LA QUE SE LE SOLICITA (Pagador):</span>&nbsp;${eps}</td>
      <td><span class="etiq">CÓDIGO:</span></td>
      <td>${codEps}</td>
    </tr>
  </table>

  <!-- ④ DATOS DEL PACIENTE -->
  <table class="tbl-data" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="4" class="sec sec-center" style="border-top:2px solid #000;">
        DATOS DEL PACIENTE
      </td>
    </tr>
    <tr style="border-bottom:1px solid #ddd;">
      <td width="25%" align="center" style="padding:2px 3px;">
        ${apell1}<br><span class="nom-etiq">1er Apellido</span>
      </td>
      <td width="25%" align="center" style="padding:2px 3px;">
        ${apell2}<br><span class="nom-etiq">2do Apellido</span>
      </td>
      <td width="25%" align="center" style="padding:2px 3px;">
        ${nom1}<br><span class="nom-etiq">1er Nombre</span>
      </td>
      <td width="25%" align="center" style="padding:2px 3px;">
        ${nom2}<br><span class="nom-etiq">2do Nombre</span>
      </td>
    </tr>
    <tr>
      <td colspan="2"><span class="etiq">Tipo documento de identificación:</span>&nbsp;${tipoId}</td>
      <td colspan="2"><span class="etiq">Número documento de identificación:</span>&nbsp;${numId}</td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Fecha de nacimiento:</span>&nbsp;${fechaNac}</td>
    </tr>
    <tr>
      <td colspan="3"><span class="etiq">Dirección de residencia habitual:</span>&nbsp;${dirPac}</td>
      <td><span class="etiq">Teléfono:</span>&nbsp;${telPac}</td>
    </tr>
    <tr>
      <td colspan="4">
        <span class="etiq">Departamento:</span>&nbsp;${deptoPac}&nbsp;${codDPac}
        &nbsp;&nbsp;&nbsp;<span class="etiq">Municipio:</span>&nbsp;${munPac}&nbsp;${codMPac}
      </td>
    </tr>
    <tr>
      <td colspan="2"><span class="etiq">Teléfono celular:</span>&nbsp;${telCel}</td>
      <td colspan="2"><span class="etiq">Correo electrónico:</span>&nbsp;${correo}</td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Cobertura en salud:</span>&nbsp;${cobertura}</td>
    </tr>
  </table>

  <!-- ⑤ ATENCIÓN Y SERVICIOS -->
  <table class="tbl-data" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="4" class="sec sec-center" style="border-top:2px solid #000;">
        INFORMACIÓN DE LA ATENCIÓN Y SERVICIOS SOLICITADOS
      </td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Origen:</span>&nbsp;${causa}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="etiq">Tipo de servicios solicitados:</span>&nbsp;${tipoServ}</td>
      <td colspan="2"><span class="etiq">Prioridad de la atención:</span>&nbsp;${priorid}</td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Ubicación del paciente al momento de la solicitud de la autorización:</span></td>
    </tr>
    <tr>
      <td colspan="2">${ubicPac}</td>
      <td colspan="2"><span class="etiq">Servicio:</span>&nbsp;${servUbic}</td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Cama:</span>&nbsp;${cama}</td>
    </tr>
  </table>

  ${manejo ? `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0;">
    <tr><td class="manejo"><b>Manejo integral según guía de:</b>&nbsp;${manejo}</td></tr>
  </table>` : ''}

  <!-- Tabla CUPS -->
  <table class="tbl-cups" width="100%" cellpadding="0" cellspacing="0" style="margin:1px 0;">
    <thead>
      <tr>
        <th width="13%"></th>
        <th width="14%">Código CUPS</th>
        <th width="10%">Cantidad</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>${filasServ}</tbody>
  </table>

  ${justClin ? `
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td class="just">Justificación clínica: ${justClin}</td></tr>
  </table>` : ''}

  ${filasDx ? `
  <table class="tbl-cups" width="100%" cellpadding="0" cellspacing="0" style="margin:1px 0;">
    <thead>
      <tr>
        <th width="26%">Impresión diagnóstica:</th>
        <th width="17%">Código CIE10</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>${filasDx}</tbody>
  </table>` : ''}

  <!-- ⑥ PERSONA QUE SOLICITA -->
  <table class="tbl-data" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td colspan="4" class="sec sec-center" style="border-top:2px solid #000;">
        INFORMACIÓN DE LA PERSONA QUE SOLICITA
      </td>
    </tr>
    <tr>
      <td colspan="3"><span class="etiq">Nombre de que solicita:</span>&nbsp;${nomMed}</td>
      <td><span class="etiq">Teléfono:</span>&nbsp;${telMed}</td>
    </tr>
    <tr>
      <td colspan="4"><span class="etiq">Cargo o actividad:</span>&nbsp;${cargoMed}</td>
    </tr>
  </table>
  <div style="border-top:2px solid #000;margin-top:3px;"></div>

</td></tr>
</table>`;

  const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>${CSS}</style>
</head>
<body>
${html}
</body>
</html>`;

  return { html: fullHtml, parametros: (payload.parametros && payload.parametros[0]) || {} };
}

module.exports = { renderHtmlAutorizacion, CSSAutorizacion: CSS };
