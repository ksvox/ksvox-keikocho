// 英語歌唱メソッドの歌詞メモ(AIは使わず、発音辞書と決まりごとで判定する)
// 印: as/ae=アクセントのある母音(赤) b=内容語(太字) l=次の語とリンキング(波線) h=難しい単語(マーカー) i=熟語・慣用句のまとまり(下線)
import { DEFAULT_IDIOMS } from './idioms';

let DICT = null;
export async function loadDict() {
  if (DICT) return DICT;
  const r = await fetch('/dict/en.txt');
  if (!r.ok) throw new Error('発音辞書を読み込めませんでした');
  const m = new Map();
  (await r.text()).split('\n').forEach((row) => { const sp = row.indexOf(' '); if (sp > 0) m.set(row.slice(0, sp), row.slice(sp + 1).trim()); });
  DICT = m;
  return m;
}

const clean = (s) => String(s || '').toLowerCase().replace(/[’‘`]/g, "'");

// 語の中身(前後の記号を除いた部分)と、その位置
export function coreOf(raw) {
  const s = String(raw || '').replace(/[’‘`]/g, "'");
  const m = s.match(/[A-Za-z](?:[A-Za-z']*[A-Za-z])?'?/);
  if (!m) return null;
  return { core: m[0].toLowerCase(), at: m.index };
}

function look(core) {
  if (!DICT || !core) return null;
  const tries = [core, core.replace(/^'/, ''), core.replace(/in'$/, 'ing'), core.replace(/'$/, ''), core.replace(/'s$/, '')];
  for (const w of tries) {
    const c = DICT.get(w);
    if (c) return { syl: +c[0], st: +c[1], first: c[2], last: c[3], hard: c.includes('h') };
  }
  return null;
}

// 綴りの母音のまとまり(y は語頭なら子音扱い)
function vowelGroups(core) {
  const out = []; const re = /[aeiouy]+/g; let m;
  while ((m = re.exec(core))) {
    let s = m.index; const e = s + m[0].length;
    if (s === 0 && core[0] === 'y') { if (e - s === 1) continue; s += 1; }
    out.push([s, e]);
  }
  return out;
}

// アクセントのある母音の位置(語の中の文字番号)
export function stressRange(core, inf) {
  let g = vowelGroups(core);
  if (!g.length) return null;
  const syl = inf ? inf.syl : g.length;
  const st = inf ? inf.st : 0;
  const n = core.length;
  // 語末の発音しない e / es / ed
  if (g.length > syl) {
    const last = g[g.length - 1];
    const isLe = /[^aeiouy]le$/.test(core);
    if (last[0] === n - 1 && core[n - 1] === 'e' && !isLe) g = g.slice(0, -1);
    else if (last[0] === n - 2 && core[n - 2] === 'e' && /[sd]$/.test(core)) g = g.slice(0, -1);
  }
  let idx = g.length === syl ? st : Math.round((st * (g.length - 1)) / Math.max(1, syl - 1));
  idx = Math.max(0, Math.min(g.length - 1, idx));
  return g[idx];
}

// 指定の文字を含む母音のまとまり(管理画面の手直し用)
export function groupAt(raw, x) {
  const c = coreOf(raw);
  if (!c) return [x, x + 1];
  const g = vowelGroups(c.core).find(([s, e]) => x >= c.at + s && x < c.at + e);
  return g ? [c.at + g[0], c.at + g[1]] : [x, x + 1];
}

// ---- 内容語の判定 ----
const FUNC = new Set(`a an the i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its itself we us our ours ourselves they them their theirs themselves
am is are was were be been being have has had having do does did will would shall should can could may might must
i'm i've i'll i'd you're you've you'll you'd he's he'll he'd she's she'll she'd it's it'll we're we've we'll we'd they're they've they'll they'd that's there's here's let's
in on at to for of with by from into onto upon about as than like through over under up down out off around across along against between among within without till until
and but or so nor if when while because cause 'cause though although that which then there
gonna wanna gotta oh ooh ah ahh uh yeah hey whoa woah na la da mmm mm hmm ha`.split(/\s+/));
const NEG = new Set(`not no never nothing nobody none nowhere don't won't can't cannot isn't aren't wasn't weren't couldn't shouldn't wouldn't didn't doesn't haven't hasn't hadn't ain't mustn't`.split(/\s+/));
const LIKE_NEXT = new Set('a an the my your his her our their this that these those me you him us them it what i'.split(' '));
const CONTENT_FN = new Set('what where who why how this these those'.split(' ')); // 疑問詞・指示語は内容語

function isContent(core, next, raw, lineWords) {
  if (NEG.has(core) || CONTENT_FN.has(core)) return true;
  if (core === 'can') return false; // can は肯定では内容語にしない(否定形は上で内容語)
  if (core === 'yes') { // 文中でない単独の yes はリズム取り
    const alone = /[,!.?]$/.test(raw) || !next || lineWords.every((w) => w === 'yes');
    return !alone;
  }
  if (core === 'like') return !(next && LIKE_NEXT.has(next));
  if (FUNC.has(core)) return false;
  if (/^(na|la|da|oh|ooh|ah|whoa|woah|uh|mm)+$/.test(core)) return false;
  return true;
}

// ---- 熟語・慣用句 ----
const IRR = {
  be: 'am is are was were been being', fall: 'fell fallen', give: 'gave given', take: 'took taken', come: 'came', go: 'went gone goes', get: 'got gotten',
  hold: 'held', run: 'ran', break: 'broke broken', make: 'made', keep: 'kept', find: 'found', feel: 'felt', lose: 'lost', leave: 'left', hang: 'hung',
  stand: 'stood', catch: 'caught', bring: 'brought', think: 'thought', fight: 'fought', shine: 'shone', light: 'lit', rise: 'rose risen', wake: 'woke woken',
  tell: 'told', say: 'said', see: 'saw seen', know: 'knew known', fly: 'flew flown', burn: 'burnt', dream: 'dreamt', hear: 'heard', begin: 'began begun',
  sing: 'sang sung', throw: 'threw thrown', tear: 'tore torn', drive: 'drove driven', ride: 'rode ridden', write: 'wrote written', speak: 'spoke spoken',
  steal: 'stole stolen', choose: 'chose chosen', forget: 'forgot forgotten', freeze: 'froze frozen', grow: 'grew grown', blow: 'blew blown', draw: 'drew drawn',
  sleep: 'slept', send: 'sent', spend: 'spent', build: 'built', bend: 'bent', meet: 'met', lead: 'led', win: 'won', sit: 'sat',
  have: 'has had', do: 'does did done', buy: 'bought', pay: 'paid', lay: 'laid', lie: 'lay lain lying', die: 'dying', dig: 'dug',
  shake: 'shook shaken', strike: 'struck', stick: 'stuck', hide: 'hid hidden', slide: 'slid', swear: 'swore sworn', wear: 'wore worn'
};
function verbForms(v) {
  const f = new Set([v, v + 's', v + 'es', v + 'ed', v + 'd', v + 'ing', v + "in'"]);
  if (v.endsWith('e')) { f.add(v.slice(0, -1) + 'ing'); f.add(v.slice(0, -1) + "in'"); }
  if (/[^aeiou][aeiou][bdgmnprt]$/.test(v)) { const d = v + v.slice(-1); f.add(d + 'ing'); f.add(d + 'ed'); f.add(d + "in'"); }
  if (/[^aeiou]y$/.test(v)) { f.add(v.slice(0, -1) + 'ies'); f.add(v.slice(0, -1) + 'ied'); }
  (IRR[v] || '').split(' ').filter(Boolean).forEach((x) => f.add(x));
  return f;
}
const POSS = new Set('my your his her our their its'.split(' '));

let idiomCache = { src: null, pats: [] };
// 一覧の書き方: 1行に1つ。動詞は原形で(fell / falling なども自動で拾う)。* は「どんな1語でも」、~ は「my/your/his…」
export function parseIdioms(text) {
  const src = text == null || text === '' ? DEFAULT_IDIOMS : text;
  if (idiomCache.src === src) return idiomCache.pats;
  const pats = [];
  src.split(/\r?\n/).forEach((row) => {
    const s = clean(row).replace(/#.*$/, '').trim();
    if (!s) return;
    const ws = s.split(/\s+/);
    if (ws.length < 2) return;
    pats.push(ws.map((w, k) => {
      if (w === '*') return { any: true };
      if (w === '~') return { set: POSS };
      return { set: k === 0 ? verbForms(w) : new Set([w]) };
    }));
  });
  pats.sort((a, b) => b.length - a.length);
  idiomCache = { src, pats };
  return pats;
}

// ---- 1行を分析 ----
export function analyzeLine(text, pats) {
  const raws = String(text || '').split(/\s+/).filter(Boolean);
  const toks = raws.map((t) => ({ t }));
  const cores = raws.map((r) => { const c = coreOf(r); return c ? c.core : ''; });
  const words = cores.filter(Boolean);
  // 熟語(長いものから先に)
  let gid = 0;
  for (const p of pats) {
    for (let k = 0; k + p.length <= toks.length; k++) {
      let ok = true;
      for (let j = 0; j < p.length; j++) {
        const c = cores[k + j];
        if (!c || toks[k + j].i || (j < p.length - 1 && /[,.!?;:]$/.test(raws[k + j]))) { ok = false; break; }
        if (!p[j].any && !p[j].set.has(c)) { ok = false; break; }
      }
      if (ok) { gid++; for (let j = 0; j < p.length; j++) toks[k + j].i = gid; k += p.length - 1; }
    }
  }
  toks.forEach((tk, k) => {
    const c = coreOf(tk.t); if (!c) return;
    const inf = look(c.core);
    const syl = inf ? inf.syl : vowelGroups(c.core).length;
    if (syl >= 2) { // アクセントは2音節以上の語のみ
      const r = stressRange(c.core, inf);
      if (r) { tk.as = c.at + r[0]; tk.ae = c.at + r[1]; }
    }
    if (isContent(c.core, cores[k + 1], tk.t, words)) tk.b = 1;
    if (inf && inf.hard) tk.h = 1;
    // リンキング(子音で終わる語 → 母音で始まる語)
    const nx = toks[k + 1];
    if (nx && !/[,.!?;:)\]—–-]$/.test(tk.t)) {
      const nc = coreOf(nx.t);
      if (nc && nc.at === 0) {
        const ni = look(nc.core);
        const lastC = inf ? (inf.last === 'C' || inf.last === 'R') : /[^aeiouy]$/.test(c.core);
        const firstV = ni ? ni.first === 'V' : /^[aeiou]/.test(nc.core);
        if (lastC && firstV) tk.l = 1;
      }
    }
  });
  return toks;
}

export async function analyzeLines(lines, idiomText) {
  await loadDict();
  const pats = parseIdioms(idiomText);
  return (lines || []).map((l) => ({ w: analyzeLine(l.text, pats) }));
}

// 歌詞が変わったか確かめるための文字
export const memoSource = (lines) => (lines || []).map((l) => l.text).join('\n');

// ---- ホワイトボードの楽段(同じ歌詞の繰り返しは1つにまとめ、歌詞が違えば「Pre-Chorus 2」のように番号を付ける)----
const nk = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function memoSections(lines) {
  const secs = []; let cur = null;
  (lines || []).forEach((l, i) => {
    if (l.start || !cur) { cur = { name: (l.sec || '').trim(), idx: [] }; secs.push(cur); }
    cur.idx.push(i);
  });
  const seen = new Map(); const out = [];
  secs.forEach((s) => {
    const base = s.name || 'Lyrics';
    const key = s.idx.map((i) => nk(lines[i].text)).join('|');
    if (!seen.has(base)) seen.set(base, []);
    const v = seen.get(base);
    if (v.includes(key)) return;
    v.push(key);
    out.push({ label: v.length > 1 ? `${base} ${v.length}` : base, idx: s.idx });
  });
  return out;
}

// 文字ごとの見た目(ホワイトボード・管理画面で共通)
export function lineChars(tokens) {
  const out = [];
  let waveIn = false; // 前の語から波線がつながっている
  (tokens || []).forEach((tk, k) => {
    const nx = tokens[k + 1];
    const c = coreOf(tk.t);
    const cs = c ? c.at : 0; const ce = c ? c.at + c.core.replace(/'$/, '').length : tk.t.length;
    const sameIdiom = !!(tk.i && nx && nx.i === tk.i);
    const wave = !!(tk.l && nx && !sameIdiom); // 熟語の中のリンキングは波線を出さない
    for (let x = 0; x < tk.t.length; x++) {
      const w = (wave && x === ce - 1) || (waveIn && x === cs);
      out.push({
        ch: tk.t[x], k, c: x,
        r: tk.as != null && x >= tk.as && x < tk.ae,
        b: !!tk.b && x >= cs && x < ce,
        h: !!tk.h && x >= cs && x < ce,
        u: !!tk.i && !w,
        w
      });
    }
    if (nx) out.push({ ch: ' ', k, c: -1, u: sameIdiom, w: wave });
    waveIn = wave;
  });
  return out;
}

export function charStyle(o) {
  const st = {};
  if (o.r) st.color = '#d0342c';
  if (o.b) st.fontWeight = 700;
  if (o.h) st.background = 'linear-gradient(transparent 55%, rgba(255,226,40,.85) 55%)';
  if (o.u || o.w) {
    st.textDecorationLine = 'underline';
    st.textDecorationStyle = o.w ? 'wavy' : 'solid';
    st.textDecorationColor = o.w ? '#1f8a4c' : '#2d3a8c';
    st.textDecorationThickness = o.w ? '1.5px' : '2px';
    st.textUnderlineOffset = o.w ? '6px' : '5px';
    st.textDecorationSkipInk = 'none';
  }
  return st;
}

// 同じ見た目の文字をまとめる(生徒画面用)
export function groupChars(chars) {
  const out = [];
  chars.forEach((o) => {
    const key = `${o.r}${o.b}${o.h}${o.u}${o.w}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.text += o.ch; else out.push({ key, text: o.ch, o });
  });
  return out;
}

export const LEGEND = [
  { label: 'アクセント', o: { r: true }, sample: 'a' },
  { label: '内容語', o: { b: true }, sample: 'Word' },
  { label: 'リンキング', o: { w: true }, sample: 'ーー' },
  { label: '難しい単語', o: { h: true }, sample: 'Word' },
  { label: '熟語・慣用句', o: { u: true }, sample: 'ーー' }
];
