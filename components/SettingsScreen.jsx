import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { ArrowDown, ArrowLeft, ArrowUp, LogOut, Plus, Trash2 } from 'lucide-react';
import { newId, quiet } from '../lib/utils';

// 入力中は画面を書き換えず、入力欄から離れた時に保存する欄
function EditText({ value, onSave, placeholder, style }) {
  const [v, setV] = useState(value || '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value || '');
  }, [value]);
  return (
    <input
      value={v}
      placeholder={placeholder}
      style={style}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        focused.current = false;
        const t = v.trim();
        if (t && t !== value) onSave(t);
        else setV(value || '');
      }}
    />
  );
}

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// 生徒と、その生徒のすべての記録(お稽古・課題曲・書き込み)を削除する
async function deleteStudentCompletely(db, sid) {
  const songs = await getDocs(collection(db, 'students', sid, 'songs'));
  for (const s of songs.docs) {
    const ink = await getDocs(collection(db, 'students', sid, 'songs', s.id, 'ink'));
    ink.docs.forEach((d) => quiet(deleteDoc(d.ref)));
    quiet(deleteDoc(s.ref));
  }
  const lessons = await getDocs(collection(db, 'students', sid, 'lessons'));
  lessons.docs.forEach((d) => quiet(deleteDoc(d.ref)));
  quiet(deleteDoc(doc(db, 'students', sid)));
}

export default function SettingsScreen({ db, auth, user, settings, students, onBack }) {
  const ref = doc(db, 'settings', 'main');
  const save = (patch) => quiet(setDoc(ref, { ...settings, ...patch }));

  const classes = settings.classes || [];
  const cats = settings.routineCategories || [];
  const tasks = settings.readingTasks || [];
  const archived = students.filter((s) => s.archived);

  const setCats = (next) => save({ routineCategories: next });
  const updateCat = (ci, patch) => setCats(cats.map((c, i) => (i === ci ? { ...c, ...patch } : c)));

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="名簿に戻る">
          <ArrowLeft size={24} />
        </button>
        <h1>設定</h1>
      </header>

      <div className="page-body" style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
        {/* クラス */}
        <section className="settings-section">
          <h2>クラス</h2>
          <div className="card">
            {classes.map((c, i) => (
              <div key={c + i} className="edit-row">
                <EditText
                  value={c}
                  onSave={(t) => {
                    const next = classes.slice();
                    next[i] = t;
                    save({ classes: next });
                    students
                      .filter((s) => s.className === c)
                      .forEach((s) => quiet(updateDoc(doc(db, 'students', s.id), { className: t })));
                  }}
                />
                <button className="mini-btn" onClick={() => save({ classes: move(classes, i, -1) })} aria-label="上へ"><ArrowUp size={18} /></button>
                <button className="mini-btn" onClick={() => save({ classes: move(classes, i, 1) })} aria-label="下へ"><ArrowDown size={18} /></button>
                <button
                  className="mini-btn del"
                  aria-label="削除"
                  onClick={() => {
                    const n = students.filter((s) => s.className === c && !s.archived).length;
                    const msg = n
                      ? `「${c}」には${n}人の生徒がいます。削除すると、その生徒は「クラス未設定」として表示されます。削除しますか?`
                      : `「${c}」を削除しますか?`;
                    if (window.confirm(msg)) save({ classes: classes.filter((_, k) => k !== i) });
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button className="dashed-btn" onClick={() => save({ classes: [...classes, `新しいクラス${classes.length + 1}`] })}>
              <Plus size={16} style={{ verticalAlign: 'middle' }} /> クラスを追加
            </button>
          </div>
        </section>

        {/* ルーティン */}
        <section className="settings-section">
          <h2>ルーティン</h2>
          <div className="card">
            {cats.map((cat, ci) => (
              <div key={cat.id} className="cat-box">
                <div className="edit-row cat-head">
                  <EditText value={cat.name} onSave={(t) => updateCat(ci, { name: t })} />
                  <button className="mini-btn" onClick={() => setCats(move(cats, ci, -1))} aria-label="上へ"><ArrowUp size={18} /></button>
                  <button className="mini-btn" onClick={() => setCats(move(cats, ci, 1))} aria-label="下へ"><ArrowDown size={18} /></button>
                  <button
                    className="mini-btn del"
                    aria-label="分類を削除"
                    onClick={() => {
                      if (window.confirm(`分類「${cat.name}」と、その中の項目をすべて削除しますか?\n(過去の記録のチェックは表示されなくなります)`)) {
                        setCats(cats.filter((_, k) => k !== ci));
                      }
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="cat-items">
                  {(cat.items || []).map((it, ii) => (
                    <div key={it.id} className="edit-row">
                      <EditText
                        value={it.name}
                        onSave={(t) => updateCat(ci, { items: cat.items.map((x, k) => (k === ii ? { ...x, name: t } : x)) })}
                      />
                      {it.type === 'reading' && <span className="type-tag">課題選択</span>}
                      <button className="mini-btn" onClick={() => updateCat(ci, { items: move(cat.items, ii, -1) })} aria-label="上へ"><ArrowUp size={18} /></button>
                      <button className="mini-btn" onClick={() => updateCat(ci, { items: move(cat.items, ii, 1) })} aria-label="下へ"><ArrowDown size={18} /></button>
                      <button
                        className="mini-btn del"
                        aria-label="項目を削除"
                        onClick={() => {
                          if (window.confirm(`「${it.name}」を削除しますか?`)) {
                            updateCat(ci, { items: cat.items.filter((_, k) => k !== ii) });
                          }
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="link-btn"
                    onClick={() =>
                      updateCat(ci, { items: [...(cat.items || []), { id: newId('r'), name: '新しい項目', type: 'check' }] })
                    }
                  >
                    + 項目を追加
                  </button>
                </div>
              </div>
            ))}
            <button className="dashed-btn" onClick={() => setCats([...cats, { id: newId('c'), name: '新しい分類', items: [] }])}>
              <Plus size={16} style={{ verticalAlign: 'middle' }} /> 分類を追加
            </button>
          </div>
        </section>

        {/* 朗読課題 */}
        <section className="settings-section">
          <h2>朗読課題</h2>
          <div className="card">
            {tasks.map((t, i) => (
              <div key={t + i} className="edit-row">
                <span className="num">{i + 1}.</span>
                <EditText
                  value={t}
                  onSave={(v) => {
                    const next = tasks.slice();
                    next[i] = v;
                    save({ readingTasks: next });
                  }}
                />
                <button className="mini-btn" onClick={() => save({ readingTasks: move(tasks, i, -1) })} aria-label="上へ"><ArrowUp size={18} /></button>
                <button className="mini-btn" onClick={() => save({ readingTasks: move(tasks, i, 1) })} aria-label="下へ"><ArrowDown size={18} /></button>
                <button
                  className="mini-btn del"
                  aria-label="削除"
                  onClick={() => window.confirm(`「${t}」を削除しますか?`) && save({ readingTasks: tasks.filter((_, k) => k !== i) })}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <button className="dashed-btn" onClick={() => save({ readingTasks: [...tasks, '新しい課題'] })}>
              <Plus size={16} style={{ verticalAlign: 'middle' }} /> 課題を追加
            </button>
          </div>
        </section>

        {/* 名簿から外した生徒 */}
        {archived.length > 0 && (
          <section className="settings-section">
            <h2>名簿から外した生徒</h2>
            <div className="card">
              {archived.map((s) => (
                <div key={s.id} className="edit-row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 17 }}>
                    {s.name}
                    <span className="muted" style={{ fontSize: 14, marginLeft: 8 }}>{s.className}</span>
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn outline" onClick={() => quiet(updateDoc(doc(db, 'students', s.id), { archived: false }))}>
                      名簿に戻す
                    </button>
                    <button
                      className="btn danger"
                      onClick={async () => {
                        if (!window.confirm(`${s.name}さんを完全に削除しますか?\nお稽古の記録・課題曲・書き込みがすべて消え、元に戻せません。`)) return;
                        if (!window.confirm('本当に削除してよろしいですか?(最終確認)')) return;
                        try {
                          await deleteStudentCompletely(db, s.id);
                        } catch (e) {
                          window.alert('削除できませんでした。ネット接続を確認して、もう一度お試しください。');
                        }
                      }}
                    >
                      <Trash2 size={18} /> 完全に削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* アカウント */}
        <section className="settings-section">
          <h2>アカウント</h2>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>ログイン中: {user ? user.email : ''}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={async () => {
                  if (!user) return;
                  if (!window.confirm('パスワード変更用のメールを送りますか?')) return;
                  try {
                    await sendPasswordResetEmail(auth, user.email);
                    window.alert('パスワード変更用のメールを送りました。メールのリンクから新しいパスワードを設定してください。');
                  } catch (e) {
                    window.alert('送信できませんでした。ネット接続を確認してください。');
                  }
                }}
              >
                パスワードを変更
              </button>
              <button
                className="btn danger"
                onClick={() => window.confirm('ログアウトしますか?\n再度ログインするにはネット接続が必要です。') && signOut(auth)}
              >
                <LogOut size={18} /> ログアウト
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
