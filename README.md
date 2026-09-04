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

## メッセ武蔵境・パチンコ台データ調査（2026-09-05）

対象店舗はメッセ武蔵境店（東京都武蔵野市境1-2-24、P-WORLD上はパチンコ493台）です。

| 提供元 | URL | 公開項目・期間 | HTML/自動取得の扱い |
|---|---|---|---|
| 台データオンライン | `https://daidata.goraggio.com/100686` | 当日スタート、累計スタート、大当り、初当り、確率、最大出玉、スランプグラフ。アプリでは過去7日グラフ。 | 一般向けAPI/CSVは未確認。規約はデータベースの複製等を禁止するため、collector対象外。 |
| サイトセブン | `https://m.site777.jp/f/D0100.do?pmc=13197018` | 当り回数、確率、出玉、グラフ、履歴。最短30分更新、項目と更新頻度はホール依存。 | API/CSVは未確認。規約第9条1項11号が自動取得ツールによる取得・加工を禁止するため、collector対象外。 |
| P-WORLD | `https://www.p-world.co.jp/tokyo/messe-musashisakai.htm` | 店舗住所、営業時間、遊技料金、設置台数・機種情報。 | 台別の当日／過去成績は公開していない。店舗マスタ確認用。 |
| みんレポ パチンコ版 | `https://min-repo.com/pachinko/967968/?kishu=all` | 日付、機種、台番、差玉、回転数。機種平均差玉・平均回転数・勝率、末尾別集計も公開。 | `table` の見出しは `機種 / 台番 / 差玉 / 回転数`。過去レポートは公開済み日だけ。自動取得の明示許可・API・CSVは未確認のため、本リポジトリではURLを直接取得しない。ローカル保存したHTMLを1ページずつ解析する。 |
| アナスロ | 公開検索でメッセ武蔵境のパチンコ台別ページを確認できず | — | collector対象外。 |

みんレポは「データ引用時は該当ページへのリンクを掲載」と案内していますが、自動収集の許可ではありません。台データオンライン／サイトセブンの制限を回避する実装、ログイン・CAPTCHA・非公開APIの利用はしません。

### 実装済みの安全な取込経路

`scripts/import_messe_pachinko_html.py` は、通常のブラウザで利用者自身が保存した **みんレポの全台HTML 1ページ** を読むだけです。ネットワークアクセスは行いません。

```powershell
python scripts/import_messe_pachinko_html.py `
  --html saved-report.html `
  --source-url "https://min-repo.com/pachinko/967968/?kishu=all" `
  --db data/messe_pachinko.sqlite
```

SQLiteには日付・台番・機種名・差玉・回転数・取得元URL・取込時刻をUPSERTします。BB/RB・初当り・総スタート・最大出玉は当該みんレポ全台表に含まれないため空欄です。
