/* ================================================================
   CARGA DE DATOS DESDE GEOJSON
   ================================================================ */
const DATA_FILES = {
  espacios: 'data/Espacios_Culturales.geojson',
  infra: 'data/Infraestructura_Cultural.geojson',
  atractivos: 'data/Atractivo_Turistico.geojson'
};

// Definición de capas y categorías (se llenan con los datos cargados)
const LAYER_DEFS = {
  espacios: {
    key: 'espacios',
    title: 'Espacios culturales',
    shape: 'circle',
    propNombre: 'Name',
    propTipo: 'Tipos',
    cats: {
      "Espacio Multidisciplinario":        { label: "Espacios multidisciplinarios",       color: "var(--c-multi)" },
      "Espacio musical":                   { label: "Espacios musicales",                 color: "var(--c-musical)" },
      "Espacios Audiovisuales":            { label: "Espacios audiovisuales",             color: "var(--c-audiovisual)" },
      "Espacios de artes visuales":        { label: "Artes visuales",                     color: "var(--c-visuales)" },
      "Espacios de diseños y artes plasticas": { label: "Diseño y artes plásticas",        color: "var(--c-diseno)" },
      "Espacios editoriales y literaris":  { label: "Editoriales y literarios",           color: "var(--c-editorial)" },
      "Espacios escenicos":                { label: "Espacios escénicos",                 color: "var(--c-escenico)" },
      "Espacios Hibridos":                 { label: "Espacios híbridos",                  color: "var(--c-hibrido)" },
      "Museos y sitios de memoria social": { label: "Museos y sitios de memoria social",  color: "var(--c-museos)" }
    },
    defaultOpen: true
  },
  infra: {
    key: 'infra',
    title: 'Infraestructura cultural',
    shape: 'diamond',
    propNombre: 'sitios',
    propTipo: 'tipologia',
    cats: {
      "Artes Literarias":     { label: "Artes literarias",     color: "var(--c-inf-lit)" },
      "Artes Visuales":       { label: "Artes visuales",       color: "var(--c-inf-vis)" },
      "Arte Viva":            { label: "Arte viva",            color: "var(--c-inf-viva)" },
      "Cultura Comunitaria":  { label: "Cultura comunitaria",  color: "var(--c-inf-com)" },
      "Secretaria":           { label: "Secretaría",           color: "var(--c-inf-sec)" },
      "Artes Audiovisuales":  { label: "Artes audiovisuales",  color: "var(--c-inf-audio)" },
      "Artes Musicales":      { label: "Artes musicales",      color: "var(--c-inf-mus)" }
    },
    defaultOpen: false
  },
  atractivos: {
    key: 'atractivos',
    title: 'Atractivos turísticos',
    shape: 'pin',
    propNombre: 'NOMBRE_DEL',
    propTipo: 'CATEGORÍA',
    cats: {
      "Atractivo Cultural": { label: "Atractivo cultural", color: "var(--c-atr-cult)" },
      "Atractivo Natural":  { label: "Atractivo natural",  color: "var(--c-atr-nat)" }
    },
    defaultOpen: false
  }
};

// Estado global
let allPoints = [];
let markerIndex = [];
let layerMasterState = {};   // clave: layerKey -> boolean (activada/desactivada)
let categoryState = {};      // clave: "layerKey::tipo" -> boolean
let labelsOn = false;
let map, baseLight, baseSat, satRoads, satLabels;

// Funciones auxiliares
function resolveColor(v) {
  if (!v.startsWith('var(')) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim();
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shapeIconHtml(shape, hex, size = 12) {
  const border = '1px solid rgba(255,255,255,.9)';
  if (shape === 'circle') {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:${border};box-shadow:0 0 0 2px rgba(23,21,15,.18)"></span>`;
  }
  if (shape === 'diamond') {
    return `<span style="display:inline-block;width:${size - 4}px;height:${size - 4}px;transform:rotate(45deg);background:${hex};border:${border};box-shadow:0 0 0 2px rgba(23,21,15,.18)"></span>`;
  }
  if (shape === 'pin') {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;background:${hex};clip-path:polygon(50% 100%, 100% 38%, 83% 8%, 50% 0, 17% 8%, 0 38%);border:none;filter:drop-shadow(0 1px 2px rgba(23,21,15,.35))"></span>`;
  }
  return `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:${hex};border:${border};"></span>`;
}

/* ================================================================
   INICIALIZACIÓN DEL MAPA
   ================================================================ */
function initMap() {
  map = L.map('map', {
    zoomControl: false,
    minZoom: 11,
    maxZoom: 19,
    preferCanvas: true,      // renderiza vectores en canvas: mucho más fluido en gama baja/móvil
    zoomSnap: 0.25,          // permite niveles de zoom fraccionarios → transición más suave
    zoomDelta: 0.5,          // cuánto avanza cada clic en +/- o cada doble clic
    wheelPxPerZoomLevel: 200, // más scroll necesario por nivel → la rueda/trackpad ya no "salta"
    wheelDebounceTime: 100   // espera un poco entre pasos de zoom en vez de encadenarlos de golpe
  }).setView([-0.19, -78.49], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

  // Botón flotante de ubicación en el mapa (siempre a mano, incluso con panel cerrado)
  const locateBtn = L.control({ position: 'bottomright' });
  locateBtn.onAdd = function() {
    const div = L.DomUtil.create('div', 'leaflet-bar locate-fab');
    div.innerHTML = `
      <a href="#" role="button" title="Ir a mi ubicación" aria-label="Ir a mi ubicación">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      </a>`;
    div.addEventListener('click', (e) => {
      e.preventDefault();
      map.locate({ setView: true, maxZoom: 16 });
    });
    return div;
  };
  locateBtn.addTo(map);

  // Mostrar coordenadas del cursor (útil para encuestadores)
  const coordCtrl = L.control({ position: 'bottomleft' });
  coordCtrl.onAdd = function() {
    const div = L.DomUtil.create('div', 'leaflet-coords');
    div.innerHTML = '<span>lat —, lon —</span>';
    return div;
  };
  coordCtrl.addTo(map);
  map.on('mousemove', (e) => {
    const el = document.querySelector('.leaflet-coords span');
    if (el) el.textContent = `lat ${e.latlng.lat.toFixed(5)}, lon ${e.latlng.lng.toFixed(5)}`;
  });
  map.on('mouseout', () => {
    const el = document.querySelector('.leaflet-coords span');
    if (el) el.textContent = 'lat —, lon —';
  });

  // Mapas base
  baseLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  });
  baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  });
  // Antes se usaban las etiquetas de CartoDB Voyager (pensadas para fondo claro) sobre
  // la imagen satelital: por eso los nombres de calles casi no se veían. Esri publica
  // capas de "Reference" hechas específicamente para superponerse sobre World_Imagery,
  // con halo blanco y buen contraste: una de vías y otra de límites/nombres de lugares.
  satRoads = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    className: 'sat-reference-layer'
  });
  satLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
    className: 'sat-reference-layer'
  });

  baseLight.addTo(map);

  // Cambio de mapa base
  document.querySelectorAll('.base-opt').forEach(el => {
    el.addEventListener('click', function() {
      document.querySelectorAll('.base-opt').forEach(o => o.classList.remove('active'));
      this.classList.add('active');
      if (this.dataset.base === 'light') {
        map.removeLayer(baseSat);
        map.removeLayer(satRoads);
        map.removeLayer(satLabels);
        baseLight.addTo(map);
      } else {
        map.removeLayer(baseLight);
        baseSat.addTo(map);
        satRoads.addTo(map);
        satLabels.addTo(map);
      }
    });
  });

  // Geolocalización
  document.getElementById('locate-btn').addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 16 });
  });
  map.on('locationfound', (e) => {
    const accent = resolveColor('var(--gold)');
    L.circleMarker(e.latlng, { radius: 6, color: accent, fillColor: accent, fillOpacity: 0.8 })
      .addTo(map)
      .bindPopup('¡Estás aquí!');
  });
  map.on('locationerror', () => {
    alert('No se pudo obtener tu ubicación. Asegúrate de dar permisos de geolocalización.');
  });

  // Botón "Copiar coords" dentro de los popups
  map.on('popupopen', () => {
    document.querySelectorAll('.pop-copy').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            btn.textContent = '¡Copiado!';
            setTimeout(() => { btn.textContent = 'Copiar coords'; }, 1500);
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = '¡Copiado!';
          setTimeout(() => { btn.textContent = 'Copiar coords'; }, 1500);
        }
      });
    });
  });

  // Al hacer zoom, actualizar etiquetas (con debounce: en pinch-zoom en móvil
  // "zoomend" puede dispararse muy seguido, y updateLabels recorre todos los puntos)
  let labelUpdateTimer = null;
  map.on('zoomend', () => {
    clearTimeout(labelUpdateTimer);
    labelUpdateTimer = setTimeout(updateLabels, 80);
  });
}

/* ================================================================
   CARGA DE DATOS DESDE GEOJSON
   ================================================================ */
async function loadData() {
  const loadingEl = document.getElementById('loading');
  try {
    const [espacios, infra, atractivos] = await Promise.all([
      fetch(DATA_FILES.espacios).then(r => r.json()),
      fetch(DATA_FILES.infra).then(r => r.json()),
      fetch(DATA_FILES.atractivos).then(r => r.json())
    ]);

    // Función para procesar un FeatureCollection y extraer puntos
    function processGeoJSON(geojson, layerKey) {
      const layerDef = LAYER_DEFS[layerKey];
      const points = [];
      if (!geojson.features) return points;
      geojson.features.forEach(feature => {
        if (!feature.geometry || feature.geometry.type !== 'Point') return;
        const props = feature.properties;
        const nombre = props[layerDef.propNombre];
        const tipo = props[layerDef.propTipo];
        // Si falta nombre o tipo, o el tipo no está en las categorías definidas, lo saltamos
        if (!nombre || !tipo || !layerDef.cats[tipo]) return;
        const coords = feature.geometry.coordinates;
        points.push({
          nombre: nombre,
          tipo: tipo,
          lat: coords[1],
          lon: coords[0],
          layer: layerKey
        });
      });
      return points;
    }

    // Asignar puntos a cada capa
    LAYER_DEFS.espacios.points = processGeoJSON(espacios, 'espacios');
    LAYER_DEFS.infra.points = processGeoJSON(infra, 'infra');
    LAYER_DEFS.atractivos.points = processGeoJSON(atractivos, 'atractivos');

    // Calcular conteos y asignar colores hex
    Object.values(LAYER_DEFS).forEach(layer => {
      // Resolver colores
      Object.keys(layer.cats).forEach(k => {
        layer.cats[k].hex = resolveColor(layer.cats[k].color);
      });
      // Contar por tipo
      const counts = {};
      layer.points.forEach(p => {
        counts[p.tipo] = (counts[p.tipo] || 0) + 1;
      });
      Object.keys(layer.cats).forEach(k => {
        layer.cats[k].count = counts[k] || 0;
        // Umbral de zoom para etiquetas (bajos a propósito: el mapa es referencial para encuestadores)
        const c = layer.cats[k].count;
        layer.cats[k].labelZoom = c > 200 ? 15 : c > 90 ? 14 : c > 40 ? 13 : c > 10 ? 12 : 11;
      });
      layer.total = layer.points.length;
    });

    // Acumular todos los puntos para búsqueda
    allPoints = [];
    Object.values(LAYER_DEFS).forEach(layer => {
      allPoints = allPoints.concat(layer.points);
    });

    // Inicializar estado de capas y categorías
    Object.keys(LAYER_DEFS).forEach(key => {
      layerMasterState[key] = true; // por defecto activas
      Object.keys(LAYER_DEFS[key].cats).forEach(tipo => {
        categoryState[key + '::' + tipo] = true;
      });
    });

    // Construir sidebar
    buildSidebar();

    // Crear marcadores y clusters
    createMarkers();

    // Actualizar estadísticas
    document.getElementById('stats-total-num').textContent = allPoints.length.toLocaleString('es-EC');
    updateVisibleCount();

    // Restaurar estado desde localStorage
    restoreState();

    // Refrescar marcadores
    refreshMarkers();

    // Evento toggle etiquetas
    document.getElementById('toggle-labels').addEventListener('change', (e) => {
      labelsOn = e.target.checked;
      localStorage.setItem('labelsOn', JSON.stringify(labelsOn));
      updateLabels();
    });

    loadingEl.classList.add('hidden');

  } catch (error) {
    console.error('Error cargando los datos:', error);
    if (loadingEl) loadingEl.textContent = 'No se pudieron cargar los datos. Recarga la página o vuelve más tarde.';
    alert('No se pudieron cargar los archivos GeoJSON. Asegúrate de que estén en la carpeta "data" y sean archivos válidos.');
  }
}

/* ================================================================
   CONSTRUCCIÓN DEL SIDEBAR (capas y categorías)
   ================================================================ */
function buildSidebar() {
  const root = document.getElementById('layers-root');
  root.innerHTML = '';

  Object.values(LAYER_DEFS).forEach(layer => {
    const block = document.createElement('div');
    block.className = 'layer-block' + (layer.defaultOpen ? ' open' : '');
    block.dataset.layer = layer.key;

    // Cabecera
    const head = document.createElement('div');
    head.className = 'layer-head';
    head.innerHTML = `
      <span class="lh-shape">${shapeIconHtml(layer.shape, resolveColor('var(--gold)'), 13)}</span>
      <div class="lh-title">
        <div class="lh-name">${layer.title}</div>
        <div class="lh-count">${layer.total} sitios</div>
      </div>
      <label class="switch" onclick="event.stopPropagation()">
        <input type="checkbox" checked data-layer-toggle="${layer.key}">
        <span class="switch-track"></span>
      </label>
      <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>
    `;
    head.addEventListener('click', (e) => {
      if (e.target.closest('.switch')) return;
      block.classList.toggle('open');
      // Guardar estado de apertura
      localStorage.setItem('layerOpen_' + layer.key, JSON.stringify(block.classList.contains('open')));
    });
    block.appendChild(head);

    // Cuerpo
    const body = document.createElement('div');
    body.className = 'layer-body';
    const inner = document.createElement('div');
    inner.className = 'layer-body-inner';

    // Categorías
    Object.entries(layer.cats)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([tipo, meta]) => {
        const sk = layer.key + '::' + tipo;
        const row = document.createElement('div');
        row.className = 'cat-item checked';
        row.dataset.sk = sk;
        row.style.setProperty('--cat-color', meta.hex);
        row.innerHTML = `
          <div class="cat-checkbox" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <span class="cat-shape" aria-hidden="true">${shapeIconHtml(layer.shape, meta.hex, 11)}</span>
          <span class="cat-label">${meta.label}</span>
          <span class="cat-count">${meta.count}</span>
        `;
        row.setAttribute('role', 'checkbox');
        row.setAttribute('aria-checked', 'true');
        row.setAttribute('tabindex', '0');
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            row.click();
          }
        });
        row.addEventListener('click', () => {
          categoryState[sk] = !categoryState[sk];
          row.classList.toggle('checked', categoryState[sk]);
          row.setAttribute('aria-checked', String(categoryState[sk]));
          localStorage.setItem('catState_' + sk, JSON.stringify(categoryState[sk]));
          refreshMarkers();
        });
        inner.appendChild(row);
      });

    // Botones "Todas" / "Ninguna"
    const actions = document.createElement('div');
    actions.className = 'cat-actions';
    actions.innerHTML = `
      <button class="link-btn" data-act="all">Todas</button>
      <button class="link-btn" data-act="none">Ninguna</button>
    `;
    actions.querySelector('[data-act="all"]').addEventListener('click', () => {
      Object.keys(layer.cats).forEach(t => {
        const sk = layer.key + '::' + t;
        categoryState[sk] = true;
        localStorage.setItem('catState_' + sk, JSON.stringify(true));
      });
      inner.querySelectorAll('.cat-item').forEach(el => {
        el.classList.add('checked');
        el.setAttribute('aria-checked', 'true');
      });
      refreshMarkers();
    });
    actions.querySelector('[data-act="none"]').addEventListener('click', () => {
      Object.keys(layer.cats).forEach(t => {
        const sk = layer.key + '::' + t;
        categoryState[sk] = false;
        localStorage.setItem('catState_' + sk, JSON.stringify(false));
      });
      inner.querySelectorAll('.cat-item').forEach(el => {
        el.classList.remove('checked');
        el.setAttribute('aria-checked', 'false');
      });
      refreshMarkers();
    });
    inner.appendChild(actions);
    body.appendChild(inner);
    block.appendChild(body);
    root.appendChild(block);

    // Evento toggle de capa (switch)
    const chk = block.querySelector('[data-layer-toggle]');
    chk.addEventListener('change', function() {
      layerMasterState[this.dataset.layerToggle] = this.checked;
      block.classList.toggle('off', !this.checked);
      localStorage.setItem('layerMaster_' + this.dataset.layerToggle, JSON.stringify(this.checked));
      refreshMarkers();
    });
  });
}

/* ================================================================
   CREACIÓN DE MARCADORES Y CLÚSTERES
   ================================================================ */
function createMarkers() {
  markerIndex = [];

  Object.values(LAYER_DEFS).forEach(layer => {
    // Crear cluster group
    layer.cluster = L.markerClusterGroup({
      maxClusterRadius: 85,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      animate: false,
      animateAddingMarkers: false,
      iconCreateFunction: makeClusterIconFn(layer.key)
    });

    // Crear marcadores
    layer.points.forEach(p => {
      const meta = layer.cats[p.tipo];
      if (!meta) return; // seguridad
      const shape = layer.shape;
      const size = shape === 'pin' ? 24 : 16;
      const icon = L.divIcon({
        html: `<div class="mk-wrap mk-${shape}" style="--mk-color:${meta.hex}">
          <span class="mk-shape"></span>
        </div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, shape === 'pin' ? size : size / 2]
      });
      const marker = L.marker([p.lat, p.lon], { icon });
      marker.bindPopup(`
        <div class="pop-eyebrow">${layer.title}</div>
        <div class="pop-cat">${shapeIconHtml(layer.shape, meta.hex, 9)} ${meta.label}</div>
        <div class="pop-name">${escapeHtml(p.nombre)}</div>
        <div class="pop-coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
        <div class="pop-link-row">
          <a href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank" class="pop-link">Abrir en Google Maps →</a>
          <button class="pop-copy" data-copy="${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}">Copiar coords</button>
        </div>
      `, { closeButton: true, maxWidth: 260 });
      markerIndex.push({ p, marker, layer, tooltipOpen: false });
    });

    map.addLayer(layer.cluster);
  });
}

// Función para icono de clúster por capa
function makeClusterIconFn(layerKey) {
  const hex = {
    espacios: resolveColor('var(--gold)'),
    infra: resolveColor('var(--c-inf-lit)'),
    atractivos: resolveColor('var(--c-atr-cult)')
  }[layerKey] || '#C9A227';

  return function(cluster) {
    const count = cluster.getChildCount();
    const size = count < 10 ? 34 : count < 50 ? 40 : count < 150 ? 46 : 52;
    return L.divIcon({
      html: `<div class="mc-bubble" style="--mc-color:${hex}"><span>${count}</span></div>`,
      className: 'mc-wrap',
      iconSize: [size, size]
    });
  };
}

/* ================================================================
   REFRESCAR MARCADORES (aplicar filtros)
   ================================================================ */
function refreshMarkers() {
  Object.values(LAYER_DEFS).forEach(layer => {
    layer.cluster.clearLayers();
    if (!layerMasterState[layer.key]) return;
    const toAdd = markerIndex
      .filter(item => item.layer === layer && categoryState[layer.key + '::' + item.p.tipo])
      .map(item => item.marker);
    layer.cluster.addLayers(toAdd);
  });
  updateVisibleCount();
  updateLabels();
}

/* ================================================================
   ETIQUETAS DINÁMICAS
   ================================================================ */
function updateLabels() {
  const zoom = map.getZoom();
  markerIndex.forEach(item => {
    const sk = item.layer.key + '::' + item.p.tipo;
    const meta = item.layer.cats[item.p.tipo];
    const active = layerMasterState[item.layer.key] && categoryState[sk];
    const shouldLabel = active && labelsOn && zoom >= meta.labelZoom;
    if (shouldLabel && !item.tooltipOpen) {
      item.marker.bindTooltip(item.p.nombre, {
        permanent: true,
        direction: 'right',
        offset: [8, 0],
        className: 'pt-label'
      });
      item.tooltipOpen = true;
    } else if (!shouldLabel && item.tooltipOpen) {
      item.marker.unbindTooltip();
      item.tooltipOpen = false;
    }
  });
}

/* ================================================================
   ACTUALIZAR CONTADOR VISIBLE
   ================================================================ */
function updateVisibleCount() {
  let visible = 0;
  markerIndex.forEach(item => {
    const sk = item.layer.key + '::' + item.p.tipo;
    if (layerMasterState[item.layer.key] && categoryState[sk]) visible++;
  });
  document.getElementById('stats-visible').textContent = visible.toLocaleString('es-EC');
}

/* ================================================================
   PERSISTENCIA (localStorage)
   ================================================================ */
function restoreState() {
  // Restaurar capas
  Object.keys(LAYER_DEFS).forEach(key => {
    const saved = localStorage.getItem('layerMaster_' + key);
    if (saved !== null) {
      const val = JSON.parse(saved);
      layerMasterState[key] = val;
      const chk = document.querySelector(`[data-layer-toggle="${key}"]`);
      if (chk) chk.checked = val;
      const block = document.querySelector(`.layer-block[data-layer="${key}"]`);
      if (block) block.classList.toggle('off', !val);
    }
  });

  // Restaurar categorías
  Object.keys(categoryState).forEach(sk => {
    const saved = localStorage.getItem('catState_' + sk);
    if (saved !== null) {
      categoryState[sk] = JSON.parse(saved);
      const row = document.querySelector(`.cat-item[data-sk="${sk}"]`);
      if (row) {
        row.classList.toggle('checked', categoryState[sk]);
        row.setAttribute('aria-checked', String(categoryState[sk]));
      }
    }
  });

  // Restaurar toggle etiquetas
  const labelsSaved = localStorage.getItem('labelsOn');
  if (labelsSaved !== null) {
    labelsOn = JSON.parse(labelsSaved);
    document.getElementById('toggle-labels').checked = labelsOn;
  } else {
    labelsOn = false;
  }

  // Restaurar apertura de capas
  Object.values(LAYER_DEFS).forEach(layer => {
    const saved = localStorage.getItem('layerOpen_' + layer.key);
    if (saved !== null) {
      const open = JSON.parse(saved);
      const block = document.querySelector(`.layer-block[data-layer="${layer.key}"]`);
      if (block) {
        block.classList.toggle('open', open);
      }
    }
  });

  // Aplicar cambios a marcadores
  refreshMarkers();
}

/* ================================================================
   BÚSQUEDA
   ================================================================ */
function initSearch() {
  const input = document.getElementById('search');
  const results = document.getElementById('search-results');

  let searchTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        results.classList.remove('show');
        results.innerHTML = '';
        return;
      }
      const matches = allPoints.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 12);
      results.innerHTML = '';
      if (matches.length === 0) {
        results.innerHTML = '<div class="sr-empty">Sin resultados</div>';
      } else {
        const frag = document.createDocumentFragment();
        matches.forEach(p => {
          const layer = LAYER_DEFS[p.layer];
          const meta = layer.cats[p.tipo];
          const el = document.createElement('div');
          el.className = 'sr-item';
          el.innerHTML = `
            <span class="sr-shape">${shapeIconHtml(layer.shape, meta.hex, 10)}</span>
            <span class="sr-name">${escapeHtml(p.nombre)}</span>
            <span class="sr-layer">${layer.title.split(' ')[0]}</span>
          `;
          el.addEventListener('click', () => {
            map.setView([p.lat, p.lon], 17, { animate: true });
            const found = markerIndex.find(item => item.p === p);
            if (found) setTimeout(() => found.marker.openPopup(), 350);
            results.classList.remove('show');
            input.value = p.nombre;
          });
          frag.appendChild(el);
        });
        results.appendChild(frag);
      }
      results.classList.add('show');
    }, 120);
  });

  input.addEventListener('focus', () => {
    if (results.innerHTML) results.classList.add('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) results.classList.remove('show');
  });
}

/* ================================================================
   COLAPSAR SIDEBAR
   ================================================================ */
function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sb-toggle');
  const backdrop = document.getElementById('backdrop');
  const isMobileQuery = window.matchMedia('(max-width: 760px)');

  function syncCollapse() {
    const collapsed = sidebar.classList.contains('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    // En móvil, mostrar el fondo oscuro cuando el panel está abierto
    backdrop.classList.toggle('show', isMobileQuery.matches && !collapsed);
  }

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    syncCollapse();
    setTimeout(() => map.invalidateSize(), 340);
  });

  backdrop.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    syncCollapse();
    setTimeout(() => map.invalidateSize(), 340);
  });

  isMobileQuery.addEventListener ? isMobileQuery.addEventListener('change', syncCollapse) : isMobileQuery.addListener(syncCollapse);

  // En móvil arranca colapsado para dejar el mapa visible de entrada
  if (isMobileQuery.matches && window.innerWidth <= 760) {
    sidebar.classList.add('collapsed');
  }
  syncCollapse();
}

/* ================================================================
   INICIO
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSidebarToggle();
  initSearch();
  loadData(); // carga asíncrona y construye el resto
});