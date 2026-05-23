import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export async function exportToHWPX(doc) {
  const zip = new JSZip();

  // mimetype must be STORED (not compressed) first
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', containerXml());
  zip.file('META-INF/manifest.xml', manifestXml());
  zip.file('Contents/content.hpf', contentHpf(doc.title || '교육 안내장'));
  zip.file('Contents/header.xml', headerXml());
  zip.file('Contents/section0.xml', sectionXml(doc));

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeTitle = ((doc.title || `${doc.schoolName || '학교'}_교육_안내장`))
    .replace(/[^\w가-힣\s]/g, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safeTitle}.hwpx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ── META-INF/container.xml ── */
function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/hwp+zip"/>
  </rootfiles>
</container>`;
}

/* ── META-INF/manifest.xml ── */
function manifestXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest xmlns="http://www.hancom.co.kr/hwpml/2012/manifest">
  <item id="header"   href="Contents/header.xml"   media-type="application/xml"/>
  <item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
</manifest>`;
}

/* ── Contents/content.hpf ── */
function contentHpf(title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hpf:Package xmlns:hpf="http://www.hancom.co.kr/hwpml/2012/HWPPackage">
  <hpf:Metadata>
    <hpf:Title>${x(title)}</hpf:Title>
    <hpf:Language>ko-KR</hpf:Language>
  </hpf:Metadata>
  <hpf:Manifest>
    <hpf:Item Id="header"   Href="header.xml"   MediaType="application/xml"/>
    <hpf:Item Id="section0" Href="section0.xml" MediaType="application/xml"/>
  </hpf:Manifest>
  <hpf:Spine>
    <hpf:ItemRef IdRef="header"   IsSpineItem="0"/>
    <hpf:ItemRef IdRef="section0" IsSpineItem="1"/>
  </hpf:Spine>
</hpf:Package>`;
}

/* ── Contents/header.xml ── */
function headerXml() {
  const scripts = ['Hangul', 'Latin', 'Hanja', 'Japanese', 'Other', 'Symbol', 'User'];

  const fontRefs = (hId, lId) => scripts.map(s => {
    const id = (s === 'Latin' || s === 'Other' || s === 'Symbol') ? lId : hId;
    return `<hc:FontRef Script="${s}" Id="${id}"/>`;
  }).join('');

  const scriptAttrs = (tag, val) =>
    scripts.map(s => `<hc:${tag} Script="${s}" Value="${val}"/>`).join('');

  const charShape = (id, height, bold = false) => `
        <hc:CharShape Id="${id}" Height="${height}" TextColor="0" ShadeColor="16777215"
                      UseFontSpace="0" UseKerning="0" SymMark="0" BorderFillIDRef="0">
          ${fontRefs(0, 1)}
          ${scriptAttrs('Ratio', '100')}
          ${scriptAttrs('Spacing', '0')}
          ${scriptAttrs('RelSz', '100')}
          ${scriptAttrs('Offset', '0')}
          ${bold ? '<hc:Bold Value="1"/>' : ''}
        </hc:CharShape>`;

  const paraShape = (id, align, prevNext = '0 0') => {
    const [prev, next] = prevNext.split(' ');
    return `
        <hc:ParaShape Id="${id}" Align="${align}" Condense="0" WidowOrphan="0"
                      KeepWithNext="0" KeepLines="0" PageBreakBefore="0"
                      FontLineHeight="0" SnapToGrid="0" LineWrap="Breaking"
                      AutoSpaceEAsianEng="1" AutoSpaceEAsianNum="1">
          <hc:Margin Left="0" Right="0" Indent="0" Prev="${prev}" Next="${next}"/>
          <hc:LineSpacing Type="Percent" Value="160"/>
          <hc:TabDef IDRef="0"/><hc:Numbering/><hc:Border/>
        </hc:ParaShape>`;
  };

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:Head xmlns:hh="http://www.hancom.co.kr/hwpml/2012/HWPHistory"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2012/HWPCompatibility">
  <hh:DocInfo>
    <hc:IdMappings>
      <hc:Fonts Count="2">
        <hc:Font Id="0" Face="나눔고딕" Type="TTF" SubstFont="맑은 고딕"/>
        <hc:Font Id="1" Face="Arial"    Type="TTF" SubstFont=""/>
      </hc:Fonts>
      <hc:BorderFills Count="1">
        <hc:BorderFill Id="0" ThreeD="0" Shadow="0">
          <hc:Slash Type="NONE" Crooked="0" CounterSlash="0"/>
          <hc:BackSlash Type="NONE" Crooked="0" CounterSlash="0"/>
          <hc:LeftBorder Type="NONE" Width="0.1mm" Color="0"/>
          <hc:RightBorder Type="NONE" Width="0.1mm" Color="0"/>
          <hc:TopBorder Type="NONE" Width="0.1mm" Color="0"/>
          <hc:BottomBorder Type="NONE" Width="0.1mm" Color="0"/>
          <hc:DiagonalBorder Type="NONE" Width="0.1mm" Color="0"/>
          <hc:FillInfo><hc:NoFill/></hc:FillInfo>
        </hc:BorderFill>
      </hc:BorderFills>
      <hc:CharShapes Count="4">
        ${charShape(0, 1000)}
        ${charShape(1, 1400, true)}
        ${charShape(2, 900)}
        ${charShape(3, 1600, true)}
      </hc:CharShapes>
      <hc:TabDefs Count="1">
        <hc:TabDef Id="0" AutoTabLeft="0" AutoTabRight="0"/>
      </hc:TabDefs>
      <hc:Numberings Count="0"/>
      <hc:Bullets Count="0"/>
      <hc:ParaShapes Count="3">
        ${paraShape(0, 'Justify', '0 85')}
        ${paraShape(1, 'Center',  '200 200')}
        ${paraShape(2, 'Right',   '0 0')}
      </hc:ParaShapes>
      <hc:Styles Count="1">
        <hc:Style Id="0" Type="Para" Name="바탕글" EngName="Normal"
                  NextStyleIDRef="0" LangID="1042" LockForm="0">
          <hc:ParaShape IDRef="0"/>
          <hc:CharShape IDRef="0"/>
        </hc:Style>
      </hc:Styles>
    </hc:IdMappings>
  </hh:DocInfo>
  <hh:BodyText>
    <hh:SectionDefinition TextDirection="Horizontal" SpaceColumns="1134">
      <hh:PageDef PaperWidth="21000" PaperHeight="29700"
                  TopMargin="3000" BottomMargin="2000"
                  LeftMargin="3000" RightMargin="3000"
                  HeaderLen="0" FooterLen="0" BindingMargin="0"
                  Landscape="0" BookFold="0" BookFoldPrintCount="0">
        <hh:FootnoteShape/><hh:EndnoteShape/>
      </hh:PageDef>
      <hh:ColDef ColCount="1" SameGap="0" LineInEachCol="0" GapBetweenCols="1134">
        <hh:ColInfo Width="0" Gap="0"/>
      </hh:ColDef>
      <hh:Grid HorzGrid="0" VertGrid="0" IsSyncHorzLine="0" IsSyncVertLine="0"/>
    </hh:SectionDefinition>
  </hh:BodyText>
</hh:Head>`;
}

/* ── Contents/section0.xml ── */
function sectionXml(doc) {
  let id = 0;
  const paras = [];
  const sig = (doc.schoolName || '학교').split('').join(' ') + ' 장';

  const mkP = (text, paraRef, charRef) => {
    const run = text
      ? `<hsp:Run CharShapeIDRef="${charRef}"><hsp:T>${x(text)}</hsp:T></hsp:Run>`
      : '';
    return `<hsp:P Id="${id++}" ParaShapeIDRef="${paraRef}" StyleIDRef="0" `
         + `PageBreak="0" ColumnBreak="0" MergeParaBreak="0" LineBreak="0">${run}</hsp:P>`;
  };
  const empty = () => mkP('', 0, 0);

  // 제목
  if (doc.title) paras.push(mkP(doc.title, 1, 1));

  // 담당/전화
  const info = [
    doc.responsible && `담당: ${doc.responsible}`,
    doc.phone && `전화: ${doc.phone}`,
  ].filter(Boolean);
  if (info.length) paras.push(mkP(info.join('   '), 2, 2));

  // 인사말
  paras.push(mkP('학부모님께', 0, 0));
  if (doc.greeting) {
    stripHtml(doc.greeting).split('\n')
      .filter(l => l.trim())
      .forEach(l => paras.push(mkP(l.trim(), 0, 0)));
  }
  paras.push(empty());

  // 본문
  htmlToParas(doc.content || '').forEach(({ text, bold }) =>
    paras.push(mkP(text, 0, bold ? 1 : 0)));
  paras.push(empty(), empty());

  // 날짜
  if (doc.date) paras.push(mkP(doc.date, 2, 2));
  paras.push(empty());

  // 학교명 + 장
  paras.push(mkP(sig, 1, 3));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hsp:SectionDefinition xmlns:hsp="http://www.hancom.co.kr/hwpml/2012/Section">
${paras.join('\n')}
</hsp:SectionDefinition>`;
}

/* ── 헬퍼 ── */
function htmlToParas(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const result = [];
  function walk(node) {
    const tag = node.tagName?.toLowerCase();
    if (!tag) {
      const t = node.textContent.trim();
      if (t) result.push({ text: t, bold: false });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      node.querySelectorAll('li').forEach(li => {
        const t = li.textContent.trim();
        if (t) result.push({ text: '• ' + t, bold: false });
      });
    } else if (tag === 'table') {
      node.querySelectorAll('tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim());
        if (cells.some(Boolean)) result.push({ text: cells.join(' | '), bold: false });
      });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const t = node.textContent.trim();
      if (t) result.push({ text: t, bold: true });
    } else if (tag === 'p' || tag === 'div') {
      const t = node.textContent.trim();
      result.push({ text: t, bold: false });
    } else if (tag === 'br') {
      result.push({ text: '', bold: false });
    } else {
      node.childNodes.forEach(walk);
    }
  }
  div.childNodes.forEach(walk);
  return result.length ? result : [{ text: '', bold: false }];
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .trim();
}

function x(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
