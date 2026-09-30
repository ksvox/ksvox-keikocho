const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const w = WEEK[new Date(y, m - 1, d).getDay()];
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}(${w})`;
}

export function newId(prefix = 'x') {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function allRoutineItems(settings) {
  const list = [];
  (settings?.routineCategories || []).forEach((c) => (c.items || []).forEach((it) => list.push(it)));
  return list;
}

// その日にやったルーティンを文章にまとめる(履歴のプレビュー用)
export function routineSummary(lesson, settings) {
  if (!lesson) return '';
  const names = [];
  allRoutineItems(settings).forEach((it) => {
    if (lesson.routines && lesson.routines[it.id]) {
      if (it.type === 'reading' && lesson.readingTask) names.push(`朗読課題「${lesson.readingTask}」`);
      else names.push(it.name);
    }
  });
  return names.join('、');
}

// 保存はオフラインでもiPadに即時記録され、接続時に自動送信される。
// 送信完了を待たずに画面を進めるため、結果は記録だけ残す。
export function quiet(promise) {
  if (promise && promise.catch) promise.catch((e) => console.warn('保存エラー:', e));
}
