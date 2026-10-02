// 注意マークの種類と見た目(文字の位置を動かさないよう、下線と背景色だけで表す)
export const MARK_TYPES = {
  linking: { label: 'リンキング', color: '#2F4F7A', underline: 'dotted' },
  syllables: { label: 'カタカナとズレる語', color: '#B8922F', bg: 'rgba(184,146,47,0.20)' },
  difficult: { label: '難しい単語', color: '#C2485A', underline: 'solid' },
  bidakuon: { label: '鼻濁音', color: '#7B4FA0', underline: 'solid' },
  vowel3: { label: '同じ母音の連続', color: '#2E8B57', bg: 'rgba(46,139,87,0.16)' },
  onesyllable: { label: '2文字で1音節', color: '#D9772B', underline: 'dotted' },
  devoice: { label: '母音の無声化', color: '#5B6B7C', underline: 'wavy' },
};

export function markStyle(type) {
  const t = MARK_TYPES[type];
  if (!t) return {};
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
