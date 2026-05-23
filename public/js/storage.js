import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { getFirestore, collection, getDocs,
         doc, setDoc, deleteDoc }            from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAVd2Ccu9Baey46p4keq3dY0jV_0_h45Mw',
  authDomain:        'dajeonges2026.firebaseapp.com',
  projectId:         'dajeonges2026',
  storageBucket:     'dajeonges2026.firebasestorage.app',
  messagingSenderId: '414018484747',
  appId:             '1:414018484747:web:2fef2acae18f1fbc6c250e',
};

const COLL = 'sejong_notice_schools';

let db;
try {
  const app = initializeApp(FIREBASE_CONFIG, 'sejong-notice');
  db = getFirestore(app);
} catch (e) {
  console.warn('[storage] Firebase 초기화 실패:', e);
}

/* ── 인메모리 캐시 ── */
let _cache = [];
let _initPromise = null;

/* ── 초기화: Firestore → 인메모리 캐시 ──
   페이지 로드 시 1회 호출. 이후 읽기는 캐시에서 동기 반환.
*/
export function initStorage() {
  if (_initPromise) return _initPromise;
  _initPromise = _loadAll();
  return _initPromise;
}

async function _loadAll() {
  if (!db) { _cache = []; return; }
  try {
    const snap = await getDocs(collection(db, COLL));
    _cache = snap.docs.map(d => {
      const data = { id: d.id, ...d.data() };
      // headerTable은 JSON 문자열로 저장됨 (Firestore 중첩배열 불가 대응)
      if (typeof data.headerTable === 'string') {
        try { data.headerTable = JSON.parse(data.headerTable); } catch {}
      }
      return data;
    });
  } catch (e) {
    console.warn('[storage] Firestore 로드 실패:', e);
    _cache = [];
  }
}

/* ── 공개 API (동기, 캐시 기반) ── */
export function loadSchools()     { return [..._cache]; }
export function getSchool(id)     { return _cache.find(s => s.id === id) || null; }

export function upsertSchool(school) {
  if (!school.id) {
    school.id = crypto.randomUUID?.()
      ?? (Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  const idx = _cache.findIndex(s => s.id === school.id);
  if (idx >= 0) _cache[idx] = school; else _cache.push(school);
  _fsUpsert(school); // 비동기 Firestore 기록
  return school;
}

export function deleteSchool(id) {
  _cache = _cache.filter(s => s.id !== id);
  _fsDelete(id);
}

/* ── Firestore 비동기 쓰기 ── */
async function _fsUpsert(school) {
  if (!db) return;
  try {
    const { id, ...data } = school;
    // Firestore는 중첩 배열(2D array) 미지원 → headerTable을 JSON 문자열로 직렬화
    const firestoreData = {
      ...data,
      headerTable: data.headerTable ? JSON.stringify(data.headerTable) : null,
    };
    await setDoc(doc(db, COLL, id), firestoreData);
  } catch (e) {
    console.warn('[storage] Firestore 쓰기 오류:', e);
    // 쓰기 실패 시 사용자에게 알림
    window.dispatchEvent(new CustomEvent('storage-write-error', { detail: e.message }));
  }
}

async function _fsDelete(id) {
  if (!db) return;
  try { await deleteDoc(doc(db, COLL, id)); }
  catch (e) { console.warn('[storage] Firestore 삭제 오류:', e); }
}
