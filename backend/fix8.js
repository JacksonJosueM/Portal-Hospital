const fs = require('fs');
const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    const formaRaw = r.FORMA_FARMACEUTICA || r.FORMA || op2Row.FORMA_FARMACEUTICA || op2Row.FORMA || r.UNIDAD_MEDIDA || '';`;

const replacementStr = `    const formaRaw = op2Row.TEXTO_ORDEN || r.FORMA_FARMACEUTICA || r.FORMA || op2Row.FORMA_FARMACEUTICA || op2Row.FORMA || r.UNIDAD_MEDIDA || '';`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log("FIX 8 APPLIED");
} else {
    console.log("TARGET NOT FOUND");
}
