import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { BookOpen, ChevronRight, Pencil, Settings, UserPlus } from 'lucide-react';
import Modal from './Modal';
import { quiet } from '../lib/utils';

export default function Roster({ db, students, settings, online, onSelect, onSettings }) {
  const [adding, setAdding] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null);

  const active = students.filter((s) => !s.archived).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
  const classes = settings.classes || [];
  const unclassified = active.filter((s) => !classes.includes(s.className));

  const groups = classes.map((c) => ({ name: c, list: active.filter((s) => s.className === c) }));
  if (unclassified.length) groups.push({ name: '(クラス未設定)', list: unclassified });

  return (
    <div className="page">
      <header className="topbar">
        <h1 style={{ color: 'var(--indigo)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={28} /> 名簿
        </h1>
        <span className={`net ${online ? '' : 'off'}`}>
          <i />
          {online ? 'オンライン' : 'オフライン(iPadに保存し、接続時に送信)'}
        </span>
        <div className="spacer" />
        <button className={`btn ${editMode ? 'primary' : ''}`} onClick={() => setEditMode(!editMode)}>
          {editMode ? '編集を終える' : '編集'}
        </button>
        <button className="btn outline" onClick={() => setAdding(true)}>
          <UserPlus size={20} /> 生徒を追加
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="設定">
          <Settings size={24} />
        </button>
      </header>

      <div className="page-body">
        {active.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontSize: 20, margin: '0 0 8px' }}>まだ生徒が登録されていません</p>
            <p className="muted" style={{ margin: 0 }}>右上の「生徒を追加」から、クラスと名前を登録してください。</p>
          </div>
        )}
        {groups.map((g) =>
          g.list.length === 0 ? null : (
            <section key={g.name} className="class-block">
              <h2 className="class-title">{g.name}</h2>
              <div className="student-grid">
                {g.list.map((s) => (
                  <button
                    key={s.id}
                    className="student-card"
                    onClick={() => (editMode ? setEditing(s) : onSelect(s))}
                  >
                    <span>{s.name}</span>
                    {editMode ? <Pencil size={22} color="var(--indigo)" /> : <ChevronRight size={24} color="var(--sub)" />}
                  </button>
                ))}
              </div>
            </section>
          )
        )}
      </div>

      {adding && (
        <StudentForm
          title="生徒を追加"
          classes={classes}
          initial={{ name: '', className: classes[0] || '' }}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            quiet(
              addDoc(collection(db, 'students'), {
                name: v.name,
                className: v.className,
                currentSongId: null,
                archived: false,
                createdAt: serverTimestamp(),
              })
            );
            setAdding(false);
          }}
        />
      )}

      {editing && (
        <StudentForm
          title="生徒の情報を変更"
          classes={classes}
          initial={{ name: editing.name, className: editing.className }}
          onCancel={() => setEditing(null)}
          onSave={(v) => {
            quiet(updateDoc(doc(db, 'students', editing.id), { name: v.name, className: v.className }));
            setEditing(null);
          }}
          onArchive={() => {
            if (window.confirm(`${editing.name}さんを名簿から外しますか?\nお稽古の記録は残り、設定画面からいつでも名簿に戻せます。`)) {
              quiet(updateDoc(doc(db, 'students', editing.id), { archived: true }));
              setEditing(null);
            }
          }}
        />
      )}
    </div>
  );
}

function StudentForm({ title, classes, initial, onCancel, onSave, onArchive }) {
  const [name, setName] = useState(initial.name);
  const [className, setClassName] = useState(initial.className);
  return (
    <Modal title={title} onClose={onCancel}>
      <label className="field">
        <span>クラス</span>
        <select value={className} onChange={(e) => setClassName(e.target.value)}>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>名前</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 佐藤 健一" />
      </label>
      <div className="modal-actions">
        {onArchive && (
          <button className="btn danger" onClick={onArchive} style={{ marginRight: 'auto' }}>
            名簿から外す
          </button>
        )}
        <button className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button className="btn primary" disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), className })}>
          保存
        </button>
      </div>
    </Modal>
  );
}
