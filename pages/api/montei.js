// 稽古帳 → 門弟アプリ への中継(ログイン情報は門弟アプリ側で確認する)
const MONTEI_URL = process.env.MONTEI_URL || 'https://montei.ksvox.net';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  try {
    const r = await fetch(`${MONTEI_URL}/api/keikocho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* noop */ }
    res.status(r.status).json(r.ok ? data : { error: data.error || '門弟アプリでエラーが発生しました。' });
  } catch (e) {
    res.status(502).json({ error: '門弟アプリにつながりませんでした。ネット接続を確認してください。' });
  }
}
