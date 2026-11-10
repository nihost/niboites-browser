/**
 * NiHost API client — wrapper around https://boites.ni-host.com/v1
 * Used by the popup, options page and background service worker.
 *
 * The personal token is stored in chrome.storage.local under `nihost_token`.
 * Rate limit: 60 req/min per token (429 + Retry-After when exceeded).
 */

const NIHOST_API_BASE = 'https://boites.ni-host.com/v1';
const NIHOST_PANEL_URL = 'https://boites.ni-host.com';

/** Storage keys */
const STORAGE_KEYS = {
  TOKEN: 'nihost_token',
  AUTO_REFRESH: 'nihost_auto_refresh',
  REFRESH_INTERVAL: 'nihost_refresh_interval',
  LAST_STATE: 'nihost_last_state',
  THEME: 'niboites_theme', // 'light' | 'dark' (light par défaut — light-primary)
};

/** Default settings */
const DEFAULTS = {
  AUTO_REFRESH: true,
  REFRESH_INTERVAL: 30, // seconds
};

/**
 * Retrieve the stored token.
 * @returns {Promise<string|null>}
 */
async function getToken() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.TOKEN);
  return data[STORAGE_KEYS.TOKEN] || null;
}

/**
 * Persist the token.
 * @param {string} token
 */
async function setToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TOKEN]: token });
}

/**
 * Remove the stored token.
 */
async function clearToken() {
  await chrome.storage.local.remove(STORAGE_KEYS.TOKEN);
}

/**
 * Low-level request helper. Throws an Error with `.status` and `.body` on failure.
 * @param {string} path - e.g. "/me" or "/servers/abc/power?signal=start"
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.body] - JSON-serialisable body
 * @param {string} [options.token] - override token (defaults to stored token)
 * @returns {Promise<any>} parsed JSON response
 */
async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token } = options;
  const authToken = token || (await getToken());
  if (!authToken) {
    const err = new Error('No API token configured');
    err.status = 0;
    err.code = 'NO_TOKEN';
    throw err;
  }

  const url = `${NIHOST_API_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Accept': 'application/json',
  };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const err = new Error(
      (data && (data.message || data.error)) || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.body = data;
    err.retryAfter = res.headers.get('Retry-After');
    throw err;
  }
  return data;
}

/* ── Read endpoints (scope: read) ─────────────────────────────── */

/** GET /v1/me — token owner identity & scopes */
function apiMe(token) {
  return apiRequest('/me', { token });
}

/** GET /v1/boites — list all accessible boîtes */
function apiListBoites(token) {
  return apiRequest('/boites', { token });
}

/** GET /v1/boites/{id}/servers — servers inside a boîte */
function apiBoiteServers(boiteId, token) {
  return apiRequest(`/boites/${encodeURIComponent(boiteId)}/servers`, { token });
}

/** GET /v1/servers/{id} — single server detail */
function apiServer(serverId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}`, { token });
}

/** GET /v1/servers/{id}/backups — server backups */
function apiServerBackups(serverId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/backups`, { token });
}

/** GET /v1/servers/{id}/schedules — scheduled tasks */
function apiServerSchedules(serverId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/schedules`, { token });
}

/** GET /v1/servers/{id}/metrics — métriques courantes (state, cpuPercent, memoryMb/diskMb used/total) */
function apiServerMetrics(serverId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/metrics`, { token });
}

/** GET /v1/servers/{id}/sftp — infos SFTP (host, port, username ; password jamais rendu) */
function apiServerSftp(serverId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/sftp`, { token });
}

/** POST /v1/servers/{id}/schedules — créer une tâche (scope power, +command si action command) */
function apiScheduleCreate(serverId, body, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/schedules`, {
    method: 'POST', body, token,
  });
}

/** PATCH /v1/servers/{id}/schedules/{scheduleId} — toggle {active} ou corps complet (l'id change) */
function apiScheduleUpdate(serverId, scheduleId, body, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'PATCH', body, token,
  });
}

/** DELETE /v1/servers/{id}/schedules/{scheduleId} (scope power) */
function apiScheduleDelete(serverId, scheduleId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'DELETE', token,
  });
}

/** POST /v1/servers/{id}/schedules/{scheduleId}/run — exécuter maintenant (scope power + command si commandes) */
function apiScheduleRun(serverId, scheduleId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/schedules/${encodeURIComponent(scheduleId)}/run`, {
    method: 'POST', token,
  });
}

/** DELETE /v1/servers/{id}/backups/{backupId} — irréversible (scope power) */
function apiBackupDelete(serverId, backupId, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/backups/${encodeURIComponent(backupId)}`, {
    method: 'DELETE', token,
  });
}

/** POST /v1/servers/{id}/backups/{backupId}/restore — body optionnel { truncate } ; le serveur redémarre */
function apiBackupRestore(serverId, backupId, truncate, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/backups/${encodeURIComponent(backupId)}/restore`, {
    method: 'POST',
    body: truncate ? { truncate: true } : {},
    token,
  });
}

/* ── Power endpoints (scope: power) ───────────────────────────── */

/** POST /v1/servers/{id}/power?signal=start|stop|restart|kill */
function apiServerPower(serverId, signal, token) {
  const valid = ['start', 'stop', 'restart', 'kill'];
  if (!valid.includes(signal)) {
    return Promise.reject(Object.assign(new Error(`Invalid signal: ${signal}`), { status: 422 }));
  }
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/power?signal=${signal}`, {
    method: 'POST',
    token,
  });
}

/** POST /v1/servers/{id}/command — send a console command */
function apiServerCommand(serverId, command, token) {
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/command`, {
    method: 'POST',
    body: { command },
    token,
  });
}

/** POST /v1/servers/{id}/backups — trigger an immediate backup */
function apiServerBackup(serverId, name, token) {
  const body = name ? { name } : {};
  return apiRequest(`/servers/${encodeURIComponent(serverId)}/backups`, {
    method: 'POST',
    body,
    token,
  });
}

/* ── Aggregate helpers ────────────────────────────────────────── */

/**
 * Fetch the full fleet: every boîte with its servers nested.
 * @returns {Promise<{boites: Array, me: object}>}
 */
async function apiFullState() {
  const me = await apiMe();
  const boitesRes = await apiListBoites();
  const boites = boitesRes.data || [];

  const withServers = await Promise.all(
    boites.map(async (b) => {
      try {
        const srvRes = await apiBoiteServers(b.id);
        return { ...b, servers: srvRes.data || [] };
      } catch (e) {
        return { ...b, servers: [], serversError: e.message };
      }
    })
  );

  return { me, boites: withServers };
}

/* ── Settings helpers ─────────────────────────────────────────── */

async function getSettings() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.AUTO_REFRESH,
    STORAGE_KEYS.REFRESH_INTERVAL,
  ]);
  return {
    autoRefresh: data[STORAGE_KEYS.AUTO_REFRESH] ?? DEFAULTS.AUTO_REFRESH,
    refreshInterval: data[STORAGE_KEYS.REFRESH_INTERVAL] ?? DEFAULTS.REFRESH_INTERVAL,
  };
}

async function setSettings({ autoRefresh, refreshInterval }) {
  const patch = {};
  if (autoRefresh !== undefined) patch[STORAGE_KEYS.AUTO_REFRESH] = autoRefresh;
  if (refreshInterval !== undefined) patch[STORAGE_KEYS.REFRESH_INTERVAL] = refreshInterval;
  await chrome.storage.local.set(patch);
}

/* ── Status helpers ───────────────────────────────────────────── */

const STATUS_MAP = {
  running:   { label: 'status_running',  color: '#22c55e', icon: '●' },
  online:    { label: 'status_running',  color: '#22c55e', icon: '●' },
  stopped:   { label: 'status_stopped',  color: '#ef4444', icon: '●' },
  offline:   { label: 'status_stopped',  color: '#ef4444', icon: '●' },
  starting:  { label: 'status_starting', color: '#f59e0b', icon: '◐' },
  stopping:  { label: 'status_stopping', color: '#f59e0b', icon: '◐' },
  active:    { label: 'status_active',   color: '#22c55e', icon: '●' },
  archived:  { label: 'status_archived', color: '#6b7280', icon: '■' },
};

function statusInfo(status) {
  return STATUS_MAP[(status || '').toLowerCase()] || { label: 'status_unknown', color: '#9ca3af', icon: '?' };
}

/** Human-readable resource formatting */
function formatMb(mb) {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} Go`;
  return `${mb} Mo`;
}
function formatBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}
function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch { return iso; }
}

// Expose everything on a single global for non-module scripts (popup/options)
// and also support ES module import in the service worker.
const NiHostAPI = {
  NIHOST_API_BASE,
  NIHOST_PANEL_URL,
  STORAGE_KEYS,
  DEFAULTS,
  getToken,
  setToken,
  clearToken,
  apiRequest,
  apiMe,
  apiListBoites,
  apiBoiteServers,
  apiServer,
  apiServerBackups,
  apiServerSchedules,
  apiServerMetrics,
  apiServerSftp,
  apiScheduleCreate,
  apiScheduleUpdate,
  apiScheduleDelete,
  apiScheduleRun,
  apiServerPower,
  apiServerCommand,
  apiServerBackup,
  apiBackupDelete,
  apiBackupRestore,
  apiFullState,
  getSettings,
  setSettings,
  statusInfo,
  formatMb,
  formatBytes,
  formatDate,
};

// Attach to globalThis so plain <script> tags can use it
if (typeof globalThis !== 'undefined') {
  globalThis.NiHostAPI = NiHostAPI;
}

// ES module export for the service worker (type="module" fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NiHostAPI;
}
