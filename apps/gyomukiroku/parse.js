// 話した業務メモを、業務記録の項目に分ける（AIを使わず、この端末の中だけで動く）
window.GyomuParse = (function () {
  function pad(n) { return String(n).padStart(2, "0"); }
  // 数字の書き方をそろえる：全角→半角、数字の間のカンマを消す、「5万2310」→52310
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); })
      .replace(/(\d)\s*[,，]\s*(?=\d)/g, "$1")
      .replace(/(\d+)\s*万\s*(\d{1,4})?/g, function (m, a, b) { return String(Number(a) * 10000 + (b ? Number(b) : 0)); });
  }
  // 数値に直す。0以下や数字でないものは null
  function toNum(v) {
    if (v == null || v === "") return null;
    var n = typeof v === "number" ? v : Number(norm(v).replace(/[^\d.]/g, ""));
    return isFinite(n) && n > 0 ? n : null;
  }
  function toHalf(s) {
    return norm(s).replace(/：/g, ":").replace(/，/g, "、").replace(/．/g, ".");
  }
  var KANJI = { "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  // 「十二時」「三十分」などの漢数字を数字に
  function kanjiNum(s) {
    return s.replace(/[一二三四五六七八九十〇]+(?=\s*(?:時|分|キロ))/g, function (k) {
      if (!/十/.test(k)) return k.split("").map(function (c) { return KANJI[c]; }).join("");
      var p = k.split("十"), tens = p[0] ? KANJI[p[0]] : 1, ones = p[1] ? KANJI[p[1]] : 0;
      return String(tens * 10 + ones);
    });
  }

  function findTime(t) {
    var m = t.match(/(午前|午後|朝|夜|夕方)?\s*(\d{1,2})\s*(?:時|:)\s*(半|\d{1,2})?\s*分?/);
    if (!m) return null;
    var h = +m[2], mi = m[3] === "半" ? 30 : m[3] ? +m[3] : 0;
    if ((m[1] === "午後" || m[1] === "夜" || m[1] === "夕方") && h < 12) h += 12;
    if (h > 23 || mi > 59) return null;
    return pad(h) + ":" + pad(mi);
  }
  function findOdo(t) {
    var m = t.match(/(?:メーター|メータ|ﾒｰﾀｰ|オドメーター|オド|ODO|距離計|走行)\D{0,6}(\d{3,7})/i) ||
      t.match(/(\d{4,7})\s*(?:km|ｋｍ|キロ)/i);
    return m ? toNum(m[1]) : null;
  }
  function findMinutes(t) {
    var m = t.match(/(\d{1,3})\s*分\s*(?:間)?\s*(?:の)?\s*(?:休憩|休み|昼休み)/) ||
      t.match(/(?:休憩|休み)\D{0,8}?(\d{1,3})\s*分/);
    if (m) return +m[1];
    var h = t.match(/(\d)\s*時間\s*(?:の)?\s*(?:休憩|休み)/) || t.match(/(?:休憩|休み)\D{0,6}?(\d)\s*時間/);
    return h ? +h[1] * 60 : null;
  }
  function cleanPlace(p) {
    if (!p) return null;
    p = p.replace(/^.*?(?:時半|時\d*分?|分)(?:に|ごろ|頃|から)?/, "")
      .replace(/^(?:まず|次に|それから|で|は|、)+/, "")
      .replace(/(?:の方|あたり|付近)$/, "")
      .trim();
    if (p.length < 2 || /\d{3,}|メーター|休憩|開始|終了/.test(p)) return null;
    return p;
  }

  // 1つの文（。や改行で区切ったもの）を読む
  function parseClause(t) {
    var type = "note";
    if (/開始|出発|スタート|出庫|始業|乗務始め/.test(t)) type = "start";
    else if (/終了|終わ|上が|帰庫|終業|戻って(?:終|おわ)|業務終わり/.test(t)) type = "end";
    else if (/休憩|休み|昼食|昼ごはん|ご飯/.test(t)) type = "break";
    else if (/回っ|回る|経由|通っ|寄っ|行った|行って/.test(t)) type = "waypoint";

    var time = findTime(t), odo = findOdo(t), min = type === "break" ? findMinutes(t) : null;
    // 開始・終了の時は、時刻ではない4〜7桁の数字をメーターとして拾う（「18時に終了、52398」など）
    if ((type === "start" || type === "end") && odo == null) {
      var rest = t.replace(/(午前|午後|朝|夜|夕方)?\s*\d{1,2}\s*(?:時|:)\s*(半|\d{1,2})?\s*分?/g, " ");
      var big = rest.match(/(\d{4,7})/);
      if (big) odo = toNum(big[1]);
    }
    var place = null, m;
    if ((m = t.match(/場所は\s*([^、。,]+)/))) place = cleanPlace(m[1]);
    if (!place && type === "start" && (m = t.match(/([^、。,\s]+?)\s*(?:から|を)\s*(?:乗務|出発|スタート|出庫)/))) place = cleanPlace(m[1]);
    if (!place && type === "end" && ((m = t.match(/([^、。,\s]+?)\s*に\s*(?:戻|帰|到着|着い)/)) || (m = t.match(/([^、。,\s]+?)\s*で\s*(?:終了|終わ|上が)/)))) place = cleanPlace(m[1]);
    if (!place && type === "break" && (m = t.match(/([^、。,\s]+?)\s*で\s*(?:\d+\s*分(?:間)?\s*)?(?:休憩|休み|昼)/))) place = cleanPlace(m[1]);

    if (type === "waypoint") {
      var w = t.match(/([^。]+?)\s*(?:を|に)\s*(?:回っ|回る|経由|通っ|寄っ|行っ)/);
      var names = w ? w[1].split(/と|、|,|・|や/).map(cleanPlace).filter(Boolean) : [];
      if (names.length) return names.map(function (n) { return { type: "waypoint", time: time, place: n, odometer: null, minutes: null, note: null }; });
      // 地点名が読み取れない時は、話した文をメモとして残す
      return [{ type: "note", time: time, place: null, odometer: null, minutes: null, note: t }];
    }
    return [{ type: type, time: time, place: place, odometer: odo, minutes: min, note: type === "note" ? t : null }];
  }

  function parse(text, nowHM) {
    var t = kanjiNum(toHalf(String(text || "")));
    var clauses = t.split(/[。\n]+|(?:、|,)\s*(?:それから|そのあと|その後|次に)/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = [];
    clauses.forEach(function (c) { out = out.concat(parseClause(c)); });
    // 「休憩、場所は〜」のように同じ文の続きに書いた場所を前の行に寄せる
    // 「終了。メーター〜」のように次の文に書いたメーターも前の行に寄せる
    var kept = [];
    out.forEach(function (e) {
      var prev = kept[kept.length - 1];
      if (prev && e.type === "note" && /^場所は/.test(e.note || "")) { prev.place = prev.place || cleanPlace(e.note.replace(/^場所は/, "")); return; }
      if (prev && e.type === "note" && e.odometer != null && prev.odometer == null && (prev.type === "start" || prev.type === "end") && /^(?:メーター|ODO|odo|オドメーター|\d)/.test(e.note || "")) { prev.odometer = e.odometer; return; }
      kept.push(e);
    });
    out = kept;
    out.forEach(function (e) { if (!e.time) e.time = nowHM; });
    return out;
  }
  return { parse: parse, norm: norm, toNum: toNum };
})();
