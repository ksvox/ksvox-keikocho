import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import Modal from './Modal';
import { callMontei } from '../lib/montei';
import { formatDate, quiet } from '../lib/utils';

const SECTIONS = [['done', '今日やったこと'], ['good', 'できたこと'], ['issues', '課題'], ['next', '次回・宿題']];

// お稽古画面: 振り返りを門弟アプリに送る
export function SendReviewButton({ student, lesson, online, onOpen }) {
  const sent = lesson.monteiSentAt;
  const sentText = sent?.seconds ? new Date(sent.seconds * 1000).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
      <button className={`btn ${sent ? 'outline' : 'primary'}`} disabled={!online} onClick={onOpen}>
        {sent ? '門弟アプリにもう一度送る' : '門弟アプリに送る'}
      </button>
      {sent && <span className="muted" style={{ fontSize: 14 }}>✓ 送信済み{sentText ? `(${sentText})` : ''}</span>}
      {!online && <span className="muted" style={{ fontSize: 14 }}>送信にはネット接続が必要です</span>}
      {!student.monteiEmail && <span className="muted" style={{ fontSize: 14 }}>※先に生徒フォルダで門弟アプリと連携してください</span>}
    </div>
  );
}

export function SendReviewModal({ db, student, lesson, lessonRef, onClose }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    SECTIONS.forEach(([k]) => { d[k] = ((lesson.summary && lesson.summary[k]) || []).join('\n'); });
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!student.monteiEmail) {
    return (
      <Modal title="門弟アプリに送る" onClose={onClose}>
        <p>{student.name} 殿は、まだ門弟アプリと連携していません。生徒フォルダの「門弟アプリ:連携する」から会員を選んでください。</p>
        <div className="modal-actions"><button className="btn" onClick={onClose}>閉じる</button></div>
      </Modal>
    );
  }

  const send = async () => {
    setBusy(true);
    setErr('');
    const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
    try {
      await callMontei('send', {
        email: student.monteiEmail,
        date: lesson.date,
        lessonKey: `${student.id}_${lesson.id}`,
        songTitle: lesson.songTitle || '',
        done: lines(draft.done),
        good: lines(draft.good),
        issues: lines(draft.issues),
        next: lines(draft.next),
      });
      quiet(updateDoc(lessonRef, { monteiSentAt: serverTimestamp() }));
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal title="門弟アプリに送る" onClose={() => !busy && onClose()}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        送り先: <strong style={{ color: 'var(--ink)' }}>{student.monteiName || student.monteiEmail}</strong><br />
        {formatDate(lesson.date)}・{lesson.songTitle || '(課題曲なし)'}<br />
        内容は送る前に手直しできます(1行が箇条書きの1項目になります)。
      </p>
      {SECTIONS.map(([k, label]) => (
        <label key={k} className="field">
          <span>{label}</span>
          <textarea value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} style={{ minHeight: 80, lineHeight: 1.6, fontSize: 17 }} />
        </label>
      ))}
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={onClose}>キャンセル</button>
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? '送信中…' : 'この内容で送る'}</button>
      </div>
    </Modal>
  );
}
