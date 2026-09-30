import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getAuthInstance } from './firebase';
import { quiet } from './utils';
import { MARK_TYPES } from './marks';
import { addPending, listPending, removePending, notifyPendingChanged } from './pendingAudio';
import { DEFAULT_SUMMARY_PROMPT } from './defaults';

// AIを担当するCloudflare WorkerのURL
export const WORKER_URL = 'https://keikocho.ksvox-nobu.workers.dev';

// ---------- 共通の送信処理 ----------
async function postWorker(path, body) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const err = new Error('offline');
    err.offline = true;
    throw err;
  }
  const auth = getAuthInstance();
  const user = auth && auth.currentUser;
  if (!user) throw new Error('ログイン状態を確認できませんでした');
  const token = await user.getIdToken();

  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json) {
    throw new Error((json && json.error) || `通信エラー(${res.status})`);
  }
  return json;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1]);
    r.onerror = () => reject(new Error('音声を読み込めませんでした'));
    r.readAsDataURL(blob);
  });
}

// ---------- 歌詞の読み取り ----------
// 写真を読み取りに適した大きさ(長い辺2000px)のJPEGに縮小する
export function fileToJpeg(file, maxSide = 2000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を開けませんでした'));
    };
    img.src = url;
  });
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;

// 画像はJPEGに縮小、PDFはそのまま送る形に変換する
export function fileToPayload(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) return fileToJpeg(file);
  if (file.size > MAX_PDF_BYTES) {
    return Promise.reject(new Error('PDFが大きすぎます(15MBまで)'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve({
        mimeType: 'application/pdf',
        data: dataUrl.split(',')[1],
        preview: null,
        pdfUrl: URL.createObjectURL(file),
        name: file.name || 'PDF',
      });
    };
    reader.onerror = () => reject(new Error('PDFを開けませんでした'));
    reader.readAsDataURL(file);
  });
}

// 画像・PDF(複数可・ページ順)から歌詞と曲名を読み取る
export async function scanLyrics(images) {
  const json = await postWorker('/scan', { images: images.map(({ mimeType, data }) => ({ mimeType, data })) });
  return { title: json.title || '', lyrics: json.lyrics || '' };
}

// ---------- 注意マーク ----------
const runningMarks = new Set();

// 曲の注意マークを分析して保存する(同じ曲の二重実行はしない)
export async function runMarksAnalysis(db, sid, songId, lyrics) {
  if (!songId || runningMarks.has(songId)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  runningMarks.add(songId);
  const ref = doc(db, 'students', sid, 'songs', songId);
  try {
    const json = await postWorker('/marks', { lyrics });
    const marks = (json.marks || [])
      .filter((m) => m && m.text && MARK_TYPES[m.type])
      .map((m) => ({ line: Number.isInteger(m.line) ? m.line : null, text: String(m.text), type: m.type, note: String(m.note || '') }));
    quiet(
      updateDoc(ref, {
        marks,
        marksLang: json.language || '',
        marksStatus: 'done',
        marksError: '',
        translation: String(json.translation || ''),
        translationStatus: 'done',
      })
    );
  } catch (e) {
    if (!e.offline) quiet(updateDoc(ref, { marksStatus: 'error', marksError: String(e.message || '').slice(0, 200) }));
  } finally {
    runningMarks.delete(songId);
  }
}

// ---------- 日本語訳(訳がまだない曲用) ----------
const runningTr = new Set();

export async function runTranslation(db, sid, songId, lyrics) {
  if (!songId || runningTr.has(songId)) return;
  runningTr.add(songId);
  const ref = doc(db, 'students', sid, 'songs', songId);
  try {
    const json = await postWorker('/translate', { lyrics });
    quiet(
      updateDoc(ref, {
        translation: String(json.translation || ''),
        translationStatus: 'done',
        marksLang: json.language || '',
      })
    );
  } finally {
    runningTr.delete(songId);
  }
}

// ---------- 振り返り録音のまとめ ----------
function termsFromSettings(settings) {
  const names = [];
  (settings?.routineCategories || []).forEach((c) => (c.items || []).forEach((it) => names.push(it.name)));
  return [...names, ...(settings?.readingTasks || [])];
}

export async function summarizeAudio(blob, mimeType, settings) {
  const data = await blobToBase64(blob);
  const json = await postWorker('/summary', {
    audio: { mimeType: (mimeType || blob.type || 'audio/mp4').split(';')[0], data },
    instruction: (settings && settings.summaryPrompt) || DEFAULT_SUMMARY_PROMPT,
    terms: termsFromSettings(settings),
  });
  const pick = (k) => (Array.isArray(json[k]) ? json[k].map(String).filter((x) => x.trim()) : []);
  return { done: pick('done'), good: pick('good'), issues: pick('issues'), next: pick('next') };
}

let processing = false;

// iPadに保存された録音を、ネットにつながっている時にまとめて処理する
// 失敗が3回続いた録音は自動では再送せず、画面の「もう一度まとめる」を待つ
export async function processPendingAudio(db, settings, { force = false, lessonId = null } = {}) {
  if (processing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  processing = true;
  try {
    const list = await listPending();
    for (const rec of list) {
      if (!navigator.onLine) break;
      if (lessonId && rec.lessonId !== lessonId) continue;
      if (!force && (rec.attempts || 0) >= 3) continue;
      try {
        const summary = await summarizeAudio(rec.blob, rec.mimeType, settings);
        quiet(
          setDoc(
            doc(db, 'students', rec.studentId, 'lessons', rec.lessonId),
            { summary, summaryAt: new Date().toISOString(), summaryError: '' },
            { merge: true }
          )
        );
        await removePending(rec.id);
      } catch (e) {
        if (e.offline) break;
        try {
          await addPending({ ...rec, attempts: (rec.attempts || 0) + 1 });
        } catch (err) {
          /* noop */
        }
        quiet(
          setDoc(
            doc(db, 'students', rec.studentId, 'lessons', rec.lessonId),
            { summaryError: String(e.message || '').slice(0, 200) },
            { merge: true }
          )
        );
      }
    }
  } finally {
    processing = false;
    notifyPendingChanged();
  }
}
