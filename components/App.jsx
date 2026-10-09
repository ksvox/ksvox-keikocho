import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { loadFirebaseConfig, initFirebase } from '../lib/firebase';
import { DEFAULT_SETTINGS, ENGLISH_CATEGORY } from '../lib/defaults';
import { quiet } from '../lib/utils';
import { processPendingAudio } from '../lib/ai';
import { useCollectionData, useOnline } from '../lib/useFirestore';
import Login from './Login';
import Roster from './Roster';
import StudentFolder from './StudentFolder';
import Session from './Session';
import NewSong from './NewSong';
import SongViewer from './SongViewer';
import SettingsScreen from './SettingsScreen';

export default function App() {
  const [phase, setPhase] = useState('loading'); // loading | noconfig | login | ready
  const [fb, setFb] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const config = await loadFirebaseConfig();
      if (!config) {
        setPhase('noconfig');
        return;
      }
      const inst = initFirebase(config);
      setFb(inst);
      unsub = onAuthStateChanged(inst.auth, (u) => {
        setUser(u);
        setPhase(u ? 'ready' : 'login');
      });
    })();
    return () => unsub();
  }, []);

  if (phase === 'loading') return <div className="center-screen muted">読み込み中…</div>;
  if (phase === 'noconfig') {
    return (
      <div className="center-screen">
        <p style={{ fontSize: 20 }}>接続の準備ができませんでした。</p>
        <p className="muted">初めて開く時はネット接続が必要です。接続を確認して、もう一度開いてください。</p>
        <button className="btn outline" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
          もう一度読み込む
        </button>
      </div>
    );
  }
  if (phase === 'login') return <Login auth={fb.auth} />;
  return <Main db={fb.db} auth={fb.auth} user={user} />;
}

function Main({ db, auth, user }) {
  const online = useOnline();
  const [settings, setSettings] = useState(null);
  const [nav, setNav] = useState({ screen: 'roster' });

  // 設定(クラス・ルーティン・朗読課題)。初回だけ初期値を作る
  useEffect(() => {
    const ref = doc(db, 'settings', 'main');
    const unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // ルーティン「英語」を1度だけ追加(ブレスの次)。設定画面で消した後は戻さない
          if (!data.englishAdded && !snap.metadata.fromCache) {
            const cats = [...(data.routineCategories || DEFAULT_SETTINGS.routineCategories)];
            if (!cats.some((c) => c.id === 'c4' || c.name === '英語')) {
              const bi = cats.findIndex((c) => c.name === 'ブレス');
              cats.splice(bi >= 0 ? bi + 1 : cats.length, 0, ENGLISH_CATEGORY);
            }
            quiet(setDoc(ref, { routineCategories: cats, englishAdded: true }, { merge: true }));
          }
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        } else if (!snap.metadata.fromCache) {
          quiet(setDoc(ref, { ...DEFAULT_SETTINGS, englishAdded: true }));
          setSettings(DEFAULT_SETTINGS);
        } else {
          setSettings((cur) => cur || DEFAULT_SETTINGS);
        }
      },
      () => setSettings((cur) => cur || DEFAULT_SETTINGS)
    );
    return unsub;
  }, [db]);

  const students = useCollectionData(collection(db, 'students'), [db]);

  // iPadに保存された録音を、ネットにつながった時に自動でまとめる
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (!settings) return undefined;
    const run = () => processPendingAudio(db, settingsRef.current);
    run();
    window.addEventListener('online', run);
    const timer = setInterval(run, 60 * 1000);
    return () => {
      window.removeEventListener('online', run);
      clearInterval(timer);
    };
  }, [db, !!settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || students === undefined) return <div className="center-screen muted">記録を読み込み中…</div>;

  const student = nav.studentId ? students.find((s) => s.id === nav.studentId) : null;
  const go = (next) => setNav(next);

  switch (nav.screen) {
    case 'folder':
      if (!student) return null;
      return (
        <StudentFolder
          db={db}
          student={student}
          settings={settings}
          onBack={() => go({ screen: 'roster' })}
          onOpenLesson={(lessonId) => go({ screen: 'session', studentId: student.id, lessonId })}
          onNewSong={(lessonId) => go({ screen: 'newSong', studentId: student.id, lessonId, from: 'folder' })}
          onViewSong={(songId) => go({ screen: 'song', studentId: student.id, songId })}
        />
      );
    case 'session':
      if (!student) return null;
      return (
        <Session
          db={db}
          student={student}
          settings={settings}
          lessonId={nav.lessonId}
          onBack={() => go({ screen: 'folder', studentId: student.id })}
          onNewSong={() => go({ screen: 'newSong', studentId: student.id, lessonId: nav.lessonId, from: 'session' })}
        />
      );
    case 'newSong':
      if (!student) return null;
      return (
        <NewSong
          db={db}
          student={student}
          lessonId={nav.lessonId}
          onBack={() =>
            nav.from === 'session'
              ? go({ screen: 'session', studentId: student.id, lessonId: nav.lessonId })
              : go({ screen: 'folder', studentId: student.id })
          }
          onDone={(lessonId) => go({ screen: 'session', studentId: student.id, lessonId })}
        />
      );
    case 'song':
      if (!student) return null;
      return (
        <SongViewer
          db={db}
          student={student}
          songId={nav.songId}
          onBack={() => go({ screen: 'folder', studentId: student.id })}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          db={db}
          auth={auth}
          user={user}
          settings={settings}
          students={students}
          onBack={() => go({ screen: 'roster' })}
        />
      );
    default:
      return (
        <Roster
          db={db}
          students={students}
          settings={settings}
          online={online}
          onSelect={(s) => go({ screen: 'folder', studentId: s.id })}
          onSettings={() => go({ screen: 'settings' })}
        />
      );
  }
}
