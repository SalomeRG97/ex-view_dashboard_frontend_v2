/* ═══════════════════════════════════════════════════════════
   EX-VIEW Solar — Admin / Configurador JS
   Sin tokens. Genera URL con parámetros y redirige al dashboard.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── URL del backend ───────────────────────────────────────
  // Si el frontend se sirve desde el mismo servidor (localhost:3000),
  // dejar vacío ('') para usar rutas relativas.
  // Si el frontend corre en otro puerto o dominio, poner la URL completa:
  const API_BASE = 'http://localhost:3000';
  // const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

  // ── DOM refs ─────────────────────────────────────────────
  const form = document.getElementById('dashboardForm');
  const assetInput = document.getElementById('asset_name');
  const dropdown = document.getElementById('assetDropdown');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

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

    const asset_name = assetInput.value.trim();
    const total_paneles = document.getElementById('total_paneles').value.trim();
    const puntos_calientes = document.getElementById('puntos_calientes').value.trim();
    const capacidad_instalada_mw = document.getElementById('capacidad_instalada_mw').value.trim();
    const unidad = document.getElementById('unidad').value;
    const files_url = document.getElementById('files_url').value.trim();

    // Validation
    const errors = [];
    if (!asset_name) errors.push('El nombre de instalación es requerido.');
    if (!total_paneles || Number(total_paneles) <= 0)
      errors.push('Total de paneles debe ser un número positivo.');
    if (!puntos_calientes || Number(puntos_calientes) <= 0)
      errors.push('Puntos calientes debe ser un número positivo.');
    if (!capacidad_instalada_mw || Number(capacidad_instalada_mw) <= 0)
      errors.push('Capacidad instalada debe ser un número positivo.');

    if (errors.length) {
      showError(errors.join(' '));
      return;
    }

    // Build URL params
    const params = new URLSearchParams({
      asset_name,
      total_paneles,
      puntos_calientes,
      capacidad_instalada_mw,
      unidad,
    });
    if (files_url) params.set('files_url', files_url);

    params.set('admin', 'true'); // Flag to indicate it comes from the form
    window.location.href = `dashboard.html?${params.toString()}`;
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
