/* ==========================================================================
   MANAJEMEN UANG IHSAAN — RENDER DASHBOARD & GRAFIK
   ========================================================================== */

'use strict';

function renderAll({ charts = true } = {}) {
  if (!state) return;
  updateHeader();
  renderNavState();
  renderDashboard();
  if (typeof renderAddCategories === 'function') renderAddCategories();
  if (typeof renderAddPreview === 'function') renderAddPreview();
  if (typeof renderSubscriptionsPage === 'function') renderSubscriptionsPage();
  if (typeof renderHistoryOptions === 'function') renderHistoryOptions();
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof renderDataPage === 'function') renderDataPage();
  refreshIcons();
  if (charts && ui.isUnlocked && ui.route === 'dashboard') {
    window.requestAnimationFrame(renderCharts);
  }
}

function updateHeader() {
  const title = $('#pageTitle');
  const eyebrow = $('#headerEyebrow');
  const eyebrowMobile = $('#headerEyebrowMobile');
  const date = $('#headerDate');
  const avatar = $('#avatarInitials');
  const meta = ROUTE_META[ui.route] || ROUTE_META.dashboard;

  if (title) {
    if (ui.route === 'dashboard') {
      title.textContent = `Halo, ${state.settings.name}.`;
    } else if (ui.route === 'add' && ui.editingId) {
      title.textContent = 'Edit Transaksi';
    } else {
      title.textContent = meta.title;
    }
  }
  if (eyebrow) eyebrow.textContent = meta.eyebrow;
  if (eyebrowMobile) eyebrowMobile.textContent = meta.eyebrow;
  if (date) date.textContent = formatDateLong(todayKey());
  if (avatar) avatar.textContent = initials(state.settings.name);
}

function renderNavState() {
  $$('[data-route]').forEach((element) => {
    if (!element.classList.contains('nav-item') && !element.classList.contains('mobile-nav-item')) return;
    const active = element.dataset.route === ui.route;
    element.classList.toggle('is-active', active);
    if (active) {
      element.setAttribute('aria-current', 'page');
    } else {
      element.removeAttribute('aria-current');
    }
  });

  const dueSoon = state.subscriptions.filter((subscription) => {
    if (!subscription.active) return false;
    const difference = daysUntil(subscription.dueDate);
    return difference <= 7;
  }).length;
  const badge = $('#navSubBadge');
  if (badge) {
    badge.textContent = String(dueSoon);
    badge.hidden = dueSoon === 0;
  }
}

function statusBadgeClass(status) {
  if (status === 'danger') return 'badge badge-coral';
  if (status === 'warning') return 'badge badge-amber';
  return 'badge badge-emerald';
}

function dueBadgeClass(tone) {
  if (tone === 'coral') return 'badge badge-coral';
  if (tone === 'amber') return 'badge badge-amber';
  return 'badge badge-neutral';
}

function renderDashboard() {
  const snapshot = computeSnapshot();
  const streak = calculateStreak();
  renderHero(snapshot);
  renderBalanceCards(snapshot);
  renderStreakCard(streak);
  renderBudgetMonitor(snapshot);
  renderBudgetAlert(snapshot);
  renderQuickAdds();
  renderQuickToday();
  renderUpcomingList();
  renderRecentList();
  renderDonutLabels(snapshot);
}

function renderHero(snapshot) {
  const safeElement = $('#safeToSpend');
  const hintElement = $('#safeToSpendHint');
  const statusElement = $('#safeStatusBadge');
  const ring = $('#heroRing');
  const ringPercent = $('#heroRingPercent');
  const periodBalance = $('#heroPeriodBalance');
  const bills = $('#heroBills');
  const daysLeft = $('#heroDaysLeft');

  if (safeElement) safeElement.textContent = formatNumber(snapshot.safeToSpend);
  if (periodBalance) periodBalance.textContent = formatRp(snapshot.periodBalance);
  if (bills) bills.textContent = formatRp(snapshot.bills.total);
  if (daysLeft) daysLeft.textContent = `${snapshot.daysLeft} hari`;

  const available = snapshot.availableAfterBills;
  const status = available > 0 ? 'safe' : 'danger';
  if (statusElement) {
    statusElement.textContent = available > 0 ? 'Siap jajan' : 'Waspada';
    statusElement.style.background = status === 'safe' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.16)';
    statusElement.style.color = status === 'safe' ? '#8df0ca' : '#ffb3b3';
  }

  if (hintElement) {
    if (snapshot.monthIncome <= 0 && snapshot.monthExpense <= 0) {
      hintElement.textContent = 'Belum ada pemasukan bulan ini. Catat uang jajan atau kiriman dulu agar batas aman bisa dihitung.';
    } else if (available <= 0) {
      hintElement.textContent = 'Sisa uang periode ini sudah habis atau tergerus tagihan. Saatnya rem pengeluaran.';
    } else {
      hintElement.textContent = `Dari ${formatRp(snapshot.periodBalance)} sisa periode setelah tagihan ${formatRp(snapshot.bills.total)}, dibagi ${snapshot.daysLeft} hari tersisa.`;
    }
  }

  if (ring) {
    const percent = Math.min(999, Math.max(0, Math.round(snapshot.monthBudget.percentage)));
    const visualPercent = Math.min(100, percent);
    const color =
      snapshot.monthBudget.status === 'danger'
        ? 'var(--coral)'
        : snapshot.monthBudget.status === 'warning'
          ? 'var(--amber)'
          : 'var(--emerald)';
    ring.style.setProperty('--progress', String(visualPercent));
    ring.style.background = `conic-gradient(${color} ${visualPercent}%, rgba(255,255,255,.10) 0)`;
    if (ringPercent) ringPercent.textContent = `${percent}%`;
  }
}

function renderBalanceCards(snapshot) {
  const balance = $('#totalBalance');
  const income = $('#monthIncomeSmall');
  const expense = $('#monthExpenseSmall');

  if (balance) {
    balance.textContent = formatRp(snapshot.totalBalance);
    balance.style.color = snapshot.totalBalance < 0 ? 'var(--coral)' : '';
  }
  if (income) income.textContent = formatRp(snapshot.monthIncome);
  if (expense) expense.textContent = formatRp(snapshot.monthExpense);
}

function renderStreakCard(streak) {
  const count = $('#streakCount');
  const dots = $('#streakDots');
  const hint = $('#streakHint');
  if (count) count.textContent = String(streak.count);

  if (dots) {
    dots.innerHTML = streak.days
      .map((day) => {
        const stateClass = !day.tracked ? '' : day.over ? 'is-over' : 'is-hit';
        const description = `${day.label}: ${formatRp(day.spent)}${day.over ? ' (melewati batas)' : ''}`;
        return `<span class="streak-dot ${stateClass}" title="${esc(description)}" aria-label="${esc(description)}"></span>`;
      })
      .join('');
  }

  if (hint) {
    if (streak.count > 0) {
      hint.textContent = `Termasuk hari ini. Batas harian ${formatRp(streak.dailyCap)}.`;
    } else if (streak.todayExpense > 0) {
      hint.textContent = `Pengeluaran hari ini sudah melewati batas ${formatRp(streak.dailyCap)}.`;
    } else {
      hint.textContent = 'Mulai jaga pengeluaran harian untuk membangun streak.';
    }
  }
}

function renderBudgetMonitor(snapshot) {
  const container = $('#budgetMonitor');
  if (!container) return;
  const week = snapshot.currentWeek;
  const rows = [
    {
      label: 'Minggu ini',
      period: formatWeekRange(week.start, week.end),
      spent: snapshot.weekExpense,
      limit: snapshot.weeklyLimit,
      budget: snapshot.weekBudget,
    },
    {
      label: 'Bulan ini',
      period: formatMonthLabel(snapshot.currentMonth),
      spent: snapshot.monthExpense,
      limit: snapshot.monthlyLimit,
      budget: snapshot.monthBudget,
    },
  ];

  container.innerHTML = rows
    .map((row, index) => {
      const percentage = Math.min(100, Math.max(0, Math.round(row.budget.percentage)));
      const remaining = row.limit - row.spent;
      return `
        <div class="${index ? 'border-t pt-4' : ''}" style="${index ? 'border-color:var(--line);' : ''}">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[10.5px] font-extrabold" style="color:var(--ink);">${esc(row.label)}</p>
              <p class="mt-0.5 text-[8.5px] font-medium" style="color:var(--muted);">${esc(row.period)}</p>
            </div>
            <span class="${statusBadgeClass(row.budget.status)}">${esc(row.budget.label)}</span>
          </div>
          <div class="mt-2.5 flex items-end justify-between gap-3">
            <p class="money text-[12px] font-semibold" style="color:var(--ink);">${formatRp(row.spent)}</p>
            <p class="text-[9px] font-semibold" style="color:var(--muted-2);">dari ${formatRp(row.limit)}</p>
          </div>
          <div class="progress-track mt-2">
            <div class="progress-fill" data-status="${row.budget.status}" style="width:${percentage}%"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2">
            <p class="text-[8.5px] font-medium" style="color:${remaining < 0 ? 'var(--coral)' : 'var(--muted)'};">
              ${remaining < 0 ? `Lewat ${formatRp(Math.abs(remaining))}` : `Sisa ${formatRp(remaining)}`}
            </p>
            <p class="money text-[8.5px] font-semibold" style="color:var(--muted-2);">${Math.round(row.budget.percentage)}%</p>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderBudgetAlert(snapshot) {
  const container = $('#budgetAlertContainer');
  if (!container) return;
  const alerts = [];
  if (snapshot.monthBudget.status === 'danger') {
    const excess = snapshot.monthExpense - snapshot.monthlyLimit;
    alerts.push(
      `<div class="alert-banner">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(239,68,68,.15);">${icon('triangle-alert', 'h-4 w-4')}</span>
        <div class="min-w-0 flex-1">
          <p class="text-[10.5px] font-extrabold">Over-budget bulan ini.</p>
          <p class="mt-0.5 text-[9.5px] font-medium leading-relaxed" style="color:var(--muted);">Pengeluaran bulan ini melewati batas ${formatRp(excess)}. Tahan pengeluaran atau sesuaikan batas dengan sadar.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm hidden flex-none sm:inline-flex" data-route="data">Atur</button>
      </div>`
    );
  }
  if (snapshot.weekBudget.status === 'danger') {
    const excess = snapshot.weekExpense - snapshot.weeklyLimit;
    alerts.push(
      `<div class="alert-banner">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(239,68,68,.15);">${icon('triangle-alert', 'h-4 w-4')}</span>
        <div class="min-w-0 flex-1">
          <p class="text-[10.5px] font-extrabold">Minggu ini sudah lewat batas.</p>
          <p class="mt-0.5 text-[9.5px] font-medium leading-relaxed" style="color:var(--muted);">Kelebihan ${formatRp(excess)} dari batas mingguan. Sisa minggu ini sebaiknya lebih tenang.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm hidden flex-none sm:inline-flex" data-route="data">Atur</button>
      </div>`
    );
  }
  container.innerHTML = alerts.length ? `<div class="space-y-2">${alerts.join('')}</div>` : '';
}

function renderQuickAdds() {
  const container = $('#quickAdds');
  if (!container) return;

  if (!state.quickAdds.length) {
    container.innerHTML = `
      <div class="empty-state col-span-full" style="min-height:120px;">
        <div class="empty-icon">${icon('zap', 'h-5 w-5')}</div>
        <p class="mt-3 text-[11px] font-bold">Belum ada preset cepat</p>
        <p class="mt-1 text-[9.5px] font-medium" style="color:var(--muted);">Tambahkan tombol rutin favoritmu.</p>
        <button type="button" class="btn btn-secondary btn-sm mt-3" data-route="data">${icon('plus', 'h-3.5 w-3.5')} Buat preset</button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.quickAdds
    .map((preset) => {
      const category = getCategory('expense', preset.category);
      return `
        <button type="button" class="quick-chip group" data-action="quick-add" data-id="${esc(preset.id)}" aria-label="Catat ${esc(preset.label)} ${formatRp(preset.amount)}">
          <span class="quick-icon" style="background:${category.color}18;color:${category.color};">${icon(category.icon, 'h-4 w-4')}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[10px] font-extrabold" style="color:var(--ink);">${esc(preset.label)}</span>
            <span class="money mt-1 block text-[9px] font-semibold" style="color:var(--muted);">${formatRp(preset.amount)}</span>
          </span>
          <span class="grid h-6 w-6 flex-none place-items-center rounded-lg transition group-hover:bg-[var(--emerald-soft)]" style="color:var(--muted-2);">${icon('plus', 'h-3.5 w-3.5')}</span>
        </button>
      `;
    })
    .join('');
}

function renderQuickToday() {
  const container = $('#quickToday');
  if (!container) return;

  const key = todayKey();
  const todayTx = state.transactions.filter((transaction) => transaction.date === key);
  const expense = todayTx
    .filter((transaction) => transaction.type === 'expense')
    .reduce((total, transaction) => total + transaction.amount, 0);
  const income = todayTx
    .filter((transaction) => transaction.type === 'income')
    .reduce((total, transaction) => total + transaction.amount, 0);

  const stats = [
    { label: 'Catatan', value: String(todayTx.length) },
    { label: 'Keluar', value: formatRp(expense) },
    { label: 'Masuk', value: formatRp(income) },
  ];

  container.innerHTML = stats
    .map(
      (stat) => `
        <div class="min-w-0 rounded-xl border px-2.5 py-2" style="border-color:var(--line);background:var(--surface-alt);">
          <p class="text-[7.5px] font-extrabold uppercase tracking-[0.12em]" style="color:var(--muted-2);">${stat.label}</p>
          <p class="money mt-1 truncate text-[10.5px] font-bold" style="color:var(--ink);">${stat.value}</p>
        </div>
      `,
    )
    .join('');
}

function transactionRowMarkup(transaction, { compact = false, showActions = false } = {}) {
  const category = getCategory(transaction.type, transaction.category);
  const isIncome = transaction.type === 'income';
  const rowClass = compact ? 'tx-row' : 'tx-row';
  const categoryText = category.label;
  const metaText = compact
    ? `${esc(categoryText)} · ${esc(formatDateTiny(transaction.date))}`
    : `${esc(categoryText)} · ${esc(formatDateShort(transaction.date))}`;

  return `
    <div class="${rowClass}">
      <span class="category-icon" style="background:${category.color}16;color:${category.color};">${icon(category.icon, 'h-[17px] w-[17px]')}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <p class="tx-note min-w-0 flex-1 truncate text-[10.5px] font-bold" style="color:var(--ink);">${esc(transaction.note)}</p>
          <p class="money flex-none text-[10.5px] font-bold" style="color:${isIncome ? 'var(--emerald-deep)' : 'var(--coral)'};">${formatSignedRp(transaction.amount, transaction.type)}</p>
        </div>
        <p class="mt-1 text-[8.5px] font-medium" style="color:var(--muted);">${metaText}</p>
      </div>
      ${
        showActions
          ? `<div class="tx-actions flex flex-none items-center gap-1">
              <button type="button" class="icon-btn icon-btn-sm" data-action="edit-tx" data-id="${esc(transaction.id)}" aria-label="Edit transaksi ${esc(transaction.note)}">${icon('pencil', 'h-3 w-3')}</button>
              <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-tx" data-id="${esc(transaction.id)}" aria-label="Hapus transaksi ${esc(transaction.note)}">${icon('trash-2', 'h-3 w-3')}</button>
            </div>`
          : ''
      }
    </div>
  `;
}

function renderUpcomingList() {
  const container = $('#upcomingList');
  if (!container) return;
  const active = sortedSubscriptions({ onlyActive: true }).slice(0, 3);

  if (!active.length) {
    container.innerHTML = `
      <div class="empty-state" style="min-height:170px;">
        <div class="empty-icon">${icon('radar', 'h-5 w-5')}</div>
        <p class="mt-3 text-[11px] font-bold">Radar masih bersih</p>
        <p class="mt-1 max-w-[220px] text-[9.5px] font-medium leading-relaxed" style="color:var(--muted);">Tambahkan kuota, Spotify, atau bensin mingguan agar tidak terlewat.</p>
        <button type="button" class="btn btn-secondary btn-sm mt-3" data-action="add-subscription">${icon('plus', 'h-3.5 w-3.5')} Tambah</button>
      </div>
    `;
    return;
  }

  container.innerHTML = active
    .map((subscription) => {
      const category = getCategory('expense', subscription.category);
      const countdown = formatCountdown(subscription.dueDate);
      return `
        <div class="flex items-center gap-3 rounded-2xl border p-3" style="border-color:var(--line);background:var(--surface-alt);">
          <span class="category-icon" style="background:${category.color}16;color:${category.color};">${icon(category.icon, 'h-4 w-4')}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[10.5px] font-bold" style="color:var(--ink);">${esc(subscription.name)}</p>
            <div class="mt-1 flex items-center gap-1.5">
              <span class="${dueBadgeClass(countdown.tone)}">${esc(countdown.text)}</span>
              <span class="text-[8px] font-semibold" style="color:var(--muted-2);">${CYCLE_LABELS[subscription.cycle]}</span>
            </div>
          </div>
          <div class="flex flex-none flex-col items-end gap-1.5">
            <p class="money text-[10px] font-bold" style="color:var(--ink);">${formatRp(subscription.amount)}</p>
            <button type="button" class="text-[8px] font-extrabold" style="color:var(--emerald-deep);" data-action="pay-subscription" data-id="${esc(subscription.id)}">Bayar & Catat</button>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderRecentList() {
  const container = $('#recentList');
  if (!container) return;
  const recent = sortedTransactions().slice(0, 5);

  if (!recent.length) {
    container.innerHTML = `
      <div class="empty-state" style="min-height:180px;">
        <div class="empty-icon">${icon('receipt-text', 'h-5 w-5')}</div>
        <p class="mt-3 text-[11px] font-bold">Belum ada transaksi</p>
        <p class="mt-1 max-w-[220px] text-[9.5px] font-medium leading-relaxed" style="color:var(--muted);">Mulai dari catatan kecil. Uang yang terlihat lebih mudah dikendalikan.</p>
        <button type="button" class="btn btn-primary btn-sm mt-3" data-route="add">${icon('plus', 'h-3.5 w-3.5')} Catat pertama</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div class="space-y-0.5">${recent.map((transaction) => transactionRowMarkup(transaction, { compact: true })).join('')}</div>`;
}

function renderDonutLabels(snapshot) {
  const monthLabel = $('#donutMonthLabel');
  if (monthLabel) monthLabel.textContent = formatMonthShort(snapshot.currentMonth);
  const total = $('#donutTotal');
  if (total) total.textContent = formatRp(snapshot.monthExpense);
}

/* --------------------------------------------------------------------------
   CHART.JS
   -------------------------------------------------------------------------- */
function destroyCharts() {
  if (chartInstances.category) {
    chartInstances.category.destroy();
    chartInstances.category = null;
  }
  if (chartInstances.daily) {
    chartInstances.daily.destroy();
    chartInstances.daily = null;
  }
}

function renderCharts() {
  if (!window.Chart || !state || !ui.isUnlocked || ui.route !== 'dashboard') return;
  const computed = getComputedStyle(document.documentElement);
  const line = computed.getPropertyValue('--line').trim() || '#E5E7EB';
  const muted = computed.getPropertyValue('--muted').trim() || '#6B7280';
  const ink = computed.getPropertyValue('--ink').trim() || '#111315';
  const surface = computed.getPropertyValue('--surface').trim() || '#FFFFFF';
  const emerald = computed.getPropertyValue('--emerald').trim() || '#10B981';
  const coral = computed.getPropertyValue('--coral').trim() || '#EF4444';

  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = muted;
  Chart.defaults.animation.duration = 520;

  const snapshot = computeSnapshot();
  renderCategoryChart(snapshot, { line, muted, ink, surface });
  renderDailyChart(snapshot, { line, muted, ink, surface, emerald, coral });
}

function renderCategoryChart(snapshot, colors) {
  const canvas = $('#categoryChart');
  const empty = $('#donutEmpty');
  const center = $('#donutCenter');
  if (!canvas) return;

  const monthTransactions = transactionsInMonth(state.transactions, snapshot.currentMonth).filter(
    (transaction) => transaction.type === 'expense'
  );
  const grouped = new Map();
  monthTransactions.forEach((transaction) => {
    grouped.set(transaction.category, (grouped.get(transaction.category) || 0) + transaction.amount);
  });
  const data = Array.from(grouped.entries())
    .map(([id, value]) => {
      const category = getCategory('expense', id);
      return { id, label: category.short, color: category.color, value };
    })
    .sort((a, b) => b.value - a.value);

  if (chartInstances.category) {
    chartInstances.category.destroy();
    chartInstances.category = null;
  }

  const rightLegend = $('#categoryLegend');
  if (!data.length) {
    canvas.style.display = 'none';
    if (empty) {
      empty.classList.remove('hidden');
      empty.classList.add('flex');
    }
    if (center) center.style.display = 'none';
    if (rightLegend) rightLegend.innerHTML = '';
    return;
  }

  canvas.style.display = 'block';
  if (empty) {
    empty.classList.add('hidden');
    empty.classList.remove('flex');
  }
  if (center) center.style.display = 'grid';

  const total = data.reduce((sum, item) => sum + item.value, 0);
  chartInstances.category = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.map((item) => item.label),
      datasets: [
        {
          data: data.map((item) => item.value),
          backgroundColor: data.map((item) => item.color),
          borderColor: colors.surface,
          borderWidth: 3,
          hoverBorderColor: colors.surface,
          hoverOffset: 5,
          spacing: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      layout: { padding: 4 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.ink,
          titleColor: '#FFFFFF',
          bodyColor: 'rgba(255,255,255,.78)',
          padding: 10,
          cornerRadius: 10,
          displayColors: true,
          boxWidth: 7,
          boxHeight: 7,
          callbacks: {
            label(context) {
              const value = context.parsed;
              const percent = total ? Math.round((value / total) * 100) : 0;
              return ` ${formatRp(value)} (${percent}%)`;
            },
          },
        },
      },
    },
  });

  if (rightLegend) {
    rightLegend.innerHTML = data
      .map((item) => {
        const percentage = total ? Math.round((item.value / total) * 100) : 0;
        return `
          <div class="flex items-center gap-2.5">
            <span class="legend-dot" style="background:${item.color};"></span>
            <span class="min-w-0 flex-1 truncate text-[9.5px] font-semibold" style="color:var(--muted);">${esc(item.label)}</span>
            <span class="money text-[9.5px] font-bold" style="color:var(--ink);">${formatRp(item.value)}</span>
            <span class="w-8 text-right text-[8.5px] font-semibold" style="color:var(--muted-2);">${percentage}%</span>
          </div>
        `;
      })
      .join('');
  }
}

function renderDailyChart(snapshot, colors) {
  const canvas = $('#dailyChart');
  const empty = $('#dailyEmpty');
  if (!canvas) return;

  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const expenseMap = dailyExpenseMap();
  const values = days.map((date) => expenseMap[localDateKey(date)] || 0);
  const labels = days.map((date) => `${formatDayShort(date)} ${date.getDate()}`);
  const total = values.reduce((sum, value) => sum + value, 0);

  const totalElement = $('#week7Total');
  if (totalElement) totalElement.textContent = formatRp(total);
  const averageElement = $('#dailyAverage');
  if (averageElement) averageElement.textContent = `Rata-rata ${formatRp(Math.round(total / 7))}/hari`;

  if (chartInstances.daily) {
    chartInstances.daily.destroy();
    chartInstances.daily = null;
  }

  if (total <= 0) {
    canvas.style.display = 'none';
    if (empty) {
      empty.classList.remove('hidden');
      empty.classList.add('flex');
    }
    return;
  }

  canvas.style.display = 'block';
  if (empty) {
    empty.classList.add('hidden');
    empty.classList.remove('flex');
  }

  const dailyColors = values.map((value) => {
    if (value <= 0) return `${colors.emerald}30`;
    return snapshot.dailyCap > 0 && value > snapshot.dailyCap ? colors.coral : colors.emerald;
  });

  chartInstances.daily = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: dailyColors,
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 36,
          categoryPercentage: 0.64,
          barPercentage: 0.92,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, right: 2, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.ink,
          titleColor: '#FFFFFF',
          bodyColor: 'rgba(255,255,255,.8)',
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label(context) {
              return formatRp(context.parsed.y);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: colors.muted,
            font: { size: 8.5, weight: '600' },
            maxRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.line, drawTicks: false },
          border: { display: false },
          ticks: { display: false },
          grace: '18%',
        },
      },
    },
  });
}
