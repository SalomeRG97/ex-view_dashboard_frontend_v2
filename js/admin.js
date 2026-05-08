/* ═══════════════════════════════════════════════════════════
   EX-VIEW Solar — Admin / Configurador JS
   Sin tokens. Genera URL con parámetros y redirige al dashboard.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Auth Check ─────────────────────────────────────────────
  // Si no hay sesión, redirigir al login
  if (sessionStorage.getItem('admin_logged_in') !== 'true') {
    window.location.replace('/dashboard/login');
    return;
  }

  // ── URL del backend ───────────────────────────────────────
  // Si el frontend se sirve desde el mismo servidor (localhost:3000),
  // dejar vacío ('') para usar rutas relativas.
  // Si el frontend corre en otro puerto o dominio, poner la URL completa:
  // const API_BASE = 'http://localhost:3000';
  const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

  // ── DOM refs ─────────────────────────────────────────────
  const form = document.getElementById('dashboardForm');
  const assetInput = document.getElementById('installation');
  const dropdown = document.getElementById('assetDropdown');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

  // ── Toggle: ¿Strings desconectados? ────────────────────
  const toggleNo = document.getElementById('toggleStringNo');
  const toggleYes = document.getElementById('toggleStringYes');
  const modulosGroup = document.getElementById('modulosGroup');
  const modulosInput = document.getElementById('modulos_desconectados');

  let hasStringFailure = false;   // false = No, true = Sí

  toggleNo.addEventListener('click', () => {
    hasStringFailure = false;
    toggleNo.classList.add('active'); toggleNo.setAttribute('aria-pressed', 'true');
    toggleYes.classList.remove('active'); toggleYes.setAttribute('aria-pressed', 'false');
    modulosGroup.classList.add('hidden-field');
    modulosInput.required = false;
    modulosInput.value = '';
  });

  toggleYes.addEventListener('click', () => {
    hasStringFailure = true;
    toggleYes.classList.add('active'); toggleYes.setAttribute('aria-pressed', 'true');
    toggleNo.classList.remove('active'); toggleNo.setAttribute('aria-pressed', 'false');
    modulosGroup.classList.remove('hidden-field');
    modulosInput.required = true;
    modulosInput.focus();
  });

  // ── Autocomplete ─────────────────────────────────────────
  let debounceTimer = null;

  assetInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = assetInput.value.trim();
    if (!q) { closeDropdown(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(q), 250);
  });

  assetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
    if (e.key === 'ArrowDown') {
      const first = dropdown.querySelector('li');
      if (first) first.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-wrap')) closeDropdown();
  });

  async function fetchSuggestions(q) {
    try {
      const res = await fetch(`${API_BASE}/assets?q=${encodeURIComponent(q)}`);
      const list = await res.json();
      renderDropdown(list);
    } catch {
      closeDropdown();
    }
  }

  function renderDropdown(items) {
    if (!items.length) { closeDropdown(); return; }
    dropdown.innerHTML = items.map(name =>
      `<li tabindex="0" role="option">${escHtml(name)}</li>`
    ).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => selectSuggestion(li.textContent));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') selectSuggestion(li.textContent);
        if (e.key === 'Escape') closeDropdown();
        if (e.key === 'ArrowDown' && li.nextElementSibling) li.nextElementSibling.focus();
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          li.previousElementSibling ? li.previousElementSibling.focus() : assetInput.focus();
        }
      });
    });
  }

  function selectSuggestion(name) {
    assetInput.value = name;
    closeDropdown();
  }

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }

  // ── Form submit → redirect to dashboard with URL params ──
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();

    const installation = assetInput.value.trim();
    const total_paneles = document.getElementById('total_paneles').value.trim();
    const modulos_desconectados = hasStringFailure
      ? modulosInput.value.trim()
      : '0';
    const capacidad_raw = document.getElementById('capacidad_instalada_mw').value.trim();
    const unidad = document.getElementById('unidad').value;
    const files_url = document.getElementById('files_url').value.trim();

    // Convertir siempre a kW internamente
    // 1 MW = 1000 kW; si el usuario eligió kW se usa el valor tal cual
    const capacidad_kw = unidad === 'MW'
      ? parseFloat(capacidad_raw) * 1000
      : parseFloat(capacidad_raw);

    // Validation
    const errors = [];
    if (!installation) errors.push('El nombre de instalación es requerido.');
    if (!total_paneles || Number(total_paneles) <= 0)
      errors.push('Total de paneles debe ser un número positivo.');
    if (hasStringFailure && (!modulos_desconectados || Number(modulos_desconectados) <= 0))
      errors.push('Módulos string desconectados debe ser un número positivo.');
    if (!capacidad_raw || Number(capacidad_raw) <= 0)
      errors.push('Capacidad instalada debe ser un número positivo.');
    if (!Number.isFinite(capacidad_kw) || capacidad_kw <= 0)
      errors.push('Capacidad instalada no es válida.');

    if (errors.length) {
      showError(errors.join(' '));
      return;
    }

    // Build URL params
    // capacidad_instalada_mw siempre en kW (ya convertido arriba)
    const params = new URLSearchParams({
      installation,
      total_paneles,
      modulos_desconectados,
      capacidad_instalada_mw: capacidad_kw,
      unidad,
    });
    if (files_url) params.set('files_url', files_url);

    window.location.href = `/dashboard/dashboard?${params.toString()}`;
  });

  // ── Error helpers ─────────────────────────────────────────
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.hidden = false;
    errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorBanner.hidden = true;
    errorMessage.textContent = '';
  }

  // ── Utility ───────────────────────────────────────────────
  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

})();
