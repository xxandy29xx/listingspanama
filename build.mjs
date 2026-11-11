// Genera el sitio estático en dist/ a partir de data/propiedades.json y data/sitio.json.
// Uso: npm run build
import { readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const raiz = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(raiz, 'dist');
const sitio = JSON.parse(await readFile(path.join(raiz, 'data/sitio.json'), 'utf8'));
const propiedades = JSON.parse(await readFile(path.join(raiz, 'data/propiedades.json'), 'utf8'));

// Los IDs de analítica pueden venir de variables de entorno (Vercel) o de data/sitio.json.
// Un ID vacío o con formato inválido no se usa: no se carga ningún script.
const avisos = [];
function idValido(nombre, valor, patron) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (patron.test(v)) return v;
  avisos.push(`${nombre}: «${v}» no tiene el formato esperado; no se cargará.`);
  return '';
}
const ga4 = idValido('GA4', process.env.GA4_ID || sitio.analitica.ga4Id, /^G-[A-Z0-9]{6,}$/);
const clarity = idValido('Clarity', process.env.CLARITY_ID || sitio.analitica.clarityId, /^[a-z0-9]{8,14}$/);

/* ---------- utilidades ---------- */
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dinero = (n) => '$' + Number(n).toLocaleString('en-US');
const numero = (n) => Number(n).toLocaleString('en-US');
const normal = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const abs = (ruta) => sitio.urlBase + ruta;
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
async function escribir(rel, contenido) {
  const destino = path.join(dist, rel);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
}

const TIPOS = { apartamento: 'Apartamento', casa: 'Casa', terreno: 'Terreno' };
const OPS = { venta: 'En venta', alquiler: 'En alquiler' };
const op = (p, tipo) => p.operaciones.find((o) => o.tipo === tipo);
const precioOp = (o) => (o.precio == null ? 'Negociable' : o.tipo === 'alquiler' ? `${dinero(o.precio)}/mes` : dinero(o.precio));
const precioTexto = (p) => p.operaciones.map(precioOp).join(' · ');
const chipTexto = (p) => p.operaciones.map((o) => (o.tipo === 'alquiler' ? 'Alquiler' : 'Venta')).join(' · ');
const rutaDe = (p) => `/propiedades/${p.slug}/`;
const conPin = (p) => p.ubicacion.precision !== 'zona' && p.ubicacion.lat != null && p.ubicacion.lng != null;
const enZona = (p) => p.ubicacion.precision === 'zona' && p.ubicacion.zona;
// «Marbella, Ciudad de Panamá» ya incluye la ciudad: no se repite.
const lugar = (p) => (p.zona.includes(p.ciudad) ? p.zona : `${p.zona} · ${p.ciudad}`);
const PRECISION = { edificio: 'Ubicación del edificio', residencial: 'Ubicación del residencial (no de la casa)' };
const enlaceMaps = (p, clase = '') => `<a${clase ? ` class="${clase}"` : ''} href="${esc(p.ubicacion.mapsUrl)}" target="_blank" rel="noopener noreferrer" data-maps="${p.ref}">Ver en Google Maps</a>`;
function datosDe(p) {
  const d = [];
  if (p.area_m2) d.push([numero(p.area_m2), 'm²', 'area', 'Área']);
  if (p.recamaras) d.push([p.recamaras, 'recámaras', 'cama', 'Recámaras']);
  if (p.banos) d.push([p.banos, 'baños', 'bano', 'Baños']);
  if (p.parking) d.push([p.parking, 'estacionamientos', 'auto', 'Estacionamientos']);
  return d;
}

/* ---------- WhatsApp ---------- */
const wa = (texto) => `https://wa.me/${sitio.whatsapp}?text=${encodeURIComponent(texto)}`;
const waGeneral = wa(`Hola, vi ${sitio.nombre} y quisiera información.`);
const waPropiedad = (p) => wa(`Hola, me interesa ${p.titulo} (${p.zona}), ref. ${p.ref}. ${abs(rutaDe(p))}`);
const waUbicacion = (p) => wa(`Hola, quisiera consultar la ubicación de ${p.titulo} (${p.zona}), ref. ${p.ref}. ${abs(rutaDe(p))}`);
const enlaceUbicacionWa = (p, clase) => `<a class="${clase}" href="${waUbicacion(p)}" target="_blank" rel="noopener noreferrer" data-ref="${p.ref}" data-lugar="ubicacion">${iconoWa}Consultar ubicación por WhatsApp</a>`;
const ico = (n) => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const iconoWa = ico('wa');

/* ---------- imágenes ---------- */
const ANCHOS = [480, 960, 1600];
const memoria = new Map();
let generadas = 0;
async function fresco(origen, destino) {
  if (!existsSync(destino)) return false;
  return (await stat(destino)).mtimeMs >= (await stat(origen)).mtimeMs;
}
async function imagen(rel) {
  if (memoria.has(rel)) return memoria.get(rel);
  const origen = path.join(raiz, 'images', rel);
  if (!existsSync(origen)) throw new Error(`Falta la imagen images/${rel}`);
  const meta = await sharp(origen).metadata();
  const ancho = meta.autoOrient?.width ?? meta.width;
  const alto = meta.autoOrient?.height ?? meta.height;
  const base = rel.replace(/\.[^.]+$/, '').toLowerCase();
  const anchos = [...new Set([...ANCHOS.filter((a) => a < ancho), Math.min(ancho, ANCHOS.at(-1))])].sort((a, b) => a - b);
  const variantes = [];
  for (const a of anchos) {
    const url = `/img/${base}-${a}.webp`;
    const destino = path.join(dist, url);
    if (!(await fresco(origen, destino))) {
      await mkdir(path.dirname(destino), { recursive: true });
      await sharp(origen).rotate().resize({ width: a }).webp({ quality: 74 }).toFile(destino);
      generadas++;
    }
    variantes.push({ a, url });
  }
  const info = {
    ancho, alto, variantes,
    srcset: variantes.map((v) => `${v.url} ${v.a}w`).join(', '),
    media: (variantes.find((v) => v.a >= 960) ?? variantes.at(-1)).url,
    chica: variantes[0].url,
    grande: variantes.at(-1).url,
  };
  memoria.set(rel, info);
  return info;
}
function img(info, { alt, sizes, lazy = true, atributos = '', encuadre = '' }) {
  if (encuadre) atributos += ` style="object-position:${encuadre}"`;
  return `<img src="${info.media}" srcset="${info.srcset}" sizes="${sizes}" width="${info.ancho}" height="${info.alto}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async" ${atributos}>`;
}
async function imagenOg(rel, nombre) {
  const origen = path.join(raiz, 'images', rel);
  const url = `/og/${nombre}.jpg`;
  const destino = path.join(dist, url);
  if (!(await fresco(origen, destino))) {
    await mkdir(path.dirname(destino), { recursive: true });
    await sharp(origen).rotate().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 80, mozjpeg: true }).toFile(destino);
    generadas++;
  }
  return url;
}

/* ---------- preparación ---------- */
await mkdir(dist, { recursive: true });
for (const viejo of ['index.html', '404.html', 'propiedades', 'contacto', 'assets', 'sitemap.xml', 'robots.txt']) {
  await rm(path.join(dist, viejo), { recursive: true, force: true });
}

const css = await readFile(path.join(raiz, 'src/estilo.css'), 'utf8');
const js = await readFile(path.join(raiz, 'src/app.js'), 'utf8');
const huella = (t) => createHash('sha256').update(t).digest('hex').slice(0, 10);
const rutaCss = `/assets/estilo.${huella(css)}.css`;
const rutaJs = `/assets/app.${huella(js)}.js`;
await escribir(rutaCss, css);
await escribir(rutaJs, js);

await mkdir(path.join(dist, 'assets'), { recursive: true });
const logoOrigen = path.join(raiz, 'images/logofondoazul.PNG');
await sharp(logoOrigen).resize(96, 96).webp({ quality: 82 }).toFile(path.join(dist, 'assets/logo-96.webp'));
await sharp(logoOrigen).resize(512, 512).png().toFile(path.join(dist, 'assets/logo-512.png'));
await sharp(logoOrigen).resize(180, 180).png().toFile(path.join(dist, 'assets/apple-touch-icon.png'));
await copyFile(path.join(raiz, 'images/favicon.svg'), path.join(dist, 'assets/favicon.svg'));
await copyFile(path.join(raiz, 'images/favicon.png'), path.join(dist, 'assets/favicon.png'));

for (const p of propiedades) {
  p._portada = await imagen(p.portada);
  p._fotos = [];
  for (const f of p.fotos) p._fotos.push(await imagen(f));
  p._og = await imagenOg(p.portada, p.slug);
}
const destacada = propiedades.find((p) => p.destacada) ?? propiedades[0];
const ogInicio = await imagenOg(destacada.portada, 'inicio');

const heroInfo = await imagen(sitio.portada.imagen);

/* ---------- piezas comunes ---------- */
const organizacion = {
  '@type': 'Organization',
  '@id': abs('/#organizacion'),
  name: sitio.nombre,
  url: abs('/'),
  logo: abs('/assets/logo-512.png'),
  description: 'Plataforma de marketing inmobiliario en Panamá que conecta a personas interesadas con corredores de bienes raíces aliados.',
  email: sitio.email,
  telephone: sitio.telefonoVisible,
  areaServed: { '@type': 'Country', name: 'Panamá' },
  sameAs: [sitio.instagram],
};

function cabeza({ titulo, descripcion, ruta, og, tipoOg = 'website', ld = [], indexar = true, precarga = '' }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
${indexar ? `<link rel="canonical" href="${abs(ruta)}">` : '<meta name="robots" content="noindex">'}
<meta property="og:type" content="${tipoOg}">
<meta property="og:site_name" content="${esc(sitio.nombre)}">
<meta property="og:locale" content="es_PA">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${abs(ruta)}">
<meta property="og:image" content="${abs(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#142c3a">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet">
${precarga}
<link rel="stylesheet" href="${rutaCss}">
<script>document.documentElement.classList.add('js')</script>
${ld.map((o) => `<script type="application/ld+json">${json({ '@context': 'https://schema.org', ...o })}</script>`).join('\n')}
</head>`;
}

// Iconos de trazo, un solo juego para todo el sitio.
const iconos = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-area" viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 9h3M4 15h3M9 20v-3M15 20v-3"/></symbol>
<symbol id="i-cama" viewBox="0 0 24 24"><path d="M3 19v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 16h18M6 11V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4"/></symbol>
<symbol id="i-bano" viewBox="0 0 24 24"><path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2"/></symbol>
<symbol id="i-auto" viewBox="0 0 24 24"><path d="M3 13l2-5.500A2 2 0 0 1 7 6h10a2 2 0 0 1 2 1.500L21 13v4H3v-4zM3 13h18M6 17v2M18 17v2"/><path d="M7 15h.01M17 15h.01"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.200-7-11a7 7 0 0 1 14 0c0 4.800-7 11-7 11z"/><circle cx="12" cy="10" r="2.500"/></symbol>
<symbol id="i-flecha" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-atras" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="i-lista" viewBox="0 0 24 24"><path d="M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z"/></symbol>
<symbol id="i-mapa" viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></symbol>
<symbol id="i-filtros" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></symbol>
<symbol id="i-cerrar" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-ampliar" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></symbol>
<symbol id="i-wa" viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-7.700 13.600L3 21l4.500-1.200A9 9 0 1 0 12 3z"/><path d="M9 8.500c0 3.500 3 6.500 6.500 6.500l1-1.500-2-1-1 .800c-1-.500-1.800-1.300-2.300-2.300l.800-1-1-2L9 8.500z"/></symbol>
</defs></svg>`.replace(/(\d)\.(\d)00\b/g, '$1.$2');

const NAV = [
  ['Comprar', '/?op=venta#propiedades', 'data-nav-op="venta"'],
  ['Alquilar', '/?op=alquiler#propiedades', 'data-nav-op="alquiler"'],
  ['Publicar propiedad', '/contacto/?interes=publicar', ''],
  ['Contacto', '/contacto/', ''],
];
const cabecera = () => `${iconos}
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <div class="contenedor">
    <a class="marca" href="/"><img src="/assets/logo-96.webp" width="40" height="40" alt=""><span>Panama Listings</span></a>
    <nav class="nav" aria-label="Principal">
      ${NAV.map(([t, h, a]) => `<a href="${h}" ${a}>${t}</a>`).join('\n      ')}
    </nav>
    <a class="boton chico cab-cta" href="${waGeneral}" target="_blank" rel="noopener noreferrer" data-lugar="cabecera">${iconoWa}<span>WhatsApp</span></a>
    <button type="button" class="menu-boton" data-abrir-menu aria-haspopup="dialog" aria-controls="menu">Menú</button>
  </div>
</header>
<dialog class="menu" id="menu" aria-label="Menú">
  <div class="menu-panel">
    <div class="menu-cabeza"><span class="marca"><img src="/assets/logo-96.webp" width="40" height="40" alt=""><span>Panama Listings</span></span><button type="button" class="menu-boton" data-cerrar>Cerrar</button></div>
    <nav aria-label="Menú">
      ${NAV.map(([t, h, a]) => `<a href="${h}" ${a}>${t}</a>`).join('\n      ')}
    </nav>
    <a class="boton" href="${waGeneral}" target="_blank" rel="noopener noreferrer" data-lugar="menu">${iconoWa}Escribir por WhatsApp</a>
  </div>
</dialog>`;

const pie = `<footer class="pie">
  <div class="contenedor">
    <div class="pie-rejilla">
      <div>
        <a class="marca" href="/"><img src="/assets/logo-96.webp" width="40" height="40" alt="" loading="lazy"><span>Panama Listings</span></a>
        <p>Plataforma de marketing inmobiliario. Te conectamos con el corredor aliado que representa cada propiedad.</p>
      </div>
      <nav aria-label="Pie de página">
        ${NAV.map(([t, h, a]) => `<a href="${h}" ${a}>${t}</a>`).join('\n        ')}
      </nav>
      <div class="pie-contacto">
        <a href="${waGeneral}" target="_blank" rel="noopener noreferrer" data-lugar="pie">WhatsApp ${sitio.telefonoVisible}</a>
        <a href="mailto:${sitio.email}">${sitio.email}</a>
        <a href="${sitio.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a>
      </div>
    </div>
    <p class="pie-legal">© ${new Date().getFullYear()} ${esc(sitio.nombre)} · Ciudad de Panamá. La información de cada propiedad la suministra su corredor o propietario y puede cambiar sin previo aviso.</p>
  </div>
</footer>`;

const scripts = `<script>window.LP=${json({ ga4, clarity })};</script>
<script src="${rutaJs}" defer></script>`;

function tarjeta(p, { comparar = true } = {}) {
  const venta = op(p, 'venta');
  const alquiler = op(p, 'alquiler');
  const principal = venta ?? alquiler;
  const datos = datosDe(p);
  return `<article class="tarjeta" data-tarjeta data-id="${p.id}" data-tipo="${p.tipo}" data-ops="${p.operaciones.map((o) => o.tipo).join(' ')}" data-venta="${venta?.precio ?? ''}" data-alquiler="${alquiler?.precio ?? ''}" data-texto="${esc(normal(`${p.titulo} ${p.zona} ${p.ciudad} ${TIPOS[p.tipo]}`))}">
  <a class="tarjeta-foto" href="${rutaDe(p)}" tabindex="-1" aria-hidden="true">
    ${img(p._portada, { alt: '', sizes: '(min-width: 1100px) 400px, (min-width: 700px) 50vw, 100vw', encuadre: p.encuadrePortada })}
    <span class="sello">${chipTexto(p)}</span>
  </a>
  <div class="tarjeta-cuerpo">
    <p class="precio">${precioOp(principal)}${venta && alquiler ? ` <span class="precio-alt">o ${precioOp(alquiler)}</span>` : ''}</p>
    <h3><a href="${rutaDe(p)}">${esc(p.titulo)}</a></h3>
    <p class="lugar">${esc(p.zona)}${enZona(p) ? ' · ubicación aproximada' : ''}</p>
    <ul class="datos">${datos.map(([v, u, i, l]) => `<li title="${l}">${ico(i)}<span>${v}${i === 'area' ? ' m²' : ''}</span><span class="oculto-visual"> ${i === 'area' ? '' : u}</span></li>`).join('')}${p.amoblado ? `<li>${p.tipo === 'casa' ? 'Amoblada' : 'Amoblado'}</li>` : ''}${!datos.length ? `<li>${TIPOS[p.tipo]}</li>` : ''}</ul>
    <div class="tarjeta-pie">
      <a class="enlace" href="${rutaDe(p)}" aria-label="Ver ${esc(p.titulo)}">Ver propiedad ${ico('flecha')}</a>
      ${comparar ? `<label class="comparar"><input type="checkbox" data-comparar value="${p.id}"> Comparar</label>` : ''}
    </div>
  </div>
</article>`;
}

function calculadora(precio) {
  return `<form class="calculadora" data-calculadora>
  <div class="calc-campos">
    <label class="campo">Precio (USD)
      <input type="number" name="precio" value="${precio}" min="0" step="1000" inputmode="numeric">
    </label>
    <label class="campo">Plazo
      <select name="plazo">${[10, 15, 20, 25, 30].map((a) => `<option value="${a}"${a === 25 ? ' selected' : ''}>${a} años</option>`).join('')}</select>
    </label>
    <label class="campo"><span class="fila">Prima <output data-prima>20 %</output></span>
      <input type="range" name="prima" min="5" max="50" step="1" value="20">
    </label>
    <label class="campo"><span class="fila">Tasa anual <output data-tasa>6.0 %</output></span>
      <input type="range" name="tasa" min="3" max="12" step="0.1" value="6">
    </label>
  </div>
  <div class="calc-resultado" aria-live="polite">
    <span>Cuota mensual estimada</span>
    <strong data-cuota>—</strong>
    <small>Préstamo <b data-prestamo>—</b> · Total <b data-total>—</b></small>
    <small>Cálculo referencial; no es una oferta de crédito.</small>
  </div>
</form>`;
}

function formulario({ lugar, p }) {
  return `<form class="formulario" action="https://formspree.io/f/${sitio.formspreeId}" method="POST" data-formulario="${lugar}" data-clarity-mask="true" id="consulta">
  <input type="hidden" name="_subject" value="${esc(p ? `Consulta por ${p.titulo} (${p.ref})` : `Consulta general — ${sitio.nombre}`)}">
  <input type="hidden" name="propiedad" value="${esc(p ? p.titulo : '')}">
  <input type="hidden" name="ref" value="${p ? p.ref : ''}">
  <input type="text" name="_gotcha" class="trampa" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="campo">Nombre<input type="text" name="nombre" autocomplete="name" required></label>
  <label class="campo">WhatsApp o teléfono<input type="tel" name="telefono" autocomplete="tel" placeholder="+507"></label>
  <label class="campo">Correo<input type="email" name="email" autocomplete="email"></label>
  ${p ? '' : `<label class="campo">Me interesa
    <select name="interes"><option value="">Seleccionar…</option><option>Comprar</option><option>Alquilar</option><option>Invertir</option><option value="Vender o alquilar mi propiedad" data-interes="publicar">Publicar mi propiedad</option><option>Soy corredor y quiero publicar</option></select>
  </label>`}
  <label class="campo">Mensaje<textarea name="mensaje" rows="3">${p ? esc(`Me interesa ${p.titulo} (ref. ${p.ref}).`) : ''}</textarea></label>
  <button class="boton ${p ? 'claro' : ''}" type="submit">Enviar consulta</button>
  <div class="estado" data-estado role="status" hidden></div>
  <small>Usamos tus datos solo para responder y ponerte en contacto con el corredor aliado.</small>
</form>`;
}

const punto = (p, conFicha) => ({
  id: p.id, titulo: p.titulo, zona: p.zona, precio: precioTexto(p), ...(conFicha ? { url: rutaDe(p) } : {}),
  ...(enZona(p)
    // Zona aproximada: solo el centro del sector y un radio. Nunca la coordenada del inmueble.
    ? { lat: p.ubicacion.zona.lat, lng: p.ubicacion.zona.lng, radio: p.ubicacion.zona.radio_m, nota: 'Ubicación aproximada', wa: waUbicacion(p), ref: p.ref }
    : { lat: p.ubicacion.lat, lng: p.ubicacion.lng, nota: PRECISION[p.ubicacion.precision], maps: p.ubicacion.mapsUrl }),
});
const puntosMapa = propiedades.filter((p) => conPin(p) || enZona(p)).map((p) => punto(p, true));
const datosCliente = propiedades.map((p) => ({
  id: p.id, titulo: p.titulo, url: rutaDe(p), zona: p.zona, precio: precioTexto(p),
  tipoTexto: TIPOS[p.tipo], opsTexto: p.operaciones.map((o) => OPS[o.tipo]).join(' / '),
  datos: [...datosDe(p).map(([v, u]) => `${v} ${u}`), ...(p.amoblado ? ['Amoblado'] : [])], foto: p._portada.chica,
}));

/* ---------- portada ---------- */
const descInicio = 'Propiedades en venta y alquiler en Panamá. Explora apartamentos, casas y terrenos y consulta por WhatsApp con el corredor aliado que representa cada propiedad.';
const inicio = `${cabeza({
  titulo: `${sitio.nombre} — Propiedades en venta y alquiler en Panamá`,
  descripcion: descInicio,
  ruta: '/',
  og: ogInicio,
  precarga: `<link rel="preload" as="image" href="${heroInfo.media}" imagesrcset="${heroInfo.srcset}" imagesizes="100vw" fetchpriority="high">`,
  ld: [
    organizacion,
    { '@type': 'WebSite', name: sitio.nombre, url: abs('/'), inLanguage: 'es-PA', publisher: { '@id': abs('/#organizacion') } },
    { '@type': 'ItemList', name: 'Propiedades disponibles', itemListElement: propiedades.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(rutaDe(p)), name: p.titulo })) },
  ],
})}
<body>
${cabecera()}
<main id="contenido">
<section class="hero">
  ${img(heroInfo, { alt: sitio.portada.alt, sizes: '100vw', lazy: false, encuadre: sitio.portada.encuadre })}
  <div class="hero-texto contenedor">
    <h1>Tu próxima propiedad, <em>en Panamá.</em></h1>
    <p>Explora apartamentos, casas y terrenos en venta y alquiler.</p>
  </div>
</section>

<div class="contenedor">
  <form class="buscador" data-buscador role="search" aria-label="Buscar propiedades">
    <fieldset class="operacion">
      <legend class="oculto-visual">Operación</legend>
      <label><input type="radio" name="op" value="venta" checked><span>Comprar</span></label>
      <label><input type="radio" name="op" value="alquiler"><span>Alquilar</span></label>
    </fieldset>
    <label class="b-campo b-ubicacion"><span>Ubicación</span>
      <input type="search" name="q" placeholder="Zona, barrio o edificio" autocomplete="off">
    </label>
    <button type="button" class="b-mas" data-mas-filtros aria-expanded="false">${ico('filtros')}Filtros</button>
    <div class="b-extra" data-extra>
      <label class="b-campo"><span>Tipo</span>
        <select name="tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </label>
      <label class="b-campo"><span>Presupuesto</span>
        <select name="max" data-presupuestos='${json({ venta: [250000, 500000, 750000, 1000000], alquiler: [1000, 1500, 2500] })}'><option value="">Sin límite</option></select>
      </label>
    </div>
    <button class="boton" type="submit">Buscar</button>
  </form>
</div>

<section class="catalogo" id="propiedades">
  <div class="contenedor">
    <div class="cat-cabeza">
      <div>
        <h2 data-cat-titulo>Propiedades en venta</h2>
        <p class="cat-cuenta"><span data-cuenta aria-live="polite">${propiedades.length} propiedades</span><span data-activos></span></p>
      </div>
      <div class="vistas" role="group" aria-label="Vista del catálogo">
        <button type="button" data-vista="lista" aria-pressed="true">${ico('lista')}Lista</button>
        <button type="button" data-vista="mapa" aria-pressed="false">${ico('mapa')}Mapa</button>
      </div>
    </div>
    <div class="rejilla" data-lista>
${propiedades.map((p) => tarjeta(p)).join('\n')}
    </div>
    <div data-panel-mapa hidden>
      <div class="mapa mapa-catalogo" data-mapa='${json(puntosMapa).replace(/'/g, '&#39;')}'>Cargando mapa…</div>
      <p class="nota"><span class="leyenda pin"></span> Edificio o residencial <span class="leyenda zona"></span> Ubicación aproximada: indica solo la zona</p>
    </div>
    <div class="vacio" data-sin-resultados hidden>
      <h3>No hay propiedades con esos filtros</h3>
      <p>Prueba con otra zona o un presupuesto distinto.</p>
      <p><button type="button" class="boton claro chico" data-limpiar>Limpiar filtros</button> <a class="enlace" href="${waGeneral}" target="_blank" rel="noopener noreferrer" data-lugar="sin-resultados">Cuéntanos qué buscas ${ico('flecha')}</a></p>
    </div>
  </div>
</section>

<section class="cierre">
  <div class="contenedor">
    <h2>¿Quieres promocionar tu propiedad?</h2>
    <a class="boton invertido" href="/contacto/?interes=publicar">Contáctanos</a>
  </div>
</section>
</main>
${pie}

<div class="barra-comparar" data-barra-comparar hidden>
  <span><span data-n-comparar>0</span> seleccionadas · <button type="button" class="enlace-boton" data-limpiar-comparar>Quitar</button></span>
  <button type="button" class="boton chico invertido" data-abrir-comparar>Comparar</button>
</div>
<dialog class="modal-dialogo" data-modal-comparar aria-label="Comparar propiedades">
  <div class="modal">
    <div class="modal-cabeza"><h2>Comparar propiedades</h2><button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${ico('cerrar')}</button></div>
    <div class="tabla-scroll" data-tabla-comparar></div>
  </div>
</dialog>
<script type="application/json" id="datos-propiedades">${json(datosCliente)}</script>
${scripts}
</body>
</html>
`;
await escribir('index.html', inicio);

/* ---------- fichas ---------- */
for (const p of propiedades) {
  const venta = op(p, 'venta');
  const ruta = rutaDe(p);
  const tituloTipo = `${TIPOS[p.tipo]} ${p.operaciones.map((o) => OPS[o.tipo].toLowerCase()).join(' o ')}`;
  const descripcion = `${p.resumen} ${precioTexto(p)}. Consulta por WhatsApp con el corredor aliado.`;
  const galeria = p._fotos.map((f, i) => ({ media: f.media, srcset: f.srcset, grande: f.grande, alt: `${p.titulo} — imagen ${i + 1}` }));
  const specs = [...datosDe(p).map(([v, u, i, l]) => [l, i === 'area' ? `${v} m²` : v, i]), ['Tipo', TIPOS[p.tipo], ''], ...(p.amoblado ? [['Amoblado', 'Sí', '']] : [])];
  const otras = propiedades.filter((o) => o.id !== p.id).sort((a, b) => (b.tipo === p.tipo) - (a.tipo === p.tipo)).slice(0, 3);
  const tipoSchema = { apartamento: 'Apartment', casa: 'SingleFamilyResidence', terreno: 'Place' }[p.tipo];
  const ld = [
    {
      '@type': 'RealEstateListing',
      name: p.titulo,
      url: abs(ruta),
      description: p.descripcion,
      image: p._fotos.slice(0, 6).map((f) => abs(f.grande)),
      provider: { '@id': abs('/#organizacion') },
      about: {
        '@type': tipoSchema,
        name: p.titulo,
        address: { '@type': 'PostalAddress', ...(enZona(p) ? {} : { streetAddress: p.ubicacion.texto }), addressLocality: p.ciudad, addressCountry: 'PA' },
        ...(conPin(p) ? { geo: { '@type': 'GeoCoordinates', latitude: p.ubicacion.lat, longitude: p.ubicacion.lng } } : {}),
        ...(p.area_m2 ? { floorSize: { '@type': 'QuantitativeValue', value: p.area_m2, unitCode: 'MTK' } } : {}),
        ...(p.recamaras ? { numberOfBedrooms: p.recamaras } : {}),
        ...(p.banos ? { numberOfBathroomsTotal: p.banos } : {}),
      },
      offers: p.operaciones.filter((o) => o.precio != null).map((o) => ({
        '@type': 'Offer',
        price: o.precio,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        businessFunction: o.tipo === 'alquiler' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: 'Propiedades', item: abs('/#propiedades') },
        { '@type': 'ListItem', position: 3, name: p.titulo, item: abs(ruta) },
      ],
    },
    organizacion,
  ];

  const html = `${cabeza({ titulo: `${p.titulo} — ${tituloTipo} en ${p.zona} | ${sitio.nombre}`, descripcion, ruta, og: p._og, tipoOg: 'article', ld })}
<body class="con-barra">
${cabecera()}
<main id="contenido" class="contenedor ficha" data-ficha data-ref="${p.ref}" data-titulo="${esc(p.titulo)}" data-tipo="${p.tipo}" data-ops="${p.operaciones.map((o) => o.tipo).join(',')}">
  <a class="volver" href="/#propiedades" data-volver>${ico('atras')}Propiedades</a>
  <header class="ficha-cabeza">
    <div>
      <p class="sobretitulo">${tituloTipo} · Ref. ${p.ref}</p>
      <h1>${esc(p.titulo)}</h1>
      <p class="lugar">${ico('pin')}${esc(lugar(p))}${enZona(p) ? ' — ubicación aproximada' : ''}</p>
    </div>
    <div class="ficha-precios">${p.operaciones.map((o) => `<p><span>${o.tipo === 'alquiler' ? 'Alquiler' : 'Venta'}</span><strong class="precio">${precioOp(o)}</strong></p>`).join('')}</div>
  </header>

  <div class="ficha-rejilla">
    <div class="ficha-principal">
      <div class="galeria" data-galeria='${json(galeria).replace(/'/g, '&#39;')}'>
        <button type="button" class="galeria-principal" data-abrir-visor aria-label="Ampliar imágenes">
          ${img(p._fotos[0], { alt: galeria[0].alt, sizes: '(min-width: 1000px) 820px, 100vw', lazy: false, atributos: 'data-foto-principal' })}
          <span class="galeria-cuenta">${ico('ampliar')}<span data-cuenta-fotos>1 / ${galeria.length}</span></span>
        </button>
        ${galeria.length > 1 ? `<div class="galeria-nav">
          <button type="button" class="icono-boton" data-paso="-1" aria-label="Imagen anterior">${ico('atras')}</button>
          <ul class="miniaturas">${p._fotos.map((f, i) => `<li><button type="button" data-mini aria-label="Imagen ${i + 1}" aria-current="${i === 0}"><img src="${f.chica}" width="96" height="72" alt="" loading="lazy" decoding="async"></button></li>`).join('')}</ul>
          <button type="button" class="icono-boton" data-paso="1" aria-label="Imagen siguiente">${ico('flecha')}</button>
        </div>` : ''}
      </div>

      <dl class="specs">${specs.map(([k, v, i]) => `<div><dt>${k}</dt><dd>${i ? ico(i) : ''}${v}</dd></div>`).join('')}</dl>

      <section class="bloque">
        <h2>Descripción</h2>
        <p>${esc(p.descripcion)}</p>
        ${p.extras.length ? `<ul class="extras">${p.extras.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      </section>

      <section class="bloque">
        <h2>Ubicación</h2>
        ${enZona(p) ? `<p>${esc(p.ubicacion.texto)} — ubicación aproximada. El mapa muestra solo la zona; la ubicación del inmueble se comparte al consultar.</p>
        <p><a class="enlace" href="${waUbicacion(p)}" target="_blank" rel="noopener noreferrer" data-ref="${p.ref}" data-lugar="ubicacion">Consultar ubicación por WhatsApp ${ico('flecha')}</a></p>` : `<p>${esc(p.ubicacion.texto)}. <a class="enlace" href="${esc(p.ubicacion.mapsUrl)}" target="_blank" rel="noopener noreferrer" data-maps="${p.ref}">Ver en Google Maps ${ico('flecha')}</a></p>`}
        ${conPin(p) || enZona(p) ? `<div class="mapa" data-mapa='${json([punto(p, false)]).replace(/'/g, '&#39;')}'>Cargando mapa…</div><p class="nota">${enZona(p) ? 'El área sombreada indica la zona, no el inmueble.' : PRECISION[p.ubicacion.precision] + '.'}</p>` : ''}
      </section>

      ${venta?.precio ? `<section class="bloque"><h2>Cuota estimada</h2>${calculadora(venta.precio)}</section>` : ''}
    </div>

    <aside class="consulta" aria-label="Consultar esta propiedad">
      <h2>Consultar esta propiedad</h2>
      <a class="boton" href="${waPropiedad(p)}" target="_blank" rel="noopener noreferrer" data-ref="${p.ref}" data-lugar="ficha">${iconoWa}Consultar por WhatsApp</a>
      <p class="consulta-nota">Te atiende el corredor aliado que representa esta propiedad.</p>
      <p class="separador"><span>o deja tus datos</span></p>
      ${formulario({ lugar: 'ficha', p })}
    </aside>
  </div>

  <section class="otras">
    <div class="cat-cabeza"><h2>Otras propiedades</h2><a class="enlace" href="/#propiedades" data-volver>Ver todas ${ico('flecha')}</a></div>
    <div class="rejilla">
${otras.map((o) => tarjeta(o, { comparar: false })).join('\n')}
    </div>
  </section>
</main>
${pie}

<div class="barra-movil">
  <div><strong class="precio">${precioOp(venta ?? p.operaciones[0])}</strong><small>${esc(p.titulo)}</small></div>
  <a class="boton" href="${waPropiedad(p)}" target="_blank" rel="noopener noreferrer" data-ref="${p.ref}" data-lugar="barra-movil">${iconoWa}WhatsApp</a>
</div>
<dialog class="visor-dialogo" data-visor aria-label="Imágenes de ${esc(p.titulo)}">
  <div class="visor">
    <div class="visor-barra"><span data-visor-cuenta></span><button type="button" class="icono-boton" data-cerrar aria-label="Cerrar">${ico('cerrar')}</button></div>
    <div class="visor-foto">
      <img data-visor-img alt="">
      <button type="button" class="icono-boton visor-nav ant" data-mover="-1" aria-label="Imagen anterior">${ico('atras')}</button>
      <button type="button" class="icono-boton visor-nav sig" data-mover="1" aria-label="Imagen siguiente">${ico('flecha')}</button>
    </div>
  </div>
</dialog>
${scripts}
</body>
</html>
`;
  await escribir(`propiedades/${p.slug}/index.html`, html);
}

/* ---------- contacto ---------- */
await escribir('contacto/index.html', `${cabeza({ titulo: `Contacto | ${sitio.nombre}`, descripcion: 'Escríbenos para comprar, alquilar o promocionar una propiedad en Panamá. Te ponemos en contacto con un corredor aliado.', ruta: '/contacto/', og: ogInicio, ld: [organizacion] })}
<body>
${cabecera()}
<main id="contenido" class="contenedor contacto">
  <div>
    <h1>Hablemos de tu propiedad</h1>
    <p class="entrada">Para comprar, alquilar o promocionar una propiedad en Panamá. Te ponemos en contacto con un corredor aliado.</p>
    <ul class="contacto-datos">
      <li><span>WhatsApp</span><a href="${waGeneral}" target="_blank" rel="noopener noreferrer" data-lugar="contacto">${sitio.telefonoVisible}</a></li>
      <li><span>Correo</span><a href="mailto:${sitio.email}">${sitio.email}</a></li>
      <li><span>Instagram</span><a href="${sitio.instagram}" target="_blank" rel="noopener noreferrer">@panama.listings</a></li>
    </ul>
  </div>
  <div class="consulta">
    <h2>Envíanos un mensaje</h2>
    ${formulario({ lugar: 'contacto' })}
  </div>
</main>
${pie}
${scripts}
</body>
</html>
`);

/* ---------- 404, sitemap, robots ---------- */
await escribir('404.html', `${cabeza({ titulo: `Página no encontrada | ${sitio.nombre}`, descripcion: 'La página que buscas no existe.', ruta: '/404.html', og: ogInicio, indexar: false })}
<body>
${cabecera()}
<main id="contenido" class="contenedor aviso-pagina">
  <p class="sobretitulo">Error 404</p>
  <h1>Esta página no existe</h1>
  <p class="entrada">Puede que la propiedad ya no esté disponible.</p>
  <a class="boton" href="/#propiedades">Ver propiedades</a>
</main>
${pie}
${scripts}
</body>
</html>
`);

const hoy = new Date().toISOString().slice(0, 10);
await escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', ...propiedades.map(rutaDe), '/contacto/'].map((r) => `  <url><loc>${abs(r)}</loc><lastmod>${hoy}</lastmod></url>`).join('\n')}
</urlset>
`);
await escribir('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);

/* ---------- resumen ---------- */
console.log(`Sitio generado en dist/: portada, ${propiedades.length} fichas, contacto, sitemap y robots. Imágenes nuevas: ${generadas}.`);
console.log(`Analítica: GA4 ${ga4 ? ga4 : 'sin configurar (no se carga)'} · Clarity ${clarity ? clarity : 'sin configurar (no se carga)'}.`);
for (const a of avisos) console.warn(`AVISO — ${a}`);
const conPendientes = propiedades.filter((p) => p.pendientes?.length);
if (conPendientes.length) {
  console.log(`\nDatos por confirmar (${conPendientes.reduce((n, p) => n + p.pendientes.length, 0)}):`);
  for (const p of conPendientes) for (const t of p.pendientes) console.log(`  [${p.ref}] ${p.titulo}: ${t}`);
}
