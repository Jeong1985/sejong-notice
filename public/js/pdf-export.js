function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src; el.onload = resolve;
    el.onerror = () => reject(new Error('라이브러리 로드 실패: ' + src));
    document.head.appendChild(el);
  });
}

export async function exportToPDF(title, schoolName, pages = 1) {
  await Promise.all([
    injectScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    injectScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
  ]);

  const page = document.querySelector('#docPage');
  if (!page) throw new Error('생성된 페이지가 없습니다.');

  const A4_H = 1123, A4_W = 794, SCALE = 2;

  // 단일 tall 클론으로 전체 렌더
  const clone = page.cloneNode(true);
  clone.style.cssText = `position:fixed;left:-9999px;top:0;transform:none;width:${A4_W}px;height:${A4_H * pages}px;margin:0;overflow:hidden;box-shadow:none;border-radius:0;`;
  // 미리보기용 구분선 숨김
  clone.querySelectorAll('.page-break-line').forEach(el => el.style.display = 'none');
  document.body.appendChild(clone);

  const fullCanvas = await window.html2canvas(clone, {
    scale: SCALE, useCORS: true, allowTaint: true, logging: false,
    width: A4_W, height: A4_H * pages,
  });
  document.body.removeChild(clone);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < pages; i++) {
    if (i > 0) pdf.addPage();

    const pageCanvas = document.createElement('canvas');
    pageCanvas.width  = A4_W * SCALE;
    pageCanvas.height = A4_H * SCALE;
    const ctx = pageCanvas.getContext('2d');
    ctx.drawImage(
      fullCanvas,
      0, i * A4_H * SCALE,   // 소스 시작점
      A4_W * SCALE, A4_H * SCALE, // 소스 크기
      0, 0,                   // 대상 시작점
      A4_W * SCALE, A4_H * SCALE  // 대상 크기
    );

    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
  }

  const base = (schoolName || '학교') + '_교육_안내장';
  const safeTitle = (title || base).replace(/[^\w가-힣\s]/g, '_');
  pdf.save(`${safeTitle}.pdf`);
}
