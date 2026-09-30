import dynamic from 'next/dynamic';

const App = dynamic(() => import('../components/App'), {
  ssr: false,
  loading: () => <div className="center-screen muted">読み込み中…</div>,
});

export default function Home() {
  return <App />;
}
