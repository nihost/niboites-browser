/**
 * NiBoites — popup logic
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
    btnTheme: $('#btn-theme'),
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
        <span>RAM <b>${fmtMb(specs.memoryMb)}</b></span>
        <span>CPU <b>${specs.cpu ?? '—'}%</b></span>
        <span>Disque <b>${fmtMb(specs.diskMb)}</b></span>
        <span>Serveurs max <b>${specs.maxServers ?? '—'}</b></span>
      </div>`;

    card.innerHTML = `
      <div class="boite-header" tabindex="0" role="button" aria-expanded="true" aria-label="${escapeHtml(boite.name || boite.id)}">
        <span class="boite-name">${escapeHtml(boite.name || boite.id)} ${statusBadge(boite.status)}</span>
        <span class="chevron">▼</span>
      </div>
      ${specsHtml}
      <div class="servers-list"></div>`;

    // Collapse toggle (souris + clavier Entrée/Espace — a11y)
    const header = card.querySelector('.boite-header');
    const toggle = () => {
      card.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', card.classList.contains('collapsed') ? 'false' : 'true');
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
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
        <button class="pwr-btn stop"     data-signal="stop"    title="${t('stop')}"    ${running && !busy ? '' : 'disabled'}>■</button>
        <button class="pwr-btn restart"  data-signal="restart" title="${t('restart')}" ${running && !busy ? '' : 'disabled'}>↻</button>
        <button class="pwr-btn kill"     data-signal="kill"    title="${t('kill')}"    ${running && !busy ? '' : 'disabled'}>✕</button>
        <button class="pwr-btn detail"   data-action="detail"  title="Détails">…</button>
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
    els.modalClose.focus(); // a11y : focus dans la modale à l'ouverture
    els.modalBody.innerHTML = `<div class="loading">${t('loading')}</div>`;

    // Fetch fresh detail + backups + schedules + metrics + sftp in parallel
    const [detail, backups, schedules, metrics, sftp] = await Promise.allSettled([
      api.apiServer(server.id),
      api.apiServerBackups(server.id),
      api.apiServerSchedules(server.id),
      api.apiServerMetrics(server.id),
      api.apiServerSftp(server.id),
    ]);

    const d = detail.status === 'fulfilled' ? detail.value : server;
    const bks = backups.status === 'fulfilled' ? (backups.value.data || []) : [];
    const schs = schedules.status === 'fulfilled' ? (schedules.value.data || []) : [];
    const met = metrics.status === 'fulfilled' ? metrics.value : null;
    const sftpInfo = sftp.status === 'fulfilled' ? sftp.value : null;

    renderModal(d, bks, schs, met, sftpInfo, boite);
  }

  function meter(label, used, total, unit) {
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return `
      <div class="meter-row">
        <span class="meter-label">${label}</span>
        <span class="meter"><span class="meter-fill" style="width:${pct}%"></span></span>
        <span class="meter-val">${used} / ${total} ${unit} (${pct}%)</span>
      </div>`;
  }

  function renderModal(server, backups, schedules, metrics, sftpInfo, boite) {
    const info = api.statusInfo(server.status);
    const running = (server.status || '').toLowerCase() === 'running';
    const busy = busyServers.has(server.id);

    // Métriques courantes (GET /metrics)
    const metricsHtml = metrics
      ? `
        <div class="detail-grid" style="margin-bottom:6px">
          <span class="label">${t('state')}</span><span class="value">${escapeHtml(metrics.state ?? '—')}</span>
          <span class="label">${t('cpuUsage')}</span><span class="value">${metrics.cpuPercent ?? '—'}%</span>
        </div>
        ${meter(t('ramUsage'), metrics.memoryMb?.used ?? 0, metrics.memoryMb?.total ?? 0, 'Mo')}
        ${meter(t('diskUsage'), metrics.diskMb?.used ?? 0, metrics.diskMb?.total ?? 0, 'Mo')}`
      : `<div class="empty-note">${t('metricsUnavailable')}</div>`;

    // SFTP (GET /sftp) — le mot de passe n'est jamais exposé par l'API
    const sftpHtml = sftpInfo
      ? `
        <div class="detail-grid">
          <span class="label">Hôte</span><span class="value">${escapeHtml(sftpInfo.host ?? '—')}:${sftpInfo.port ?? 22}</span>
          <span class="label">${t('sftpUser')}</span><span class="value"><code>${escapeHtml(sftpInfo.username ?? '—')}</code></span>
        </div>
        <div class="empty-note" style="text-align:left">${t('sftpHint')}</div>`
      : '';

    const backupsHtml = backups.length
      ? backups.map((b) => `
          <div class="backup-item">
            <div>
              <div>${escapeHtml(b.name || b.id)}</div>
              <div class="meta">${fmtBytes(b.sizeBytes)} · ${fmtDate(b.completedAt)}</div>
            </div>
            <div class="item-actions">
              <span class="${b.successful ? 'backup-success' : 'backup-failed'}">${b.successful ? '✓' : '✗'}</span>
              <button class="pwr-btn restart" data-backup-restore="${escapeHtml(b.id)}" title="${t('restore')}">↺</button>
              <button class="pwr-btn kill" data-backup-delete="${escapeHtml(b.id)}" title="${t('delete')}">✕</button>
            </div>
          </div>`).join('')
      : `<div class="empty-note">—</div>`;

    const schedulesHtml = schedules.length
      ? schedules.map((s) => {
          const cron = s.cron ? `${s.cron.minute ?? '*'} ${s.cron.hour ?? '*'} * * ${s.cron.dayOfWeek ?? '*'}` : '';
          const actions = (s.actions || []).map((a) => `${a.action}${a.payload ? ':' + a.payload : ''}`).join(', ');
          return `
          <div class="schedule-item">
            <div>
              <div>${escapeHtml(s.name || `#${s.id}`)} <span class="${s.active ? 'schedule-active' : 'schedule-inactive'}">${s.active ? t('active') : t('inactive')}</span></div>
              <div class="cron">${escapeHtml(cron)}</div>
              <div class="next">dernier : ${fmtDate(s.lastRunAt)} · suivant : ${fmtDate(s.nextRunAt)}</div>
              ${actions ? `<div class="next">${escapeHtml(actions)}</div>` : ''}
            </div>
            <div class="item-actions">
              <button class="pwr-btn start"   data-schedule-run="${s.id}" title="${t('runNow')}">▶</button>
              <button class="pwr-btn restart" data-schedule-toggle="${s.id}" data-active="${s.active ? '1' : '0'}" title="${t('active')}/${t('inactive')}">${s.active ? '☑' : '☐'}</button>
              <button class="pwr-btn kill"    data-schedule-delete="${s.id}" title="${t('delete')}">✕</button>
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

      <!-- Métriques -->
      <div class="detail-section">
        <h3>${t('metrics')}</h3>
        ${metricsHtml}
      </div>

      <!-- SFTP -->
      ${sftpHtml ? `
      <div class="detail-section">
        <h3>${t('sftp')}</h3>
        ${sftpHtml}
      </div>` : ''}

      <!-- Power -->
      <div class="detail-section">
        <h3>${t('power')}</h3>
        <div class="power-grid">
          <button class="btn primary" data-signal="start"   ${!running && !busy ? '' : 'disabled'}>▶ ${t('start')}</button>
          <button class="btn ghost"   data-signal="stop"    ${running && !busy ? '' : 'disabled'}>■ ${t('stop')}</button>
          <button class="btn ghost"   data-signal="restart" ${running && !busy ? '' : 'disabled'}>↻ ${t('restart')}</button>
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
        <details class="schedule-create">
          <summary>${t('newSchedule')}</summary>
          <div class="schedule-form">
            <input type="text" id="sch-name" maxlength="100" placeholder="${t('fieldName')}" />
            <div class="cron-inputs">
              <input type="text" id="sch-minute" placeholder="${t('cronMinute')}" value="0" />
              <input type="text" id="sch-hour" placeholder="${t('cronHour')}" value="4" />
              <input type="text" id="sch-day" placeholder="${t('cronDay')}" value="*" />
            </div>
            <div class="cron-inputs">
              <select id="sch-action">
                <option value="power">power</option>
                <option value="backup">backup</option>
                <option value="command">command</option>
              </select>
              <input type="text" id="sch-payload" placeholder="${t('schedulePayload')}" />
            </div>
            <button class="btn primary small" id="sch-create" ${!busy ? '' : 'disabled'}>${t('create')}</button>
          </div>
        </details>
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

    // Restaurer une sauvegarde (le serveur redémarre)
    els.modalBody.querySelectorAll('[data-backup-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirmRestore'))) return;
        const truncate = confirm(`${t('truncate')} ?`);
        try {
          await api.apiBackupRestore(server.id, btn.dataset.backupRestore, truncate);
          showToast(t('backupRestored'));
          openServerModal(server, boite);
        } catch (e) { showError(`${t('error')}: ${e.message}`); }
      });
    });

    // Supprimer une sauvegarde (irréversible)
    els.modalBody.querySelectorAll('[data-backup-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirmDeleteBackup'))) return;
        try {
          await api.apiBackupDelete(server.id, btn.dataset.backupDelete);
          showToast(t('backupDeleted'));
          openServerModal(server, boite);
        } catch (e) { showError(`${t('error')}: ${e.message}`); }
      });
    });

    // Exécuter une tâche maintenant
    els.modalBody.querySelectorAll('[data-schedule-run]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.apiScheduleRun(server.id, btn.dataset.scheduleRun);
          showToast(t('scheduleRunDone'));
        } catch (e) { showError(`${t('error')}: ${e.message}`); }
      });
    });

    // Activer / désactiver une tâche
    els.modalBody.querySelectorAll('[data-schedule-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.dataset.active === '1' ? false : true;
        try {
          await api.apiScheduleUpdate(server.id, btn.dataset.scheduleToggle, { active: next });
          showToast(t('scheduleUpdated'));
          openServerModal(server, boite);
        } catch (e) { showError(`${t('error')}: ${e.message}`); }
      });
    });

    // Supprimer une tâche
    els.modalBody.querySelectorAll('[data-schedule-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(t('confirmDeleteSchedule'))) return;
        try {
          await api.apiScheduleDelete(server.id, btn.dataset.scheduleDelete);
          showToast(t('scheduleDeleted'));
          openServerModal(server, boite);
        } catch (e) { showError(`${t('error')}: ${e.message}`); }
      });
    });

    // Créer une tâche planifiée
    const schCreate = els.modalBody.querySelector('#sch-create');
    if (schCreate) schCreate.addEventListener('click', async () => {
      const name = els.modalBody.querySelector('#sch-name').value.trim();
      const minute = els.modalBody.querySelector('#sch-minute').value.trim() || '*';
      const hour = els.modalBody.querySelector('#sch-hour').value.trim() || '*';
      const day = els.modalBody.querySelector('#sch-day').value.trim() || '*';
      const action = els.modalBody.querySelector('#sch-action').value;
      const payload = els.modalBody.querySelector('#sch-payload').value.trim();
      const body = {
        name: name || undefined,
        active: true,
        cron: { minute, hour, dayOfWeek: day },
        actions: [{ action, ...(payload ? { payload } : {}), timeOffset: 0 }],
      };
      schCreate.disabled = true;
      try {
        await api.apiScheduleCreate(server.id, body);
        showToast(t('scheduleCreated'));
        openServerModal(server, boite);
      } catch (e) {
        showError(`${t('error')}: ${e.message}`);
        schCreate.disabled = false;
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
      els.btnRefresh.textContent = '↻';
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

  /* ── Thème clair / sombre (light-primary, toggle dark) ── */

  async function initTheme() {
    const d = await chrome.storage.local.get(api.STORAGE_KEYS.THEME);
    applyTheme(d[api.STORAGE_KEYS.THEME] === 'dark' ? 'dark' : 'light');
    els.btnTheme.addEventListener('click', async () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      await chrome.storage.local.set({ [api.STORAGE_KEYS.THEME]: next });
    });
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.btnTheme.textContent = theme === 'dark' ? '◑' : '◐';
  }

  /* ── Init ─────────────────────────────────────────────── */

  function init() {
    applyI18n();
    initTheme();

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
