/* ═══════════════════════════════════════════════════════
   HWPX (한글 워드프로세서) 내보내기 — 실험적
   - 표준 OWPML(2011) 패키지 구조로 .hwpx 생성
   - 텍스트 위주. 표는 탭 구분 텍스트로 평문화(추후 표 지원 예정)
   - 한글(HWP)에서 열어 편집 가능
═══════════════════════════════════════════════════════ */
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const x = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/* ── HTML → 문단 목록 ── */
function htmlToParagraphs(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  const paras = [];
  const walk = (container) => {
    container.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        const t = node.textContent.replace(/\s+/g, ' ').trim();
        if (t) paras.push({ text: t, kind: 'body' });
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node, tag = el.tagName.toLowerCase();
      if (tag === 'p') {
        const t = el.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim();
        if (t) paras.push({ text: t, kind: el.classList.contains('section-head') ? 'head' : 'body' });
      } else if (tag === 'ul' || tag === 'ol') {
        [...el.children].forEach((li, i) => {
          const t = li.innerText.replace(/\s+/g, ' ').trim();
          if (t) paras.push({ text: (tag === 'ol' ? `${i + 1}. ` : '· ') + t, kind: 'body' });
        });
      } else if (tag === 'table') {
        el.querySelectorAll('tr').forEach(tr => {
          const cells = [...tr.children].map(td => td.innerText.replace(/\s+/g, ' ').trim());
          if (cells.some(Boolean)) paras.push({ text: cells.join('\t'), kind: 'body' });
        });
      } else if (tag !== 'br') {
        walk(el);
      }
    });
  };
  walk(div);
  return paras;
}

/* ── section0.xml ── */
function buildSectionXml(model) {
  let id = 0;
  const paras = [];

  // 첫 문단에 secPr(페이지 설정) 포함
  const secPr = `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strtnum="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr><hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="850" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr><hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr><hp:pageBorderFill type="BOTH" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill></hp:secPr>`;

  const para = (text, kind, extraRunHead = '') => {
    const charRef = kind === 'title' ? 2 : (kind === 'head' || kind === 'sig') ? 1 : 0;
    const paraRef = (kind === 'title' || kind === 'sig' || kind === 'date') ? 1 : 0;
    const t = String(text ?? '');
    const runBody = `<hp:run charPrIDRef="${charRef}">${extraRunHead}<hp:t>${x(t)}</hp:t></hp:run>`;
    return `<hp:p id="${id++}" paraPrIDRef="${paraRef}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runBody}</hp:p>`;
  };
  const add = (text, kind) => { if (text != null && String(text).trim() !== '') paras.push(para(text, kind)); };

  // 첫 문단(제목 or 빈 문단)에 secPr 부착
  const firstKind = model.title ? 'title' : 'body';
  paras.push(para(model.title || '', firstKind, secPr));

  add(model.greetingLabel, 'head');
  htmlToParagraphs(model.greetingHTML).forEach(p => add(p.text, p.kind));
  add(' ', 'body');
  htmlToParagraphs(model.contentHTML).forEach(p => add(p.text, p.kind));
  add(' ', 'body');
  add(model.date, 'date');
  add(model.schoolSig, 'sig');

  if (model.cut) {
    add(' ', 'body');
    add('- - - - - - - - - - - - - - - - -  ✂  - - - - - - - - - - - - - - - - -', 'date');
    htmlToParagraphs(model.cut.replyHTML).forEach(p => add(p.text, p.kind));
    add(model.cut.date, 'date');
    add(model.cut.sig, 'sig');
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">${paras.join('')}</hs:sec>`;
}

/* ── header.xml ── */
function buildHeaderXml() {
  const font = (id) => `<hh:font id="${id}" face="함초롬바탕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_MYUNGJO" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>`;
  const fontface = (lang) => `<hh:fontface lang="${lang}" fontCnt="1">${font(0)}</hh:fontface>`;
  const langs = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];
  const per = (v) => `hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"`;
  const charPr = (id, height, color, bold) =>
    `<hh:charPr id="${id}" height="${height}" textColor="${color}" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="0"><hh:fontRef ${per(0)}/><hh:ratio ${per(100)}/><hh:spacing ${per(0)}/><hh:relSz ${per(100)}/><hh:offset ${per(0)}/>${bold ? '<hh:bold/>' : ''}</hh:charPr>`;
  const paraPr = (id, align) =>
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="${align}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>`;
  const border = (id, type, w) =>
    `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="${type}" width="${w}" color="#000000"/><hh:rightBorder type="${type}" width="${w}" color="#000000"/><hh:topBorder type="${type}" width="${w}" color="#000000"/><hh:bottomBorder type="${type}" width="${w}" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList><hh:fontfaces itemCnt="7">${langs.map(fontface).join('')}</hh:fontfaces><hh:borderFills itemCnt="2">${border(1, 'NONE', '0.1 mm')}${border(2, 'SOLID', '0.12 mm')}</hh:borderFills><hh:charProperties itemCnt="3">${charPr(0, 1000, '#000000', false)}${charPr(1, 1100, '#1A6B2F', true)}${charPr(2, 1900, '#111111', true)}</hh:charProperties><hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties><hh:numberings itemCnt="0"/><hh:paraProperties itemCnt="2">${paraPr(0, 'JUSTIFY')}${paraPr(1, 'CENTER')}</hh:paraProperties><hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument></hh:head>`;
}

function buildContentHpf() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ct="http://www.idpf.org/2007/opf/contenttype/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="" unique-identifier="" id=""><opf:metadata><opf:title></opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
}
function buildContainerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`;
}
function buildManifestXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/><odf:file-entry odf:full-path="Contents/content.hpf" odf:media-type="application/hwpml-package+xml"/><odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/><odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/></odf:manifest>`;
}
function buildVersionXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.4" application="세종안내장생성기" appVersion="1.0"/>`;
}
function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;
}

export async function exportToHWPX(model) {
  const zip = new JSZip();
  // mimetype: 압축 없이(STORE) 최우선 배치
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('version.xml', buildVersionXml());
  zip.file('settings.xml', buildSettingsXml());
  zip.file('META-INF/container.xml', buildContainerXml());
  zip.file('META-INF/manifest.xml', buildManifestXml());
  zip.file('Contents/content.hpf', buildContentHpf());
  zip.file('Contents/header.xml', buildHeaderXml());
  zip.file('Contents/section0.xml', buildSectionXml(model));
  zip.file('Preview/PrvText.txt', [model.title, model.schoolName].filter(Boolean).join('\n'));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const base = (model.schoolName || '학교') + '_교육_안내장';
  const safeTitle = (model.title || base).replace(/[^\w가-힣\s]/g, '_').trim() || base;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeTitle}.hwpx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
