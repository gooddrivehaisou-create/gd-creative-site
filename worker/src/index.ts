// GD AI API — 「話すだけ手順書」と「声の業務記録」のための中継サーバー（Cloudflare Worker）
// APIキーはこのサーバーの中だけに置き、ブラウザには出さない。
// 決まった用途（手順書・翻訳・Q&A・業務記録・事故記録）のプロンプトだけを受け付ける。
import Anthropic from "@anthropic-ai/sdk";

export interface Env {
  ANTHROPIC_API_KEY: string;
  ACCESS_CODE: string;
  ALLOWED_ORIGINS: string;
  MODEL?: string;
}

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

const MAX_IMAGES = 10;
const MAX_IMAGE_B64 = 1_500_000; // 1枚あたり約1.1MBまで

// ---- JSON Schemas (structured outputs) ----
const str = { type: "string" };
const strArr = { type: "array", items: str };
const nullable = (t: string) => ({ anyOf: [{ type: t }, { type: "null" }] });

const MANUAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "purpose", "tools", "safety", "steps", "checklist", "questions"],
  properties: {
    title: str,
    summary: str,
    purpose: strArr,
    tools: strArr,
    safety: strArr,
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "point", "why", "frame"],
        properties: { action: str, point: str, why: str, frame: nullable("integer") },
      },
    },
    checklist: strArr,
    questions: strArr,
  },
};

const LOG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "time", "place", "odometer", "minutes", "note"],
        properties: {
          type: { type: "string", enum: ["start", "end", "break", "break_start", "break_end", "waypoint", "note"] },
          time: str,
          place: nullable("string"),
          odometer: nullable("number"),
          minutes: nullable("number"),
          note: nullable("string"),
        },
      },
    },
  },
};

const ACCIDENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["when", "where", "what", "why", "fix", "hurt"],
  properties: { when: str, where: str, what: str, why: str, fix: str, hurt: str },
};

// ---- helpers ----
function text(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-access-code",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
}

function responseText(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function callClaude(
  env: Env,
  opts: {
    content: Anthropic.Beta.BetaContentBlockParam[] | Anthropic.Beta.BetaMessageParam[];
    system?: string;
    schema?: Record<string, unknown>;
    effort: "low" | "medium" | "high";
  },
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Beta.BetaMessageParam[] =
    opts.content.length && "role" in opts.content[0]
      ? (opts.content as Anthropic.Beta.BetaMessageParam[])
      : [{ role: "user", content: opts.content as Anthropic.Beta.BetaContentBlockParam[] }];
  const res = await client.beta.messages.create({
    model: env.MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...(opts.system ? { system: opts.system } : {}),
    output_config: {
      effort: opts.effort,
      ...(opts.schema ? { format: { type: "json_schema", schema: opts.schema } } : {}),
    },
    messages,
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "refused");
  if (res.stop_reason === "max_tokens") throw new HttpError(502, "too_long");
  const out = responseText(res.content);
  if (!out.trim()) throw new HttpError(502, "empty");
  return out;
}

async function callJson<T>(env: Env, opts: Parameters<typeof callClaude>[1]): Promise<T> {
  const out = await callClaude(env, opts);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new HttpError(502, "invalid_json");
  }
}

// ---- routes ----
type Body = Record<string, unknown>;

async function manual(env: Env, b: Body) {
  const transcript = text(b.transcript, 12000).trim();
  const images = Array.isArray(b.images) ? b.images.slice(0, MAX_IMAGES) : [];
  for (const img of images) {
    if (typeof img !== "string" || img.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(img)) {
      throw new HttpError(400, "bad_image");
    }
  }
  if (transcript.length < 20 && images.length === 0) throw new HttpError(400, "too_short");
  const imgNote = images.length
    ? `\n添付の写真1〜${images.length}は、作業動画から時間順に切り出した場面です（写真の番号は添付の順）。映像から確かに読み取れる動作・道具は手順に入れてよい。映像だけでは確信できないこと（数値、理由、コツ）は作らず questions に入れる。各手順に最も合う写真の番号を frame に入れる（合う写真が無ければ null）。\n`
    : "\nframe は常に null にする。\n";
  const prompt =
    `あなたは製造・建設・介護などの現場の技能継承の専門家です。以下はベテランが話した内容の書き起こし${images.length ? "と、作業動画の場面写真" : ""}です。新人や外国人スタッフでも分かる作業手順書にしてください。\n` +
    "守ること:\n- 話や映像に出てこない数値・手順・道具を作らない。\n- 足りない情報や、確認すべきことは questions に入れる。\n- 文は短く、1つの手順に1つの動作。\n- 安全に関わることは safety に必ず入れる。\n- summary は1〜2文。point（コツ）と why（理由）は無ければ空文字。\n- purpose（この作業をする理由・目的）は、話の中の理由と「この作業をする理由」欄の内容から、短い文で1〜3つ。どちらにも無ければ空の配列にして、questions に「この作業をする目的は？」を入れる。" +
    imgNote +
    `\n作業名: ${text(b.task, 200)}\n業種: ${text(b.industry, 100)}\nこの作業をする理由（作る人のメモ）: ${text(b.purpose, 500) || "（なし）"}\n書き起こし:\n"""\n${transcript || "（なし。映像だけから作る）"}\n"""`;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map(
      (data): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: data as string },
      }),
    ),
    { type: "text", text: prompt },
  ];
  return callJson(env, { content, schema: MANUAL_SCHEMA, effort: "medium" });
}

async function translate(env: Env, b: Body) {
  const lang = text(b.lang, 80);
  const m = JSON.stringify(b.manual ?? {}).slice(0, 40000);
  if (!lang) throw new HttpError(400, "no_lang");
  const prompt = `次の作業手順書のJSONを${lang}に翻訳してください。構造はそのまま、文字列の値だけ訳す。frame の数値と、数値・単位はそのまま。現場の新人が読む想定で短く分かりやすく。\n\n${m}`;
  return callJson(env, { content: [{ type: "text", text: prompt }], schema: MANUAL_SCHEMA, effort: "low" });
}

async function ask(env: Env, b: Body) {
  const m = JSON.stringify(b.manual ?? {}).slice(0, 40000);
  const turns = (Array.isArray(b.turns) ? b.turns : [])
    .slice(-8)
    .filter(
      (t): t is { role: "user" | "assistant"; content: string } =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim() !== "",
    )
    .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") throw new HttpError(400, "no_question");
  const system =
    "あなたは会社の新人向けQ&Aボットです。次の作業手順書だけを根拠に、新人の質問に短く（3文以内）やさしく答えてください。手順書に書いていないことは推測せず「手順書には書いていません。ベテランに確認してください」と答える。安全に関わる質問では必ず注意を添える。質問と同じ言語で答える。\n\n手順書:\n" +
    m;
  const answer = await callClaude(env, { content: turns, system, effort: "low" });
  return { text: answer };
}

async function log(env: Env, b: Body) {
  const t = text(b.text, 2000).trim();
  if (!t) throw new HttpError(400, "empty_text");
  const prompt =
    `軽貨物ドライバーが話した業務メモを、業務記録の項目に分けてください。今日は${text(b.date, 10)}、今の時刻は${text(b.now, 5)}。\n` +
    "守ること: 話に出てこない地名や数値を作らない（無ければ null）。時刻は HH:MM。時刻が話に無ければ今の時刻を入れる。休憩の長さが分かれば minutes に入れて type は break。経過地点が複数なら waypoint を地点ごとに分ける。メーターの数値は odometer（km）。\n\n" +
    `メモ:"""${t}"""`;
  return callJson(env, { content: [{ type: "text", text: prompt }], schema: LOG_SCHEMA, effort: "low" });
}

async function accident(env: Env, b: Body) {
  const t = text(b.text, 3000).trim();
  if (!t) throw new HttpError(400, "empty_text");
  const prompt =
    `軽貨物ドライバーが話した事故の内容を、事故記録の項目に分けてください。今日は${text(b.date, 10)}。話に無いことは作らず空文字にする。原因と再発防止策は、話の内容から具体的に短く書く（話に原因の手がかりが無ければ空文字）。\n\n内容:"""${t}"""`;
  return callJson(env, { content: [{ type: "text", text: prompt }], schema: ACCIDENT_SCHEMA, effort: "low" });
}

const ROUTES: Record<string, (env: Env, b: Body) => Promise<unknown>> = {
  "/manual": manual,
  "/translate": translate,
  "/ask": ask,
  "/log": log,
  "/accident": accident,
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health") return json({ ok: true }, 200, cors);
    const route = ROUTES[url.pathname];
    if (req.method !== "POST" || !route) return json({ error: "not_found" }, 404, cors);
    if (!cors["Access-Control-Allow-Origin"]) return json({ error: "origin_not_allowed" }, 403, cors);
    if (!env.ACCESS_CODE || req.headers.get("x-access-code") !== env.ACCESS_CODE) {
      return json({ error: "bad_access_code" }, 401, cors);
    }
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json({ error: "bad_json" }, 400, cors);
    }
    try {
      return json(await route(env, body), 200, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status, cors);
      if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429, cors);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: "server_key" }, 500, cors);
      if (e instanceof Anthropic.BadRequestError) {
        console.error("Bad request:", e.message);
        return json({ error: "bad_request" }, 400, cors);
      }
      if (e instanceof Anthropic.APIError) {
        console.error(`API error ${e.status}:`, e.message);
        return json({ error: "upstream" }, 502, cors);
      }
      console.error(e);
      return json({ error: "server" }, 500, cors);
    }
  },
};
