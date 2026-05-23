import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export async function exportToDOCX(doc) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes());
  zip.file('_rels/.rels', rootRels());
  zip.file('word/_rels/document.xml.rels', documentRels());
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/document.xml', documentXml(doc));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const schoolName = doc.schoolName || '학교';
  const safeTitle = (doc.title || `${schoolName}_교육_안내장`).replace(/[^\w가-힣\s]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeTitle}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
      <w:lang w:val="ko-KR" w:eastAsia="ko-KR"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;
}

const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function documentXml(doc) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${WNS}><w:body>
${buildBody(doc)}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>
</w:sectPr>
</w:body></w:document>`;
}

function buildBody(doc) {
  const out = [];
  const sig = (doc.schoolName || '학교').split('').join(' ') + ' 장';

  if (doc.title) out.push(mkP(doc.title, { bold: true, sz: 36, align: 'center', before: 240, after: 240 }));

  const info = [doc.responsible && `담당: ${doc.responsible}`, doc.phone && `전화: ${doc.phone}`].filter(Boolean);
  if (info.length) out.push(mkP(info.join('   '), { sz: 18, align: 'right', after: 80 }));

  out.push(mkP('학부모님께', { bold: true, after: 80 }));
  if (doc.greeting) stripHtml(doc.greeting).split('\n').filter(l => l.trim()).forEach(l => out.push(mkP(l.trim())));
  out.push(emptyP());

  out.push(...htmlToParas(doc.content || ''));
  out.push(emptyP(), emptyP());

  if (doc.date) out.push(mkP(doc.date, { align: 'right', after: 80 }));
  out.push(emptyP());
  out.push(mkP(sig, { bold: true, sz: 32, align: 'center' }));

  return out.join('\n');
}

function mkP(text, opts = {}) {
  const { bold = false, sz = 22, align = 'left', before = 0, after = 120 } = opts;
  const pPr = [align !== 'left' ? `<w:jc w:val="${align}"/>` : '', `<w:spacing w:before="${before}" w:after="${after}"/>`].join('');
  const rPr = [bold ? '<w:b/><w:bCs/>' : '', `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`, '<w:rFonts w:eastAsia="맑은 고딕"/>'].join('');
  return `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
}

function emptyP() { return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>`; }

function htmlToParas(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const result = [];
  function walk(node) {
    const tag = node.tagName?.toLowerCase();
    if (!tag) { const t = node.textContent.trim(); if (t) result.push(mkP(t)); return; }
    if (tag === 'ul' || tag === 'ol') {
      node.querySelectorAll('li').forEach(li => { const t = li.textContent.trim(); if (t) result.push(mkP('• ' + t)); });
    } else if (tag === 'table') {
      node.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim());
        if (cells.some(Boolean)) result.push(mkP(cells.join(' | ')));
      });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const t = node.textContent.trim(); if (t) result.push(mkP(t, { bold: true, sz: 26 }));
    } else if (tag === 'p' || tag === 'div') {
      const t = node.textContent.trim(); result.push(t ? mkP(t) : emptyP());
    } else if (tag === 'br') { result.push(emptyP()); }
    else { node.childNodes.forEach(walk); }
  }
  div.childNodes.forEach(walk);
  return result.length ? result : [emptyP()];
}

function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

function x(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
