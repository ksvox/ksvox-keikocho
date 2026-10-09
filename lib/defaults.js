// 保存済みの設定に「英語」がなければ、ブレスの次に1度だけ追加する
export const ENGLISH_CATEGORY = {
  id: 'c4',
  name: '英語',
  items: [
    { id: 'r13', name: 'アルファベット基礎', type: 'check' },
    { id: 'r14', name: 'アルファベット応用', type: 'check' },
    { id: 'r15', name: 'One to Ten', type: 'check' },
    { id: 'r16', name: 'その他', type: 'check' },
  ],
};

export const DEFAULT_SETTINGS = {
  classes: ['正門下生クラス', '門下生クラス', 'レッスン生クラス', 'ボイトレクラス', 'その他'],
  routineCategories: [
    {
      id: 'c1',
      name: '発声',
      items: [
        { id: 'r01', name: '基礎五十音', type: 'check' },
        { id: 'r02', name: '循環五十音', type: 'check' },
        { id: 'r03', name: 'だらだり発声', type: 'check' },
        { id: 'r06', name: 'ファルセット系', type: 'check' },
        { id: 'r07', name: 'インターバル系', type: 'check' },
        { id: 'r08', name: 'スケール系', type: 'check' },
        { id: 'r09', name: 'スタッカート系', type: 'check' },
        { id: 'r11', name: '音相系&調音系', type: 'check' },
      ],
    },
    {
      id: 'c2',
      name: 'ブレス',
      items: [
        { id: 'r04', name: 'ブレスデッサン', type: 'check' },
        { id: 'r10', name: 'ブレスコントロール系', type: 'check' },
      ],
    },
    {
      id: 'c4',
      name: '英語',
      items: [
        { id: 'r13', name: 'アルファベット基礎', type: 'check' },
        { id: 'r14', name: 'アルファベット応用', type: 'check' },
        { id: 'r15', name: 'One to Ten', type: 'check' },
        { id: 'r16', name: 'その他', type: 'check' },
      ],
    },
    {
      id: 'c3',
      name: '朗読',
      items: [
        { id: 'r05', name: '初恋朗読', type: 'check' },
        { id: 'r12', name: '朗読課題', type: 'reading' },
      ],
    },
  ],
  readingTasks: [
    '夢十夜・第一夜', '檸檬', '田舎教師', 'ごん狐', '舞姫',
    '山月記', 'でんでんむしのかなしみ', '蜜柑', '汚れつちまつた悲しみに', '人間椅子',
    '武蔵野', '婦系図', 'さぶ', '吾輩は猫である', '銀河鉄道の夜',
    '羅生門', 'たけくらべ', '蟹工船', '五重塔', '浮雲',
  ],
};

export const DEFAULT_SUMMARY_PROMPT = `これはボーカルスクール「K's VOX」のレッスン終わりの振り返り会話の録音です。雑談や世間話は除き、レッスンに関係する内容だけを抜き出してください。
・今日やったこと: その日のレッスンで実際に行った練習・曲・ルーティン
・できたこと: 上達した点、良くなった点
・課題: まだできていない点、注意された点
・次回・宿題: 次回のレッスンでやる予定、生徒が家でやってくる練習(手がかりになる言葉: 宿題、次回、来週、やってきて、復習、予習、確認、練習)
各項目は短い箇条書きにし、話されていない内容を推測で書かないこと。`;
