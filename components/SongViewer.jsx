import { useMemo } from 'react';
import { collection, doc } from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import InkSheet from './InkSheet';
import { useCollectionData, useDocData } from '../lib/useFirestore';
import { formatDate } from '../lib/utils';

// これまでの課題曲を、全日の書き込みを重ねた状態で見返す画面(閲覧のみ)
export default function SongViewer({ db, student, songId, onBack }) {
  const sid = student.id;
  const song = useDocData(doc(db, 'students', sid, 'songs', songId), [sid, songId]);
  const inkDocs = useCollectionData(collection(db, 'students', sid, 'songs', songId, 'ink'), [sid, songId]);

  const layers = useMemo(
    () =>
      (inkDocs || [])
        .slice()
        .sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1))
        .map((d) => ({ key: d.id, strokes: d.strokes || [] })),
    [inkDocs]
  );

  return (
    <div className="page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ArrowLeft size={24} />
        </button>
        <div>
          <div className="muted" style={{ fontSize: 14 }}>
            {student.name}
            {song && song.startedAt ? `・${formatDate(song.startedAt)}〜${song.finishedAt ? formatDate(song.finishedAt) : ''}` : ''}
          </div>
          <h1>{song ? song.title : ''}</h1>
        </div>
      </header>
      <div className="page-body" style={{ padding: 12 }}>
        {song === undefined || inkDocs === undefined ? (
          <div className="center-screen muted">読み込み中…</div>
        ) : !song ? (
          <p className="muted">この曲が見つかりませんでした。</p>
        ) : (
          <InkSheet text={song.lyrics || ''} pastLayers={layers} pastAlpha={1} strokes={[]} readOnly />
        )}
      </div>
    </div>
  );
}
