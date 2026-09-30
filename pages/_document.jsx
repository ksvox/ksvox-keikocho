import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="ja">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="稽古帳" />
        <meta name="theme-color" content="#FFFFFF" />
        {/* 検索エンジンに登録させない */}
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
