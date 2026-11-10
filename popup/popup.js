/**
 * NiHost Boîtes — popup logic
 * Renders the fleet (boîtes → servers), handles power actions,
 * console commands, backups, schedules and auto-refresh.
 */
(function () {
  'use strict';

  const api = globalThis.NiHostAPI;

  /* ── DOM refs ─────────────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const els = {
    noToken: $('#no-token'),
    main: $('#main'),
    boitesList: $('#boites-list'),
    errorBanner: $('#error-banner'),
    toast: $('#toast'),
    btnRefresh: $('#btn-refresh'),
    btnOptions: $('#btn-options'),
    btnOpenOptions: $('#btn-open-options'),
    accountEmail: $('#account-email'),
    lastRefresh: $('#last-refresh'),
    toggleAutoRefresh: $('#toggle-auto-refresh'),
    refreshInterval: $('#refresh-interval'),
    serverModal: $('#server-modal'),
    modalServerName: $('#modal-server-name'),
    modalBody: $('#modal-body'),
    modalClose: $('#modal-close'),
  };

  /* ── State ────────────────────────────────────────────── */
  let state = { boites: [], me: null };
  let refreshTimer = null;
  let toastTimer = null;
  let busyServers = new Set(); // server IDs with an in-flight action

  /* ── i18n ─────────────────────────────────────────────── */
  function t(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch { return key; }
  }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
  }

  /* ── Toast & errors ───────────────────────────────────── */
  function showToast(msg, ms = 2200) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
  }
  function showError(msg) {
    els.errorBanner.textContent = msg;
    els.errorBanner.classList.remove('hidden');
    setTimeout(() => els.errorBanner.classList.add('hidden'), 5000);
  }
  function clearError() {
    els.errorBanner.classList.add('hidden');
  }

  /* ── Formatting ───────────────────────────────────────── */
  function fmtMb(mb) { return api.formatMb(mb); }
  function fmtBytes(b) { return api.formatBytes(b); }
  function fmtDate(d) { return api.formatDate(d); }

  function statusBadge(status) {
    const info = api.statusInfo(status);
    const label = t(info.label);
    return `<span class="boite-status" style="background:${info.color}22;color:${info.color}">${info.icon} ${label}</span>`;
  }

  /* ── Rendering ────────────────────────────────────────── */

  function renderBoites() {
    if (!state.boites.length) {
      els.boitesList.innerHTML = `<div class="loading">${t('noBoites')}</div>`;
      return;
    }
    els.boitesList.innerHTML = '';
    state.boites.forEach((boite) => {
      els.boitesList.appendChild(renderBoiteCard(boite));
    });
  }

  function renderBoiteCard(boite) {
    const card = document.createElement('div');
    card.className = 'boite-card';
    card.dataset.boiteId = boite.id;

    const specs = boite.specs || {};
    const specsHtml = `
      <div class="boite-specs">
        <span>💾 <b>${fmtMb(specs.memoryMb)}</b></span>
        <span>⚡ <b>${specs.cpu ?? '—'}%</b></span>
        <span>💿 <b>${fmtMb(specs.diskMb)}</b></span>
        <span>🖥 <b>${specs.maxServers ?? '—'}</b></span>
      </div>`;

    card.innerHTML = `
      <div class="boite-header">
        <span class="boite-name">📦 ${escapeHtml(boite.name || boite.id)} ${statusBadge(boite.status)}</span>
        <span class="chevron">▼</span>
      </div>
      ${specsHtml}
      <div class="servers-list"></div>`;

    // Collapse toggle
    card.querySelector('.boite-header').addEventListener('click', () => {
      card.classList.toggle('collapsed');
    });

    // Render servers
    const list = card.querySelector('.servers-list');
    if (!boite.servers || !boite.servers.length) {
      list.innerHTML = `<div class="empty-note">${t('noServers')}</div>`;
    } else {
      boite.servers.forEach((srv) => list.appendChild(renderServerRow(srv, boite)));
    }
    return card;
  }

  function renderServerRow(server, boite) {
    const row = document.createElement('div');
    row.className = 'server-row';
    row.dataset.serverId = server.id;

    const info = api.statusInfo(server.status);
    const running = (server.status || '').toLowerCase() === 'running' || (server.status || '').toLowerCase() === 'online';
    const busy = busyServers.has(server.id);

    row.innerHTML = `
      <div class="server-info">
        <div class="server-name">
          <span class="server-status-dot" style="background:${info.color}"></span>
          ${escapeHtml(server.name || server.id)}
        </div>
        <div class="server-game">${escapeHtml(server.game || '')} · ${fmtMb(server.memoryMb)} · ${server.cpu ?? '—'}% CPU</div>
      </div>
      <div class="server-actions">
        <button class="pwr-btn start"    data-signal="start"   title="${t('start')}"   ${!running && !busy ? '' : 'disabled'}>▶</button>
        <button class="pwr-btn stop"     data-signal="stop"    title="${t('stop')}"    ${running && !busy ? '' : 'disabled'}>⏹</button>
        <button class="pwr-btn restart"  data-signal="restart" title="${t('restart')}" ${running && !busy ? '' : 'disabled'}>⟳</button>
        <button class="pwr-btn kill"     data-signal="kill"    title="${t('kill')}"    ${running && !busy ? '' : 'disabled'}>✕</button>
        <button class="pwr-btn detail"   data-action="detail"  title="Détails">⋯</button>
      </div>`;

    // Power buttons
    row.querySelectorAll('.pwr-btn[data-signal]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const signal = btn.dataset.signal;
        if (signal === 'kill' && !confirm(t('confirmKill'))) return;
        if (signal === 'stop' && !confirm(t('confirmStop'))) return;
        await sendPower(server.id, signal);
      });
    });

    // Detail button
    row.querySelector('.pwr-btn[data-action="detail"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openServerModal(server, boite);
    });

    return row;
  }

  /* ── Server modal ─────────────────────────────────────── */
  let currentModalServer = null;

  async function openServerModal(server, boite) {
    currentModalServer = server;
    els.modalServerName.textContent = server.name || server.id;
    els.serverModal.classList.remove('hidden');
    els.modalBody.innerHTML = `<div class="loading">${t('loading')}</div>`;

    // Fetch fresh detail + backups + schedules in parallel
    const [detail, backups, schedules] = await Promise.allSettled([
      api.apiServer(server.id),
      api.apiServerBackups(server.id),
      api.apiServerSchedules(server.id),
    ]);

    const d = detail.status === 'fulfilled' ? detail.value : server;
    const bks = backups.status === 'fulfilled' ? (backups.value.data || []) : [];
    const schs = schedules.status === 'fulfilled' ? (schedules.value.data || []) : [];

    renderModal(d, bks, schs, boite);
  }

  function renderModal(server, backups, schedules, boite) {
    const info = api.statusInfo(server.status);
    const running = (server.status || '').toLowerCase() === 'running';
    const busy = busyServers.has(server.id);

    const backupsHtml = backups.length
      ? backups.map((b) => `
          <div class="backup-item">
            <div>
              <div>💾 ${escapeHtml(b.name || b.id)}</div>
              <div class="meta">${fmtBytes(b.sizeBytes)} · ${fmtDate(b.completedAt)}</div>
            </div>
            <span class="${b.successful ? 'backup-success' : 'backup-failed'}">${b.successful ? '✓' : '✗'}</span>
          </div>`).join('')
      : `<div class="empty-note">—</div>`;

    const schedulesHtml = schedules.length
      ? schedules.map((s) => {
          const cron = s.cron ? `${s.cron.minute ?? '*'} ${s.cron.hour ?? '*'} * * ${s.cron.dayOfWeek ?? '*'}` : '';
          const actions = (s.actions || []).map((a) => `${a.action}:${a.payload}`).join(', ');
          return `
          <div class="schedule-item">
            <div>
              <div>⏰ ${escapeHtml(s.name || `#${s.id}`)} <span class="${s.active ? 'schedule-active' : 'schedule-inactive'}">${s.active ? '●' : '○'}</span></div>
              <div class="cron">${escapeHtml(cron)}</div>
              <div class="next">${t('lastRefresh')}: ${fmtDate(s.lastRunAt)} → next ${fmtDate(s.nextRunAt)}</div>
              ${actions ? `<div class="next">${escapeHtml(actions)}</div>` : ''}
            </div>
          </div>`;
        }).join('')
      : `<div class="empty-note">—</div>`;

    els.modalBody.innerHTML = `
      <!-- Identity -->
      <div class="detail-section">
        <h3>${escapeHtml(server.name || server.id)} ${statusBadge(server.status)}</h3>
        <div class="id-row">
          <span>${t('serverId')}:</span>
          <code>${escapeHtml(server.id)}</code>
          <button class="btn ghost small" id="copy-server-id">${t('copyId')}</button>
        </div>
      </div>

      <!-- Specs -->
      <div class="detail-section">
        <h3>Specs</h3>
        <div class="detail-grid">
          <span class="label">${t('game')}</span><span class="value">${escapeHtml(server.game || '—')}</span>
          <span class="label">${t('memory')}</span><span class="value">${fmtMb(server.memoryMb)}</span>
          <span class="label">${t('cpu')}</span><span class="value">${server.cpu ?? '—'}%</span>
          <span class="label">${t('disk')}</span><span class="value">${fmtMb(server.diskMb)}</span>
          ${server.boiteId ? `<span class="label">Boîte</span><span class="value">${escapeHtml(boite?.name || server.boiteId)}</span>` : ''}
        </div>
      </div>

      <!-- Power -->
      <div class="detail-section">
        <h3>${t('power')}</h3>
        <div class="power-grid">
          <button class="btn primary" data-signal="start"   ${!running && !busy ? '' : 'disabled'}>▶ ${t('start')}</button>
          <button class="btn ghost"   data-signal="stop"    ${running && !busy ? '' : 'disabled'}>⏹ ${t('stop')}</button>
          <button class="btn ghost"   data-signal="restart" ${running && !busy ? '' : 'disabled'}>⟳ ${t('restart')}</button>
          <button class="btn danger"  data-signal="kill"    ${running && !busy ? '' : 'disabled'}>✕ ${t('kill')}</button>
        </div>
      </div>

      <!-- Console -->
      <div class="detail-section">
        <h3>${t('console')}</h3>
        <div class="command-row">
          <input type="text" id="cmd-input" maxlength="500" placeholder="${t('commandPlaceholder')}" ${running && !busy ? '' : 'disabled'} />
          <button class="btn primary" id="cmd-send" ${running && !busy ? '' : 'disabled'}>${t('sendCommand')}</button>
        </div>
      </div>

      <!-- Backup -->
      <div class="detail-section">
        <h3>${t('backups')}</h3>
        <div class="backup-row">
          <input type="text" id="backup-name" maxlength="100" placeholder="${t('backupName')}" />
          <button class="btn primary" id="backup-trigger" ${!busy ? '' : 'disabled'}>${t('triggerBackup')}</button>
        </div>
        ${backupsHtml}
      </div>

      <!-- Schedules -->
      <div class="detail-section">
        <h3>${t('schedules')}</h3>
        ${schedulesHtml}
      </div>
    `;

    // Wire modal events
    els.modalBody.querySelector('#copy-server-id').addEventListener('click', async () => {
      await navigator.clipboard.writeText(server.id);
      showToast(t('copied'));
    });

    els.modalBody.querySelectorAll('.power-grid .btn[data-signal]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const signal = btn.dataset.signal;
        if (signal === 'kill' && !confirm(t('confirmKill'))) return;
        if (signal === 'stop' && !confirm(t('confirmStop'))) return;
        await sendPower(server.id, signal);
        openServerModal(server, boite); // re-render
      });
    });

    const cmdInput = els.modalBody.querySelector('#cmd-input');
    const cmdSend = els.modalBody.querySelector('#cmd-send');
    const sendCmd = async () => {
      const cmd = cmdInput.value.trim();
      if (!cmd) return;
      cmdSend.disabled = true;
      try {
        await api.apiServerCommand(server.id, cmd);
        showToast(t('commandSent'));
        cmdInput.value = '';
      } catch (e) {
        showError(`${t('error')}: ${e.message}`);
      } finally {
        cmdSend.disabled = false;
      }
    };
    cmdSend.addEventListener('click', sendCmd);
    cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCmd(); });

    const backupName = els.modalBody.querySelector('#backup-name');
    const backupBtn = els.modalBody.querySelector('#backup-trigger');
    backupBtn.addEventListener('click', async () => {
      backupBtn.disabled = true;
      try {
        await api.apiServerBackup(server.id, backupName.value.trim() || undefined);
        showToast(t('backupStarted'));
        backupName.value = '';
        openServerModal(server, boite);
      } catch (e) {
        showError(`${t('error')}: ${e.message}`);
      } finally {
        backupBtn.disabled = false;
      }
    });
  }

  /* ── Actions ──────────────────────────────────────────── */

  async function sendPower(serverId, signal) {
    busyServers.add(serverId);
    refreshBusyUI();
    try {
      await api.apiServerPower(serverId, signal);
      showToast(`${t('actionSent')}: ${signal}`);
      await refreshData(false);
    } catch (e) {
      if (e.status === 429) {
        showError(`Rate limit — réessayez dans ${e.retryAfter || '?'}s`);
      } else {
        showError(`${t('error')} (${e.status}): ${e.message}`);
      }
    } finally {
      busyServers.delete(serverId);
      refreshBusyUI();
    }
  }

  function refreshBusyUI() {
    document.querySelectorAll('.server-row').forEach((row) => {
      const id = row.dataset.serverId;
      const busy = busyServers.has(id);
      row.querySelectorAll('.pwr-btn').forEach((b) => { b.disabled = busy; });
    });
  }

  /* ── Data fetching ────────────────────────────────────── */

  async function refreshData(spin = true) {
    if (spin) {
      els.btnRefresh.classList.add('spinning');
      els.btnRefresh.textContent = '⟳';
    }
    clearError();
    try {
      const token = await api.getToken();
      if (!token) {
        els.noToken.classList.remove('hidden');
        els.main.classList.add('hidden');
        return;
      }
      els.noToken.classList.add('hidden');
      els.main.classList.remove('hidden');

      const data = await api.apiFullState();
      state = data;
      els.accountEmail.textContent = data.me?.email || '';
      els.lastRefresh.textContent = `${t('lastRefresh')}: ${new Date().toLocaleTimeString()}`;
      renderBoites();

      // Persist last state for the badge
      await chrome.storage.local.set({
        [api.STORAGE_KEYS.LAST_STATE]: {
          at: Date.now(),
          boites: data.boites.map((b) => ({
            id: b.id, name: b.name, status: b.status,
            servers: (b.servers || []).map((s) => ({ id: s.id, name: s.name, status: s.status })),
          })),
        },
      });
    } catch (e) {
      if (e.code === 'NO_TOKEN' || e.status === 401) {
        els.noToken.classList.remove('hidden');
        els.main.classList.add('hidden');
      } else {
        els.boitesList.innerHTML = `<div class="loading">${t('error')}: ${escapeHtml(e.message)}</div>`;
        if (e.status && e.status !== 401) showError(`${e.status}: ${e.message}`);
      }
    } finally {
      if (spin) {
        els.btnRefresh.classList.remove('spinning');
      }
    }
  }

  /* ── Auto-refresh ─────────────────────────────────────── */

  async function setupAutoRefresh() {
    const settings = await api.getSettings();
    els.toggleAutoRefresh.checked = settings.autoRefresh;
    els.refreshInterval.value = settings.refreshInterval;

    els.toggleAutoRefresh.addEventListener('change', async () => {
      await api.setSettings({ autoRefresh: els.toggleAutoRefresh.checked });
      scheduleRefresh();
    });
    els.refreshInterval.addEventListener('change', async () => {
      const v = Math.max(10, Math.min(600, parseInt(els.refreshInterval.value, 10) || 30));
      els.refreshInterval.value = v;
      await api.setSettings({ refreshInterval: v });
      scheduleRefresh();
    });

    scheduleRefresh();
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = null;
    if (!els.toggleAutoRefresh.checked) return;
    const secs = parseInt(els.refreshInterval.value, 10) || 30;
    refreshTimer = setInterval(() => refreshData(false), secs * 1000);
  }

  /* ── Utils ────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Init ─────────────────────────────────────────────── */

  function init() {
    applyI18n();

    els.btnRefresh.addEventListener('click', () => refreshData(true));
    els.btnOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
    els.btnOpenOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
    els.modalClose.addEventListener('click', () => els.serverModal.classList.add('hidden'));
    els.serverModal.addEventListener('click', (e) => {
      if (e.target === els.serverModal) els.serverModal.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') els.serverModal.classList.add('hidden');
    });

    // Listen for refresh command from the background worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'REFRESH_ALL') refreshData(true);
    });

    setupAutoRefresh();
    refreshData(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
