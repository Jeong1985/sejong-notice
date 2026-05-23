const GEMINI_API_KEY = 'AIzaSyDviGxdrQU1K92mbJ4ZNPyXlSHLqMmYJd4';
const GEMINI_MODEL   = 'gemini-2.5-flash';

async function callGemini(systemInstruction, prompt, jsonMode = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 4096,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const DELAYS = [2000, 4000, 8000, 12000];
  for (let attempt = 0; attempt <= 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return (await res.json()).candidates[0].content.parts[0].text;
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if ((status === 429 || status === 503 || status === 500) && attempt < 4) {
      await new Promise(r => setTimeout(r, DELAYS[attempt]));
      continue;
    }
    throw new Error(err.error?.message || `HTTP ${status}`);
  }
}

/* JSON 문자열 내 literal 줄바꿈·탭을 이스케이프로 치환 */
function fixLiteralNewlines(str) {
  let inString = false, escaped = false, out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { out += c; escaped = false; continue; }
    if (c === '\\') { escaped = true; out += c; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') continue;
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out;
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  let cleaned = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

  // 시도 1: 직접 파싱
  try { return JSON.parse(cleaned); } catch {}

  // 시도 2: literal 줄바꿈 수정 후 파싱
  const fixed = fixLiteralNewlines(cleaned);
  try { return JSON.parse(fixed); } catch {}

  // 시도 3: { } 블록 추출 후 파싱
  const m = fixed.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }

  // 시도 4: regex로 각 필드 직접 추출
  const grab = (key) => {
    const r = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's'));
    return r ? r[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"') : '';
  };
  const title = grab('title'), greeting = grab('greeting'), content = grab('content');
  if (title || content) return { title, greeting, content };

  return null;
}

export async function generateNewsletterContent({ topic, title, pages, schoolName, date, responsible }) {
  const pageGuide = { 1:'약 400~600자', 2:'약 800~1200자', 3:'약 1400~1800자', 4:'약 1800~2400자' };

  const sys = `당신은 대한민국 초등학교 공문·안내장 작성 전문가입니다.
학부모에게 발송하는 공식 학교 안내장을 아래 HTML 규칙에 따라 작성합니다.
반드시 공손한 격식체를 사용하고 읽기 쉽게 구성합니다.
JSON 출력 시 문자열 내 줄바꿈은 반드시 \\n 이스케이프로 표현하세요.`;

  const prompt = `다음 조건으로 학교 안내장을 작성해주세요.

【기본 정보】
- 학교명: ${schoolName || '학교'}
- 담당자: ${responsible || '미정'}
- 발행일: ${date || ''}
- 목표 쪽수: ${pages}쪽 (분량: ${pageGuide[pages] || pageGuide[2]})
- 안내 주제: ${topic}
${title ? `- 제목: ${title}` : '- 제목: 주제에 맞게 15자 이내로 작성'}

【HTML 구조 규칙】
• 섹션 제목: <p class="section-head">📌 제목</p>
• 일반 문단: <p>내용</p>
• 중요 강조: <strong>강조 내용</strong>
• 핵심 박스: <div class="highlight-box"><p>핵심 내용</p></div>
• 목록: <ul><li>항목</li></ul>
• 표: <table><thead><tr><th>제목</th></tr></thead><tbody><tr><td>내용</td></tr></tbody></table>
• h1·h2·h3·div·span 등 기타 태그 사용 금지
• 날짜·서명·인사말 종결어는 content에 포함하지 말 것 (별도 처리됨)

【출력 형식 — JSON 한 줄로】
{"title":"제목","greeting":"인사말 2~3문장","content":"<p>본문</p>"}`;

  const raw = await callGemini(sys, prompt, true);
  const parsed = parseJsonSafe(raw);
  if (parsed) return parsed;
  // 파싱 실패 시 raw를 content로 보호 처리
  console.warn('[gemini] JSON parse failed, raw:', raw.slice(0, 200));
  return { title: title || topic?.slice(0, 15) || '안내장', greeting: '', content: `<p>${raw.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>` };
}

export async function applyFeedback({ currentContent, currentTitle, currentGreeting, feedback, pages }) {
  const prompt = `다음은 현재 학교 안내장입니다.

【현재 제목】${currentTitle}
【현재 인사말】${currentGreeting}
【현재 본문 (HTML)】${currentContent}
【사용자 피드백】${feedback}

피드백을 반영하여 수정해주세요. 목표 쪽수: ${pages}쪽.
JSON 형식으로만 출력: {"title":"수정된 제목","greeting":"수정된 인사말","content":"수정된 본문 HTML"}`;

  const raw = await callGemini('초등학교 안내장 수정 전문가입니다.', prompt, true);
  return parseJsonSafe(raw) || { content: `<p>${raw}</p>` };
}

export async function generateTitle({ topic }) {
  const raw = await callGemini(
    '초등학교 안내장 제목 생성 전문가입니다.',
    `초등학교 안내장 제목 하나만 생성하세요.\n주제: ${topic}\n조건: 15자 이내, 따옴표·설명 없이 제목만`,
    false
  );
  return raw.trim().replace(/^["']|["']$/g, '');
}
