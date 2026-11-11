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

  /* ---------- Buscador y filtros ---------- */
  var buscador = $('[data-buscador]');
  if (buscador) {
    var tarjetas = $$('[data-tarjeta]');
    var cuenta = $('[data-cuenta]');
    var vacio = $('[data-sin-resultados]');
    var temporizador;
    var leer = function () {
      return {
        q: normal(buscador.elements.q.value.trim()),
        tipo: buscador.elements.tipo.value,
        op: buscador.elements.op.value,
        max: parseFloat(buscador.elements.max.value) || 0
      };
    };
    var aplicar = function (registrar) {
      var f = leer();
      var n = 0;
      tarjetas.forEach(function (t) {
        var ops = t.dataset.ops.split(' ');
        var ver = true;
        if (f.q && t.dataset.texto.indexOf(f.q) === -1) ver = false;
        if (f.tipo && t.dataset.tipo !== f.tipo) ver = false;
        if (f.op && ops.indexOf(f.op) === -1) ver = false;
        if (f.max) {
          // El tope se compara con el precio de la operación elegida (venta por defecto).
          // Las propiedades sin precio publicado no se descartan.
          var precio = parseFloat(t.dataset[f.op === 'alquiler' ? 'alquiler' : 'venta']);
          if (precio && precio > f.max) ver = false;
        }
        t.hidden = !ver;
        if (ver) n++;
      });
      cuenta.textContent = n === 1 ? '1 propiedad' : n + ' propiedades';
      vacio.hidden = n !== 0;
      var p = new URLSearchParams();
      if (buscador.elements.q.value.trim()) p.set('q', buscador.elements.q.value.trim());
      if (f.tipo) p.set('tipo', f.tipo);
      if (f.op) p.set('op', f.op);
      if (f.max) p.set('max', f.max);
      var s = p.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
      if (registrar) {
        clearTimeout(temporizador);
        temporizador = setTimeout(function () {
          medir('search', {
            tipo: f.tipo || 'todos',
            operacion: f.op || 'todas',
            precio_max: f.max || 0,
            con_texto: !!f.q,
            resultados: n
          });
        }, 900);
      }
    };
    var inicial = new URLSearchParams(location.search);
    ['q', 'tipo', 'op', 'max'].forEach(function (k) {
      if (inicial.get(k) !== null && buscador.elements[k]) buscador.elements[k].value = inicial.get(k);
    });
    buscador.addEventListener('input', function () { aplicar(true); });
    buscador.addEventListener('submit', function (e) {
      e.preventDefault();
      aplicar(true);
      $('#propiedades').scrollIntoView();
    });
    $$('[data-limpiar]').forEach(function (b) {
      b.addEventListener('click', function () { buscador.reset(); aplicar(false); });
    });
    aplicar(false);
  }

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

  /* ---------- Mapa (Leaflet se descarga solo al acercarse al mapa) ---------- */
  var mapaEl = $('[data-mapa]');
  if (mapaEl && 'IntersectionObserver' in window) {
    var cargarMapa = function () {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = function () {
        var L = window.L;
        var puntos = JSON.parse(mapaEl.dataset.mapa);
        mapaEl.textContent = '';
        var mapa = L.map(mapaEl, { scrollWheelZoom: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18
        }).addTo(mapa);
        var marcas = puntos.map(function (p) {
          var m = L.circleMarker([p.lat, p.lng], { radius: 10, color: '#ffffff', weight: 3, fillColor: '#0f2c59', fillOpacity: 1 }).addTo(mapa);
          var caja = document.createElement('div');
          caja.className = 'popup';
          var t = document.createElement('strong'); t.textContent = p.titulo; caja.appendChild(t);
          var d = document.createElement('div'); d.textContent = p.zona + ' · ' + p.precio; caja.appendChild(d);
          if (p.url) { var a = document.createElement('a'); a.href = p.url; a.textContent = 'Ver ficha →'; caja.appendChild(a); }
          m.bindPopup(caja);
          return m;
        });
        if (puntos.length === 1) mapa.setView([puntos[0].lat, puntos[0].lng], 15);
        else mapa.fitBounds(L.featureGroup(marcas).getBounds().pad(0.3));
      };
      document.head.appendChild(js);
    };
    var obs = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { obs.disconnect(); cargarMapa(); }
    }, { rootMargin: '300px' });
    obs.observe(mapaEl);
  }

  /* ---------- Formularios (Formspree) ---------- */
  $$('[data-formulario]').forEach(function (f) {
    var estado = $('[data-estado]', f);
    var boton = $('button[type="submit"]', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(f);
      if (!String(d.get('telefono') || '').trim() && !String(d.get('email') || '').trim()) {
        estado.hidden = false; estado.className = 'estado error';
        estado.textContent = 'Déjanos un teléfono o un correo para poder responderte.';
        return;
      }
      var cuerpo = {};
      d.forEach(function (v, k) { cuerpo[k] = v; });
      cuerpo.pagina = location.origin + location.pathname;
      Object.keys(origen).forEach(function (k) { cuerpo[k] = origen[k]; });
      var texto = boton.textContent;
      boton.disabled = true; boton.textContent = 'Enviando…';
      fetch(f.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        if (!r.ok) throw new Error('respuesta ' + r.status);
        f.reset();
        estado.hidden = false; estado.className = 'estado ok';
        estado.textContent = 'Consulta enviada. Te contactaremos pronto.';
        // Solo se mide tras la confirmación de Formspree, y sin datos personales.
        medir('generate_lead', { item_id: cuerpo.ref || '(general)', lugar: f.dataset.formulario });
      }).catch(function () {
        estado.hidden = false; estado.className = 'estado error';
        estado.textContent = 'No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.';
      }).then(function () {
        boton.disabled = false; boton.textContent = texto;
      });
    });
  });
})();
