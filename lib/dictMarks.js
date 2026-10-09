// 注意マーク(英語曲のみ・AIなし): 発音辞書と決まりごとで付ける。SingFlexの歌詞メモと同じ仕組み
import { doc, updateDoc } from 'firebase/firestore';
import { loadDict, parseIdioms, analyzeLine, coreOf } from './english';
import { quiet } from './utils';

export const MARKS_VERSION = 'dict1';
const JP = /[\u3040-\u30ff\u3400-\u9fff]/;

// 歌詞全体 → 注意マーク [{type, line, start, text}]
export function dictMarks(lyrics) {
  const pats = parseIdioms(null);
  const out = [];
  String(lyrics || '').split('\n').forEach((line, li) => {
    if (JP.test(line) || !/[A-Za-z]/.test(line)) return;
    const toks = analyzeLine(line, pats);
    // 語の位置(元の行のまま。空白の数が違っても文字はずれない)
    let cur = 0;
    const pos = toks.map((t) => { const p = line.indexOf(t.t, cur); cur = p + t.t.length; return p; });
    const add = (type, s, e) => { if (s >= 0 && e > s) out.push({ type, line: li, start: s, text: line.slice(s, e), note: '' }); };
    toks.forEach((t, k) => {
      const c = coreOf(t.t); if (!c) return;
      const cs = pos[k] + c.at; const ce = cs + c.core.replace(/'$/, '').length;
      if (t.as != null) add('accent', pos[k] + t.as, pos[k] + t.ae);
      if (t.b) add('content', cs, ce);
      if (t.h) add('difficult', cs, ce);
      const nx = toks[k + 1];
      if (t.l && nx && !(t.i && nx.i === t.i)) { const nc = coreOf(nx.t); add('linking', ce - 1, pos[k + 1] + (nc ? nc.at : 0) + 1); }
      if (t.i && (k === 0 || toks[k - 1].i !== t.i)) { let j = k; while (toks[j + 1] && toks[j + 1].i === t.i) j++; add('idiom', pos[k], pos[j] + toks[j].t.replace(/[,.!?;:]+$/, '').length); }
    });
  });
  return out;
}

const running = new Set();
export async function runDictMarks(db, sid, songId, lyrics) {
  if (!songId || running.has(songId)) return;
  running.add(songId);
  const ref = doc(db, 'students', sid, 'songs', songId);
  try {
    await loadDict();
    const text = String(lyrics || '');
    const jpChars = (text.match(new RegExp(JP.source, 'g')) || []).length;
    const enChars = (text.match(/[A-Za-z]/g) || []).length;
    const ja = jpChars > enChars;
    quiet(updateDoc(ref, { marks: ja ? [] : dictMarks(text), marksLang: ja ? 'ja' : 'en', marksStatus: 'done', marksError: '', marksVersion: MARKS_VERSION }));
  } catch (e) {
    // 辞書が読めない(オフライン)時は、次にネットにつながった時にやり直す
  } finally {
    running.delete(songId);
  }
}
