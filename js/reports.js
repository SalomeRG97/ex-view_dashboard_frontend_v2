(() => {
  'use strict';

  const API_BASE = 'http://localhost:3000';
  // const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';
  const isAdmin  = sessionStorage.getItem('admin_logged_in') === 'true';

  // Leer dashboardId e reportId de la URL
  // Ejemplo: reports.html?dashboardId=abc&reportId=xyz
  const params      = new URLSearchParams(window.location.search);
  const dashboardId = params.get('dashboardId');
  const reportId    = params.get('reportId');

  const errorBanner  = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');
  const reportsContent = document.getElementById('reports-content');

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.hidden = false;
  }

  // ── Si viene un reportId específico, cargar ese reporte directamente
  if (reportId) {
    loadSingleReport(reportId);
  } else if (dashboardId) {
    loadDashboardReports(dashboardId);
  } else {
    reportsContent.innerHTML = '<p style="color:var(--clr-error)">Parámetros inválidos. Vuelve al listado.</p>';
  }

  // ══════════════════════════════════════════════════════════
  //  CARGAR REPORTES DE UN DASHBOARD
  // ══════════════════════════════════════════════════════════
  async function loadDashboardReports(dId) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`);
      if (!res.ok) throw new Error('No se pudieron obtener los reportes.');
      const reports = await res.json();

      document.getElementById('page-subtitle').textContent =
        `${reports.length} informe(s) asociado(s)`;

      reportsContent.innerHTML = '';

      if (reports.length === 0) {
        reportsContent.innerHTML = '<div class="no-reports">No hay informes PDF para este dashboard.</div>';
        if (isAdmin) renderUploadSection(reportsContent, dId);
        return;
      }

      reports.forEach(r => reportsContent.appendChild(buildReportCard(r)));

      if (isAdmin) renderUploadSection(reportsContent, dId);

    } catch (err) {
      showError(err.message);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CARGAR UN REPORTE ESPECÍFICO
  // ══════════════════════════════════════════════════════════
  async function loadSingleReport(rId) {
    try {
      const res = await fetch(`${API_BASE}/api/reports/${rId}`);
      if (!res.ok) throw new Error('Reporte no encontrado.');
      const report = await res.json();

      document.getElementById('page-subtitle').textContent = report.originalName;
      reportsContent.innerHTML = '';
      reportsContent.appendChild(buildReportCard(report));
    } catch (err) {
      showError(err.message);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONSTRUIR CARD DE UN REPORTE
  // ══════════════════════════════════════════════════════════
  function buildReportCard(report) {
    const card = document.createElement('div');
    card.className = 'report-card';

    const statusClass = {
      UPLOADED:   'badge-uploaded',
      PROCESSING: 'badge-processing',
      READY:      'badge-ready',
      FAILED:     'badge-failed',
    }[report.status] || 'badge-uploaded';

    const statusLabel = {
      UPLOADED:   '⏳ Subido',
      PROCESSING: '⚙️ Procesando',
      READY:      '✅ Listo',
      FAILED:     '❌ Error',
    }[report.status] || report.status;

    const dateStr = new Date(report.createdAt).toLocaleDateString();

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem;">
        <h3>${report.originalName}</h3>
        <span class="badge ${statusClass}">${statusLabel}</span>
      </div>
      <p class="report-meta">Subido: ${dateStr} · ${(report.fileSize / 1024).toFixed(0)} KB</p>
    `;

    if (report.status === 'READY' && report.sections?.length > 0) {
      card.appendChild(buildAnomalyChecklist(report));
    } else if (report.status === 'PROCESSING') {
      const progressWrap = document.createElement('div');
      progressWrap.className = 'progress-wrap';
      progressWrap.style.display = 'block';
      progressWrap.innerHTML = `
        <div class="progress-bar"><div class="progress-bar-fill" style="width:60%"></div></div>
        <p class="progress-label">Procesando páginas del PDF... esto puede tomar un momento.</p>
      `;
      card.appendChild(progressWrap);

      // Polling para actualizar cuando esté listo
      pollReportStatus(report.id, card);
    }

    if (isAdmin) {
      const adminActions = document.createElement('div');
      adminActions.className = 'action-row';
      adminActions.innerHTML = `
        <button class="btn-secondary btn-delete-report" data-id="${report.id}" style="color:#dc2626;border-color:#fca5a5;">
          🗑 Eliminar
        </button>
      `;
      adminActions.querySelector('.btn-delete-report').addEventListener('click', async () => {
        if (confirm('¿Eliminar este informe? Esta acción no se puede deshacer.')) {
          await deleteReport(report.id, card);
        }
      });
      card.appendChild(adminActions);
    }

    return card;
  }

  // ══════════════════════════════════════════════════════════
  //  CHECKLIST DE ANOMALÍAS + BOTÓN GENERAR
  // ══════════════════════════════════════════════════════════
  function buildAnomalyChecklist(report) {
    const container = document.createElement('div');

    // --- SECCIÓN: INFORME ORIGINAL ---
    const originalSection = document.createElement('div');
    originalSection.className = 'original-report-section';
    originalSection.style.marginBottom = '1.8rem';
    originalSection.style.paddingBottom = '1.4rem';
    originalSection.style.borderBottom = '1.5px dashed var(--clr-border)';
    
    const totalPages = report.numPages || 1;
    let currentPage = 1;
    let zoomPercent = 100;
    const prefetchedPages = new Set();

    originalSection.innerHTML = `
      <h3 style="font-size: .88rem; font-weight: 700; margin-bottom: .4rem; display: flex; align-items: center; gap: 6px;">
        📄 Informe Original Completo
      </h3>
      <p style="font-size: .78rem; color: var(--clr-muted); margin-bottom: .8rem; line-height: 1.4;">
        Descarga el informe completo tal como fue cargado inicialmente, sin filtros ni modificaciones de páginas.
      </p>
      <button class="btn-secondary btn-download-original" style="display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; padding: .45rem .9rem; margin-bottom: 1rem;">
        ⬇ Descargar Original
      </button>

      <!-- VISOR DE PDF PERSONALIZADO -->
      <div class="pdf-viewer-container" style="display: flex; flex-direction: column; border: 1px solid var(--clr-border); border-radius: 8px; overflow: hidden; margin-bottom: 1rem; background: var(--clr-surface-2); font-family: var(--ff);">
        <!-- Toolbar -->
        <div class="pdf-toolbar" style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; background: var(--clr-surface); border-bottom: 1px solid var(--clr-border); gap: 0.5rem; flex-wrap: wrap; user-select: none;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn-prev btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.8rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; min-width: 32px;" title="Página anterior">
              ◀
            </button>
            <span style="font-size: 0.82rem; color: var(--clr-muted); display: inline-flex; align-items: center; gap: 4px;">
              Página 
              <input type="number" class="pdf-page-input" value="1" min="1" max="${totalPages}" style="width: 45px; text-align: center; padding: 0.2rem; border: 1px solid var(--clr-border); border-radius: 4px; background: var(--clr-surface-2); color: var(--clr-text); font-weight: 600; font-size: 0.82rem; outline: none;"/>
              de <span class="pdf-total-pages" style="font-weight: 600;">${totalPages}</span>
            </span>
            <button class="btn-next btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.8rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; min-width: 32px;" title="Página siguiente">
              ▶
            </button>
          </div>
          
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn-zoom-out btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.8rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;" title="Reducir zoom">🔍-</button>
            <span class="pdf-zoom-level" style="font-size: 0.78rem; color: var(--clr-muted); min-width: 38px; text-align: center; font-weight: 600;">100%</span>
            <button class="btn-zoom-in btn-secondary" style="padding: 0.35rem 0.7rem; font-size: 0.8rem; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;" title="Aumentar zoom">🔍+</button>
          </div>
        </div>
        
        <!-- Display area (focusable using tabindex) -->
        <div class="pdf-page-display" tabindex="0" style="position: relative; display: flex; justify-content: center; align-items: flex-start; padding: 1.5rem; overflow: auto; height: 620px; background: #0f172a; outline: none; cursor: grab;">
          <!-- Page Image -->
          <img class="pdf-page-image" src="" alt="Página del PDF" style="max-width: 100%; height: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.4); border-radius: 6px; display: none; transition: width 0.2s ease, max-width 0.2s ease; pointer-events: none; user-select: none;"/>
          
          <!-- Loading spinner -->
          <div class="pdf-loading-spinner" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 0.8rem; pointer-events: none;">
            <div style="width: 40px; height: 40px; border: 3.5px solid rgba(245,158,11,0.15); border-top-color: var(--clr-amber); border-radius: 50%; animation: pdfSpin 1s linear infinite;"></div>
            <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">Cargando página...</span>
          </div>

          <!-- Error message -->
          <div class="pdf-error-message" style="display: none; flex-direction: column; align-items: center; gap: 0.8rem; pointer-events: none; color: #f87171; text-align: center; padding: 2rem;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span class="pdf-error-text" style="font-size: 0.85rem; font-weight: 500;">Error al cargar la página</span>
          </div>
        </div>
      </div>
      <style>
        @keyframes pdfSpin {
          to { transform: rotate(360deg); }
        }
        .pdf-page-display:focus {
          box-shadow: inset 0 0 0 2px var(--clr-amber);
        }
      </style>
    `;

    const btnPrev = originalSection.querySelector('.btn-prev');
    const btnNext = originalSection.querySelector('.btn-next');
    const pageInput = originalSection.querySelector('.pdf-page-input');
    const zoomOut = originalSection.querySelector('.btn-zoom-out');
    const zoomIn = originalSection.querySelector('.btn-zoom-in');
    const zoomLevel = originalSection.querySelector('.pdf-zoom-level');
    const displayArea = originalSection.querySelector('.pdf-page-display');
    const pageImg = originalSection.querySelector('.pdf-page-image');
    const spinner = originalSection.querySelector('.pdf-loading-spinner');
    const errorMsg = originalSection.querySelector('.pdf-error-message');
    const errorText = originalSection.querySelector('.pdf-error-text');

    function updatePage(page) {
      if (page < 1 || page > totalPages) return;
      currentPage = page;
      pageInput.value = currentPage;

      // Habilitar / deshabilitar botones
      btnPrev.disabled = currentPage === 1;
      btnNext.disabled = currentPage === totalPages;

      // Mostrar spinner, ocultar imagen y error
      spinner.style.display = 'flex';
      pageImg.style.display = 'none';
      errorMsg.style.display = 'none';

      // Cargar la nueva imagen
      const pageUrl = `${API_BASE}/api/reports/${report.id}/pages/${currentPage}`;
      pageImg.src = pageUrl;

      // Hacer scroll al inicio del visor al cambiar de página
      displayArea.scrollTop = 0;
      displayArea.scrollLeft = 0;
    }

    pageImg.addEventListener('load', () => {
      spinner.style.display = 'none';
      pageImg.style.display = 'block';
      errorMsg.style.display = 'none';

      // Prefetch de la siguiente página
      const nextPage = currentPage + 1;
      if (nextPage <= totalPages && !prefetchedPages.has(nextPage)) {
        prefetchedPages.add(nextPage);
        const img = new Image();
        img.src = `${API_BASE}/api/reports/${report.id}/pages/${nextPage}`;
      }
    });

    pageImg.addEventListener('error', () => {
      spinner.style.display = 'none';
      pageImg.style.display = 'none';
      errorText.textContent = `Error al cargar la página ${currentPage}. Reinténtalo.`;
      errorMsg.style.display = 'flex';
    });

    // Cambiar página con inputs
    pageInput.addEventListener('change', () => {
      let val = parseInt(pageInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > totalPages) val = totalPages;
      updatePage(val);
    });

    // Cambiar página con botones
    btnPrev.addEventListener('click', () => updatePage(currentPage - 1));
    btnNext.addEventListener('click', () => updatePage(currentPage + 1));

    // Control de Zoom
    function applyZoom() {
      zoomLevel.textContent = `${zoomPercent}%`;
      pageImg.style.width = `${zoomPercent}%`;
      pageImg.style.maxWidth = `${zoomPercent}%`;
    }

    zoomIn.addEventListener('click', () => {
      if (zoomPercent < 250) {
        zoomPercent += 25;
        applyZoom();
      }
    });

    zoomOut.addEventListener('click', () => {
      if (zoomPercent > 50) {
        zoomPercent -= 25;
        applyZoom();
      }
    });

    // Navegación por teclado (cuando el contenedor tiene el foco)
    displayArea.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        updatePage(currentPage + 1);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        updatePage(currentPage - 1);
        e.preventDefault();
      }
    });

    // Panning táctil/arrastre con el mouse
    let isDown = false;
    let startX;
    let startY;
    let scrollLeft;
    let scrollTop;

    displayArea.addEventListener('mousedown', (e) => {
      isDown = true;
      displayArea.style.cursor = 'grabbing';
      startX = e.pageX - displayArea.offsetLeft;
      startY = e.pageY - displayArea.offsetTop;
      scrollLeft = displayArea.scrollLeft;
      scrollTop = displayArea.scrollTop;
    });

    displayArea.addEventListener('mouseleave', () => {
      isDown = false;
      displayArea.style.cursor = 'grab';
    });

    displayArea.addEventListener('mouseup', () => {
      isDown = false;
      displayArea.style.cursor = 'grab';
    });

    displayArea.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - displayArea.offsetLeft;
      const y = e.pageY - displayArea.offsetTop;
      const walkX = (x - startX) * 1.5;
      const walkY = (y - startY) * 1.5;
      displayArea.scrollLeft = scrollLeft - walkX;
      displayArea.scrollTop = scrollTop - walkY;
    });

    // Cargar la primera página inicialmente
    updatePage(1);

    // Descarga robusta usando fetch y blob URL para capturar errores de forma controlada
    originalSection.querySelector('.btn-download-original').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '⚡ Descargando...';
      try {
        const res = await fetch(`${API_BASE}/api/reports/${report.id}/original`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Error al descargar el PDF original.');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = report.originalName || `original-${report.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        
        btn.innerHTML = '✅ Descargado';
        setTimeout(() => {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });

    container.appendChild(originalSection);

    // --- SECCIÓN: INFORME FILTRADO ---
    const customTitle = document.createElement('h3');
    customTitle.style.fontSize = '.88rem';
    customTitle.style.fontWeight = '700';
    customTitle.style.marginBottom = '.4rem';
    customTitle.style.display = 'flex';
    customTitle.style.alignItems = 'center';
    customTitle.style.gap = '6px';
    customTitle.innerHTML = '⚙️ Generar Informe Personalizado (Nuevo)';

    const customDesc = document.createElement('p');
    customDesc.style.fontSize = '.78rem';
    customDesc.style.color = 'var(--clr-muted)';
    customDesc.style.marginBottom = '.9rem';
    customDesc.style.lineHeight = '1.4';
    customDesc.innerHTML = 'Selecciona las anomalías que deseas incluir en el nuevo reporte. El documento se generará dinámicamente con una tabla de contenido limpia y numeración corregida.';

    container.appendChild(customTitle);
    container.appendChild(customDesc);

    const listEl = document.createElement('div');
    listEl.className = 'anomaly-list';

    report.sections.forEach(section => {
      const item = document.createElement('div');
      item.className = 'anomaly-item';
      const uid = `chk-${report.id}-${section.id}`;
      item.innerHTML = `
        <input type="checkbox" id="${uid}" name="${section.id}" checked/>
        <label for="${uid}">${section.label}</label>
        <span style="margin-left:auto;font-size:.72rem;color:var(--clr-muted);">
          Págs ${section.pageStart}–${section.pageEnd}
        </span>
      `;
      listEl.appendChild(item);
    });

    // Barra de progreso
    const progressWrap = document.createElement('div');
    progressWrap.className = 'progress-wrap';
    progressWrap.innerHTML = `
      <div class="progress-bar"><div class="progress-bar-fill" id="fill-${report.id}"></div></div>
      <p class="progress-label" id="prog-label-${report.id}">Generando informe...</p>
    `;

    // Botón generar (visual e idéntico al de arriba)
    const generateBtn = document.createElement('button');
    generateBtn.className = 'btn-secondary';
    generateBtn.style.marginTop = '.8rem';
    generateBtn.style.display = 'inline-flex';
    generateBtn.style.alignItems = 'center';
    generateBtn.style.gap = '.4rem';
    generateBtn.style.fontSize = '.8rem';
    generateBtn.style.padding = '.45rem .9rem';
    generateBtn.textContent = '⬇ Generar Informe PDF';

    generateBtn.addEventListener('click', () =>
      handleGenerate(report, listEl, progressWrap, generateBtn)
    );

    container.appendChild(listEl);
    container.appendChild(generateBtn);
    container.appendChild(progressWrap);
    return container;
  }

  // ══════════════════════════════════════════════════════════
  //  GENERAR INFORME FILTRADO
  // ══════════════════════════════════════════════════════════
  async function handleGenerate(report, listEl, progressWrap, btn) {
    const reportId = report.id;
    const checked = Array.from(listEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map(c => c.name);

    if (checked.length === 0) {
      showError('Selecciona al menos una anomalía para incluir en el informe.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Generando...';
    progressWrap.style.display = 'block';

    // Simular progreso visual
    const fill = document.getElementById(`fill-${reportId}`);
    if (fill) { fill.style.width = '0%'; animateProgress(fill, 85, 8000); }

    try {
      const res = await fetch(`${API_BASE}/api/reports/${reportId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedSectionIds: checked,
          dashboardName: params.get('dashboardName') || 'Informe Solar',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al generar el PDF');
      }

      if (fill) fill.style.width = '100%';

      // Descargar el PDF
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = report.originalName || `informe-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      btn.textContent = '✅ PDF Descargado';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = '⬇ Generar Informe PDF'; progressWrap.style.display = 'none'; }, 3000);

    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = '⬇ Generar Informe PDF';
      progressWrap.style.display = 'none';
    }
  }

  // ══════════════════════════════════════════════════════════
  //  UPLOAD SECTION (solo admin)
  // ══════════════════════════════════════════════════════════
  function renderUploadSection(container, dId) {
    const section = document.createElement('div');
    section.className = 'card upload-section';
    section.style.padding = '1.4rem 1.6rem';
    section.innerHTML = `
      <h3>📎 Subir nuevo informe PDF</h3>
      <div class="form-group" style="margin-bottom:.8rem;">
        <label for="pdfFileInput">Seleccionar PDF</label>
        <input type="file" id="pdfFileInput" accept="application/pdf"/>
        <span class="hint">Máximo 500 MB. Solo archivos .pdf</span>
      </div>
      <div class="action-row">
        <button class="btn-primary" id="uploadBtn">Subir PDF</button>
      </div>
      <div id="upload-feedback" style="margin-top:.8rem;font-size:.85rem;color:var(--clr-muted);"></div>
    `;

    container.appendChild(section);

    section.querySelector('#uploadBtn').addEventListener('click', () => uploadPDF(dId, section));
  }

  async function uploadPDF(dId, section) {
    const fileInput = section.querySelector('#pdfFileInput');
    const feedback  = section.querySelector('#upload-feedback');
    const btn       = section.querySelector('#uploadBtn');

    if (!fileInput.files[0]) {
      showError('Selecciona un archivo PDF primero.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Subiendo...';
    feedback.textContent = '';

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);

    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir el PDF');
      }
      feedback.textContent = '✅ PDF subido. El procesamiento comenzará en segundos. Recarga para ver el estado.';
      btn.textContent = '✅ Subido';
      setTimeout(() => location.reload(), 3000);
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Subir PDF';
    }
  }

  // ══════════════════════════════════════════════════════════
  //  ELIMINAR REPORTE
  // ══════════════════════════════════════════════════════════
  async function deleteReport(id, card) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar');
      card.remove();
    } catch (err) {
      showError(err.message);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  POLLING: actualizar estado del reporte
  // ══════════════════════════════════════════════════════════
  function pollReportStatus(id, card) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/reports/${id}`);
        const report = await res.json();
        if (report.status === 'READY' || report.status === 'FAILED') {
          clearInterval(interval);
          card.innerHTML = '';
          const newCard = buildReportCard(report);
          card.appendChild(...newCard.childNodes);
        }
      } catch (_) { clearInterval(interval); }
    }, 5000); // Cada 5 segundos
  }

  // ══════════════════════════════════════════════════════════
  //  UTILIDADES
  // ══════════════════════════════════════════════════════════
  function animateProgress(fillEl, targetPct, durationMs) {
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      const pct = Math.min((elapsed / durationMs) * targetPct, targetPct);
      fillEl.style.width = pct + '%';
      if (pct < targetPct) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

})();
