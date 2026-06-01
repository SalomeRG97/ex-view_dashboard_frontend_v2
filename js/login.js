/* ═══════════════════════════════════════════════════════════
   EX-VIEW Solar — Login JS
   Controla el acceso simple por sessionStorage
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // Si ya está logueado, redirigir al admin
  if (sessionStorage.getItem('admin_logged_in') === 'true') {
    window.location.replace('admin.html');
    return;
  }

  // ── URL del backend ───────────────────────────────────────
  // const API_BASE = 'http://localhost:3000';
  const API_BASE = 'https://ex-view-dashboard-backend-v2.onrender.com';

  const form = document.getElementById('loginForm');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = submitBtn.querySelector('.btn-text');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBanner.hidden = true;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) return;

    // Loading state
    submitBtn.disabled = true;
    btnText.textContent = 'Verificando...';

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        sessionStorage.setItem('admin_logged_in', 'true');
        window.location.replace('admin.html');
      } else {
        errorMessage.textContent = data.error || 'Credenciales incorrectas.';
        errorBanner.hidden = false;
      }
    } catch (err) {
      errorMessage.textContent = 'Error de conexión con el servidor.';
      errorBanner.hidden = false;
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'Entrar';
    }
  });

})();
