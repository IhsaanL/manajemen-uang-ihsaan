/* ==========================================================================
   MANAJEMEN UANG IHSAAN — RENDER HALAMAN
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   HALAMAN CATAT TRANSAKSI
   -------------------------------------------------------------------------- */
function renderAddCategories() {
  const container = $('#categoryChips');
  if (!container) return;
  const categories = categoriesForType(ui.addType);
  if (!categories.some((category) => category.id === ui.addCategory)) {
    ui.addCategory = categories[0].id;
  }

  container.innerHTML = categories
    .map((category) => {
      const active = category.id === ui.addCategory;
      return `
        <button type="button" class="chip justify-start ${active ? 'is-active' : ''}" data-category="${esc(category.id)}" aria-pressed="${active}">
          ${icon(category.icon, 'h-3.5 w-3.5')}
          <span class="truncate">${esc(category.short)}</span>
        </button>
      `;
    })
    .join('');

  $$('#typeToggle [data-type]').forEach((button) => {
    const active = button.dataset.type === ui.addType;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  const hint = $('#categoryHint');
  if (hint) hint.textContent = ui.addType === 'income' ? 'Sumber pemasukan' : 'Pilih satu';

  const submit = $('#txSubmit');
  if (submit) {
    const label = ui.editingId
      ? 'Simpan Perubahan'
      : ui.addType === 'income'
        ? 'Simpan Pemasukan'
        : 'Simpan Pengeluaran';
    submit.className = `btn ${ui.addType === 'income' ? 'btn-accent' : 'btn-primary'} btn-lg sm:min-w-[180px]`;
    submit.innerHTML = `${icon('check', 'h-4 w-4')}<span>${esc(label)}</span>`;
  }

  const previewBadge = $('#previewTypeBadge');
  if (previewBadge) {
    previewBadge.textContent = ui.addType === 'income' ? 'Uang masuk' : 'Uang keluar';
    previewBadge.style.background = ui.addType === 'income' ? 'rgba(16,185,129,.16)' : 'rgba(239,68,68,.15)';
    previewBadge.style.color = ui.addType === 'income' ? '#8df0ca' : '#ffb3b3';
  }
}

function renderAddPreview() {
  const amountInput = $('#txAmount');
  const dateInput = $('#txDate');
  if (!amountInput || !dateInput) return;
  const amount = parseMoney(amountInput.value);
  const date = isValidDateKey(dateInput.value) ? dateInput.value : todayKey();
  const category = ui.addCategory || categoriesForType(ui.addType)[0].id;
  const previewTransaction =
    amount > 0
      ? {
          id: ui.editingId || 'preview-transaction',
          type: ui.addType,
          amount,
          category,
          note: 'Pratinjau',
          date,
          createdAt: new Date().toISOString(),
        }
      : null;

  const snapshot = computeSnapshot({
    extraTransaction: previewTransaction,
    replaceId: ui.editingId,
  });

  const balance = $('#previewBalance');
  const safe = $('#previewSafe');
  const status = $('#previewBudgetStatus');
  if (balance) {
    balance.textContent = formatRp(snapshot.totalBalance);
    balance.style.color = snapshot.totalBalance < 0 ? '#ffb3b3' : '#FFFFFF';
  }
  if (safe) safe.textContent = `${formatRp(snapshot.safeToSpend)}/hari`;
  if (status) {
    status.textContent =
      snapshot.monthBudget.status === 'danger'
        ? 'Over-budget'
        : snapshot.monthBudget.status === 'warning'
          ? 'Hampir penuh'
          : 'Terkendali';
    status.style.color =
      snapshot.monthBudget.status === 'danger'
        ? '#ffb3b3'
        : snapshot.monthBudget.status === 'warning'
          ? '#ffd58f'
          : '#8df0ca';
  }
}

/* --------------------------------------------------------------------------
   HALAMAN LANGGANAN
   -------------------------------------------------------------------------- */
function renderSubscriptionsPage() {
  const stats = $('#subscriptionStats');
  const list = $('#subscriptionList');
  const empty = $('#subscriptionEmpty');
  const alertContainer = $('#subscriptionAlert');
  if (!stats || !list || !empty || !alertContainer) return;

  const active = sortedSubscriptions({ onlyActive: true });
  const all = sortedSubscriptions();
  const monthlyTotal = normalizedMonthlySubscriptionTotal();
  const nearest = active[0] || null;
  const nearestCountdown = nearest ? formatCountdown(nearest.dueDate) : null;
  const dueThisWeek = active.filter((subscription) => daysUntil(subscription.dueDate) <= 7).length;
  const pausedCount = all.filter((subscription) => !subscription.active).length;

  stats.innerHTML = `
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Total rutin / bulan</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--surface-soft);color:var(--muted);">${icon('repeat-2', 'h-3.5 w-3.5')}</span>
      </div>
      <p class="money mt-4 text-[24px] font-bold tracking-[-0.065em]">${formatRp(monthlyTotal)}</p>
      <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">Estimasi semua langganan aktif</p>
    </article>
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Jatuh tempo terdekat</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--amber-soft);color:var(--amber);">${icon('calendar-clock', 'h-3.5 w-3.5')}</span>
      </div>
      ${
        nearest
          ? `<p class="mt-4 truncate text-[15px] font-extrabold">${esc(nearest.name)}</p>
             <div class="mt-1.5 flex items-center gap-2">
               <span class="${dueBadgeClass(nearestCountdown.tone)}">${esc(nearestCountdown.text)}</span>
               <span class="text-[9px] font-medium" style="color:var(--muted);">${formatDateShort(nearest.dueDate)}</span>
             </div>`
          : `<p class="mt-4 text-[15px] font-extrabold">Belum ada tagihan</p><p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">Tambahkan langganan pertamamu.</p>`
      }
    </article>
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Status radar</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--emerald-soft);color:var(--emerald-deep);">${icon('radar', 'h-3.5 w-3.5')}</span>
      </div>
      <div class="mt-4 flex items-baseline gap-2">
        <p class="money text-[24px] font-bold tracking-[-0.065em]">${active.length}</p>
        <span class="text-[10px] font-bold" style="color:var(--muted);">aktif</span>
      </div>
      <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">${dueThisWeek} jatuh tempo ≤ 7 hari${pausedCount ? ` · ${pausedCount} dijeda` : ''}</p>
    </article>
  `;

  if (alertContainer) {
    const overdue = active.filter((subscription) => daysUntil(subscription.dueDate) < 0);
    const dueSoon = active.filter((subscription) => {
      const difference = daysUntil(subscription.dueDate);
      return difference >= 0 && difference <= 3;
    });
    if (overdue.length) {
      alertContainer.innerHTML = `<div class="alert-banner">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(239,68,68,.15);">${icon('triangle-alert', 'h-4 w-4')}</span>
        <div>
          <p class="text-[10.5px] font-extrabold">${overdue.length} tagihan sudah terlambat.</p>
          <p class="mt-0.5 text-[9.5px] font-medium" style="color:var(--muted);">${esc(overdue.map((item) => item.name).join(', '))}. Bayar dan catat agar radar kembali bersih.</p>
        </div>
      </div>`;
    } else if (dueSoon.length) {
      alertContainer.innerHTML = `<div class="alert-banner is-warning">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(245,158,11,.15);">${icon('clock-3', 'h-4 w-4')}</span>
        <div>
          <p class="text-[10.5px] font-extrabold">Tagihan mendekat.</p>
          <p class="mt-0.5 text-[9.5px] font-medium" style="color:var(--muted);">${esc(dueSoon.map((item) => item.name).join(', '))} jatuh tempo dalam 3 hari ke depan.</p>
        </div>
      </div>`;
    } else {
      alertContainer.innerHTML = '';
    }
  }

  if (!all.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.innerHTML = `
      <div class="card empty-state" style="min-height:280px;">
        <div class="grid h-16 w-16 place-items-center rounded-2xl" style="background:var(--surface-soft);color:var(--muted);">${icon('radar', 'h-7 w-7')}</div>
        <p class="mt-4 text-[14px] font-extrabold">Radar langganan masih kosong</p>
        <p class="mt-1.5 max-w-[300px] text-[10px] font-medium leading-relaxed" style="color:var(--muted);">Catat kuota internet, Spotify, iCloud, bensin mingguan, atau kas kelas. Hitung mundur dan pembayarannya otomatis rapi.</p>
        <button type="button" class="btn btn-primary mt-4" data-action="add-subscription">${icon('plus', 'h-4 w-4')} Tambah Langganan</button>
      </div>
    `;
    return;
  }

  empty.classList.add('hidden');
  empty.innerHTML = '';
  list.innerHTML = all
    .map((subscription) => {
      const category = getCategory('expense', subscription.category);
      const countdown = formatCountdown(subscription.dueDate);
      const cardTone =
        subscription.active && countdown.days < 0
          ? 'is-overdue'
          : subscription.active && countdown.days <= 3
            ? 'is-soon'
            : '';
      const pausedClass = subscription.active ? '' : 'is-paused';
      return `
        <article class="sub-card ${cardTone} ${pausedClass}">
          <div class="flex items-start gap-3">
            <span class="category-icon" style="background:${category.color}16;color:${category.color};">${icon(category.icon, 'h-4 w-4')}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="truncate text-[12.5px] font-extrabold">${esc(subscription.name)}</h3>
                  <p class="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.08em]" style="color:var(--muted-2);">${esc(category.short)} · ${CYCLE_LABELS[subscription.cycle]}</p>
                </div>
                <p class="money flex-none text-[13px] font-bold" style="color:var(--ink);">${formatRp(subscription.amount)}</p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                ${
                  subscription.active
                    ? `<span class="${dueBadgeClass(countdown.tone)}">${esc(countdown.text)}</span>
                       <span class="text-[8.5px] font-medium" style="color:var(--muted);">${formatDateShort(subscription.dueDate)}</span>`
                    : `<span class="badge badge-neutral">Dijeda</span>
                       <span class="text-[8.5px] font-medium" style="color:var(--muted);">Jatuh tempo ${formatDateShort(subscription.dueDate)}</span>`
                }
              </div>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2 border-t pt-3.5" style="border-color:var(--line);">
            <div class="flex items-center gap-1">
              <button type="button" class="icon-btn icon-btn-sm" data-action="edit-subscription" data-id="${esc(subscription.id)}" aria-label="Edit ${esc(subscription.name)}">${icon('pencil', 'h-3.5 w-3.5')}</button>
              <button type="button" class="icon-btn icon-btn-sm" data-action="toggle-subscription" data-id="${esc(subscription.id)}" aria-label="${subscription.active ? 'Jeda' : 'Aktifkan'} ${esc(subscription.name)}" title="${subscription.active ? 'Jeda langganan' : 'Aktifkan langganan'}">${icon(subscription.active ? 'pause' : 'play', 'h-3.5 w-3.5')}</button>
              <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-subscription" data-id="${esc(subscription.id)}" aria-label="Hapus ${esc(subscription.name)}">${icon('trash-2', 'h-3.5 w-3.5')}</button>
            </div>
            <button type="button" class="btn ${subscription.active ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="pay-subscription" data-id="${esc(subscription.id)}" ${subscription.active ? '' : 'disabled'}>
              ${icon('credit-card', 'h-3.5 w-3.5')}
              Bayar & Catat
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

/* --------------------------------------------------------------------------
   HALAMAN RIWAYAT
   -------------------------------------------------------------------------- */
function renderHistoryOptions() {
  const typeSelect = $('#historyType');
  const categorySelect = $('#historyCategory');
  const monthSelect = $('#historyMonth');
  if (!typeSelect || !categorySelect || !monthSelect) return;

  typeSelect.value = ui.history.type;

  categorySelect.innerHTML = `
    <option value="all">Semua kategori</option>
    <optgroup label="Uang keluar">
      ${EXPENSE_CATEGORIES.map((category) => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('')}
    </optgroup>
    <optgroup label="Uang masuk">
      ${INCOME_CATEGORIES.map((category) => `<option value="${esc(category.id)}">${esc(category.label)}</option>`).join('')}
    </optgroup>
  `;
  if (![...categorySelect.options].some((option) => option.value === ui.history.category)) {
    ui.history.category = 'all';
  }
  categorySelect.value = ui.history.category;

  const months = Array.from(new Set(state.transactions.map((transaction) => transaction.date.slice(0, 7))));
  months.push(monthKey(new Date()));
  const uniqueMonths = [...new Set(months)].sort((a, b) => b.localeCompare(a));
  monthSelect.innerHTML = `
    <option value="all">Semua bulan</option>
    ${uniqueMonths.map((month) => `<option value="${esc(month)}">${esc(formatMonthLabel(month))}</option>`).join('')}
  `;
  if (!uniqueMonths.includes(ui.history.month) && ui.history.month !== 'all') {
    ui.history.month = 'all';
  }
  monthSelect.value = ui.history.month;

  const search = $('#historySearch');
  if (search && document.activeElement !== search) search.value = ui.history.search;
}

function syncHistoryInputs() {
  const search = $('#historySearch');
  const type = $('#historyType');
  const category = $('#historyCategory');
  const month = $('#historyMonth');
  if (search) search.value = ui.history.search;
  if (type) type.value = ui.history.type;
  if (category) category.value = ui.history.category;
  if (month) month.value = ui.history.month;
}

function historyGroupLabel(key) {
  const difference = daysUntil(key);
  if (difference === 0) return `Hari ini · ${formatDateShort(key)}`;
  if (difference === -1) return `Kemarin · ${formatDateShort(key)}`;
  return formatDateLong(key);
}

function renderHistory() {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  const summary = $('#historySummary');
  const loadMore = $('#loadMoreBtn');
  if (!list || !empty || !summary || !loadMore) return;

  const filtered = getFilteredTransactions();
  const totalIncome = sumTransactions(filtered, 'income');
  const totalExpense = sumTransactions(filtered, 'expense');
  const visible = filtered.slice(0, ui.history.limit);

  summary.innerHTML = `
    <span>${filtered.length} transaksi</span>
    <span style="color:var(--emerald-deep);">Masuk ${formatRp(totalIncome)}</span>
    <span style="color:var(--coral);">Keluar ${formatRp(totalExpense)}</span>
  `;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    const filtering =
      ui.history.search ||
      ui.history.type !== 'all' ||
      ui.history.category !== 'all' ||
      ui.history.month !== 'all';
    empty.innerHTML = `
      <div class="empty-state" style="min-height:260px;">
        <div class="empty-icon">${icon(filtering ? 'search' : 'receipt-text', 'h-5 w-5')}</div>
        <p class="mt-3 text-[12px] font-bold">${filtering ? 'Tidak ada transaksi yang cocok' : 'Riwayat masih kosong'}</p>
        <p class="mt-1 max-w-[280px] text-[9.5px] font-medium leading-relaxed" style="color:var(--muted);">
          ${filtering ? 'Coba kata kunci lain atau reset filter untuk melihat semua catatan.' : 'Setiap catatan kecil akan muncul di sini. Mulai dari pengeluaran pertamamu.'}
        </p>
        <button type="button" class="btn ${filtering ? 'btn-secondary' : 'btn-primary'} btn-sm mt-3" data-action="${filtering ? 'reset-filters' : 'go-add'}">
          ${icon(filtering ? 'rotate-ccw' : 'plus', 'h-3.5 w-3.5')}
          ${filtering ? 'Reset filter' : 'Catat transaksi'}
        </button>
      </div>
    `;
    loadMore.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  empty.innerHTML = '';

  const groups = new Map();
  visible.forEach((transaction) => {
    if (!groups.has(transaction.date)) groups.set(transaction.date, []);
    groups.get(transaction.date).push(transaction);
  });

  list.innerHTML = Array.from(groups.entries())
    .map(([date, transactions]) => {
      const dailyIncome = sumTransactions(transactions, 'income');
      const dailyExpense = sumTransactions(transactions, 'expense');
      const net = dailyIncome - dailyExpense;
      return `
        <section class="mb-5 last:mb-0">
          <div class="date-divider">
            <span>${esc(historyGroupLabel(date))}</span>
            <span class="ml-auto font-mono normal-case tracking-normal" style="color:${net >= 0 ? 'var(--emerald-deep)' : 'var(--coral)'};">${net >= 0 ? '+' : '−'} ${formatRp(Math.abs(net))}</span>
          </div>
          <div class="mt-2 space-y-0.5">
            ${transactions.map((transaction) => transactionRowMarkup(transaction, { showActions: true })).join('')}
          </div>
        </section>
      `;
    })
    .join('');

  loadMore.classList.toggle('hidden', visible.length >= filtered.length);
}

/* --------------------------------------------------------------------------
   HALAMAN DATA & PENGATURAN
   -------------------------------------------------------------------------- */
function renderDataPage() {
  const nameInput = $('#settingName');
  const monthlyInput = $('#settingMonthly');
  const weeklyInput = $('#settingWeekly');
  const backupStatus = $('#backupStatus');
  const presetList = $('#presetList');
  if (!nameInput || !monthlyInput || !weeklyInput || !backupStatus || !presetList) return;

  if (document.activeElement !== nameInput) nameInput.value = state.settings.name;
  if (document.activeElement !== monthlyInput) monthlyInput.value = formatNumber(state.settings.monthlyLimit);
  if (document.activeElement !== weeklyInput) weeklyInput.value = formatNumber(state.settings.weeklyLimit);

  if (state.meta.lastBackupAt) {
    backupStatus.className = 'badge badge-emerald';
    backupStatus.textContent = `Backup ${formatDateShort(localDateKey(new Date(state.meta.lastBackupAt)))}`;
  } else {
    backupStatus.className = 'badge badge-neutral';
    backupStatus.textContent = 'Belum backup';
  }

  if (!state.quickAdds.length) {
    presetList.innerHTML = `
      <div class="rounded-xl border border-dashed p-4 text-center" style="border-color:var(--line-strong);">
        <p class="text-[10px] font-bold">Belum ada preset</p>
        <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">Tambahkan tombol favorit untuk mencatat lebih cepat.</p>
      </div>
    `;
  } else {
    presetList.innerHTML = state.quickAdds
      .map((preset) => {
        const category = getCategory('expense', preset.category);
        return `
          <div class="preset-row">
            <span class="grid h-8 w-8 flex-none place-items-center rounded-lg" style="background:${category.color}16;color:${category.color};">${icon(category.icon, 'h-3.5 w-3.5')}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[10px] font-bold">${esc(preset.label)}</p>
              <p class="mt-0.5 text-[8.5px] font-medium" style="color:var(--muted);">${esc(category.short)}</p>
            </div>
            <p class="money flex-none text-[9.5px] font-bold">${formatRp(preset.amount)}</p>
            <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-preset" data-id="${esc(preset.id)}" aria-label="Hapus preset ${esc(preset.label)}">${icon('x', 'h-3 w-3')}</button>
          </div>
        `;
      })
      .join('');
  }

  updateThemeControls();
  updateInstallUI();
}

function updateThemeControls() {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');
  const switchElement = $('#themeSwitch');
  if (switchElement) {
    switchElement.classList.toggle('is-on', isDark);
    switchElement.setAttribute('aria-checked', String(isDark));
    switchElement.setAttribute('aria-label', isDark ? 'Matikan tema gelap' : 'Aktifkan tema gelap');
  }

  $$('[data-action="toggle-theme"]').forEach((button) => {
    if (button.classList.contains('switch')) return;
    button.innerHTML = `${icon(isDark ? 'sun' : 'moon', 'h-[17px] w-[17px]')}`;
  });
  refreshIcons();
}

function updateInstallUI() {
  const button = $('#installBtn');
  const hint = $('#installHint');
  if (!button || !hint) return;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (standalone) {
    hint.textContent = 'Aplikasi sudah berjalan dalam mode terpasang. Data tetap tersimpan lokal di perangkat ini.';
    button.classList.add('hidden');
    return;
  }

  if (ui.deferredInstallPrompt) {
    hint.textContent = 'Browser siap memasang aplikasi. Ketuk tombol Pasang untuk menambahkan ke home screen.';
    button.classList.remove('hidden');
    return;
  }

  if (location.protocol === 'file:') {
    hint.textContent =
      'Saat ini dibuka langsung dari file. Semua fitur berjalan normal. Untuk memasang ke home screen, buka folder ini lewat web server lokal atau hosting statis.';
    button.classList.remove('hidden');
    return;
  }

  hint.textContent =
    'Gunakan menu browser “Install app” atau “Tambahkan ke layar utama”. Jika tombol belum aktif, buka halaman ini melalui HTTPS atau localhost.';
  button.classList.remove('hidden');
}
