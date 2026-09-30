import { getAuthInstance } from './firebase';

// 歌詞の読み取りを担当するCloudflare WorkerのURL
export const WORKER_URL = 'https://keikocho.ksvox-nobu.workers.dev';

// 写真を読み取りに適した大きさ(長い辺2000px)のJPEGに縮小する
export function fileToJpeg(file, maxSide = 2000, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * ratio);
      const h = Math.round(img.naturalHeight * ratio);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を開けませんでした'));
    };
    img.src = url;
  });
}

// 画像(複数可・ページ順)から歌詞と曲名を読み取る
export async function scanLyrics(images) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const err = new Error('offline');
    err.offline = true;
    throw err;
  }
  const auth = getAuthInstance();
  const user = auth && auth.currentUser;
  if (!user) throw new Error('ログイン状態を確認できませんでした');
  const token = await user.getIdToken();

  const res = await fetch(`${WORKER_URL}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ images: images.map(({ mimeType, data }) => ({ mimeType, data })) }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json) {
    throw new Error((json && json.error) || `通信エラー(${res.status})`);
  }
  return { title: json.title || '', lyrics: json.lyrics || '' };
}
