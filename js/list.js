(() => {
  'use strict';

  if (sessionStorage.getItem('admin_logged_in') !== 'true') {
    window.location.replace('login.html');
    return;
  }

  const API_BASE = 'http://localhost:3000';
  // const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

  const tbody = document.getElementById('dashboards-table-body');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.hidden = false;
  }

  async function loadDashboards() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboards`);
      if (!res.ok) throw new Error('Error al obtener la lista de dashboards');
      const dashboards = await res.json();
      
      tbody.innerHTML = '';
      
      if (dashboards.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay dashboards guardados</td></tr>';
        return;
      }

      dashboards.forEach(d => {
        const tr = document.createElement('tr');
        
        // Format Date
        const dateObj = new Date(d.createdAt);
        const dateStr = dateObj.toLocaleDateString();
        
        // Recreate Dashboard URL
        let dashboardUrl = '#';
        if (d.formData) {
          // Utilizar la lógica actual de URLs
          const params = new URLSearchParams({
            id: d.id,
            installation: d.formData.installation || d.installationName || '',
            total_paneles: d.formData.total_paneles || '',
            modulos_desconectados: d.formData.modulos_desconectados || '0',
            capacidad_instalada_mw: d.formData.capacidad_instalada_mw || d.formData.capacidad_raw || '',
            unidad: d.formData.unidad || 'MW'
          });
          if (d.formData.files_url) params.set('files_url', d.formData.files_url);
          
          dashboardUrl = `dashboard.html?${params.toString()}`;
        }
        
        const absoluteUrl = new URL(dashboardUrl, window.location.origin).href;
        
        const name1 = d.installationName || d.formData?.installation || '-';
        const name2 = d.formData?.installation || '-';

        tr.innerHTML = `
          <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name1}">${name1}</td>
          <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name2}">${name2}</td>
          <td>${dateStr}</td>
          <td>
            <div class="actions-col">
              <button class="btn-view" onclick="window.open('${dashboardUrl}', '_blank')" title="Ver Dashboard">Ver</button>
              <button class="btn-copy-link" data-url="${absoluteUrl}" title="Copiar enlace del dashboard">Copiar Link</button>
            </div>
          </td>
          <td>
            <div class="actions-col">
              <button class="btn-edit" onclick="window.location.href='admin.html?editId=${d.id}'" title="Editar Configuración">Editar</button>
              <button class="btn-delete btn-delete-action" data-id="${d.id}" title="Eliminar Dashboard">Eliminar</button>
            </div>
          </td>
          <td>
            <div class="actions-col">
              <button class="btn-reports" onclick="window.location.href='reports.html?dashboardId=${d.id}&dashboardName=${encodeURIComponent(d.installationName || '')}'" title="Informes PDF">📄 Informes</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      // Bind delete events
      document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('¿Estás seguro de que deseas eliminar este dashboard? Esta acción no se puede deshacer.')) {
            await deleteDashboard(id);
          }
        });
      });

      // Bind copy link events
      document.querySelectorAll('.btn-copy-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const url = e.currentTarget.getAttribute('data-url');
          try {
            await navigator.clipboard.writeText(url);
            const originalText = e.currentTarget.innerHTML;
            e.currentTarget.innerHTML = '¡Copiado!';
            setTimeout(() => {
              e.currentTarget.innerHTML = originalText;
            }, 2000);
          } catch {
            prompt('Copia este enlace:', url);
          }
        });
      });
      
    } catch (err) {
      showError(err.message);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#e74c3c;">Error al cargar</td></tr>';
    }
  }

  async function deleteDashboard(id) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboards/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('No se pudo eliminar el dashboard');
      
      // Refresh list
      loadDashboards();
    } catch (err) {
      showError(err.message);
    }
  }

  // Init
  loadDashboards();

})();
