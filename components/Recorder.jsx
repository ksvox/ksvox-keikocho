import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

const MAX_SECONDS = 15 * 60; // 15分で自動停止

function pickMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const list = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return list.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Recorder({ onRecorded, disabled, label = '振り返りを録音' }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    },
    []
  );

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    setRecording(false);
  };

  const start = async () => {
    setError('');
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setError('この端末では録音できません。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const type = pickMimeType();
      const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' });
        if (blob.size > 0) onRecorded(blob, blob.type);
      };
      recRef.current = rec;
      rec.start(1000);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) setTimeout(stop, 0);
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError('マイクを使えませんでした。マイクの使用を許可してから、もう一度お試しください。');
    }
  };

  return (
    <div>
      <button
        className="btn big"
        disabled={disabled && !recording}
        onClick={recording ? stop : start}
        style={{
          fontSize: 20,
          padding: 18,
          background: recording ? 'var(--red)' : 'var(--indigo)',
          borderColor: recording ? 'var(--red)' : 'var(--indigo)',
          color: '#fff',
          fontWeight: 700,
        }}
      >
        {recording ? <Square size={24} fill="currentColor" /> : <Mic size={26} />}
        {recording ? `録音を終了する(${fmt(seconds)})` : label}
      </button>
      {recording && (
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0', textAlign: 'center' }}>
          最長15分で自動的に終了します
        </p>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
