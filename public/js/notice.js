import { generateNewsletterContent, applyFeedback, generateTitle } from './gemini.js';
import { exportToPDF } from './pdf-export.js';
import { exportToHWPX } from './hwpx-export.js';
import { getSchool, initStorage } from './storage.js?v=5';
import { renderHeaderAsHTML } from './header-builder.js';

/* ── 학교 정보 ── */
const params   = new URLSearchParams(window.location.search);
const schoolId = params.get('id');
let school = null;

const A4_H = 1123;

const DEFAULT_REPLY_HTML = `<p style="font-weight:700;font-size:10.5pt;border-bottom:1px solid #888;padding-bottom:6px;margin-bottom:10px">회 신 서</p>
<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:10px">
  <tr>
    <td style="border:1px solid #ccc;padding:5px;text-align:center;width:14%">학 년</td>
    <td style="border:1px solid #ccc;padding:5px;width:9%"></td>
    <td style="border:1px solid #ccc;padding:5px;text-align:center;width:8%">반</td>
    <td style="border:1px solid #ccc;padding:5px;width:9%"></td>
    <td style="border:1px solid #ccc;padding:5px;text-align:center;width:12%">번 호</td>
    <td style="border:1px solid #ccc;padding:5px;width:9%"></td>
    <td style="border:1px solid #ccc;padding:5px;text-align:center;width:12%">이 름</td>
    <td style="border:1px solid #ccc;padding:5px"></td>
  </tr>
</table>
<p style="font-size:10pt;margin-bottom:8px">위 안내 사항을 확인하였으며, 다음과 같이 회신합니다.</p>
<p style="font-size:10pt;margin-bottom:8px">□ 동의합니다&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;□ 동의하지 않습니다</p>
<p style="font-size:10pt">학부모 서명: _________________</p>`;

/* ── 상태 ── */
const state = {
  pages:        1,
  responsible:  '',
  phone:        '',
  date:         '',
  cutLine:      false,
  hasBorder:    false,
  replyContent: '',
  images:       [],   // { dataUrl, name, id }
};

let activeCeEl = null;   // 마지막으로 포커스된 contenteditable 영역
let savedSel   = null;   // 마지막으로 저장된 선택 범위 (미리보기 내)
let imgCounter = 0;
let toastTimer;

/* ═══════════════════════════════════════
   초기화
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  school = schoolId ? getSchool(schoolId) : null;

  if (school) {
    document.title = `${school.name} 교육 안내장`;
    document.getElementById('noticeAppTitle').textContent = `${school.name} 교육 안내장`;
  }

  const today = new Date();
  state.date = `${today.getFullYear()}년 ${String(today.getMonth()+1).padStart(2,'0')}월 ${String(today.getDate()).padStart(2,'0')}일`;
  const inputDate = document.getElementById('inputDate');
  if (inputDate) inputDate.value = today.toISOString().split('T')[0];

  initPreviewStructure();
  bindEvents();
  bindFormatBar();
});

/* ═══════════════════════════════════════
   A4 미리보기 구조 초기화 (1회)
═══════════════════════════════════════ */
function initPreviewStructure() {
  const container = document.getElementById('documentContainer');
  if (!container) return;

  const schoolName = school?.name || '';
  const sig = schoolName ? schoolName.split('').join(' ') + ' 장' : '';

  const headerHtml = school?.headerTable
    ? renderHeaderAsHTML(school.headerTable, _headerFormData())
    : _defaultHeaderHtml();

  container.innerHTML = `
<div class="a4-page" id="docPage" style="height:${A4_H}px">
  <div class="doc-header-wrap" id="docHeaderWrap">${headerHtml}</div>
  <div class="doc-content-area" id="docContentArea">
    <div class="doc-body" id="docBody">
      <div class="doc-main-content" id="docMainContent">
        <div style="height:6px"></div>
        <div class="doc-title ce-area" id="docTitle"
             contenteditable="true" spellcheck="false"
             data-placeholder="제목을 입력하세요"></div>
        <div class="doc-greeting-label">학부모님께</div>
        <div class="doc-greeting ce-area" id="docGreeting"
             contenteditable="true" spellcheck="false"
             data-placeholder="인사말을 입력하거나 AI로 생성하세요."></div>
        <div class="doc-content ce-area" id="docContent"
             contenteditable="true" spellcheck="false"
             data-placeholder="🤖 AI로 내용 생성 버튼을 눌러주세요."></div>
      </div>
    </div>
    <div class="doc-footer" id="docFooter">
      <div class="doc-date"   id="docDate">${state.date}</div>
      <div class="doc-school" id="docSchool">${esc(sig)}</div>
    </div>
  </div>
  <div id="docCutSection" style="display:none"></div>
</div>`;

  /* 선택 영역 추적 (미리보기 내부만) */
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (container.contains(range.commonAncestorContainer)) {
      savedSel = range.cloneRange();
    }
  });

  /* 활성 contenteditable 추적 */
  ['docTitle', 'docGreeting', 'docContent'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('focus', () => { activeCeEl = el; });
  });

  /* docContent: Enter → <p> (들여쓰기 CSS 자동 적용) */
  document.getElementById('docContent')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertParagraph', false, null);
    }
  });
}

/* ═══════════════════════════════════════
   부분 업데이트 함수들
═══════════════════════════════════════ */
function updateHeader() {
  const wrap = document.getElementById('docHeaderWrap');
  if (!wrap) return;
  wrap.innerHTML = school?.headerTable
    ? renderHeaderAsHTML(school.headerTable, _headerFormData())
    : _defaultHeaderHtml();
}

function updateInfoBar() {
  const bar = document.getElementById('docInfoBar');
  if (!bar) return;
  const { responsible, phone } = state;
  if (responsible || phone) {
    bar.innerHTML =
      (responsible ? `담당: <strong>${esc(responsible)}</strong>` : '') +
      (responsible && phone ? '&nbsp;&nbsp;|&nbsp;&nbsp;' : '') +
      (phone ? `전화: <strong>${esc(phone)}</strong>` : '');
    bar.style.display = '';
  } else {
    bar.style.display = 'none';
  }
}

function updateFooter() {
  const dateEl   = document.getElementById('docDate');
  const schoolEl = document.getElementById('docSchool');
  if (dateEl)   dateEl.textContent   = state.date || '';
  if (schoolEl) {
    const n = school?.name || '';
    schoolEl.textContent = n ? n.split('').join(' ') + ' 장' : '';
  }
}

async function updatePageHeight() {
  const page = document.getElementById('docPage');
  if (!page) return;
  page.style.height = `${A4_H * state.pages}px`;
  updatePageBreaks();
  // 폰트 크기 리셋 후 콘텐츠 재측정
  const body = document.getElementById('docBody');
  if (body) { body.style.fontSize = ''; body.style.lineHeight = ''; }
  await fitContentToPages();
}

function updatePageBreaks() {
  const page = document.getElementById('docPage');
  if (!page) return;
  page.querySelectorAll('.page-break-line').forEach(el => el.remove());
  for (let i = 1; i < state.pages; i++) {
    const line = document.createElement('div');
    line.className = 'page-break-line';
    line.dataset.page = String(i + 1);
    line.style.top = `${A4_H * i}px`;
    page.appendChild(line);
  }
}

function updateBorder() {
  const page = document.getElementById('docPage');
  if (!page) return;
  page.classList.toggle('has-border', state.hasBorder);
}

function updateCutSection() {
  const sec = document.getElementById('docCutSection');
  if (!sec) return;
  if (!state.cutLine) { sec.style.display = 'none'; return; }
  const sig = school?.name ? school.name.split('').join(' ') + ' 장' : '';
  sec.style.display = '';
  sec.innerHTML = `
    <div class="doc-cutline"></div>
    <div class="doc-reply-section">
      <div class="doc-reply-content">${state.replyContent || DEFAULT_REPLY_HTML}</div>
      <div class="doc-reply-footer">
        <div class="doc-date">${state.date}</div>
        ${sig ? `<div class="doc-school">${esc(sig)}</div>` : ''}
      </div>
    </div>`;
}

/* ═══════════════════════════════════════
   이벤트 바인딩
═══════════════════════════════════════ */
function bindEvents() {
  on('btnBack', 'click', () => { window.location.href = 'index.html'; });

  on('btnToggleSidebar', 'click', () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    document.getElementById('btnToggleSidebar').textContent =
      sb.classList.contains('collapsed') ? '▶' : '◀';
  });

  /* 페이지 수 */
  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.page-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.pages = parseInt(btn.dataset.pages, 10);
      updatePageHeight();
    });
  });

  /* 문서 설정 실시간 반영 */
  onInput('inputResponsible', v => { state.responsible = v; });
  onInput('inputPhone',       v => { state.phone = v; });
  onInput('inputDate', v => {
    if (v) {
      const d = new Date(v + 'T00:00:00');
      state.date = `${d.getFullYear()}년 ${String(d.getMonth()+1).padStart(2,'0')}월 ${String(d.getDate()).padStart(2,'0')}일`;
    }
    updateFooter();
    updateHeader();
    updateCutSection();
  });

  /* inputTitle → 미리보기 동기 */
  onInput('inputTitle', v => {
    const el = document.getElementById('docTitle');
    if (el && el !== document.activeElement) {
      const pt = v.length <= 12 ? 20 : v.length <= 18 ? 18 : 16;
      el.style.fontSize = `${pt}pt`;
      el.textContent = v;
    }
  });

  /* AI 제목 */
  on('btnAiTitle', 'click', async () => {
    const topic = document.getElementById('inputTopic')?.value.trim();
    const curTitle = document.getElementById('inputTitle')?.value.trim();
    if (!topic && !curTitle) { showToast('주제를 먼저 입력해주세요.'); return; }
    showLoading('제목 생성 중...');
    try {
      const t = await generateTitle({ topic: topic || curTitle });
      document.getElementById('inputTitle').value = t;
      const el = document.getElementById('docTitle');
      if (el) {
        const pt = t.length <= 12 ? 20 : t.length <= 18 ? 18 : 16;
        el.style.fontSize = `${pt}pt`;
        el.textContent = t;
      }
      showToast('제목이 생성되었습니다.');
    } catch(e) { showToast('오류: ' + e.message); }
    finally { hideLoading(); }
  });

  /* AI 내용 생성 */
  on('btnGenerate', 'click', async () => {
    const topic = document.getElementById('inputTopic')?.value.trim();
    if (!topic) { showToast('내용 주제를 입력해주세요.'); return; }
    showLoading('AI가 안내장 내용을 생성하고 있습니다...');
    try {
      const result = await generateNewsletterContent({
        topic,
        title:       document.getElementById('inputTitle')?.value || '',
        pages:       state.pages,
        schoolName:  school?.name || '학교',
        date:        state.date,
        responsible: state.responsible,
      });
      _fillFromAI(result);
      await fitContentToPages();
      showToast('✅ AI 생성 내용이 마음에 안드시면 다시 한 번 눌러주세요~');
    } catch(e) { showToast('오류: ' + e.message); }
    finally { hideLoading(); }
  });

  /* AI 피드백 */
  on('btnFeedback', 'click', async () => {
    const fb = document.getElementById('inputFeedback')?.value.trim();
    if (!fb) { showToast('피드백 내용을 입력해주세요.'); return; }
    const d = _getExportData();
    if (!d.content && !d.greeting) { showToast('먼저 내용을 생성해주세요.'); return; }
    showLoading('피드백을 반영하고 있습니다...');
    try {
      const result = await applyFeedback({
        currentContent: d.content, currentTitle: d.title,
        currentGreeting: d.greeting, feedback: fb, pages: state.pages,
      });
      _fillFromAI(result);
      await fitContentToPages();
      document.getElementById('inputFeedback').value = '';
      showToast('✅ 피드백이 반영되었습니다.');
    } catch(e) { showToast('오류: ' + e.message); }
    finally { hideLoading(); }
  });

  /* 이미지 업로드 */
  const uploadZone  = document.getElementById('uploadZone');
  const inputImages = document.getElementById('inputImages');
  uploadZone?.addEventListener('click', () => inputImages.click());
  inputImages?.addEventListener('change', e => handleImageFiles(e.target.files));
  uploadZone?.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone?.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    handleImageFiles(e.dataTransfer.files);
  });

  /* 테두리 */
  on('chkBorder', 'change', e => {
    state.hasBorder = e.target.checked;
    updateBorder();
  });

  /* 절취선 */
  on('chkCutLine', 'change', e => {
    state.cutLine = e.target.checked;
    document.getElementById('replyBlock').style.display = e.target.checked ? 'flex' : 'none';
    if (e.target.checked && !state.replyContent) {
      state.replyContent = DEFAULT_REPLY_HTML;
      document.getElementById('inputReply').value = DEFAULT_REPLY_HTML;
    }
    updateCutSection();
  });

  on('btnApplyReply', 'click', () => {
    const val = document.getElementById('inputReply')?.value.trim();
    state.replyContent = val
      ? (val.startsWith('<') ? val : `<p>${val.replace(/\n\n+/g,'</p><p>').replace(/\n/g,'<br>')}</p>`)
      : DEFAULT_REPLY_HTML;
    updateCutSection();
    showToast('회신 내용이 적용되었습니다.');
  });

  /* PDF / HWPX */
  on('btnExportPdf', 'click', async () => {
    const d = _getExportData();
    if (!d.content && !d.title) { showToast('내용을 먼저 생성해주세요.'); return; }
    showLoading('PDF를 생성하고 있습니다...');
    try { await exportToPDF(d.title, school?.name, state.pages); showToast('✅ PDF가 저장되었습니다.'); }
    catch(e) { showToast('PDF 오류: ' + e.message); }
    finally { hideLoading(); }
  });

  on('btnExportDocx', 'click', async () => {
    const d = _getExportData();
    if (!d.content && !d.title) { showToast('내용을 먼저 생성해주세요.'); return; }
    showLoading('HWPX 파일을 생성하고 있습니다...');
    try {
      await exportToHWPX({
        title: d.title, greeting: d.greeting, content: d.content,
        responsible: state.responsible, phone: state.phone, date: state.date,
        schoolName: school?.name,
      });
      showToast('✅ HWPX 파일이 저장되었습니다.');
    } catch(e) { showToast('HWPX 오류: ' + e.message); }
    finally { hideLoading(); }
  });
}

/* ═══════════════════════════════════════
   서식 바 바인딩
═══════════════════════════════════════ */
function bindFormatBar() {
  /* 글씨체 */
  const pfFont = document.getElementById('pfFont');
  pfFont?.addEventListener('change', e => {
    if (!e.target.value) return;
    _restoreSel();
    _wrapStyle('fontFamily', `'${e.target.value}', sans-serif`);
    e.target.value = '';
  });

  /* 글자 크기 */
  const pfSize = document.getElementById('pfSize');
  const applySize = () => {
    const pt = Math.max(6, Math.min(72, parseInt(pfSize.value, 10) || 12));
    _restoreSel();
    _wrapStyle('fontSize', pt + 'pt');
    pfSize.value = '';
  };
  pfSize?.addEventListener('change', applySize);
  pfSize?.addEventListener('keydown', e => { if (e.key === 'Enter') applySize(); });

  /* 굵게 / 기울임 / 밑줄 */
  document.getElementById('pfBold')?.addEventListener('mousedown', e => {
    e.preventDefault(); _restoreSel(); document.execCommand('bold', false, null);
  });
  document.getElementById('pfItalic')?.addEventListener('mousedown', e => {
    e.preventDefault(); _restoreSel(); document.execCommand('italic', false, null);
  });
  document.getElementById('pfUnderline')?.addEventListener('mousedown', e => {
    e.preventDefault(); _restoreSel(); document.execCommand('underline', false, null);
  });

  /* 정렬 */
  document.querySelectorAll('.pf-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault(); _restoreSel();
      document.execCommand(btn.dataset.cmd, false, null);
    });
  });

  /* 글자색 */
  document.getElementById('pfColor')?.addEventListener('input', e => {
    _restoreSel();
    document.execCommand('foreColor', false, e.target.value);
  });

  /* 서식 지우기 */
  document.getElementById('pfClearFmt')?.addEventListener('mousedown', e => {
    e.preventDefault(); _restoreSel(); document.execCommand('removeFormat', false, null);
  });

  /* 자간 — 활성 영역 전체 적용 */
  const pfLS    = document.getElementById('pfLetterSpacing');
  const pfLSVal = document.getElementById('pfLSVal');
  pfLS?.addEventListener('input', e => {
    pfLSVal.textContent = e.target.value + 'px';
    if (activeCeEl) activeCeEl.style.letterSpacing = e.target.value + 'px';
  });

  /* 줄간격 — 활성 영역 전체 적용 */
  const pfLH    = document.getElementById('pfLineHeight');
  const pfLHVal = document.getElementById('pfLHVal');
  pfLH?.addEventListener('input', e => {
    const v = (parseInt(e.target.value) / 100).toFixed(1);
    pfLHVal.textContent = v;
    if (activeCeEl) activeCeEl.style.lineHeight = v;
  });
}

/* ═══════════════════════════════════════
   AI 결과 채우기
═══════════════════════════════════════ */
function _fillFromAI(result) {
  if (result.title) {
    const pt = result.title.length <= 12 ? 20 : result.title.length <= 18 ? 18 : 16;
    const el = document.getElementById('docTitle');
    if (el) { el.style.fontSize = `${pt}pt`; el.textContent = result.title; }
    const sb = document.getElementById('inputTitle');
    if (sb) sb.value = result.title;
  }
  if (result.greeting) {
    const raw = result.greeting
      .replace(/학부모님께\s*,?\s*(<br\s*\/?>)?\s*/gi, '')
      .replace(/^\s*[,，]\s*/, '')
      .trim();
    const html = raw.includes('<') ? raw : raw.replace(/\n/g, '<br>');
    const el = document.getElementById('docGreeting');
    if (el) el.innerHTML = html;
  }
  if (result.content) {
    const el = document.getElementById('docContent');
    if (el) el.innerHTML = result.content;
  }
}

/* ═══════════════════════════════════════
   자동 크기 조절 (AI 생성 후 호출)
═══════════════════════════════════════ */
async function fitContentToPages() {
  const body = document.getElementById('docBody');
  if (!body) return;

  body.style.fontSize   = '';
  body.style.lineHeight = '';

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const available = body.clientHeight;
  const natural   = body.scrollHeight;
  if (!available || !natural) return;

  if (natural > available) {
    const s = Math.max(0.62, available / natural);
    body.style.fontSize   = `${(11 * s).toFixed(2)}pt`;
    body.style.lineHeight = `${Math.max(1.35, 1.9 * s).toFixed(2)}`;
  }
}

/* ═══════════════════════════════════════
   이미지 삽입
═══════════════════════════════════════ */
function handleImageFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => insertImageAtCursor(e.target.result, file.name);
    reader.readAsDataURL(file);
  });
}

function insertImageAtCursor(dataUrl, name) {
  const contentEl = document.getElementById('docContent');
  if (!contentEl) return;

  contentEl.focus();
  if (savedSel) _restoreSel();
  else {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(contentEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const imgId = `nimg-${++imgCounter}`;
  document.execCommand('insertHTML', false,
    `<img id="${imgId}" src="${dataUrl}" alt="${esc(name)}"
     style="max-width:100%;max-height:280px;border-radius:4px;border:1px solid #ddd;display:block;margin:0.6em auto">`);

  state.images.push({ dataUrl, name, id: imgId });
  renderImagePreviews();
}

function renderImagePreviews() {
  const list = document.getElementById('imagePreviewList');
  if (!list) return;
  list.innerHTML = state.images.map((img, i) => `
    <div class="img-preview-item">
      <img src="${img.dataUrl}" alt="${esc(img.name)}">
      <button class="img-remove" data-idx="${i}" data-id="${img.id}">✕</button>
    </div>`).join('');
  list.querySelectorAll('.img-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const idx = +btn.dataset.idx;
      document.getElementById(id)?.remove();
      state.images.splice(idx, 1);
      renderImagePreviews();
    });
  });
}

/* ═══════════════════════════════════════
   내부 헬퍼
═══════════════════════════════════════ */
function _headerFormData() {
  return {
    teacher: state.responsible, phone: state.phone, date: state.date,
    grade: '', class: '', student: '', number: '', parent: '',
  };
}

function _defaultHeaderHtml() {
  const n = school?.name || '';
  return `<div style="text-align:center;padding:12px;background:#f0f0f0;border:2px solid #ddd;border-radius:4px">
    <div style="font-size:18px;font-weight:900;color:#1a6b2f">${n || '교 육 안 내'}</div>
  </div>`;
}

function _getExportData() {
  return {
    title:    document.getElementById('docTitle')?.innerText?.trim()  || '',
    greeting: document.getElementById('docGreeting')?.innerHTML       || '',
    content:  document.getElementById('docContent')?.innerHTML        || '',
    responsible: state.responsible,
    phone:    state.phone,
    date:     state.date,
    schoolName: school?.name || '',
  };
}

function _restoreSel() {
  if (!savedSel) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSel.cloneRange());
}

function _wrapStyle(prop, value) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const span = document.createElement('span');
  span.style[prop] = value;
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
}

/* ═══════════════════════════════════════
   유틸
═══════════════════════════════════════ */
function on(id, ev, fn) { document.getElementById(id)?.addEventListener(ev, fn); }

function onInput(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => fn(el.value));
}

function showLoading(msg = '처리 중...') {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
