/* ═══════════════════════════════════════════════════════
   편집 가능한(텍스트 선택형) PDF 내보내기
   - 헤더: 브랜딩 유지를 위해 이미지로 렌더
   - 제목·인사말·본문·표·회신서: 실제 텍스트로 렌더 → 한글/워드/뷰어에서 선택·복사·편집 가능
   - 한글 표시를 위해 나눔고딕 TTF를 임베드
═══════════════════════════════════════════════════════ */

const FONT_REGULAR_URL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf';
const FONT_BOLD_URL    = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Bold.ttf';

const PAGE_W = 210, PAGE_H = 297;
const MARGIN_L = 18, MARGIN_R = 18, MARGIN_T = 16, MARGIN_B = 16;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
const MM_PER_PT = 25.4 / 72;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src; el.onload = resolve;
    el.onerror = () => reject(new Error('라이브러리 로드 실패: ' + src));
    document.head.appendChild(el);
  });
}

/* ── 폰트 임베드 (base64 캐시) ── */
let _fontCache = null;
async function fetchFontB64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('폰트 다운로드 실패');
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
async function ensureFonts(pdf) {
  if (!_fontCache) {
    const [reg, bold] = await Promise.all([
      fetchFontB64(FONT_REGULAR_URL),
      fetchFontB64(FONT_BOLD_URL).catch(() => null),
    ]);
    _fontCache = { reg, bold };
  }
  pdf.addFileToVFS('NanumGothic.ttf', _fontCache.reg);
  pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
  if (_fontCache.bold) {
    pdf.addFileToVFS('NanumGothic-Bold.ttf', _fontCache.bold);
    pdf.addFont('NanumGothic-Bold.ttf', 'NanumGothic', 'bold');
  } else {
    pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'bold');
  }
  pdf.setFont('NanumGothic', 'normal');
}

/* ── 유틸 ── */
function parseColor(c) {
  if (!c) return [34, 34, 34];
  c = String(c).trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
  m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
  return [34, 34, 34];
}
const lineHeight = (size) => size * MM_PER_PT * 1.5;
function tokenize(text) {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'’.,%()\-]*|\s+|[^\sA-Za-z0-9]/g) || [];
}

/* ── HTML → 블록 모델 ── */
function extractRuns(el, inherited = { bold: false, color: null }) {
  const runs = [];
  el.childNodes.forEach(n => {
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, ' ');
      if (t) runs.push({ text: t, bold: inherited.bold, color: inherited.color });
    } else if (n.nodeType === 1) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'br') { runs.push({ br: true }); return; }
      const fw = n.style && n.style.fontWeight;
      const bold = inherited.bold || tag === 'strong' || tag === 'b'
        || fw === 'bold' || (parseInt(fw, 10) >= 600);
      const color = (n.style && n.style.color) ? n.style.color : inherited.color;
      runs.push(...extractRuns(n, { bold, color }));
    }
  });
  return runs;
}
function imgBlock(img) {
  return { type: 'img', src: img.src, natW: img.naturalWidth || img.width || 0, natH: img.naturalHeight || img.height || 0 };
}
function tableToData(tbl) {
  const head = [];
  tbl.querySelectorAll('thead tr').forEach(tr => head.push([...tr.children].map(td => td.innerText.trim())));
  const body = [];
  const rows = tbl.querySelectorAll('tbody tr').length ? tbl.querySelectorAll('tbody tr') : tbl.querySelectorAll('tr');
  rows.forEach(tr => { if (tr.closest('thead')) return; body.push([...tr.children].map(td => td.innerText.trim())); });
  return { head, body };
}
function nodesToBlocks(container) {
  const blocks = [];
  container.childNodes.forEach(node => {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) blocks.push({ type: 'para', runs: [{ text: t }], align: 'left' });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node, tag = el.tagName.toLowerCase();
    const align = (el.style && el.style.textAlign) || 'left';
    if (tag === 'p') {
      const img = el.querySelector('img');
      if (img && el.textContent.trim() === '') { blocks.push(imgBlock(img)); return; }
      if (el.classList.contains('section-head')) blocks.push({ type: 'head', runs: extractRuns(el) });
      else blocks.push({ type: 'para', runs: extractRuns(el), align });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...el.children].filter(c => c.tagName.toLowerCase() === 'li').map(li => extractRuns(li));
      blocks.push({ type: 'list', items, ordered: tag === 'ol' });
    } else if (tag === 'table') {
      blocks.push({ type: 'table', ...tableToData(el) });
    } else if (tag === 'img') {
      blocks.push(imgBlock(el));
    } else if (tag === 'div' && el.classList.contains('highlight-box')) {
      blocks.push({ type: 'box', blocks: nodesToBlocks(el) });
    } else if (tag !== 'br') {
      const inner = nodesToBlocks(el);
      if (inner.length) blocks.push(...inner);
      else { const t = el.innerText.trim(); if (t) blocks.push({ type: 'para', runs: [{ text: t }], align }); }
    }
  });
  return blocks;
}
function htmlToBlocks(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return nodesToBlocks(div);
}

/* ═══════════════════════════════════════
   메인: 편집 가능한 PDF 생성
═══════════════════════════════════════ */
export async function exportToPDF(model) {
  await Promise.all([
    injectScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    injectScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
  ]);
  // autotable는 jsPDF 전역이 준비된 뒤 로드해야 플러그인이 등록됨
  await injectScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await ensureFonts(pdf);

  let y = MARGIN_T;
  const ensure = (h) => { if (y + h > PAGE_H - MARGIN_B) { pdf.addPage(); y = MARGIN_T; } };

  /* 텍스트 줄 배치 (자동 줄바꿈, 굵기/색 혼합 지원) */
  function layoutRuns(runs, maxWidth, size) {
    const lines = [];
    let cur = { segs: [], width: 0 };
    const push = () => { lines.push(cur); cur = { segs: [], width: 0 }; };
    const setF = (bold) => { pdf.setFont('NanumGothic', bold ? 'bold' : 'normal'); pdf.setFontSize(size); };
    runs.forEach(run => {
      if (run.br) { push(); return; }
      tokenize(run.text).forEach(tok => {
        const isSpace = /^\s+$/.test(tok);
        setF(run.bold);
        const w = pdf.getTextWidth(tok);
        if (cur.width + w > maxWidth && cur.width > 0) {
          push();
          if (isSpace) return;
        }
        cur.segs.push({ text: tok, bold: run.bold, color: run.color, width: w });
        cur.width += w;
      });
    });
    if (cur.segs.length || !lines.length) push();
    return lines;
  }
  function renderLine(line, x, yy, size, align, maxW, defColor) {
    let startX = x;
    if (align === 'center') startX = x + (maxW - line.width) / 2;
    else if (align === 'right') startX = x + (maxW - line.width);
    let cx = startX;
    line.segs.forEach(seg => {
      pdf.setFont('NanumGothic', seg.bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      const [r, g, b] = parseColor(seg.color || defColor);
      pdf.setTextColor(r, g, b);
      pdf.text(seg.text, cx, yy, { baseline: 'top' });
      cx += seg.width;
    });
  }
  function renderPara(runs, o = {}) {
    const size = o.size || 10.5, align = o.align || 'left', gapAfter = o.gapAfter ?? 2.4;
    const indent = o.indent || 0, box = o.box || false, defColor = o.color || '#222222';
    const maxW = CONTENT_W - indent;
    const lines = layoutRuns(runs, maxW, size);
    const lh = lineHeight(size);
    lines.forEach((line, i) => {
      ensure(lh);
      if (box) {
        pdf.setFillColor(234, 247, 239); pdf.rect(MARGIN_L, y - 0.6, CONTENT_W, lh, 'F');
        pdf.setFillColor(46, 139, 87);   pdf.rect(MARGIN_L, y - 0.6, 1.3, lh, 'F');
      }
      if (o.bullet && i === 0) {
        pdf.setFont('NanumGothic', 'normal'); pdf.setFontSize(size); pdf.setTextColor(70, 70, 70);
        pdf.text(o.bullet, MARGIN_L + indent - 4.5, y, { baseline: 'top' });
      }
      renderLine(line, MARGIN_L + indent, y, size, align, maxW, defColor);
      y += lh;
    });
    y += gapAfter;
  }
  function renderImg(b) {
    if (!b.src) return;
    let w = CONTENT_W, h = b.natW ? w * b.natH / b.natW : 60;
    if (h > 150) { h = 150; w = b.natW ? h * b.natW / b.natH : CONTENT_W; }
    ensure(h + 3);
    const x = MARGIN_L + (CONTENT_W - w) / 2;
    try { pdf.addImage(b.src, 'PNG', x, y, w, h); }
    catch { try { pdf.addImage(b.src, 'JPEG', x, y, w, h); } catch { /* skip */ } }
    y += h + 3;
  }
  function renderTable(b) {
    ensure(14);
    // autotable 플러그인 미등록 시 텍스트로 대체(표가 전체 내보내기를 막지 않도록)
    if (typeof pdf.autoTable !== 'function') {
      const rows = [...(b.head || []), ...(b.body || [])];
      rows.forEach(cells => renderPara([{ text: (cells || []).join('   ') }], { size: 9.5, gapAfter: 1 }));
      y += 2;
      return;
    }
    pdf.autoTable({
      head: b.head && b.head.length ? b.head : undefined,
      body: b.body || [],
      startY: y,
      margin: { left: MARGIN_L, right: MARGIN_R },
      tableWidth: CONTENT_W,
      styles: { font: 'NanumGothic', fontStyle: 'normal', fontSize: 9.5, cellPadding: 1.8,
        lineColor: [200, 200, 200], lineWidth: 0.2, textColor: [40, 40, 40], overflow: 'linebreak', valign: 'middle' },
      headStyles: { font: 'NanumGothic', fontStyle: 'bold', fillColor: [233, 242, 236], textColor: [20, 20, 20], halign: 'center' },
    });
    y = pdf.lastAutoTable.finalY + 4;
  }
  function renderBlocks(blocks, opt = {}) {
    const indent = opt.indent || 0, box = opt.box || false;
    blocks.forEach(b => {
      if (b.type === 'head') {
        y += 1.5;
        renderPara(b.runs.map(r => ({ ...r, bold: true })), { size: 12.5, gapAfter: 2.2, indent, box, color: '#1a6b2f' });
      } else if (b.type === 'para') {
        renderPara(b.runs, { size: 10.5, align: b.align, gapAfter: 2.4, indent, box });
      } else if (b.type === 'list') {
        b.items.forEach((runs, i) => renderPara(runs, { size: 10.5, gapAfter: 1.2, indent: indent + 5, bullet: b.ordered ? (i + 1) + '.' : '•', box }));
        y += 1.2;
      } else if (b.type === 'table') {
        renderTable(b);
      } else if (b.type === 'img') {
        renderImg(b);
      } else if (b.type === 'box') {
        y += 1; renderBlocks(b.blocks, { indent: indent + 3, box: true }); y += 2.5;
      }
    });
  }

  /* ── 1. 헤더 이미지 ── */
  if (model.headerEl) {
    try {
      const canvas = await window.html2canvas(model.headerEl, { scale: 2, useCORS: true, backgroundColor: null, logging: false });
      let w = CONTENT_W, h = w * canvas.height / canvas.width;
      if (h > 85) { h = 85; w = h * canvas.width / canvas.height; }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN_L + (CONTENT_W - w) / 2, y, w, h);
      y += h + 5;
    } catch { /* 헤더 실패 시 건너뜀 */ }
  }

  /* ── 2. 제목 ── */
  if (model.title) {
    const tlen = model.title.length;
    const tsize = tlen <= 12 ? 19 : tlen <= 18 ? 17 : 15;
    renderPara([{ text: model.title, bold: true }], { size: tsize, align: 'center', gapAfter: 5.5, color: '#1a1a1a' });
  }

  /* ── 3. 인사말 ── */
  if (model.greetingLabel) {
    renderPara([{ text: model.greetingLabel, bold: true }], { size: 11, gapAfter: 2, color: '#333333' });
  }
  if (model.greetingHTML) {
    renderBlocks(htmlToBlocks(model.greetingHTML));
    y += 1.5;
  }

  /* ── 4. 본문 ── */
  if (model.contentHTML) renderBlocks(htmlToBlocks(model.contentHTML));

  /* ── 5. 발행일 · 학교장 서명 ── */
  y += 9;
  ensure(24);
  if (model.date) renderPara([{ text: model.date }], { size: 11, align: 'center', gapAfter: 2.5, color: '#333333' });
  if (model.schoolSig) renderPara([{ text: model.schoolSig, bold: true }], { size: 15, align: 'center', gapAfter: 2, color: '#111111' });

  /* ── 6. 회신서 (절취선) ── */
  if (model.cut) {
    y += 8; ensure(18);
    pdf.setLineDashPattern([1.4, 1.2], 0);
    pdf.setDrawColor(120, 120, 120); pdf.setLineWidth(0.3);
    pdf.line(MARGIN_L, y, MARGIN_L + CONTENT_W, y);
    pdf.setLineDashPattern([], 0);
    y += 7;
    renderBlocks(htmlToBlocks(model.cut.replyHTML));
    if (model.cut.date) { y += 3; renderPara([{ text: model.cut.date }], { size: 10, align: 'center', gapAfter: 1, color: '#333333' }); }
    if (model.cut.sig) renderPara([{ text: model.cut.sig, bold: true }], { size: 12, align: 'center', gapAfter: 1, color: '#111111' });
  }

  /* ── 7. 테두리 (옵션) ── */
  if (model.hasBorder) {
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setDrawColor(40, 40, 40); pdf.setLineWidth(0.6);
      pdf.rect(10, 10, PAGE_W - 20, PAGE_H - 20);
    }
  }

  const base = (model.schoolName || '학교') + '_교육_안내장';
  const safeTitle = (model.title || base).replace(/[^\w가-힣\s]/g, '_').trim() || base;
  pdf.save(`${safeTitle}.pdf`);
}
