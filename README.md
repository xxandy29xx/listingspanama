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

Edita `data/propiedades.json`. Campos principales: `ref`, `slug` (define la URL `/propiedades/<slug>/`; no cambiarlo una vez publicado), `titulo`, `tipo` (`apartamento`, `casa`, `terreno`), `operaciones` (`venta` o `alquiler` con `precio`; `null` se muestra como «Negociable»), `zona`, `ciudad`, `area_m2`, `recamaras`, `banos`, `parking`, `amoblado`, `extras`, `resumen`, `descripcion`, `portada`, `fotos`, `coordenadas`, `destacada` (la de la portada).

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

## Verificado y pendiente

Verificado en local (móvil 375 px y escritorio): build, 8 fichas, buscador con precio máximo, comparador, galería, calculadora, mapa, mensajes de WhatsApp con referencia y URL, captura de UTM, validación del formulario, eventos de medición en modo depuración, metadatos, URL canónicas, sitemap y robots.

No verificado, requiere cuentas externas:

- **Formspree**: no se envió ninguna consulta real; falta confirmar que llega al correo y que el plan acepta los campos nuevos.
- **GA4 / Clarity**: faltan los IDs; no se ha comprobado la recepción de eventos.
- **Vercel**: falta confirmar que el proyecto toma `vercel.json` (hoy sirve la raíz sin build).
- **WhatsApp**: confirmar que `wa.me/5078347509` abre el chat correcto.
- **Datos**: ver la lista «Datos por confirmar» que imprime el build.
