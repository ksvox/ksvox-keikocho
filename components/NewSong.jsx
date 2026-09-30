import { useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Camera, FileText, Image as ImageIcon, Save } from 'lucide-react';
import { quiet, todayStr } from '../lib/utils';

export default function NewSong({ db, student, lessonId, onBack, onDone }) {
  const [step, setStep] = useState('choose');
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');

  const save = () => {
    const sid = student.id;
    const today = todayStr();
    const songRef = doc(collection(db, 'students', sid, 'songs'));
    const t = title.trim();

    quiet(
      setDoc(songRef, {
        title: t,
        lyrics: lyrics.replace(/\r\n/g, '\n').trim(),
        startedAt: today,
        finishedAt: null,
        createdAt: serverTimestamp(),
      })
    );
    if (student.currentSongId) {
      quiet(updateDoc(doc(db, 'students', sid, 'songs', student.currentSongId), { switchedAt: today }));
    }
    quiet(updateDoc(doc(db, 'students', sid), { currentSongId: songRef.id }));

    let lid = lessonId;
    if (lid) {
      quiet(updateDoc(doc(db, 'students', sid, 'lessons', lid), { songId: songRef.id, songTitle: t }));
    } else {
      const lessonRef = doc(collection(db, 'students', sid, 'lessons'));
      lid = lessonRef.id;
      quiet(
        setDoc(lessonRef, {
          date: today,
          songId: songRef.id,
          songTitle: t,
          routines: {},
          readingTask: '',
          createdAt: serverTimestamp(),
        })
      );
    }
    onDone(lid);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={step === 'choose' ? onBack : () => setStep('choose')} aria-label="戻る">
          <ArrowLeft size={24} />
        </button>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>{student.name}</div>
          <h1>新しい曲の読み込み</h1>
        </div>
      </header>

      <div className="page-body">
        {step === 'choose' ? (
          <div className="method-list">
            <p className="muted" style={{ textAlign: 'center', fontSize: 18, margin: '0 0 8px' }}>
              読み込み方法を選んでください
            </p>
            <button className="method soon" disabled>
              <Camera size={48} color="var(--indigo)" />
              写真を撮る
              <small>紙の歌詞から(準備中:次の段階で追加します)</small>
            </button>
            <button className="method soon" disabled>
              <ImageIcon size={48} color="var(--indigo)" />
              画像を選ぶ
              <small>タブレットのスクリーンショットなどから(準備中)</small>
            </button>
            <button className="method" onClick={() => setStep('text')}>
              <FileText size={48} color="var(--indigo)" />
              テキストを貼り付け・入力
              <small>LINEなどで届いた歌詞から</small>
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <label className="field">
              <span>曲名</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="曲名を入力" style={{ fontSize: 22 }} />
            </label>
            <label className="field">
              <span>歌詞(貼り付けてから、改行や誤字を整えてください)</span>
              <textarea className="lyrics-input" value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
            </label>
            <button className="btn primary big" onClick={save} disabled={!title.trim() || !lyrics.trim()}>
              <Save size={26} /> 保存してお稽古を始める
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
