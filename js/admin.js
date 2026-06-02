/* ═══════════════════════════════════════════════════════════
   EX-VIEW Solar — Admin / Configurador JS
   Sin tokens. Genera URL con parámetros y redirige al dashboard.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Auth Check ─────────────────────────────────────────────
  // Si no hay sesión, redirigir al login
  if (sessionStorage.getItem('admin_logged_in') !== 'true') {
    window.location.replace('login.html');
    return;
  }

  // ── URL del backend ───────────────────────────────────────
  // Para pruebas locales apuntamos al servidor local.
  // En producción cambiar a la URL de Render u otro hosting.
  const API_BASE = 'http://localhost:3000';
  // const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

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

  // ── Load Edit Data ─────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get('editId');
  if (editId) {
    document.getElementById('form-title').innerText = 'Editar Dashboard';
    fetch(`${API_BASE}/api/admin/dashboards/${editId}`)
      .then(res => {
        if (!res.ok) throw new Error('No se pudo cargar el dashboard');
        return res.json();
      })
      .then(data => {
        // El nombre de instalación es el campo principal
        assetInput.value = data.installationName || '';
        
        const fd = data.formData;
        if (fd) {
          // Compatibilidad: si formData tiene installation, usarlo como fallback
          if (!assetInput.value && fd.installation) {
            assetInput.value = fd.installation;
          }
          document.getElementById('total_paneles').value = fd.total_paneles || '';
          
          if (fd.modulos_desconectados && Number(fd.modulos_desconectados) > 0) {
            hasStringFailure = true;
            toggleYes.classList.add('active'); toggleYes.setAttribute('aria-pressed', 'true');
            toggleNo.classList.remove('active'); toggleNo.setAttribute('aria-pressed', 'false');
            modulosGroup.classList.remove('hidden-field');
            modulosInput.required = true;
            modulosInput.value = fd.modulos_desconectados;
          }
          
          if (fd.capacidad_raw) {
            document.getElementById('capacidad_instalada_mw').value = fd.capacidad_raw;
          } else if (fd.capacidad_instalada_mw) {
            // retro-compatibility if needed
            document.getElementById('capacidad_instalada_mw').value = fd.unidad === 'MW' ? Number(fd.capacidad_instalada_mw) / 1000 : fd.capacidad_instalada_mw;
          }
          
          if (fd.unidad) {
            document.getElementById('unidad').value = fd.unidad;
          }
          
          if (fd.files_url) {
            document.getElementById('files_url').value = fd.files_url;
          }
        }
      })
      .catch(err => showError(err.message));
  }

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

  // ── Toggle: ¿Subir PDF? ──────────────────────────────────
  const togglePdfNo    = document.getElementById('togglePdfNo');
  const togglePdfYes   = document.getElementById('togglePdfYes');
  const pdfUploadGroup = document.getElementById('pdfUploadGroup');
  const pdfFileInput   = document.getElementById('pdfFile');
  let   uploadPdf = false;

  togglePdfNo.addEventListener('click', () => {
    uploadPdf = false;
    togglePdfNo.classList.add('active');     togglePdfNo.setAttribute('aria-pressed', 'true');
    togglePdfYes.classList.remove('active'); togglePdfYes.setAttribute('aria-pressed', 'false');
    pdfUploadGroup.classList.add('hidden-field');
    pdfFileInput.value = '';
  });

  togglePdfYes.addEventListener('click', () => {
    uploadPdf = true;
    togglePdfYes.classList.add('active');   togglePdfYes.setAttribute('aria-pressed', 'true');
    togglePdfNo.classList.remove('active'); togglePdfNo.setAttribute('aria-pressed', 'false');
    pdfUploadGroup.classList.remove('hidden-field');
    pdfFileInput.focus();
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

  // ── Form submit → save to DB and redirect to dashboard ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const installation = assetInput.value;
    const total_paneles = document.getElementById('total_paneles').value.trim();
    const modulos_desconectados = hasStringFailure
      ? modulosInput.value.trim()
      : '0';
    const capacidad_raw = document.getElementById('capacidad_instalada_mw').value.trim();
    const unidad = document.getElementById('unidad').value;
    const files_url = document.getElementById('files_url').value.trim();

    // Convertir siempre a kW internamente
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

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Guardando...';

    const formDataObj = {
      installation,
      total_paneles,
      modulos_desconectados,
      capacidad_instalada_mw: capacidad_kw,
      capacidad_raw,
      unidad,
      files_url
    };

    // installationName = el nombre de la instalación (asset_name)
    const payload = {
      installationName: installation,
      formData: formDataObj
    };

    // ── Paso 1: Guardar dashboard ──────────────────────────
    let savedDashboard;
    try {
      const method = editId ? 'PUT' : 'POST';
      const endpoint = editId ? `${API_BASE}/api/admin/dashboards/${editId}` : `${API_BASE}/api/admin/dashboards`;

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Error al guardar el dashboard: ${errBody || response.statusText}`);
      }

      savedDashboard = await response.json();
    } catch (err) {
      console.error('[admin.js] Error guardando dashboard:', err);
      showError(err.message === 'Failed to fetch'
        ? 'No se pudo conectar con el servidor. Verifica tu conexión o intenta de nuevo en unos segundos.'
        : err.message);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    // ── Paso 2: Upload PDF si el switch está activado ─────
    let pdfUploadOk = true;
    let pdfUploadError = '';
    if (uploadPdf && pdfFileInput.files[0]) {
      const fileSizeMB = (pdfFileInput.files[0].size / (1024 * 1024)).toFixed(1);
      submitBtn.innerHTML = `Subiendo PDF (${fileSizeMB} MB)...`;

      try {
        const pdfForm = new FormData();
        pdfForm.append('pdf', pdfFileInput.files[0]);

        const pdfRes = await fetch(`${API_BASE}/api/admin/dashboards/${savedDashboard.id}/reports`, {
          method: 'POST',
          body: pdfForm,
        });

        if (!pdfRes.ok) {
          const errText = await pdfRes.text();
          let errMsg;
          try { errMsg = JSON.parse(errText).error; } catch (_) { errMsg = errText; }
          pdfUploadOk = false;
          pdfUploadError = errMsg || `Error HTTP ${pdfRes.status}`;
          console.warn('[admin.js] PDF upload error:', pdfUploadError);
        }
      } catch (pdfErr) {
        pdfUploadOk = false;
        pdfUploadError = pdfErr.message === 'Failed to fetch'
          ? `No se pudo subir el PDF (${fileSizeMB} MB). El archivo puede ser demasiado grande o la conexión se interrumpió. Intenta subirlo desde la página de Reportes.`
          : pdfErr.message;
        console.error('[admin.js] PDF upload exception:', pdfErr);
      }
    }

    // ── Paso 3: Redirigir al dashboard ───────────────────
    const params = new URLSearchParams({
      id: savedDashboard.id,
      installation,
      total_paneles,
      modulos_desconectados,
      capacidad_instalada_mw: capacidad_kw,
      unidad,
    });
    if (files_url) params.set('files_url', files_url);

    if (!pdfUploadOk) {
      // Dashboard guardado OK, pero PDF falló: informar y redirigir
      showError(`Dashboard guardado ✅, pero el PDF no se pudo subir: ${pdfUploadError}`);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      // Redirigir después de unos segundos para que el usuario lea el mensaje
      setTimeout(() => {
        window.location.href = `dashboard.html?${params.toString()}`;
      }, 5000);
    } else {
      window.location.href = `dashboard.html?${params.toString()}`;
    }
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
