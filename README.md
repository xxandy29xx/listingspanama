# Panama Listings — sitio web

Sitio estático de https://www.listingspanama.com/. Se genera con `build.mjs` (Node, sin framework) a partir de dos archivos de datos.

## Uso

```bash
npm install
npm run build   # genera dist/
npm run dev     # genera y sirve en http://localhost:4174
```

## Dónde se cambia cada cosa

| Qué | Archivo |
| --- | --- |
| Propiedades (precio, datos, fotos, textos) | `data/propiedades.json` — única fuente |
| Marca, WhatsApp, correo, Formspree, IDs de analítica | `data/sitio.json` |
| Plantillas de portada y ficha, sitemap, datos estructurados | `build.mjs` |
| Diseño | `src/estilo.css` |
| Buscador, comparador, galería, formularios, medición | `src/app.js` |
| Fotos originales | `images/<carpeta>/` (el build crea las versiones WebP) |

### Agregar o editar una propiedad

Edita `data/propiedades.json`. Campos principales: `ref`, `slug` (define la URL `/propiedades/<slug>/`; no cambiarlo una vez publicado), `titulo`, `tipo` (`apartamento`, `casa`, `terreno`), `operaciones` (`venta` o `alquiler` con `precio`; `null` se muestra como «Negociable»), `zona`, `ciudad`, `area_m2`, `recamaras`, `banos`, `parking`, `amoblado`, `extras`, `resumen`, `descripcion`, `portada`, `fotos`, `ubicacion` (`texto`, `mapsUrl` para el botón de Google Maps, y `lat`/`lng`/`precision`/`fuente` solo si el marcador está verificado; con `lat` en `null` la propiedad no aparece en el mapa), `destacada` (la de la portada).

`pendientes` es una lista de dudas por confirmar. No se publica: el build la imprime en consola como recordatorio. Bórrala al resolver cada punto.

## Analítica (GA4 y Clarity)

No hay ningún ID configurado, así que hoy **no se carga ningún script de medición**. Para activarlos, pon los IDs en `data/sitio.json` (`analitica.ga4Id`, `analitica.clarityId`) o define las variables de entorno `GA4_ID` y `CLARITY_ID` en Vercel.

Eventos que envía el sitio:

| Evento | Cuándo | Datos |
| --- | --- | --- |
| `view_item` | Se abre una ficha | referencia, título, tipo, operación |
| `search` | Se usa el buscador | tipo, operación, precio máximo, si hubo texto (no el texto), resultados |
| `whatsapp_click` | Clic en cualquier botón de WhatsApp | referencia y lugar del botón |
| `generate_lead` | Formspree confirma el envío | referencia y formulario |
| `ver_galeria`, `comparar`, `share` | Uso de esas funciones | referencia o cantidad |

Nunca se envían nombre, correo, teléfono ni mensajes. Los formularios llevan `data-clarity-mask`. Para ver los eventos sin tener IDs, abre cualquier página con `?debug_analitica=1` y mira la consola.

## Formularios

Envían a Formspree (`formspreeId` en `data/sitio.json`) con: nombre, teléfono, correo, mensaje, `propiedad`, `ref`, `pagina`, y el origen de la visita (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `referente`, `pagina_entrada`). Incluyen un campo trampa antispam (`_gotcha`).

## Publicación

`vercel.json` indica a Vercel que ejecute `npm run build` y sirva `dist/`. La web publicada antes del rediseño está en el tag `respaldo-web-2026-11-11`; el `index.html` de la raíz es esa versión anterior y deja de servirse cuando Vercel use `dist/`.

## Ubicaciones

Cada propiedad lleva `ubicacion` en `data/propiedades.json`:

- **Edificio o residencial** (`precision`: `edificio` / `residencial`): `texto`, `mapsUrl` (botón «Ver en Google Maps») y `lat`/`lng` con su `fuente`. Se dibuja como punto azul.
- **Zona aproximada** (`precision`: `zona`): solo `texto` y `zona` (centro del sector y `radio_m`). Se dibuja como área sombreada punteada, sin pin, sin enlace a mapas y con el botón «Consultar ubicación por WhatsApp». No se publican coordenadas del inmueble ni en el HTML ni en los datos estructurados. Así están los terrenos de Arraiján y Chitré, por decisión del propietario: **no agregar sus coordenadas exactas a este repositorio, que es público.**

## Verificado y pendiente

Verificado en local (móvil 375 px y escritorio): build desde una copia limpia con `npm ci`, 8 fichas, buscador, comparador, galería, calculadora, mapa con pines y zonas, enlaces de Google Maps, mensajes de WhatsApp con nombre, referencia y URL, captura de UTM, metadatos, canónicas, sitemap y robots.

Formulario, probado con respuestas simuladas de Formspree (sin envíos reales): validación de nombre y de teléfono o correo, error 422, respuesta 200 con error, fallo de red, triple clic (un solo envío), bloqueo de reenvío idéntico, y evento `generate_lead` solo tras respuesta satisfactoria.

Pendiente, requiere cuentas externas:

- **Formspree**: prueba real de recepción en el correo (la hace el propietario). El código está validado; la recepción no.
- **GA4 / Clarity**: sin IDs. Mientras estén vacíos o con formato inválido no se carga ningún script (el build avisa si el formato es incorrecto).
- **Vercel**: `vercel.json` está en la raíz, `buildCommand` coincide con el script `build` y `outputDirectory` con `dist/`. No hay acceso a los registros de Vercel: falta confirmar el comando ejecutado y el commit desplegado tras el primer deploy de esta rama. El repositorio también tiene GitHub Pages activo, que sirve la raíz sin build (la web anterior).
- **Arraiján**: la única foto (flyer) y la característica «a 100 m del Metro Cáceres» delatan la ubicación del terreno.
