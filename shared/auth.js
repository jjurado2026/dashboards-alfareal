/**
 * auth.js — Simple client-side password gate for dashboards
 * Include this script BEFORE any other content renders.
 * Password hash is SHA-256 of the actual password.
 */
(function() {
  const HASH = '42f63a652abb6f97e2367f954cd9b3cf00a7d47dca0245922ef4c1077a9959ca';
  const STORAGE_KEY = 'dashboard_auth_token';
  const EXPIRY_HOURS = 72; // Stay logged in for 72 hours

  // Check if already authenticated
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const { hash, expires } = JSON.parse(stored);
      if (hash === HASH && new Date(expires) > new Date()) {
        return; // Authenticated, let page render
      }
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEY);
  }

  // Block the page and show login
  document.documentElement.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <style>
      #auth-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: #F5F0E8;
        z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Nunito', 'Montserrat', sans-serif;
      }
      #auth-box {
        background: #fff;
        border-radius: 16px;
        padding: 48px 40px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        text-align: center;
        max-width: 380px;
        width: 90%;
      }
      #auth-box h2 {
        font-size: 1.3rem;
        font-weight: 700;
        color: #1A1A1A;
        margin-bottom: 8px;
      }
      #auth-box p {
        font-size: 0.85rem;
        color: #6B6B6B;
        margin-bottom: 24px;
      }
      #auth-input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #E5E7EB;
        border-radius: 10px;
        font-size: 1rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
      }
      #auth-input:focus { border-color: #2D5016; }
      #auth-input.error { border-color: #B91C1C; }
      #auth-btn {
        margin-top: 16px;
        width: 100%;
        padding: 12px;
        background: #2D5016;
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 0.95rem;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        transition: opacity 0.2s;
      }
      #auth-btn:hover { opacity: 0.85; }
      #auth-error {
        margin-top: 12px;
        font-size: 0.82rem;
        color: #B91C1C;
        display: none;
      }
    </style>
    <div id="auth-box">
      <h2>Acceso al Dashboard</h2>
      <p>Introduce la contraseña para continuar</p>
      <input type="password" id="auth-input" placeholder="Contraseña" autocomplete="current-password">
      <button id="auth-btn">Acceder</button>
      <div id="auth-error">Contraseña incorrecta</div>
    </div>
  `;

  document.body.prepend(overlay);

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function tryLogin() {
    const input = document.getElementById('auth-input');
    const errorEl = document.getElementById('auth-error');
    const hash = await sha256(input.value);

    if (hash === HASH) {
      const expires = new Date();
      expires.setHours(expires.getHours() + EXPIRY_HOURS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ hash: HASH, expires: expires.toISOString() }));
      overlay.remove();
      document.documentElement.style.overflow = '';
    } else {
      input.classList.add('error');
      errorEl.style.display = 'block';
      input.value = '';
      input.focus();
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('auth-btn').addEventListener('click', tryLogin);
      document.getElementById('auth-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') tryLogin();
      });
      document.getElementById('auth-input').focus();
    });
  } else {
    document.getElementById('auth-btn').addEventListener('click', tryLogin);
    document.getElementById('auth-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') tryLogin();
    });
    document.getElementById('auth-input').focus();
  }
})();
