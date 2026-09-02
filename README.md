# パチスカウト Live

スマホでデータ画面にかざす → 透かしで台判定（無料・写真保存なし）

## スマホで開く

**https://okome258.github.io/pachinko-scout/live.html**

## ファイル

| ファイル | 役割 |
|----------|------|
| `live.html` | メインUI |
| `score.js` | 判定ロジック（機種別） |
| `parser.js` | OCR結果の解析 |
| `machines.js` | 機種DB読み込み |
| `machines.json` | 機種スペック（週次更新） |

## 更新方法

GitHubに以下を追加アップロード:
- `machines.json`
- `machines.js`
- 更新した `live.html`, `score.js`, `parser.js`

## 機種の追加

`machines.json` にエントリを追加してpush。よく打つ機種名を `names` に入れる。
