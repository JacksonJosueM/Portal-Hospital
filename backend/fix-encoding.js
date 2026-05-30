const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'services', 'plantilla.render.js');
let text2 = fs.readFileSync(file, 'utf8');

const wordMap = {
  'IDENTIFICACIÃ“N': 'IDENTIFICACI&Oacute;N',
  'IdentificaciÃ³n': 'Identificaci&oacute;n',
  'DIAGNÃ“STICOS': 'DIAGN&Oacute;STICOS',
  'DIAGNÃ“STICO': 'DIAGN&Oacute;STICO',
  'DiagnÃ³sticos': 'Diagn&oacute;sticos',
  'OcupaciÃ³n': 'Ocupaci&oacute;n',
  'GÃ©nero': 'G&eacute;nero',
  'DirecciÃ³n': 'Direcci&oacute;n',
  'TelÃ©fono': 'Tel&eacute;fono',
  'PaÃs': 'Pa&iacute;s',
  'NÃºmero': 'N&uacute;mero',
  'atenciÃ³n': 'atenci&oacute;n',
  'AtenciÃ³n': 'Atenci&oacute;n',
  'CÃ³digo': 'C&oacute;digo',
  'cÃ³digo': 'c&oacute;digo',
  'MÃ©dico': 'M&eacute;dico',
  'mÃ©dico': 'm&eacute;dico',
  'ImÃ¡genes': 'Im&aacute;genes',
  'imÃ¡genes': 'im&aacute;genes',
  'ClÃnica': 'Cl&iacute;nica',
  'clÃnica': 'cl&iacute;nica',
  'FÃ³rmula': 'F&oacute;rmula',
  'fÃ³rmula': 'f&oacute;rmula',
  'AÃ±os': 'A&ntilde;os',
  'aÃ±os': 'a&ntilde;os',
  'DÃas': 'D&iacute;as',
  'dÃas': 'd&iacute;as',
  'Meses/': 'Meses/',
  'ImpresiÃ³n': 'Impresi&oacute;n',
  'impresiÃ³n': 'impresi&oacute;n',
  'FormulaciÃ³n': 'Formulaci&oacute;n',
  'formulaciÃ³n': 'formulaci&oacute;n',
  'ObservaciÃ³n': 'Observaci&oacute;n',
  'observaciÃ³n': 'observaci&oacute;n',
  'EvoluciÃ³n': 'Evoluci&oacute;n',
  'evoluciÃ³n': 'evoluci&oacute;n',
  'TensiÃ³n': 'Tensi&oacute;n',
  'AlergÃas': 'Alergias',
  'FÃsico': 'F&iacute;sico',
  'fÃsico': 'f&iacute;sico',
  'dÃ©ficit': 'd&eacute;ficit',
  'NeurolÃ³gico': 'Neurol&oacute;gico',
  'GinecobstÃ©tricos': 'Ginecobst&eacute;tricos',
  'BÃ¡sica': 'B&aacute;sica',
  'bÃ¡sica': 'b&aacute;sica',
  'InformaciÃ³n': 'Informaci&oacute;n',
  'informaciÃ³n': 'informaci&oacute;n',
  'Ã¡rea': '&aacute;rea',
  'Ã³n': '&oacute;n',
  'Ã³': '&oacute;',
  'Ã¡': '&aacute;',
  'Ã©': '&eacute;',
  'Ã\xAD': '&iacute;', // the char is Ã\xAD usually for PaÃs
  'Ãº': '&uacute;',
  'Ã±': '&ntilde;',
  'Ã“': '&Oacute;',
  'Ã ': '&Aacute;',
  'Ã‰': '&Eacute;',
  'Ã\x8D': '&Iacute;',
  'Ãš': '&Uacute;',
  'Ã‘': '&Ntilde;',
  'Ã¯': '&iuml;',
  'Ã¼': '&uuml;',
  'GÃ©nero': 'G&eacute;nero',
  'OcupaciÃ³n': 'Ocupaci&oacute;n',
  'DirecciÃ³n': 'Direcci&oacute;n',
  'TelÃ©fono': 'Tel&eacute;fono'
};

for (const [bad, good] of Object.entries(wordMap)) {
    text2 = text2.split(bad).join(good);
}

// Fallback manual checks
text2 = text2.replace(/Ã©/g, '&eacute;');
text2 = text2.replace(/Ã³/g, '&oacute;');
text2 = text2.replace(/Ã¡/g, '&aacute;');
text2 = text2.replace(/Ãº/g, '&uacute;');
text2 = text2.replace(/Ã±/g, '&ntilde;');
text2 = text2.replace(/Ã“/g, '&Oacute;');
text2 = text2.replace(/Ã‘/g, '&Ntilde;');

fs.writeFileSync(file, text2, 'utf8');
console.log('Fixed file.');
