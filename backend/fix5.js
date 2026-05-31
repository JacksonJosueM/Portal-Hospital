const fs = require('fs');
const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    // PRIORIDAD PANACEA
    const forma = (op2Row.FORMA_FARMACEUTICA ? String(op2Row.FORMA_FARMACEUTICA).trim() : '') || getFormaFarmaceutica(desc);
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = \`\${cantTotalVal} (\${cantLetras}) \${forma}\`.trim();
    cantidadTotalText = cantidadTotalText.replace(/\\s+/g, ' ');`;

const replacementStr = `    // PRIORIDAD PANACEA EXCLUSIVA (IGNORAR DEDUCCION SI NO HAY)
    // Extraemos la forma de todas las posibles columnas que usa Panacea
    const formaRaw = r.FORMA_FARMACEUTICA || r.FORMA || op2Row.FORMA_FARMACEUTICA || op2Row.FORMA || r.UNIDAD_MEDIDA || '';
    const formaPanacea = String(formaRaw).trim();
    
    // Solo usamos el fallback si Panacea de verdad viene en blanco
    const forma = formaPanacea || getFormaFarmaceutica(desc);
    
    const cantLetras = numeroALetras(cantTotalVal);
    let cantidadTotalText = \`\${cantTotalVal} (\${cantLetras}) \${forma}\`.trim();
    cantidadTotalText = cantidadTotalText.replace(/\\s+/g, ' ');`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log("FIX 5 APPLIED");
} else {
    console.log("TARGET STRING NOT FOUND");
}
