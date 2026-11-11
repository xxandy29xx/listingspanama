// Genera una tarjeta gráfica para propiedades sin fotografías publicables.
// Uso: node scripts/tarjeta-zona.mjs "Cerro Silvestre, Arraiján" images/arraijan/tarjeta-zona.png
import sharp from 'sharp';
const [zona, destino] = process.argv.slice(2);
if (!zona || !destino) { console.error('Uso: node scripts/tarjeta-zona.mjs "<zona>" <destino.png>'); process.exit(1); }
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#e7eae6"/>
  <text x="120" y="900" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" letter-spacing="6" fill="#58646b">TERRENO · UBICACIÓN APROXIMADA</text>
  <text x="116" y="1000" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="92" font-weight="500" letter-spacing="-2" fill="#142c3a">${esc(zona)}</text>
  <text x="120" y="1075" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="40" fill="#58646b">Fotografías disponibles bajo consulta</text>
</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(destino);
console.log('Tarjeta generada:', destino);
