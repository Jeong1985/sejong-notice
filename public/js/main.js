import { loadSchools, upsertSchool, deleteSchool, getSchool, initStorage } from './storage.js?v=6';
import { HeaderBuilder } from './header-builder.js';

const ADMIN_PW = '0906';

let adminMode = false;
let currentEditId = null;
let headerBuilder = null;
let pendingDeleteId = null;
let schoolLogo = null;

let toastTimer;

/* ── 이미지 압축 (Canvas API, Firestore 1MB 제한 대응) ── */
async function compressImage(dataUrl, maxW = 300, maxH = 300, quality = 0.75) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxW || h > maxH) {
        const s = Math.min(maxW / w, maxH / h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  showLoadingGrid();
  window.addEventListener('storage-load-error', e => {
    showToast('⚠️ Firestore 연결 실패 — 네트워크를 확인하거나 새로고침해주세요.');
    console.error('[main] Firestore 로드 오류:', e.detail);
  });
  await initStorage();
  renderSchoolGrid();
  bindEvents();
  window.addEventListener('storage-write-error', e => {
    showToast('⚠️ 저장 오류가 발생했습니다. 다시 시도해주세요.');
    console.error('[main] Firestore 쓰기 오류:', e.detail);
  });
});

/* ── 학교 그리드 렌더링 ── */
function renderSchoolGrid() {
  const schools = loadSchools();
  const grid = document.getElementById('schoolGrid');
  const empty = document.getElementById('emptyState');

  if (schools.length === 0) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  grid.innerHTML = schools.map(s => `
    <div class="school-card" data-id="${s.id}">
      <div class="school-logo-wrap">
        ${s.logo
          ? `<img src="${s.logo}" class="school-logo-img" alt="${esc(s.name)}">`
          : `<div class="school-logo-ph">${esc(s.name.charAt(0))}</div>`}
      </div>
      <span class="school-card-name">${esc(s.name)}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.school-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `notice.html?id=${encodeURIComponent(card.dataset.id)}`;
    });
  });
}

/* ── 관리자 학교 목록 렌더링 ── */
function renderManageList() {
  const schools = loadSchools();
  const list = document.getElementById('schoolManageList');

  if (schools.length === 0) {
    list.innerHTML = '<p class="manage-empty">등록된 학교가 없습니다.</p>';
    return;
  }

  list.innerHTML = schools.map(s => `
    <div class="manage-item">
      <div class="manage-item-left">
        ${s.logo
          ? `<img src="${s.logo}" class="manage-logo" alt="">`
          : `<div class="manage-logo-ph">${esc(s.name.charAt(0))}</div>`}
        <span class="manage-name">${esc(s.name)}</span>
      </div>
      <div class="manage-actions">
        <button class="btn-edit-sm" data-id="${s.id}">수정</button>
        <button class="btn-del-sm" data-id="${s.id}">삭제</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.btn-edit-sm').forEach(btn =>
    btn.addEventListener('click', () => openSchoolModal(btn.dataset.id)));
  list.querySelectorAll('.btn-del-sm').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));
}

/* ── 이벤트 바인딩 ── */
function bindEvents() {
  // 관리자 버튼
  on('btnAdminMode', 'click', () => {
    if (adminMode) openDrawer();
    else openModal('loginModal');
  });

  // 로그인 모달
  on('btnLoginClose',   'click', () => closeModal('loginModal'));
  on('btnLoginCancel',  'click', () => closeModal('loginModal'));
  on('btnLoginConfirm', 'click', doLogin);
  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // 관리자 드로어
  on('btnDrawerClose', 'click', closeDrawer);
  on('drawerBackdrop', 'click', closeDrawer);
  on('btnNewSchool',   'click', () => openSchoolModal(null));

  // 학교 모달
  on('btnSchoolModalClose', 'click', () => closeModal('schoolModal'));
  on('btnSchoolCancel',     'click', () => closeModal('schoolModal'));
  on('btnSchoolSave',       'click', saveSchool);

  // 로고 업로드
  on('logoUploadWrap', 'click', () => document.getElementById('inputLogo').click());
  document.getElementById('inputLogo').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const compressed = await compressImage(ev.target.result, 200, 200, 0.75);
      schoolLogo = compressed; updateLogoPreview(compressed);
    };
    reader.readAsDataURL(f);
  });

  // ── 캔버스 툴바 ──────────────────────────────────────
  // 이미지 추가
  on('btnAddCellImg', 'click', () => document.getElementById('inputCellImg').click());
  document.getElementById('inputCellImg').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f || !headerBuilder) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const compressed = await compressImage(ev.target.result, 1200, 600, 0.85);
      headerBuilder.addImage(compressed);
      e.target.value = '';
    };
    reader.readAsDataURL(f);
  });

  // 박스 추가
  on('btnAddBox', 'click', () => headerBuilder?.addTextBox());

  // 선택 오브젝트 삭제
  on('btnDelObj', 'click', () => headerBuilder?.deleteSelected());

  // 캔버스 높이 +/−
  on('btnCanvasDec', 'click', () => {
    if (!headerBuilder) return;
    headerBuilder.setCanvasHeight(headerBuilder.getCanvasHeight() - 10);
    syncCanvasH();
  });
  on('btnCanvasInc', 'click', () => {
    if (!headerBuilder) return;
    headerBuilder.setCanvasHeight(headerBuilder.getCanvasHeight() + 10);
    syncCanvasH();
  });

  // 이미지 교체
  on('btnReplaceImg', 'click', () => document.getElementById('inputReplaceImg').click());
  document.getElementById('inputReplaceImg').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f || !headerBuilder) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const compressed = await compressImage(ev.target.result, 1200, 600, 0.85);
      headerBuilder.updateSelected({ src: compressed });
      e.target.value = '';
    };
    reader.readAsDataURL(f);
  });

  // 삭제 모달
  on('btnDeleteClose',   'click', () => closeModal('deleteModal'));
  on('btnDeleteCancel',  'click', () => closeModal('deleteModal'));
  on('btnDeleteConfirm', 'click', doDelete);

  // ── 서식 바 — 오브젝트 선택 이벤트 ──────────────────
  document.getElementById('hbArea').addEventListener('hb-selection', e => {
    const obj = e.detail;
    syncFormatBar(obj);

    // 내용 유형 바: 텍스트 박스 선택 시만 표시
    const fieldBar = document.getElementById('hbFieldBar');
    if (fieldBar) {
      if (obj && obj.type === 'text') {
        fieldBar.classList.remove('hidden');
        fieldBar.querySelectorAll('.hb-field-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.type === (obj.fieldType || ''));
        });
      } else {
        fieldBar.classList.add('hidden');
      }
    }
  });

  // ── 서식 바 컨트롤 (텍스트 박스) ────────────────────
  on('fmtFont', 'change', e => headerBuilder?.updateSelected({ fontFamily: e.target.value }));
  on('fmtSize', 'change', e => {
    const v = Math.max(6, Math.min(72, parseInt(e.target.value, 10) || 13));
    headerBuilder?.updateSelected({ fontSize: v });
  });
  on('fmtBold', 'click', () => {
    const obj = headerBuilder?.getSelected();
    if (obj) headerBuilder.updateSelected({ bold: !obj.bold });
  });
  on('fmtItalic', 'click', () => {
    const obj = headerBuilder?.getSelected();
    if (obj) headerBuilder.updateSelected({ italic: !obj.italic });
  });
  document.querySelectorAll('.btn-align').forEach(btn => {
    btn.addEventListener('click', e => {
      const align = e.currentTarget.dataset.align;
      if (align) headerBuilder?.updateSelected({ align });
    });
  });
  on('fmtColor',       'input', e => headerBuilder?.updateSelected({ color: e.target.value }));
  on('fmtBgColor',     'input', e => headerBuilder?.updateSelected({ bgColor: e.target.value }));
  on('fmtBgClear',     'click', () => {
    headerBuilder?.updateSelected({ bgColor: '' });
    document.getElementById('fmtBgColor').value = '#ffffff';
  });
  on('fmtBorderColor', 'input', e => headerBuilder?.updateSelected({ borderColor: e.target.value }));
  on('fmtBorderClear', 'click', () => {
    headerBuilder?.updateSelected({ borderColor: '' });
    document.getElementById('fmtBorderColor').value = '#888888';
  });

  // 이미지 맞춤 방식
  on('fmtObjectFit', 'change', e => headerBuilder?.updateSelected({ objectFit: e.target.value }));

  // 내용 유형 빠른 선택 버튼
  document.getElementById('hbFieldBar')?.querySelectorAll('.hb-field-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      headerBuilder?.updateSelected({ fieldType: btn.dataset.type });
      document.getElementById('hbFieldBar')?.querySelectorAll('.hb-field-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === btn.dataset.type);
      });
    });
  });
}

/* ── 로그인 ── */
function doLogin() {
  const pw = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  if (pw === ADMIN_PW) {
    adminMode = true;
    document.getElementById('loginPassword').value = '';
    err.classList.add('hidden');
    closeModal('loginModal');
    document.getElementById('btnAdminMode').textContent = '⚙️ 관리자';
    openDrawer();
  } else {
    err.classList.remove('hidden');
  }
}

/* ── 드로어 ── */
function openDrawer() {
  renderManageList();
  document.getElementById('adminDrawer').classList.remove('hidden');
  document.getElementById('drawerBackdrop').classList.remove('hidden');
}
function closeDrawer() {
  document.getElementById('adminDrawer').classList.add('hidden');
  document.getElementById('drawerBackdrop').classList.add('hidden');
}

/* ── 학교 등록/수정 모달 ── */
function openSchoolModal(id) {
  currentEditId = id;
  schoolLogo = null;

  document.getElementById('schoolModalTitle').textContent = id ? '✏️ 학교 수정' : '🏫 학교 등록';
  document.getElementById('inputSchoolName').value = '';
  document.getElementById('inputLogo').value = '';
  updateLogoPreview(null);

  if (headerBuilder) { headerBuilder.destroy(); headerBuilder = null; }
  headerBuilder = new HeaderBuilder(
    document.getElementById('hbArea'),
    document.getElementById('headerPreviewBox')
  );

  if (id) {
    const school = getSchool(id);
    if (school) {
      document.getElementById('inputSchoolName').value = school.name;
      if (school.logo) { schoolLogo = school.logo; updateLogoPreview(school.logo); }
      if (school.headerTable) headerBuilder.setData(school.headerTable);
    }
  }

  syncCanvasH();
  syncFormatBar(null);
  openModal('schoolModal');
}

function updateLogoPreview(url) {
  const img = document.getElementById('logoPreviewImg');
  const txt = document.getElementById('logoPreviewText');
  if (url) {
    img.src = url; img.hidden = false; txt.hidden = true;
  } else {
    img.hidden = true; txt.hidden = false;
  }
}

function syncCanvasH() {
  const el = document.getElementById('canvasHVal');
  if (el && headerBuilder) el.textContent = headerBuilder.getCanvasHeight();
}

function syncFormatBar(obj) {
  const bar = document.getElementById('hbFormatBar');
  if (!bar) return;
  const textFmt = document.getElementById('hbTextFmt');
  const imgFmt  = document.getElementById('hbImgFmt');

  if (!obj) {
    bar.classList.add('fmt-disabled');
    if (textFmt) textFmt.style.display = 'contents';
    if (imgFmt)  imgFmt.style.display  = 'none';
    return;
  }
  bar.classList.remove('fmt-disabled');

  if (obj.type === 'image') {
    if (textFmt) textFmt.style.display = 'none';
    if (imgFmt)  imgFmt.style.display  = 'contents';
    const fitEl = document.getElementById('fmtObjectFit');
    if (fitEl) fitEl.value = obj.objectFit || 'contain';
  } else {
    if (textFmt) textFmt.style.display = 'contents';
    if (imgFmt)  imgFmt.style.display  = 'none';
    document.getElementById('fmtFont').value = obj.fontFamily || 'Noto Sans KR';
    document.getElementById('fmtSize').value = obj.fontSize || 13;
    document.getElementById('fmtBold').classList.toggle('active',   !!obj.bold);
    document.getElementById('fmtItalic').classList.toggle('active', !!obj.italic);
    ['fmtLeft','fmtCenter','fmtRight'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    const alignId = { left:'fmtLeft', center:'fmtCenter', right:'fmtRight' }[obj.align || 'center'];
    if (alignId) document.getElementById(alignId).classList.add('active');
    document.getElementById('fmtColor').value       = obj.color       || '#000000';
    document.getElementById('fmtBgColor').value     = obj.bgColor     || '#ffffff';
    document.getElementById('fmtBorderColor').value = obj.borderColor || '#888888';
  }
}

/* ── 저장 ── */
function saveSchool() {
  const name = document.getElementById('inputSchoolName').value.trim();
  if (!name) { showToast('학교명을 입력해주세요.'); return; }

  upsertSchool({
    id: currentEditId || undefined,
    name,
    logo: schoolLogo,
    headerTable: headerBuilder ? headerBuilder.getData() : null,
  });

  closeModal('schoolModal');
  renderSchoolGrid();
  renderManageList();
  showToast(currentEditId ? '학교 정보가 수정되었습니다.' : '학교가 등록되었습니다.');
}

/* ── 삭제 ── */
function confirmDelete(id) {
  pendingDeleteId = id;
  const s = getSchool(id);
  document.getElementById('deleteConfirmMsg').textContent =
    `"${s?.name || ''}" 학교를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`;
  openModal('deleteModal');
}
function doDelete() {
  if (!pendingDeleteId) return;
  deleteSchool(pendingDeleteId);
  pendingDeleteId = null;
  closeModal('deleteModal');
  renderSchoolGrid();
  renderManageList();
  showToast('학교가 삭제되었습니다.');
}

/* ── 유틸 ── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function on(id, ev, fn) { document.getElementById(id)?.addEventListener(ev, fn); }

function showLoadingGrid() {
  const grid  = document.getElementById('schoolGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';
  grid.classList.add('hidden');
  empty.classList.remove('hidden');
  empty.innerHTML = '<div class="empty-icon">⏳</div><p class="empty-title">학교 목록 불러오는 중...</p>';
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
