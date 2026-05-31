const { escapeHtml, formatFecha, formatSoloFecha, formatDecimal, bytesToDataUrl, buildFormat, resolverTokens, esTituloGinecoObstetrico, esTituloProfesionalSalud, normalizeKey, getCampo, getFallbackCampoPorNombre, numeroALetras } = require('./utils');

function renderIdentificacionPaciente(payload) {
  const at = payload.atencion || {};
  const b3 = at.basico_op3 || {};
  const t = payload.tokens || {};

  function formatDateOnly(value) {
    if (!value) return '';
    if (typeof value === 'string' && value.includes('T')) {
      const [yyyy, mm, dd] = value.split('T')[0].split('-');
      return `${dd}/${mm}/${yyyy}`;
    }
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }

  const apellidos = escapeHtml(b3.APELLIDOS_PACIENTE || t['APELLIDOS_PACIENTE'] || t['APELLIDO_PACIENTE'] || t['APELLIDO'] || '');
  const nombres = escapeHtml(b3.NOMBRES_PACIENTE || t['NOMBRES_PACIENTE'] || t['NOMBRE_PACIENTE'] || t['NOMBRE'] || '');
  const tipoId = escapeHtml(b3.CODIGO_TIPO_IDENTIFICACION || t['TIPO_IDENTIFICACION'] || t['TIPO_ID'] || '');
  const numId = escapeHtml(b3.NUMERO_IDENTIFICACION_PACIENTE || t['IDENTIFICACION_PACIENTE'] || t['IDENTIFICACION'] || t['NUMERO_DOCUMENTO'] || '');
  const fechaNac = escapeHtml(formatDateOnly(b3.FECHA_NACIMIENTO_PACIENTE || t['FECHA_NACIMIENTO']));
  const edad = escapeHtml(b3.EDAD_COMPLETA || (b3.EDAD_PACIENTE ? b3.EDAD_PACIENTE + ' A&ntilde;os' : t['EDAD'] || ''));
  const genero = escapeHtml(b3.GENERO_PACIENTE === 1 ? 'Masculino' : b3.GENERO_PACIENTE === 2 ? 'Femenino' : t['SEXO'] || t['GENERO'] || '');
  const ocupacion = escapeHtml(b3.OCUPACION || t['OCUPACION'] || '');
  const direccion = escapeHtml(b3.DIRECCION || t['DIRECCION'] || '');
  const telefono = escapeHtml(b3.TELEFONO || t['TELEFONO'] || t['TELEFONO_CASA'] || '');
  const cliente = escapeHtml(b3.NOMBRE_CLIENTE_CONVENIO || at.CLIENTE || t['CLIENTE'] || '');
  const convenio = escapeHtml(b3.NOMBRE_CONVENIO || at.CONVENIO || t['CONVENIO'] || '');
  const fechaReg = escapeHtml(formatFecha(b3.FECHA_REGISTRO) || formatFecha(at.FECHA_REGISTRO) || (t['FECHA_REGISTRO'] && t['FECHA_REGISTRO'] !== 'undefined' ? t['FECHA_REGISTRO'] : '') || '');
  const fechaAten = escapeHtml(formatFecha(b3.FECHA_ATENCION) || formatFecha(at.FECHA_ATENCION) || (t['FECHA_ATENCION'] && t['FECHA_ATENCION'] !== 'undefined' ? t['FECHA_ATENCION'] : '') || '');

  const estadoCivil = escapeHtml(
    b3.ESTADO_CIVIL
    || b3.ESTADO_CIVIL_PACIENTE
    || b3.NOMBRE_ESTADO_CIVIL
    || t['ESTADO_CIVIL']
    || getCampo(payload, ['Estado civil'])
    || 'No registrado'
  );
  const resp = escapeHtml(
    b3.NOMBRE_RESPONSABLE
    || b3.ACOMPANANTE
    || b3.NOMBRE_ACOMPANANTE
    || t['NOMBRE_ACOMPA&Ntilde;ANTE']
    || t['RESPONSABLE']
    || getCampo(payload, ['Nombre responsable', 'Acompa&ntilde;ante'])
    || 'No registrado'
  );
  const parentesco = escapeHtml(
    b3.PARENTESCO_RESPONSABLE
    || b3.PARENTESCO
    || b3.PARENTESCO_ACOMPANANTE
    || t['PARENTESCO_ACOMPA&Ntilde;ANTE']
    || t['PARENTESCO']
    || getCampo(payload, ['Parentesco responsable', 'Parentesco'])
    || 'No registrado'
  );
  const telResp = escapeHtml(
    b3.TELEFONO_RESPONSABLE
    || b3.TELEFONO_ACOMPANANTE
    || t['TELEFONO_ACOMPA&Ntilde;ANTE']
    || t['TELEFONO_RESPONSABLE']
    || getCampo(payload, ['Tel&eacute;fono responsable', 'Telefono responsable'])
    || 'No registrado'
  );
  const etnia = escapeHtml(
    b3.PERTENENCIA_ETNICA
    || b3.ETNIA
    || t['PERTENENCIA_ETNICA']
    || t['ETNIA']
    || getCampo(payload, ['Pertenencia &eacute;tnica', 'Pertenencia etnica', 'Etnia'])
    || 'No registrado'
  );
  const pais = escapeHtml(
    b3.PAIS_NACIMIENTO
    || b3.PAIS
    || t['PAIS_NACIMIENTO']
    || getCampo(payload, ['Pa&iacute;s nacimiento', 'Pais nacimiento'])
    || 'No registrado'
  );
  const codigoProcedimiento = escapeHtml(b3.CODIGO_PROCEDIMIENTO || getCampo(payload, ['C&oacute;digo procedimiento', 'Codigo procedimiento']));
  const nombreProcedimiento = escapeHtml(b3.NOMBRE_PROCEDIMIENTO || getCampo(payload, ['Nombre procedimiento']));
  const lineaProcedimiento = [codigoProcedimiento, nombreProcedimiento].filter(Boolean).join(' - ');

  return `
    ${lineaProcedimiento ? `<div class="campo-line" style="margin: 0 0 4px 0;">${lineaProcedimiento}</div>` : ''}
    <h3 style="font-size: 10px; font-weight: bold; margin: 4px 0 4px 0; text-transform: uppercase; text-decoration: underline; clear: both; display: block; line-height: 1.3;">IDENTIFICACI&Oacute;N DEL PACIENTE</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 4px; table-layout: fixed;">
      <colgroup>
        <col style="width: 18%">
        <col style="width: 32%">
        <col style="width: 18%">
        <col style="width: 32%">
      </colgroup>
      <tbody>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Apellidos:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${apellidos}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Nombres:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${nombres}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Tipo Identificaci&oacute;n:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${tipoId}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>N&uacute;mero documento:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${numId}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Fecha de Nacimiento:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${fechaNac}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Edad:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${edad}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>G&eacute;nero:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${genero}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Ocupaci&oacute;n:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${ocupacion}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Direcci&oacute;n:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${direccion}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Tel&eacute;fono:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${telefono}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Nombre del Cliente:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${cliente}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Convenio:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${convenio}</td>
        </tr>
        <tr>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Fecha registro :</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${fechaReg}</td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;"><b>Fecha atenci&oacute;n:</b></td>
          <td style="padding: 3px 5px; vertical-align: top; word-break: break-word; border: 1px solid #000;">${fechaAten}</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size: 10px; margin-bottom: 6px; font-family: Arial, sans-serif; line-height: 1.4;">
      ${estadoCivil !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Estado civil:</b> ${estadoCivil}</span>` : ''}
      ${resp !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Nombre responsable:</b> ${resp}</span>` : ''}
      ${parentesco !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Parentesco responsable:</b> ${parentesco}</span>` : ''}
      ${telResp !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Tel&eacute;fono responsable:</b> ${telResp}</span>` : ''}
      ${etnia !== 'No registrado' ? `<span style="margin-right: 16px;"><b>Pertenencia &eacute;tnica:</b> ${etnia}</span>` : ''}
      ${pais !== 'No registrado' ? `<span><b>Pa&iacute;s nacimiento:</b> ${pais}</span>` : ''}
    </div>
  `;
}

function renderEncabezado(payload) {
  const ips = payload.ips || {};
  const sede = payload.sede || {};
  const logo = payload.logoIps && payload.logoIps.LOGO
    ? bytesToDataUrl(payload.logoIps.LOGO, payload.logoIps.TIPO_MIME || 'image/png')
    : '';

  const razonSocial = ips.RAZON_SOCIAL || '';
  const nit = ips.NUMERO_IDENTIFICACION || ips.NIT || '890980752-3'; // Fallback a NIT del hospital si no llega
  const sigla = ips.SIGLA || '';
  const lema = ips.LEMA || 'Un hospital que siente'; // Lema institucional
  const nombreSede = sede.NOMBRE || '';
  const direccion = sede.DIRECCION || ips.DIRECCION || '';
  const telefono = sede.TELEFONO || ips.TELEFONO || '';

  const fechaImpresion = new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  return `
    <table class="header-table" style="table-layout: fixed; width: 100%;">
      <tr>
        <td style="width:25%; vertical-align: middle;">${logo ? `<img src="${logo}" style="max-width:90px;max-height:90px;">` : ''}</td>
        <td class="header-center" style="width:50%; vertical-align: middle;">
          <b>${escapeHtml(razonSocial)}</b><br>
          <b>NIT - ${escapeHtml(nit)}</b><br>
          <b>${escapeHtml(lema)}</b><br>
          ${escapeHtml(direccion)} - ${escapeHtml(telefono)} - Marinilla - Colombia
        </td>
        <td class="header-right" style="width:25%; vertical-align: top;">
          Fecha impresi&oacute;n: ${fechaImpresion}<br>
          Copia
        </td>
      </tr>
    </table>
    <hr class="header-sep">
  `;
}

function renderFirma(payload) {
  const prof = payload.profesional && payload.profesional.meta;
  if (!prof) return '';
  const nombre = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ');
  // CODIGO_TIPO_IDENTIFICACION ya viene como texto ("CC"); ID_TIPO_IDENTIFICACION es num&eacute;rico (1)
  const TIPO_ID_MAP = {
    1: 'CC', 2: 'CE', 3: 'PA', 4: 'RC', 5: 'TI', 6: 'AS', 7: 'MS', 8: 'NI',
    13: 'PE', 22: 'CD', 31: 'NIT', 41: 'PT', 42: 'CN', 43: 'AN'
  };
  const tipoIdRaw = prof.TIPO_IDENTIFICACION || prof.ID_TIPO_IDENTIFICACION || '';
  const tipoIdText = prof.CODIGO_TIPO_IDENTIFICACION
    || TIPO_ID_MAP[Number(tipoIdRaw)]
    || String(tipoIdRaw);
  const ident = `${tipoIdText} ${prof.NUMERO_IDENTIFICACION || ''}`.trim();

  // Nombre completo: los campos individuales pueden no tener SEGUNDO_APELLIDO en la BD del portal;
  // b3.NOMBRE_COMPLETO_PRESTADOR viene de Panacea y s&iacute; lo incluye.
  const b3Prof = payload.atencion && payload.atencion.basico_op3;
  const nombreCompleto = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ')
    || (b3Prof && b3Prof.NOMBRE_COMPLETO_PRESTADOR)
    || prof.NOMBRE_COMPLETO
    || nombre;

  const especialidad = prof.DESCRIPCION || prof.DESCRIPCION_ROL || '';

  const firmaRec = (payload.profesional.firma || [])[0];
  const firmaImg = firmaRec && firmaRec.IMAGEN
    ? `<img src="${bytesToDataUrl(firmaRec.IMAGEN, firmaRec.TIPO_MIME || 'image/png')}" style="max-height:70px; margin-bottom: 0;">`
    : '';

  return `
    <div class="firma-block" style="margin-top: 15px;">
      ${firmaImg}
      <div class="firma-line" style="margin-top: 0;"></div>
      <div class="firma-texto"><b>${escapeHtml(nombreCompleto)}</b></div>
      <div class="firma-texto">${escapeHtml(ident)}</div>
      <div class="firma-texto">NÂ° de registro: ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="firma-texto">${escapeHtml(especialidad)}</div>
    </div>
  `;
}

function renderProfesionalInfo(payload) {
  const prof = payload.profesional && payload.profesional.meta;
  if (!prof) return '';
  const nombre = [
    prof.PRIMER_NOMBRE, prof.SEGUNDO_NOMBRE, prof.PRIMER_APELLIDO, prof.SEGUNDO_APELLIDO,
  ].filter(Boolean).join(' ');

  const especialidad = prof.DESCRIPCION || prof.DESCRIPCION_ROL || '';

  return `
    <div class="profesional-print-block" style="margin-top: 20px; page-break-inside: avoid; clear: both; display: block;">
      <h3 class="seccion">PROFESIONAL DE LA SALUD</h3>
      <div class="campo-line"><b>Tipo identificaci&oacute;n:</b> ${escapeHtml(prof.TIPO_IDENTIFICACION || 'CC')}</div>
      <div class="campo-line"><b>N&uacute;mero de identificaci&oacute;n:</b> ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="campo-line"><b>Nombre profesional:</b> ${escapeHtml(nombre)}</div>
      <div class="campo-line"><b>Registro m&eacute;dico:</b> ${escapeHtml(prof.NUMERO_IDENTIFICACION || '')}</div>
      <div class="campo-line"><b>Especialidad:</b> ${escapeHtml(especialidad)}</div>
    </div>
  `;
}
module.exports = { renderIdentificacionPaciente, renderEncabezado, renderFirma, renderProfesionalInfo };
