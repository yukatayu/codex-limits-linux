# codex-status

`@openai/codex` が直前に書いた `~/.codex/sessions/**/*.jsonl` を読み、残量情報を取り出して表示する小さな補助ツールです。追加のログインや API 呼び出しは行いません。通常どおり ChatGPT アカウントで `codex` を使ったあと、そのセッションログを読むだけです。

このリポジトリには 3 つのスクリプトがあります。

- `./codex-limits`
  - 最新の Codex セッションから 5 時間枠と週次枠の残量を JSON で出します。
- `./byobu-codex-limits`
  - Byobu の右下表示向けに、週次枠だけを `74%(1d16h)` のような短い文字列に整形します。
- `./install-byobu-codex-status`
  - `~/.byobu` にカスタムステータススクリプトを登録し、5 分間隔で表示されるように設定します。

## 前提条件

- `codex` をこのマシンで一度は実行していること
- `~/.codex/sessions` に JSONL セッションログが残っていること
- Node.js が使えること
- Byobu は `tmux` バックエンドで使っていること

この実装は、コマンドを呼んだカレントディレクトリには依存しません。最新セッションファイルを自動で探します。

## 単体コマンドの使い方

残量の生データを確認したいときは次を実行します。

```bash
cd /path/to/codex-status
./codex-limits
```

出力例です。

```json
{
  "session_file": "/absolute/path/to/.codex/sessions/2026/04/20/rollout-....jsonl",
  "captured_at": "2026-04-20T01:23:45.678Z",
  "five_hour": {
    "remaining_percent": 94,
    "resets_at_unix": 1776629148,
    "resets_at_local": "2026-04-20T05:05:48+09:00"
  },
  "weekly": {
    "remaining_percent": 73,
    "resets_at_unix": 1776972712,
    "resets_at_local": "2026-04-24T04:31:52+09:00"
  }
}
```

`session_file` は実際には展開済みの絶対パスで返ります。README ではユーザー固有パスを避けるため、`/absolute/path/to/...` という汎用表記にしています。

Byobu 向けの短い表示だけ見たいときは次です。

```bash
cd /path/to/codex-status
./byobu-codex-limits
```

表示例:

```text
73%(3d18h)
```

意味は次のとおりです。

- `73%`: 週次利用枠の残り
- `3d18h`: リセットまで 3 日 18 時間

1 時間未満しか残っていない場合は `59m` のように分表示になります。
Byobu 経由では、この文字列がデフォルトテーマのアクセント色を使った背景付きバッジで表示されます。

## Byobu への組み込み手順

### 1. インストーラを実行する

```bash
cd /path/to/codex-status
./install-byobu-codex-status
```

このコマンドが行うことは次の 2 つだけです。

- `~/.byobu/status` の `tmux_right=` に `custom` を入れる
- `~/.byobu/bin/300_codex_limits` という実行スクリプトを作る
- `~/.byobu/bin/codex-status/` に必要なスクリプトをコピーする

`300_` という接頭辞は Byobu の更新間隔です。つまり 300 秒ごと、約 5 分ごとに表示が更新されます。
インストール後は Byobu 側が `~/.byobu/bin/codex-status/` のコピーを使うので、このリポジトリを別の場所へ移動しても Byobu 表示は壊れません。
デフォルトでは `custom` を `date time` の直前へ置くので、右端の時計の少し左に Codex 残量が出ます。

### 2. 正しく入ったか確認する

まず、カスタムスクリプト単体の出力を確認します。

```bash
./byobu-codex-limits
```

次に、Byobu が右下用に組み立てたステータス文字列を確認します。

```bash
byobu-status tmux_right
```

この出力のどこかに `73%(3d18h)` のような文字列が含まれていれば設定は通っています。

### 3. 既存セッションで表示を確認する

Byobu をすでに開いている場合でも、通常は右下表示が次の更新タイミングで切り替わります。すぐ確認したい場合は、その Byobu セッションを表示し直すか、新しいウィンドウを開いて右下を見てください。

## 表示順の変え方

`custom` は Byobu の予約トークン名です。ここは名前を変える場所ではなく、「Codex 表示をどこへ置くか」を表しています。実際の表示に `custom` という文字が出るわけではありません。

並び順を変えたいときは、`~/.byobu/status` の `tmux_right=` を編集して `custom` の位置だけ動かしてください。たとえば、現在のおすすめ配置は次の形です。

```sh
tmux_right="#network #disk_io #entropy raid reboot_required updates_available #apport #services #mail #users uptime #fan_speed #cpu_temp #battery #wifi_quality #processes #packages load_average #cpu_count #cpu_freq memory #swap disk #whoami #hostname #ip_address #time_utc custom date time"
```

もし時計よりもっと左へ寄せたいなら、たとえば `disk` の直後に移せます。

```sh
tmux_right="#network #disk_io #entropy raid reboot_required updates_available #apport #services #mail #users uptime #fan_speed #cpu_temp #battery #wifi_quality #processes #packages load_average #cpu_count #cpu_freq memory #swap disk custom #whoami #hostname #ip_address #time_utc date time"
```

この変更は `byobu-status tmux_right` を実行すればすぐ確認できます。通常は Byobu の右下表示も次の更新タイミングで追随します。

## 色について

Byobu 上の Codex 表示は、残量に応じて背景色が 3 段階で変わります。文字は通常ウェイトで、太字にはしません。

- 残り `50%` 以上: くすみ寄りの緑 `#2F855A`
- 残り `20%` 以上 `50%` 未満: 橙みのある黄色 `#C9922E`
- 残り `20%` 未満: くすみ寄りの赤 `#C0565B`
- 文字色: `BYOBU_LIGHT`
- バッジ終了後の復帰色: `BYOBU_DARK`

背景色は固定の 3 色ですが、文字色と復帰色は Byobu テーマに合わせます。つまり、Byobu 全体の明暗トーンは維持しつつ、Codex の残量だけが分かりやすく色分けされます。

## 仕組み

1. `codex` 実行後に `~/.codex/sessions` 以下へ JSONL ログが保存される
2. `codex-limits` が一番新しい JSONL を見つける
3. その中の `token_count` イベントから `codex` の rate limit 情報を拾う
4. `byobu-codex-limits` が週次だけ `XX%(YdZh)` に短縮する
5. Byobu が `~/.byobu/bin/300_codex_limits` を 5 分ごとに実行する

外部 API 呼び出しはありません。読み取り元はローカルファイルだけです。

## トラブルシュート

`n/a` と表示される場合:

- まだこのマシンで `codex` を実行していない
- 直近セッションの JSONL に `token_count` が入っていない
- `~/.codex/sessions` が通常の場所以外にある

別のセッション保存先を使う場合は、確認時だけ `CODEX_SESSIONS_DIR` を指定できます。

```bash
CODEX_SESSIONS_DIR=/path/to/sessions ./codex-limits
CODEX_SESSIONS_DIR=/path/to/sessions ./byobu-codex-limits
```

Byobu に出ない場合:

- `byobu-status tmux_right` を実行して `custom` が反映されているか確認する
- `sed -n '1,20p' ~/.byobu/bin/300_codex_limits` で `"$SCRIPT_DIR/codex-status/byobu-codex-limits"` を呼ぶ内容になっているか確認する
- `./byobu-codex-limits` 単体で期待どおりの文字列が出るか確認する

## 取り外し方法

元に戻したい場合は次を手で行えば十分です。

- `~/.byobu/bin/300_codex_limits` を削除する
- `~/.byobu/status` の `tmux_right=` から `custom` を外す
