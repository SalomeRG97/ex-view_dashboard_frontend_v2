(() => {
  'use strict';

  // const API_BASE = 'http://localhost:3000';
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
      <a href="${API_BASE}/api/reports/${report.id}/original" download="${report.originalName || 'informe.pdf'}" class="btn-secondary" style="display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; padding: .45rem .9rem; margin-bottom: 1rem; text-decoration: none; color: inherit; font-weight: 500; border-radius: 6px;">
        ⬇ Descargar Original
      </a>

      <!-- VISOR DE PDF NATIVO EN IFRAME -->
      <div class="pdf-viewer-container" style="border: 1px solid var(--clr-border); border-radius: 8px; overflow: hidden; margin-bottom: 1rem; background: var(--clr-surface-2); height: 750px;">
        <iframe src="${API_BASE}/api/reports/${report.id}/original?inline=true" style="width: 100%; height: 100%; border: none;" allow="fullscreen"></iframe>
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
    btn.textContent = '⏳ Subiendo al servidor...';
    feedback.textContent = 'Transfiriendo archivo, esto puede tomar un momento...';

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
      
      const newReport = await res.json();
      
      feedback.textContent = '✅ Subida exitosa. Analizando anomalías...';
      btn.textContent = '⚙️ Procesando...';

      // Polling cada 1 segundo para verificar el estado
      const pollInterval = setInterval(async () => {
        try {
          // Usamos cache: 'no-store' para que el navegador NO guarde la respuesta antigua
          const checkRes = await fetch(`${API_BASE}/api/admin/dashboards/${dId}/reports`, { cache: 'no-store' });
          if (checkRes.ok) {
            const reports = await checkRes.json();
            const currentReport = reports.find(r => r.id === newReport.id);
            
            if (currentReport && currentReport.status === 'READY') {
              clearInterval(pollInterval);
              feedback.textContent = '🎉 ¡Análisis completo!';
              btn.textContent = '✅ ¡Listo!';
              
              // Recargar los reportes suavemente (sin refrescar el navegador)
              setTimeout(() => {
                loadDashboardReports(dId);
              }, 1000);
              
            } else if (currentReport && currentReport.status === 'FAILED') {
              clearInterval(pollInterval);
              showError('El procesamiento del documento falló.');
              btn.disabled = false;
              btn.textContent = 'Subir PDF';
              feedback.textContent = '';
            }
          }
        } catch (e) {
          console.error('Error polling status', e);
        }
      }, 1000);

    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Subir PDF';
      feedback.textContent = '';
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
