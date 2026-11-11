// Genera una tarjeta gráfica para propiedades sin fotografías publicables.
// Uso: node scripts/tarjeta-zona.mjs "Cerro Silvestre, Arraiján" images/arraijan/tarjeta-zona.png
import sharp from 'sharp';
const [zona, destino] = process.argv.slice(2);
if (!zona || !destino) { console.error('Uso: node scripts/tarjeta-zona.mjs "<zona>" <destino.png>'); process.exit(1); }
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#0f2c59"/>
  <rect x="48" y="48" width="1504" height="1104" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2"/>
  <text x="800" y="430" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="8" fill="#ffffff" fill-opacity="0.72">TERRENO · UBICACIÓN APROXIMADA</text>
  <text x="800" y="580" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="104" fill="#ffffff">${esc(zona)}</text>
  <rect x="740" y="650" width="120" height="3" fill="#ffffff" fill-opacity="0.6"/>
  <text x="800" y="760" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="#ffffff" fill-opacity="0.9">Fotografías disponibles bajo consulta</text>
  <text x="800" y="1080" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-style="italic" fill="#ffffff" fill-opacity="0.7">Panama Listings</text>
</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(destino);
console.log('Tarjeta generada:', destino);
