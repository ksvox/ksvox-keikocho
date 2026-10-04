import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Link2 } from 'lucide-react';
import Modal from './Modal';
import { callMontei, memberLabel } from '../lib/montei';
import { quiet } from '../lib/utils';

// 生徒フォルダ: 門弟アプリの会員と結びつける
export default function MonteiLink({ db, student }) {
  const [open, setOpen] = useState(false);
  const linked = !!student.monteiEmail;
  return (
    <>
      <div className="card" style={{ padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link2 size={18} color="var(--indigo)" />
        <span style={{ fontSize: 15 }}>門弟アプリ:</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: linked ? 'var(--ink)' : 'var(--sub)', flex: 1, minWidth: 0 }}>
          {linked ? student.monteiName || student.monteiEmail : '未連携'}
        </span>
        <button className="link-btn" onClick={() => setOpen(true)}>{linked ? '変更' : '連携する'}</button>
      </div>
      {open && <LinkPicker db={db} student={student} onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkPicker({ db, student, onClose }) {
  const [members, setMembers] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    callMontei('members').then((d) => setMembers(d.members || [])).catch((e) => { setErr(e.message); setMembers([]); });
  }, []);

  const pick = (m) => {
    quiet(updateDoc(doc(db, 'students', student.id), { monteiEmail: m ? m.email : null, monteiName: m ? memberLabel(m) : null }));
    onClose();
  };

  const k = q.trim().toLowerCase();
  const list = (members || []).filter((m) => !k || [m.realName, m.nickname, m.email, m.memo].some((x) => (x || '').toLowerCase().includes(k)));

  return (
    <Modal title={`${student.name} 殿を門弟アプリの会員と結びつける`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>門弟アプリの会員一覧から、この生徒を選んでください。</p>
      {err && <p className="error-text">{err}</p>}
      {members === null ? (
        <p className="muted">会員一覧を読み込み中…</p>
      ) : (
        <>
          <input placeholder="名前・ニックネーム・メールで検索" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
          <div style={{ maxHeight: '45vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
            {list.length === 0 && <p className="muted" style={{ padding: 14, margin: 0 }}>該当する会員がいません。</p>}
            {list.map((m) => (
              <button key={m.email} onClick={() => pick(m)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', borderBottom: '1px solid var(--line)', background: student.monteiEmail === m.email ? 'var(--ground)' : 'transparent' }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {memberLabel(m)}
                  {m.className && <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>{m.className}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{m.email}{!m.realName && !m.nickname ? '(プロフィール未登録)' : ''}</div>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="modal-actions" style={{ marginTop: 16 }}>
        {student.monteiEmail && <button className="btn danger" onClick={() => window.confirm('連携を解除しますか?') && pick(null)}>連携を解除</button>}
        <button className="btn" onClick={onClose}>閉じる</button>
      </div>
    </Modal>
  );
}
