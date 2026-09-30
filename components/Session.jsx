import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, Eraser, FileText, Hand, Highlighter, History, Pencil, PenLine, Trash2, Undo2,
} from 'lucide-react';
import InkSheet, { DEFAULT_LAYOUT, PEN_COLORS, ZOOM_LEVELS } from './InkSheet';
import Modal from './Modal';
import Recorder from './Recorder';
import { MarkLegend, MarksPanel, PrevReviewModal, SummaryEditor, SummaryView } from './ReviewParts';
import { useCollectionData, useDocData, useOnline } from '../lib/useFirestore';
import { formatDate, newId, quiet } from '../lib/utils';
import { processPendingAudio, runMarksAnalysis, runTranslation } from '../lib/ai';
import { addPending, listPending } from '../lib/pendingAudio';

const SAVE_DELAY = 800;

// 書き込みを少し待ってからまとめて保存する(書くたびに保存しない)
function useDebouncedSaver(saveFn) {
  const timer = useRef(null);
  const pending = useRef(null);
  const fnRef = useRef(saveFn);
  fnRef.current = saveFn;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      const v = pending.current;
      pending.current = null;
      fnRef.current(v);
    }
  }, []);

  const schedule = useCallback(
    (value) => {
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush]
  );

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return schedule;
}

export default function Session({ db, student, settings, lessonId, onBack, onNewSong }) {
  const sid = student.id;
  const lessonRef = doc(db, 'students', sid, 'lessons', lessonId);
  const lesson = useDocData(lessonRef, [sid, lessonId]);
  const songId = lesson ? lesson.songId : null;
  const song = useDocData(songId ? doc(db, 'students', sid, 'songs', songId) : null, [sid, songId]);
  const inkDocs = useCollectionData(songId ? collection(db, 'students', sid, 'songs', songId, 'ink') : null, [sid, songId]);
  const lessons = useCollectionData(collection(db, 'students', sid, 'lessons'), [sid]);

  // 道具
  const [tool, setTool] = useState({ mode: 'pen', color: PEN_COLORS[0], width: 2, highlight: false });
  const [fingerMode, setFingerMode] = useState(false);
  const [viewMode, setViewMode] = useState('all');
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState('routine');
  const [editingLyrics, setEditingLyrics] = useState(false);
  const online = useOnline();
  const [showMarks, setShowMarks] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showPrev, setShowPrev] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [trBusy, setTrBusy] = useState(false);
  const [trError, setTrError] = useState('');
  const [editingSummary, setEditingSummary] = useState(false);
  const [pendingRecs, setPendingRecs] = useState([]);
  const [summarizing, setSummarizing] = useState(false);
  const [zoom, setZoom] = useState(() => {
    try {
      const z = Number(localStorage.getItem('keikocho-zoom'));
      return ZOOM_LEVELS.includes(z) ? z : 1;
    } catch (e) {
      return 1;
    }
  });
  const changeZoom = (dir) => {
    const i = ZOOM_LEVELS.indexOf(zoom);
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir))];
    setZoom(next);
    try {
      localStorage.setItem('keikocho-zoom', String(next));
    } catch (e) {
      /* noop */
    }
  };

  // 今回の書き込み(歌詞)
  // 先生が書き始めるまでは、保存済みの最新データ(iPad内→サーバー)を反映し続ける
  const [myInk, setMyInk] = useState(null);
  const inkDirty = useRef(false);
  useEffect(() => {
    if (!songId || inkDocs === undefined || inkDirty.current) return;
    const mine = inkDocs.find((d) => d.id === lessonId);
    setMyInk(mine && mine.strokes ? mine.strokes : []);
  }, [songId, lessonId, inkDocs]);

  const lessonDate = lesson ? lesson.date : '';
  const saveInk = useDebouncedSaver((strokes) => {
    if (!songId) return;
    quiet(
      setDoc(doc(db, 'students', sid, 'songs', songId, 'ink', lessonId), {
        lessonId,
        date: lessonDate,
        strokes,
        updatedAt: serverTimestamp(),
      })
    );
  });

  // 今日の気付き(手書き)
  const [insight, setInsight] = useState(null);
  const insightDirty = useRef(false);
  useEffect(() => {
    if (lesson && !insightDirty.current) setInsight(lesson.insightStrokes || []);
  }, [lesson]);
  const saveInsight = useDebouncedSaver((strokes) => {
    quiet(setDoc(lessonRef, { insightStrokes: strokes }, { merge: true }));
  });

  const pastLayers = useMemo(() => {
    if (!inkDocs || !lesson) return [];
    return inkDocs
      .filter((d) => d.id !== lessonId && (d.date || '') <= lesson.date)
      .sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1))
      .map((d) => ({ key: d.id, strokes: d.strokes || [] }));
  }, [inkDocs, lessonId, lesson]);

  // 前回のお稽古(「前回」印のため)
  const prevLesson = useMemo(() => {
    if (!lessons || !lesson) return null;
    return (
      [...lessons]
        .filter((l) => l.id !== lessonId && l.date < lesson.date)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null
    );
  }, [lessons, lesson, lessonId]);

  // 注意マーク: まだ分析していない曲は、ネットにつながっていれば自動で分析する
  const marksTried = useRef('');
  useEffect(() => {
    if (!song || !online) return;
    if (song.marksStatus === 'done' || song.marksStatus === 'error') return;
    if (marksTried.current === song.id) return;
    marksTried.current = song.id;
    setAnalyzing(true);
    runMarksAnalysis(db, sid, song.id, song.lyrics || '').finally(() => setAnalyzing(false));
  }, [song, online, db, sid]);

  // 日本語訳を開く。まだ訳がない曲は、ネットにつながっていればその場で作る
  const openTranslation = () => {
    setShowTr(true);
    setTrError('');
    if (!song || song.translationStatus === 'done' || trBusy || analyzing) return;
    if (!navigator.onLine) return;
    setTrBusy(true);
    runTranslation(db, sid, song.id, song.lyrics || '')
      .catch((e) => setTrError(e.message || '作成できませんでした'))
      .finally(() => setTrBusy(false));
  };

  const retryMarks = () => {
    if (!song) return;
    setAnalyzing(true);
    runMarksAnalysis(db, sid, song.id, song.lyrics || '').finally(() => setAnalyzing(false));
  };

  // この日の、まとめ待ちの録音
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listPending().then((list) => alive && setPendingRecs(list.filter((r) => r.lessonId === lessonId)));
    refresh();
    window.addEventListener('keikocho-pending-changed', refresh);
    return () => {
      alive = false;
      window.removeEventListener('keikocho-pending-changed', refresh);
    };
  }, [lessonId]);

  const summarizeNow = async () => {
    setSummarizing(true);
    try {
      await processPendingAudio(db, settings, { force: true, lessonId });
    } finally {
      setSummarizing(false);
    }
  };

  const onRecorded = async (blob, mimeType) => {
    try {
      await addPending({ id: newId('a'), studentId: sid, lessonId, mimeType, blob, createdAt: Date.now(), attempts: 0 });
    } catch (e) {
      window.alert('録音をiPadに保存できませんでした。');
      return;
    }
    if (navigator.onLine) summarizeNow();
  };

  if (lesson === undefined) return <div className="center-screen muted">読み込み中…</div>;
  if (lesson === null) {
    return (
      <div className="center-screen">
        <p>この記録が見つかりませんでした。</p>
        <button className="btn" onClick={onBack}>戻る</button>
      </div>
    );
  }

  const routines = lesson.routines || {};
  const toggleRoutine = (id) => {
    quiet(updateDoc(lessonRef, { [`routines.${id}`]: !routines[id] }));
  };
  const setReading = (title) => {
    const readingItem = (settings.routineCategories || []).flatMap((c) => c.items || []).find((it) => it.type === 'reading');
    const upd = { readingTask: title };
    if (readingItem && title) upd[`routines.${readingItem.id}`] = true;
    quiet(updateDoc(lessonRef, upd));
  };

  const finishSong = () => {
    if (!song) return;
    if (lesson.finishedSong) {
      if (student.currentSongId && student.currentSongId !== song.id) {
        window.alert('すでに次の曲に進んでいるため、仕上げを取り消せません。');
        return;
      }
      if (!window.confirm('仕上げを取り消して、この曲を課題曲に戻しますか?')) return;
      quiet(updateDoc(doc(db, 'students', sid, 'songs', song.id), { finishedAt: null }));
      quiet(updateDoc(doc(db, 'students', sid), { currentSongId: song.id }));
      quiet(updateDoc(lessonRef, { finishedSong: false }));
      return;
    }
    if (!window.confirm(`今日(${formatDate(lesson.date)})を「${song.title}」の仕上げ日にしますか?\n次回のお稽古から新しい曲になります。`)) return;
    quiet(updateDoc(doc(db, 'students', sid, 'songs', song.id), { finishedAt: lesson.date }));
    if (student.currentSongId === song.id) quiet(updateDoc(doc(db, 'students', sid), { currentSongId: null }));
    quiet(updateDoc(lessonRef, { finishedSong: true }));
  };

  // この日の記録を削除(チェック・書き込み・今日の気付きをまとめて)
  const deleteLesson = () => {
    const msg = `${formatDate(lesson.date)}のお稽古の記録を削除しますか?\nルーティンのチェック、歌詞への書き込み、今日の気付きがすべて消え、元に戻せません。`;
    if (!window.confirm(msg)) return;
    if (song) {
      const songRef = doc(db, 'students', sid, 'songs', song.id);
      const others = (lessons || []).filter((l) => l.id !== lessonId && l.songId === song.id);
      if (others.length === 0) {
        // この曲を使ったお稽古がほかにない場合は、曲ごと片付ける
        (inkDocs || []).forEach((d) => quiet(deleteDoc(doc(db, 'students', sid, 'songs', song.id, 'ink', d.id))));
        quiet(deleteDoc(songRef));
        if (student.currentSongId === song.id) quiet(updateDoc(doc(db, 'students', sid), { currentSongId: null }));
      } else {
        quiet(deleteDoc(doc(db, 'students', sid, 'songs', song.id, 'ink', lessonId)));
        if (lesson.finishedSong) {
          quiet(updateDoc(songRef, { finishedAt: null }));
          if (!student.currentSongId) quiet(updateDoc(doc(db, 'students', sid), { currentSongId: song.id }));
        }
      }
    }
    quiet(deleteDoc(lessonRef));
    onBack();
  };

  const showFinishButton = song && (lesson.finishedSong || !song.finishedAt);
  const inkReady = !songId || (myInk !== null && inkDocs !== undefined);

  return (
    <div className="session">
      <header className="session-head">
        <button className="icon-btn" onClick={onBack} aria-label="生徒フォルダに戻る">
          <ArrowLeft size={24} />
        </button>
        <div className="meta">
          <div className="who">
            {student.name}・{formatDate(lesson.date)}
          </div>
          <div className="song">{song ? song.title : '課題曲なし'}</div>
          {prevLesson && !lesson.prevReviewed && (
            <button
              className="btn outline"
              onClick={() => setShowPrev(true)}
              style={{ minHeight: 34, padding: '4px 12px', fontSize: 14, marginTop: 4 }}
            >
              <History size={16} /> 前回の振り返り
            </button>
          )}
        </div>
        <button className="icon-btn" onClick={deleteLesson} aria-label="この記録を削除" style={{ color: 'var(--red)' }}>
          <Trash2 size={20} />
        </button>
        {song && (
          <button className="icon-btn" onClick={() => setEditingLyrics(true)} aria-label="歌詞を修正">
            <Pencil size={20} />
          </button>
        )}
        {showFinishButton && (
          <button className={`btn ${lesson.finishedSong ? '' : 'outline'}`} onClick={finishSong} style={lesson.finishedSong ? { color: 'var(--gold)', borderColor: 'var(--gold)' } : undefined}>
            <Check size={20} /> {lesson.finishedSong ? '仕上げ日(済)' : '仕上げ日にする'}
          </button>
        )}
      </header>

      <div className="toolbar">
        <div className="tools">
          <button
            className={`tool ${tool.mode === 'pen' && !tool.highlight ? 'on' : ''}`}
            onClick={() => setTool({ ...tool, mode: 'pen', highlight: false })}
            aria-label="ペン"
          >
            <PenLine size={20} />
          </button>
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${tool.mode === 'pen' && !tool.highlight && tool.color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setTool({ ...tool, mode: 'pen', highlight: false, color: c })}
              aria-label="ペンの色"
            />
          ))}
          <div className="seg">
            <button className={tool.width === 2 ? 'on' : ''} onClick={() => setTool({ ...tool, width: 2 })}>細</button>
            <button className={tool.width === 4 ? 'on' : ''} onClick={() => setTool({ ...tool, width: 4 })}>太</button>
          </div>
          <button
            className={`tool ${tool.highlight ? 'on' : ''}`}
            onClick={() => setTool({ ...tool, mode: 'pen', highlight: true })}
            aria-label="蛍光ペン"
          >
            <Highlighter size={20} />
          </button>
          <button
            className={`tool ${tool.mode === 'eraser' ? 'on' : ''}`}
            onClick={() => setTool({ ...tool, mode: 'eraser' })}
            aria-label="消しゴム"
          >
            <Eraser size={20} />
          </button>
          <button
            className="tool"
            onClick={() => {
              if (!myInk || myInk.length === 0) return;
              const next = myInk.slice(0, -1);
              inkDirty.current = true;
              setMyInk(next);
              saveInk(next);
            }}
            aria-label="ひとつ戻す"
          >
            <Undo2 size={20} />
          </button>
          <button className={`tool ${fingerMode ? 'on' : ''}`} onClick={() => setFingerMode(!fingerMode)} aria-label="指で書く">
            <Hand size={20} />
          </button>
        </div>
        <div className="tools">
          {song && (
            <button
              className={`btn ${showMarks ? 'primary' : 'outline'}`}
              onClick={() => setShowMarks(!showMarks)}
              style={{ minHeight: 42, padding: '6px 12px', fontSize: 15 }}
            >
              注意マーク
            </button>
          )}
          {song && (
            <button className="btn outline" onClick={openTranslation} style={{ minHeight: 42, padding: '6px 12px', fontSize: 15 }}>
              日本語訳
            </button>
          )}
          <div className="zoom">
            <button onClick={() => changeZoom(-1)} disabled={zoom === ZOOM_LEVELS[0]} aria-label="縮小">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => changeZoom(1)} disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} aria-label="拡大">+</button>
          </div>
          <div className="seg">
            <button className={viewMode === 'all' ? 'on' : ''} onClick={() => setViewMode('all')}>全日表示</button>
            <button className={viewMode === 'today' ? 'on' : ''} onClick={() => setViewMode('today')}>この日のみ</button>
          </div>
        </div>
      </div>

      <div className="lyrics-scroll">
        {!song ? (
          <div className="card" style={{ textAlign: 'center', padding: 36 }}>
            <p style={{ fontSize: 20, margin: '0 0 16px' }}>この日の課題曲はまだありません</p>
            <button className="btn primary" onClick={onNewSong}>
              <FileText size={20} /> 新しい曲を読み込む
            </button>
          </div>
        ) : !inkReady ? (
          <div className="center-screen muted">書き込みを読み込み中…</div>
        ) : (
          <>
          {showMarks && (
            song.marksStatus === 'done' ? (
              <MarkLegend marks={song.marks} />
            ) : (
              <p className="review-note" style={{ margin: '0 4px 10px' }}>
                {analyzing || online ? '注意マークを分析しています…' : 'ネットにつながった時に、自動で注意マークを分析します。'}
              </p>
            )
          )}
          <InkSheet
            text={song.lyrics || ''}
            textStyle={song.layout || DEFAULT_LAYOUT}
            marks={song.marks || []}
            showMarks={showMarks}
            zoom={zoom}
            pastLayers={pastLayers}
            pastAlpha={viewMode === 'all' ? 0.4 : 0}
            strokes={myInk || []}
            onChange={(s) => {
              inkDirty.current = true;
              setMyInk(s);
              saveInk(s);
            }}
            tool={tool}
            fingerMode={fingerMode}
          />
          </>
        )}
      </div>

      <div className={`panel ${panelOpen ? 'open' : ''}`}>
        <div className="panel-tabs">
          {[
            ['routine', 'ルーティン'],
            ['review', '振り返り'],
            ['marks', '注意マーク'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`tab ${panelOpen && tab === key ? 'on' : ''}`}
              onClick={() => {
                setTab(key);
                setPanelOpen(true);
              }}
            >
              {label}
            </button>
          ))}
          <button className="fold" onClick={() => setPanelOpen(!panelOpen)} aria-label="パネルの開閉">
            {panelOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
          </button>
        </div>

        {panelOpen && (
          <div className="panel-body">
            {tab === 'routine' ? (
              <div className="routine-grid">
                {(settings.routineCategories || []).map((cat) => (
                  <section key={cat.id} className="routine-cat">
                    <h4>{cat.name}</h4>
                    {(cat.items || []).map((it) => {
                      const on = !!routines[it.id];
                      const wasLast = prevLesson && prevLesson.routines && prevLesson.routines[it.id];
                      return (
                        <div key={it.id} className="routine-item">
                          <button className={`check-label ${on ? 'on' : ''}`} onClick={() => toggleRoutine(it.id)}>
                            <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={18} />}</span>
                            {it.name}
                          </button>
                          {it.type === 'reading' && (
                            <select
                              className="reading-select"
                              value={lesson.readingTask || ''}
                              onChange={(e) => setReading(e.target.value)}
                            >
                              <option value="">課題を選ぶ</option>
                              {(settings.readingTasks || []).map((t, i) => (
                                <option key={t + i} value={t}>
                                  {i + 1}. {t}
                                </option>
                              ))}
                            </select>
                          )}
                          {wasLast && (
                            <span className="badge" title={it.type === 'reading' && prevLesson.readingTask ? prevLesson.readingTask : ''}>
                              前回{it.type === 'reading' && prevLesson.readingTask ? `:${prevLesson.readingTask}` : ''}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : tab === 'marks' ? (
              <MarksPanel
                song={song}
                online={online}
                analyzing={analyzing}
                onRetry={() => window.confirm('注意マークを付け直しますか?(今のマークは置き換わります)') && retryMarks()}
                onDelete={(i) =>
                  quiet(updateDoc(doc(db, 'students', sid, 'songs', song.id), { marks: (song.marks || []).filter((_, k) => k !== i) }))
                }
              />
            ) : (
              <div>
                <Recorder
                  onRecorded={onRecorded}
                  disabled={summarizing}
                  label={lesson.summary ? '振り返りを録音し直す' : '振り返りを録音'}
                />
                {(summarizing || pendingRecs.length > 0) && (
                  <div className="card" style={{ padding: 14, margin: '12px 0', fontSize: 15 }}>
                    {summarizing ? (
                      '要点をまとめています…(30秒〜1分ほど)'
                    ) : online ? (
                      <>
                        まとめ待ちの録音があります。
                        {lesson.summaryError && <span className="error-text"> ({lesson.summaryError})</span>}
                        <button className="link-btn" onClick={summarizeNow}>今すぐまとめる</button>
                      </>
                    ) : (
                      '録音をiPadに保存しました。ネットにつながった時に、自動で要点をまとめます。'
                    )}
                  </div>
                )}
                {lesson.summary && (
                  <div className="card" style={{ padding: 16, margin: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ color: 'var(--indigo)' }}>AIの要点メモ</strong>
                      <button className="link-btn" onClick={() => setEditingSummary(true)}>
                        <Pencil size={16} style={{ verticalAlign: 'middle' }} /> 手直し
                      </button>
                    </div>
                    <SummaryView summary={lesson.summary} />
                  </div>
                )}
                <p className="pad-title" style={{ marginTop: 16 }}>今日の気付き(手書き)</p>
                {insight === null ? (
                  <div className="muted">読み込み中…</div>
                ) : (
                  <InkSheet
                    text=""
                    minHeight={520}
                    strokes={insight}
                    onChange={(s) => {
                      insightDirty.current = true;
                      setInsight(s);
                      saveInsight(s);
                    }}
                    tool={tool}
                    fingerMode={fingerMode}
                    emptyText={insight.length === 0 ? 'Apple Pencilで自由に書き込めます' : ''}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showTr && song && (
        <Modal title={`日本語訳(${song.title})`} onClose={() => setShowTr(false)}>
          {song.translationStatus === 'done' && song.translation ? (
            <>
              <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>1コーラス分の訳です。</p>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 2, fontSize: 18 }}>{song.translation}</div>
            </>
          ) : song.translationStatus === 'done' || song.marksLang === 'ja' ? (
            <p>日本語の歌詞のため、訳はありません。</p>
          ) : trBusy || analyzing ? (
            <p>日本語訳を作成しています…(10〜20秒ほど)</p>
          ) : !online ? (
            <p>日本語訳の作成にはネット接続が必要です。ネットにつないでから、もう一度ボタンを押してください。</p>
          ) : (
            <>
              {trError && <p className="error-text">作成できませんでした。({trError})</p>}
              <button className="btn primary" onClick={openTranslation}>日本語訳を作る</button>
            </>
          )}
          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => setShowTr(false)}>閉じる</button>
          </div>
        </Modal>
      )}

      {showPrev && prevLesson && (
        <PrevReviewModal
          prevLesson={prevLesson}
          settings={settings}
          onClose={() => setShowPrev(false)}
          onConfirm={() => {
            quiet(updateDoc(lessonRef, { prevReviewed: true }));
            setShowPrev(false);
          }}
        />
      )}

      {editingSummary && (
        <SummaryEditor
          summary={lesson.summary}
          onClose={() => setEditingSummary(false)}
          onSave={(summary) => {
            quiet(updateDoc(lessonRef, { summary }));
            setEditingSummary(false);
          }}
        />
      )}

      {editingLyrics && song && (
        <LyricsEditor
          song={song}
          onClose={() => setEditingLyrics(false)}
          onSave={(title, lyrics) => {
            const changed = (song.lyrics || '') !== lyrics;
            quiet(
              updateDoc(
                doc(db, 'students', sid, 'songs', song.id),
                changed ? { title, lyrics, marks: [], marksStatus: 'pending', translation: '', translationStatus: 'pending' } : { title }
              )
            );
            if (changed) marksTried.current = '';
            if (lesson.songTitle !== title) quiet(updateDoc(lessonRef, { songTitle: title }));
            setEditingLyrics(false);
          }}
        />
      )}
    </div>
  );
}

function LyricsEditor({ song, onClose, onSave }) {
  const [title, setTitle] = useState(song.title || '');
  const [lyrics, setLyrics] = useState(song.lyrics || '');
  return (
    <Modal title="曲名・歌詞を修正" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        歌詞の行を増減すると、これまでの書き込みの位置がずれることがあります。誤字の修正程度にとどめるのがおすすめです。
      </p>
      <label className="field">
        <span>曲名</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>歌詞</span>
        <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} style={{ minHeight: 320, lineHeight: 1.7 }} />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>キャンセル</button>
        <button className="btn primary" disabled={!title.trim()} onClick={() => onSave(title.trim(), lyrics)}>
          保存
        </button>
      </div>
    </Modal>
  );
}
