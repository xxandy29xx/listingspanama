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
const ga4 = process.env.GA4_ID || sitio.analitica.ga4Id || '';
const clarity = process.env.CLARITY_ID || sitio.analitica.clarityId || '';

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
const chipTexto = (p) => (p.operaciones.length > 1 ? 'Venta o alquiler' : OPS[p.operaciones[0].tipo]);
const rutaDe = (p) => `/propiedades/${p.slug}/`;
const conPin = (p) => p.ubicacion.lat != null && p.ubicacion.lng != null;
const PRECISION = { edificio: 'Ubicación del edificio', residencial: 'Ubicación del residencial (no de la casa)' };
const enlaceMaps = (p, clase = '') => `<a${clase ? ` class="${clase}"` : ''} href="${esc(p.ubicacion.mapsUrl)}" target="_blank" rel="noopener noreferrer" data-maps="${p.ref}">${esc(p.ubicacion.etiquetaEnlace ?? 'Ver en Google Maps')}</a>`;
function datosDe(p) {
  const d = [];
  if (p.area_m2) d.push([numero(p.area_m2), 'm²']);
  if (p.recamaras) d.push([p.recamaras, 'recámaras']);
  if (p.banos) d.push([p.banos, 'baños']);
  if (p.parking) d.push([p.parking, 'parking']);
  if (p.amoblado) d.push([p.tipo === 'casa' ? 'Amoblada' : 'Amoblado', '']);
  return d;
}

/* ---------- WhatsApp ---------- */
const wa = (texto) => `https://wa.me/${sitio.whatsapp}?text=${encodeURIComponent(texto)}`;
const waGeneral = wa(`Hola, vi ${sitio.nombre} y quisiera información.`);
const waPropiedad = (p) => wa(`Hola, me interesa ${p.titulo} (${p.zona}), ref. ${p.ref}. ${abs(rutaDe(p))}`);
const iconoWa = '<svg class="icono-wa" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.4-.2-2.6.7.7-2.5-.3-.4A8 8 0 0 1 12 4z"/></svg>';

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
function img(info, { alt, sizes, lazy = true, atributos = '' }) {
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
for (const viejo of ['index.html', '404.html', 'propiedades', 'assets', 'sitemap.xml', 'robots.txt']) {
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

function cabeza({ titulo, descripcion, ruta, og, tipoOg = 'website', ld = [], indexar = true }) {
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
<meta name="theme-color" content="#0f2c59">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${rutaCss}">
${ld.map((o) => `<script type="application/ld+json">${json({ '@context': 'https://schema.org', ...o })}</script>`).join('\n')}
</head>`;
}

const cabecera = (enInicio) => {
  const r = enInicio ? '' : '/';
  return `<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <div class="contenedor">
    <a class="marca" href="/"><img src="/assets/logo-96.webp" width="36" height="36" alt="">Panama <span>Listings</span></a>
    <nav class="nav" aria-label="Principal">
      <a class="solo-escritorio" href="${r}#propiedades">Propiedades</a>
      <a class="solo-escritorio" href="${r}#como-funciona">Cómo funciona</a>
      <a class="solo-escritorio" href="${r}#corredores">Para corredores</a>
      <a class="solo-escritorio" href="${r}#contacto">Contacto</a>
      <a class="boton wa chico" href="${waGeneral}" target="_blank" rel="noopener" data-lugar="cabecera">${iconoWa}WhatsApp</a>
    </nav>
  </div>
</header>`;
};

const pie = `<footer class="pie">
  <div class="contenedor">
    <nav aria-label="Pie de página">
      <a href="/#propiedades">Propiedades</a>
      <a href="/#como-funciona">Cómo funciona</a>
      <a href="/#corredores">Para corredores</a>
      <a href="/#contacto">Contacto</a>
      <a href="${sitio.instagram}" target="_blank" rel="noopener">Instagram</a>
      <a href="mailto:${sitio.email}">${sitio.email}</a>
    </nav>
    <p>${esc(sitio.nombre)} es una plataforma de marketing inmobiliario: difundimos propiedades y conectamos a los interesados con corredores de bienes raíces aliados. La información de cada propiedad la suministra su corredor o propietario y puede cambiar sin previo aviso.</p>
    <p>© ${new Date().getFullYear()} ${esc(sitio.nombre)} · Ciudad de Panamá</p>
  </div>
</footer>`;

const scripts = `<script>window.LP=${json({ ga4, clarity })};</script>
<script src="${rutaJs}" defer></script>`;

function tarjeta(p, { comparar = true } = {}) {
  const venta = op(p, 'venta');
  const alquiler = op(p, 'alquiler');
  const n = p._fotos.length;
  return `<article class="tarjeta" data-tarjeta data-tipo="${p.tipo}" data-ops="${p.operaciones.map((o) => o.tipo).join(' ')}" data-venta="${venta?.precio ?? ''}" data-alquiler="${alquiler?.precio ?? ''}" data-texto="${esc(normal(`${p.titulo} ${p.zona} ${p.ciudad} ${TIPOS[p.tipo]}`))}">
  <a class="foto" href="${rutaDe(p)}" tabindex="-1" aria-hidden="true">
    ${img(p._portada, { alt: '', sizes: '(min-width: 1000px) 350px, (min-width: 720px) 50vw, 100vw' })}
    <span class="chip">${chipTexto(p)}</span>${n > 1 ? `<span class="cuenta-fotos">${n} fotos</span>` : ''}
  </a>
  <div class="cuerpo">
    <div class="precio">${venta ? precioOp(venta) : precioOp(alquiler)}${venta && alquiler ? ` <small>· ${precioOp(alquiler)}</small>` : ''}</div>
    <h3><a href="${rutaDe(p)}">${esc(p.titulo)}</a></h3>
    <p class="zona">${esc(p.zona)} · ${enlaceMaps(p)}</p>
    ${datosDe(p).length ? `<ul class="datos">${datosDe(p).map(([v, u]) => `<li>${v}${u ? ` <span>${u}</span>` : ''}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="acciones">
    <a class="boton claro" href="${rutaDe(p)}">Ver ficha</a>
    <a class="boton wa" href="${waPropiedad(p)}" target="_blank" rel="noopener" data-ref="${p.ref}" data-lugar="tarjeta" aria-label="Consultar ${esc(p.titulo)} por WhatsApp">${iconoWa}WhatsApp</a>
  </div>
  ${comparar ? `<label class="comparar"><input type="checkbox" data-comparar value="${p.id}"> Comparar</label>` : ''}
</article>`;
}

function calculadora(precio) {
  return `<form class="calculadora" data-calculadora>
  <label class="campo">Precio de la propiedad (USD)
    <input type="number" name="precio" value="${precio}" min="0" step="1000" inputmode="numeric">
  </label>
  <label class="campo"><span class="fila">Prima <output data-prima>20 %</output></span>
    <input type="range" name="prima" min="5" max="50" step="1" value="20">
  </label>
  <label class="campo"><span class="fila">Tasa de interés anual <output data-tasa>6.0 %</output></span>
    <input type="range" name="tasa" min="3" max="12" step="0.1" value="6">
  </label>
  <label class="campo">Plazo
    <select name="plazo">${[10, 15, 20, 25, 30].map((a) => `<option value="${a}"${a === 25 ? ' selected' : ''}>${a} años</option>`).join('')}</select>
  </label>
  <div class="calc-resultado" aria-live="polite">
    <span>Cuota mensual estimada</span>
    <strong data-cuota>—</strong>
    <small>Préstamo: <b data-prestamo>—</b> · Total a pagar: <b data-total>—</b></small>
  </div>
  <p class="nota">Cálculo referencial. No es una oferta de crédito; las condiciones dependen de cada banco.</p>
</form>`;
}

function formulario({ lugar, titulo, p }) {
  return `<form class="formulario" action="https://formspree.io/f/${sitio.formspreeId}" method="POST" data-formulario="${lugar}" data-clarity-mask="true" id="consulta">
  <h2>${titulo}</h2>
  <input type="hidden" name="_subject" value="${esc(p ? `Consulta por ${p.titulo} (${p.ref})` : `Consulta general — ${sitio.nombre}`)}">
  <input type="hidden" name="propiedad" value="${esc(p ? p.titulo : '')}">
  <input type="hidden" name="ref" value="${p ? p.ref : ''}">
  <input type="text" name="_gotcha" class="trampa" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="campo">Nombre<input type="text" name="nombre" autocomplete="name" required></label>
  <label class="campo">WhatsApp o teléfono<input type="tel" name="telefono" autocomplete="tel" placeholder="+507"></label>
  <label class="campo">Correo<input type="email" name="email" autocomplete="email"></label>
  ${p ? '' : `<label class="campo">Me interesa
    <select name="interes"><option value="">Seleccionar…</option><option>Comprar</option><option>Alquilar</option><option>Invertir</option><option>Vender o alquilar mi propiedad</option><option>Soy corredor y quiero publicar</option></select>
  </label>`}
  <label class="campo">Mensaje<textarea name="mensaje" rows="3">${p ? esc(`Me interesa ${p.titulo} (ref. ${p.ref}).`) : ''}</textarea></label>
  <button class="boton" type="submit">Enviar consulta</button>
  <div class="estado" data-estado role="status" hidden></div>
  <small>Usamos tus datos solo para responder esta consulta y ponerte en contacto con el corredor aliado correspondiente.</small>
</form>`;
}

/* ---------- portada ---------- */
const punto = (p, conFicha) => ({
  lat: p.ubicacion.lat, lng: p.ubicacion.lng, titulo: p.titulo, zona: p.zona, precio: precioTexto(p),
  nota: PRECISION[p.ubicacion.precision], maps: p.ubicacion.mapsUrl, ...(conFicha ? { url: rutaDe(p) } : {}),
});
const puntosMapa = propiedades.filter(conPin).map((p) => punto(p, true));
const datosCliente = propiedades.map((p) => ({
  id: p.id, titulo: p.titulo, url: rutaDe(p), zona: p.zona, precio: precioTexto(p),
  tipoTexto: TIPOS[p.tipo], opsTexto: p.operaciones.map((o) => OPS[o.tipo]).join(' / '),
  datos: datosDe(p).map(([v, u]) => `${v} ${u}`.trim()), foto: p._portada.chica,
}));

const descInicio = 'Propiedades en venta y alquiler en Panamá. Explora apartamentos, casas y terrenos y consulta por WhatsApp con el corredor aliado que representa cada propiedad.';
const inicio = `${cabeza({
  titulo: `${sitio.nombre} — Propiedades en venta y alquiler en Panamá`,
  descripcion: descInicio,
  ruta: '/',
  og: ogInicio,
  ld: [
    organizacion,
    { '@type': 'WebSite', name: sitio.nombre, url: abs('/'), inLanguage: 'es-PA', publisher: { '@id': abs('/#organizacion') } },
    { '@type': 'ItemList', name: 'Propiedades disponibles', itemListElement: propiedades.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(rutaDe(p)), name: p.titulo })) },
  ],
})}
<body>
${cabecera(true)}
<main id="contenido">
<section class="portada">
  <div class="contenedor">
    <div class="portada-rejilla">
      <div>
        <span class="etiqueta">Propiedades en Panamá</span>
        <h1>Encuentra la propiedad y habla con <em>quien la representa</em>.</h1>
        <p class="bajada">Reunimos propiedades en venta y alquiler, y te conectamos por WhatsApp con el corredor aliado que la tiene a cargo.</p>
      </div>
      <figure class="foto-portada">
        ${img(destacada._portada, { alt: `${destacada.titulo}, ${destacada.zona}`, sizes: '(min-width: 1000px) 540px, 100vw', lazy: false })}
        <figcaption>
          <span><strong>${esc(destacada.titulo)}</strong>${esc(destacada.zona)} · ${precioTexto(destacada)}</span>
          <a href="${rutaDe(destacada)}">Ver ficha →</a>
        </figcaption>
      </figure>
    </div>
    <form class="buscador" data-buscador role="search" aria-label="Buscar propiedades">
      <label class="ancho">Zona o proyecto
        <input type="search" name="q" placeholder="Costa del Este, San Francisco…" autocomplete="off">
      </label>
      <label>Tipo
        <select name="tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </label>
      <label>Operación
        <select name="op"><option value="">Todas</option><option value="venta">Venta</option><option value="alquiler">Alquiler</option></select>
      </label>
      <label class="ancho">Precio máximo
        <select name="max"><option value="">Sin máximo</option><option value="1500">$1,500 (alquiler)</option><option value="250000">$250,000</option><option value="500000">$500,000</option><option value="1000000">$1,000,000</option></select>
      </label>
      <button class="boton" type="submit">Buscar</button>
    </form>
  </div>
</section>

<section class="seccion" id="propiedades">
  <div class="contenedor">
    <div class="seccion-titulo">
      <div><span class="etiqueta">Catálogo</span><h2>Propiedades disponibles</h2></div>
      <p><span data-cuenta aria-live="polite">${propiedades.length} propiedades</span> · <button type="button" class="enlace-boton" data-limpiar>Limpiar filtros</button></p>
    </div>
    <div class="rejilla">
${propiedades.map((p) => tarjeta(p)).join('\n')}
    </div>
    <p class="sin-resultados" data-sin-resultados hidden>No hay propiedades con esos filtros. <button type="button" class="enlace-boton" data-limpiar>Ver todas</button> o <a href="${waGeneral}" target="_blank" rel="noopener" data-lugar="sin-resultados">cuéntanos qué buscas</a>.</p>
  </div>
</section>

<section class="seccion pegada" id="como-funciona">
  <div class="contenedor">
    <div class="seccion-titulo"><div><span class="etiqueta">Cómo funciona</span><h2>De la búsqueda a la visita</h2></div></div>
    <ol class="pasos">
      <li class="paso"><h3>Explora</h3><p>Cada propiedad tiene su página con fotos, datos y ubicación.</p></li>
      <li class="paso"><h3>Consulta</h3><p>Escribe por WhatsApp o deja tus datos. El mensaje ya indica qué propiedad te interesa.</p></li>
      <li class="paso"><h3>Te atiende un corredor aliado</h3><p>Te conectamos con el corredor que representa la propiedad para coordinar la visita.</p></li>
    </ol>
  </div>
</section>

${puntosMapa.length ? `<section class="seccion pegada" id="mapa">
  <div class="contenedor">
    <div class="seccion-titulo"><div><span class="etiqueta">Ubicaciones</span><h2>Mapa de propiedades</h2></div></div>
    <div class="mapa" data-mapa="${esc(JSON.stringify(puntosMapa))}">Cargando mapa…</div>
    <p class="nota">Cada marcador señala el edificio o el residencial, no la unidad. El mapa muestra las propiedades con ubicación verificada (${puntosMapa.length} de ${propiedades.length}); las demás tienen su enlace a Google Maps en la ficha.</p>
  </div>
</section>` : ''}

<section class="seccion pegada" id="calculadora">
  <div class="contenedor dos-columnas">
    <div class="seccion-titulo"><div><span class="etiqueta">Herramienta</span><h2>Calculadora hipotecaria</h2><p class="bajada" style="margin-top:12px">Estima la cuota mensual según el precio, la prima, la tasa y el plazo.</p></div></div>
    ${calculadora(200000)}
  </div>
</section>

<section class="seccion pegada" id="corredores">
  <div class="contenedor">
    <div class="franja">
      <div><h2>¿Eres corredor de bienes raíces?</h2><p>Difundimos tus propiedades y te enviamos las consultas con la propiedad y el origen identificados.</p></div>
      <a class="boton" href="${wa(`Hola, soy corredor y quiero publicar propiedades en ${sitio.nombre}.`)}" target="_blank" rel="noopener" data-lugar="corredores">Quiero publicar</a>
    </div>
  </div>
</section>

<section class="seccion pegada" id="contacto">
  <div class="contenedor contacto-rejilla">
    <div>
      <span class="etiqueta">Contacto</span>
      <h2 style="font-size:clamp(26px,6vw,38px);margin-top:8px">Cuéntanos qué buscas</h2>
      <p class="bajada" style="margin-top:12px">Te ponemos en contacto con un corredor aliado para comprar, alquilar o publicar una propiedad en Panamá.</p>
      <ul class="contacto-datos">
        <li><span>WhatsApp</span><a href="${waGeneral}" target="_blank" rel="noopener" data-lugar="contacto">${sitio.telefonoVisible}</a></li>
        <li><span>Correo</span><a href="mailto:${sitio.email}">${sitio.email}</a></li>
      </ul>
    </div>
    ${formulario({ lugar: 'contacto', titulo: 'Enviar consulta' })}
  </div>
</section>
</main>
${pie}

<div class="barra-comparar" data-barra-comparar hidden>
  <span><span data-n-comparar>0</span> seleccionadas · <button type="button" class="enlace-boton" data-limpiar-comparar>Quitar</button></span>
  <button type="button" class="boton chico" data-abrir-comparar>Comparar</button>
</div>
<dialog data-modal-comparar aria-label="Comparar propiedades">
  <div class="modal">
    <div class="modal-cabeza"><h2>Comparar propiedades</h2><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
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
  const galeria = p._fotos.map((f, i) => ({ media: f.media, srcset: f.srcset, grande: f.grande, alt: `${p.titulo} — foto ${i + 1}` }));
  const specs = [
    p.area_m2 && ['Área', `${numero(p.area_m2)} m²`],
    p.recamaras && ['Recámaras', p.recamaras],
    p.banos && ['Baños', p.banos],
    p.parking && ['Parking', p.parking],
    ['Tipo', TIPOS[p.tipo]],
    p.amoblado && ['Amoblado', 'Sí'],
  ].filter(Boolean);
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
        address: { '@type': 'PostalAddress', streetAddress: p.zona, addressLocality: p.ciudad, addressCountry: 'PA' },
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
${cabecera(false)}
<main id="contenido" class="contenedor" data-ficha data-ref="${p.ref}" data-titulo="${esc(p.titulo)}" data-tipo="${p.tipo}" data-ops="${p.operaciones.map((o) => o.tipo).join(',')}">
  <p class="migas"><a href="/">Inicio</a> / <a href="/#propiedades">Propiedades</a> / ${esc(p.titulo)}</p>
  <div class="ficha-rejilla">
    <div>
      <div class="galeria" data-galeria="${esc(JSON.stringify(galeria))}">
        <button type="button" class="principal" data-abrir-visor aria-label="Ampliar fotos">
          ${img(p._fotos[0], { alt: galeria[0].alt, sizes: '(min-width: 1000px) 660px, 100vw', lazy: false, atributos: 'data-foto-principal' })}
          <span class="cuenta-fotos" data-cuenta-fotos>1 / ${galeria.length}</span>
        </button>
        ${galeria.length > 1 ? `<ul class="miniaturas">${p._fotos.map((f, i) => `<li><button type="button" data-mini aria-label="Foto ${i + 1}" aria-current="${i === 0}"><img src="${f.chica}" width="84" height="64" alt="" loading="lazy" decoding="async"></button></li>`).join('')}</ul>` : ''}
      </div>

      <div class="ficha-cabeza">
        <span class="etiqueta">${tituloTipo}</span>
        <h1>${esc(p.titulo)}</h1>
        <p class="zona">${esc(p.zona)} · ${esc(p.ciudad)}</p>
        <div class="precios">${p.operaciones.map((o) => `<div><span>${o.tipo === 'alquiler' ? 'Alquiler mensual' : 'Precio de venta'}</span><div class="precio">${precioOp(o)}</div></div>`).join('')}</div>
        <div class="ref"><span>REF. ${p.ref}</span><button type="button" class="enlace-boton" data-compartir data-url="${abs(ruta)}">Compartir</button></div>
      </div>

      <dl class="especificaciones">${specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>

      <section class="bloque">
        <h2>Descripción</h2>
        <p>${esc(p.descripcion)}</p>
        ${p.extras.length ? `<ul class="lista-extras">${p.extras.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      </section>

      <section class="bloque">
        <h2>Ubicación</h2>
        <p>${esc(p.ubicacion.texto)}</p>
        <p>${enlaceMaps(p, 'boton claro chico')}</p>
        ${conPin(p) ? `<div class="mapa" data-mapa="${esc(JSON.stringify([punto(p, false)]))}">Cargando mapa…</div><p class="nota">${PRECISION[p.ubicacion.precision]}.</p>` : ''}
      </section>

      ${venta?.precio ? `<section class="bloque"><h2>Cuota estimada</h2>${calculadora(venta.precio)}</section>` : ''}
    </div>

    <aside class="lateral">
      <div class="aliado"><strong>Propiedad representada por un corredor aliado</strong>${esc(sitio.nombre)} difunde esta propiedad y te pone en contacto con el corredor a cargo.</div>
      <a class="boton wa" href="${waPropiedad(p)}" target="_blank" rel="noopener" data-ref="${p.ref}" data-lugar="ficha">${iconoWa}Consultar por WhatsApp</a>
      ${formulario({ lugar: 'ficha', titulo: 'Consultar esta propiedad', p })}
    </aside>
  </div>

  <section class="seccion">
    <div class="seccion-titulo"><div><span class="etiqueta">Catálogo</span><h2>Otras propiedades</h2></div><p><a href="/#propiedades">Ver todas</a></p></div>
    <div class="rejilla">
${otras.map((o) => tarjeta(o, { comparar: false })).join('\n')}
    </div>
  </section>
</main>
${pie}

<div class="barra-movil">
  <div><div class="precio">${precioOp(venta ?? p.operaciones[0])}</div><small>${esc(p.titulo)}</small></div>
  <a class="boton claro chico" href="#consulta">Consultar</a>
  <a class="boton wa chico" href="${waPropiedad(p)}" target="_blank" rel="noopener" data-ref="${p.ref}" data-lugar="barra-movil">${iconoWa}WhatsApp</a>
</div>
<dialog data-visor aria-label="Fotos de ${esc(p.titulo)}">
  <div class="visor">
    <div class="visor-barra"><span data-visor-cuenta></span><button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button></div>
    <div class="visor-foto">
      <img data-visor-img alt="">
      <button type="button" class="visor-nav ant" data-mover="-1" aria-label="Foto anterior">‹</button>
      <button type="button" class="visor-nav sig" data-mover="1" aria-label="Foto siguiente">›</button>
    </div>
  </div>
</dialog>
${scripts}
</body>
</html>
`;
  await escribir(`propiedades/${p.slug}/index.html`, html);
}

/* ---------- 404, sitemap, robots ---------- */
await escribir('404.html', `${cabeza({ titulo: `Página no encontrada | ${sitio.nombre}`, descripcion: 'La página que buscas no existe.', ruta: '/404.html', og: ogInicio, indexar: false })}
<body>
${cabecera(false)}
<main id="contenido" class="contenedor seccion">
  <span class="etiqueta">Error 404</span>
  <h1 style="font-size:clamp(30px,7vw,46px);margin:10px 0 14px">Esta página no existe</h1>
  <p class="bajada">Puede que la propiedad ya no esté disponible.</p>
  <a class="boton" href="/#propiedades">Ver propiedades disponibles</a>
</main>
${pie}
${scripts}
</body>
</html>
`);

const hoy = new Date().toISOString().slice(0, 10);
await escribir('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', ...propiedades.map(rutaDe)].map((r) => `  <url><loc>${abs(r)}</loc><lastmod>${hoy}</lastmod></url>`).join('\n')}
</urlset>
`);
await escribir('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n`);

/* ---------- resumen ---------- */
console.log(`Sitio generado en dist/: 1 portada, ${propiedades.length} fichas, sitemap y robots. Imágenes nuevas: ${generadas}.`);
console.log(`Analítica: GA4 ${ga4 ? ga4 : 'sin configurar'} · Clarity ${clarity ? clarity : 'sin configurar'}.`);
const conPendientes = propiedades.filter((p) => p.pendientes?.length);
if (conPendientes.length) {
  console.log(`\nDatos por confirmar (${conPendientes.reduce((n, p) => n + p.pendientes.length, 0)}):`);
  for (const p of conPendientes) for (const t of p.pendientes) console.log(`  [${p.ref}] ${p.titulo}: ${t}`);
}
