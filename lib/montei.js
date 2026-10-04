// 門弟アプリとの連携
import { getAuthInstance } from './firebase';

export async function callMontei(action, payload = {}) {
  const user = getAuthInstance()?.currentUser;
  if (!user) throw new Error('ログインし直してください。');
  const idToken = await user.getIdToken();
  const res = await fetch('/api/montei', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action, idToken }),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* noop */ }
  if (!res.ok) throw new Error(data.error || '門弟アプリと通信できませんでした。');
  return data;
}

export function memberLabel(m) {
  if (!m) return '';
  const name = m.realName || m.nickname || m.memo || m.email;
  return m.nickname && m.realName ? `${m.realName}(${m.nickname})` : name;
}
