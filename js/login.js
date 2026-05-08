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

  const form = document.getElementById('loginForm');
  const errorBanner = document.getElementById('errorBanner');
  const errorMessage = document.getElementById('errorMessage');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBanner.hidden = true;

    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();

    // Credenciales hardcodeadas (MVP) - CÁMBIALAS EN PRODUCCIÓN
    const ADMIN_USER = 'admin';
    const ADMIN_PASS = 'solar2024';

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem('admin_logged_in', 'true');
      window.location.replace('admin.html');
    } else {
      errorMessage.textContent = 'Credenciales incorrectas.';
      errorBanner.hidden = false;
    }
  });

})();
