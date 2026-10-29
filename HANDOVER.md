# HANDOVER.md — 観戦カレンダー 2026-27 引き継ぎ資料

- 作成日: 2026-10-09
- 基準コミット: `672e435`（`main` / `origin/main` と一致、本番公開中の `index.html`・`data.js` とも一致を確認済み）
- 経緯: Claudeの通常チャットで作成 → Claude Codeに引き継いで開発 → 本資料でOpenAI Codexへ引き継ぎ
- 記載は2026-10-09時点の調査結果。「推定」と書いた項目はコードを読んだだけで、実際には再現していない

## 1. アプリの概要

宇都宮ブレックス（バスケ）、セレッソ大阪（サッカー）、日本代表（バスケ・サッカー）の試合日程を1つのカレンダーにまとめ、「行く／できたら／値段次第」の観戦予定とメモを記録する個人用Webアプリ。対象シーズンは2026-27（2026年8月〜2027年6月）。

- 公開URL: https://maccheroni8.github.io/my-calendar/
- リポジトリ: https://github.com/maccheroni8/my-calendar （公開リポジトリ）
- 利用者はオーナー本人のみ（PC・iPhone）。ログイン機能はない

## 2. 実装済み機能

| 機能 | 内容 |
|---|---|
| カレンダー表示 | 月表示。祝日・今日のハイライト、チームロゴ付きタイル。幅600px以下はスマホ用タイル表示 |
| リスト表示 | 月ごとのセクション、チーム別サマリーカード、マーク件数。PCは縦/横レイアウト切替、スマホは専用カード表示 |
| 試合データ | ブレックス64件、セレッソ51件（カップ戦含む）、日本代表20件（バスケ/サッカー）。`data.js` に定義 |
| チーム表示切替 | ブレックス／セレッソ／日本代表（バスケ）／日本代表（サッカー）／追加試合 のチップで表示・非表示 |
| 観戦マーク | 行く／できたら／値段次第を複数選択可。マークで絞り込む複数選択フィルタあり |
| メモ | 試合ごとの自由記述 |
| 試合詳細ポップアップ | 会場・時刻、マーク、メモ。終了した試合は「vs」の位置にスコアを表示（例: セレッソ大阪 2-0 柏レイソル） |
| 試合の追加・削除 | ＋ボタンから任意の試合を追加（バスケ/サッカー、チームA必須・チームB任意、日付、時刻、マーク、メモ）。削除は追加した試合のみ |
| スコア表示 | 終了した試合の勝敗・スコアをカレンダー・リスト・ポップアップに表示（自動取得） |
| 同期 | Firestoreのリアルタイム購読。別端末の変更も反映される |

デザインはApple風（Plus Jakarta Sans、角丸・影の統一、ライン型アイコン）。

## 3. 技術構成

- フロント: **`index.html` 1ファイル**（CSSとJavaScriptを埋め込み、素のJavaScript、ES module、ビルド工程なし）
- DB: Firebase Firestore（Web SDK 10.12.0 を `gstatic.com` のCDNから読み込み）
- スコア取得: Node.jsスクリプト（`cheerio` でHTML解析、`firebase-admin` でFirestoreへ書き込み）
- 自動実行: GitHub Actions（毎日cron）
- 公開: GitHub Pages（`main` ブランチのルート）
- 外部参照: Google Fonts、ロゴ画像のホットリンク（`bleague.bl.kuroco-img.app`、`cerezo.jp`、`upload.wikimedia.org`）
- テスト・Linter・ビルド: なし

## 4. ディレクトリ構成

```
my-calendar/
├── index.html                      本体（CSS＋JS埋め込み）
├── data.js                         試合日程（BREX / CEREZO / JAPAN）。index.htmlとスコア取得で共有
├── assets/jba-logo.png             日本代表のロゴ
├── scripts/fetch-scores.mjs        スコア自動取得スクリプト
├── .github/workflows/fetch-scores.yml  スコア取得の定期実行
├── package.json / package-lock.json    依存は cheerio と firebase-admin のみ
├── .gitignore                      node_modules/ のみ
├── HANDOVER.md / AGENTS.md         本資料 / Codex向けルール
├── design-canvas/                  【未追跡】デザイン検討用の成果物。アプリの動作とは無関係
├── node_modules/                   【gitignore】
└── .DS_Store                       【未追跡・ignore未設定】
```

### index.html の読み方

- **8行目と10行目は巨大なbase64のファビコン**で、全体で約1.9MBある主因。読み込むときは11行目以降を指定すること（行番号は変わりうるので、関数名で検索するのが確実）
- `<style>` は約15〜278行、`<script type="module">` は約433行以降
- 主な内容（上から順）: Firebase初期化 → `ICO_PATHS` / `ic()`（インラインSVGアイコン）→ チーム一覧（`BPREMIER`/`BONE`/`BNEXT`/`J1`〜`J3`）→ `ABBR`（略称）・`TEAM_LOGO` → 状態変数 → Firebase同期 → マーク・メモ・スコア取得関数 → `allEvs()`（表示対象の抽出）→ フィルタ → `renderCal()`/`makeCell()`/`renderList()` → `openPopup()` → 試合追加モーダル → 初期化
- スマホ判定は `isMobile()`（`window.innerWidth<=600`）。モバイル用CSSは `@media(max-width:600px)`

## 5. GitHub Pagesへの公開方法

- `main` にpushすると、GitHubが自動でPagesをビルド・公開する（`pages-build-deployment`、おおむね1分以内）
- **ステージング環境はなく、pushがそのまま本番反映**になる
- ローカルでの表示確認は、ES moduleのため `file://` では動かない。ディレクトリで簡易サーバーを立てる（例: `python3 -m http.server 8642`）。**ただしローカルでも本番Firestoreに接続される**（次章）

## 6. Firebaseとの連携

設定値（`firebaseConfig`）は `index.html` 内に直書きされている（Webアプリ用の公開設定値。この資料には転記しない）。開発用・テスト用のFirebaseプロジェクトはなく、**ローカルでも本番Firestoreを参照する**。

| ドキュメント | 内容 | 書き込み元 |
|---|---|---|
| `calendar/user_data` | `marks`・`memos`・`customGames`・`updatedAt` | ブラウザ（変更の約0.8秒後にデバウンスして `setDoc` で全体を保存） |
| `calendar/scores` | `results` マップ。キーは `{チームキー}_{YYYY-MM-DD}`、値は `{result, myScore, opScore, updatedAt}` | GitHub Actions（Admin SDK） |

- マーク・メモのキー: `{チーム}_{日付}_{配列の添字}`（チームは `brex`/`cerezo`/`japan`/`custom`）。**添字は `data.js` の配列、または `customGames` 配列の位置**（既知の問題1を参照）
- スコアのチームキー: `brex` / `cerezo` / `japan_basket` / `japan_soccer`
- **セキュリティルールはリポジトリに無く、Firebaseコンソールで管理**している。2026-09時点でオーナーが公開したルールは次の通り（以降の変更は未確認）:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /calendar/user_data {
      allow read, write: if true;
    }
    match /calendar/scores {
      allow read: if true;
    }
  }
}
```

- 過去の障害: `calendar/scores` の読み取りルールが無く、スコアが一切表示されなかった（2026-09-15に上記ルールを追加して解消）。`index.html` のスコア購読はエラー時に何もしないため、権限エラーが画面に出ない作りになっている

## 7. スコア自動取得の仕組み

1. `.github/workflows/fetch-scores.yml` が毎日 `cron: '10 15 * * *'`（UTC、日本時間0:10）に起動。実際の起動はGitHubの混雑で数時間遅れることがあり、直近の実行は日本時間の朝（UTC 18〜22時）だった。手動実行（`workflow_dispatch`）も可能
2. `scripts/fetch-scores.mjs` が Yahoo!スポーツナビのチーム日程ページ4つ（ブレックス、セレッソ、日本代表バスケ、日本代表サッカー）を取得
3. 「試合終了」の行だけを抽出。Yahooの表には月日しかなく年が無いため、`data.js` の日程のうち**今日以前の日付**とだけ月日で突き合わせる（未来の試合や別大会との誤マッチ防止）
4. 結果を `calendar/scores` に `merge` で書き込む
5. 認証はGitHub Secret `FIREBASE_SERVICE_ACCOUNT`（値はリポジトリにも本資料にも無い）
6. ブラウザ側は `onSnapshot` で `calendar/scores` を購読し、`getScore()` でチームキー＋日付から引いて表示する

制約: 追加試合（`custom`）はスコア対象外。キーが「チーム＋日付」なので、同じチームが同日に2試合あると衝突する。YahooのHTMLクラス名に依存する（変更されると取得できなくなる）。

## 8. 既知の問題・リスク

1. **マーク・メモのキーが配列の添字に依存**（最重要）
   - `data.js` の途中に試合を挿入・削除・並べ替えすると、それ以降の試合のキーがずれ、既存のマーク・メモが別の試合に紐づく／外れる。末尾への追加のみ安全
   - `deleteCustomGame()` は `customGames.splice(idx,1)` で詰めるが、後続の追加試合のマーク・メモのキーを付け替えていないため、後続の追加試合のマーク・メモが外れる可能性がある（コードからの推定。本番データを壊すため再現していない）
2. **Firestoreルールが緩い**: `calendar/user_data` は誰でも読み書き可能。リポジトリが公開で設定値も載っているため、第三者がデータを書き換えられる状態。ルールがGit管理外な点も含めて、方針の判断はオーナーが行う
3. **テスト環境がない**: ローカル確認でも本番データを書き換える。書き込みを伴う操作（マーク変更、メモ保存、試合追加・削除）での動作確認はしないこと
4. **保存が全体上書き**: `saveToFirebase()` は `marks`・`memos`・`customGames` を `setDoc`（`merge` なし）でまとめて保存する。複数端末で同時に編集すると、後勝ちで上書きされる余地がある（推定）
5. **スコア取得の脆さ**: Yahoo!スポーツナビのHTML構造・クラス名に依存。取得失敗時はワークフローのログにだけ出る
6. **カップ戦のポップアップ表示**: ポップアップの相手名にはカップ名（`ev.cup||ev.op`）が使われるため、カップ戦はタイトルが「セレッソ大阪 vs ルヴァンカップ」のようになる（コードからの推定。スコアが付く場合も同じ位置に入る）
7. **シーズン固定**: 表示範囲（2026-08〜2027-06）、日付入力の `min`/`max`、祝日リスト、`<title>` が固定値。来季は `index.html` と `data.js` の手作業更新が必要
8. **画像のホットリンク**: ロゴが外部サイトの画像URLに依存しており、相手側の変更・削除で表示が崩れる
9. **`data.js` 冒頭コメントが古い**: 「index.html側の表示用データは変更していない」とあるが、実際は `index.html` が `data.js` を読み込んでいる（`index.html` に日程の重複定義は無い）
10. **ワークフローのNode指定が古い**: `node-version: '20'` だが、実行時はNode 24に強制され、非推奨の警告が出る
11. **アクセシビリティ**: viewportが `maximum-scale=1.0, user-scalable=no` でピンチズームを禁止している
12. **未整理のファイル**: `.DS_Store` が `.gitignore` に無い。`design-canvas/` は意図的に未コミット

## 9. 今後の開発上の注意点

- 変更前に、関連する関数を検索して既存仕様を読む。`index.html` は1ファイルに集約されているため、関数名での検索が有効
- 変更は最小限にとどめる。マーク枠の二重・三重リング表現（`.day-cell.marked-*`、`.event.mk-*`）は複数マークの表現として機能的に必須なので、触る場合は慎重に
- 試合日程の追加は `data.js` の**配列の末尾**に行う（既知の問題1）
- スコア取得スクリプトをローカルで動かすと**本番Firestoreに書き込む**（サービスアカウントが必要）。実行しない
- 動作確認は、書き込みを伴わない範囲（表示切替、フィルタ、ポップアップの開閉、スマホ幅での見た目）に限る。保存を伴う確認が必要な場合は、オーナーが自分の判断で行う
- 動作確認はオーナー自身が行う前提で引き継ぐ（AIが「動作確認済み」と断定しない）
- コミットメッセージは既存の英語・命令形（例: `Fix custom added games showing as Cerezo in list view`）に合わせる

## 10. カップ戦の確定情報・ロゴ反映（2026-10-29、公開前）

- `schedule-data.js` にスポーツナビで確認した初期確定情報を保持し、`schedule.js` で元の日程に重ねる。`data.js` の日付・配列位置は変更していない。
- 天皇杯3回戦（CEREZOの46番）は表示日が2026-10-07、保存キーの日付は従来の2026-09-23。画面上の `storageDate` をマーク・メモ・ポップアップへ引き継ぐ。スコアは実際の開催日で参照する。
- 定期取得で `scripts/parse-fixtures.mjs` がセレッソのカップ戦とサッカー日本代表の確定情報を抽出し、既存の `calendar/scores` に `fixtures` マップを追加保存する。キーは `cerezo_{元の配列位置}` / `japan_soccer_{JAPANでの元の配列位置}`。従来の `results` と同じ購読で表示更新するため、Firestoreのルール追加は不要。
- カップ戦は大会・ラウンド・第1/2戦・年で照合。日本代表は試合URLの年月日で照合する。同一候補が複数ある場合、相手未定、対象外の年、試合URLに年がない場合は更新しない。取得できない既存情報はmergeで維持する。
- クラブはスポーツナビのロゴ、代表は国旗を使用。読み込めない画像は相手名に切り替える。
- 確定情報取得は既存の毎日のActionsで実行される。ローカルで `fetch-scores.mjs` を実行しないこと。今回、本番Firestoreへの書き込み・コミット・push・Actions実行は行っていない。
- 保存を伴わないユーザー確認：10月の天皇杯3回戦が10/7に表示されること、カレンダーとリストの両方で従来のマーク・メモが表示されること、各カップ戦の相手とロゴ、日本代表の相手国旗、430px幅の表示を確認する。
