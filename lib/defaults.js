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
