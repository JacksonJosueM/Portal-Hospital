const fs = require('fs');

const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const missingPart = `          <td>\${srvHtml}</td>
          <td style="text-align:center;">\${escapeHtml(cant)}</td>
          <td>\${escapeHtml(est)}</td>
          <td>\${escapeHtml(prio)}</td>
          <td>\${escapeHtml(uso)}</td>
        </tr>
      \`;
    }
  }

  htmlTable += \`</tbody></table></div>\`;

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
  for (const rs of allFormulaRS) {`;

// The corrupted code is:
/*
        <tr>
          <td style="text-align:center;">${idx++}</td>
    if (!rs || !rs.length) continue;
*/

// Let's replace the broken junction:
const junctionRegex = /<td style="text-align:center;">\$\{idx\+\+\}<\/td>\s*if \(\!rs \|\| \!rs\.length\) continue;/;

if (junctionRegex.test(content)) {
  content = content.replace(junctionRegex, `<td style="text-align:center;">\${idx++}</td>\n${missingPart}\n    if (!rs || !rs.length) continue;`);
  fs.writeFileSync(file, content, 'utf8');
  console.log("FIX APPLIED SUCCESSFULLY");
} else {
  console.log("REGEX NOT MATCHED");
}
