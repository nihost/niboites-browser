/**
 * NiBoites — options page logic
 * Save / test / clear the API token and configure auto-refresh.
 */
(function () {
  'use strict';

  const api = globalThis.NiHostAPI;

  const $ = (sel) => document.querySelector(sel);
  const els = {
    tokenInput: $('#token-input'),
    btnSave: $('#btn-save'),
    btnTest: $('#btn-test'),
    btnClear: $('#btn-clear'),
    tokenStatus: $('#token-status'),
    tokenScopes: $('#token-scopes'),
    savedFlash: $('#saved-flash'),
    optAutoRefresh: $('#opt-auto-refresh'),
    optInterval: $('#opt-interval'),
    btnSaveSettings: $('#btn-save-settings'),
    settingsFlash: $('#settings-flash'),
  };

  function t(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch { return key; }
  }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
  }

  function flash(el) {
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
  }

  function setStatus(msg, ok) {
    els.tokenStatus.textContent = msg;
    els.tokenStatus.className = 'status-msg ' + (ok ? 'status-ok' : 'status-err');
  }

  function renderScopes(scopes) {
    els.tokenScopes.innerHTML = (scopes || [])
      .map((s) => `<span class="scope-chip">${s}</span>`).join('');
  }

  async function load() {
    const token = await api.getToken();
    if (token) els.tokenInput.value = token;

    const settings = await api.getSettings();
    els.optAutoRefresh.checked = settings.autoRefresh;
    els.optInterval.value = settings.refreshInterval;

    // If we have a token, test it silently to show identity
    if (token) {
      try {
        const me = await api.apiMe();
        setStatus(`${t('tokenValid')} — ${me.email}`, true);
        renderScopes(me.token?.scopes);
      } catch (e) {
        setStatus(`${t('tokenInvalid')} (${e.status})`, false);
      }
    }
  }

  els.btnSave.addEventListener('click', async () => {
    const token = els.tokenInput.value.trim();
    if (!token) { setStatus('Token vide', false); return; }
    await api.setToken(token);
    flash(els.savedFlash);
    setStatus(t('saved'), true);
    renderScopes([]);
  });

  els.btnTest.addEventListener('click', async () => {
    const token = els.tokenInput.value.trim();
    if (!token) { setStatus('Token vide', false); return; }
    setStatus('Test en cours…', true);
    try {
      const me = await api.apiMe(token);
      await api.setToken(token);
      setStatus(`${t('tokenValid')} — ${me.email}`, true);
      renderScopes(me.token?.scopes);
    } catch (e) {
      setStatus(`${t('tokenInvalid')} (${e.status}): ${e.message}`, false);
    }
  });

  els.btnClear.addEventListener('click', async () => {
    await api.clearToken();
    els.tokenInput.value = '';
    setStatus('Token supprimé.', true);
    renderScopes([]);
  });

  els.btnSaveSettings.addEventListener('click', async () => {
    const interval = Math.max(10, Math.min(600, parseInt(els.optInterval.value, 10) || 30));
    els.optInterval.value = interval;
    await api.setSettings({
      autoRefresh: els.optAutoRefresh.checked,
      refreshInterval: interval,
    });
    flash(els.settingsFlash);
  });

  document.addEventListener('DOMContentLoaded', () => {
    applyI18n();
    load();
  });
})();
