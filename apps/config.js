// AI中継サーバー（Cloudflare Worker）のURL。worker/ を公開したら、表示されたURLをここに入れる。
// 例: window.GD_API_BASE = "https://gd-ai-api.example.workers.dev";
window.GD_API_BASE = "";

// 撮り方ガイド・納品ページに出す連絡先（空なら「担当者」とだけ表示）
window.GD_CONTACT = {
  name: "Good Drive",
  line: "@440sfhjn",   // LINE公式アカウントのID
};

// 声の業務記録 → Googleスプレッドシート連携。Apps Script の「ウェブアプリのURL」を入れる（空なら連携しない）
window.GD_SHEET = {
  url: "https://script.google.com/macros/s/AKfycbxODT1plgiO98o2wnaVwLsvoZBURP-Azc1vKMYxUYskIkeqcb7pRe-Q_cc-EbigLMCJ/exec",
};
