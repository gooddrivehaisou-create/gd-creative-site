// AI中継サーバー（Cloudflare Worker）のURL。worker/ を公開したら、表示されたURLをここに入れる。
// 例: window.GD_API_BASE = "https://gd-ai-api.example.workers.dev";
window.GD_API_BASE = "";

// 手順書サービス（パターンA）の名前と連絡先。撮り方ガイド・納品ページに出す
window.GD_CONTACT = {
  brand: "GD STEP",          // サービス名
  tagline: "撮るだけ手順書",   // 説明
  name: "Good Drive",        // LINE公式アカウントの表示名
  line: "@440sfhjn",         // LINE公式アカウントのID
};

// 声の業務記録 → Googleスプレッドシート連携。Apps Script の「ウェブアプリのURL」を入れる（空なら連携しない）
window.GD_SHEET = {
  url: "https://script.google.com/macros/s/AKfycbxODT1plgiO98o2wnaVwLsvoZBURP-Azc1vKMYxUYskIkeqcb7pRe-Q_cc-EbigLMCJ/exec",
};
