/* ==========================================================================
   MANAJEMEN UANG IHSAAN — SINKRONISASI OFFLINE-FIRST
   LocalStorage tetap menjadi penyimpanan utama. Saat online, data digabung
   (3-way merge) dengan MySQL melalui API PHP, lalu dikirim kembali.
   ========================================================================== */

'use strict';

const SYNC_STORAGE_KEY = 'manajemen-uang-ihsaan:sync:v1';
const SYNC_REQUEST_TIMEOUT = 15000;
const SYNC_DEBOUNCE_MS = 1600;
const SYNC_AUTO_RETRY_MS = 45000;
const SYNC_PERIODIC_MS = 5 * 60 * 1000;

function defaultSyncMeta() {
  return {
    version: 1,
    enabled: false,
    serverUrl: '',
    apiKey: '',
    clientId: uid('device'),
    revision: 0,
    baseline: null,
    lastSyncAt: null,
    lastError: '',
  };
}

function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return defaultSyncMeta();
    const parsed = JSON.parse(raw);
    const base = defaultSyncMeta();
    return {
      ...base,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      revision: Number.isFinite(Number(parsed?.revision)) ? Number(parsed.revision) : 0,
      enabled: parsed?.enabled === true,
      baseline: parsed?.baseline && typeof parsed.baseline === 'object' ? parsed.baseline : null,
      lastError: typeof parsed?.lastError === 'string' ? parsed.lastError : '',
    };
  } catch (error) {
    console.warn('Metadata sinkronisasi tidak dapat dibaca:', error);
    return defaultSyncMeta();
  }
}

let syncMeta = loadSyncMeta();
const syncRuntime = {
  inFlight: false,
  queued: false,
  timer: null,
  retryTimer: null,
  periodicTimer: null,
  status: 'idle', // idle | syncing | synced | pending | offline | error | off
  lastResult: '',
  conflicts: 0,
};

function saveSyncMeta() {
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(syncMeta));
    return true;
  } catch (error) {
    console.warn('Metadata sinkronisasi gagal disimpan:', error);
    return false;
  }
}

/* --------------------------------------------------------------------------
   UTILITAS PERBANDINGAN & GABUNG
   -------------------------------------------------------------------------- */
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const output = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        output[key] = stableValue(value[key]);
      });
    return output;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function isSameValue(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function byId(a, b) {
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

// MySQL DATETIME menyimpan detik, tanpa milidetik. Samakan bentuk timestamp di
// snapshot agar catatan yang tidak berubah tidak dianggap berubah hanya karena
// `.123Z` hilang setelah melewati server.
function canonicalTimestamp(value) {
  if (!value) return value ?? null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function canonicalSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  return {
    settings: snapshot.settings && typeof snapshot.settings === 'object' ? { ...snapshot.settings } : null,
    transactions: (Array.isArray(snapshot.transactions) ? [...snapshot.transactions] : [])
      .map((item) => ({ ...item, createdAt: canonicalTimestamp(item.createdAt) }))
      .sort(byId),
    subscriptions: (Array.isArray(snapshot.subscriptions) ? [...snapshot.subscriptions] : [])
      .map((item) => ({
        ...item,
        createdAt: canonicalTimestamp(item.createdAt),
        lastPaidAt: canonicalTimestamp(item.lastPaidAt),
      }))
      .sort(byId),
    wishlist: (Array.isArray(snapshot.wishlist) ? [...snapshot.wishlist] : [])
      .map((item) => ({
        ...item,
        createdAt: canonicalTimestamp(item.createdAt),
        completedAt: canonicalTimestamp(item.completedAt),
      }))
      .sort(byId),
    quickAdds: (Array.isArray(snapshot.quickAdds) ? [...snapshot.quickAdds] : []).sort(byId),
  };
}

function currentSnapshot() {
  return canonicalSnapshot({
    settings: state.settings,
    transactions: state.transactions,
    subscriptions: state.subscriptions,
    wishlist: state.wishlist,
    quickAdds: state.quickAdds,
  });
}

function mapById(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item && item.id) map.set(String(item.id), item);
  });
  return map;
}

function mergeCollection(localItems, remoteItems, baseItems, conflicts) {
  const localMap = mapById(localItems);
  const remoteMap = mapById(remoteItems);
  const baseMap = mapById(baseItems);
  const ids = new Set([...localMap.keys(), ...remoteMap.keys(), ...baseMap.keys()]);
  const result = [];

  ids.forEach((id) => {
    const base = baseMap.get(id);
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const localChanged = !isSameValue(local, base);
    const remoteChanged = !isSameValue(remote, base);
    let picked;

    if (!localChanged && !remoteChanged) picked = local;
    else if (localChanged && !remoteChanged) picked = local;
    else if (!localChanged && remoteChanged) picked = remote;
    else if (isSameValue(local, remote)) picked = local;
    else if (!remote) picked = local; // server hapus, perangkat mengubah → pertahankan perubahan lokal
    else if (!local) picked = remote; // perangkat hapus, server mengubah → pertahankan perubahan server
    else {
      picked = local; // dua perangkat mengubah catatan yang sama → versi perangkat ini menang
      conflicts.push(id);
    }

    if (picked) result.push(picked);
  });

  return result;
}

function mergeSnapshots(local, remote, base) {
  const conflicts = [];
  let settingsConflict = false;
  const emptyBase = { settings: null, transactions: [], subscriptions: [], wishlist: [], quickAdds: [] };
  const baseSnapshot = base ? canonicalSnapshot(base) : emptyBase;
  const localSnapshot = canonicalSnapshot(local) || emptyBase;
  const remoteSnapshot = canonicalSnapshot(remote) || emptyBase;

  let settings;
  if (!remoteSnapshot.settings) {
    settings = localSnapshot.settings;
  } else if (!localSnapshot.settings) {
    settings = remoteSnapshot.settings;
  } else {
    const localChanged = !isSameValue(localSnapshot.settings, baseSnapshot.settings);
    const remoteChanged = !isSameValue(remoteSnapshot.settings, baseSnapshot.settings);
    if (!localChanged && remoteChanged) settings = remoteSnapshot.settings;
    else if (localChanged && !remoteChanged) settings = localSnapshot.settings;
    else if (isSameValue(localSnapshot.settings, remoteSnapshot.settings)) settings = localSnapshot.settings;
    else {
      settings = localSnapshot.settings;
      settingsConflict = true;
    }
  }

  return {
    snapshot: canonicalSnapshot({
      settings,
      transactions: mergeCollection(localSnapshot.transactions, remoteSnapshot.transactions, baseSnapshot.transactions, conflicts),
      subscriptions: mergeCollection(localSnapshot.subscriptions, remoteSnapshot.subscriptions, baseSnapshot.subscriptions, conflicts),
      wishlist: mergeCollection(localSnapshot.wishlist, remoteSnapshot.wishlist, baseSnapshot.wishlist, conflicts),
      quickAdds: mergeCollection(localSnapshot.quickAdds, remoteSnapshot.quickAdds, baseSnapshot.quickAdds, conflicts),
    }),
    conflicts,
    settingsConflict,
  };
}

function isPristineLocalState() {
  return (
    state.transactions.length === 0 &&
    state.subscriptions.length === 0 &&
    state.wishlist.length === 0 &&
    !state.meta.lastBackupAt &&
    isSameValue(state.settings, DEFAULT_SETTINGS) &&
    isSameValue(canonicalSnapshot({ quickAdds: state.quickAdds }).quickAdds, canonicalSnapshot({ quickAdds: DEFAULT_QUICK_ADDS }).quickAdds)
  );
}

function applySnapshot(snapshot) {
  if (!snapshot) return false;
  const before = stableStringify(currentSnapshot());
  const after = stableStringify(canonicalSnapshot(snapshot));
  if (before === after) return false;

  state.settings = { ...(snapshot.settings || state.settings) };
  state.transactions = (snapshot.transactions || []).map((item) => ({ ...item }));
  state.subscriptions = (snapshot.subscriptions || []).map((item) => ({ ...item }));
  if (Array.isArray(snapshot.wishlist)) {
    state.wishlist = snapshot.wishlist.map((item) => ({ ...item }));
  }
  if (Array.isArray(snapshot.quickAdds)) {
    state.quickAdds = snapshot.quickAdds.map((item) => ({ ...item }));
  }

  saveState({ dirty: false });
  if (typeof renderAll === 'function') renderAll();
  return true;
}

/* --------------------------------------------------------------------------
   STATUS
   -------------------------------------------------------------------------- */
function syncConfigured() {
  return Boolean(syncMeta.enabled && syncMeta.apiKey);
}

function syncEndpointBase() {
  let configured = String(syncMeta.serverUrl || '').trim().replace(/\/+$/, '');
  if (configured) {
    // Terima alamat folder API, atau URL lengkap state.php/health.php.
    configured = configured.replace(/\/(state|health)\.php$/i, '');
    return configured + '/';
  }
  if (location.protocol === 'file:') return '';
  return new URL('./api/', location.href).href;
}

function syncHasLocalChanges() {
  if (!syncMeta.baseline) {
    return state.transactions.length > 0 || state.subscriptions.length > 0 || !isPristineLocalState();
  }
  return stableStringify(currentSnapshot()) !== stableStringify(canonicalSnapshot(syncMeta.baseline));
}

function syncStatusInfo() {
  if (!syncConfigured()) {
    return { key: 'off', label: 'Lokal saja', tone: 'neutral', detail: 'Sinkronisasi ke MySQL belum aktif.' };
  }
  if (!navigator.onLine) {
    return { key: 'offline', label: 'Offline', tone: 'amber', detail: 'Perubahan disimpan lokal dan dikirim saat online.' };
  }
  if (syncRuntime.inFlight) {
    return { key: 'syncing', label: 'Menyinkronkan…', tone: 'neutral', detail: 'Sedang bertukar data dengan MySQL.' };
  }
  if (syncMeta.lastError) {
    return { key: 'error', label: 'Gagal sinkron', tone: 'coral', detail: syncMeta.lastError };
  }
  if (syncHasLocalChanges()) {
    return { key: 'pending', label: 'Belum tersinkron', tone: 'amber', detail: 'Ada perubahan yang menunggu dikirim.' };
  }
  if (syncMeta.lastSyncAt) {
    return { key: 'synced', label: 'Tersinkron', tone: 'emerald', detail: 'LocalStorage dan MySQL sudah sama.' };
  }
  return { key: 'idle', label: 'Siap sinkron', tone: 'neutral', detail: 'Tekan Sinkronkan sekarang untuk memulai.' };
}

function syncToneColors(tone) {
  if (tone === 'emerald') return { fg: 'var(--emerald-deep)', bg: 'var(--emerald-soft)' };
  if (tone === 'amber') return { fg: 'var(--amber)', bg: 'var(--amber-soft)' };
  if (tone === 'coral') return { fg: 'var(--coral)', bg: 'var(--coral-soft)' };
  return { fg: 'var(--muted)', bg: 'var(--surface-soft)' };
}

function renderSyncUI() {
  const info = syncStatusInfo();
  const colors = syncToneColors(info.tone);

  const chip = $('#syncStatusChip');
  const dot = $('#syncStatusDot');
  const chipText = $('#syncStatusText');
  if (chip) {
    chip.title = info.detail;
    chip.dataset.syncStatus = info.key;
  }
  if (dot) {
    dot.style.background = colors.fg;
    dot.style.boxShadow = `0 0 0 3px ${colors.bg}`;
  }
  const inlineDot = $('#syncStatusDotInline');
  if (inlineDot) inlineDot.style.background = colors.fg;
  if (chipText) {
    chipText.textContent = info.label;
    chipText.style.color = colors.fg;
  }

  const badge = $('#syncBadge');
  if (badge) {
    const badgeClass =
      info.tone === 'emerald'
        ? 'badge badge-emerald'
        : info.tone === 'amber'
          ? 'badge badge-amber'
          : info.tone === 'coral'
            ? 'badge badge-coral'
            : 'badge badge-neutral';
    badge.className = badgeClass;
    badge.textContent = info.label;
  }

  const detail = $('#syncStatusDetail');
  if (detail) {
    detail.textContent = info.detail;
    detail.style.color = info.tone === 'coral' ? 'var(--coral)' : 'var(--muted)';
  }

  const lastAt = $('#syncLastAt');
  if (lastAt) {
    lastAt.textContent = syncMeta.lastSyncAt ? formatDateTime(syncMeta.lastSyncAt) : 'Belum pernah';
  }

  const serverInput = $('#syncServerUrl');
  if (serverInput && document.activeElement !== serverInput) {
    serverInput.value = syncMeta.serverUrl || '';
  }
  const keyInput = $('#syncApiKey');
  if (keyInput && document.activeElement !== keyInput) {
    keyInput.value = syncMeta.apiKey || '';
  }

  const endpoint = $('#syncEndpoint');
  if (endpoint) {
    const base = syncEndpointBase();
    endpoint.textContent = base ? `${base}state.php` : 'Buka lewat http://localhost atau alamat LAN Laragon.';
  }

  const disconnect = $('#syncDisconnectBtn');
  if (disconnect) disconnect.hidden = !syncConfigured();

  const ping = $('#syncRevision');
  if (ping) ping.textContent = String(syncMeta.revision || 0);

  refreshIcons();
}

/* --------------------------------------------------------------------------
   REQUEST KE API
   -------------------------------------------------------------------------- */
async function syncRequest(path, { method = 'GET', body = null } = {}) {
  const base = syncEndpointBase();
  if (!base) throw new Error('Server belum bisa ditentukan. Buka aplikasi lewat http://localhost atau alamat LAN.');
  if (!syncMeta.apiKey) throw new Error('Kunci API belum diisi.');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT);

  try {
    const response = await fetch(base + path, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': syncMeta.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error('Respons server bukan JSON. Pastikan URL API benar.');
    }

    if (!response.ok) {
      const error = new Error(payload?.error || `Server menolak permintaan (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Server tidak merespons. Periksa Laragon dan jaringan.');
    }
    if (error instanceof TypeError) {
      throw new Error('Tidak dapat terhubung ke API. Periksa alamat server dan Laragon.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function syncErrorMessage(error) {
  if (!error) return 'Sinkronisasi gagal.';
  if (error.status === 401) return 'Kunci API ditolak. Periksa kunci dari setup Laragon.';
  if (error.status === 503) return 'MySQL belum siap. Jalankan MySQL di Laragon.';
  return error.message || 'Sinkronisasi gagal.';
}

/* --------------------------------------------------------------------------
   PROSES SINKRONISASI
   -------------------------------------------------------------------------- */
async function syncNow({ reason = 'auto', silent = true } = {}) {
  if (!syncConfigured()) {
    renderSyncUI();
    if (!silent) {
      showToast('Aktifkan sinkronisasi dan isi kunci API terlebih dahulu.', { type: 'warning' });
    }
    return { ok: false, skipped: true };
  }

  if (syncRuntime.inFlight) {
    syncRuntime.queued = true;
    return { ok: false, queued: true };
  }

  if (!navigator.onLine) {
    syncRuntime.status = 'offline';
    renderSyncUI();
    if (!silent) showToast('Sedang offline. Perubahan tetap disimpan lokal.', { type: 'warning' });
    return { ok: false, offline: true };
  }

  syncRuntime.inFlight = true;
  syncRuntime.lastResult = '';
  syncMeta.lastError = '';
  renderSyncUI();

  try {
    let outcome = null;
    let lastError = null;
    let merged = null;
    let conflicts = [];
    let settingsConflict = false;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const remote = await syncRequest('state.php', { method: 'GET' });
      const remoteSnapshot = canonicalSnapshot(remote.data);
      if (!remoteSnapshot) throw new Error('Data dari server tidak dikenali.');

      const localSnapshot = currentSnapshot();
      const baseline = syncMeta.baseline ? canonicalSnapshot(syncMeta.baseline) : null;
      conflicts = [];
      settingsConflict = false;

      if (Number(remote.revision) === 0 && syncMeta.revision > 0) {
        // Server baru saja dikosongkan/di-reset: jangan hapus data lokal.
        merged = localSnapshot;
      } else if (!baseline && Number(remote.revision) > 0 && isPristineLocalState()) {
        // Perangkat baru tanpa data: adopsi data server.
        merged = remoteSnapshot;
      } else {
        const result = mergeSnapshots(localSnapshot, remoteSnapshot, baseline);
        merged = result.snapshot;
        conflicts = result.conflicts;
        settingsConflict = result.settingsConflict;
      }

      applySnapshot(merged);

      if (stableStringify(merged) === stableStringify(remoteSnapshot)) {
        outcome = {
          pushed: false,
          conflicts: conflicts.length,
          settingsConflict,
          revision: Number(remote.revision),
        };
        break;
      }

      try {
        const response = await syncRequest('state.php', {
          method: 'PUT',
          body: {
            baseRevision: Number(remote.revision),
            clientId: syncMeta.clientId,
            data: merged,
          },
        });
        outcome = {
          pushed: true,
          conflicts: conflicts.length,
          settingsConflict,
          revision: Number(response.revision),
        };
        break;
      } catch (error) {
        if (error.status === 409) {
          lastError = error;
          continue; // ada perangkat lain menulis; tarik ulang lalu gabung lagi
        }
        throw error;
      }
    }

    if (!outcome) {
      throw lastError || new Error('Server terus berubah. Coba sinkronkan lagi.');
    }

    syncMeta.baseline = canonicalSnapshot(merged);
    syncMeta.revision = outcome.revision;
    syncMeta.lastSyncAt = new Date().toISOString();
    syncMeta.lastError = '';
    syncRuntime.status = 'synced';
    saveSyncMeta();
    renderSyncUI();

    if (outcome.conflicts > 0) {
      const message = `${outcome.conflicts} catatan bentrok karena diubah di dua perangkat. Versi perangkat ini dipertahankan.`;
      syncRuntime.lastResult = message;
      showToast(message, { type: 'warning', duration: 6500 });
    } else if (outcome.settingsConflict) {
      const message = 'Pengaturan berbeda di dua perangkat. Pengaturan perangkat ini dipertahankan.';
      syncRuntime.lastResult = message;
      showToast(message, { type: 'warning', duration: 6500 });
    } else if (!silent) {
      showToast(outcome.pushed ? 'Data berhasil dikirim ke MySQL.' : 'Data sudah sinkron dengan MySQL.');
    }

    return { ok: true, ...outcome };
  } catch (error) {
    syncMeta.lastError = syncErrorMessage(error);
    syncRuntime.status = 'error';
    saveSyncMeta();
    renderSyncUI();
    if (!silent) showToast(syncMeta.lastError, { type: 'error', duration: 6500 });
    return { ok: false, error: syncMeta.lastError };
  } finally {
    syncRuntime.inFlight = false;
    renderSyncUI();
    if (syncRuntime.queued) {
      syncRuntime.queued = false;
      scheduleSync(400);
    }
  }
}

function markStateDirty() {
  if (!syncConfigured()) {
    renderSyncUI();
    return;
  }
  scheduleSync(SYNC_DEBOUNCE_MS);
  renderSyncUI();
}

function scheduleSync(delay = SYNC_DEBOUNCE_MS) {
  if (!syncConfigured()) return;
  if (syncRuntime.timer) window.clearTimeout(syncRuntime.timer);
  syncRuntime.timer = window.setTimeout(() => {
    syncRuntime.timer = null;
    syncNow({ reason: 'auto', silent: true });
  }, delay);
}

function scheduleRetry() {
  if (!syncConfigured()) return;
  if (syncRuntime.retryTimer) window.clearTimeout(syncRuntime.retryTimer);
  syncRuntime.retryTimer = window.setTimeout(() => {
    syncRuntime.retryTimer = null;
    syncNow({ reason: 'retry', silent: true });
  }, SYNC_AUTO_RETRY_MS);
}

/* --------------------------------------------------------------------------
   AKSI UI
   -------------------------------------------------------------------------- */
function syncSaveSettings(event) {
  event?.preventDefault();
  const url = cleanText($('#syncServerUrl')?.value, 300);
  const key = String($('#syncApiKey')?.value || '').trim();
  const errorElement = $('#syncFormError');

  if (errorElement) {
    errorElement.textContent = '';
    errorElement.classList.remove('is-visible');
  }

  if (!key) {
    if (errorElement) {
      errorElement.textContent = 'Kunci API wajib diisi. Lihat hasil setup Laragon.';
      errorElement.classList.add('is-visible');
    }
    return;
  }
  if (key.length < 16) {
    if (errorElement) {
      errorElement.textContent = 'Kunci API terlalu pendek. Gunakan kunci dari setup Laragon.';
      errorElement.classList.add('is-visible');
    }
    return;
  }
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) {
    if (errorElement) {
      errorElement.textContent = 'Alamat server harus dimulai dengan http:// atau https://.';
      errorElement.classList.add('is-visible');
    }
    return;
  }
  if (!url && location.protocol === 'file:') {
    if (errorElement) {
      errorElement.textContent = 'Saat dibuka dari file, isi alamat API Laragon, misalnya http://10.21.21.223/manajemen-uang-ihsaan/api.';
      errorElement.classList.add('is-visible');
    }
    return;
  }

  if (syncMeta.serverUrl !== url.replace(/\/+$/, '')) {
    syncMeta.baseline = null;
    syncMeta.revision = 0;
    syncMeta.lastSyncAt = null;
  }

  syncMeta.serverUrl = url.replace(/\/+$/, '');
  syncMeta.apiKey = key;
  syncMeta.enabled = true;
  syncMeta.lastError = '';
  saveSyncMeta();
  renderSyncUI();
  showToast('Pengaturan sinkronisasi disimpan. Menghubungi server…');
  syncNow({ reason: 'settings', silent: false });
}

function syncForcePull() {
  if (!syncConfigured()) {
    showToast('Aktifkan sinkronisasi terlebih dahulu.', { type: 'warning' });
    return;
  }
  confirmDialog({
    title: 'Ambil data dari MySQL?',
    subtitle: 'Data di perangkat ini akan diganti dengan data server.',
    content: `
      <p>Gunakan jika perangkat ini rusak atau datanya tidak diperlukan lagi. Data lokal yang belum dikirim akan hilang. Buat Backup JSON terlebih dahulu bila ragu.</p>
    `,
    confirmLabel: 'Ambil dari Server',
    tone: 'danger',
    onConfirm: async () => {
      try {
        const remote = await syncRequest('state.php', { method: 'GET' });
        const snapshot = canonicalSnapshot(remote.data);
        if (!snapshot) throw new Error('Data server tidak dikenali.');
        applySnapshot(snapshot);
        syncMeta.baseline = snapshot;
        syncMeta.revision = Number(remote.revision) || 0;
        syncMeta.lastSyncAt = new Date().toISOString();
        syncMeta.lastError = '';
        saveSyncMeta();
        renderSyncUI();
        showToast('Data dari MySQL berhasil diambil.');
      } catch (error) {
        const message = syncErrorMessage(error);
        syncMeta.lastError = message;
        saveSyncMeta();
        renderSyncUI();
        showToast(message, { type: 'error', duration: 6500 });
      }
    },
  });
}

async function syncForcePush() {
  if (!syncConfigured()) {
    showToast('Aktifkan sinkronisasi terlebih dahulu.', { type: 'warning' });
    return;
  }
  confirmDialog({
    title: 'Kirim data perangkat ke MySQL?',
    subtitle: 'Data server akan ditimpa oleh data perangkat ini.',
    content: '<p>Gunakan hanya jika yakin data di perangkat ini adalah versi terbaru. Perangkat lain akan menerima data ini pada sinkronisasi berikutnya.</p>',
    confirmLabel: 'Kirim ke Server',
    tone: 'warning',
    onConfirm: async () => {
      try {
        const remote = await syncRequest('state.php', { method: 'GET' });
        const local = currentSnapshot();
        const response = await syncRequest('state.php', {
          method: 'PUT',
          body: {
            baseRevision: Number(remote.revision),
            clientId: syncMeta.clientId,
            data: local,
          },
        });
        syncMeta.baseline = local;
        syncMeta.revision = Number(response.revision) || 0;
        syncMeta.lastSyncAt = new Date().toISOString();
        syncMeta.lastError = '';
        saveSyncMeta();
        renderSyncUI();
        showToast('Data perangkat berhasil dikirim ke MySQL.');
      } catch (error) {
        const message = syncErrorMessage(error);
        syncMeta.lastError = message;
        saveSyncMeta();
        renderSyncUI();
        showToast(message, { type: 'error', duration: 6500 });
      }
    },
  });
}

function syncDisconnect() {
  if (!syncConfigured() && !syncMeta.apiKey) {
    showToast('Sinkronisasi memang belum aktif.', { type: 'warning' });
    return;
  }
  confirmDialog({
    title: 'Putuskan sinkronisasi?',
    subtitle: 'Data di MySQL tetap tersimpan.',
    content: '<p>Perangkat ini akan kembali bekerja sepenuhnya lokal. Kunci API dihapus dari browser. Kamu bisa menyambungkan lagi kapan saja.</p>',
    confirmLabel: 'Putuskan',
    tone: 'danger',
    onConfirm: () => {
      syncMeta.enabled = false;
      syncMeta.apiKey = '';
      syncMeta.baseline = null;
      syncMeta.revision = 0;
      syncMeta.lastSyncAt = null;
      syncMeta.lastError = '';
      saveSyncMeta();
      renderSyncUI();
      showToast('Sinkronisasi diputuskan. Data tetap tersimpan lokal.');
    },
  });
}

/* --------------------------------------------------------------------------
   INISIALISASI
   -------------------------------------------------------------------------- */
function initializeSync() {
  const form = $('#syncForm');
  form?.addEventListener('submit', syncSaveSettings);

  window.addEventListener('online', () => {
    renderSyncUI();
    syncNow({ reason: 'online', silent: true });
  });
  window.addEventListener('offline', () => {
    renderSyncUI();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !syncConfigured()) return;
    const last = syncMeta.lastSyncAt ? Date.parse(syncMeta.lastSyncAt) : 0;
    if (Date.now() - last > 60000) syncNow({ reason: 'visible', silent: true });
  });

  if (syncRuntime.periodicTimer) window.clearInterval(syncRuntime.periodicTimer);
  syncRuntime.periodicTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') syncNow({ reason: 'periodic', silent: true });
  }, SYNC_PERIODIC_MS);

  renderSyncUI();

  if (syncConfigured()) {
    window.setTimeout(() => syncNow({ reason: 'startup', silent: true }), 900);
  }
}
