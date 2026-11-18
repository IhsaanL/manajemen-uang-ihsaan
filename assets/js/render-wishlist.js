/* ==========================================================================
   MANAJEMEN UANG IHSAAN — RENDER WISHLIST / TABUNGAN TARGET
   ========================================================================== */

'use strict';

function wishlistDeadlineInfo(item) {
  if (!item || !item.deadline) return null;
  const days = daysUntil(item.deadline);
  if (days < 0) return { text: `Lewat ${Math.abs(days)} hari`, tone: 'coral', days };
  if (days === 0) return { text: 'Target hari ini', tone: 'amber', days };
  if (days === 1) return { text: 'Besok', tone: 'amber', days };
  if (days <= 7) return { text: `${days} hari lagi`, tone: 'amber', days };
  return { text: `${days} hari lagi`, tone: 'neutral', days };
}

function wishlistMonthlyPace(item) {
  const progress = wishlistProgress(item);
  if (!item.deadline || progress.remaining <= 0) return null;
  const days = daysUntil(item.deadline);
  if (days < 0) return null;
  const months = Math.max(1, Math.ceil(days / 30));
  return Math.ceil(progress.remaining / months);
}

function wishlistDeadlineBadge(item) {
  const info = wishlistDeadlineInfo(item);
  if (!info) return '<span class="badge badge-neutral">Tanpa tenggat</span>';
  const tone = info.tone === 'coral' ? 'badge badge-coral' : info.tone === 'amber' ? 'badge badge-amber' : 'badge badge-neutral';
  return `<span class="${tone}">${esc(info.text)}</span>`;
}

function renderWishlistPage() {
  const stats = $('#wishlistStats');
  const list = $('#wishlistList');
  const empty = $('#wishlistEmpty');
  const alertContainer = $('#wishlistAlert');
  const doneSection = $('#wishlistDoneSection');
  const doneList = $('#wishlistDoneList');
  const doneCount = $('#wishlistDoneCount');
  if (!stats || !list || !empty || !alertContainer) return;

  const summary = wishlistSummary();
  const active = sortedWishlist();
  const completed = sortedWishlist({ onlyCompleted: true });

  stats.innerHTML = `
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Tabungan terkumpul</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--emerald-soft);color:var(--emerald-deep);">${icon('piggy-bank', 'h-3.5 w-3.5')}</span>
      </div>
      <p class="money mt-4 text-[24px] font-bold tracking-[-0.065em]">${formatRp(summary.totalSaved)}</p>
      <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">dari total target ${formatRp(summary.totalTarget)}</p>
    </article>
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Sisa menuju target</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--amber-soft);color:var(--amber);">${icon('target', 'h-3.5 w-3.5')}</span>
      </div>
      <p class="money mt-4 text-[24px] font-bold tracking-[-0.065em]">${formatRp(summary.totalRemaining)}</p>
      <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">${summary.activeCount} target aktif${summary.completedCount ? ` · ${summary.completedCount} sudah dibeli` : ''}</p>
    </article>
    <article class="card card-pad">
      <div class="flex items-center justify-between gap-3">
        <span class="eyebrow">Siap dibeli</span>
        <span class="grid h-8 w-8 place-items-center rounded-lg" style="background:var(--surface-soft);color:var(--muted);">${icon('shopping-bag', 'h-3.5 w-3.5')}</span>
      </div>
      <div class="mt-4 flex items-baseline gap-2">
        <p class="money text-[24px] font-bold tracking-[-0.065em]">${summary.ready}</p>
        <span class="text-[10px] font-bold" style="color:var(--muted);">barang</span>
      </div>
      <p class="mt-1 text-[9px] font-medium" style="color:var(--muted);">${
        summary.nearest
          ? `Tenggat terdekat ${formatDateShort(summary.nearest.deadline)}`
          : 'Belum ada tenggat yang dipasang'
      }</p>
    </article>
  `;

  if (alertContainer) {
    const readyItems = active.filter((item) => wishlistProgress(item).ready);
    const soonItems = active.filter((item) => {
      if (!item.deadline) return false;
      const days = daysUntil(item.deadline);
      return days >= 0 && days <= 7 && !wishlistProgress(item).ready;
    });
    if (readyItems.length) {
      alertContainer.innerHTML = `<div class="alert-banner is-warning">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(16,185,129,.16);">${icon('party-popper', 'h-4 w-4')}</span>
        <div>
          <p class="text-[10.5px] font-extrabold">${readyItems.length} target sudah terkumpul penuh.</p>
          <p class="mt-0.5 text-[9.5px] font-medium" style="color:var(--muted);">${esc(readyItems.map((item) => item.name).join(', '))}. Tekan "Beli &amp; catat" supaya pengeluarannya masuk riwayat.</p>
        </div>
      </div>`;
    } else if (soonItems.length) {
      alertContainer.innerHTML = `<div class="alert-banner is-warning">
        <span class="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg" style="background:rgba(245,158,11,.15);">${icon('clock-3', 'h-4 w-4')}</span>
        <div>
          <p class="text-[10.5px] font-extrabold">Tenggat mendekat.</p>
          <p class="mt-0.5 text-[9.5px] font-medium" style="color:var(--muted);">${esc(soonItems.map((item) => item.name).join(', '))} ingin dibeli dalam 7 hari ke depan.</p>
        </div>
      </div>`;
    } else {
      alertContainer.innerHTML = '';
    }
  }

  if (!active.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.innerHTML = `
      <div class="card empty-state" style="min-height:280px;">
        <div class="grid h-16 w-16 place-items-center rounded-2xl" style="background:var(--surface-soft);color:var(--muted);">${icon('piggy-bank', 'h-7 w-7')}</div>
        <p class="mt-4 text-[14px] font-extrabold">Belum ada target tabungan</p>
        <p class="mt-1.5 max-w-[300px] text-[10px] font-medium leading-relaxed" style="color:var(--muted);">Tentukan barang yang kamu incar, isi target harganya, lalu sisihkan uang sedikit-sedikit. Tabungan di sini hanya catatan alokasi dan tidak mengubah saldo.</p>
        <button type="button" class="btn btn-primary mt-4" data-action="add-wishlist">${icon('plus', 'h-4 w-4')} Buat Wishlist Pertama</button>
      </div>
    `;
  } else {
    empty.classList.add('hidden');
    empty.innerHTML = '';
    list.innerHTML = active
      .map((item) => {
        const progress = wishlistProgress(item);
        const pace = wishlistMonthlyPace(item);
        const deadlineInfo = wishlistDeadlineInfo(item);
        const trackStatus = progress.ready ? '' : deadlineInfo?.days >= 0 && deadlineInfo.days <= 7 ? 'warning' : '';
        return `
          <article class="sub-card" data-wishlist-card data-id="${esc(item.id)}">
            <div class="flex items-start gap-3">
              <span class="category-icon" style="background:var(--emerald-soft);color:var(--emerald-deep);">${icon(progress.ready ? 'gift' : 'piggy-bank', 'h-4 w-4')}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="truncate text-[12.5px] font-extrabold">${esc(item.name)}</h3>
                    <p class="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.08em]" style="color:var(--muted-2);">
                      ${item.deadline ? `Target ${formatDateShort(item.deadline)}` : 'Tanpa tenggat'}
                    </p>
                  </div>
                  <span class="badge ${progress.ready ? 'badge-emerald' : 'badge-neutral'}">${progress.percent}%</span>
                </div>
                ${item.note ? `<p class="mt-2 text-[9px] font-medium leading-relaxed" style="color:var(--muted);">${esc(item.note)}</p>` : ''}
                <div class="mt-3 flex items-end justify-between gap-2">
                  <p class="money text-[13px] font-bold" style="color:var(--ink);">${formatRp(progress.saved)}</p>
                  <p class="text-[9px] font-semibold" style="color:var(--muted-2);">dari ${formatRp(progress.target)}</p>
                </div>
                <div class="progress-track mt-2">
                  <div class="progress-fill" data-status="${trackStatus}" style="width:${progress.percent}%"></div>
                </div>
                <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p class="text-[8.5px] font-medium" style="color:${progress.ready ? 'var(--emerald-deep)' : 'var(--muted)'};">
                    ${progress.ready ? 'Target tercapai' : `Kurang ${formatRp(progress.remaining)}`}
                    ${pace ? ` · ± ${formatRp(pace)}/bulan` : ''}
                  </p>
                  ${wishlistDeadlineBadge(item)}
                </div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3.5" style="border-color:var(--line);">
              <div class="flex items-center gap-1">
                <button type="button" class="icon-btn icon-btn-sm" data-action="edit-wishlist" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.name)}">${icon('pencil', 'h-3.5 w-3.5')}</button>
                <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-wishlist" data-id="${esc(item.id)}" aria-label="Hapus ${esc(item.name)}">${icon('trash-2', 'h-3.5 w-3.5')}</button>
              </div>
              <div class="flex items-center gap-1.5">
                <button type="button" class="btn btn-secondary btn-sm" data-action="wishlist-add-funds" data-id="${esc(item.id)}">
                  ${icon('plus', 'h-3.5 w-3.5')}
                  Tabung
                </button>
                <button type="button" class="btn btn-primary btn-sm" data-action="wishlist-buy" data-id="${esc(item.id)}">
                  ${icon('shopping-bag', 'h-3.5 w-3.5')}
                  Beli &amp; catat
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  if (doneSection && doneList && doneCount) {
    doneCount.textContent = String(completed.length);
    if (completed.length) {
      doneSection.classList.remove('hidden');
      doneList.innerHTML = completed
        .map((item) => {
          const purchasedKey = item.completedAt ? item.completedAt.slice(0, 10) : null;
          return `
            <div class="card flex flex-wrap items-center gap-3 p-4">
              <span class="category-icon" style="background:var(--emerald-soft);color:var(--emerald-deep);">${icon('check', 'h-4 w-4')}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-[11.5px] font-extrabold">${esc(item.name)}</p>
                <p class="mt-1 text-[8.5px] font-medium" style="color:var(--muted);">
                  ${formatRp(item.target)}${purchasedKey ? ` · dibeli ${formatDateShort(purchasedKey)}` : ''}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <button type="button" class="icon-btn icon-btn-sm" data-action="wishlist-reopen" data-id="${esc(item.id)}" aria-label="Buka kembali ${esc(item.name)}" title="Buka kembali">${icon('rotate-ccw', 'h-3.5 w-3.5')}</button>
                <button type="button" class="icon-btn icon-btn-sm icon-btn-danger" data-action="delete-wishlist" data-id="${esc(item.id)}" aria-label="Hapus ${esc(item.name)}">${icon('trash-2', 'h-3.5 w-3.5')}</button>
              </div>
            </div>
          `;
        })
        .join('');
    } else {
      doneSection.classList.add('hidden');
      doneList.innerHTML = '';
    }
  }
}

function renderWishlistDashboard() {
  const container = $('#wishlistDashboard');
  if (!container) return;

  const active = sortedWishlist().slice(0, 3);
  if (!active.length) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed p-4 text-center" style="border-color:var(--line-strong);background:var(--surface-alt);">
        <p class="text-[10.5px] font-extrabold">Belum ada target tabungan</p>
        <p class="mt-1 text-[9px] font-medium leading-relaxed" style="color:var(--muted);">Mulai dari barang kecil: headset, buku, atau sepatu baru. Tabungan ini hanya alokasi, saldo tidak berubah.</p>
        <button type="button" class="btn btn-secondary btn-sm mt-3" data-action="add-wishlist">${icon('plus', 'h-3.5 w-3.5')} Buat target</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      ${active
        .map((item) => {
          const progress = wishlistProgress(item);
          const info = wishlistDeadlineInfo(item);
          return `
            <a href="#wishlist" class="block rounded-2xl border p-3.5 text-left transition hover:opacity-70" style="border-color:var(--line);background:var(--surface-alt);" data-route="wishlist" aria-label="Lihat wishlist ${esc(item.name)}">
              <div class="flex items-center justify-between gap-2">
                <p class="min-w-0 truncate text-[10.5px] font-extrabold">${esc(item.name)}</p>
                <span class="text-[9px] font-extrabold" style="color:${progress.ready ? 'var(--emerald-deep)' : 'var(--muted)'};">${progress.percent}%</span>
              </div>
              <div class="progress-track mt-2.5">
                <div class="progress-fill" style="width:${progress.percent}%"></div>
              </div>
              <div class="mt-2 flex items-center justify-between gap-2">
                <p class="money text-[9.5px] font-bold">${formatRp(progress.saved)}</p>
                <p class="text-[8px] font-semibold" style="color:var(--muted-2);">${progress.ready ? 'Siap dibeli' : info ? esc(info.text) : `dari ${formatRp(progress.target)}`}</p>
              </div>
            </a>
          `;
        })
        .join('')}
    </div>
  `;
}
