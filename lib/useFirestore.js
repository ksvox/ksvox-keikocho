import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

export function useDocData(ref, deps) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    if (!ref) {
      setData(null);
      return undefined;
    }
    const unsub = onSnapshot(
      ref,
      (snap) => setData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => {
        console.warn(err);
        setData(null);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function useCollectionData(ref, deps) {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    if (!ref) {
      setData([]);
      return undefined;
    }
    const unsub = onSnapshot(
      ref,
      (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.warn(err);
        setData([]);
      }
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
