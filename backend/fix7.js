const fs = require('fs');
const file = 'services/render/ordenes.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;`;

const replacementStr = `    try {
      require('fs').appendFileSync('C:/Nueva carpeta (2)/Portal-Hospital/backend/debug_med.json', JSON.stringify({ r, op2Row }) + '\\n');
    } catch(e) {}
    
    let cantTotalVal = r.CANT_DOSIS || r.CANTIDAD_FOFA || r.CANTIDAD_TOTAL || r.CANTIDAD;`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log("FIX 7 APPLIED");
} else {
    console.log("TARGET NOT FOUND");
}
