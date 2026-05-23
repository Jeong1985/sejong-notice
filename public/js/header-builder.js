/**
 * 헤더 캔버스 빌더 v2 — 자유 배치 방식
 * 이미지·박스를 캔버스 위 어디든 드래그하여 배치 / 핸들로 크기 조절
 */

const DEFAULT_WIDTH = 680; // A4 콘텐츠 폭 (px) — 15mm 여백 기준

export const FIELD_LABELS = {
  teacher: '담당',
  phone:   '전화번호',
  date:    '발행일',
  grade:   '학년',
  class:   '반',
  student: '학생이름',
  number:  '연번',
  parent:  '보호자서명',
};

/* 8방향 리사이즈 핸들 정의 */
const HANDLES = [
  { pos:'nw', cx:0,   cy:0,   cur:'nw-resize' },
  { pos:'n',  cx:.5,  cy:0,   cur:'n-resize'  },
  { pos:'ne', cx:1,   cy:0,   cur:'ne-resize' },
  { pos:'w',  cx:0,   cy:.5,  cur:'w-resize'  },
  { pos:'e',  cx:1,   cy:.5,  cur:'e-resize'  },
  { pos:'sw', cx:0,   cy:1,   cur:'sw-resize' },
  { pos:'s',  cx:.5,  cy:1,   cur:'s-resize'  },
  { pos:'se', cx:1,   cy:1,   cur:'se-resize' },
];

function _uid() { return `o${Date.now()}${Math.random().toString(36).slice(2,5)}`; }
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _fj(a) { return a==='left'?'flex-start':a==='right'?'flex-end':'center'; }

/* ══════════════════════════════════════════════
   HeaderBuilder 클래스
══════════════════════════════════════════════ */
export class HeaderBuilder {
  constructor(builderEl, previewEl) {
    this.builderEl = builderEl;
    this.previewEl = previewEl;
    this.data      = { version:2, canvasHeight:120, objects:[] };
    this.selected  = null;

    this._drag         = null;  // 이동 드래그
    this._resize       = null;  // 크기 조절
    this._canvasResize = null;  // 캔버스 높이 조절

    this._mm = e => this._mouseMove(e);
    this._mu = ()=> this._mouseUp();
    document.addEventListener('mousemove', this._mm);
    document.addEventListener('mouseup',   this._mu);
    this.render();
  }

  destroy() {
    document.removeEventListener('mousemove', this._mm);
    document.removeEventListener('mouseup',   this._mu);
  }

  getData()   { return JSON.parse(JSON.stringify(this.data)); }
  getCanvasHeight() { return this.data.canvasHeight; }

  setData(d) {
    // 새 포맷(version:2)만 지원; 구버전 테이블 형식이면 빈 캔버스로 시작
    this.data     = (d && d.version === 2)
      ? JSON.parse(JSON.stringify(d))
      : { version:2, canvasHeight:120, objects:[] };
    this.selected = null;
    this.render();
  }

  /* ── 오브젝트 추가 ── */
  addImage(src) {
    const obj = {
      id:_uid(), type:'image',
      x:0, y:0, w:DEFAULT_WIDTH, h:this.data.canvasHeight,
      src, objectFit:'contain',
    };
    this.data.objects.unshift(obj); // 이미지는 맨 뒤(하위 레이어)
    this.selected = obj.id;
    this.render();
  }

  addTextBox() {
    const w=150, h=50;
    const x=Math.round((DEFAULT_WIDTH-w)/2);
    const y=Math.round((this.data.canvasHeight-h)/2);
    const obj = {
      id:_uid(), type:'text',
      x, y, w, h,
      fieldType:'', text:'텍스트',
      fontSize:13, fontFamily:'Noto Sans KR',
      bold:false, italic:false,
      color:'#000000', bgColor:'',
      borderColor:'', align:'center',
    };
    this.data.objects.push(obj); // 박스는 맨 앞(상위 레이어)
    this.selected = obj.id;
    this.render();
  }

  /* ── 선택 오브젝트 조작 ── */
  deleteSelected() {
    if (!this.selected) return;
    this.data.objects = this.data.objects.filter(o => o.id !== this.selected);
    this.selected = null;
    this.render();
  }

  getSelected() {
    return this.selected
      ? (this.data.objects.find(o => o.id === this.selected) || null)
      : null;
  }

  updateSelected(updates) {
    const obj = this.getSelected();
    if (obj) { Object.assign(obj, updates); this.render(); }
  }

  setCanvasHeight(h) {
    this.data.canvasHeight = Math.max(40, Math.round(h));
    this.render();
  }

  /* ── 렌더링 ── */
  render() {
    this._renderBuilder();
    this._renderPreview();
  }

  _renderBuilder() {
    const { canvasHeight:cH, objects } = this.data;

    let html = `<div class="hbc-wrap" style="width:${DEFAULT_WIDTH}px">`;
    html += `<div class="hbc-canvas" style="width:${DEFAULT_WIDTH}px;height:${cH}px">`;

    for (const obj of objects) {
      const sel = obj.id === this.selected;
      const sc  = sel ? ' hbc-sel' : '';
      const pos = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;`;

      if (obj.type === 'image') {
        html += `<div class="hbc-obj hbc-img-obj${sc}" data-id="${obj.id}" style="${pos}">
          <img src="${obj.src}" style="width:100%;height:100%;object-fit:${obj.objectFit||'contain'};display:block;pointer-events:none">
          ${sel ? this._handlesHtml(obj) : ''}
        </div>`;
      } else {
        const txtSt = `font-family:'${obj.fontFamily||'Noto Sans KR'}',sans-serif;`
          + `font-size:${obj.fontSize||13}px;`
          + (obj.bold   ? 'font-weight:bold;'   : '')
          + (obj.italic ? 'font-style:italic;'  : '')
          + `color:${obj.color||'#000'};`;
        const bdrSt = obj.borderColor ? `border:1.5px solid ${obj.borderColor};` : '';
        const bgSt  = obj.bgColor     ? `background-color:${obj.bgColor};`       : '';
        const alnSt = `justify-content:${_fj(obj.align||'center')};`;

        let inner;
        if (obj.fieldType && FIELD_LABELS[obj.fieldType]) {
          inner = `<div class="hbc-field-badge">[${FIELD_LABELS[obj.fieldType]}]</div>`;
        } else {
          inner = `<div class="hbc-text-disp" data-id="${obj.id}" style="${txtSt}pointer-events:none">`
                + _esc(obj.text||'텍스트')
                + `</div>`;
        }

        html += `<div class="hbc-obj hbc-text-obj${sc}" data-id="${obj.id}" style="${pos}${bdrSt}${bgSt}">
          <div class="hbc-obj-inner" style="${alnSt}">${inner}</div>
          ${sel ? this._handlesHtml(obj) : ''}
        </div>`;
      }
    }

    html += `</div>`;
    // 캔버스 높이 드래그 핸들
    html += `<div class="hbc-canvas-drag" title="드래그하여 높이 조절">
               <div class="hbc-canvas-drag-bar"></div>
             </div>`;
    html += `</div>`;

    this.builderEl.innerHTML = html;
    this._bindBuilderEvents();
    this._emitSelection();
  }

  _handlesHtml(obj) {
    return HANDLES.map(h => {
      const l = Math.round(h.cx * obj.w) - 4;
      const t = Math.round(h.cy * obj.h) - 4;
      return `<div class="hbc-handle" data-pos="${h.pos}" style="left:${l}px;top:${t}px;cursor:${h.cur}"></div>`;
    }).join('');
  }

  _bindBuilderEvents() {
    const canvas = this.builderEl.querySelector('.hbc-canvas');
    if (!canvas) return;

    // 캔버스 배경 클릭 → 선택 해제
    canvas.addEventListener('mousedown', e => {
      if (e.target === canvas && this.selected) {
        this.selected = null;
        this._renderBuilder();
      }
    });

    // 각 오브젝트 인터랙션
    canvas.querySelectorAll('.hbc-obj').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        const id  = el.dataset.id;
        const obj = this.data.objects.find(o => o.id === id);
        if (!obj) return;

        // 리사이즈 핸들 클릭
        const hEl = e.target.closest('.hbc-handle');
        if (hEl) {
          this._resize = {
            id, pos:hEl.dataset.pos,
            startX:e.clientX, startY:e.clientY,
            ox:obj.x, oy:obj.y, ow:obj.w, oh:obj.h,
          };
          return;
        }

        // 첫 클릭 = 선택, 두 번째 클릭(이미 선택된 상태) = 드래그 시작
        if (this.selected !== id) {
          this.selected = id;
          this._renderBuilder();
          return;
        }
        this._drag = { id, startX:e.clientX, startY:e.clientY, ox:obj.x, oy:obj.y };
      });

      // 더블클릭: 텍스트 오브젝트 직접 편집
      el.addEventListener('dblclick', e => {
        e.stopPropagation();
        const id  = el.dataset.id;
        const obj = this.data.objects.find(o => o.id === id);
        if (!obj || obj.type !== 'text' || obj.fieldType) return;

        const disp = el.querySelector('.hbc-text-disp');
        if (!disp) return;
        disp.contentEditable = 'true';
        disp.style.pointerEvents = 'auto';
        disp.style.cursor = 'text';
        disp.style.outline = 'none';
        disp.focus();
        // 전체 선택
        const sel = window.getSelection();
        const r   = document.createRange();
        r.selectNodeContents(disp);
        sel.removeAllRanges(); sel.addRange(r);

        const commit = () => {
          obj.text = disp.textContent;
          disp.contentEditable = 'false';
          disp.style.pointerEvents = 'none';
          disp.style.cursor = '';
          this._renderPreview();
        };
        disp.addEventListener('blur',    commit, { once:true });
        disp.addEventListener('keydown', ev => {
          if (ev.key === 'Escape' || ev.key === 'Enter') { ev.preventDefault(); disp.blur(); }
        });
      });
    });

    // 캔버스 높이 조절 드래그
    const dragBar = this.builderEl.querySelector('.hbc-canvas-drag');
    dragBar?.addEventListener('mousedown', e => {
      e.preventDefault();
      this._canvasResize = { startY:e.clientY, origH:this.data.canvasHeight };
    });
  }

  /* ── 마우스 이벤트 ── */
  _mouseMove(e) {
    if (this._drag) {
      const { id, startX, startY, ox, oy } = this._drag;
      const obj = this.data.objects.find(o => o.id === id);
      if (!obj) return;
      obj.x = Math.round(ox + e.clientX - startX);
      obj.y = Math.round(oy + e.clientY - startY);
      const el = this.builderEl.querySelector(`.hbc-obj[data-id="${id}"]`);
      if (el) { el.style.left=`${obj.x}px`; el.style.top=`${obj.y}px`; }
      return;
    }

    if (this._resize) {
      const { id, pos, startX, startY, ox, oy, ow, oh } = this._resize;
      const obj = this.data.objects.find(o => o.id === id);
      if (!obj) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const MIN = 20;
      let [x,y,w,h] = [ox, oy, ow, oh];

      if (pos.includes('e')) w = Math.max(MIN, ow + dx);
      if (pos.includes('w')) { const nw=Math.max(MIN, ow-dx); x=ox+(ow-nw); w=nw; }
      if (pos.includes('s')) h = Math.max(MIN, oh + dy);
      if (pos.includes('n')) { const nh=Math.max(MIN, oh-dy); y=oy+(oh-nh); h=nh; }

      obj.x=Math.round(x); obj.y=Math.round(y); obj.w=Math.round(w); obj.h=Math.round(h);

      const el = this.builderEl.querySelector(`.hbc-obj[data-id="${id}"]`);
      if (el) {
        el.style.left=`${obj.x}px`;  el.style.top=`${obj.y}px`;
        el.style.width=`${obj.w}px`; el.style.height=`${obj.h}px`;
        HANDLES.forEach(h => {
          const hEl = el.querySelector(`.hbc-handle[data-pos="${h.pos}"]`);
          if (hEl) {
            hEl.style.left = `${Math.round(h.cx*obj.w)-4}px`;
            hEl.style.top  = `${Math.round(h.cy*obj.h)-4}px`;
          }
        });
      }
      return;
    }

    if (this._canvasResize) {
      this.data.canvasHeight = Math.max(40,
        Math.round(this._canvasResize.origH + e.clientY - this._canvasResize.startY));
      const canvas = this.builderEl.querySelector('.hbc-canvas');
      if (canvas) canvas.style.height = `${this.data.canvasHeight}px`;
      const valEl = document.getElementById('canvasHVal');
      if (valEl) valEl.textContent = this.data.canvasHeight;
    }
  }

  _mouseUp() {
    const was = this._drag || this._resize || this._canvasResize;
    this._drag = this._resize = this._canvasResize = null;
    if (was) this.render();
  }

  /* ── 미리보기 ── */
  _renderPreview() {
    const html = renderHeaderAsHTML(this.data, null);
    this.previewEl.innerHTML =
      `<div style="position:relative;overflow:hidden">
         <div class="hb-preview-inner" style="width:${DEFAULT_WIDTH}px;transform-origin:top left">${html}</div>
       </div>`;
    requestAnimationFrame(() => {
      const inner = this.previewEl.querySelector('.hb-preview-inner');
      const outer = inner?.parentElement;
      if (!inner || !outer || !this.previewEl.clientWidth) return;
      const scale = this.previewEl.clientWidth / DEFAULT_WIDTH;
      inner.style.transform = `scale(${scale})`;
      outer.style.height    = `${inner.scrollHeight * scale}px`;
    });
  }

  _emitSelection() {
    this.builderEl.dispatchEvent(new CustomEvent('hb-selection', {
      detail: this.getSelected(), bubbles: true,
    }));
  }
}

/* ══════════════════════════════════════════════
   HTML 렌더링 (안내장에서 사용)
══════════════════════════════════════════════ */
export function renderHeaderAsHTML(data, formData) {
  if (!data) return '';
  return data.version === 2 ? _renderCanvas(data, formData) : _renderTable(data, formData);
}

function _renderCanvas(data, formData) {
  const { canvasHeight, objects } = data;
  let html = `<div class="school-header-canvas" `
    + `style="position:relative;width:100%;height:${canvasHeight}px;overflow:hidden">`;

  for (const obj of objects) {
    const px = (obj.x / DEFAULT_WIDTH * 100).toFixed(3);
    const pw = (obj.w / DEFAULT_WIDTH * 100).toFixed(3);

    if (obj.type === 'image') {
      html += `<img src="${obj.src}" `
        + `style="position:absolute;left:${px}%;top:${obj.y}px;`
        + `width:${pw}%;height:${obj.h}px;`
        + `object-fit:${obj.objectFit||'contain'};display:block;pointer-events:none">`;
    } else {
      const txtSt = [
        `font-family:'${obj.fontFamily||'Noto Sans KR'}',sans-serif`,
        `font-size:${obj.fontSize||13}px`,
        obj.bold   ? 'font-weight:bold'   : '',
        obj.italic ? 'font-style:italic'  : '',
        `color:${obj.color||'#000'}`,
      ].filter(Boolean).join(';');

      const boxSt = [
        `position:absolute`,`left:${px}%`,`top:${obj.y}px`,
        `width:${pw}%`,`height:${obj.h}px`,
        `display:flex`,`align-items:center`,
        `justify-content:${_fj(obj.align||'center')}`,
        `overflow:hidden`,`box-sizing:border-box`,`padding:2px 6px`,
        obj.bgColor     ? `background-color:${obj.bgColor}`      : '',
        obj.borderColor ? `border:1.5px solid ${obj.borderColor}` : '',
      ].filter(Boolean).join(';');

      let content;
      if (obj.fieldType && FIELD_LABELS[obj.fieldType]) {
        const val = formData ? (formData[obj.fieldType] || '') : '';
        content = val
          ? `<span style="${txtSt}">${_esc(val)}</span>`
          : `<span style="${txtSt};color:#94a3b8;font-style:italic">[${FIELD_LABELS[obj.fieldType]}]</span>`;
      } else {
        content = `<span style="${txtSt}">${_esc(obj.text||'').replace(/\n/g,'<br>')}</span>`;
      }
      html += `<div style="${boxSt}">${content}</div>`;
    }
  }
  return html + '</div>';
}

/* ── 구버전 테이블 형식 (하위 호환) ── */
function _renderTable(tableData, formData) {
  if (!tableData?.cells) return '';
  const { rows, cols, colWidths, rowHeights, cells } = tableData;
  const totalW = colWidths.reduce((a,b)=>a+b,0);
  const BC = { thin:'1px solid #aaa', thick:'2px solid #555', double:'3px double #555', none:'1px hidden transparent' };
  let html = `<table class="school-header-table" style="width:100%;border-collapse:collapse;table-layout:fixed"><colgroup>`;
  for (let c=0; c<cols; c++) html += `<col style="width:${(colWidths[c]/totalW*100).toFixed(2)}%">`;
  html += '</colgroup>';
  for (let r=0; r<rows; r++) {
    html += `<tr style="height:${rowHeights[r]||40}px">`;
    for (let c=0; c<cols; c++) {
      const cell = cells[r][c];
      if (cell.absorbed) continue;
      let h=0; for (let i=0;i<cell.rowspan;i++) h+=(rowHeights[r+i]||0);
      const b = cell.borders||{top:'thin',right:'thin',bottom:'thin',left:'thin'};
      const bs = `border-top:${BC[b.top]||BC.thin};border-right:${BC[b.right]||BC.thin};border-bottom:${BC[b.bottom]||BC.thin};border-left:${BC[b.left]||BC.thin};`;
      const bg = cell.bgColor?`background-color:${cell.bgColor};`:'';
      let dc='';
      if (cell.image) dc=`<img src="${cell.image}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;margin:0 auto">`;
      else if (cell.fieldType && FIELD_LABELS[cell.fieldType]) {
        const v=formData?(formData[cell.fieldType]||''):'';
        dc=v?_esc(v):`<span style="color:#94a3b8;font-size:.9em;font-style:italic">[${FIELD_LABELS[cell.fieldType]}]</span>`;
      } else if (cell.text) dc=_esc(cell.text).replace(/\n/g,'<br>');
      html+=`<td rowspan="${cell.rowspan}" colspan="${cell.colspan}" style="${bs}height:${h}px;text-align:${cell.align||'center'};vertical-align:middle;padding:4px;overflow:hidden;font-size:${cell.fontSize||11}px;font-family:'${cell.fontFamily||'Noto Sans KR'}',sans-serif;font-weight:${cell.bold?'bold':'normal'};font-style:${cell.italic?'italic':'normal'};color:${cell.color||'#000'};${bg}">${dc}</td>`;
    }
    html += '</tr>';
  }
  return html+'</table>';
}
