// デプロイナウの環境変数からFirebaseの設定値を渡す
export default function handler(req, res) {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  };
  res.setHeader('Cache-Control', 'no-store');
  if (!config.apiKey || !config.projectId) {
    res.status(500).json({ error: 'Firebaseの環境変数が未設定です' });
    return;
  }
  res.status(200).json(config);
}
