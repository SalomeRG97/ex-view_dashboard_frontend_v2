/* ═══════════════════════════════════════════════════════════
   EX-VIEW Solar — Dashboard JavaScript
   Lee parámetros desde la URL, llama a /api/dashboard-data
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── URL del backend ───────────────────────────────────────
  // Si el frontend se sirve desde el mismo servidor (localhost:3000),
  // dejar vacío ('') para usar rutas relativas.
  // Si el frontend corre en otro puerto o dominio, poner la URL completa:
  // const API_BASE = 'http://localhost:3000';
  const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

  // ── DOM refs ──────────────────────────────────────────────
  const loadingScreen = document.getElementById('loadingScreen');
  const errorScreen = document.getElementById('errorScreen');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const dashApp = document.getElementById('dashboardApp');

  const assetNameEl = document.getElementById('assetName');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const filesBtn = document.getElementById('filesBtn');

  const kpiTotalVal = document.getElementById('kpiTotalVal');
  const kpiInefVal = document.getElementById('kpiInefVal');
  const kpiLossVal = document.getElementById('kpiLossVal');
  const kpiLossLabel = document.getElementById('kpiLossLabel');
  const kpiTypesVal = document.getElementById('kpiTypesVal');

  const lossUnitBadge = document.getElementById('lossUnitBadge');
  const lossColHeader = document.getElementById('lossColHeader');

  const unitKwBtn = document.getElementById('unitKw');
  const unitMwBtn = document.getElementById('unitMw');
  const tableBody = document.getElementById('tableBody');
  const btnConfigurar = document.getElementById('btnConfigurar');
  const btnCompartir = document.getElementById('btnCompartir');

  // Chart instances
  let chartCount = null;
  let chartInef = null;
  let chartLoss = null;

  // State
  let currentData = [];
  let currentUnit = 'MW';
  let urlParams = {};

  // ── Utilities ─────────────────────────────────────────────
  function getParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      asset_name: p.get('asset_name') || '',
      total_paneles: p.get('total_paneles') || '',
      puntos_calientes: p.get('puntos_calientes') || '',
      capacidad_instalada_mw: p.get('capacidad_instalada_mw') || '',
      unidad: p.get('unidad') || 'MW',
      files_url: p.get('files_url') || '',
    };
  }

  function fmt(n, decimals = 2) {
    return Number(n).toLocaleString('es-MX', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function showError(title, msg) {
    loadingScreen.hidden = true;
    errorTitle.textContent = title;
    errorMessage.textContent = msg;
    errorScreen.hidden = false;
  }

  function showDashboard() {
    loadingScreen.hidden = true;
    errorScreen.hidden = true;
    dashApp.hidden = false;
  }

  // ── Color por tipo de anomalía ────────────────────────────
  const ANOMALY_COLORS = {
    'dba': '#0003f5',
    'hotspot_mild': '#fef80b',
    'hotspot_permissible': '#fe8201',
    'hotspot_critical': '#f50202',
    'disconnected_string': '#020202',
    'bypass_diode_failure': '#ff69b4',
    'pid': '#7f01fe',
    'reverse_polarity': '#cc00cc',
    'dirt': '#834109',
    'physical_damage': '#9e9e9e',
    'soiling': '#834109',
    'vegetation': '#06fd07',
    'shading': '#05fdf6',
  };

  function getAnomalyColor(type) {
    return ANOMALY_COLORS[(type || '').toLowerCase()] || '#94a3b8';
  }

  function isLightColor(hex) {
    if (!hex || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
  }

  const LIGHT_TOOLTIP = {
    backgroundColor: '#1e293b',
    titleColor: '#94a3b8',
    bodyColor: '#f8fafc',
    padding: 10,
    cornerRadius: 8,
  };

  const LIGHT_AXIS = {
    grid: { color: 'rgba(0,0,0,.07)', drawBorder: false },
    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
    border: { display: false },
  };

  // ── Chart helpers ─────────────────────────────────────────
  function destroyChart(instance) {
    if (instance) instance.destroy();
  }

  // Chart 1: Barras verticales — Recuento por tipo
  function buildCountChart(canvasId, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => d.recuento),
          backgroundColor: data.map(d => getAnomalyColor(d.type)),
          borderWidth: 0,
          borderRadius: 5,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: { ...LIGHT_TOOLTIP, callbacks: { label: c => ` ${c.parsed.y.toLocaleString('es-MX')} anomalías` } },
          datalabels: {
            anchor: 'end', align: 'end', offset: 2,
            color: '#374151',
            font: { weight: '700', size: 11, family: 'Inter' },
            formatter: v => v.toLocaleString('es-MX'),
          },
        },
        scales: {
          x: { ...LIGHT_AXIS, grid: { display: false } },
          y: { ...LIGHT_AXIS, beginAtZero: true },
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
      },
    });
  }

  // Charts 2 & 3: Barra horizontal apilada — ineficiencia / pérdida
  function buildHorizontalStacked(canvasId, data, valueKey, unit = '') {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]);
    const datasets = sorted.map(d => ({
      label: d.type,
      data: [Number(d[valueKey])],
      backgroundColor: getAnomalyColor(d.type),
      borderWidth: 0,
    }));

    return new Chart(ctx, {
      type: 'bar',
      plugins: [ChartDataLabels],
      data: { labels: [' '], datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 12 } },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'start',
            labels: { color: '#374151', font: { family: 'Inter', size: 11 }, padding: 16, boxWidth: 14, boxHeight: 14 },
          },
          tooltip: {
            ...LIGHT_TOOLTIP,
            callbacks: {
              title: () => '',
              label: c => ` ${c.dataset.label}: ${fmt(c.parsed.x, 2)}${unit ? ' ' + unit : ''}`,
            },
          },
          datalabels: {
            color: c => isLightColor(c.dataset.backgroundColor) ? '#374151' : '#ffffff',
            font: { weight: '700', size: 10, family: 'Inter' },
            anchor: 'center',
            align: 'center',
            clamp: true,
            formatter: v => v > 0 ? fmt(v, 2) : '',
            display: c => {
              const bar = c.chart.getDatasetMeta(c.datasetIndex).data[c.dataIndex];
              return bar && bar.width > 30;
            },
          },
        },
        scales: {
          x: {
            ...LIGHT_AXIS, stacked: true, beginAtZero: true,
            ticks: { ...LIGHT_AXIS.ticks, callback: v => unit ? `${fmt(v, 1)} ${unit}` : v }
          },
          y: { stacked: true, grid: { display: false }, ticks: { display: false }, border: { display: false } },
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
      },
    });
  }

  // ── Render ────────────────────────────────────────────────
  function renderAll(data, unit) {
    const counts = data.map(d => d.recuento);
    const inefs = data.map(d => d.ineficiencia_pct);
    const losses = data.map(d => d.perdida);

    // KPIs
    const totalAnomalies = counts.reduce((a, b) => a + b, 0);
    const maxInef = Math.max(...inefs);
    const totalLoss = losses.reduce((a, b) => a + b, 0);

    kpiTotalVal.textContent = totalAnomalies.toLocaleString('es-MX');
    kpiInefVal.textContent = `${fmt(maxInef, 1)}%`;
    kpiLossVal.textContent = fmt(totalLoss, 2);
    kpiLossLabel.textContent = `Pérdida mensual (${unit})`;
    kpiTypesVal.textContent = data.length;
    lossUnitBadge.textContent = unit;
    lossColHeader.textContent = `Pérdida (${unit})`;

    destroyChart(chartCount);
    destroyChart(chartInef);
    destroyChart(chartLoss);

    chartCount = buildCountChart('chartCount', data);
    chartInef = buildHorizontalStacked('chartInef', data, 'ineficiencia_pct', '%');
    chartLoss = buildHorizontalStacked('chartLoss', data, 'perdida', unit);

    // Table — usar colores por tipo
    tableBody.innerHTML = data.map(d => {
      const clr = getAnomalyColor(d.type);
      return `
      <tr>
        <td>
          <span class="type-pill" style="border-color:${clr}55;background:${clr}18;color:${clr}">
            ${d.type}
          </span>
        </td>
        <td>${d.recuento.toLocaleString('es-MX')}</td>
        <td>
          <div class="inef-bar-wrap">
            <div class="inef-bar-bg">
              <div class="inef-bar-fill" style="width:${Math.min(d.ineficiencia_pct, 100)}%;background:${clr}"></div>
            </div>
            <span>${fmt(d.ineficiencia_pct, 1)}%</span>
          </div>
        </td>
        <td>${fmt(d.perdida, 4)}</td>
      </tr>`;
    }).join('');
  }

  // ── Unit switcher ─────────────────────────────────────────
  function setUnit(unit) {
    currentUnit = unit;
    unitKwBtn.classList.toggle('active', unit === 'kW');
    unitMwBtn.classList.toggle('active', unit === 'MW');
    // Recalculate passing the new unit override
    fetchAndRender({ ...urlParams, unidad: unit });
  }

  unitKwBtn.addEventListener('click', () => setUnit('kW'));
  unitMwBtn.addEventListener('click', () => setUnit('MW'));

  // ── Fetch & render ────────────────────────────────────────
  async function fetchAndRender(params) {
    try {
      const query = new URLSearchParams({
        asset_name: params.asset_name,
        total_paneles: params.total_paneles,
        puntos_calientes: params.puntos_calientes,
        capacidad_instalada_mw: params.capacidad_instalada_mw,
        unidad: params.unidad,
      });
      if (params.files_url) query.set('files_url', params.files_url);

      const fullUrl = `${API_BASE}/dashboard-data?${query.toString()}`;
      console.log('[dashboard] Fetching:', fullUrl);

      const res = await fetch(fullUrl);
      console.log('[dashboard] HTTP status:', res.status, res.ok);

      const json = await res.json();
      console.log('[dashboard] JSON recibido — data.length:', json.data?.length);

      if (!res.ok) {
        return showError('Error al cargar', json.error || 'No se pudo cargar el dashboard.');
      }

      const { data, files_url, asset_name, unidad } = json;

      // Sync unit buttons
      currentUnit = unidad;
      unitKwBtn.classList.toggle('active', unidad === 'kW');
      unitMwBtn.classList.toggle('active', unidad === 'MW');

      // Header meta
      assetNameEl.textContent = asset_name || '—';
      lastUpdatedEl.textContent = new Date().toLocaleString('es-MX', {
        dateStyle: 'short', timeStyle: 'short',
      });

      // Files button
      if (files_url) {
        filesBtn.href = files_url;
        filesBtn.hidden = false;
      }

      if (!data.length) {
        showDashboard();
        kpiTotalVal.textContent = '0';
        kpiInefVal.textContent = '0%';
        kpiLossVal.textContent = '0';
        kpiTypesVal.textContent = '0';
        tableBody.innerHTML = `
          <tr><td colspan="4" style="text-align:center;color:var(--clr-muted);padding:2rem">
            No se encontraron anomalías para esta instalación.
          </td></tr>`;
        return;
      }

      currentData = data;
      console.log('[dashboard] Llamando showDashboard...');
      showDashboard();
      console.log('[dashboard] Llamando renderAll con', data.length, 'filas...');
      renderAll(data, currentUnit);
      console.log('[dashboard] renderAll OK ✅');

    } catch (err) {
      console.error('[dashboard] fetch error:', err);
      showError(
        'Error de conexión',
        `No se pudo conectar con el servidor en ${API_BASE}. Detalle: ${err.message}`
      );
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  urlParams = getParams();
  console.log('[dashboard] URL params:', urlParams);

  const required = ['asset_name', 'total_paneles', 'puntos_calientes', 'capacidad_instalada_mw'];
  const missing = required.filter(k => !urlParams[k]);

  if (missing.length) {
    console.warn('[dashboard] Faltan params:', missing);
    showError(
      'Parámetros incompletos',
      `Faltan los siguientes parámetros en la URL: ${missing.join(', ')}. Vuelve al formulario para configurarlos.`
    );
  } else {
    currentUnit = urlParams.unidad || 'MW';
    unitKwBtn.classList.toggle('active', currentUnit === 'kW');
    unitMwBtn.classList.toggle('active', currentUnit === 'MW');
    console.log('[dashboard] Llamando fetchAndRender con unidad:', currentUnit);
    fetchAndRender(urlParams);
  }
  // ── Admin mode ─────────────────────────────────────────────
  const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

  if (isAdmin) {
    if (btnConfigurar) btnConfigurar.hidden = false;
    if (btnCompartir) btnCompartir.hidden = false;
  }

  // ── Share URL ──────────────────────────────────────────────
  function getShareableURL() {
    const url = new URL(window.location.href);
    url.searchParams.delete('admin');
    return url.toString();
  }

  if (btnCompartir) {
    btnCompartir.addEventListener('click', async () => {
      const shareURL = getShareableURL();
      try {
        await navigator.clipboard.writeText(shareURL);
        const originalText = btnCompartir.innerHTML;
        btnCompartir.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          ¡Copiado!`;
        btnCompartir.classList.add('btn-share--copied');
        setTimeout(() => {
          btnCompartir.innerHTML = originalText;
          btnCompartir.classList.remove('btn-share--copied');
        }, 2000);
      } catch {
        // Fallback para navegadores sin clipboard API
        prompt('Copia este enlace:', shareURL);
      }
    });
  }

})();
