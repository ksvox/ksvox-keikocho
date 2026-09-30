import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getFirestore,
} from 'firebase/firestore';

const CONFIG_KEY = 'keikocho-firebase-config';

let auth = null;
let db = null;

// Firebaseの設定値をサーバー(環境変数)から受け取り、iPadにも保存しておく。
// 2回目以降はネットがなくても保存済みの設定値で起動できる。
export async function loadFirebaseConfig() {
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch (e) {
    cached = null;
  }

  const fetchLatest = fetch('/api/firebase-config', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (c && c.apiKey && c.projectId) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
        return c;
      }
      return null;
    })
    .catch(() => null);

  if (cached && cached.apiKey) {
    return cached;
  }
  return await fetchLatest;
}

export function initFirebase(config) {
  if (!auth) {
    const app = getApps().length ? getApps()[0] : initializeApp(config);
    auth = getAuth(app);
    try {
      // iPad内に記録を保存し、オフラインでも読み書きできるようにする
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
      });
    } catch (e) {
      db = getFirestore(app);
    }
  }
  return { auth, db };
}

export function getDb() {
  return db;
}

export function getAuthInstance() {
  return auth;
}
