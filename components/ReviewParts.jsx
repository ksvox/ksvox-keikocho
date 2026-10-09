import { useState } from 'react';
import { X } from 'lucide-react';
import Modal from './Modal';
import { MARK_TYPES, markStyle } from '../lib/marks';
import { allRoutineItems, formatDate } from '../lib/utils';

export const SUMMARY_SECTIONS = [
  ['done', '今日やったこと'],
  ['good', 'できたこと'],
  ['issues', '課題'],
  ['next', '次回・宿題'],
];

// ---------- 注意マークの凡例 ----------
export function MarkLegend({ marks }) {
  const types = Array.from(new Set((marks || []).map((m) => m.type))).filter((t) => MARK_TYPES[t]);
  if (!types.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 14, color: 'var(--sub)', margin: '0 4px 10px' }}>
      {types.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--ink)', padding: '0 2px', ...markStyle(t) }}>abc</span>
          {MARK_TYPES[t].label}
        </span>
      ))}
    </div>
  );
}

// ---------- 注意マーク一覧(タブ) ----------
export function MarksPanel({ song, online, analyzing, onRetry, onDelete }) {
  const status = song ? song.marksStatus : null;
  const marks = (song && song.marks) || [];

  if (!song) return <p className="muted">課題曲がありません。</p>;

  let statusNote = null;
  if (analyzing) statusNote = '注意マークを付けています…';
  else if (status !== 'done' && status !== 'error') {
    statusNote = online ? '注意マークの準備をしています…' : 'ネットにつながった時に、自動で注意マークを付けます。';
  } else if (status === 'error') statusNote = `分析できませんでした。(${song.marksError || '原因不明'})`;

  return (
    <div>
      {statusNote && <p className="review-note">{statusNote}</p>}
      {status === 'done' && marks.length === 0 && <p className="review-note">{song.marksLang === 'ja' ? '注意マークは英語曲のみです。' : '注意マークはありませんでした。'}</p>}
      {marks.length > 0 && <p className="review-note">アクセント(赤)と内容語(太字)は歌詞シートで確認できます。下の一覧はリンキング・難しい単語・熟語です。</p>}
      {marks.length > 0 && <MarkLegend marks={marks} />}
      {marks.map((m, i) => (MARK_TYPES[m.type]?.list === false ? null : (
        <div
          key={`${m.text}-${i}`}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--paper)',
            border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>
              <span style={markStyle(m.type)}>{m.text}</span>
              <span className="badge" style={{ borderColor: MARK_TYPES[m.type]?.color, color: MARK_TYPES[m.type]?.color }}>
                {MARK_TYPES[m.type]?.label}
              </span>
            </div>
            {m.note && <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{m.note}</div>}
          </div>
          <button className="mini-btn del" onClick={() => onDelete(i)} aria-label="このマークを消す">
            <X size={18} />
          </button>
        </div>
      )))}
      {!analyzing && online && (status === 'done' || status === 'error') && (
        <button className="link-btn" onClick={onRetry}>
          注意マークを付け直す
        </button>
      )}
    </div>
  );
}

// ---------- 要点の表示 ----------
export function SummaryView({ summary, compact = false }) {
  if (!summary) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14 }}>
      {SUMMARY_SECTIONS.map(([key, label]) => {
        const items = summary[key] || [];
        return (
          <div key={key}>
            <div style={{ fontSize: 14, color: 'var(--indigo)', fontWeight: 700, marginBottom: 4 }}>{label}</div>
            {items.length ? (
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, color: key === 'issues' ? 'var(--red)' : 'var(--ink)' }}>
                {items.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : (
              <div className="muted" style={{ fontSize: 14 }}>(なし)</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- 要点の手直し ----------
export function SummaryEditor({ summary, onClose, onSave }) {
  const [draft, setDraft] = useState(() => {
    const d = {};
    SUMMARY_SECTIONS.forEach(([k]) => {
      d[k] = ((summary && summary[k]) || []).join('\n');
    });
    return d;
  });
  return (
    <Modal title="要点を手直し" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>1行が箇条書きの1項目になります。</p>
      {SUMMARY_SECTIONS.map(([k, label]) => (
        <label key={k} className="field">
          <span>{label}</span>
          <textarea
            value={draft[k]}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            style={{ minHeight: 90, lineHeight: 1.6, fontSize: 17 }}
          />
        </label>
      ))}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>キャンセル</button>
        <button
          className="btn primary"
          onClick={() => {
            const out = {};
            SUMMARY_SECTIONS.forEach(([k]) => {
              out[k] = draft[k].split('\n').map((x) => x.trim()).filter(Boolean);
            });
            onSave(out);
          }}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}

// ---------- 前回の振り返り ----------
export function PrevReviewModal({ prevLesson, settings, onClose, onConfirm }) {
  const done = allRoutineItems(settings)
    .filter((it) => prevLesson.routines && prevLesson.routines[it.id])
    .map((it) => (it.type === 'reading' && prevLesson.readingTask ? `朗読課題「${prevLesson.readingTask}」` : it.name));

  return (
    <Modal title={`前回の振り返り(${formatDate(prevLesson.date)})`} onClose={onClose}>
      {prevLesson.songTitle && (
        <p className="muted" style={{ marginTop: 0 }}>
          課題曲: {prevLesson.songTitle}
        </p>
      )}
      <div style={{ fontSize: 14, color: 'var(--indigo)', fontWeight: 700, marginBottom: 6 }}>前回やったルーティン</div>
      {done.length ? (
        <ul style={{ margin: '0 0 18px', paddingLeft: 20, lineHeight: 1.7 }}>
          {done.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: '0 0 18px' }}>チェックはありません。</p>
      )}
      {prevLesson.summary ? (
        <SummaryView summary={prevLesson.summary} compact />
      ) : (
        <p className="muted">録音の要点はありません。</p>
      )}
      <div className="modal-actions" style={{ marginTop: 20 }}>
        <button className="btn" onClick={onClose}>閉じる</button>
        <button className="btn primary" onClick={onConfirm}>確認済</button>
      </div>
    </Modal>
  );
}
