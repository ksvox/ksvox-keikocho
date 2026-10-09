// 注意マークの種類と見た目(文字の位置を動かさないよう、下線と背景色だけで表す)
export const MARK_TYPES = {
  accent: { label: 'アクセント', color: '#d0342c', fg: '#d0342c', list: false },
  content: { label: '内容語', color: '#1e1e1e', stroke: true, list: false },
  idiom: { label: '熟語・慣用句', color: '#2d3a8c', underline: 'solid' },
  linking: { label: 'リンキング', color: '#1f8a4c', underline: 'wavy' },
  syllables: { label: 'カタカナとズレる語', color: '#B8922F', bg: 'rgba(184,146,47,0.20)' },
  difficult: { label: '難しい単語', color: '#C9A400', bg: 'rgba(255,226,40,0.55)' },
  bidakuon: { label: '鼻濁音', color: '#7B4FA0', underline: 'solid' },
  vowel3: { label: '同じ母音の連続', color: '#2E8B57', bg: 'rgba(46,139,87,0.16)' },
  onesyllable: { label: '2文字で1音節', color: '#D9772B', underline: 'dotted' },
  devoice: { label: '母音の無声化', color: '#5B6B7C', underline: 'wavy' },
};

export function markStyle(type) {
  const t = MARK_TYPES[type];
  if (!t) return {};
  if (t.fg) return { color: t.fg };
  if (t.stroke) return { WebkitTextStroke: '0.7px currentColor' }; // 太く見せても文字の幅は変わらない
  if (t.bg) return { background: t.bg, borderRadius: 3 };
  return {
    textDecorationLine: 'underline',
    textDecorationStyle: t.underline,
    textDecorationColor: t.color,
    textDecorationThickness: '2px',
    textUnderlineOffset: '5px',
  };
}

// 歌詞の各行に、マークの位置(文字の範囲)を割り当てる
export function layoutMarks(text, marks) {
  const lines = (text || '').split('\n');
  const perLine = lines.map(() => []);
  (marks || []).forEach((m, idx) => {
    if (!m || !m.text || !MARK_TYPES[m.type]) return;
    const tryLine = (li) => {
      const line = lines[li];
      if (line === undefined) return false;
      let from = 0;
      while (from <= line.length) {
        const pos = line.indexOf(m.text, from);
        if (pos < 0) return false;
        const end = pos + m.text.length;
        const clash = perLine[li].some((r) => pos < r.end && end > r.start);
        if (!clash) {
          perLine[li].push({ start: pos, end, type: m.type, idx });
          return true;
        }
        from = pos + 1;
      }
      return false;
    };
    if (typeof m.line === 'number' && tryLine(m.line)) return;
    for (let li = 0; li < lines.length; li += 1) if (tryLine(li)) return;
  });
  perLine.forEach((arr) => arr.sort((a, b) => a.start - b.start));
  return { lines, perLine };
}

// 1行を、重なった印もまとめて描くための区切り(文字ごとに印を重ね、同じ見た目を1つにまとめる)
const ORDER = ['difficult', 'content', 'accent', 'idiom', 'linking'];
export function markSegments(text, marks) {
  const lines = (text || '').split('\n');
  const per = lines.map((l) => Array.from({ length: l.length }, () => new Set()));
  const legacy = [];
  (marks || []).forEach((m) => {
    if (!m || !m.text || !MARK_TYPES[m.type]) return;
    const line = lines[m.line];
    if (typeof m.start === 'number' && line !== undefined && line.slice(m.start, m.start + m.text.length) === m.text) {
      for (let x = m.start; x < m.start + m.text.length; x++) per[m.line][x].add(m.type);
    } else legacy.push(m);
  });
  if (legacy.length) {
    const { perLine } = layoutMarks(text, legacy);
    perLine.forEach((rs, li) => rs.forEach((r) => { for (let x = r.start; x < r.end; x++) per[li][x].add(r.type); }));
  }
  return lines.map((line, li) => {
    const segs = [];
    for (let x = 0; x < line.length; x++) {
      const key = ORDER.filter((t) => per[li][x].has(t)).concat([...per[li][x]].filter((t) => !ORDER.includes(t))).join(',');
      const last = segs[segs.length - 1];
      if (last && last.key === key) last.text += line[x]; else segs.push({ key, text: line[x] });
    }
    return segs;
  });
}
export function comboStyle(key) {
  const st = {};
  const types = key ? key.split(',') : [];
  types.forEach((t) => {
    const s = markStyle(t);
    if (s.textDecorationLine && st.textDecorationLine && t !== 'linking') return; // 波線を優先
    Object.assign(st, s);
  });
  return st;
}
