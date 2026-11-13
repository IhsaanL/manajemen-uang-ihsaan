/* ==========================================================================
   MANAJEMEN UANG IHSAAN — INTERAKSI, FORM, MODAL, BACKUP
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   TOAST & MODAL
   -------------------------------------------------------------------------- */
function showToast(message, { type = 'success', duration = 4600, actionLabel = '', onAction = null } = {}) {
  const region = $('#toastRegion');
  if (!region) return;

  while (region.children.length >= 4) region.firstElementChild?.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  const palette =
    type === 'error'
      ? { bg: 'var(--coral-soft)', fg: 'var(--coral)', iconName: 'circle-alert' }
      : type === 'warning'
        ? { bg: 'var(--amber-soft)', fg: 'var(--amber)', iconName: 'triangle-alert' }
        : { bg: 'var(--emerald-soft)', fg: 'var(--emerald-deep)', iconName: 'check' };

  toast.innerHTML = `
    <span class="toast-icon" style="background:${palette.bg};color:${palette.fg};">${icon(palette.iconName, 'h-4 w-4')}</span>
    <p class="min-w-0 flex-1 text-[10.5px] font-semibold leading-relaxed" style="color:var(--ink);">${esc(message)}</p>
    ${actionLabel ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}
  `;
  region.appendChild(toast);
  refreshIcons();

  let timer = null;
  const remove = () => {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    if (timer) window.clearTimeout(timer);
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  };
  const armTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(remove, duration);
  };

  const actionButton = toast.querySelector('.toast-action');
  if (actionButton && typeof onAction === 'function') {
    actionButton.addEventListener('click', () => {
      try {
        onAction();
      } catch (error) {
        console.error(error);
      }
      remove();
    });
  }
  toast.addEventListener('mouseenter', () => {
    if (timer) window.clearTimeout(timer);
  });
  toast.addEventListener('mouseleave', armTimer);
  armTimer();
}

let modalConfirmHandler = null;
let modalReturnFocus = null;

function openModal({ title, subtitle = '', content = '', wide = false }) {
  const layer = $('#modalLayer');
  if (!layer) return;
  modalReturnFocus = document.activeElement;

  layer.hidden = false;
  layer.setAttribute('aria-hidden', 'false');
  layer.innerHTML = `
    <div class="modal-backdrop" data-modal-close aria-hidden="true"></div>
    <div class="modal-card ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabindex="-1">
      <div class="flex items-start justify-between gap-4 border-b p-5" style="border-color:var(--line);">
        <div class="min-w-0">
          <h2 id="modalTitle" class="text-[16px] font-extrabold tracking-[-0.035em]">${esc(title)}</h2>
          ${subtitle ? `<p class="mt-1 text-[10px] font-medium leading-relaxed" style="color:var(--muted);">${esc(subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn icon-btn-sm flex-none" data-modal-close aria-label="Tutup dialog">
          ${icon('x', 'h-3.5 w-3.5')}
        </button>
      </div>
      <div class="p-5">${content}</div>
    </div>
  `;
  document.body.classList.add('scroll-locked');
  refreshIcons();

  window.setTimeout(() => {
    const focusable = layer.querySelector(
      'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)'
    );
    (focusable || layer.querySelector('.modal-card'))?.focus();
  }, 40);
}

function closeModal() {
  const layer = $('#modalLayer');
  if (!layer || layer.hidden) return;
  layer.hidden = true;
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '';
  modalConfirmHandler = null;
  const lockScreen = $('#lockScreen');
  if (lockScreen && lockScreen.classList.contains('is-hidden')) {
    document.body.classList.remove('scroll-locked');
  }
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') {
    try {
      modalReturnFocus.focus({ preventScroll: true });
    } catch {
      /* Abaikan fokus yang sudah tidak tersedia. */
    }
  }
  modalReturnFocus = null;
}

function confirmDialog({
  title,
  subtitle = '',
  content,
  confirmLabel = 'Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'primary',
  onConfirm,
}) {
  const confirmClass = tone === 'danger' ? 'btn btn-danger' : tone === 'warning' ? 'btn btn-primary' : 'btn btn-primary';
  openModal({
    title,
    subtitle,
    content: `
      <div class="space-y-4">
        <div class="text-[10.5px] font-medium leading-relaxed" style="color:var(--muted);">${content}</div>
        <div class="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style="border-color:var(--line);">
          <button type="button" class="btn btn-secondary" data-modal-close>${esc(cancelLabel)}</button>
          <button type="button" class="${confirmClass}" data-confirm>${esc(confirmLabel)}</button>
        </div>
      </div>
    `,
  });
  modalConfirmHandler = typeof onConfirm === 'function' ? onConfirm : null;
}

function bindModalEvents() {
  const layer = $('#modalLayer');
  if (!layer) return;
  layer.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }
    const confirmButton = event.target.closest('[data-confirm]');
    if (confirmButton) {
      const handler = modalConfirmHandler;
      closeModal();
      if (handler) {
        try {
          handler();
        } catch (error) {
          console.error(error);
          showToast('Terjadi kesalahan saat memproses tindakan.', { type: 'error' });
        }
      }
    }
  });
}

/* --------------------------------------------------------------------------
   UTILITAS FORM
   -------------------------------------------------------------------------- */
function setupMoneyInput(input) {
  if (!input || input.dataset.moneyReady === 'true') return;
  input.dataset.moneyReady = 'true';
  input.addEventListener('input', () => {
    const rawDigits = input.value.replace(/\D/g, '').slice(0, 15);
    input.value = rawDigits ? numberFormatter.format(Number(rawDigits)) : '';
    if (input.id === 'txAmount') renderAddPreview();
    if (input.id === 'settingMonthly' || input.id === 'settingWeekly') {
      const error = $(`#${input.id}Error`);
      if (error) error.classList.remove('is-visible');
      input.removeAttribute('aria-invalid');
    }
  });
}

function setError(inputSelector, errorSelector, message) {
  const input = typeof inputSelector === 'string' ? $(inputSelector) : inputSelector;
  const error = typeof errorSelector === 'string' ? $(errorSelector) : errorSelector;
  if (input) input.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = message;
    error.classList.add('is-visible');
  }
}

function clearError(inputSelector, errorSelector) {
  const input = typeof inputSelector === 'string' ? $(inputSelector) : inputSelector;
  const error = typeof errorSelector === 'string' ? $(errorSelector) : errorSelector;
  if (input) input.removeAttribute('aria-invalid');
  if (error) {
    error.textContent = '';
    error.classList.remove('is-visible');
  }
}

function clearAddErrors() {
  clearError('#txAmount', '#txAmountError');
  clearError('#txCategoryError', '#txCategoryError');
  clearError('#txDate', '#txDateError');
  clearError('#txNote', '#txNoteError');
}

/* --------------------------------------------------------------------------
   FORM TRANSAKSI
   -------------------------------------------------------------------------- */
function resetAddForm() {
  const form = $('#txForm');
  if (!form) return;
  ui.editingId = null;
  ui.addType = 'expense';
  ui.addCategory = 'makan';
  form.reset();
  const date = $('#txDate');
  if (date) {
    date.value = todayKey();
    date.max = todayKey();
  }
  const banner = $('#editBanner');
  if (banner) {
    banner.classList.add('hidden');
    banner.classList.remove('flex');
  }
  clearAddErrors();
  renderAddCategories();
  renderAddPreview();
  const notes = $('#txNote');
  if (notes) {
    notes.value = '';
  }
}

function fillAddForm(transaction) {
  const amount = $('#txAmount');
  const note = $('#txNote');
  const date = $('#txDate');
  if (amount) amount.value = formatNumber(transaction.amount);
  if (note) note.value = transaction.note;
  if (date) {
    date.value = transaction.date;
    date.max = todayKey();
  }
  const banner = $('#editBanner');
  if (banner) {
    banner.classList.remove('hidden');
    banner.classList.add('flex');
  }
  clearAddErrors();
  renderAddCategories();
  renderAddPreview();
  updateHeader();
  refreshIcons();
}

function startEditTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  ui.returnRoute = ui.route === 'add' ? ui.returnRoute : ui.route;
  ui.editingId = transaction.id;
  ui.addType = transaction.type;
  ui.addCategory = transaction.category;
  fillAddForm(transaction);
  go('add');
  window.setTimeout(() => {
    const amount = $('#txAmount');
    if (amount) amount.focus();
  }, 140);
}

function cancelEdit() {
  const destination = ui.returnRoute || 'history';
  resetAddForm();
  go(destination);
}

function handleAddSubmit(event) {
  event.preventDefault();
  if (!state) return;
  clearAddErrors();

  const amount = parseMoney($('#txAmount')?.value);
  const note = cleanText($('#txNote')?.value, 160);
  const date = $('#txDate')?.value;
  let firstInvalid = null;

  if (amount <= 0) {
    setError('#txAmount', '#txAmountError', 'Nominal harus lebih dari Rp 0.');
    firstInvalid = firstInvalid || $('#txAmount');
  }
  if (!isValidDateKey(date)) {
    setError('#txDate', '#txDateError', 'Pilih tanggal yang valid.');
    firstInvalid = firstInvalid || $('#txDate');
  } else if (date > todayKey()) {
    setError('#txDate', '#txDateError', 'Tanggal tidak boleh melewati hari ini.');
    firstInvalid = firstInvalid || $('#txDate');
  }
  if (!note) {
    setError('#txNote', '#txNoteError', 'Tulis keterangan singkat transaksi.');
    firstInvalid = firstInvalid || $('#txNote');
  }

  if (firstInvalid) {
    firstInvalid.focus();
    showToast('Periksa kembali bagian yang ditandai.', { type: 'error' });
    return;
  }

  const wasEditing = Boolean(ui.editingId);
  const existingIndex = wasEditing ? state.transactions.findIndex((transaction) => transaction.id === ui.editingId) : -1;
  const previous = existingIndex >= 0 ? { ...state.transactions[existingIndex] } : null;
  const transaction = {
    id: wasEditing ? ui.editingId : uid('tx'),
    type: ui.addType,
    amount,
    category: ui.addCategory,
    note,
    date,
    createdAt: wasEditing && previous ? previous.createdAt : new Date().toISOString(),
  };

  if (wasEditing && existingIndex >= 0) {
    state.transactions[existingIndex] = transaction;
  } else {
    state.transactions.unshift(transaction);
  }
  saveState();
  ui.editingId = null;
  resetAddForm();
  renderAll();
  go(wasEditing ? 'history' : 'dashboard');
  showToast(wasEditing ? 'Transaksi berhasil diperbarui.' : 'Transaksi berhasil dicatat.', {
    actionLabel: 'Urungkan',
    onAction: () => {
      if (wasEditing && previous) {
        const index = state.transactions.findIndex((item) => item.id === transaction.id);
        if (index >= 0) state.transactions[index] = previous;
      } else {
        state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
      }
      saveState();
      renderAll();
    },
  });
}

function handleQuickAdd(id) {
  const preset = state.quickAdds.find((item) => item.id === id);
  if (!preset) return;
  const transaction = {
    id: uid('tx'),
    type: 'expense',
    amount: preset.amount,
    category: preset.category,
    note: preset.label,
    date: todayKey(),
    createdAt: new Date().toISOString(),
  };
  state.transactions.unshift(transaction);
  saveState();
  renderAll();
  showToast(`${preset.label} ${formatRp(preset.amount)} dicatat.`, {
    actionLabel: 'Urungkan',
    onAction: () => {
      state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
      saveState();
      renderAll();
    },
  });
}

function askDeleteTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  const index = state.transactions.findIndex((item) => item.id === id);
  confirmDialog({
    title: 'Hapus transaksi?',
    subtitle: 'Catatan akan dihapus dari saldo dan laporan.',
    content: `
      <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
        <p class="text-[11px] font-extrabold">${esc(transaction.note)}</p>
        <div class="mt-1.5 flex items-center justify-between gap-3">
          <span class="text-[9px] font-medium" style="color:var(--muted);">${esc(categoryLabel(transaction.type, transaction.category))} · ${formatDateShort(transaction.date)}</span>
          <span class="money text-[11px] font-bold" style="color:${transaction.type === 'income' ? 'var(--emerald-deep)' : 'var(--coral)'};">${formatSignedRp(transaction.amount, transaction.type)}</span>
        </div>
      </div>
    `,
    confirmLabel: 'Hapus Transaksi',
    tone: 'danger',
    onConfirm: () => {
      state.transactions.splice(index, 1);
      saveState();
      renderAll();
      showToast('Transaksi dihapus.', {
        actionLabel: 'Urungkan',
        onAction: () => {
          state.transactions.splice(Math.min(index, state.transactions.length), 0, transaction);
          saveState();
          renderAll();
        },
      });
    },
  });
}

/* --------------------------------------------------------------------------
   MODAL LANGGANAN
   -------------------------------------------------------------------------- */
function openSubscriptionModal(id = null) {
  const existing = id ? state.subscriptions.find((item) => item.id === id) : null;
  const defaultDue = localDateKey(addDays(new Date(), 7));
  const categoryOptions = EXPENSE_CATEGORIES.map((category) => {
    const selected = existing ? existing.category === category.id : category.id === 'langganan';
    return `<option value="${esc(category.id)}" ${selected ? 'selected' : ''}>${esc(category.label)}</option>`;
  }).join('');

  openModal({
    title: existing ? 'Edit langganan' : 'Tambah langganan',
    subtitle: 'Tagihan berulang akan muncul di radar dan ikut dihitung dalam jatah aman.',
    content: `
      <form id="subscriptionForm" class="space-y-4" novalidate>
        <div>
          <label for="subName" class="field-label"><span>Nama langganan</span></label>
          <input id="subName" type="text" maxlength="60" class="input-base" placeholder="Contoh: Spotify Premium" value="${existing ? esc(existing.name) : ''}" autocomplete="off">
          <p id="subNameError" class="field-error"></p>
        </div>
        <div>
          <label for="subAmount" class="field-label"><span>Nominal</span><span class="text-[9px] font-medium" style="color:var(--muted-2);">Rp</span></label>
          <input id="subAmount" type="text" inputmode="numeric" class="input-base font-mono" placeholder="55.000" value="${existing ? formatNumber(existing.amount) : ''}" autocomplete="off">
          <p id="subAmountError" class="field-error"></p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="subCycle" class="field-label"><span>Siklus</span></label>
            <select id="subCycle" class="input-base">
              <option value="monthly" ${existing?.cycle !== 'weekly' ? 'selected' : ''}>Bulanan</option>
              <option value="weekly" ${existing?.cycle === 'weekly' ? 'selected' : ''}>Mingguan</option>
            </select>
          </div>
          <div>
            <label for="subDue" class="field-label"><span>Jatuh tempo</span></label>
            <input id="subDue" type="date" class="input-base" value="${existing ? existing.dueDate : defaultDue}">
            <p id="subDueError" class="field-error"></p>
          </div>
        </div>
        <div>
          <label for="subCategory" class="field-label"><span>Kategori</span></label>
          <select id="subCategory" class="input-base">${categoryOptions}</select>
        </div>
        <div class="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style="border-color:var(--line);">
          <button type="button" class="btn btn-secondary" data-modal-close>Batal</button>
          <button type="submit" class="btn btn-primary">${icon('save', 'h-4 w-4')} ${existing ? 'Simpan Perubahan' : 'Tambah Langganan'}</button>
        </div>
      </form>
    `,
  });

  setupMoneyInput($('#subAmount'));
  refreshIcons();
  $('#subscriptionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = cleanText($('#subName')?.value, 60);
    const amount = parseMoney($('#subAmount')?.value);
    const cycle = $('#subCycle')?.value === 'weekly' ? 'weekly' : 'monthly';
    const dueDate = $('#subDue')?.value;
    const category = $('#subCategory')?.value;
    let firstInvalid = null;

    clearError('#subName', '#subNameError');
    clearError('#subAmount', '#subAmountError');
    clearError('#subDue', '#subDueError');

    if (!name) {
      setError('#subName', '#subNameError', 'Nama langganan wajib diisi.');
      firstInvalid = firstInvalid || $('#subName');
    }
    if (amount <= 0) {
      setError('#subAmount', '#subAmountError', 'Nominal harus lebih dari Rp 0.');
      firstInvalid = firstInvalid || $('#subAmount');
    }
    if (!isValidDateKey(dueDate)) {
      setError('#subDue', '#subDueError', 'Pilih tanggal jatuh tempo.');
      firstInvalid = firstInvalid || $('#subDue');
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (existing) {
      const index = state.subscriptions.findIndex((item) => item.id === existing.id);
      if (index >= 0) {
        state.subscriptions[index] = {
          ...existing,
          name,
          amount,
          cycle,
          dueDate,
          category,
        };
      }
    } else {
      state.subscriptions.push({
        id: uid('sub'),
        name,
        amount,
        cycle,
        dueDate,
        category,
        active: true,
        createdAt: new Date().toISOString(),
        lastPaidAt: null,
      });
    }
    saveState();
    closeModal();
    renderAll();
    showToast(existing ? 'Langganan diperbarui.' : 'Langganan ditambahkan ke radar.');
  });
}

function toggleSubscription(id) {
  const subscription = state.subscriptions.find((item) => item.id === id);
  if (!subscription) return;
  subscription.active = !subscription.active;
  saveState();
  renderAll();
  showToast(`${subscription.name} ${subscription.active ? 'diaktifkan kembali' : 'dijeda'}.`);
}

function askDeleteSubscription(id) {
  const subscription = state.subscriptions.find((item) => item.id === id);
  if (!subscription) return;
  const index = state.subscriptions.findIndex((item) => item.id === id);
  confirmDialog({
    title: 'Hapus langganan?',
    subtitle: 'Radar akan berhenti menghitung tagihan ini.',
    content: `
      <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
        <p class="text-[11px] font-extrabold">${esc(subscription.name)}</p>
        <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">${CYCLE_LABELS[subscription.cycle]} · ${formatRp(subscription.amount)} · jatuh tempo ${formatDateShort(subscription.dueDate)}</p>
      </div>
      <p>Transaksi yang sudah tercatat sebelumnya tidak ikut terhapus.</p>
    `,
    confirmLabel: 'Hapus Langganan',
    tone: 'danger',
    onConfirm: () => {
      state.subscriptions.splice(index, 1);
      saveState();
      renderAll();
      showToast('Langganan dihapus.', {
        actionLabel: 'Urungkan',
        onAction: () => {
          state.subscriptions.splice(Math.min(index, state.subscriptions.length), 0, subscription);
          saveState();
          renderAll();
        },
      });
    },
  });
}

function askPaySubscription(id) {
  const subscription = state.subscriptions.find((item) => item.id === id);
  if (!subscription) return;
  if (!subscription.active) {
    showToast('Aktifkan langganan terlebih dahulu.', { type: 'warning' });
    return;
  }
  const snapshot = computeSnapshot();
  const balanceAfter = snapshot.totalBalance - subscription.amount;
  const countdown = formatCountdown(subscription.dueDate);

  confirmDialog({
    title: 'Bayar & catat?',
    subtitle: 'Saldo akan berkurang dan transaksi langsung masuk riwayat.',
    content: `
      <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[11px] font-extrabold">${esc(subscription.name)}</p>
            <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">${CYCLE_LABELS[subscription.cycle]} · ${esc(countdown.text)}</p>
          </div>
          <p class="money text-[14px] font-bold">${formatRp(subscription.amount)}</p>
        </div>
        <div class="mt-3 flex items-center justify-between border-t pt-3" style="border-color:var(--line);">
          <span class="text-[9px] font-semibold" style="color:var(--muted);">Saldo setelah bayar</span>
          <span class="money text-[10px] font-bold" style="color:${balanceAfter < 0 ? 'var(--coral)' : 'var(--emerald-deep)'};">${formatRp(balanceAfter)}</span>
        </div>
      </div>
      ${
        balanceAfter < 0
          ? `<div class="alert-banner"><span class="mt-0.5">${icon('triangle-alert', 'h-4 w-4')}</span><p class="text-[9.5px] font-semibold">Saldo tercatat akan menjadi minus setelah pembayaran ini.</p></div>`
          : ''
      }
    `,
    confirmLabel: 'Bayar & Catat',
    tone: 'primary',
    onConfirm: () => {
      const transaction = {
        id: uid('tx'),
        type: 'expense',
        amount: subscription.amount,
        category: subscription.category,
        note: `Bayar ${subscription.name}`,
        date: todayKey(),
        createdAt: new Date().toISOString(),
      };
      const previousDue = subscription.dueDate;
      const previousLastPaid = subscription.lastPaidAt;
      state.transactions.unshift(transaction);
      subscription.dueDate = advanceDueDate(subscription.dueDate, subscription.cycle);
      subscription.lastPaidAt = new Date().toISOString();
      saveState();
      renderAll();
      showToast(`${subscription.name} dibayar dan dicatat.`, {
        actionLabel: 'Urungkan',
        onAction: () => {
          state.transactions = state.transactions.filter((item) => item.id !== transaction.id);
          subscription.dueDate = previousDue;
          subscription.lastPaidAt = previousLastPaid;
          saveState();
          renderAll();
        },
      });
    },
  });
}

/* --------------------------------------------------------------------------
   PRESET CEPAT
   -------------------------------------------------------------------------- */
function openPresetModal() {
  if (state.quickAdds.length >= 8) {
    showToast('Maksimal 8 preset cepat. Hapus salah satu terlebih dahulu.', { type: 'warning' });
    return;
  }

  const categoryOptions = EXPENSE_CATEGORIES.map((category) => {
    return `<option value="${esc(category.id)}" ${category.id === 'makan' ? 'selected' : ''}>${esc(category.label)}</option>`;
  }).join('');

  openModal({
    title: 'Tambah preset cepat',
    subtitle: 'Tombol ini akan muncul di dashboard untuk mencatat pengeluaran dengan satu ketukan.',
    content: `
      <form id="presetForm" class="space-y-4" novalidate>
        <div>
          <label for="presetLabel" class="field-label"><span>Nama tombol</span></label>
          <input id="presetLabel" type="text" maxlength="40" class="input-base" placeholder="Contoh: Kopi sore" autocomplete="off">
          <p id="presetLabelError" class="field-error"></p>
        </div>
        <div>
          <label for="presetAmount" class="field-label"><span>Nominal</span><span class="text-[9px] font-medium" style="color:var(--muted-2);">Rp</span></label>
          <input id="presetAmount" type="text" inputmode="numeric" class="input-base font-mono" placeholder="15.000" autocomplete="off">
          <p id="presetAmountError" class="field-error"></p>
        </div>
        <div>
          <label for="presetCategory" class="field-label"><span>Kategori</span></label>
          <select id="presetCategory" class="input-base">${categoryOptions}</select>
        </div>
        <div class="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end" style="border-color:var(--line);">
          <button type="button" class="btn btn-secondary" data-modal-close>Batal</button>
          <button type="submit" class="btn btn-primary">${icon('plus', 'h-4 w-4')} Tambah Preset</button>
        </div>
      </form>
    `,
  });
  setupMoneyInput($('#presetAmount'));
  refreshIcons();

  $('#presetForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const label = cleanText($('#presetLabel')?.value, 40);
    const amount = parseMoney($('#presetAmount')?.value);
    const category = $('#presetCategory')?.value;
    let firstInvalid = null;
    clearError('#presetLabel', '#presetLabelError');
    clearError('#presetAmount', '#presetAmountError');

    if (!label) {
      setError('#presetLabel', '#presetLabelError', 'Nama tombol wajib diisi.');
      firstInvalid = firstInvalid || $('#presetLabel');
    }
    if (amount <= 0) {
      setError('#presetAmount', '#presetAmountError', 'Nominal harus lebih dari Rp 0.');
      firstInvalid = firstInvalid || $('#presetAmount');
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    state.quickAdds.push({ id: uid('quick'), label, amount, category });
    saveState();
    closeModal();
    renderAll();
    showToast('Preset cepat ditambahkan.');
  });
}

function deletePreset(id) {
  const index = state.quickAdds.findIndex((item) => item.id === id);
  if (index < 0) return;
  const preset = { ...state.quickAdds[index] };
  state.quickAdds.splice(index, 1);
  saveState();
  renderAll();
  showToast('Preset dihapus.', {
    actionLabel: 'Urungkan',
    onAction: () => {
      state.quickAdds.splice(Math.min(index, state.quickAdds.length), 0, preset);
      saveState();
      renderAll();
    },
  });
}

/* --------------------------------------------------------------------------
   PENGATURAN & PIN
   -------------------------------------------------------------------------- */
function handleSettingsSubmit(event) {
  event.preventDefault();
  const name = cleanText($('#settingName')?.value, 24);
  const monthlyLimit = parseMoney($('#settingMonthly')?.value);
  const weeklyLimit = parseMoney($('#settingWeekly')?.value);
  let firstInvalid = null;

  clearError('#settingName', '#settingNameError');
  clearError('#settingMonthly', '#settingMonthlyError');
  clearError('#settingWeekly', '#settingWeeklyError');

  if (!name) {
    setError('#settingName', '#settingNameError', 'Nama panggilan tidak boleh kosong.');
    firstInvalid = firstInvalid || $('#settingName');
  }
  if (monthlyLimit <= 0) {
    setError('#settingMonthly', '#settingMonthlyError', 'Batas bulanan harus lebih dari Rp 0.');
    firstInvalid = firstInvalid || $('#settingMonthly');
  }
  if (weeklyLimit <= 0) {
    setError('#settingWeekly', '#settingWeeklyError', 'Batas mingguan harus lebih dari Rp 0.');
    firstInvalid = firstInvalid || $('#settingWeekly');
  }
  if (monthlyLimit > 0 && weeklyLimit > monthlyLimit) {
    setError('#settingWeekly', '#settingWeeklyError', 'Batas mingguan tidak boleh lebih besar dari batas bulanan.');
    firstInvalid = firstInvalid || $('#settingWeekly');
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  state.settings.name = name;
  state.settings.monthlyLimit = monthlyLimit;
  state.settings.weeklyLimit = weeklyLimit;
  saveState();
  renderAll();
  showToast('Pengaturan berhasil disimpan.');
}

function handlePinSubmit(event) {
  event.preventDefault();
  const current = $('#currentPin')?.value || '';
  const next = $('#newPin')?.value || '';
  const confirmation = $('#confirmPin')?.value || '';
  let firstInvalid = null;

  clearError('#currentPin', '#currentPinError');
  clearError('#newPin', '#newPinError');
  clearError('#confirmPin', '#confirmPinError');

  if (current !== state.settings.pin) {
    setError('#currentPin', '#currentPinError', 'PIN saat ini tidak sesuai.');
    firstInvalid = firstInvalid || $('#currentPin');
  }
  if (!/^\d{4}$/.test(next)) {
    setError('#newPin', '#newPinError', 'PIN harus tepat 4 digit angka.');
    firstInvalid = firstInvalid || $('#newPin');
  }
  if (confirmation !== next) {
    setError('#confirmPin', '#confirmPinError', 'Ulangi PIN dengan tepat.');
    firstInvalid = firstInvalid || $('#confirmPin');
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  state.settings.pin = next;
  saveState();
  $('#pinForm')?.reset();
  showToast('PIN berhasil diperbarui. Gunakan saat membuka aplikasi berikutnya.');
}

/* --------------------------------------------------------------------------
   BACKUP, RESTORE, CSV, RESET
   -------------------------------------------------------------------------- */
function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function backupFilename(extension) {
  return `manajemen-uang-ihsaan-${todayKey()}.${extension}`;
}

function exportJSON() {
  const payload = {
    app: APP_CONFIG.appName,
    version: APP_CONFIG.schemaVersion,
    appVersion: APP_CONFIG.appVersion,
    exportedAt: new Date().toISOString(),
    data: {
      settings: { ...state.settings },
      transactions: state.transactions,
      subscriptions: state.subscriptions,
      quickAdds: state.quickAdds,
      meta: {
        ...state.meta,
        lastBackupAt: new Date().toISOString(),
      },
    },
  };
  state.meta.lastBackupAt = payload.data.meta.lastBackupAt;
  saveState();
  downloadBlob(backupFilename('json'), JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  renderDataPage();
  showToast('Backup JSON berhasil diunduh.');
}

function triggerImport() {
  const input = $('#importFile');
  if (input) {
    input.value = '';
    input.click();
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function exportCSV() {
  if (!state.transactions.length) {
    showToast('Belum ada transaksi untuk diekspor.', { type: 'warning' });
    return;
  }
  const rows = sortedTransactions()
    .slice()
    .reverse()
    .map((transaction) => [
      transaction.date,
      transaction.type === 'income' ? 'Uang Masuk' : 'Uang Keluar',
      categoryLabel(transaction.type, transaction.category),
      transaction.note,
      transaction.amount,
    ]);
  const csv = [
    ['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal (Rp)'],
    ...rows,
  ]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
  downloadBlob(backupFilename('csv'), `\ufeff${csv}`, 'text/csv;charset=utf-8');
  showToast('Laporan CSV berhasil diunduh.');
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('Ukuran file terlalu besar. Maksimal 10 MB.', { type: 'error' });
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (
      !data ||
      typeof data !== 'object' ||
      (!Array.isArray(data.transactions) && !Array.isArray(data.subscriptions) && !data.settings)
    ) {
      throw new Error('Struktur backup tidak dikenali.');
    }

    const normalized = normalizeState(parsed);
    confirmDialog({
      title: 'Restore data dari backup?',
      subtitle: 'Data saat ini akan ditimpa oleh isi file.',
      content: `
        <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
          <p class="text-[10px] font-bold">${esc(file.name)}</p>
          <div class="mt-3 grid grid-cols-2 gap-3 text-[9px] font-medium" style="color:var(--muted);">
            <div><span class="block text-[8px] font-extrabold uppercase tracking-[0.1em]" style="color:var(--muted-2);">Transaksi</span><span class="mt-1 block text-[11px] font-bold" style="color:var(--ink);">${normalized.transactions.length}</span></div>
            <div><span class="block text-[8px] font-extrabold uppercase tracking-[0.1em]" style="color:var(--muted-2);">Langganan</span><span class="mt-1 block text-[11px] font-bold" style="color:var(--ink);">${normalized.subscriptions.length}</span></div>
          </div>
        </div>
        <p>Disarankan mengunduh backup data saat ini terlebih dahulu. Tindakan ini tidak bisa dibatalkan otomatis.</p>
      `,
      confirmLabel: 'Timpa Data',
      tone: 'danger',
      onConfirm: () => {
        state = normalized;
        ui.history = { search: '', type: 'all', category: 'all', month: 'all', limit: 20 };
        resetAddForm();
        applyTheme(state.settings.theme, { persist: false });
        saveState();
        renderAll();
        go('dashboard');
        showToast('Data berhasil dipulihkan dari backup.');
      },
    });
  } catch (error) {
    console.error(error);
    showToast('File backup tidak valid atau rusak.', { type: 'error', duration: 6000 });
  } finally {
    event.target.value = '';
  }
}

function askResetData() {
  confirmDialog({
    title: 'Reset data keuangan?',
    subtitle: 'Semua transaksi dan langganan akan dihapus.',
    content: `
      <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
        <div class="flex items-center justify-between gap-3 text-[10px] font-semibold">
          <span style="color:var(--muted);">Transaksi</span>
          <span class="money font-bold">${state.transactions.length}</span>
        </div>
        <div class="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold">
          <span style="color:var(--muted);">Langganan</span>
          <span class="money font-bold">${state.subscriptions.length}</span>
        </div>
        <div class="mt-2 flex items-center justify-between gap-3 text-[10px] font-semibold">
          <span style="color:var(--muted);">Saldo tercatat</span>
          <span class="money font-bold">${formatRp(computeSnapshot().totalBalance)}</span>
        </div>
      </div>
      <p><strong style="color:var(--ink);">Penting:</strong> pengaturan, PIN, dan preset cepat tetap dipertahankan. Buat backup terlebih dahulu jika masih diperlukan.</p>
    `,
    confirmLabel: 'Hapus Semua Data',
    tone: 'danger',
    onConfirm: () => {
      state.transactions = [];
      state.subscriptions = [];
      ui.history = { search: '', type: 'all', category: 'all', month: 'all', limit: 20 };
      resetAddForm();
      saveState();
      renderAll();
      showToast('Data keuangan berhasil direset.');
    },
  });
}

async function handleInstallApp() {
  if (ui.deferredInstallPrompt) {
    const prompt = ui.deferredInstallPrompt;
    ui.deferredInstallPrompt = null;
    prompt.prompt();
    try {
      await prompt.userChoice;
    } catch {
      /* Diabaikan. */
    }
    updateInstallUI();
    return;
  }

  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    showToast('Aplikasi sudah terpasang di perangkat ini.');
    return;
  }

  openModal({
    title: 'Pasang ke home screen',
    subtitle: 'Aplikasi ini sudah PWA-ready.',
    content: `
      <div class="space-y-4 text-[10px] font-medium leading-relaxed" style="color:var(--muted);">
        <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
          <p class="text-[10.5px] font-extrabold" style="color:var(--ink);">Chrome / Edge di Android & Windows</p>
          <p class="mt-1.5">Buka menu browser (⋮) lalu pilih <strong style="color:var(--ink);">Install app</strong> atau <strong style="color:var(--ink);">Tambahkan ke layar utama</strong>.</p>
        </div>
        <div class="rounded-2xl border p-4" style="border-color:var(--line);background:var(--surface-alt);">
          <p class="text-[10.5px] font-extrabold" style="color:var(--ink);">Safari di iPhone</p>
          <p class="mt-1.5">Ketuk tombol <strong style="color:var(--ink);">Share</strong>, lalu pilih <strong style="color:var(--ink);">Add to Home Screen</strong>.</p>
        </div>
        <p class="flex items-start gap-2 text-[9px]">
          ${icon('info', 'mt-0.5 h-3 w-3 flex-none')}
          <span>Pemasangan PWA memerlukan akses melalui http/https atau localhost. Saat dibuka langsung dari file, seluruh fitur tetap berjalan normal.</span>
        </p>
        <button type="button" class="btn btn-primary w-full" data-modal-close>Mengerti</button>
      </div>
    `,
  });
}
