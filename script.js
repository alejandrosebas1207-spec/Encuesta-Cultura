/* ================================================================
   CARGA DE DATOS DESDE GEOJSON
   ================================================================ */
const DATA_FILES = {
  espacios: 'data/Espacios_Culturales.geojson',
  infra: 'data/Infraestructura_Cultural.geojson',
  atractivos: 'data/Atractivo_Turistico.geojson',
  refsParroquias: 'data/refs_parroquias.geojson'
};

const PARROQUIAS_FILE = 'data/parroquias_dmq.geojson';
const PARROQUIAS_LOOKUP_FILE = 'data/parroquias_lookup.json';

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
let categoryState = {};      // clave: "layerKey::tipo" -> boolean
let labelsOn = false;
let map, baseSat, satRoads, satLabels;

// Parroquias: geometrías para dibujar y estado del filtro
let parroquiasGeo = null;       // FeatureCollection de parroquias (para dibujar)
let parroquiasLayer = null;     // L.geoJSON añadido al mapa
let parroquiaLookup = {};       // nombre -> parroquia (join espacial precalculado)
let parroquiaSel = '';          // parroquia seleccionada en el filtro ('' = todas)

// Funciones auxiliares
function resolveColor(v) {
  if (!v.startsWith('var(')) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(v.slice(4, -1)).trim();
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ================================================================
   PARROQUIAS: carga, asignación y capa en el mapa
   ================================================================ */
function loadParroquias() {
  return Promise.all([
    fetch(PARROQUIAS_FILE).then(r => r.json()),
    fetch(PARROQUIAS_LOOKUP_FILE).then(r => r.json())
  ]).then(([geo, lookup]) => {
    parroquiasGeo = geo;
    parroquiaLookup = lookup;
    return geo;
  });
}

function normalizeName(s) {
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Asigna la parroquia a cada punto usando el lookup precalculado (join por nombre)
function assignParroquias() {
  Object.values(LAYER_DEFS).forEach(layer => {
    const key = layer.key === 'espacios' ? 'Espacios_Culturales' :
                layer.key === 'infra' ? 'Infraestructura_Cultural' : 'Atractivo_Turistico';
    const table = parroquiaLookup[key] || {};
    layer.points.forEach(p => {
      const parr = table[normalizeName(p.nombre)];
      p.parroquia = parr && parr !== '__sin_parroquia__' ? parr : '';
    });
  });
}

// Dibuja los límites de parroquias sobre el mapa
function buildParroquiaLayer() {
  if (!parroquiasGeo || parroquiasLayer) return;

  const line = resolveColor('var(--parr-line)');
  const hover = resolveColor('var(--parr-line-hover)');
  const fill = resolveColor('var(--parr-fill)');

  parroquiasLayer = L.geoJSON(parroquiasGeo, {
    style: () => ({
      color: line,
      weight: 1.6,
      opacity: 0.85,
      fillColor: fill,
      fillOpacity: 0.06,
      interactive: true
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.dpa_despar;
      layer.on({
        click: () => {
          const sel = document.getElementById('parroquia-filter');
          if (sel) sel.value = name;
          setParroquia(name);
        },
        mouseover: () => {
          layer.setStyle({
            weight: 2.6,
            fillOpacity: 0.16,
            color: hover
          });
          layer.bringToFront();
        },
        mouseout: () => {
          if (name === parroquiaSel) {
            layer.setStyle({
              weight: 3.4,
              color: hover,
              fillColor: resolveColor('var(--parr-fill-active)'),
              fillOpacity: 0.22
            });
            layer.bringToFront();
          } else {
            parroquiasLayer.resetStyle(layer);
          }
        }
      });
      // Etiqueta al pasar el cursor (solo escritorio)
      if (window.matchMedia('(hover: hover)').matches) {
        layer.bindTooltip(name, { direction: 'center', className: 'parr-tip' });
      }
    }
  });
  parroquiasLayer.addTo(map);
}

// Construye el <select> con las parroquias que tienen al menos un punto
function buildParroquiaSelect() {
  const sel = document.getElementById('parroquia-filter');
  if (!sel) return;

  // Idempotente: quitar opciones previas (conserva la primera "Todas las parroquias")
  [...sel.querySelectorAll('option:not(:first-child)')].forEach(o => o.remove());

  const counts = {};
  allPoints.forEach(p => {
    const key = p.parroquia || '__sin__';
    counts[key] = (counts[key] || 0) + 1;
  });

  const options = Object.keys(counts)
    .filter(k => k !== '__sin__')
    .sort((a, b) => counts[b] - counts[a]) // de mayor a menor cantidad de sitios
    .map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)} (${counts[k]})</option>`);

  if (counts['__sin__']) {
    options.push(`<option value="__sin__">Sin parroquia (${counts['__sin__']})</option>`);
  }

  sel.insertAdjacentHTML('beforeend', options.join(''));

  sel.addEventListener('change', () => {
    setParroquia(sel.value === '__sin__' ? '__sin__' : sel.value);
  });
}

// Devuelve true si el punto pasa el filtro de parroquia
function passesParroquiaFilter(p) {
  if (!parroquiaSel) return true;
  const pkey = p.parroquia || '__sin__';
  return pkey === parroquiaSel;
}

// Aplica la selección de parroquia: resalta el polígono y filtra marcadores
function setParroquia(name) {
  parroquiaSel = name || '';
  const sel = document.getElementById('parroquia-filter');
  if (sel && sel.value !== parroquiaSel) sel.value = parroquiaSel;

  // Reconstruir chips según la parroquia activa (conteos locales)
  buildChips();

  if (parroquiasLayer) {
    parroquiasLayer.eachLayer(l => {
      const lname = l.feature.properties.dpa_despar;
      if (lname === parroquiaSel) {
        l.setStyle({
          weight: 3.4,
          color: resolveColor('var(--parr-line-active)'),
          fillColor: resolveColor('var(--parr-fill-active)'),
          fillOpacity: 0.22
        });
        l.bringToFront();
      } else {
        parroquiasLayer.resetStyle(l);
      }
    });
  }

  if (parroquiaSel) {
    const feat = parroquiasGeo.features.find(f => f.properties.dpa_despar === parroquiaSel);
    if (feat) map.fitBounds(L.geoJSON(feat).getBounds(), { padding: [60, 60], maxZoom: 15 });
  }
  localStorage.setItem('parroquiaSel', JSON.stringify(parroquiaSel));
  refreshMarkers();
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
    minZoom: 9,
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

  // Mapa base: imagen satelital de Esri World Imagery "Clarity" (imágenes más
  // recientes de Maxar, tiles públicos sin API key) + capas de calles y nombres
  baseSat = L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagery &copy; Esri (Clarity)',
    maxZoom: 20,
    maxNativeZoom: 19
  });
  // Esri publica capas de "Reference" hechas para superponerse sobre World_Imagery,
  // con halo blanco y buen contraste: una de vías y otra de límites/nombres de lugares.
  satRoads = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 19,
    className: 'sat-reference-layer'
  });
  satLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    maxNativeZoom: 19,
    attribution: 'Tiles &copy; Esri',
    className: 'sat-reference-layer'
  });
  baseSat.addTo(map);
  satRoads.addTo(map);
  satLabels.addTo(map);

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
    const [espacios, infra, atractivos, parroquiasPromise, sectors] = await Promise.all([
      fetch(DATA_FILES.espacios).then(r => r.json()),
      fetch(DATA_FILES.infra).then(r => r.json()),
      fetch(DATA_FILES.atractivos).then(r => r.json()),
      loadParroquias(),
      loadSectors()
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

    // Asignar parroquia a cada punto y preparar filtro y capa de límites
    assignParroquias();
    buildParroquiaLayer();
    buildParroquiaSelect();

    // Inicializar estado de categorías
    Object.keys(LAYER_DEFS).forEach(key => {
      Object.keys(LAYER_DEFS[key].cats).forEach(tipo => {
        categoryState[key + '::' + tipo] = true;
      });
    });

    // Construir chips de categorías
    buildChips();

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
   CONSTRUCCIÓN DE CHIPS DE CATEGORÍAS (filtro plano)
   ================================================================ */
// Conteo de una categoría según la parroquia activa (o global si no hay filtro)
function chipCount(layer, tipo) {
  if (!parroquiaSel) return layer.cats[tipo].count;
  let n = 0;
  layer.points.forEach(p => {
    if (p.tipo === tipo && (p.parroquia || '__sin__') === parroquiaSel) n++;
  });
  return n;
}

// Construye/actualiza los chips; si hay una parroquia activa, solo muestra
// las categorías con sitios en ella (con su conteo local)
function buildChips() {
  const root = document.getElementById('cats-root');
  root.innerHTML = '';

  Object.values(LAYER_DEFS).forEach(layer => {
    Object.entries(layer.cats)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([tipo, meta]) => {
        const local = chipCount(layer, tipo);
        if (parroquiaSel && local === 0) return; // ocultar si no hay sitios en la parroquia
        const sk = layer.key + '::' + tipo;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip' + (categoryState[sk] ? ' checked' : '');
        chip.dataset.sk = sk;
        chip.style.setProperty('--chip-color', meta.hex);
        chip.setAttribute('role', 'switch');
        chip.setAttribute('aria-checked', String(!!categoryState[sk]));
        chip.innerHTML = `
          <span class="chip-shape" aria-hidden="true">${shapeIconHtml(layer.shape, meta.hex, 11)}</span>
          <span class="chip-label">${meta.label}</span>
          <span class="chip-count">${local}</span>
        `;
        chip.addEventListener('click', () => {
          categoryState[sk] = !categoryState[sk];
          chip.classList.toggle('checked', categoryState[sk]);
          chip.setAttribute('aria-checked', String(categoryState[sk]));
          localStorage.setItem('catState_' + sk, JSON.stringify(categoryState[sk]));
          refreshMarkers();
        });
        root.appendChild(chip);
      });
  });
}

// Marcar/desmarcar todos los chips
function setAllChips(on) {
  Object.keys(categoryState).forEach(sk => {
    categoryState[sk] = on;
    localStorage.setItem('catState_' + sk, JSON.stringify(on));
  });
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('checked', on);
    chip.setAttribute('aria-checked', String(on));
  });
  refreshMarkers();
}

function initChipActions() {
  const allBtn = document.getElementById('btn-all-chips');
  const noneBtn = document.getElementById('btn-none-chips');
  if (allBtn) allBtn.addEventListener('click', () => setAllChips(true));
  if (noneBtn) noneBtn.addEventListener('click', () => setAllChips(false));
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
        ${p.parroquia ? `<div class="pop-parr">📍 ${escapeHtml(p.parroquia)}</div>` : ''}
        <div class="pop-coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
        <div class="pop-link-row">
          <a href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank" class="pop-link">Abrir en Google Maps →</a>
          <button class="pop-copy" data-copy="${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}">Copiar coords</button>
        </div>
      `, { closeButton: true, maxWidth: 260 });
      markerIndex.push({ p, marker, layer, tooltipOpen: false, visible: false });
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

// ===== Sectores de referencia: un punto por parroquia =====
const SECTOR_LABEL_ZOOM = 12;
let sectorsOn = true;
let sectorLayer = null;
let sectorItems = []; // { marker, name, tooltipOpen }

// Convierte "TURUBAMBA" → "Turubamba" para la etiqueta
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
}

async function loadSectors() {
  try {
    const data = await fetch(DATA_FILES.refsParroquias).then(r => r.json());
    sectorItems = [];
    sectorLayer = L.geoJSON(data, {
      pointToLayer: (feature, latlng) => {
        const p = feature.properties || {};
        const icon = L.divIcon({
          html: '<span class="sec-dot"></span>',
          className: 'sec-icon',
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        const marker = L.marker(latlng, { icon, keyboard: false });
        const placeName = titleCase(p.n || '');
        const labelName = placeName.toLowerCase().startsWith('centro de ') ? titleCase(p.p) : placeName;
        marker.bindPopup(`
          <div class="pop-eyebrow">Sector de referencia</div>
          <div class="pop-name">${escapeHtml(placeName)}</div>
          <div class="pop-parr">Parroquia ${escapeHtml(titleCase(p.p || ''))}</div>
          <div class="pop-coords">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</div>
        `, { closeButton: true, maxWidth: 250 });
        sectorItems.push({ marker, name: labelName, tooltipOpen: false });
        return marker;
      }
    });
    if (sectorsOn) sectorLayer.addTo(map);
  } catch (e) {
    console.warn('No se pudieron cargar los sectores de referencia:', e);
  }
}

function setSectors(on) {
  sectorsOn = on;
  try { localStorage.setItem('sectorsOn', JSON.stringify(on)); } catch (e) {}
  if (sectorLayer) {
    if (on) sectorLayer.addTo(map);
    else map.removeLayer(sectorLayer);
  }
}

function initSectors() {
  const chk = document.getElementById('sector-toggle');
  if (!chk) return;
  chk.checked = sectorsOn;
  chk.addEventListener('change', () => setSectors(chk.checked));
}

// Etiquetas de sectores según zoom (independiente de los filtros)
function updateSectorLabels(zoom) {
  if (!sectorItems.length) return;
  const show = zoom >= SECTOR_LABEL_ZOOM;
  sectorItems.forEach(item => {
    if (show && !item.tooltipOpen) {
      item.marker.bindTooltip(item.name, {
        permanent: true,
        direction: 'right',
        offset: [8, 0],
        className: 'sec-tip'
      });
      item.tooltipOpen = true;
    } else if (!show && item.tooltipOpen) {
      item.marker.unbindTooltip();
      item.tooltipOpen = false;
    }
  });
}

/* ================================================================
   REFRESCAR MARCADORES (aplicar filtros)
   ================================================================ */
function refreshMarkers() {
  Object.values(LAYER_DEFS).forEach(layer => {
    const toAdd = [];
    const toRemove = [];
    markerIndex.forEach(item => {
      if (item.layer !== layer) return;
      const visible = categoryState[layer.key + '::' + item.p.tipo] && passesParroquiaFilter(item.p);
      if (visible && !item.visible) toAdd.push(item.marker);
      else if (!visible && item.visible) toRemove.push(item.marker);
      item.visible = visible;
    });
    if (toRemove.length) layer.cluster.removeLayers(toRemove);
    if (toAdd.length) layer.cluster.addLayers(toAdd);
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
    const active = categoryState[sk] && passesParroquiaFilter(item.p);
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
  updateSectorLabels(zoom);
}

/* ================================================================
   ACTUALIZAR CONTADOR VISIBLE
   ================================================================ */
function updateVisibleCount() {
  let visible = 0;
  markerIndex.forEach(item => {
    const sk = item.layer.key + '::' + item.p.tipo;
    if (categoryState[sk] && passesParroquiaFilter(item.p)) visible++;
  });
  document.getElementById('stats-visible').textContent = visible.toLocaleString('es-EC');
}

/* ================================================================
   PERSISTENCIA (localStorage)
   ================================================================ */
function restoreState() {
  // Restaurar categorías
  Object.keys(categoryState).forEach(sk => {
    const saved = localStorage.getItem('catState_' + sk);
    if (saved !== null) {
      categoryState[sk] = JSON.parse(saved);
      const chip = document.querySelector(`.chip[data-sk="${sk}"]`);
      if (chip) {
        chip.classList.toggle('checked', categoryState[sk]);
        chip.setAttribute('aria-checked', String(categoryState[sk]));
      }
    }
  });

  // Restaurar parroquia seleccionada
  const parrSaved = localStorage.getItem('parroquiaSel');
  if (parrSaved !== null) {
    parroquiaSel = JSON.parse(parrSaved);
    if (parroquiaSel) setParroquia(parroquiaSel);
  }

  // Restaurar toggle etiquetas
  const labelsSaved = localStorage.getItem('labelsOn');
  if (labelsSaved !== null) {
    labelsOn = JSON.parse(labelsSaved);
    document.getElementById('toggle-labels').checked = labelsOn;
  } else {
    labelsOn = false;
  }

  // Restaurar sectores de referencia (por defecto activos)
  const sectorsSaved = localStorage.getItem('sectorsOn');
  if (sectorsSaved !== null) {
    sectorsOn = JSON.parse(sectorsSaved);
    const sectorChk = document.getElementById('sector-toggle');
    if (sectorChk) sectorChk.checked = sectorsOn;
  }

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
            // En móvil, cerrar la hoja inferior para que el mapa quede visible
            if (window.innerWidth <= 760) {
              const sidebar = document.getElementById('sidebar');
              if (!sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
                const btn = document.getElementById('sb-toggle');
                if (btn) btn.setAttribute('aria-expanded', 'false');
                document.getElementById('backdrop').classList.remove('show');
                setTimeout(() => map.invalidateSize(), 340);
              }
            }
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
   TEMA (modo oscuro)
   ================================================================ */
// ¿Modo oscuro activo? Preferencia guardada > sistema > claro por defecto
function getDarkMode() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Aplica el tema en el DOM (clases .dark / .light sobre <html>)
function applyTheme(dark) {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  // Actualizar color de la barra del navegador
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#111113' : '#F7F7F8');
}

function initTheme() {
  const chk = document.getElementById('toggle-theme');
  if (!chk) return;

  const dark = getDarkMode();
  chk.checked = dark;
  applyTheme(dark);

  chk.addEventListener('change', () => {
    localStorage.setItem('theme', chk.checked ? 'dark' : 'light');
    applyTheme(chk.checked);
  });

  // Seguir el cambio del sistema solo si el usuario no eligió manualmente
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    const saved = localStorage.getItem('theme');
    if (saved !== 'dark' && saved !== 'light') {
      chk.checked = mq.matches;
      applyTheme(mq.matches);
    }
  };
  mq.addEventListener ? mq.addEventListener('change', onSystemChange) : mq.addListener(onSystemChange);
}

/* ================================================================
   INICIO
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSidebarToggle();
  initSearch();
  initChipActions();
  initTheme();
  initSectors();
  loadData(); // carga asíncrona y construye el resto
});