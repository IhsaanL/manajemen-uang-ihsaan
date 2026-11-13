/* ==========================================================================
   MANAJEMEN UANG IHSAAN — CORE
   Konfigurasi, data model, utilitas, penyimpanan, dan logika keuangan.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   KONFIGURASI UTAMA
   Ubah PIN bawaan di sini. PIN juga bisa diganti dari menu Data & Pengaturan.
   -------------------------------------------------------------------------- */
const APP_CONFIG = Object.freeze({
  appName: 'Manajemen Uang Ihsaan',
  ownerName: 'Ihsaan',
  defaultPin: '1234', // ← PIN 4 digit bawaan
  storageKey: 'manajemen-uang-ihsaan:data:v1',
  schemaVersion: 1,
  appVersion: '1.0.0',
  lockOnLoad: true,
  maxPinAttempts: 5,
  pinLockoutSeconds: 30,
});

const EXPENSE_CATEGORIES = Object.freeze([
  { id: 'bensin', label: 'Bensin', short: 'Bensin', icon: 'fuel', color: '#F59E0B' },
  { id: 'makan', label: 'Jajan & Makan Kampus', short: 'Makan Kampus', icon: 'utensils', color: '#EF4444' },
  { id: 'kuota', label: 'Kuota & Pulsa', short: 'Kuota & Pulsa', icon: 'smartphone', color: '#0EA5E9' },
  { id: 'langganan', label: 'Langganan', short: 'Langganan', icon: 'repeat-2', color: '#64748B' },
  { id: 'hiburan', label: 'Nongkrong & Hiburan', short: 'Nongkrong', icon: 'party-popper', color: '#F97316' },
  { id: 'kuliah', label: 'Kebutuhan Kuliah', short: 'Kebutuhan Kuliah', icon: 'graduation-cap', color: '#10B981' },
  { id: 'lainnya', label: 'Lainnya', short: 'Lainnya', icon: 'ellipsis', color: '#A8A29E' },
]);

const INCOME_CATEGORIES = Object.freeze([
  { id: 'jajan', label: 'Uang Jajan', short: 'Uang Jajan', icon: 'wallet', color: '#10B981' },
  { id: 'ortu', label: 'Kiriman Orang Tua', short: 'Kiriman Ortu', icon: 'hand-coins', color: '#0EA5E9' },
  { id: 'gaji', label: 'Gaji / Freelance', short: 'Gaji / Freelance', icon: 'briefcase', color: '#F59E0B' },
  { id: 'beasiswa', label: 'Beasiswa', short: 'Beasiswa', icon: 'graduation-cap', color: '#14B8A6' },
  { id: 'lain-lain', label: 'Pemasukan Lain', short: 'Pemasukan Lain', icon: 'circle-plus', color: '#64748B' },
]);

const CYCLE_LABELS = Object.freeze({ weekly: 'Mingguan', monthly: 'Bulanan' });
const ROUTES = Object.freeze(['dashboard', 'add', 'subscriptions', 'history', 'data']);
const ROUTE_META = Object.freeze({
  dashboard: { title: 'Beranda', eyebrow: 'Ruang pribadi' },
  add: { title: 'Catat Transaksi', eyebrow: 'Catatan baru' },
  subscriptions: { title: 'Langganan', eyebrow: 'Pengeluaran berulang' },
  history: { title: 'Riwayat Transaksi', eyebrow: 'Jejak keuangan' },
  data: { title: 'Data & Pengaturan', eyebrow: 'Kontrol penuh' },
});

const DEFAULT_QUICK_ADDS = Object.freeze([
  { id: 'quick-bensin', label: 'Bensin', amount: 20000, category: 'bensin' },
  { id: 'quick-makan', label: 'Makan Kampus', amount: 15000, category: 'makan' },
  { id: 'quick-kopi', label: 'Kopi / Jajan', amount: 10000, category: 'makan' },
]);

const DEFAULT_SETTINGS = Object.freeze({
  name: APP_CONFIG.ownerName,
  pin: APP_CONFIG.defaultPin,
  monthlyLimit: 1500000,
  weeklyLimit: 350000,
  theme: 'system',
});

/* --------------------------------------------------------------------------
   UTILITAS UMUM
   -------------------------------------------------------------------------- */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name, className = 'h-4 w-4') {
  return `<i data-lucide="${esc(name)}" class="${esc(className)}"></i>`;
}

function refreshIcons() {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  try {
    window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
  } catch (error) {
    console.warn('Ikon Lucide tidak dapat dimuat:', error);
  }
}

function uid(prefix = 'id') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function cleanText(value, maxLength = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/* --------------------------------------------------------------------------
   FORMAT RUPIAH & TANGGAL
   -------------------------------------------------------------------------- */
const numberFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const dayShortFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'short' });
const dayLongFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateShortFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTinyFormatter = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
const monthLongFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
const monthShortFormatter = new Intl.DateTimeFormat('id-ID', { month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });

function formatNumber(value) {
  return numberFormatter.format(Math.round(Math.abs(Number(value) || 0)));
}

function formatRp(value) {
  const number = Math.round(Number(value) || 0);
  return `${number < 0 ? '-' : ''}Rp ${formatNumber(number)}`;
}

function formatSignedRp(value, type) {
  return `${type === 'income' ? '+' : '−'} ${formatRp(value)}`;
}

function parseMoney(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function formatMoneyInput(value) {
  const amount = parseMoney(value);
  return amount ? numberFormatter.format(amount) : '';
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return localDateKey(new Date());
}

function parseDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
  const [year, month, day] = String(key).split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isValidDateKey(key) {
  return Boolean(parseDateKey(key));
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function daysInMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(date = new Date()) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  return { start: localDateKey(first), end: localDateKey(last), first, last };
}

function weekRange(date = new Date()) {
  const current = startOfDay(date);
  const day = current.getDay();
  const mondayOffset = (day + 6) % 7;
  const first = addDays(current, -mondayOffset);
  const last = addDays(first, 6);
  return { start: localDateKey(first), end: localDateKey(last), first, last };
}

function dateUtc(key) {
  const parsed = parseDateKey(key);
  if (!parsed) return NaN;
  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysBetween(fromKey, toKey) {
  return Math.round((dateUtc(toKey) - dateUtc(fromKey)) / 86400000);
}

function daysUntil(key) {
  return daysBetween(todayKey(), key);
}

function formatDateLong(key) {
  const date = parseDateKey(key);
  return date ? dayLongFormatter.format(date) : '—';
}

function formatDateShort(key) {
  const date = parseDateKey(key);
  return date ? dateShortFormatter.format(date) : '—';
}

function formatDateTiny(key) {
  const date = parseDateKey(key);
  return date ? dateTinyFormatter.format(date) : '—';
}

function formatDayShort(date) {
  return dayShortFormatter.format(date).replace('.', '');
}

function formatMonthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key))) return 'Bulan ini';
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 12);
  return monthLongFormatter.format(date);
}

function formatMonthShort(key) {
  if (!/^\d{4}-\d{2}$/.test(String(key))) return '';
  const date = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1, 12);
  return monthShortFormatter.format(date);
}

function formatWeekRange(startKey, endKey) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return '';
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${formatMonthShort(endKey.slice(0, 7))}`;
  }
  return `${formatDateTiny(startKey)}–${formatDateTiny(endKey)}`;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return `${dateShortFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

function formatCountdown(key) {
  const diff = daysUntil(key);
  if (diff < 0) return { text: `Terlambat ${Math.abs(diff)} hari`, tone: 'coral', days: diff };
  if (diff === 0) return { text: 'Jatuh tempo hari ini', tone: 'coral', days: diff };
  if (diff === 1) return { text: 'Besok', tone: 'amber', days: diff };
  if (diff <= 3) return { text: `${diff} hari lagi`, tone: 'amber', days: diff };
  if (diff <= 7) return { text: `${diff} hari lagi`, tone: 'neutral', days: diff };
  return { text: `${diff} hari lagi`, tone: 'neutral', days: diff };
}

function addMonthsClamped(date, amount) {
  const day = date.getDate();
  const shifted = new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
  const maxDay = daysInMonth(shifted);
  shifted.setDate(Math.min(day, maxDay));
  return shifted;
}

function addCycleDate(date, cycle) {
  if (cycle === 'weekly') return addDays(date, 7);
  return addMonthsClamped(date, 1);
}

function advanceDueDate(dueKey, cycle) {
  const due = parseDateKey(dueKey) || startOfDay(new Date());
  let next = addCycleDate(due, cycle);
  let guard = 0;
  while (localDateKey(next) <= todayKey() && guard < 60) {
    next = addCycleDate(next, cycle);
    guard += 1;
  }
  return localDateKey(next);
}

/* --------------------------------------------------------------------------
   KATEGORI
   -------------------------------------------------------------------------- */
function categoriesForType(type) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

function getCategory(type, id) {
  const categories = categoriesForType(type);
  return categories.find((category) => category.id === id) || categories[categories.length - 1];
}

function categoryLabel(type, id) {
  return getCategory(type, id).label;
}

function categoryColor(type, id) {
  return getCategory(type, id).color;
}

/* --------------------------------------------------------------------------
   STATE & PENYIMPANAN LOKAL
   -------------------------------------------------------------------------- */
const ui = {
  route: 'dashboard',
  previousRoute: null,
  isLocked: true,
  isUnlocked: false,
  ready: false,
  editingId: null,
  returnRoute: 'history',
  addType: 'expense',
  addCategory: 'makan',
  pinBuffer: '',
  pinAttempts: 0,
  pinLockedUntil: 0,
  pinTimer: null,
  history: {
    search: '',
    type: 'all',
    category: 'all',
    month: 'all',
    limit: 20,
  },
  loadWarning: '',
  deferredInstallPrompt: null,
  storageError: false,
};

let state = null;
const chartInstances = { category: null, daily: null };

function createInitialState() {
  const now = new Date().toISOString();
  return {
    version: APP_CONFIG.schemaVersion,
    settings: {
      ...DEFAULT_SETTINGS,
      name: APP_CONFIG.ownerName,
      pin: APP_CONFIG.defaultPin,
    },
    transactions: [],
    subscriptions: [],
    quickAdds: DEFAULT_QUICK_ADDS.map((preset) => ({ ...preset })),
    meta: {
      lastBackupAt: null,
      createdAt: now,
    },
  };
}

const VALID_EXPENSE_IDS = new Set(EXPENSE_CATEGORIES.map((category) => category.id));
const VALID_INCOME_IDS = new Set(INCOME_CATEGORIES.map((category) => category.id));

function normalizeTransaction(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'income' ? 'income' : raw.type === 'expense' ? 'expense' : null;
  if (!type) return null;
  const amount = toInteger(raw.amount, 0);
  if (amount <= 0 || amount > 1e12) return null;
  const date = isValidDateKey(raw.date) ? raw.date : null;
  if (!date) return null;
  const validIds = type === 'income' ? VALID_INCOME_IDS : VALID_EXPENSE_IDS;
  const fallback = type === 'income' ? 'lain-lain' : 'lainnya';
  const category = validIds.has(raw.category) ? raw.category : fallback;
  const note = cleanText(raw.note, 160) || categoryLabel(type, category);
  const id = cleanText(raw.id, 100) || uid('tx');
  const createdAtDate = new Date(raw.createdAt);
  const createdAt = Number.isNaN(createdAtDate.getTime())
    ? new Date(Date.now() + index).toISOString()
    : createdAtDate.toISOString();
  return {
    id,
    type,
    amount,
    category,
    note,
    date,
    createdAt,
  };
}

function normalizeSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 60);
  const amount = toInteger(raw.amount, 0);
  const dueDate = isValidDateKey(raw.dueDate) ? raw.dueDate : null;
  if (!name || amount <= 0 || amount > 1e12 || !dueDate) return null;
  const cycle = raw.cycle === 'weekly' ? 'weekly' : 'monthly';
  const category = VALID_EXPENSE_IDS.has(raw.category) ? raw.category : 'langganan';
  const createdAtDate = new Date(raw.createdAt);
  const createdAt = Number.isNaN(createdAtDate.getTime()) ? new Date().toISOString() : createdAtDate.toISOString();
  let lastPaidAt = null;
  if (raw.lastPaidAt) {
    const parsed = new Date(raw.lastPaidAt);
    if (!Number.isNaN(parsed.getTime())) lastPaidAt = parsed.toISOString();
  }
  return {
    id: cleanText(raw.id, 100) || uid('sub'),
    name,
    amount,
    cycle,
    dueDate,
    category,
    active: raw.active !== false,
    createdAt,
    lastPaidAt,
  };
}

function normalizeQuickAdd(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = cleanText(raw.label, 40);
  const amount = toInteger(raw.amount, 0);
  if (!label || amount <= 0) return null;
  const category = VALID_EXPENSE_IDS.has(raw.category) ? raw.category : 'lainnya';
  return {
    id: cleanText(raw.id, 100) || uid('quick'),
    label,
    amount,
    category,
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const data = source.data && typeof source.data === 'object' ? source.data : source;
  const settingsRaw = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const metaRaw = data.meta && typeof data.meta === 'object' ? data.meta : {};

  const theme = ['light', 'dark', 'system'].includes(settingsRaw.theme) ? settingsRaw.theme : 'system';
  const pin = /^\d{4}$/.test(String(settingsRaw.pin ?? settingsRaw.pinCode ?? ''))
    ? String(settingsRaw.pin ?? settingsRaw.pinCode)
    : APP_CONFIG.defaultPin;

  const transactionIds = new Set();
  const transactions = (Array.isArray(data.transactions) ? data.transactions : [])
    .map((item, index) => normalizeTransaction(item, index))
    .filter((item) => {
      if (!item || transactionIds.has(item.id)) return false;
      transactionIds.add(item.id);
      return true;
    })
    .slice(0, 10000);

  const subscriptionIds = new Set();
  const subscriptions = (Array.isArray(data.subscriptions) ? data.subscriptions : [])
    .map(normalizeSubscription)
    .filter((item) => {
      if (!item || subscriptionIds.has(item.id)) return false;
      subscriptionIds.add(item.id);
      return true;
    })
    .slice(0, 500);

  const hasQuickAddsArray = Array.isArray(data.quickAdds);
  const quickAdds = (hasQuickAddsArray ? data.quickAdds : DEFAULT_QUICK_ADDS)
    .map(normalizeQuickAdd)
    .filter(Boolean)
    .slice(0, 8);

  let lastBackupAt = null;
  if (metaRaw.lastBackupAt) {
    const parsed = new Date(metaRaw.lastBackupAt);
    if (!Number.isNaN(parsed.getTime())) lastBackupAt = parsed.toISOString();
  }

  return {
    version: APP_CONFIG.schemaVersion,
    settings: {
      name: cleanText(settingsRaw.name ?? settingsRaw.displayName, 24) || APP_CONFIG.ownerName,
      pin,
      monthlyLimit: clampNumber(settingsRaw.monthlyLimit, 1, 1e12, DEFAULT_SETTINGS.monthlyLimit),
      weeklyLimit: clampNumber(settingsRaw.weeklyLimit, 1, 1e12, DEFAULT_SETTINGS.weeklyLimit),
      theme,
    },
    transactions,
    subscriptions,
    quickAdds: hasQuickAddsArray ? quickAdds : DEFAULT_QUICK_ADDS.map((preset) => ({ ...preset })),
    meta: {
      lastBackupAt,
      createdAt: (() => {
        const parsed = new Date(metaRaw.createdAt);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })(),
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.warn('Data lokal tidak dapat dibaca:', error);
    ui.loadWarning = 'Data lokal sebelumnya tidak dapat dibaca. Aplikasi dimulai dengan data kosong.';
    return createInitialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(state));
    ui.storageError = false;
    return true;
  } catch (error) {
    console.error('Gagal menyimpan data:', error);
    ui.storageError = true;
    if (typeof showToast === 'function') {
      showToast('Data gagal disimpan. Penyimpanan browser mungkin penuh.', { type: 'error', duration: 7000 });
    }
    return false;
  }
}

/* --------------------------------------------------------------------------
   LOGIKA KEUANGAN
   -------------------------------------------------------------------------- */
function sumTransactions(transactions, type) {
  return transactions.reduce((total, transaction) => {
    return transaction.type === type ? total + transaction.amount : total;
  }, 0);
}

function transactionsInRange(transactions, startKey, endKey) {
  return transactions.filter((transaction) => transaction.date >= startKey && transaction.date <= endKey);
}

function transactionsInMonth(transactions, month) {
  return transactions.filter((transaction) => transaction.date.startsWith(month));
}

function getUpcomingBillsForMonth(reference = new Date()) {
  const range = monthRange(reference);
  const currentMonthStart = range.start;
  const currentMonthEnd = parseDateKey(range.end);
  const items = [];

  state.subscriptions.forEach((subscription) => {
    if (!subscription.active) return;
    let cursor = parseDateKey(subscription.dueDate);
    if (!cursor || cursor > currentMonthEnd) return;

    const firstDueKey = localDateKey(cursor);
    const startedBeforeMonth = firstDueKey < currentMonthStart;
    let guard = 0;

    while (cursor <= currentMonthEnd && guard < 6) {
      items.push({
        subscriptionId: subscription.id,
        name: subscription.name,
        amount: subscription.amount,
        dueDate: localDateKey(cursor),
        cycle: subscription.cycle,
        category: subscription.category,
      });

      // Tagihan yang sudah telat sebelum awal bulan dihitung satu kali,
      // bukan berulang setiap siklus agar angka jatah aman tidak meledak.
      if (startedBeforeMonth) break;
      cursor = addCycleDate(cursor, subscription.cycle);
      guard += 1;
    }
  });

  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    items,
    total: items.reduce((total, item) => total + item.amount, 0),
    count: items.length,
  };
}

function getProgressStatus(spent, limit) {
  const safeLimit = Number(limit) > 0 ? Number(limit) : 0;
  const percentage = safeLimit > 0 ? (spent / safeLimit) * 100 : 0;
  if (percentage >= 100) return { status: 'danger', label: 'Over-budget', percentage };
  if (percentage >= 75) return { status: 'warning', label: 'Hampir penuh', percentage };
  return { status: 'safe', label: 'Terkendali', percentage };
}

function computeSnapshot({ extraTransaction = null, replaceId = null } = {}) {
  const transactions = state.transactions.filter((transaction) => transaction.id !== replaceId);
  if (extraTransaction) transactions.push(extraTransaction);

  const today = startOfDay(new Date());
  const currentMonth = monthKey(today);
  const currentWeek = weekRange(today);
  const currentMonthRange = monthRange(today);
  const monthTransactions = transactionsInMonth(transactions, currentMonth);
  const weekTransactions = transactionsInRange(transactions, currentWeek.start, currentWeek.end);

  const totalIncome = sumTransactions(transactions, 'income');
  const totalExpense = sumTransactions(transactions, 'expense');
  const monthIncome = sumTransactions(monthTransactions, 'income');
  const monthExpense = sumTransactions(monthTransactions, 'expense');
  const weekExpense = sumTransactions(weekTransactions, 'expense');
  const todayExpense = transactions
    .filter((transaction) => transaction.type === 'expense' && transaction.date === todayKey())
    .reduce((total, transaction) => total + transaction.amount, 0);

  const bills = getUpcomingBillsForMonth(today);
  const daysLeft = Math.max(1, daysInMonth(today) - today.getDate() + 1);
  const periodBalance = monthIncome - monthExpense;
  const availableAfterBills = periodBalance - bills.total;
  const safeToSpend = Math.max(0, Math.floor(availableAfterBills / daysLeft));
  const monthlyLimit = Number(state.settings.monthlyLimit) || 0;
  const weeklyLimit = Number(state.settings.weeklyLimit) || 0;
  const dailyCap = monthlyLimit > 0 ? monthlyLimit / daysInMonth(today) : 0;

  return {
    today,
    currentMonth,
    currentWeek,
    currentMonthRange,
    totalBalance: totalIncome - totalExpense,
    totalIncome,
    totalExpense,
    monthIncome,
    monthExpense,
    weekExpense,
    todayExpense,
    bills,
    daysLeft,
    periodBalance,
    availableAfterBills,
    safeToSpend,
    monthlyLimit,
    weeklyLimit,
    dailyCap,
    monthBudget: getProgressStatus(monthExpense, monthlyLimit),
    weekBudget: getProgressStatus(weekExpense, weeklyLimit),
  };
}

function dailyExpenseMap() {
  const map = {};
  state.transactions.forEach((transaction) => {
    if (transaction.type !== 'expense') return;
    map[transaction.date] = (map[transaction.date] || 0) + transaction.amount;
  });
  return map;
}

function calculateStreak() {
  const expenses = state.transactions.filter((transaction) => transaction.type === 'expense');
  if (!expenses.length) {
    return { count: 0, days: [], earliest: null, dailyCap: 0 };
  }

  const map = dailyExpenseMap();
  const dailyCap = Number(state.settings.monthlyLimit) / daysInMonth(new Date());
  const earliest = expenses.map((transaction) => transaction.date).sort()[0];
  const today = startOfDay(new Date());
  const todayExpense = map[todayKey()] || 0;
  let cursor = new Date(today);

  // Jika hari ini belum ada pengeluaran, hitung hari yang sudah selesai.
  if (todayExpense === 0) cursor = addDays(cursor, -1);

  let count = 0;
  while (localDateKey(cursor) >= earliest && count < 366) {
    const spent = map[localDateKey(cursor)] || 0;
    if (dailyCap > 0 && spent > dailyCap) break;
    count += 1;
    cursor = addDays(cursor, -1);
  }

  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const key = localDateKey(date);
    const spent = map[key] || 0;
    days.push({
      key,
      label: formatDayShort(date),
      spent,
      tracked: key >= earliest,
      over: dailyCap > 0 && spent > dailyCap,
      today: key === todayKey(),
    });
  }

  return { count, days, earliest, dailyCap, todayExpense };
}

function sortedTransactions(transactions = state.transactions) {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function sortedSubscriptions({ includePaused = true, onlyActive = false } = {}) {
  return state.subscriptions
    .filter((subscription) => (onlyActive ? subscription.active : includePaused))
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
}

function normalizedMonthlySubscriptionTotal() {
  return Math.round(
    state.subscriptions
      .filter((subscription) => subscription.active)
      .reduce((total, subscription) => {
        return total + (subscription.cycle === 'weekly' ? subscription.amount * (52 / 12) : subscription.amount);
      }, 0)
  );
}

function getFilteredTransactions() {
  const { search, type, category, month } = ui.history;
  const query = cleanText(search, 80).toLowerCase();

  return sortedTransactions().filter((transaction) => {
    if (type !== 'all' && transaction.type !== type) return false;
    if (category !== 'all' && transaction.category !== category) return false;
    if (month !== 'all' && !transaction.date.startsWith(month)) return false;

    if (!query) return true;
    const label = categoryLabel(transaction.type, transaction.category).toLowerCase();
    const amount = formatNumber(transaction.amount);
    const rawAmount = String(transaction.amount);
    return (
      transaction.note.toLowerCase().includes(query) ||
      label.includes(query) ||
      amount.includes(query) ||
      rawAmount.includes(query) ||
      transaction.date.includes(query)
    );
  });
}

function initials(name) {
  const parts = cleanText(name, 24).split(' ').filter(Boolean);
  if (!parts.length) return 'IH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
