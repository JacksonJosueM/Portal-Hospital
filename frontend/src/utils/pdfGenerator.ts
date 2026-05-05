import html2pdf from 'html2pdf.js';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: Letter;
            margin: 12mm 10mm 15mm 10mm;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8.5px;
            color: #000;
            line-height: 1.35;
            margin: 0;
            padding: 0;
        }

        /* ── HEADER ── */
        .header-table {
            width: 100%;
            border: none;
            border-collapse: collapse;
            margin-bottom: 4px;
        }

        .header-table td {
            border: none;
            vertical-align: middle;
            padding: 2px 4px;
        }

        .header-center {
            text-align: center;
            font-size: 8.5px;
            line-height: 1.4;
        }

        .header-right {
            text-align: right;
            font-size: 8px;
            width: 25%;
        }

        /* ── PAGE 2 HEADER ── */
        .page2-header {
            width: 100%;
            border: none;
            border-collapse: collapse;
            margin-bottom: 6px;
        }

        .page2-header td {
            border: none;
            padding: 2px 4px;
            font-size: 8px;
        }

        /* ── TABLES ── */
        table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2px;
            table-layout: fixed;
            word-wrap: break-word;
        }

        table.data-table td {
            border: 1px solid #000;
            padding: 2px 4px;
            vertical-align: top;
            font-size: 8.5px;
        }

        table.data-table td.label {
            font-weight: bold;
        }

        table.data-table td:nth-child(1),
        table.data-table td:nth-child(3) {
            width: 22%;
        }

        table.data-table td:nth-child(2),
        table.data-table td:nth-child(4) {
            width: 28%;
        }

        /* ── ORDER TABLE ── */
        table.order-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
            margin-bottom: 4px;
        }

        table.order-table th,
        table.order-table td {
            border: 1px solid #000;
            padding: 2px 4px;
            font-size: 8.5px;
            text-align: left;
        }

        table.order-table th {
            font-weight: bold;
            text-align: center;
        }

        /* ── SECTION TITLES ── */
        .title {
            text-align: center;
            font-weight: bold;
            font-size: 11px;
            margin: 6px 0 4px 0;
        }

        .subtitle {
            font-size: 8.5px;
            margin-bottom: 4px;
        }

        .section {
            font-weight: bold;
            font-size: 10px;
            margin: 8px 0 2px 0;
            text-transform: uppercase;
            text-decoration: underline;
        }

        .subsection {
            font-weight: bold;
            font-size: 8.5px;
            margin: 4px 0 2px 0;
            text-transform: uppercase;
            text-decoration: underline;
        }

        /* ── TEXT ── */
        .text-block {
            margin: 2px 0;
            text-align: left;
        }

        .field-line {
            margin: 1px 0;
            text-align: left;
        }

        .field-line b {
            font-weight: bold;
        }

        /* ── SIGNATURE ── */
        .signature-block {
            margin-top: 40px;
        }

        .signature-line {
            border-top: 1.2px solid #000;
            width: 260px;
            margin-bottom: 3px;
        }

        /* ── FOOTER ── */
        .page-footer {
            text-align: right;
            font-size: 7px;
            color: #444;
            margin-top: 10px;
        }

        /* ── PAGE BREAK ── */
        .page-break {
            page-break-before: always;
        }
    </style>
</head>

<body>

    <!-- HEADER -->
    <table class="header-table">
        <tr>
            <td style="width:15%">
                <img src="{{logo}}" width="75" onerror="this.style.display='none'">
            </td>
            <td class="header-center">
                <b>E.S.E HOSPITAL SAN JUAN DE DIOS MARINILLA</b><br>
                NIT - 890980752-3<br>
                Un hospital que siente<br>
                CARRERA 36 N 28-85 - 6045484044 - Marinilla - Colombia
            </td>
            <td class="header-right">
                <b>Atención: #{{atencion_id}}</b><br>
                Fecha impresión: {{fecha_impresion}}<br>
                Copia
            </td>
        </tr>
    </table>

    <div style="text-align: center; margin-top: 10px; margin-bottom: 10px; font-weight: bold; font-style: italic; font-size: 10px;">
        {{nombre_plantilla}}
    </div>

    <div style="margin-bottom: 4px;">{{codigo_procedimiento}} - {{nombre_procedimiento}}</div>

    <u><b>IDENTIFICACIÓN DEL PACIENTE</b></u>

    <table class="data-table">
        <tr>
            <td class="label">Apellidos:</td>
            <td>{{apellidos}}</td>
            <td class="label">Nombres:</td>
            <td>{{nombres}}</td>
        </tr>
        <tr>
            <td class="label">Tipo Identificación:</td>
            <td>{{tipo_id}}</td>
            <td class="label">Número documento:</td>
            <td>{{numero}}</td>
        </tr>
        <tr>
            <td class="label">Fecha de Nacimiento:</td>
            <td>{{fecha_nacimiento}}</td>
            <td class="label">Edad:</td>
            <td>{{edad}}</td>
        </tr>
        <tr>
            <td class="label">Género:</td>
            <td>{{genero}}</td>
            <td class="label">Ocupación:</td>
            <td>{{ocupacion}}</td>
        </tr>
        <tr>
            <td class="label">Dirección:</td>
            <td>{{direccion}}</td>
            <td class="label">Teléfono:</td>
            <td>{{telefono}}</td>
        </tr>
        <tr>
            <td class="label">Nombre del Cliente:</td>
            <td>{{eps}}</td>
            <td class="label">Convenio:</td>
            <td>{{convenio}}</td>
        </tr>
        <tr>
            <td class="label">Fecha registro :</td>
            <td>{{fecha_registro}}</td>
            <td class="label">Fecha atención:</td>
            <td>{{fecha_consulta}}</td>
        </tr>
    </table>

    <div class="text-block" style="margin-bottom: 8px;">
        <b>Estado civil:</b> {{estado_civil}}
        &nbsp;&nbsp;<b>Nombre responsable:</b> {{responsable}}
        &nbsp;&nbsp;<b>Parentesco responsable:</b> {{parentesco}}
        &nbsp;&nbsp;<b>Teléfono responsable:</b> {{telefono_responsable}}
        &nbsp;&nbsp;<b>Pertenencia étnica:</b> {{etnia}}
        &nbsp;&nbsp;<b>País nacimiento:</b> {{pais}}
    </div>

    <!-- ── CONSULTA ── -->
    <div class="section">CONSULTA</div>

    <div class="field-line"><b>Fecha atención:</b> {{fecha_consulta}}</div>
    <div class="field-line"><b>Ámbito de atención:</b> {{ambito}}</div>
    <div class="field-line"><b>Causa externa:</b> {{causa}} &nbsp;&nbsp;&nbsp; <b>Finalidad de la consulta:</b> {{finalidad}}</div>

    <!-- ── ANAMNESIS ── -->
    <div class="section">ANAMNESIS</div>

    <div class="field-line"><b>Motivo de consulta:</b> {{motivo}}</div>
    <div class="field-line"><b>Enfermedad actual:</b> {{enfermedad_actual}}</div>

    <!-- ── ANTECEDENTES ── -->
    <div class="section">ANTECEDENTES</div>

    <div class="subsection">ANTECEDENTES PERSONALES</div>
    <div class="field-line"><b>Antecedentes patológicos:</b> {{patologicos}}</div>
    <div class="field-line"><b>Antecedentes quirúrgicos:</b> {{quirurgicos}}</div>
    <div class="field-line"><b>Antecedentes alérgicos:</b> {{alergicos}}</div>
    <div class="field-line"><b>Tratamiento para Lepra:</b> {{tratamiento_lepra}}</div>
    <div class="field-line"><b>Antecedentes inmunológicos:</b> {{inmunologicos}}</div>
    <div class="field-line"><b>Antecedentes psiquiátricos:</b> {{psiquiatricos}}</div>
    <div class="field-line"><b>Antecedentes tóxicos:</b> {{toxicos}}</div>
    <div class="field-line"><b>Antecedentes transfusionales:</b> {{transfusionales}}</div>
    <div class="field-line"><b>Antecedentes traumáticos:</b> {{traumaticos}}</div>
    <div class="field-line"><b>Antecedentes hospitalarios:</b> {{hospitalarios}}</div>
    <div class="field-line"><b>Antecedentes ETS:</b> {{ets}}</div>
    <div class="field-line"><b>Antecedentes familiares:</b> {{familiares}}</div>
    <div class="field-line"><b>Antecedentes perinatales:</b> {{perinatales}}</div>
    <div class="field-line"><b>Antecedentes nutricionales:</b> {{nutricionales}}</div>
    <div class="field-line"><b>Antecedentes farmacológicos:</b> {{farmacologicos}}</div>
    <div class="field-line"><b>Antecedentes personales describir:</b> {{personales_describir}}</div>

    <div class="subsection">ANTECEDENTES GINECOBSTETRICOS</div>
    <div class="field-line"><b>Planifica:</b> {{planifica}}</div>
    <div class="field-line"><b>Método:</b> {{metodo_planificacion}}</div>
    <div class="field-line"><b>Vida Sexual:</b> {{vida_sexual}}</div>

    <!-- ── EXAMEN FISICO ── -->
    <div class="section">EXAMEN FISICO</div>

    <div class="subsection">SIGNOS VITALES</div>
    <div class="field-line"><b>Fecha del peso:</b> {{fecha_peso}}</div>
    <div class="field-line"><b>Peso:</b> {{peso}} Kilogramos</div>
    <div class="field-line"><b>Fecha de la talla:</b> {{fecha_talla}}</div>
    <div class="field-line"><b>Talla:</b> {{talla}} Metros</div>
    <div class="text-block">
        <b>Índice de masa corporal:</b> {{imc}}
        &nbsp;&nbsp;<b>Temperatura:</b> {{temperatura}} Grados Centígrados
        &nbsp;&nbsp;<b>Circunferencia de cintura:</b> {{circunferencia_cintura}}
        &nbsp;&nbsp;<b>Tensión arterial sistólica (TAS):</b> {{tas}}
        &nbsp;&nbsp;<b>Tensión arterial diastólica (TAD):</b> {{tad}}
        &nbsp;&nbsp;<b>TAM (Tensión arterial media):</b> {{tam}}
    </div>
    <div class="field-line"><b>Saturación de Oxigeno:</b> {{saturacion_oxigeno}} %</div>
    <div class="field-line"><b>Frecuencia Respiratoria (min):</b> {{frecuencia_respiratoria}}</div>
    <div class="field-line"><b>Frecuencia Cardíaca:</b> {{fc}}</div>

    <div class="page-footer">Usuario: {{usuario_impresion}} Pag. 1 de 1</div>

    <!-- FIRMA DEL MÉDICO -->
    <div class="signature-block">
        <div class="signature-line"></div>
        <b>{{medico}}</b><br>
        Identificación: {{medico_tipo_id}} {{medico_numero_id}}<br>
        Registro Médico: {{registro_medico}}<br>
        Especialidad: {{especialidad}}
    </div>

</body>

</html>
`;

export function generatePdfFromHistoria(historia: any, logoDataUrl: string, profesionalData: any) {
  if (!historia) {
    console.error('❌ [PDF] No hay datos de historia para generar el PDF');
    return;
  }

  const _html2pdf = (html2pdf as any).default || html2pdf;

  const campos = historia.campos || {};
  const atencion = historia.atencion || {};
  const paciente = historia.paciente || {};
  
  const buscarValor = (nombreBuscado: string) => {
    const b = nombreBuscado.toLowerCase().trim();
    for (const [key, val] of Object.entries(campos)) {
      const a = key.toLowerCase().trim();
      if ((a.includes(b) || b.includes(a)) && val) {
        return (val as any).toString().trim();
      }
    }
    return '';
  };

  const escapeHtml = (unsafe: any) => {
    if (unsafe === undefined || unsafe === null) return '';
    const str = String(unsafe);
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/\\n/g, '<br>');
  };

  const formatFecha = (f: any) => {
    if (!f) return '';
    try {
      const date = new Date(f);
      if (isNaN(date.getTime())) return f;
      return date.toLocaleString('es-CO', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', hour12: true 
      }).replace(',', '');
    } catch { return f; }
  };

  const formatFechaCorta = (f: any) => {
    if (!f) return '';
    try {
      const date = new Date(f);
      if (isNaN(date.getTime())) return f;
      return date.toLocaleString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch { return f; }
  };

  const variables: Record<string, string> = {
    logo: logoDataUrl || '',
    fecha_impresion: formatFecha(new Date().toISOString()),
    nombre_plantilla: historia.plantilla?.NOMBRE || 'CONSULTA DE MEDICINA GENERAL',
    codigo_procedimiento: atencion.CODIGO_PROCEDIMIENTO || '',
    nombre_procedimiento: atencion.NOMBRE_PROCEDIMIENTO || '',
    atencion_id: escapeHtml(atencion.ID),
    usuario_impresion: 'PORTAL PACIENTE',
    
    // Identificación
    apellidos: escapeHtml(paciente.apellidos || (paciente.nombres ? '' : buscarValor('apellidos'))),
    nombres: escapeHtml(paciente.nombres || atencion.NOMBRE_PACIENTE || buscarValor('nombres') || 'PACIENTE'),
    tipo_id: escapeHtml(paciente.tipo_documento || buscarValor('tipo identificacion')),
    numero: escapeHtml(paciente.numero_documento || buscarValor('numero de identificacion')),
    fecha_nacimiento: escapeHtml(formatFechaCorta(paciente.fecha_nacimiento) || buscarValor('fecha de nacimiento')),
    edad: escapeHtml(atencion.EDAD || buscarValor('edad')),
    genero: escapeHtml(paciente.genero || buscarValor('genero')),
    ocupacion: escapeHtml(buscarValor('ocupacion')),
    direccion: escapeHtml(paciente.direccion || buscarValor('direccion')),
    telefono: escapeHtml(paciente.telefono || buscarValor('telefono')),
    eps: escapeHtml(atencion.NOMBRE_CLIENTE_CONVENIO || atencion.CLIENTE || buscarValor('eps')),
    convenio: escapeHtml(atencion.NOMBRE_CONVENIO || atencion.CONVENIO || buscarValor('convenio')),
    fecha_registro: escapeHtml(formatFecha(atencion.FECHA_REGISTRO)),
    fecha_consulta: escapeHtml(formatFecha(atencion.FECHA_ATENCION)),
    
    estado_civil: escapeHtml(buscarValor('estado civil')) || 'No registrado',
    responsable: escapeHtml(buscarValor('nombre responsable')) || 'No registrado',
    parentesco: escapeHtml(buscarValor('parentesco responsable')) || 'Responsable',
    telefono_responsable: escapeHtml(buscarValor('telefono responsable')) || 'No registrado',
    etnia: escapeHtml(buscarValor('pertenencia etnica')) || 'No registrado',
    pais: escapeHtml(buscarValor('pais nacimiento')) || 'No registrado',
    
    ambito: escapeHtml(buscarValor('ambito de atencion')),
    causa: escapeHtml(buscarValor('causa externa')),
    finalidad: escapeHtml(buscarValor('finalidad')),
    motivo: escapeHtml(buscarValor('motivo de consulta')),
    enfermedad_actual: escapeHtml(buscarValor('enfermedad actual')),
    
    patologicos: escapeHtml(buscarValor('antecedentes patologicos')) || 'NINGUNO',
    quirurgicos: escapeHtml(buscarValor('antecedentes quirurgicos')) || 'NINGUNO',
    alergicos: escapeHtml(buscarValor('antecedentes alergicos')) || 'NINGUNO',
    tratamiento_lepra: escapeHtml(buscarValor('tratamiento para lepra')) || 'NINGUNO',
    inmunologicos: escapeHtml(buscarValor('antecedentes inmunologicos')) || 'NINGUNO',
    psiquiatricos: escapeHtml(buscarValor('antecedentes psiquiatricos')) || 'NINGUNO',
    toxicos: escapeHtml(buscarValor('antecedentes tóxicos')) || 'NINGUNO',
    transfusionales: escapeHtml(buscarValor('antecedentes transfusionales')) || 'NINGUNO',
    traumaticos: escapeHtml(buscarValor('antecedentes traumaticos')) || 'NINGUNO',
    hospitalarios: escapeHtml(buscarValor('antecedentes hospitalarios')) || 'NINGUNO',
    ets: escapeHtml(buscarValor('antecedentes ets')) || 'NINGUNO',
    familiares: escapeHtml(buscarValor('antecedentes familiares')) || 'NINGUNO',
    perinatales: escapeHtml(buscarValor('antecedentes perinatales')) || 'NINGUNO',
    nutricionales: escapeHtml(buscarValor('antecedentes nutricionales')) || 'NINGUNO',
    farmacologicos: escapeHtml(buscarValor('antecedentes farmacologicos')) || 'NINGUNO',
    personales_describir: escapeHtml(buscarValor('antecedentes personales describir')) || 'NINGUNO',
    planifica: escapeHtml(buscarValor('planifica')) || 'No',
    metodo_planificacion: escapeHtml(buscarValor('metodo planificacion')),
    vida_sexual: escapeHtml(buscarValor('vida sexual')),
    
    fecha_peso: escapeHtml(buscarValor('fecha del peso')),
    peso: escapeHtml(buscarValor('peso')),
    fecha_talla: escapeHtml(buscarValor('fecha de la talla')),
    talla: escapeHtml(buscarValor('talla')),
    imc: escapeHtml(buscarValor('indice de masa corporal') || buscarValor('imc')),
    temperatura: escapeHtml(buscarValor('temperatura')),
    circunferencia_cintura: escapeHtml(buscarValor('circunferencia de cintura')),
    tas: escapeHtml(buscarValor('tension arterial sistolica')),
    tad: escapeHtml(buscarValor('tension arterial diastolica')),
    tam: escapeHtml(buscarValor('tam')),
    saturacion_oxigeno: escapeHtml(buscarValor('saturacion de oxigeno')),
    frecuencia_respiratoria: escapeHtml(buscarValor('frecuencia respiratoria')),
    fc: escapeHtml(buscarValor('frecuencia cardiaca') || buscarValor('fc')),
    
    cabeza: escapeHtml(buscarValor('cabeza')),
    neurologico: escapeHtml(buscarValor('neurologico')),
    ojos: escapeHtml(buscarValor('ojos')),
    otorrino: escapeHtml(buscarValor('otorrinolaringologico') || buscarValor('orl')),
    cuello: escapeHtml(buscarValor('cuello')),
    cardiopulmonar: escapeHtml(buscarValor('cardiopulmonar')),
    respiratoria: escapeHtml(buscarValor('respiratoria')),
    abdomen: escapeHtml(buscarValor('abdomen')),
    genitourinario: escapeHtml(buscarValor('genitourinario')),
    aparato_locomotor: escapeHtml(buscarValor('aparato locomotor')),
    piel_anexos: escapeHtml(buscarValor('piel y anexos')),
    
    conducta: escapeHtml(buscarValor('conducta') || buscarValor('evolucion')),
    remitido_pyp: escapeHtml(buscarValor('remitido a programa pyp')),
    cual_pyp: escapeHtml(buscarValor('programa de pyp')),
    instrucciones: escapeHtml(buscarValor('instrucciones') || buscarValor('ordenes de la atencion')),
    deberes_derechos: escapeHtml(buscarValor('deberes y derechos')),
    
    diagnostico_principal: escapeHtml(historia.diagnosticos?.[0]?.DESCRIPCION_CIE || buscarValor('diagnostico principal')),
    tipo_diagnostico: escapeHtml(historia.diagnosticos?.[0]?.DESCRIPCION_TIPO_DX_PPAL || buscarValor('tipo principal')),
    diagnostico_relacionado: escapeHtml(historia.diagnosticos?.[1]?.DESCRIPCION_CIE || buscarValor('relacionado 1')),
    
    // Médico (Uso de profesionalData para asegurar la firma)
    medico: escapeHtml(profesionalData?.nombres || atencion.NOMBRE_COMPLETO_PRESTADOR || buscarValor('nombre profesional') || 'PROFESIONAL DE LA SALUD'),
    medico_tipo_id: escapeHtml(profesionalData?.tipo_id || 'CC'),
    medico_numero_id: escapeHtml(profesionalData?.numero_id || atencion.USUARIO || ''),
    registro_medico: escapeHtml(profesionalData?.registro || buscarValor('registro medico') || ''),
    especialidad: escapeHtml(profesionalData?.especialidad || atencion.NOMBRE_ESPECIALIDAD || buscarValor('especialidad'))
  };

  let finalHtml = HTML_TEMPLATE;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp('\\{\\{\\s*' + key + '\\s*\\}\\}', 'g');
    finalHtml = finalHtml.replace(regex, value);
  }

  const opt = {
    margin:       0,
    filename:     `historia_${atencion.ID || 'documento'}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  _html2pdf().set(opt).from(finalHtml).save();
}
