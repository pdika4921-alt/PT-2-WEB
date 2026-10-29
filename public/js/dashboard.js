// Dashboard & UI Interactions for "Twisty" Design System

function showToast(msg, type = 'normal') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'ok' ? 'toast-ok' : '')}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : (type === 'ok' ? 'fa-circle-check' : 'fa-bell')}"></i> <span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 1. Accordion Toggle
function initAccordions() {
  document.querySelectorAll('.accordion-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't toggle if clicking on an interactive button
      if (e.target.closest('button') || e.target.closest('a')) return;
      row.classList.toggle('open');
    });
  });
}

// 2. Dot-Chart Interaction
function initDotChart() {
  const cols = document.querySelectorAll('.dot-col');
  cols.forEach(col => {
    col.addEventListener('click', () => {
      cols.forEach(c => c.classList.remove('selected'));
      col.classList.add('selected');
    });
  });
}

// 3. Client-side Pagination (default 10 rows per page, selectable 5/10/25/50)
function initPagination(tableId, pageSize = 10) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr:not(.no-paginate)'));
  const sizeOptions = [5, 10, 25, 50];
  if (rows.length <= Math.min(...sizeOptions)) return;

  let currentPage = 1;
  let currentSize = sizeOptions.includes(pageSize) ? pageSize : 10;

  const container = document.createElement('div');
  container.className = 'pagination';

  function renderPage(page) {
    const totalPages = Math.max(1, Math.ceil(rows.length / currentSize));
    currentPage = Math.min(Math.max(page, 1), totalPages);
    const start = (currentPage - 1) * currentSize;
    const end = start + currentSize;

    rows.forEach((row, idx) => {
      row.style.display = (idx >= start && idx < end) ? '' : 'none';
    });

    renderControls(totalPages);
  }

  function renderControls(totalPages) {
    container.innerHTML = '';

    const sizeWrap = document.createElement('span');
    sizeWrap.className = 'page-size';
    const label = document.createElement('label');
    label.textContent = 'Baris / halaman:';
    const sel = document.createElement('select');
    sel.className = 'page-size-select';
    sizeOptions.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (n === currentSize) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => {
      currentSize = parseInt(sel.value, 10);
      renderPage(1);
    };
    sizeWrap.appendChild(label);
    sizeWrap.appendChild(sel);
    container.appendChild(sizeWrap);

    const nav = document.createElement('span');
    nav.className = 'page-nav';

    const prev = document.createElement('button');
    prev.className = 'page-btn';
    prev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prev.disabled = currentPage === 1;
    prev.onclick = () => renderPage(currentPage - 1);
    nav.appendChild(prev);

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${p === currentPage ? 'active' : ''}`;
        btn.textContent = p;
        btn.onclick = () => renderPage(p);
        nav.appendChild(btn);
      } else if (p === currentPage - 2 || p === currentPage + 2) {
        const dots = document.createElement('span');
        dots.textContent = '…';
        dots.style.padding = '0 4px';
        dots.style.color = '#9AA1AE';
        nav.appendChild(dots);
      }
    }

    const next = document.createElement('button');
    next.className = 'page-btn';
    next.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    next.disabled = currentPage === totalPages;
    next.onclick = () => renderPage(currentPage + 1);
    nav.appendChild(next);

    container.appendChild(nav);
  }

  const parent = table.closest('.table-wrap') || table.parentElement;
  parent.after(container);
  renderPage(1);
}

// 4. Quick Sync Trigger
async function triggerSync(type = 'all') {
  showToast('Memulai sinkronisasi data...', 'normal');
  try {
    let resPt2 = null;
    let resVal = null;

    if (type === 'all' || type === 'dbpt2') {
      const r1 = await fetch('/api/sync/database-pt2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      resPt2 = await r1.json();
    }

    if (type === 'all' || type === 'validasi') {
      const r2 = await fetch('/api/sync/validasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      resVal = await r2.json();
    }

    if ((resPt2 && !resPt2.ok) || (resVal && !resVal.ok)) {
      showToast('Sinkronisasi selesai dengan catatan / login diperlukan', 'error');
    } else {
      showToast('Sinkronisasi berhasil diselesaikan!', 'ok');
      setTimeout(() => window.location.reload(), 1500);
    }
  } catch (err) {
    showToast('Gagal melakukan sinkronisasi: ' + err.message, 'error');
  }
}

// 5. Global Search Submission
function initSearch() {
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = encodeURIComponent(searchInput.value.trim());
        const url = new URL(window.location.href);
        if (val) {
          url.searchParams.set('q', searchInput.value.trim());
        } else {
          url.searchParams.delete('q');
        }
        window.location.href = url.toString();
      }
    });
  }
}

// 6. Modal Image Preview
function openImageModal(imgUrl, title = 'Preview Eviden') {
  let modal = document.getElementById('preview-image-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'preview-image-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:700px; text-align:center;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 id="modal-img-title" style="font-size:16px; font-weight:600;">Preview Eviden</h3>
          <button onclick="closeImageModal()" class="btn-circle"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <img id="modal-img-tag" src="" style="max-width:100%; max-height:70vh; border-radius:12px; object-fit:contain;" />
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeImageModal();
    });
  }

  document.getElementById('modal-img-tag').src = imgUrl;
  document.getElementById('modal-img-title').textContent = title;
  modal.classList.add('show');
}

function closeImageModal() {
  const modal = document.getElementById('preview-image-modal');
  if (modal) modal.classList.remove('show');
}

document.addEventListener('DOMContentLoaded', () => {
  initAccordions();
  initDotChart();
  initSearch();
  initPagination('main-data-table', 10);
});
