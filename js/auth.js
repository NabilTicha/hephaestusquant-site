const Auth = (() => {
  let _user = null;
  let _ready = false;
  const _listeners = [];
  
  async function init() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        _user = await res.json();
      }
    } catch (_) {}
    _ready = true;
    _listeners.forEach(fn => fn(_user));
    renderAuthUI();
  }

  function onReady(fn) {
    if (_ready) fn(_user);
    else _listeners.push(fn);
  }

  function getUser() { return _user; }
  function isLoggedIn() { return _user !== null; }

  function login() {
    window.location.href = '/api/auth/login';
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    _user = null;
    renderAuthUI();
    window.location.reload();
  }

  function renderAuthUI() {
    const container = document.getElementById('auth-ui');
    if (!container) return;

    if (_user) {
      container.innerHTML = `
        <div class="auth-user">
          <a href="/profile.html?id=${_user.id}" class="auth-avatar-link">
            <img src="${_user.picture}" alt="" class="auth-avatar" referrerpolicy="no-referrer" />
            <span class="auth-name">${_user.name}</span>
          </a>
          <button class="btn btn-sm" onclick="Auth.logout()">Sign out</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="Auth.login()">Sign in with TU Delft</button>
      `;
    }
  }

  function requireAuth() {
    if (!_ready) {
      onReady(() => requireAuth());
      return false;
    }
    if (!_user) {
      login();
      return false;
    }
    return true;
  }

  init();

  return { onReady, getUser, isLoggedIn, login, logout, requireAuth };
})();
