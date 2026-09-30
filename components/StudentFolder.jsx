import { useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowLeft, Bookmark, ChevronDown, ChevronRight, FileText, Play } from 'lucide-react';
import { useCollectionData } from '../lib/useFirestore';
import { formatDate, quiet, routineSummary, todayStr } from '../lib/utils';

export default function StudentFolder({ db, student, settings, onBack, onOpenLesson, onNewSong, onViewSong }) {
  const [showPast, setShowPast] = useState(false);
  const sid = student.id;
  const songs = useCollectionData(collection(db, 'students', sid, 'songs'), [sid]);
  const lessons = useCollectionData(collection(db, 'students', sid, 'lessons'), [sid]);

  if (songs === undefined || lessons === undefined) {
    return <div className="center-screen muted">読み込み中…</div>;
  }

  const today = todayStr();
  const sortedLessons = [...lessons].sort((a, b) =>
    a.date === b.date ? (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) : a.date < b.date ? 1 : -1
  );
  const todayLesson = sortedLessons.find((l) => l.date === today);
  const currentSong = student.currentSongId ? songs.find((s) => s.id === student.currentSongId) : null;
  const songLessonCount = currentSong ? lessons.filter((l) => l.songId === currentSong.id).length : 0;
  const nthToday = currentSong ? (todayLesson && todayLesson.songId === currentSong.id ? songLessonCount : songLessonCount + 1) : 0;

  const pastSongs = songs
    .filter((s) => s.id !== student.currentSongId)
    .sort((a, b) => ((a.startedAt || '') < (b.startedAt || '') ? 1 : -1));

  const startToday = () => {
    if (todayLesson) {
      onOpenLesson(todayLesson.id);
      return;
    }
    const ref = doc(collection(db, 'students', sid, 'lessons'));
    quiet(
      setDoc(ref, {
        date: today,
        songId: currentSong ? currentSong.id : null,
        songTitle: currentSong ? currentSong.title : '',
        routines: {},
        readingTask: '',
        createdAt: serverTimestamp(),
      })
    );
    onOpenLesson(ref.id);
  };

  const newSong = () => {
    if (currentSong) {
      const ok = window.confirm(`現在の課題曲「${currentSong.title}」は、仕上げずに新しい曲へ切り替わります。よろしいですか?`);
      if (!ok) return;
    }
    onNewSong(todayLesson ? todayLesson.id : null);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="名簿に戻る">
          <ArrowLeft size={24} />
        </button>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>{student.className}</div>
          <h1>
            {student.name}
            <span className="muted" style={{ fontSize: 18, marginLeft: 6, fontWeight: 400 }}>殿</span>
          </h1>
        </div>
      </header>

      <div className="page-body">
        <div className="card current-card">
          {currentSong ? (
            <>
              <p className="eyebrow">現在の課題曲(今日で{nthToday}回目)</p>
              <h2 className="song-title-big">{currentSong.title}</h2>
            </>
          ) : (
            <>
              <p className="eyebrow">課題曲</p>
              <h2 className="song-title-big" style={{ fontSize: 24, fontWeight: 500 }}>
                まだ課題曲がありません
              </h2>
            </>
          )}
          <button className="btn primary big" onClick={startToday}>
            <Play size={28} fill="currentColor" />
            {todayLesson ? '本日のお稽古を開く' : '本日のお稽古を始める'}
          </button>
        </div>

        <div className="row-end">
          <button className="btn" onClick={newSong}>
            <FileText size={20} color="var(--indigo)" /> 新しい曲を読み込む
          </button>
        </div>

        <h3 className="section-title">
          <Bookmark size={18} /> お稽古の記録
        </h3>
        {sortedLessons.length === 0 && <p className="empty-note">まだ記録がありません。</p>}
        {sortedLessons.map((l) => {
          const summary = routineSummary(l, settings);
          return (
            <button key={l.id} className="history-item" onClick={() => onOpenLesson(l.id)}>
              <div style={{ minWidth: 0 }}>
                <div>
                  <span className="date">{formatDate(l.date)}</span>
                  <span style={{ fontSize: 18 }}>{l.songTitle || '(曲なし)'}</span>
                  {l.finishedSong && <span className="badge">仕上げ日</span>}
                </div>
                {summary && <div className="preview">{summary}</div>}
              </div>
              <ChevronRight size={22} color="var(--sub)" style={{ flexShrink: 0 }} />
            </button>
          );
        })}

        {pastSongs.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <button className="section-title" onClick={() => setShowPast(!showPast)}>
              {showPast ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              これまでの課題曲({pastSongs.length}曲)
            </button>
            {showPast &&
              pastSongs.map((s) => (
                <button key={s.id} className="past-song" onClick={() => onViewSong(s.id)}>
                  <span>{s.title}</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {s.finishedAt ? `仕上げ: ${formatDate(s.finishedAt)}` : '途中で切り替え'}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
