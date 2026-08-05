/* ================================================================
   CARGA DE DATOS DESDE GEOJSON
   ================================================================ */
const DATA_FILES = {
  espacios: 'data/Espacios_Culturales.geojson',
  infra: 'data/Infraestructura_Cultural.geojson',
  atractivos: 'data/Atractivo_Turistico.geojson',
  refsParroquias: 'data/refs_parroquias.geojson',
  nacional: 'data/Infraestructura_Nacional.geojson'
};

const PARROQUIAS_FILE = 'data/parroquias_dmq.geojson';
const PARROQUIAS_LOOKUP_FILE = 'data/parroquias_lookup.json';
const PROVINCIAS_FILE = 'data/provincias_ec.geojson';

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
  },
  nacional: {
    key: 'nacional',
    title: 'Infraestructura cultural nacional',
    shape: 'diamond',
    propNombre: 'nombre',
    propTipo: 'categoria',
    propProvincia: 'provincia',
    propCanton: 'canton',
    cats: {
      "Espacios Escénicos":     { label: "Espacios escénicos",      color: "var(--c-escenico)" },
      "Museos":                 { label: "Museos",                  color: "var(--c-museos)" },
      "Bibliotecas":            { label: "Bibliotecas",             color: "var(--c-editorial)" },
      "Archivos Históricos":    { label: "Archivos históricos",     color: "var(--c-inf-sec)" },
      "Espacios Audiovisuales": { label: "Espacios audiovisuales",  color: "var(--c-audiovisual)" }
    },
    defaultOpen: true
  }
};

// Estado global
let allPoints = [];
let markerIndex = [];
let categoryState = {};      // clave: "layerKey::tipo" -> boolean
let labelsOn = true; // etiquetas visibles por defecto (es un mapa de campo: los nombres deben leerse sin tocar)
let map, baseProviders, baseLayer = null, baseTheme = 'light', baseIdx = 0, baseFails = 0, baseFailTimer = null;
let userLoc = null; // última ubicación conocida del encuestador

// ---- Registro de avance de campo ----
let donePlaces = {};   // clave de punto -> ISO de cuándo se marcó encuestado
let onlyPending = false;
let touchMode = false; // pines más grandes en pantallas táctiles
let keyIndex = new Map(); // clave -> item (para toggles de encuestado)

// Clave única del punto (nombre normalizado + coordenadas + capa)
function doneKey(p) {
  return p.layer + '::' + p.tipo + '::' + normalizeName(p.nombre) + '::' + p.lat.toFixed(4) + ',' + p.lon.toFixed(4);
}
function isDone(p) { return !!donePlaces[doneKey(p)]; }
function passesPendingFilter(p) { return !onlyPending || !isDone(p); }

// Distancia en km entre dos coordenadas (fórmula de Haversine)
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// Parroquias: geometrías para dibujar y estado del filtro
let parroquiasGeo = null;       // FeatureCollection de parroquias (para dibujar)
let parroquiasLayer = null;     // L.geoJSON añadido al mapa
let parroquiaLookup = {};       // nombre -> parroquia (join espacial precalculado)
let parroquiaSel = '';          // parroquia seleccionada en el filtro ('' = todas)

// Provincias (vista nacional) y selector de vista
let view = 'quito';             // 'quito' | 'nacional'
let provinciasGeo = null;       // FeatureCollection de provincias (para dibujar)
let provinciasLayer = null;     // L.geoJSON de provincias añadido al mapa
let provinciaSel = '';          // provincia seleccionada ('' = todas)

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
    if (layer.key === 'nacional') return; // la capa nacional trae provincia/cantón directos
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

  // En escritorio (hay hover) los polígonos reaccionan al cursor; en móvil/táctil NO:
  // un toque "fallido" en el mapa caería sobre el polígono y haría saltar el mapa
  const hasHover = window.matchMedia('(hover: hover)').matches;

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
      interactive: hasHover
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.dpa_despar;
      if (!hasHover) return; // en móvil: solo dibujar límites, sin clics que salten el mapa
      // IMPORTANTE: el polígono NO filtra al hacer clic. La parroquia solo
      // se elige desde el panel lateral (evita filtros accidentales)
      layer.on({
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

// Capas activas según la vista (Quito: 3 capas locales; Nacional: la capa de país)
function activeLayers() {
  if (view === 'nacional') return [LAYER_DEFS.nacional];
  return [LAYER_DEFS.espacios, LAYER_DEFS.infra, LAYER_DEFS.atractivos];
}
function isLayerActive(layer) {
  return view === 'nacional' ? layer.key === 'nacional' : layer.key !== 'nacional';
}

// Total de puntos de las capas activas (para el contador del panel)
function totalActive() {
  let n = 0;
  activeLayers().forEach(layer => { n += (layer.points ? layer.points.length : 0); });
  return n;
}

// Construye los <select>: parroquias (vista Quito) y provincias (vista Nacional)
function buildZoneSelects() {
  const selPar = document.getElementById('parroquia-filter');
  const selProv = document.getElementById('provincia-filter');

  // Parroquias: solo puntos locales (la capa nacional trae provincia propia)
  if (selPar) {
    [...selPar.querySelectorAll('option:not(:first-child)')].forEach(o => o.remove());
    const counts = {};
    allPoints.forEach(p => {
      if (p.layer === 'nacional') return;
      const key = p.parroquia || '__sin__';
      counts[key] = (counts[key] || 0) + 1;
    });
    const options = Object.keys(counts)
      .filter(k => k !== '__sin__')
      .sort((a, b) => counts[b] - counts[a])
      .map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)} (${counts[k]})</option>`);
    if (counts['__sin__']) {
      options.push(`<option value="__sin__">Sin parroquia (${counts['__sin__']})</option>`);
    }
    selPar.insertAdjacentHTML('beforeend', options.join(''));
    selPar.addEventListener('change', () => {
      setParroquia(selPar.value === '__sin__' ? '__sin__' : selPar.value);
      if (window.innerWidth <= 760) collapseSidebar();
    });
  }

  // Provincias: de la capa nacional
  if (selProv) {
    [...selProv.querySelectorAll('option:not(:first-child)')].forEach(o => o.remove());
    const counts = {};
    allPoints.forEach(p => {
      if (p.layer !== 'nacional') return;
      const key = p.provincia || '__sin__';
      counts[key] = (counts[key] || 0) + 1;
    });
    const options = Object.keys(counts)
      .filter(k => k !== '__sin__')
      .sort((a, b) => counts[b] - counts[a])
      .map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)} (${counts[k]})</option>`);
    selProv.insertAdjacentHTML('beforeend', options.join(''));
    selProv.addEventListener('change', () => {
      setProvincia(selProv.value === '__sin__' ? '__sin__' : selProv.value);
      if (window.innerWidth <= 760) collapseSidebar();
    });
  }
}

// Devuelve true si el punto pasa el filtro de su zona (parroquia o provincia)
function passesZoneFilter(p) {
  if (p.layer === 'nacional') {
    if (!provinciaSel) return true;
    return (p.provincia || '__sin__') === provinciaSel;
  }
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

// Aplica la selección de provincia (vista Nacional): resalta el polígono y filtra
function setProvincia(name) {
  provinciaSel = name || '';
  const sel = document.getElementById('provincia-filter');
  if (sel && sel.value !== provinciaSel) sel.value = provinciaSel;

  buildChips();

  if (provinciasLayer) {
    provinciasLayer.eachLayer(l => {
      const lname = l.feature.properties.name;
      if (lname === provinciaSel) {
        l.setStyle({
          weight: 3.4,
          color: resolveColor('var(--prov-line-active)'),
          fillColor: resolveColor('var(--prov-fill-active)'),
          fillOpacity: 0.22
        });
        l.bringToFront();
      } else {
        provinciasLayer.resetStyle(l);
      }
    });
  }

  if (provinciaSel) {
    const feat = provinciasGeo.features.find(f => f.properties.name === provinciaSel);
    if (feat) map.fitBounds(L.geoJSON(feat).getBounds(), { padding: [60, 60], maxZoom: 10 });
  }
  localStorage.setItem('provinciaSel', JSON.stringify(provinciaSel));
  refreshMarkers();
}

// Dibuja los límites de provincias (vista Nacional), sin clics que filtren
function buildProvinciasLayer() {
  if (!provinciasGeo || provinciasLayer) return;
  const hasHover = window.matchMedia('(hover: hover)').matches;
  const line = resolveColor('var(--prov-line)');
  const hover = resolveColor('var(--prov-line-hover)');
  const fill = resolveColor('var(--prov-fill)');

  provinciasLayer = L.geoJSON(provinciasGeo, {
    style: () => ({
      color: line,
      weight: 1.8,
      opacity: 0.85,
      fillColor: fill,
      fillOpacity: 0.05,
      interactive: hasHover
    }),
    onEachFeature: (feature, layer) => {
      const name = feature.properties.name;
      if (!hasHover) return;
      layer.on({
        mouseover: () => {
          layer.setStyle({ weight: 2.8, fillOpacity: 0.18, color: hover });
          layer.bringToFront();
        },
        mouseout: () => {
          if (name === provinciaSel) {
            layer.setStyle({
              weight: 3.4,
              color: resolveColor('var(--prov-line-active)'),
              fillColor: resolveColor('var(--prov-fill-active)'),
              fillOpacity: 0.22
            });
            layer.bringToFront();
          } else {
            provinciasLayer.resetStyle(layer);
          }
        }
      });
      if (window.matchMedia('(hover: hover)').matches) {
        layer.bindTooltip(name, { direction: 'center', className: 'parr-tip' });
      }
    }
  });
  provinciasLayer.addTo(map);
}

/* ================================================================
   CAMBIO DE VISTA (Quito ↔ Ecuador)
   ================================================================ */
function setView(v) {
  view = v === 'nacional' ? 'nacional' : 'quito';
  localStorage.setItem('view', JSON.stringify(view));

  // Botones del selector
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Subtítulo según vista
  const sub = document.getElementById('view-subtitle');
  if (sub) sub.textContent = view === 'nacional' ? 'Mapa de campo · Ecuador' : 'Mapa de campo · Quito';

  // Separar el filtro de zona según la vista
  const secPar = document.getElementById('sec-parroquia');
  const secProv = document.getElementById('sec-provincia');
  if (secPar) secPar.hidden = view === 'nacional';
  if (secProv) secProv.hidden = view !== 'nacional';

  // Mostrar/ocultar capas según vista
  Object.values(LAYER_DEFS).forEach(layer => {
    if (!layer.cluster) return;
    if (isLayerActive(layer)) {
      if (!map.hasLayer(layer.cluster)) map.addLayer(layer.cluster);
    } else if (map.hasLayer(layer.cluster)) {
      map.removeLayer(layer.cluster);
    }
  });

  // Límites de provincias solo en la vista nacional
  if (provinciasLayer) {
    if (view === 'nacional') { if (!map.hasLayer(provinciasLayer)) map.addLayer(provinciasLayer); }
    else if (map.hasLayer(provinciasLayer)) map.removeLayer(provinciasLayer);
  }

  // Sectores de referencia solo aplican en Quito (parroquias)
  if (sectorLayer) {
    if (view === 'nacional') { if (map.hasLayer(sectorLayer)) map.removeLayer(sectorLayer); }
    else if (sectorsOn && !map.hasLayer(sectorLayer)) map.addLayer(sectorLayer);
  }

  // Rebobinar la cámara al cambiar de vista
  map.setMinZoom(view === 'nacional' ? 6 : 9);
  if (view === 'nacional' && provinciasGeo) {
    map.fitBounds(L.geoJSON(provinciasGeo).getBounds(), { padding: [20, 20] });
  } else if (view === 'quito') {
    map.setView([-0.19, -78.49], 12);
  }

  buildChips();
  refreshMarkers();
  const tot = document.getElementById('stats-total-num');
  if (tot) tot.textContent = totalActive().toLocaleString('es-EC');
  setTimeout(() => map.invalidateSize(), 350);
}

function initViewSwitch() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
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
    zoomSnap: 1,             // solo zooms enteros: los tiles nunca se estiran ni se ven borrosos
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

  // Mapa base: lista de proveedores (calles coloreadas con nombres, livianos,
  // sin API key). Si uno falla, el mapa cambia solo al siguiente (fallback).
  // Orden: Carto (CDN rápido en LATAM, z19 completo) → OSM Standard → Esri.
  baseProviders = {
    light: [
      { name: 'carto', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' },
      { name: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
      { name: 'esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', subdomains: '', attribution: 'Tiles &copy; Esri', nativeZoom: 17 }
    ],
    dark: [
      { name: 'carto', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' },
      { name: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }
    ]
  };
  setBaseTheme(getDarkMode());

  // Geolocalización
  document.getElementById('locate-btn').addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 16 });
  });
  map.on('locationfound', (e) => {
    userLoc = e.latlng;
    const accent = resolveColor('var(--gold)');
    L.circleMarker(e.latlng, { radius: 6, color: accent, fillColor: accent, fillOpacity: 0.8 })
      .addTo(map)
      .bindPopup('¡Estás aquí!');
  });
  map.on('locationerror', () => {
    alert('No se pudo obtener tu ubicación. Asegúrate de dar permisos de geolocalización.');
  });

  // Botón "Copiar coords" y distancia "a X km" dentro de los popups
  map.on('popupopen', () => {
    // Distancia desde la ubicación del encuestador (si ya la obtuvo)
    const distEl = document.querySelector('.leaflet-popup .pop-dist');
    if (distEl && userLoc) {
      const d = distKm(userLoc.lat, userLoc.lng, parseFloat(distEl.dataset.lat), parseFloat(distEl.dataset.lon));
      distEl.textContent = d < 1
        ? `📍 A ${Math.round(d * 1000)} m de ti`
        : `📍 A ${d.toFixed(1)} km de ti`;
    }
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

    // Botón "✓ Marcar encuestado" del popup
    const doneBtn = document.querySelector('.leaflet-popup .pop-done');
    if (doneBtn) {
      const key = doneBtn.dataset.dk;
      syncDoneBtn(doneBtn, keyIndex.get(key)?.p);
      if (!doneBtn.dataset.bound) {
        doneBtn.dataset.bound = '1';
        doneBtn.addEventListener('click', () => toggleDone(key));
      }
    }
  });

  // Al hacer zoom o mover el mapa, actualizar etiquetas (con debounce:
  // en pinch-zoom en móvil "zoomend" puede dispararse muy seguido)
  let labelUpdateTimer = null;
  map.on('zoomend', () => {
    clearTimeout(labelUpdateTimer);
    labelUpdateTimer = setTimeout(updateLabels, 80);
  });
  map.on('moveend', () => {
    clearTimeout(labelUpdateTimer);
    labelUpdateTimer = setTimeout(updateLabels, 200);
  });
}

/* ================================================================
   CARGA DE DATOS DESDE GEOJSON
   ================================================================ */
async function loadData() {
  const loadingEl = document.getElementById('loading');
  try {
    const [espacios, infra, atractivos, parroquiasPromise, sectors, nacionalGeo, provinciasGeoFile] = await Promise.all([
      fetch(DATA_FILES.espacios).then(r => r.json()),
      fetch(DATA_FILES.infra).then(r => r.json()),
      fetch(DATA_FILES.atractivos).then(r => r.json()),
      loadParroquias(),
      loadSectors(),
      fetch(DATA_FILES.nacional).then(r => r.json()),
      fetch(PROVINCIAS_FILE).then(r => r.json())
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
        const p = {
          nombre: nombre,
          tipo: tipo,
          lat: coords[1],
          lon: coords[0],
          layer: layerKey
        };
        if (layerDef.propProvincia && props[layerDef.propProvincia]) p.provincia = props[layerDef.propProvincia];
        if (layerDef.propCanton && props[layerDef.propCanton]) p.canton = props[layerDef.propCanton];
        points.push(p);
      });
      return points;
    }

    // Asignar puntos a cada capa
    LAYER_DEFS.espacios.points = processGeoJSON(espacios, 'espacios');
    LAYER_DEFS.infra.points = processGeoJSON(infra, 'infra');
    LAYER_DEFS.atractivos.points = processGeoJSON(atractivos, 'atractivos');
    LAYER_DEFS.nacional.points = processGeoJSON(nacionalGeo, 'nacional');
    provinciasGeo = provinciasGeoFile;

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
        // Umbral de zoom para etiquetas: bajos a propósito, el mapa es
        // referencial para encuestadores y debe leerse sin tocar cada punto
        const c = layer.cats[k].count;
        layer.cats[k].labelZoom = c > 200 ? 14 : c > 90 ? 13 : c > 40 ? 12 : c > 10 ? 11 : 10;
      });
      layer.total = layer.points.length;
    });

    // Acumular todos los puntos para búsqueda
    allPoints = [];
    Object.values(LAYER_DEFS).forEach(layer => {
      allPoints = allPoints.concat(layer.points);
    });

    // Asignar parroquia a cada punto y preparar filtros y capas de límites
    assignParroquias();
    buildParroquiaLayer();
    buildProvinciasLayer();
    buildZoneSelects();

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
    document.getElementById('stats-total-num').textContent = totalActive().toLocaleString('es-EC');
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
// Conteo de una categoría según la zona activa (parroquia en Quito, provincia en Ecuador)
function chipCount(layer, tipo) {
  const zoneSel = layer.key === 'nacional' ? provinciaSel : parroquiaSel;
  if (!zoneSel) return layer.cats[tipo].count;
  let n = 0;
  layer.points.forEach(p => {
    const z = layer.key === 'nacional' ? (p.provincia || '__sin__') : (p.parroquia || '__sin__');
    if (p.tipo === tipo && z === zoneSel) n++;
  });
  return n;
}

// Construye/actualiza los chips; si hay una zona activa, solo muestra
// las categorías con sitios en ella (con su conteo local)
function buildChips() {
  const root = document.getElementById('cats-root');
  root.innerHTML = '';

  activeLayers().forEach(layer => {
    Object.entries(layer.cats)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([tipo, meta]) => {
        const local = chipCount(layer, tipo);
        const zoneSel = layer.key === 'nacional' ? provinciaSel : parroquiaSel;
        if (zoneSel && local === 0) return; // ocultar si no hay sitios en la zona
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
      maxClusterRadius: 90,
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      chunkInterval: 60,     // carga los puntos por tandas: arranque rápido en móvil
      chunkDelay: 30,
      animate: false,
      animateAddingMarkers: false,
      spiderfyDistanceMultiplier: 1.2, // spiderfy más compacto: menos desplazamiento en pantallas chicas
      iconCreateFunction: makeClusterIconFn(layer.key)
    });

    // Crear marcadores (popups a demanda: bindear 400+ popups al inicio
    // hace lenta la carga en móviles; se arma solo al tocar el punto)
    touchMode = window.matchMedia('(pointer: coarse)').matches;
    try { donePlaces = JSON.parse(localStorage.getItem('donePlaces') || '{}'); } catch (e) { donePlaces = {}; }
    layer.points.forEach(p => {
      const meta = layer.cats[p.tipo];
      if (!meta) return; // seguridad
      const marker = L.marker([p.lat, p.lon], { icon: makePointIcon(layer, p) });
      marker.on('click', () => {
        if (!marker.isPopupOpen()) {
          marker.bindPopup(`
            <div class="pop-eyebrow">${layer.title}</div>
            <div class="pop-cat">${shapeIconHtml(layer.shape, meta.hex, 9)} ${meta.label}</div>
            <div class="pop-name">${escapeHtml(p.nombre)}</div>
            ${p.parroquia ? `<div class="pop-parr">📍 ${escapeHtml(p.parroquia)}</div>` : ''}
            ${p.provincia ? `<div class="pop-parr">🗺️ ${escapeHtml(p.provincia)}</div>` : ''}
            <div class="pop-coords">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
            <div class="pop-dist" data-lat="${p.lat}" data-lon="${p.lon}"></div>
            <div class="pop-link-row">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener" class="pop-link">🧭 Cómo llegar →</a>
              <button class="pop-copy" data-copy="${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}">Copiar coords</button>
            </div>
            <button class="pop-done" data-dk="${doneKey(p)}">✓ Marcar encuestado</button>
          `, { closeButton: true, maxWidth: 260 }).openPopup();
        }
      });
      const item = { p, marker, layer, tooltipOpen: false, visible: false };
      markerIndex.push(item);
      keyIndex.set(doneKey(p), item);
    });

    if (isLayerActive(layer)) map.addLayer(layer.cluster);
  });
}

// Icono de un punto (se reutiliza al marcar encuestado: un solo setIcon, costo mínimo)
function makePointIcon(layer, p) {
  const meta = layer.cats[p.tipo];
  const shape = layer.shape;
  const size = shape === 'pin' ? (touchMode ? 34 : 24) : (touchMode ? 26 : 16);
  return L.divIcon({
    html: `<div class="mk-wrap mk-${shape}" style="--mk-color:${meta.hex}">` +
      (isDone(p) ? '<span class="mk-done">✓</span>' : '') +
      `<span class="mk-shape"></span></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, shape === 'pin' ? size : size / 2]
  });
}

// Función para icono de clúster por capa
function makeClusterIconFn(layerKey) {
  const hex = {
    espacios: resolveColor('var(--gold)'),
    infra: resolveColor('var(--c-inf-lit)'),
    atractivos: resolveColor('var(--c-atr-cult)'),
    nacional: resolveColor('var(--c-escenico)')
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
const SECTOR_LABEL_ZOOM = 10; // los nombres de los sectores se ven desde el primer acercamiento
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
          html: '<svg width="16" height="22" viewBox="0 0 16 22" xmlns="http://www.w3.org/2000/svg"><path class="sec-pin" d="M8 1C4.4 1 1.5 3.9 1.5 7.5c0 5 6.5 13.5 6.5 13.5s6.5-8.5 6.5-13.5C14.5 3.9 11.6 1 8 1z"/><circle class="sec-pin-dot" cx="8" cy="7.5" r="2.6"/></svg>',
          className: 'sec-icon',
          iconSize: [16, 22],
          iconAnchor: [8, 21]
        });
        const marker = L.marker(latlng, { icon, keyboard: false });
        const placeName = titleCase(p.n || '');
        const labelName = placeName.toLowerCase().startsWith('centro de ') ? titleCase(p.p) : placeName;
        marker.bindPopup(`
          <div class="pop-eyebrow">Sector de referencia</div>
          <div class="pop-name">${escapeHtml(placeName)}</div>
          <div class="pop-parr">Parroquia ${escapeHtml(titleCase(p.p || ''))}</div>
          <div class="pop-coords">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</div>
          <div class="pop-dist" data-lat="${latlng.lat}" data-lon="${latlng.lng}"></div>
          <div class="pop-link-row">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${latlng.lat},${latlng.lng}" target="_blank" rel="noopener" class="pop-link">🧭 Cómo llegar →</a>
          </div>
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
  activeLayers().forEach(layer => {
    const toAdd = [];
    const toRemove = [];
    markerIndex.forEach(item => {
      if (item.layer !== layer) return;
      const visible = categoryState[layer.key + '::' + item.p.tipo] && passesZoneFilter(item.p) && passesPendingFilter(item.p);
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
  const bounds = map.getBounds(); // solo etiquetar lo que está en pantalla
  markerIndex.forEach(item => {
    if (!isLayerActive(item.layer)) return;
    const sk = item.layer.key + '::' + item.p.tipo;
    const meta = item.layer.cats[item.p.tipo];
    const active = categoryState[sk] && passesZoneFilter(item.p) && passesPendingFilter(item.p);
    // Si el marcador está agrupado en un clúster o fuera de pantalla no se ve:
    // no gastar recursos en su etiqueta (se arma al desagruparse / al mover)
    const clustered = item.marker._parent && item.marker._parent !== item.layer.cluster;
    const onScreen = bounds.contains([item.p.lat, item.p.lon]);
    const shouldLabel = active && labelsOn && !clustered && onScreen && zoom >= meta.labelZoom;
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
    if (!isLayerActive(item.layer)) return;
    const sk = item.layer.key + '::' + item.p.tipo;
    if (categoryState[sk] && passesZoneFilter(item.p) && passesPendingFilter(item.p)) visible++;
  });
  document.getElementById('stats-visible').textContent = visible.toLocaleString('es-EC');
}

/* ================================================================
   REGISTRO DE AVANCE DE CAMPO
   ================================================================ */
// Marca/desmarca un punto como encuestado y guarda todo en localStorage
function toggleDone(key) {
  const item = keyIndex.get(key);
  if (!item) return;
  if (donePlaces[key]) delete donePlaces[key];
  else donePlaces[key] = new Date().toISOString();
  try { localStorage.setItem('donePlaces', JSON.stringify(donePlaces)); } catch (e) {}
  // Badge ✓ en el marcador (un solo setIcon, costo mínimo)
  item.marker.setIcon(makePointIcon(item.layer, item.p));
  updateProgress();
  if (onlyPending) {
    // No esconder el punto en el momento: al quitarlo del clúster Leaflet cierra
    // el popup y perderías la oportunidad de desmarcarlo. Se oculta al cerrar.
    if (item.marker.isPopupOpen()) {
      item.marker.once('popupclose', () => refreshMarkers());
    } else {
      refreshMarkers();
    }
  }
  const btn = document.querySelector('.leaflet-popup .pop-done');
  if (btn && btn.dataset.dk === key) syncDoneBtn(btn, item.p);
}

function syncDoneBtn(btn, p) {
  if (!btn || !p) return;
  if (isDone(p)) {
    btn.classList.add('done');
    btn.textContent = '✓ Encuestado · desmarcar';
  } else {
    btn.classList.remove('done');
    btn.textContent = '✓ Marcar encuestado';
  }
}

// Barra de progreso del panel
function updateProgress() {
  const total = totalActive();
  const done = Object.keys(donePlaces).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const track = document.getElementById('progress-track');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${done} de ${total} encuestados`;
  if (track) {
    track.setAttribute('aria-valuenow', String(done));
    track.setAttribute('aria-valuemax', String(total));
    track.setAttribute('aria-valuetext', pct + '%');
  }
}

function initProgressUI() {
  const pendBtn = document.getElementById('pending-toggle');
  if (pendBtn) {
    pendBtn.addEventListener('click', () => {
      onlyPending = !onlyPending;
      pendBtn.classList.toggle('active', onlyPending);
      pendBtn.setAttribute('aria-pressed', String(onlyPending));
      try { localStorage.setItem('onlyPending', JSON.stringify(onlyPending)); } catch (e) {}
      refreshMarkers();
    });
  }
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

  // Restaurar vista (Quito / Ecuador) y provincia
  const viewSaved = localStorage.getItem('view');
  if (viewSaved !== null && JSON.parse(viewSaved) === 'nacional') {
    setView('nacional');
  }
  const provSaved = localStorage.getItem('provinciaSel');
  if (provSaved !== null) {
    provinciaSel = JSON.parse(provSaved);
    if (provinciaSel) setProvincia(provinciaSel);
  }

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
    labelsOn = true; // por defecto los nombres se ven en el mapa
    const chk = document.getElementById('toggle-labels');
    if (chk) chk.checked = true;
  }

  // Restaurar sectores de referencia (por defecto activos)
  const sectorsSaved = localStorage.getItem('sectorsOn');
  if (sectorsSaved !== null) {
    sectorsOn = JSON.parse(sectorsSaved);
    const sectorChk = document.getElementById('sector-toggle');
    if (sectorChk) sectorChk.checked = sectorsOn;
  }

  // Restaurar "solo pendientes" del registro de avance
  const pendSaved = localStorage.getItem('onlyPending');
  if (pendSaved !== null) {
    onlyPending = JSON.parse(pendSaved);
    const pendBtn = document.getElementById('pending-toggle');
    if (pendBtn) {
      pendBtn.classList.toggle('active', onlyPending);
      pendBtn.setAttribute('aria-pressed', String(onlyPending));
    }
  }

  // Barra de avance
  updateProgress();

  // Aplicar cambios a marcadores
  refreshMarkers();
}

/* ================================================================
   COLAPSAR SIDEBAR
   ================================================================ */
// Cierra el panel lateral (filtro de parroquia y ubicación en móvil)
function collapseSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || sidebar.classList.contains('collapsed')) return;
  sidebar.classList.add('collapsed');
  const btn = document.getElementById('sb-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.remove('show');
  setTimeout(() => map.invalidateSize(), 340);
}

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

  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    syncCollapse();
    setTimeout(() => map.invalidateSize(), 340);
  }

  btn.addEventListener('click', toggleSidebar);

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
  setBaseTheme(dark);
}

// Cambia el mapa base según el tema y gestiona el fallback de proveedores
function setBaseTheme(dark) {
  if (!map || typeof map.hasLayer !== 'function') return;
  baseTheme = dark ? 'dark' : 'light';
  baseIdx = 0;
  loadBase();
}

function loadBase() {
  const list = baseProviders[baseTheme];
  const p = list[baseIdx];
  const layer = L.tileLayer(p.url, {
    subdomains: p.subdomains,
    attribution: p.attribution,
    maxZoom: 19,
    maxNativeZoom: p.nativeZoom || 19,
    updateWhenIdle: false,   // carga teselas durante el gesto: nada de borroso "colgado"
    keepBuffer: 3            // margen pre-cargado: menos cortes al mover
  });
  layer.on('tileerror', () => {
    // Un error puntual puede ser normal; varios seguidos = proveedor caído → fallback
    baseFails++;
    clearTimeout(baseFailTimer);
    baseFailTimer = setTimeout(() => { baseFails = 0; }, 4000);
    if (baseFails >= 3 && baseIdx < list.length - 1) {
      baseFails = 0;
      baseIdx++;
      map.removeLayer(baseLayer);
      baseLayer = null;
      loadBase();
    }
  });
  baseLayer = layer;
  layer.addTo(map);
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
   GUÍA DE USO (TOUR) — para que los encuestadores entiendan la app
   sin explicaciones previas. Se muestra la primera vez y desde "?"
   ================================================================ */
function initTour() {
  const tour = document.getElementById('tour');
  const btnHelp = document.getElementById('help-btn');
  const btnClose = document.getElementById('tour-close');
  if (!tour || !btnHelp || !btnClose) return;

  let idx = 0;
  const steps = [...tour.querySelectorAll('.tour-step')];
  const nextBtn = document.getElementById('tour-next');
  const prevBtn = document.getElementById('tour-prev');
  const dots = document.getElementById('tour-dots');

  // Puntos de progreso
  steps.forEach((_, i) => {
    const d = document.createElement('span');
    if (i === 0) d.className = 'on';
    dots.appendChild(d);
  });
  const dotEls = [...dots.children];

  function show(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, j) => s.classList.toggle('active', j === idx));
    dotEls.forEach((d, j) => d.classList.toggle('on', j === idx));
    prevBtn.hidden = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? '¡Listo!' : 'Siguiente';
    // En el primer uso obligamos a recorrer los 3 pasos; desde "?" se puede saltar
    btnClose.hidden = idx === 0 && btnHelp.getAttribute('data-force') === '1';
  }

  function open() { tour.hidden = false; show(0); }
  function close() {
    tour.hidden = true;
    btnHelp.removeAttribute('data-force');
    try { localStorage.setItem('tourDone', '1'); } catch (e) {}
  }

  nextBtn.addEventListener('click', () => {
    if (idx === steps.length - 1) close();
    else show(idx + 1);
  });
  prevBtn.addEventListener('click', () => show(idx - 1));
  btnClose.addEventListener('click', close);
  tour.addEventListener('click', (e) => { if (e.target === tour) close(); });

  // Solo se abre automáticamente la primera vez
  let done = false;
  try { done = localStorage.getItem('tourDone') === '1'; } catch (e) {}
  if (!done) {
    btnHelp.setAttribute('data-force', '1');
    setTimeout(open, 600); // después de que el mapa cargue
  }
  btnHelp.addEventListener('click', () => {
    btnHelp.setAttribute('data-force', '1');
    open();
  });
}

/* ================================================================
   INICIO
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSidebarToggle();
  initChipActions();
  initTheme();
  initSectors();
  initTour();
  initProgressUI();
  initViewSwitch();
  loadData(); // carga asíncrona y construye el resto
});