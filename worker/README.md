# GD AI API（AI中継サーバー）

「話すだけ手順書」（`apps/tejunsho/`）と「声の業務記録」（`apps/gyomukiroku/`）が使うAIの中継サーバーです。
Claudeのアカウントを持っていない人でもアプリを使えるように、AnthropicのAPIキーはこのサーバーの中だけに置き、アプリ（ブラウザ）には出しません。

- 置き場所：Cloudflare Workers（無料プランで開始できます）
- AIの料金：あなたのAnthropic APIアカウントに請求されます
- 使える人：合言葉（`ACCESS_CODE`）を知っている人だけ
- 呼び出せるページ：`ALLOWED_ORIGINS` に書いたサイトだけ

## 公開の手順（最初の1回だけ）

1. Anthropicのコンソール（https://platform.claude.com ）でAPIキーを作り、支払い設定と月の上限額を決める
2. Cloudflareのアカウントを作る（https://dash.cloudflare.com/sign-up ）
3. パソコンでこのフォルダを開いて、次を順に実行する

```bash
cd worker
npm install
npx wrangler login                        # ブラウザでCloudflareにログイン
npx wrangler secret put ANTHROPIC_API_KEY # 1で作ったAPIキーを貼る
npx wrangler secret put ACCESS_CODE       # 配る合言葉を決めて入れる
npx wrangler deploy                       # 公開。最後に https://gd-ai-api.〇〇.workers.dev が表示される
```

4. 表示されたURLを `apps/config.js` の `window.GD_API_BASE` に入れて、GitHubに反映する
5. スマホで次を開いて、合言葉を入れて試す
   - https://gooddrivehaisou-create.github.io/gd-creative-site/apps/tejunsho/
   - https://gooddrivehaisou-create.github.io/gd-creative-site/apps/gyomukiroku/

動作確認：`https://gd-ai-api.〇〇.workers.dev/health` を開いて `{"ok":true}` と出ればサーバーは動いています。

## 設定を変えるとき

- 合言葉を変える：`npx wrangler secret put ACCESS_CODE` をもう一度（配った人には新しい合言葉を伝え直す）
- 使うAIモデルを変える：`wrangler.toml` の `MODEL`（例：費用を抑えたい時は `claude-haiku-5-5`）→ `npx wrangler deploy`
- 別のサイトからも使う：`wrangler.toml` の `ALLOWED_ORIGINS` にURLを足す → `npx wrangler deploy`

## 中身

| 呼び出し先 | 用途 |
|---|---|
| `POST /manual` | 書き起こしと動画の場面写真（最大10枚）から手順書を作る |
| `POST /translate` | 手順書を他の言語に訳す |
| `POST /ask` | 手順書だけを根拠に新人の質問に答える |
| `POST /log` | ドライバーの話を業務記録の項目に分ける |
| `POST /accident` | 事故の話を事故記録の項目に分ける |

決まった用途のプロンプトしか受け付けないので、APIキーを何にでも使われることはありません。
AIが安全上の理由で断った場合は、Anthropicが勧める別のモデルで自動的にやり直します（`fallbacks: "default"`）。
