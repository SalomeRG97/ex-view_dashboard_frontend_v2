(() => {
  'use strict';

  const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';
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
      const res = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`, { cache: 'no-store' });
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
    
    originalSection.innerHTML = `
      <h3 style="font-size: .88rem; font-weight: 700; margin-bottom: .4rem; display: flex; align-items: center; gap: 6px;">
        📄 Informe Original Completo
      </h3>
      <p style="font-size: .78rem; color: var(--clr-muted); margin-bottom: .8rem; line-height: 1.4;">
        Visualiza o descarga el informe original tal como fue cargado inicialmente, sin filtros ni modificaciones de páginas.
      </p>
      <div style="display: flex; gap: .5rem; margin-bottom: 1rem;">
        <a href="${API_BASE}/api/reports/${report.id}/original" download="${report.originalName || 'informe.pdf'}" class="btn-secondary" style="display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; padding: .45rem .9rem; text-decoration: none; color: inherit; font-weight: 500; border-radius: 6px;">
          ⬇ Descargar Original
        </a>
        <!-- <button class="btn-secondary" onclick="document.getElementById('pdf-iframe-${report.id}').requestFullscreen()" style="display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; padding: .45rem .9rem; font-weight: 500; border-radius: 6px;">
          ⛶ Pantalla Completa
        </button> -->
      </div>

      <!-- VISOR DE PDF NATIVO EN IFRAME -->
      <div class="pdf-viewer-container" style="border: 1px solid var(--clr-border); border-radius: 8px; overflow: hidden; margin-bottom: 1rem; background: var(--clr-surface-2); height: 750px;">
        <iframe id="pdf-iframe-${report.id}" src="${API_BASE}/api/reports/${report.id}/original?inline=true" style="width: 100%; height: 100%; border: none;" allow="fullscreen"></iframe>
      </div>
    `;

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
    customDesc.innerHTML = 'Selecciona las anomalías que deseas incluir en el nuevo reporte. El documento se generará dinámicamente con una tabla de contenido limpia y numeración corregida.' +
      '<br><br><b>⚠️ Nota importante: Les recordamos que el informe que se entrega es completo en su versión base. La plataforma permite aplicar filtros para ajustarlo a las necesidades específicas de cada usuario. Queremos subrayar que cualquier ajuste o filtrado que se aplique es responsabilidad de ustedes. Les recomendamos verificar que no se omitan datos clave, de cara al análisis final del cliente. Muchas gracias por su atención.</b>';

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
        <span class="hint">Hasta 2 GB. Archivos grandes se suben por fragmentos automáticamente.</span>

        <!-- Barra de progreso (visible solo durante la subida) -->
        <div id="uploadProgressWrap" style="display:none;margin-top:.85rem;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.35rem;">
            <span id="uploadProgressLabel" style="font-size:.82rem;font-weight:600;color:var(--clr-text);">Subiendo PDF...</span>
            <span id="uploadProgressPct" style="font-size:.82rem;color:var(--clr-accent,#6366f1);font-weight:700;">0%</span>
          </div>
          <div style="height:8px;background:var(--clr-border,#e2e8f0);border-radius:999px;overflow:hidden;">
            <div id="uploadProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:999px;transition:width .3s ease;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:.3rem;">
            <span id="uploadProgressBytes" style="font-size:.76rem;color:var(--clr-muted,#94a3b8);">0 MB / 0 MB</span>
            <span id="uploadProgressSpeed" style="font-size:.76rem;color:var(--clr-muted,#94a3b8);"></span>
          </div>
        </div>
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

    try {
      await chunkedUpload(fileInput.files[0], dId, btn, section);

      feedback.textContent = '✅ Subida exitosa. Analizando anomalías...';
      btn.textContent = '⚙️ Procesando...';

      // Obtener el ID del reporte recién creado para hacer polling
      const checkRes = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`, { cache: 'no-store' });
      const reports  = await checkRes.json();
      const newReport = reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      if (newReport) {
        const pollInterval = setInterval(async () => {
          try {
            const checkRes2 = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`, { cache: 'no-store' });
            if (checkRes2.ok) {
              const updated = await checkRes2.json();
              const current = updated.find(r => r.id === newReport.id);
              if (current && current.status === 'READY') {
                clearInterval(pollInterval);
                feedback.textContent = '🎉 ¡Análisis completo!';
                btn.textContent = '✅ ¡Listo!';
                setTimeout(() => loadDashboardReports(dId), 1000);
              } else if (current && current.status === 'FAILED') {
                clearInterval(pollInterval);
                showError('El procesamiento del documento falló.');
                btn.disabled = false;
                btn.textContent = 'Subir PDF';
                feedback.textContent = '';
              }
            }
          } catch (e) { console.error('Error polling status', e); }
        }, 1000);
      }

    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Subir PDF';
      feedback.textContent = '';
    } finally {
      hideUploadProgress(section);
    }
  }

  // ════════════════════════════════════════════════════════
  //  CHUNKED UPLOAD
  // ════════════════════════════════════════════════════════
  /**
   * Sube un archivo PDF en fragmentos de 10 MB.
   * Muestra progreso en tiempo real (%, MB, velocidad).
   * @param {File}        file      - Archivo seleccionado
   * @param {string}      dId       - dashboardId destino
   * @param {HTMLElement} btn       - Botón de subida (para texto de estado)
   * @param {HTMLElement} container - Contenedor con los elementos de progreso
   */
  async function chunkedUpload(file, dId, btn, container) {
    const CHUNK_SIZE  = 10 * 1024 * 1024; // 10 MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const totalMB     = (file.size / (1024 * 1024)).toFixed(1);

    // 1. Iniciar sesión
    btn.textContent = `Iniciando subida (${totalMB} MB)...`;
    const initRes = await fetch(
      `${API_BASE}/api/admin/dashboards/${dId}/reports/chunks`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileName: file.name, totalChunks }),
      }
    );
    if (!initRes.ok) {
      const body = await initRes.text();
      throw new Error(`Error al iniciar upload: ${body || initRes.statusText}`);
    }
    const { uploadId } = await initRes.json();

    // 2. Mostrar barra de progreso
    showUploadProgress(container);
    const startTime = Date.now();
    let uploadedBytes = 0;

    // 3. Subir chunks secuencialmente
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end   = Math.min(start + CHUNK_SIZE, file.size);
      const blob  = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', blob, `chunk-${i}.bin`);

      const chunkRes = await fetch(
        `${API_BASE}/api/admin/dashboards/${dId}/reports/chunks/${uploadId}/${i}`,
        { method: 'PUT', body: formData }
      );
      if (!chunkRes.ok) {
        const body = await chunkRes.text();
        throw new Error(`Error en chunk ${i}: ${body || chunkRes.statusText}`);
      }

      uploadedBytes += (end - start);
      const pct        = Math.round((uploadedBytes / file.size) * 100);
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMBps  = elapsedSec > 0 ? ((uploadedBytes / (1024 * 1024)) / elapsedSec).toFixed(1) : '...';
      const uploadedMB = (uploadedBytes / (1024 * 1024)).toFixed(1);

      updateUploadProgress(container, pct, uploadedMB, totalMB, speedMBps);
      btn.textContent = `Subiendo PDF ${pct}%...`;
    }

    // 4. Completar (ensamblar)
    btn.textContent = 'Ensamblando PDF...';
    updateUploadProgress(container, 100, totalMB, totalMB, '—');
    setUploadLabel(container, 'Ensamblando en el servidor...');

    const completeRes = await fetch(
      `${API_BASE}/api/admin/dashboards/${dId}/reports/chunks/${uploadId}/complete`,
      { method: 'POST' }
    );
    if (!completeRes.ok) {
      const body = await completeRes.text();
      throw new Error(`Error al ensamblar el PDF: ${body || completeRes.statusText}`);
    }

    console.log('[reports.js] Chunked upload completado.');
  }

  // ─ Helpers de progreso ───────────────────────────────────────────
  function showUploadProgress(container) {
    const el = container.querySelector('#uploadProgressWrap');
    if (el) el.style.display = 'block';
  }
  function hideUploadProgress(container) {
    const el = container.querySelector('#uploadProgressWrap');
    if (el) el.style.display = 'none';
    updateUploadProgress(container, 0, '0', '0', '');
  }
  function setUploadLabel(container, text) {
    const el = container.querySelector('#uploadProgressLabel');
    if (el) el.textContent = text;
  }
  function updateUploadProgress(container, pct, uploadedMB, totalMB, speedMBps) {
    const bar   = container.querySelector('#uploadProgressBar');
    const pctEl = container.querySelector('#uploadProgressPct');
    const bytes = container.querySelector('#uploadProgressBytes');
    const speed = container.querySelector('#uploadProgressSpeed');
    if (bar)   bar.style.width        = pct + '%';
    if (pctEl) pctEl.textContent      = pct + '%';
    if (bytes) bytes.textContent      = `${uploadedMB} MB / ${totalMB} MB`;
    if (speed) speed.textContent      = (speedMBps && speedMBps !== '—') ? `${speedMBps} MB/s` : '';
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
