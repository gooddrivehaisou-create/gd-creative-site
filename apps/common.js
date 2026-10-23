// 2つのアプリで共通の処理：AI中継サーバーの呼び出し、合言葉、端末内の保存、ファイルの受け取り
window.GD = (function () {
  var CODE_KEY = "gd-access-code";

  var ERRORS = {
    not_configured: "AIの準備がまだできていません（管理者の方：apps/config.js にサーバーのURLを入れてください）。",
    network: "通信できませんでした。電波の良い所でもう一度押してください。",
    bad_access_code: "合言葉が違います。もう一度押して、正しい合言葉を入れてください。",
    no_code: "合言葉を入れると使えます。",
    rate_limited: "混み合っています。少し待ってからもう一度押してください。",
    refused: "この内容では作れませんでした。文章を変えてください。",
    too_short: "話した内容をもう少し入れるか、作業の動画を貼ってください。",
    bad_image: "写真を送れませんでした。動画を選び直してください。",
    invalid_json: "AIの返事をうまく読み取れませんでした。もう一度押してください。",
    too_long: "内容が長すぎます。分けて入れてください。",
    cancelled: "止めました。",
  };
  function errorText(e) {
    return (e && ERRORS[e.code]) || "うまくいきませんでした。もう一度押してください。";
  }

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // 合言葉を聞く小さな画面
  function askCode() {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "gd-modal";
      wrap.innerHTML =
        '<form class="gd-modal-box"><h2>合言葉を入れてください</h2>' +
        '<p>このアプリは招待された方だけが使えます。管理者から聞いた合言葉を入れてください。この端末に覚えておきます。</p>' +
        '<input type="password" id="gd-code" autocomplete="off" aria-label="合言葉">' +
        '<div class="gd-modal-btns"><button type="button" class="gd-cancel">やめる</button><button type="submit">OK</button></div></form>';
      document.body.appendChild(wrap);
      var input = wrap.querySelector("#gd-code");
      input.focus();
      function done(v) {
        wrap.remove();
        resolve(v);
      }
      wrap.querySelector("form").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var v = input.value.trim();
        if (v) {
          try { localStorage.setItem(CODE_KEY, v); } catch (e) {}
        }
        done(v);
      });
      wrap.querySelector(".gd-cancel").onclick = function () { done(""); };
    });
  }

  async function api(path, body, signal) {
    var base = (window.GD_API_BASE || "").replace(/\/$/, "");
    if (!base) throw { code: "not_configured" };
    var code = "";
    try { code = localStorage.getItem(CODE_KEY) || ""; } catch (e) {}
    if (!code) code = await askCode();
    if (!code) throw { code: "no_code" };
    var res;
    try {
      res = await fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": code },
        body: JSON.stringify(body),
        signal: signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw { code: "cancelled" };
      throw { code: "network" };
    }
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) {
      try { localStorage.removeItem(CODE_KEY); } catch (e) {}
      throw { code: "bad_access_code" };
    }
    if (!res.ok) throw { code: (data && data.error) || "server" };
    return data;
  }

  function download(filename, data, mime) {
    var blob = new Blob([data], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // モーダルの見た目（各ページの色トークンを使う）
  var css = document.createElement("style");
  css.textContent =
    ".gd-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:50;padding:16px}" +
    ".gd-modal-box{background:var(--surface);color:var(--ink);border-radius:16px;padding:20px;max-width:360px;width:100%;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}" +
    ".gd-modal-box h2{font-size:18px;margin:0}.gd-modal-box p{margin:0;font-size:13.5px;color:var(--muted)}" +
    ".gd-modal-box input{font:inherit;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}" +
    ".gd-modal-btns{display:flex;gap:8px;justify-content:flex-end}" +
    ".gd-modal-btns button{font:inherit;font-weight:700;border-radius:10px;padding:9px 16px;border:0;cursor:pointer}" +
    ".gd-modal-btns button[type=submit]{background:var(--accent,var(--a,var(--b)));color:var(--on-accent,#fff)}" +
    ".gd-modal-btns .gd-cancel{background:transparent;color:var(--muted)}";
  document.head.appendChild(css);

  return { api: api, load: load, save: save, download: download, errorText: errorText };
})();
