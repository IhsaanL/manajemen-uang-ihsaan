/* ==========================================================================
   MANAJEMEN UANG IHSAAN — APLIKASI
   Tema, kunci PIN, navigasi, event, dan inisialisasi.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   TEMA
   -------------------------------------------------------------------------- */
function getResolvedTheme() {
  const preference = state?.settings?.theme || 'system';
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference, { persist = false } = {}) {
  if (state && preference) state.settings.theme = preference;
  const resolved = preference === 'system' || !preference ? getResolvedTheme() : preference;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;

  let dynamicMeta = document.getElementById('dynamicThemeColor');
  if (!dynamicMeta) {
    dynamicMeta = document.createElement('meta');
    dynamicMeta.id = 'dynamicThemeColor';
    dynamicMeta.name = 'theme-color';
    document.head.appendChild(dynamicMeta);
  }
  dynamicMeta.content = resolved === 'dark' ? '#111315' : '#F6F7F4';

  if (persist) saveState();
  updateThemeControls();
  if (ui.isUnlocked && ui.route === 'dashboard') {
    window.requestAnimationFrame(renderCharts);
  }
}

function toggleTheme() {
  const resolved = getResolvedTheme();
  applyTheme(resolved === 'dark' ? 'light' : 'dark', { persist: true });
}

/* --------------------------------------------------------------------------
   KUNCI PIN
   -------------------------------------------------------------------------- */
function updatePinDots({ error = false } = {}) {
  const dots = $$('#pinDots .pin-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-filled', index < ui.pinBuffer.length);
    dot.classList.toggle('is-error', error);
  });
}

function setPinMessage(message, tone = 'muted') {
  const element = $('#pinMessage');
  if (!element) return;
  element.textContent = message;
  element.style.color = tone === 'error' ? 'var(--coral)' : tone === 'success' ? 'var(--emerald-deep)' : 'var(--muted)';
}

function setPinKeypadDisabled(disabled) {
  $$('#pinKeypad [data-pin-key], #pinKeypad [data-pin-action]').forEach((button) => {
    button.disabled = disabled;
  });
}

function clearPinCountdown() {
  if (ui.pinTimer) {
    window.clearInterval(ui.pinTimer);
    ui.pinTimer = null;
  }
}

function startPinCountdown() {
  clearPinCountdown();
  ui.pinLockedUntil = Date.now() + APP_CONFIG.pinLockoutSeconds * 1000;
  setPinKeypadDisabled(true);
  ui.pinTimer = window.setInterval(() => {
    const secondsLeft = Math.max(0, Math.ceil((ui.pinLockedUntil - Date.now()) / 1000));
    if (secondsLeft <= 0) {
      clearPinCountdown();
      ui.pinAttempts = 0;
      setPinKeypadDisabled(false);
      setPinMessage('Silakan coba lagi.');
      return;
    }
    setPinMessage(`Terlalu banyak percobaan. Coba lagi dalam ${secondsLeft} detik.`, 'error');
  }, 250);
}

function lockApp({ initial = false } = {}) {
  if (typeof closeModal === 'function') closeModal();
  ui.isLocked = true;
  ui.isUnlocked = false;
  ui.pinBuffer = '';
  ui.pinAttempts = 0;
  clearPinCountdown();
  setPinKeypadDisabled(false);
  updatePinDots();

  const lockScreen = $('#lockScreen');
  const appShell = $('#appShell');
  if (lockScreen) {
    lockScreen.classList.remove('is-hidden');
    lockScreen.removeAttribute('aria-hidden');
  }
  if (appShell) {
    appShell.setAttribute('inert', '');
    appShell.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.add('scroll-locked');
  setPinMessage(initial ? 'Ketuk angka atau gunakan keyboard.' : 'Aplikasi terkunci. Masukkan PIN untuk melanjutkan.');
  if (!initial) window.scrollTo({ top: 0, behavior: 'auto' });
  window.setTimeout(() => {
    const firstKey = $('#pinKeypad [data-pin-key="5"]');
    if (firstKey) firstKey.focus({ preventScroll: true });
  }, 80);
}

function unlockApp() {
  clearPinCountdown();
  ui.isLocked = false;
  ui.isUnlocked = true;
  ui.pinBuffer = '';
  ui.pinAttempts = 0;
  updatePinDots();

  const lockScreen = $('#lockScreen');
  const appShell = $('#appShell');
  lockScreen?.classList.add('is-hidden');
  lockScreen?.setAttribute('aria-hidden', 'true');
  appShell?.removeAttribute('inert');
  appShell?.removeAttribute('aria-hidden');
  document.body.classList.remove('scroll-locked');

  if (ui.loadWarning) {
    const warning = ui.loadWarning;
    ui.loadWarning = '';
    window.setTimeout(() => showToast(warning, { type: 'warning', duration: 7600 }), 500);
  }

  renderAll();
  applyRoute(ui.route, { scroll: false });
  window.requestAnimationFrame(() => {
    if (ui.route === 'dashboard') renderCharts();
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      main.removeAttribute('tabindex');
    }
  });
}

function handlePinDigit(digit) {
  if (!ui.isLocked) return;
  if (Date.now() < ui.pinLockedUntil) return;
  if (ui.pinBuffer.length >= 4) return;
  ui.pinBuffer += digit;
  updatePinDots();
  setPinMessage('Memeriksa…');
  if (ui.pinBuffer.length === 4) {
    window.setTimeout(verifyPin, 130);
  }
}

function handlePinBackspace() {
  if (!ui.isLocked || Date.now() < ui.pinLockedUntil) return;
  if (!ui.pinBuffer.length) return;
  ui.pinBuffer = ui.pinBuffer.slice(0, -1);
  updatePinDots();
  setPinMessage('Ketuk angka atau gunakan keyboard.');
}

function verifyPin() {
  if (!ui.isLocked || ui.pinBuffer.length !== 4) return;
  if (ui.pinBuffer === state.settings.pin) {
    setPinMessage('Akses diberikan. Selamat datang kembali.', 'success');
    updatePinDots();
    window.setTimeout(unlockApp, 300);
    return;
  }

  ui.pinAttempts += 1;
  updatePinDots({ error: true });
  const card = $('.lock-card');
  if (card) {
    card.classList.remove('animate-shake');
    void card.offsetWidth;
    card.classList.add('animate-shake');
    window.setTimeout(() => card.classList.remove('animate-shake'), 520);
  }

  if (ui.pinAttempts >= APP_CONFIG.maxPinAttempts) {
    ui.pinBuffer = '';
    setPinMessage(`PIN salah ${APP_CONFIG.maxPinAttempts} kali. Keypad dikunci sementara.`, 'error');
    window.setTimeout(() => {
      updatePinDots();
      startPinCountdown();
    }, 500);
    return;
  }

  const remaining = APP_CONFIG.maxPinAttempts - ui.pinAttempts;
  setPinMessage(`PIN belum tepat. Sisa ${remaining} percobaan.`, 'error');
  window.setTimeout(() => {
    ui.pinBuffer = '';
    updatePinDots();
    if (Date.now() >= ui.pinLockedUntil) setPinMessage('Coba lagi dengan hati-hati.');
  }, 720);
}

/* --------------------------------------------------------------------------
   NAVIGASI
   -------------------------------------------------------------------------- */
function normalizeRoute(route) {
  const clean = String(route || '').replace(/^#/, '').split('?')[0];
  return ROUTES.includes(clean) ? clean : 'dashboard';
}

function go(route) {
  const target = normalizeRoute(route);
  if (location.hash === `#${target}`) {
    applyRoute(target);
    return;
  }
  location.hash = target;
}

function applyRoute(route, { scroll = true } = {}) {
  const target = normalizeRoute(route);
  const previous = ui.route;
  if (target === 'add' && previous !== 'add' && !ui.editingId) resetAddForm();
  ui.route = target;

  $$('[data-page]').forEach((section) => {
    section.hidden = section.dataset.page !== target;
  });

  updateHeader();
  renderNavState();

  if (target === 'dashboard') renderDashboard();
  if (target === 'add') {
    renderAddCategories();
    renderAddPreview();
  }
  if (target === 'subscriptions') renderSubscriptionsPage();
  if (target === 'history') {
    renderHistoryOptions();
    syncHistoryInputs();
    renderHistory();
  }
  if (target === 'data') renderDataPage();

  refreshIcons();

  if (target === 'dashboard' && ui.isUnlocked) {
    window.requestAnimationFrame(renderCharts);
  }

  if (scroll && ui.isUnlocked) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.title =
    target === 'dashboard'
      ? `${state.settings.name} · Manajemen Uang`
      : `${(ROUTE_META[target] || ROUTE_META.dashboard).title} · Manajemen Uang Ihsaan`;
}

/* --------------------------------------------------------------------------
   EVENT GLOBAL
   -------------------------------------------------------------------------- */
function handleGlobalClick(event) {
  const routeTrigger = event.target.closest('[data-route]');
  if (routeTrigger) {
    event.preventDefault();
    go(routeTrigger.dataset.route);
    return;
  }

  const actionTrigger = event.target.closest('[data-action]');
  if (!actionTrigger) return;
  const action = actionTrigger.dataset.action;
  const id = actionTrigger.dataset.id || '';

  switch (action) {
    case 'toggle-theme':
      toggleTheme();
      break;
    case 'lock-app':
      lockApp();
      break;
    case 'quick-add':
      handleQuickAdd(id);
      break;
    case 'edit-tx':
      startEditTransaction(id);
      break;
    case 'delete-tx':
      askDeleteTransaction(id);
      break;
    case 'cancel-edit':
      cancelEdit();
      break;
    case 'add-subscription':
      openSubscriptionModal();
      break;
    case 'edit-subscription':
      openSubscriptionModal(id);
      break;
    case 'toggle-subscription':
      toggleSubscription(id);
      break;
    case 'delete-subscription':
      askDeleteSubscription(id);
      break;
    case 'pay-subscription':
      askPaySubscription(id);
      break;
    case 'add-preset':
      openPresetModal();
      break;
    case 'delete-preset':
      deletePreset(id);
      break;
    case 'export-json':
      exportJSON();
      break;
    case 'export-csv':
      exportCSV();
      break;
    case 'import-json':
      triggerImport();
      break;
    case 'reset-data':
      askResetData();
      break;
    case 'install-app':
      handleInstallApp();
      break;
    case 'reset-filters':
      ui.history = { search: '', type: 'all', category: 'all', month: 'all', limit: 20 };
      renderHistoryOptions();
      syncHistoryInputs();
      renderHistory();
      refreshIcons();
      break;
    case 'load-more':
      ui.history.limit += 20;
      renderHistory();
      refreshIcons();
      break;
    case 'go-add':
      go('add');
      break;
    default:
      break;
  }
}

function handleDocumentKeydown(event) {
  const modalLayer = $('#modalLayer');
  const modalOpen = modalLayer && !modalLayer.hidden;

  if (modalOpen) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = $$(
        'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]',
        modalLayer
      ).filter((element) => element.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }

  if (!ui.isLocked) return;
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    handlePinDigit(event.key);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    handlePinBackspace();
  }
}

function bindStaticEvents() {
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('keydown', handleDocumentKeydown);

  window.addEventListener('hashchange', () => {
    applyRoute(location.hash, { scroll: ui.isUnlocked });
  });

  const typeToggle = $('#typeToggle');
  typeToggle?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-type]');
    if (!button) return;
    const type = button.dataset.type === 'income' ? 'income' : 'expense';
    if (type === ui.addType) return;
    ui.addType = type;
    ui.addCategory = type === 'income' ? 'jajan' : 'makan';
    clearError('#txCategoryError', '#txCategoryError');
    renderAddCategories();
    renderAddPreview();
    refreshIcons();
  });

  const categoryChips = $('#categoryChips');
  categoryChips?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    ui.addCategory = button.dataset.category;
    clearError('#txCategoryError', '#txCategoryError');
    renderAddCategories();
    renderAddPreview();
    refreshIcons();
  });

  const txForm = $('#txForm');
  txForm?.addEventListener('submit', handleAddSubmit);

  const txAmount = $('#txAmount');
  txAmount?.addEventListener('input', () => clearError('#txAmount', '#txAmountError'));
  const txDate = $('#txDate');
  txDate?.addEventListener('change', () => {
    clearError('#txDate', '#txDateError');
    renderAddPreview();
  });
  const txNote = $('#txNote');
  txNote?.addEventListener('input', () => clearError('#txNote', '#txNoteError'));

  const settingsForm = $('#settingsForm');
  settingsForm?.addEventListener('submit', handleSettingsSubmit);
  const pinForm = $('#pinForm');
  pinForm?.addEventListener('submit', handlePinSubmit);

  ['#settingName', '#settingMonthly', '#settingWeekly'].forEach((selector) => {
    const input = $(selector);
    input?.addEventListener('input', () => {
      clearError(selector, `${selector}Error`);
    });
  });
  ['#currentPin', '#newPin', '#confirmPin'].forEach((selector) => {
    const input = $(selector);
    input?.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      clearError(selector, `${selector}Error`);
    });
  });

  const historySearch = $('#historySearch');
  historySearch?.addEventListener('input', () => {
    ui.history.search = historySearch.value;
    ui.history.limit = 20;
    renderHistory();
    refreshIcons();
  });
  ['historyType', 'historyCategory', 'historyMonth'].forEach((id) => {
    const input = $(`#${id}`);
    input?.addEventListener('change', () => {
      ui.history.type = $('#historyType')?.value || 'all';
      ui.history.category = $('#historyCategory')?.value || 'all';
      ui.history.month = $('#historyMonth')?.value || 'all';
      ui.history.limit = 20;
      renderHistory();
      refreshIcons();
    });
  });

  const importFile = $('#importFile');
  importFile?.addEventListener('change', handleImportFile);

  const pinKeypad = $('#pinKeypad');
  pinKeypad?.addEventListener('click', (event) => {
    const digitButton = event.target.closest('[data-pin-key]');
    if (digitButton) {
      handlePinDigit(digitButton.dataset.pinKey);
      return;
    }
    if (event.target.closest('[data-pin-action="backspace"]')) handlePinBackspace();
  });

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const systemThemeHandler = () => {
    if (state?.settings?.theme === 'system') {
      applyTheme('system', { persist: false });
      if (ui.route === 'dashboard' && ui.isUnlocked) window.requestAnimationFrame(renderCharts);
    }
  };
  if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', systemThemeHandler);
  else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(systemThemeHandler);

  bindModalEvents();
}

function setupPWA() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    ui.deferredInstallPrompt = event;
    updateInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    ui.deferredInstallPrompt = null;
    updateInstallUI();
    showToast('Aplikasi berhasil dipasang di perangkat.');
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker tidak terdaftar:', error);
      });
    });
  }
}

function initializeApp() {
  state = loadState();
  ui.route = normalizeRoute(location.hash || 'dashboard');
  ui.ready = true;

  bindStaticEvents();
  setupMoneyInput($('#txAmount'));
  setupMoneyInput($('#settingMonthly'));
  setupMoneyInput($('#settingWeekly'));
  setupPWA();

  applyTheme(state.settings.theme, { persist: false });
  resetAddForm();
  renderAll({ charts: false });
  applyRoute(ui.route, { scroll: false });
  lockApp({ initial: true });
  refreshIcons();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
  initializeApp();
}
