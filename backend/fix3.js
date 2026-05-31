const fs = require('fs');
const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    if (dias && !dosisText.toLowerCase().includes('durante')) {
      dosisText += \` durante \${dias} d\\u00edas\`;
    }
    html += \`
      <tr>
        <td style="text-align:center;">\${idx++}</td>`;

const replacementStr = `    if (dias && !dosisText.toLowerCase().includes('durante')) {
      dosisText += \` durante \${dias} d\\u00edas\`;
    }

    // Armar Cantidad total
    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;
    if (cantTotalVal == null) {
      cantTotalVal = '1';
    } else {
      cantTotalVal = Number(cantTotalVal);
    }
    
    // Priorizamos la forma de la BD (op2Row), y si no existe usamos getFormaFarmaceutica
    const forma = (op2Row.FORMA_FARMACEUTICA ? String(op2Row.FORMA_FARMACEUTICA).trim() : '') || getFormaFarmaceutica(desc);
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = \`\${cantTotalVal} (\${cantLetras}) \${forma}\`.trim();
    cantidadTotalText = cantidadTotalText.replace(/\\s+/g, ' ');

    html += \`
      <tr>
        <td style="text-align:center;">\${idx++}</td>`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log("FIX 3 APPLIED");
} else {
    console.log("TARGET STRING NOT FOUND");
}
