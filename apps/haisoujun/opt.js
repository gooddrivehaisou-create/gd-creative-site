// 配達順の計算（地図・画面に関係しない部分）。ブラウザでも node でも動く。
// 考え方：「全部配り終わる時刻」をできるだけ早く。ただし時間指定に遅れるのは大きな減点、
// 指定時間より早く着いたら、その時間まで待つ（＝待つより先に別の家を回る順が選ばれる）。
(function (root) {
  var LATE_PER_MIN = 60;   // 1分遅れ = 60分ぶん遠回りしたのと同じくらい悪い
  var LATE_EACH = 600;     // 遅れる家が1件増えるごとの減点

  // 時間指定の読み取り。「午前中」「14-16」「14時〜16時」「19:00-21:00」「夜間」など
  var PRESETS = [
    { label: "指定なし", s: null, e: null },
    { label: "午前中", s: 480, e: 720 },
    { label: "12-14", s: 720, e: 840 },
    { label: "14-16", s: 840, e: 960 },
    { label: "16-18", s: 960, e: 1080 },
    { label: "18-20", s: 1080, e: 1200 },
    { label: "19-21", s: 1140, e: 1260 },
  ];
  function hm(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (m === 60) { h++; m = 0; }
    return h + ":" + (m < 10 ? "0" : "") + m;
  }
  function windowLabel(s, e) {
    if (s == null) return "指定なし";
    for (var i = 1; i < PRESETS.length; i++) if (PRESETS[i].s === s && PRESETS[i].e === e) return PRESETS[i].label;
    return hm(s) + "-" + hm(e);
  }
  // 1行から「住所」と「時間指定」を分ける。時間指定は行の最後に空白を空けて書かれたものだけ読む
  // （住所の「1-2-3」を時間と間違えないため）
  var SLOT_RE = /[\s　]+(午前中?|AM|夜間?|(\d{1,2})(?:[:：](\d{2}))?\s*時?\s*[-~〜～ー－−]\s*(\d{1,2})(?:[:：](\d{2}))?\s*時?)\s*$/i;
  function z2h(t) { return t.replace(/[０-９：]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); }); }
  function parseLine(line) {
    var text = z2h(String(line || "")).trim();
    var m = text.match(SLOT_RE);
    var s = null, e = null;
    if (m) {
      if (/^(午前|AM)/i.test(m[1])) { s = 480; e = 720; }
      else if (/^夜/.test(m[1])) { s = 1140; e = 1260; }
      else {
        var sh = +m[2], eh = +m[4];
        var a = sh * 60 + (+m[3] || 0), b = eh * 60 + (+m[5] || 0);
        if (sh >= 6 && eh <= 24 && b > a) { s = a; e = b; } else m = null;
      }
    }
    var address = (m ? text.slice(0, m.index) : text).replace(/^[\d]+[.)．、]\s*/, "").trim();
    return { address: address, s: s, e: e };
  }

  function haversineKm(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  // 道は直線より遠回りなので 1.35 倍。信号や右左折込みの平均時速で割る。最低1分。
  function travelMatrix(points, opt) {
    var n = points.length, T = [];
    for (var i = 0; i < n; i++) {
      T.push(new Float64Array(n));
      for (var j = 0; j < n; j++) {
        if (i === j) continue;
        var km = haversineKm(points[i], points[j]) * (opt.roadFactor || 1.35);
        T[i][j] = Math.max(km < 0.03 ? 0.5 : 1, km / (opt.speedKmh || 20) * 60);
      }
    }
    return T;
  }

  // order: 配達先の番号（1..n）の並び。0 は出発地点
  function evaluate(order, T, stops, startMin, service) {
    var t = startMin, prev = 0, late = 0, lateCount = 0, wait = 0;
    for (var k = 0; k < order.length; k++) {
      var i = order[k], st = stops[i - 1];
      t += T[prev][i];
      if (st.s != null && t < st.s) { wait += st.s - t; t = st.s; }
      if (st.e != null && t > st.e) { late += t - st.e; lateCount++; }
      t += service;
      prev = i;
    }
    return { cost: (t - startMin) + late * LATE_PER_MIN + lateCount * LATE_EACH, end: t, late: late, lateCount: lateCount, wait: wait };
  }

  function timeline(order, T, stops, startMin, service) {
    var t = startMin, prev = 0, out = [];
    for (var k = 0; k < order.length; k++) {
      var i = order[k], st = stops[i - 1];
      var drive = T[prev][i];
      t += drive;
      var arrive = t, waitMin = 0;
      if (st.s != null && t < st.s) { waitMin = st.s - t; t = st.s; }
      var lateMin = st.e != null && t > st.e ? t - st.e : 0;
      out.push({ index: i - 1, drive: drive, arrive: arrive, start: t, wait: waitMin, late: lateMin });
      t += service;
      prev = i;
    }
    return { rows: out, end: t };
  }

  // 最初のたたき台：①近い順 ②締切が早い順＋近い順 の良い方
  function greedy(n, T, stops, startMin, service, mode) {
    var left = [], order = [], t = startMin, prev = 0;
    for (var i = 1; i <= n; i++) left.push(i);
    while (left.length) {
      var best = -1, bestScore = Infinity;
      for (var k = 0; k < left.length; k++) {
        var j = left[k], st = stops[j - 1];
        var arr = t + T[prev][j];
        var begin = st.s != null && arr < st.s ? st.s : arr;
        var score = begin - t;
        if (st.e != null) {
          if (begin > st.e) score += 10000;
          if (mode === "deadline") score += (st.e - t) * 0.5;
        } else if (mode === "deadline") score += 120;
        if (score < bestScore) { bestScore = score; best = k; }
      }
      var nx = left.splice(best, 1)[0];
      var st2 = stops[nx - 1];
      t += T[prev][nx];
      if (st2.s != null && t < st2.s) t = st2.s;
      t += service;
      order.push(nx); prev = nx;
    }
    return order;
  }

  function rng(seed) {
    var x = seed >>> 0 || 1;
    return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }

  // 焼きなまし法：1件動かす／区間を逆にする／2件入れ替える を何万回も試して良くなる順を探す
  function optimize(start, stops, opt) {
    opt = opt || {};
    var n = stops.length;
    if (!n) return { order: [], rows: [], end: opt.startMin || 0, late: 0, lateCount: 0 };
    var startMin = opt.startMin, service = opt.serviceMin == null ? 2 : opt.serviceMin;
    var T = travelMatrix([start].concat(stops), opt);
    var budget = opt.timeMs || 1200;
    var now = typeof performance !== "undefined" ? function () { return performance.now(); } : Date.now;
    var rand = rng(opt.seed || 12345);

    var cands = [greedy(n, T, stops, startMin, service, "near"), greedy(n, T, stops, startMin, service, "deadline")];
    var bestOrder = null, bestCost = Infinity;
    cands.forEach(function (o) { var c = evaluate(o, T, stops, startMin, service).cost; if (c < bestCost) { bestCost = c; bestOrder = o; } });

    if (n >= 3) {
      var cur = bestOrder.slice(), curCost = bestCost;
      var t0 = now(), temp0 = 30, iter = 0, maxIter = opt.maxIter || 400000;
      var cand = new Array(n);
      while (iter < maxIter) {
        if ((iter & 1023) === 0) { var el = now() - t0; if (el > budget) break; var frac = el / budget; }
        var temp = temp0 * Math.pow(0.002, frac || 0);
        for (var q = 0; q < n; q++) cand[q] = cur[q];
        var a = Math.floor(rand() * n), b = Math.floor(rand() * n);
        if (a === b) { iter++; continue; }
        var r = rand();
        if (r < 0.45) { var v = cand.splice(a, 1)[0]; cand.splice(b, 0, v); }
        else if (r < 0.8) { if (a > b) { var tmp = a; a = b; b = tmp; } while (a < b) { var x = cand[a]; cand[a] = cand[b]; cand[b] = x; a++; b--; } }
        else { var y = cand[a]; cand[a] = cand[b]; cand[b] = y; }
        var c = evaluate(cand, T, stops, startMin, service).cost;
        if (c <= curCost || rand() < Math.exp((curCost - c) / temp)) {
          cur = cand.slice(); curCost = c;
          if (c < bestCost - 1e-9) { bestCost = c; bestOrder = cur.slice(); }
        }
        iter++;
      }
    }
    var ev = evaluate(bestOrder, T, stops, startMin, service);
    var tl = timeline(bestOrder, T, stops, startMin, service);
    return { order: bestOrder.map(function (i) { return i - 1; }), rows: tl.rows, end: tl.end, late: ev.late, lateCount: ev.lateCount, wait: ev.wait };
  }

  // 決まった順番のまま、到着予定だけ計算し直す（1件終わるごと）
  function schedule(start, stops, opt) {
    var T = travelMatrix([start].concat(stops), opt);
    var order = stops.map(function (_, i) { return i + 1; });
    var service = opt.serviceMin == null ? 2 : opt.serviceMin;
    var tl = timeline(order, T, stops, opt.startMin, service);
    var ev = evaluate(order, T, stops, opt.startMin, service);
    return { order: order.map(function (i) { return i - 1; }), rows: tl.rows, end: tl.end, late: ev.late, lateCount: ev.lateCount, wait: ev.wait };
  }

  root.HaisoOpt = { optimize: optimize, schedule: schedule, parseLine: parseLine, PRESETS: PRESETS, windowLabel: windowLabel, hm: hm, haversineKm: haversineKm };
  if (typeof module !== "undefined") module.exports = root.HaisoOpt;
})(typeof window !== "undefined" ? window : globalThis);
