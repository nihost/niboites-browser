/**
 * NiBoites — background service worker (Manifest V3)
 *
 * Responsibilities:
 *  - Keyboard shortcut "refresh-all" : ping every open popup to refresh
 *  - Periodic alarm that refreshes the cached fleet state and updates
 *    the toolbar badge with the number of running servers
 *  - Badge colour: green if any server running, grey otherwise
 */

importScripts('../lib/api.js');

const api = globalThis.NiHostAPI;

const ALARM_REFRESH = 'nihost-refresh-state';
const ALARM_MINUTES = 1; // minimum Chrome alarm granularity

/* ── Badge ────────────────────────────────────────────────── */

async function updateBadge() {
  try {
    const token = await api.getToken();
    if (!token) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const data = await api.apiFullState();
    const running = data.boites.reduce(
      (acc, b) => acc + (b.servers || []).filter(
        (s) => (s.status || '').toLowerCase() === 'running' || (s.status || '').toLowerCase() === 'online'
      ).length,
      0
    );
    const total = data.boites.reduce((acc, b) => acc + (b.servers || []).length, 0);

    await chrome.storage.local.set({
      [api.STORAGE_KEYS.LAST_STATE]: {
        at: Date.now(),
        boites: data.boites.map((b) => ({
          id: b.id, name: b.name, status: b.status,
          servers: (b.servers || []).map((s) => ({ id: s.id, name: s.name, status: s.status })),
        })),
      },
    });

    if (total === 0) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: String(running) });
      await chrome.action.setBadgeBackgroundColor({
        color: running > 0 ? '#22c55e' : '#6b7280',
      });
    }
    await chrome.action.setTitle({
      title: running > 0
        ? `NiBoites — ${running}/${total} serveur(s) en ligne`
        : `NiBoites — aucun serveur en ligne (${total})`,
    });
  } catch (e) {
    // Silently ignore (token missing, offline, rate-limited…)
    if (e && e.status === 401) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }
  }
}

/* ── Alarms ───────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: ALARM_MINUTES });
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: ALARM_MINUTES });
  await updateBadge();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_REFRESH) {
    await updateBadge();
  }
});

/* ── Commands (keyboard shortcuts) ────────────────────────── */

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'refresh-all') {
    // Update badge in the background
    await updateBadge();
    // Ping any open popup so it re-renders immediately
    try {
      const tabs = await chrome.tabs.query({});
      // Popup is not a tab — use runtime message broadcast instead
      await chrome.runtime.sendMessage({ type: 'REFRESH_ALL' }).catch(() => {
        // No popup open — that's fine
      });
    } catch { /* ignore */ }
  }
});

/* ── Storage changes ──────────────────────────────────────── */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[api.STORAGE_KEYS.TOKEN]) {
    // Token changed : refresh badge immediately
    updateBadge();
  }
});

/* ── Notifications on running-count change (optional) ─────── */

let lastRunningCount = null;
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  const key = api.STORAGE_KEYS.LAST_STATE;
  if (!changes[key]) return;
  const state = changes[key].newValue;
  if (!state || !state.boites) return;
  const running = state.boites.reduce(
    (acc, b) => acc + (b.servers || []).filter(
      (s) => (s.status || '').toLowerCase() === 'running' || (s.status || '').toLowerCase() === 'online'
    ).length,
    0
  );
  if (lastRunningCount !== null && running !== lastRunningCount) {
    const total = state.boites.reduce((acc, b) => acc + (b.servers || []).length, 0);
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'NiBoites — serveurs',
        message: `${running}/${total} serveur(s) en ligne`,
      });
    } catch { /* notifications may be unavailable */ }
  }
  lastRunningCount = running;
});
