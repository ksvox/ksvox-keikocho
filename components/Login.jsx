import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';

const EMAIL_KEY = 'keikocho-email';

export default function Login({ auth }) {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_KEY) || '';
    } catch (e) {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      localStorage.setItem(EMAIL_KEY, email.trim());
    } catch (e) {
      const code = e && e.code ? e.code : '';
      if (code.includes('network')) setError('ネットに接続できません。接続してからもう一度お試しください。');
      else if (code.includes('too-many')) setError('試行回数が多すぎます。少し時間をおいてお試しください。');
      else setError('メールアドレスかパスワードが違います。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="center-screen" style={{ flex: 1 }}>
        <h1 className="login-title">K's VOX 稽古帳</h1>
        <div className="gold-rule" />
        <div className="card login-card">
          <label className="field">
            <span>メールアドレス</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn primary big" style={{ fontSize: 20, padding: 16 }} onClick={submit} disabled={busy || !email || !password}>
            {busy ? '確認中…' : '入室'}
          </button>
        </div>
      </div>
    </div>
  );
}
