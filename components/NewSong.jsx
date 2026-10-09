import { useRef, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Camera, FileText, Image as ImageIcon, Plus, Save, ScanText, X } from 'lucide-react';
import { quiet, todayStr } from '../lib/utils';
import { fileToPayload, runMarksAnalysis, scanLyrics } from '../lib/ai';
import { DEFAULT_LAYOUT } from './InkSheet';

export default function NewSong({ db, student, lessonId, onBack, onDone }) {
  const [step, setStep] = useState('choose'); // choose | images | text
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [planned, setPlanned] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cameraRef = useRef(null);
  const pickRef = useRef(null);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    try {
      const converted = [];
      for (const f of files) converted.push(await fileToPayload(f));
      setImages((cur) => [...cur, ...converted]);
      setStep('images');
    } catch (e) {
      setError(`読み込めませんでした。別の画像やPDFでお試しください。(${e.message})`);
    }
  };

  const runScan = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await scanLyrics(images);
      if (!result.lyrics.trim()) {
        setError('歌詞を見つけられませんでした。歌詞全体がはっきり写るように撮り直してみてください。');
        return;
      }
      if (!title.trim() && result.title) setTitle(result.title);
      setLyrics(result.lyrics);
      setStep('text');
    } catch (e) {
      if (e.offline) setError('歌詞の読み取りにはネット接続が必要です。テザリングをオンにしてから、もう一度お試しください。');
      else setError(`読み取りに失敗しました。もう一度お試しいただくか、「テキストを貼り付け」をご利用ください。(${e.message})`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const sid = student.id;
    const today = todayStr();
    const songRef = doc(collection(db, 'students', sid, 'songs'));
    const t = title.trim();

    const cleanLyrics = lyrics.replace(/\r\n/g, '\n').trim();
    quiet(
      setDoc(songRef, {
        title: t,
        lyrics: cleanLyrics,
        plannedCount: Number(planned) > 0 ? Math.round(Number(planned)) : null,
        startedAt: today,
        finishedAt: null,
        layout: DEFAULT_LAYOUT,
        marks: [],
        marksStatus: 'pending',
        createdAt: serverTimestamp(),
      })
    );
    // 保存と同時に、裏側で注意マークを分析しておく(ネットがなければ後で自動)
    runMarksAnalysis(db, sid, songRef.id, cleanLyrics);
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

  const goBack = () => {
    if (busy) return;
    if (step === 'choose') onBack();
    else if (step === 'text' && images.length) setStep('images');
    else {
      setImages([]);
      setStep('choose');
    }
  };

  const hiddenInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  const thumbStrip = (removable) => (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
      {images.map((im, i) => (
        <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
          {im.pdfUrl ? (
            removable ? (
              <div
                style={{
                  height: 360, width: 260, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--paper)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                  padding: 16, textAlign: 'center', wordBreak: 'break-all',
                }}
              >
                <FileText size={56} color="var(--indigo)" />
                <span style={{ fontSize: 14, color: 'var(--sub)' }}>{im.name}</span>
              </div>
            ) : (
              <iframe
                src={im.pdfUrl}
                title={im.name}
                style={{ width: 'min(620px, 82vw)', height: 520, border: '1px solid var(--line)', borderRadius: 10, background: '#fff', display: 'block' }}
              />
            )
          ) : (
            <img
              src={im.preview}
              alt={`${i + 1}枚目`}
              style={{ height: removable ? 360 : 260, borderRadius: 10, border: '1px solid var(--line)', display: 'block' }}
            />
          )}
          <span
            style={{
              position: 'absolute', left: 8, top: 8, background: 'rgba(28,39,51,0.75)', color: '#fff',
              fontSize: 13, borderRadius: 6, padding: '2px 8px',
            }}
          >
            {i + 1}枚目
          </span>
          {removable && !busy && (
            <button
              onClick={() => {
                const next = images.filter((_, k) => k !== i);
                setImages(next);
                if (!next.length) setStep('choose');
              }}
              aria-label="この画像を外す"
              style={{
                position: 'absolute', right: 8, top: 8, width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)', border: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)',
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="page">
      {hiddenInputs}
      <header className="topbar">
        <button className="icon-btn" onClick={goBack} aria-label="戻る">
          <ArrowLeft size={24} />
        </button>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>{student.name}</div>
          <h1>新しい曲の読み込み</h1>
        </div>
      </header>

      <div className="page-body">
        {error && (
          <p className="error-text card" style={{ padding: 16, maxWidth: 860, margin: '0 auto 16px' }}>
            {error}
          </p>
        )}

        {step === 'choose' && (
          <div className="method-list">
            <p className="muted" style={{ textAlign: 'center', fontSize: 18, margin: '0 0 8px' }}>
              読み込み方法を選んでください
            </p>
            <button className="method" onClick={() => cameraRef.current && cameraRef.current.click()}>
              <Camera size={48} color="var(--indigo)" />
              写真を撮る
              <small>紙の歌詞から</small>
            </button>
            <button className="method" onClick={() => pickRef.current && pickRef.current.click()}>
              <ImageIcon size={48} color="var(--indigo)" />
              画像・PDFを選ぶ
              <small>保存してあるPDFやスクリーンショットから(複数も可)</small>
            </button>
            <button className="method" onClick={() => setStep('text')}>
              <FileText size={48} color="var(--indigo)" />
              テキストを貼り付け・入力
              <small>LINEなどで届いた歌詞から</small>
            </button>
          </div>
        )}

        {step === 'images' && (
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <p className="muted" style={{ marginTop: 0 }}>
              歌詞が複数の画像・PDFに分かれている場合は、ページ順に追加してください。
            </p>
            {thumbStrip(true)}
            <div style={{ display: 'flex', gap: 10, margin: '14px 0 24px', flexWrap: 'wrap' }}>
              <button className="btn" disabled={busy} onClick={() => cameraRef.current && cameraRef.current.click()}>
                <Plus size={18} /> 写真を追加
              </button>
              <button className="btn" disabled={busy} onClick={() => pickRef.current && pickRef.current.click()}>
                <Plus size={18} /> 画像・PDFを追加
              </button>
            </div>
            <button className="btn primary big" onClick={runScan} disabled={busy || !images.length}>
              <ScanText size={28} />
              {busy ? '歌詞を読み取っています…' : '歌詞を読み取る'}
            </button>
            {busy && (
              <p className="muted" style={{ textAlign: 'center' }}>
                10〜30秒ほどかかります。このままお待ちください。
              </p>
            )}
          </div>
        )}

        {step === 'text' && (
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            {images.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 14 }}>
                  元の画像・PDF(読み取り結果と見比べて、誤字や改行を整えてください)
                </p>
                {thumbStrip(false)}
              </div>
            )}
            <label className="field">
              <span>曲名</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="曲名を入力" style={{ fontSize: 22 }} />
            </label>
            <label className="field">
              <span>回数(この曲を何回で仕上げるか・あとで変更できます)</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" inputMode="numeric" min="1" max="30" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="例: 6" style={{ fontSize: 22, width: 120 }} />
                <span style={{ fontSize: 18 }}>回</span>
              </span>
            </label>
            <label className="field">
              <span>{images.length ? '読み取った歌詞(確認・修正)' : '歌詞(貼り付けてから、改行や誤字を整えてください)'}</span>
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
