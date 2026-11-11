/* Panama Listings — comportamiento del sitio.
   La configuración llega en window.LP (la escribe build.mjs desde data/sitio.json). */
(function () {
  'use strict';
  var LP = window.LP || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var dinero = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };
  var normal = function (t) { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };

  /* ---------- Analítica ----------
     Solo se carga si hay IDs en data/sitio.json. Nunca se envían nombre, correo,
     teléfono, mensajes ni el texto libre del buscador: solo referencias de propiedad,
     filtros elegidos y el lugar del botón. */
  var depurar = /[?&]debug_analitica=1/.test(location.search);
  if (LP.ga4) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', LP.ga4, { allow_google_signals: false, allow_ad_personalization_signals: false });
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(LP.ga4);
    document.head.appendChild(g);
  }
  if (LP.clarity) {
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    var c = document.createElement('script');
    c.async = true;
    c.src = 'https://www.clarity.ms/tag/' + encodeURIComponent(LP.clarity);
    document.head.appendChild(c);
  }
  function medir(evento, datos) {
    datos = datos || {};
    if (depurar) console.log('[analítica]', evento, datos);
    (window.__eventosLP = window.__eventosLP || []).push({ evento: evento, datos: datos });
    if (LP.ga4 && window.gtag) window.gtag('event', evento, datos);
    if (LP.clarity && window.clarity) window.clarity('event', evento);
  }

  /* ---------- Atribución (UTM) ----------
     Se guarda el primer origen de la sesión y se adjunta a los formularios. */
  var origen = {};
  try {
    origen = JSON.parse(sessionStorage.getItem('lp_origen') || 'null');
    if (!origen) {
      origen = { pagina_entrada: location.pathname };
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
        if (q.get(k)) origen[k] = q.get(k).slice(0, 120);
      });
      if (document.referrer) {
        try {
          var h = new URL(document.referrer).hostname;
          if (h !== location.hostname) origen.referente = h;
        } catch (e) {}
      }
      sessionStorage.setItem('lp_origen', JSON.stringify(origen));
    }
  } catch (e) { origen = origen || {}; }

  /* ---------- Vista de propiedad ---------- */
  var ficha = $('[data-ficha]');
  if (ficha) {
    medir('view_item', {
      item_id: ficha.dataset.ref,
      item_name: ficha.dataset.titulo,
      item_category: ficha.dataset.tipo,
      operacion: ficha.dataset.ops
    });
  }

  /* ---------- Clics en WhatsApp ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="wa.me/"]');
    if (!a) return;
    medir('whatsapp_click', { item_id: a.dataset.ref || '(general)', lugar: a.dataset.lugar || 'otro' });
  });

  /* ---------- Clics en «Ver en Google Maps» ---------- */
  document.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('a[data-maps]');
    if (m) medir('ver_mapa_externo', { item_id: m.dataset.maps });
  });

  /* ---------- Menú móvil ---------- */
  var menu = $('#menu');
  $$('[data-abrir-menu]').forEach(function (b) { b.addEventListener('click', function () { menu.showModal(); }); });
  if (menu) menu.addEventListener('click', function (e) { if (e.target.closest('a')) menu.close(); });

  /* ---------- Encabezado: transparente sobre la portada, sólido al bajar ---------- */
  var cabecera = $('.cabecera');
  if (cabecera && document.body.classList.contains('portada')) {
    var fijar = function () { cabecera.classList.toggle('solida', window.scrollY > 24); };
    window.addEventListener('scroll', fijar, { passive: true });
    fijar();
  }

  /* ---------- Fotografías de la portada ----------
     La primera viene en el HTML. Las demás se descargan de una en una, justo antes de
     mostrarse, así que nunca bloquean la carga ni el uso de la página. */
  var heroEl = $('[data-fondos]');
  if (heroEl) {
    var fondos = $$('.hero-fondos img', heroEl);
    var iFondo = 0, reloj = null;
    var sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var pausado = sinMovimiento;
    var botonPausa = $('[data-fondo-pausa]', heroEl);
    var preparar = function (img, listo) {
      if (!img.dataset.src) return listo(true);
      var fin = function (ok) { img.onload = img.onerror = null; listo(ok); };
      img.onload = function () { fin(true); };
      img.onerror = function () { fin(false); };
      img.srcset = img.dataset.srcset; img.src = img.dataset.src;
      delete img.dataset.src;
    };
    var mostrarFondo = function (n) {
      var destino = (n + fondos.length) % fondos.length;
      preparar(fondos[destino], function (ok) {
        if (!ok) return; // si una foto falla se conserva la actual
        fondos[iFondo].classList.remove('activo');
        iFondo = destino;
        fondos[iFondo].classList.add('activo');
        $('[data-fondo-n]', heroEl).textContent = iFondo + 1;
      });
    };
    var programar = function () {
      clearInterval(reloj);
      if (!pausado && !document.hidden) reloj = setInterval(function () { mostrarFondo(iFondo + 1); }, 6000);
    };
    var pintarPausa = function () {
      botonPausa.setAttribute('aria-pressed', pausado ? 'true' : 'false');
      botonPausa.setAttribute('aria-label', pausado ? 'Reanudar fotografías' : 'Pausar fotografías');
    };
    $$('[data-fondo]', heroEl).forEach(function (b) {
      b.addEventListener('click', function () { mostrarFondo(iFondo + parseInt(b.dataset.fondo, 10)); programar(); });
    });
    botonPausa.addEventListener('click', function () { pausado = !pausado; pintarPausa(); programar(); });
    document.addEventListener('visibilitychange', programar);
    $('[data-controles]', heroEl).hidden = false;
    pintarPausa();
    // La secuencia empieza cuando la página ya terminó de cargar.
    if (document.readyState === 'complete') programar(); else window.addEventListener('load', programar);
  }

  /* ---------- Buscador, filtros y vistas del catálogo ---------- */
  // Estado del mapa: se declara aquí porque el catálogo puede pedir el mapa al cargar (?vista=mapa).
  var ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/positron';
  var colaMapa = null;
  var mapaCatalogo = null;
  var buscador = $('[data-buscador]');
  if (buscador) {
    var tarjetas = $$('[data-tarjeta]');
    var cuenta = $('[data-cuenta]');
    var vacio = $('[data-sin-resultados]');
    var lista = $('[data-lista]');
    var panelMapa = $('[data-panel-mapa]');
    var activos = $('[data-activos]');
    var selMax = buscador.elements.max;
    var presupuestos = JSON.parse(selMax.dataset.presupuestos);
    var vista = 'lista';
    var temporizador;
    var opActual = function () { return buscador.elements.op.value || 'venta'; };
    var pintarPresupuestos = function (valor) {
      var op = opActual();
      selMax.textContent = '';
      var o = document.createElement('option'); o.value = ''; o.textContent = 'Sin límite'; selMax.appendChild(o);
      presupuestos[op].forEach(function (v) {
        var x = document.createElement('option');
        x.value = v; x.textContent = 'Hasta ' + dinero(v) + (op === 'alquiler' ? '/mes' : '');
        selMax.appendChild(x);
      });
      selMax.value = presupuestos[op].indexOf(Number(valor)) !== -1 ? String(valor) : '';
    };
    var leer = function () {
      return {
        q: normal(buscador.elements.q.value.trim()),
        tipo: buscador.elements.tipo.value,
        op: opActual(),
        max: parseFloat(selMax.value) || 0
      };
    };
    var chip = function (texto, quitar) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.setAttribute('aria-label', 'Quitar filtro: ' + texto);
      b.appendChild(document.createTextNode(texto));
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true');
      var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-cerrar'); s.appendChild(u); b.appendChild(s);
      b.addEventListener('click', function () { quitar(); aplicar(true); });
      return b;
    };
    var aplicar = function (registrar) {
      var f = leer();
      var n = 0;
      var visibles = [];
      tarjetas.forEach(function (t) {
        var ver = t.dataset.ops.split(' ').indexOf(f.op) !== -1;
        if (f.q && t.dataset.texto.indexOf(f.q) === -1) ver = false;
        if (f.tipo && t.dataset.tipo !== f.tipo) ver = false;
        if (f.max) {
          // El tope se compara con el precio de la operación elegida.
          // Las propiedades sin precio publicado no se descartan.
          var precio = parseFloat(t.dataset[f.op]);
          if (precio && precio > f.max) ver = false;
        }
        t.hidden = !ver;
        if (ver) { n++; visibles.push(t.dataset.id); }
      });
      $('[data-cat-titulo]').textContent = f.op === 'alquiler' ? 'Propiedades en alquiler' : 'Propiedades en venta';
      cuenta.textContent = n === 1 ? '1 propiedad' : n + ' propiedades';
      vacio.hidden = n !== 0;
      lista.hidden = vista !== 'lista' || n === 0;
      panelMapa.hidden = vista !== 'mapa' || n === 0;
      if (vista === 'mapa' && n > 0) {
        if (!mapaCatalogo) mapaCatalogo = crearMapa($('[data-mapa]', panelMapa));
        mapaCatalogo.filtrar(visibles);
      }
      // Filtros activos, cada uno con su botón para quitarlo.
      activos.textContent = '';
      if (buscador.elements.q.value.trim()) activos.appendChild(chip('«' + buscador.elements.q.value.trim() + '»', function () { buscador.elements.q.value = ''; }));
      if (f.tipo) activos.appendChild(chip(buscador.elements.tipo.selectedOptions[0].textContent, function () { buscador.elements.tipo.value = ''; }));
      if (f.max) activos.appendChild(chip(selMax.selectedOptions[0].textContent, function () { selMax.value = ''; }));
      if (activos.children.length) {
        var l = document.createElement('button'); l.type = 'button'; l.className = 'enlace-boton'; l.textContent = 'Limpiar';
        l.addEventListener('click', limpiar); activos.appendChild(l);
      }
      $$('[data-nav-op]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.navOp === f.op ? 'true' : 'false'); });
      var p = new URLSearchParams();
      if (f.op === 'alquiler') p.set('op', 'alquiler');
      if (buscador.elements.q.value.trim()) p.set('q', buscador.elements.q.value.trim());
      if (f.tipo) p.set('tipo', f.tipo);
      if (f.max) p.set('max', f.max);
      if (vista === 'mapa') p.set('vista', 'mapa');
      var s = p.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
      if (registrar) {
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
          medir('search', { tipo: f.tipo || 'todos', operacion: f.op, precio_max: f.max || 0, con_texto: !!f.q, vista: vista, resultados: n });
        }, 900);
      }
    };
    var limpiar = function () {
      var op = opActual();
      buscador.reset();
      buscador.elements.op.value = op;
      pintarPresupuestos('');
      aplicar(false);
    };
    var ponerOperacion = function (op) {
      buscador.elements.op.value = op === 'alquiler' ? 'alquiler' : 'venta';
      pintarPresupuestos('');
    };
    var ponerVista = function (v) {
      vista = v === 'mapa' ? 'mapa' : 'lista';
      $$('[data-vista]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false'); });
    };

    var inicial = new URLSearchParams(location.search);
    ponerOperacion(inicial.get('op'));
    if (inicial.get('q')) buscador.elements.q.value = inicial.get('q');
    if (inicial.get('tipo')) buscador.elements.tipo.value = inicial.get('tipo');
    pintarPresupuestos(inicial.get('max'));
    ponerVista(inicial.get('vista'));
    aplicar(false);

    buscador.addEventListener('change', function (e) {
      if (e.target.name === 'op') pintarPresupuestos('');
      aplicar(true);
    });
    buscador.elements.q.addEventListener('input', function () { aplicar(true); });
    buscador.addEventListener('submit', function (e) {
      e.preventDefault();
      aplicar(true);
      $('#propiedades').scrollIntoView();
    });
    $$('[data-limpiar]').forEach(function (b) { b.addEventListener('click', limpiar); });
    $$('[data-vista]').forEach(function (b) {
      b.addEventListener('click', function () { ponerVista(b.dataset.vista); aplicar(true); });
    });
    var mas = $('[data-mas-filtros]');
    mas.addEventListener('click', function () {
      var abierto = $('[data-extra]').classList.toggle('abierto');
      mas.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    if (buscador.elements.tipo.value || selMax.value) { $('[data-extra]').classList.add('abierto'); mas.setAttribute('aria-expanded', 'true'); }
    // «Comprar» y «Alquilar» del menú aplican el filtro sin recargar la portada.
    $$('[data-nav-op]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        ponerOperacion(a.dataset.navOp);
        aplicar(true);
        if (menu && menu.open) menu.close();
        $('#propiedades').scrollIntoView();
      });
    });
    // Al abrir una ficha se recuerda el catálogo (filtros y posición) para poder volver.
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="/propiedades/"]');
      if (!a) return;
      try { sessionStorage.setItem('lp_catalogo', JSON.stringify({ url: location.pathname + location.search, y: window.scrollY })); } catch (err) {}
    });
    try {
      if (sessionStorage.getItem('lp_restaurar') === '1') {
        sessionStorage.removeItem('lp_restaurar');
        var guardado = JSON.parse(sessionStorage.getItem('lp_catalogo') || 'null');
        if (guardado) window.scrollTo({ top: guardado.y, behavior: 'instant' });
      } else if (location.hash === '#propiedades' || inicial.get('op')) {
        $('#propiedades').scrollIntoView({ behavior: 'instant' });
      }
    } catch (err) {}
  }

  /* ---------- Volver al catálogo desde una ficha ---------- */
  $$('[data-volver]').forEach(function (a) {
    try {
      var g = JSON.parse(sessionStorage.getItem('lp_catalogo') || 'null');
      if (g && g.url) a.href = g.url;
      a.addEventListener('click', function () { if (g) sessionStorage.setItem('lp_restaurar', '1'); });
    } catch (err) {}
  });

  /* ---------- Contacto: interés preseleccionado ---------- */
  var interes = new URLSearchParams(location.search).get('interes');
  if (interes) { var opcion = $('option[data-interes="' + interes.replace(/[^a-z]/g, '') + '"]'); if (opcion) opcion.selected = true; }

  /* ---------- Comparador ---------- */
  var barra = $('[data-barra-comparar]');
  if (barra) {
    var datos = JSON.parse($('#datos-propiedades').textContent);
    var elegidas = [];
    var modal = $('[data-modal-comparar]');
    var pintar = function () {
      $('[data-n-comparar]').textContent = elegidas.length;
      barra.hidden = elegidas.length < 2;
    };
    $$('[data-comparar]').forEach(function (cb) {
      cb.checked = false;
      cb.addEventListener('change', function () {
        if (cb.checked) {
          if (elegidas.length >= 3) { cb.checked = false; alert('Puedes comparar hasta 3 propiedades.'); return; }
          elegidas.push(cb.value);
        } else {
          elegidas = elegidas.filter(function (x) { return x !== cb.value; });
        }
        pintar();
      });
    });
    $('[data-abrir-comparar]').addEventListener('click', function () {
      var cols = elegidas.map(function (id) { return datos.filter(function (d) { return d.id === id; })[0]; });
      var filas = [
        ['Foto', function (d) { var i = new Image(); i.src = d.foto; i.alt = ''; return i; }],
        ['Precio', function (d) { return d.precio; }],
        ['Tipo', function (d) { return d.tipoTexto; }],
        ['Operación', function (d) { return d.opsTexto; }],
        ['Ubicación', function (d) { return d.zona; }],
        ['Detalles', function (d) { return d.datos.join(' · ') || '—'; }],
        ['', function (d) { var a = document.createElement('a'); a.href = d.url; a.className = 'boton chico'; a.textContent = 'Ver ficha'; return a; }]
      ];
      var tabla = document.createElement('table');
      tabla.className = 'tabla-comparar';
      var cab = tabla.createTHead().insertRow();
      cab.appendChild(document.createElement('th'));
      cols.forEach(function (d) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = d.titulo; cab.appendChild(th); });
      var cuerpo = tabla.createTBody();
      filas.forEach(function (f) {
        var tr = cuerpo.insertRow();
        var th = document.createElement('th'); th.scope = 'row'; th.textContent = f[0]; tr.appendChild(th);
        cols.forEach(function (d) { var td = tr.insertCell(); var v = f[1](d); if (typeof v === 'string') td.textContent = v; else td.appendChild(v); });
      });
      var caja = $('[data-tabla-comparar]');
      caja.textContent = '';
      caja.appendChild(tabla);
      modal.showModal();
      medir('comparar', { cantidad: cols.length });
    });
    $('[data-limpiar-comparar]').addEventListener('click', function () {
      elegidas = [];
      $$('[data-comparar]').forEach(function (cb) { cb.checked = false; });
      pintar();
    });
  }
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-cerrar]')) d.close(); });
  });

  /* ---------- Galería ---------- */
  var galeria = $('[data-galeria]');
  if (galeria) {
    var fotos = JSON.parse(galeria.dataset.galeria);
    var actual = 0;
    var principal = $('[data-foto-principal]', galeria);
    var minis = $$('[data-mini]', galeria);
    var visor = $('[data-visor]');
    var visorImg = $('[data-visor-img]');
    var mostrar = function (i) {
      actual = (i + fotos.length) % fotos.length;
      var f = fotos[actual];
      principal.src = f.media; principal.srcset = f.srcset; principal.alt = f.alt;
      $('[data-cuenta-fotos]', galeria).textContent = (actual + 1) + ' / ' + fotos.length;
      minis.forEach(function (m, k) { m.setAttribute('aria-current', k === actual ? 'true' : 'false'); });
      if (visor.open) {
        visorImg.src = f.grande; visorImg.alt = f.alt;
        $('[data-visor-cuenta]').textContent = (actual + 1) + ' / ' + fotos.length;
      }
    };
    minis.forEach(function (m, k) { m.addEventListener('click', function () { mostrar(k); }); });
    $$('[data-paso]', galeria).forEach(function (b) { b.addEventListener('click', function () { mostrar(actual + parseInt(b.dataset.paso, 10)); if (minis[actual]) minis[actual].scrollIntoView({ block: 'nearest', inline: 'nearest' }); }); });
    $('[data-abrir-visor]', galeria).addEventListener('click', function () {
      visor.showModal();
      mostrar(actual);
      medir('ver_galeria', { item_id: ficha ? ficha.dataset.ref : '' });
    });
    $$('[data-mover]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); mostrar(actual + parseInt(b.dataset.mover, 10)); });
    });
    document.addEventListener('keydown', function (e) {
      if (!visor.open) return;
      if (e.key === 'ArrowLeft') mostrar(actual - 1);
      if (e.key === 'ArrowRight') mostrar(actual + 1);
    });
    var x0 = null;
    visor.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    visor.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) mostrar(actual + (dx < 0 ? 1 : -1));
      x0 = null;
    });
    if (fotos.length < 2) $$('[data-mover]').forEach(function (b) { b.hidden = true; });
  }

  /* ---------- Compartir ---------- */
  $$('[data-compartir]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.dataset.url || location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { b.textContent = 'Enlace copiado'; });
      }
      medir('share', { item_id: ficha ? ficha.dataset.ref : '' });
    });
  });

  /* ---------- Calculadora hipotecaria ---------- */
  $$('[data-calculadora]').forEach(function (f) {
    var calcular = function () {
      var precio = parseFloat(f.elements.precio.value) || 0;
      var prima = parseFloat(f.elements.prima.value) || 0;
      var tasa = parseFloat(f.elements.tasa.value) || 0;
      var n = (parseInt(f.elements.plazo.value, 10) || 25) * 12;
      var prestamo = precio * (1 - prima / 100);
      var r = tasa / 100 / 12;
      var cuota = r > 0 ? prestamo * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : prestamo / n;
      $('[data-prima]', f).textContent = prima + ' %';
      $('[data-tasa]', f).textContent = tasa.toFixed(1) + ' %';
      $('[data-cuota]', f).textContent = dinero(cuota);
      $('[data-prestamo]', f).textContent = dinero(prestamo);
      $('[data-total]', f).textContent = dinero(cuota * n);
    };
    f.addEventListener('input', calcular);
    f.addEventListener('submit', function (e) { e.preventDefault(); });
    calcular();
  });

  /* ---------- Mapa ----------
     MapLibre GL con el estilo claro «Positron» de OpenFreeMap (datos de OpenStreetMap):
     sin clave de API ni costo. La librería se descarga solo cuando hace falta un mapa. */
  function conMapas(listo) {
    if (window.maplibregl) return listo();
    if (colaMapa) return colaMapa.push(listo);
    colaMapa = [listo];
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
    js.onload = function () { colaMapa.forEach(function (f) { f(); }); };
    js.onerror = function () { $$('[data-mapa]').forEach(function (m) { if (!m.firstElementChild) m.textContent = 'No se pudo cargar el mapa.'; }); };
    document.head.appendChild(js);
  }
  // Polígono circular en metros, para sombrear una zona aproximada.
  function circulo(p) {
    var puntosC = [], km = p.radio / 1000;
    for (var k = 0; k <= 64; k++) {
      var a = (k / 64) * 2 * Math.PI;
      puntosC.push([p.lng + (km / (111.32 * Math.cos(p.lat * Math.PI / 180))) * Math.cos(a), p.lat + (km / 110.574) * Math.sin(a)]);
    }
    return { type: 'Feature', properties: { id: p.id || '0' }, geometry: { type: 'Polygon', coordinates: [puntosC] } };
  }
  function crearMapa(el) {
    var puntos = JSON.parse(el.dataset.mapa);
    var mapa = null, marcas = {}, listo = false, pendientes = null;
    var encuadrar = function (ids) {
      var visibles = puntos.filter(function (p) { return !ids || !p.id || ids.indexOf(p.id) !== -1; });
      puntos.forEach(function (p) {
        var m = marcas[p.id || '0'];
        if (visibles.indexOf(p) !== -1) m.addTo(mapa); else { if (m.getPopup().isOpen()) m.togglePopup(); m.remove(); }
      });
      if (mapa.getLayer('zonas')) {
        var filtro = ['in', ['get', 'id'], ['literal', visibles.map(function (p) { return p.id || '0'; })]];
        mapa.setFilter('zonas', filtro); mapa.setFilter('zonas-borde', filtro);
      }
      mapa.resize();
      if (!visibles.length) return;
      if (visibles.length === 1 && !visibles[0].radio) return mapa.jumpTo({ center: [visibles[0].lng, visibles[0].lat], zoom: 15.2 });
      var caja = new maplibregl.LngLatBounds();
      visibles.forEach(function (p) {
        if (p.radio) circulo(p).geometry.coordinates[0].forEach(function (c) { caja.extend(c); });
        else caja.extend([p.lng, p.lat]);
      });
      mapa.fitBounds(caja, { padding: 48, maxZoom: 15.2, animate: false });
    };
    conMapas(function () {
      el.textContent = '';
      try {
        mapa = new maplibregl.Map({
          container: el,
          style: ESTILO_MAPA,
          center: [puntos[0].lng, puntos[0].lat],
          zoom: 12,
          // La rueda y un solo dedo desplazan la página; el mapa pide Ctrl o dos dedos.
          cooperativeGestures: true,
          attributionControl: { compact: false },
          locale: {
            'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para acercar el mapa',
            'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para acercar el mapa',
            'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
            'NavigationControl.ZoomIn': 'Acercar',
            'NavigationControl.ZoomOut': 'Alejar'
          }
        });
      } catch (err) { el.textContent = 'No se pudo cargar el mapa.'; return; }
      mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapa.on('error', function () { if (!listo && !el.querySelector('canvas')) el.textContent = 'No se pudo cargar el mapa.'; });
      puntos.forEach(function (p) {
        var punto = document.createElement('div');
        punto.className = p.radio ? 'marcador zona' : 'marcador';
        punto.setAttribute('role', 'button');
        punto.setAttribute('aria-label', p.titulo + (p.radio ? ' — ubicación aproximada' : ''));
        var caja = document.createElement('div');
        caja.className = 'popup';
        var t = document.createElement('strong'); t.textContent = p.titulo; caja.appendChild(t);
        var d = document.createElement('div'); d.textContent = p.zona + ' · ' + p.precio; caja.appendChild(d);
        if (p.nota) { var n = document.createElement('div'); n.textContent = p.nota; caja.appendChild(n); }
        if (p.url) { var a = document.createElement('a'); a.href = p.url; a.textContent = 'Ver propiedad'; caja.appendChild(a); caja.appendChild(document.createTextNode(' · ')); }
        if (p.wa) { var w = document.createElement('a'); w.href = p.wa; w.target = '_blank'; w.rel = 'noopener noreferrer'; w.dataset.ref = p.ref; w.dataset.lugar = 'mapa'; w.textContent = 'Consultar ubicación por WhatsApp'; caja.appendChild(w); }
        if (p.maps) { var g = document.createElement('a'); g.href = p.maps; g.target = '_blank'; g.rel = 'noopener noreferrer'; g.textContent = 'Google Maps'; caja.appendChild(g); }
        marcas[p.id || '0'] = new maplibregl.Marker({ element: punto })
          .setLngLat([p.lng, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 16, maxWidth: '260px' }).setDOMContent(caja));
      });
      mapa.on('load', function () {
        listo = true;
        // Ajuste de color sobre el estilo: tierra en blanco cálido y agua en azul grisáceo suave.
        // Solo cambia la pintura de esas capas; marcadores, controles y textos no se tocan.
        try {
          mapa.getStyle().layers.forEach(function (capa) {
            if (capa.type === 'background') mapa.setPaintProperty(capa.id, 'background-color', '#f2f1ec');
            else if (capa.type === 'fill' && /^water/.test(capa.id)) mapa.setPaintProperty(capa.id, 'fill-color', '#c5d3da');
          });
        } catch (err) {}
        var zonas = puntos.filter(function (p) { return p.radio; }).map(circulo);
        if (zonas.length) {
          // Zona aproximada: área sombreada con borde punteado. Nunca un pin sobre una parcela.
          mapa.addSource('zonas', { type: 'geojson', data: { type: 'FeatureCollection', features: zonas } });
          mapa.addLayer({ id: 'zonas', type: 'fill', source: 'zonas', paint: { 'fill-color': '#142c3a', 'fill-opacity': 0.12 } });
          mapa.addLayer({ id: 'zonas-borde', type: 'line', source: 'zonas', paint: { 'line-color': '#142c3a', 'line-width': 1.5, 'line-dasharray': [3, 3] } });
        }
        encuadrar(pendientes);
      });
    });
    return { filtrar: function (ids) { pendientes = ids; if (listo) encuadrar(ids); } };
  }
  // Mapas de las fichas: se cargan al acercarse. El del catálogo, al elegir la vista «Mapa».
  if ('IntersectionObserver' in window) {
    $$('[data-mapa]').forEach(function (el) {
      if (el.closest('[data-panel-mapa]')) return;
      var obs = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { obs.disconnect(); crearMapa(el); }
      }, { rootMargin: '300px' });
      obs.observe(el);
    });
  }

  /* ---------- Formularios (Formspree) ---------- */
  $$('[data-formulario]').forEach(function (f) {
    var estado = $('[data-estado]', f);
    var boton = $('button[type="submit"]', f);
    var enviando = false;
    var ultimo = '';
    var avisar = function (clase, texto) { estado.hidden = false; estado.className = 'estado ' + clase; estado.textContent = texto; };
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enviando) return; // evita envíos duplicados por doble clic o Enter repetido
      var d = new FormData(f);
      if (!String(d.get('nombre') || '').trim()) { avisar('error', 'Escribe tu nombre.'); return; }
      if (!String(d.get('telefono') || '').trim() && !String(d.get('email') || '').trim()) {
        estado.hidden = false; estado.className = 'estado error';
        estado.textContent = 'Déjanos un teléfono o un correo para poder responderte.';
        return;
      }
      var cuerpo = {};
      d.forEach(function (v, k) { cuerpo[k] = v; });
      cuerpo.pagina = location.origin + location.pathname;
      Object.keys(origen).forEach(function (k) { cuerpo[k] = origen[k]; });
      var firma = JSON.stringify(cuerpo);
      if (firma === ultimo) { avisar('ok', 'Esa consulta ya fue enviada. Te contactaremos pronto.'); return; }
      var texto = boton.textContent;
      enviando = true;
      boton.disabled = true; boton.textContent = 'Enviando…';
      estado.hidden = true;
      var control = 'AbortController' in window ? new AbortController() : null;
      var limite = setTimeout(function () { if (control) control.abort(); }, 20000);
      fetch(f.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: firma,
        signal: control ? control.signal : undefined
      }).then(function (r) {
        // Éxito solo si Formspree responde 2xx y no marca error en el cuerpo.
        return r.json().catch(function () { return {}; }).then(function (resp) {
          if (!r.ok || resp.ok === false || resp.error || (resp.errors && resp.errors.length)) throw new Error('respuesta ' + r.status);
        });
      }).then(function () {
        ultimo = firma;
        f.reset();
        estado.hidden = false; estado.className = 'estado ok';
        estado.textContent = 'Consulta enviada. Te contactaremos pronto.';
        // Solo se mide tras la confirmación de Formspree, y sin datos personales.
        medir('generate_lead', { item_id: cuerpo.ref || '(general)', lugar: f.dataset.formulario });
      }).catch(function () {
        estado.hidden = false; estado.className = 'estado error';
        estado.textContent = 'No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.';
      }).then(function () {
        clearTimeout(limite);
        enviando = false;
        boton.disabled = false; boton.textContent = texto;
      });
    });
  });
})();
