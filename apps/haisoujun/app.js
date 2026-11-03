// 配達順ナビ：画面と地図。順番の計算そのものは opt.js
(function () {
  var O = window.HaisoOpt;
  var KEY = "gd-haisoujun";
  var $ = function (id) { return document.getElementById(id); };

  var state = load() || { start: null, stops: [], plan: null, seq: 1 };
  // plan: { ids:[配達先id], rows:{id:{arrive,start,wait,late}}, end, lateCount, at:{lat,lng} }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function byId(id) { for (var i = 0; i < state.stops.length; i++) if (state.stops[i].id === id) return state.stops[i]; return null; }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function startMin() {
    var v = $("startTime").value;
    if (v) { var p = v.split(":"); return +p[0] * 60 + +p[1]; }
    return nowMin();
  }
  // 配達中の「今」。出発時刻を先の時間に入れている時（前日に組む等）はそちらを使う
  function liveMin() {
    var v = $("startTime").value;
    return v ? Math.max(nowMin(), startMin()) : nowMin();
  }
  function opts(extra) {
    var o = { speedKmh: +$("speed").value, serviceMin: +$("service").value, startMin: startMin() };
    for (var k in extra) o[k] = extra[k];
    return o;
  }
  function navUrl(s) { return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + s.lat.toFixed(6) + "," + s.lng.toFixed(6); }

  // ---------- 地図 ----------
  var map = L.map("map", { zoomControl: true }).setView(state.start ? [state.start.lat, state.start.lng] : [35.775, 139.805], 14);
  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>',
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var tapMode = null; // "start" | "add" | null

  function icon(cls, text) {
    var big = /next/.test(cls) ? 32 : /me/.test(cls) ? 18 : 26;
    return L.divIcon({ className: "", html: '<div class="pin ' + cls + '">' + (text || "") + "</div>", iconSize: [big, big], iconAnchor: [big / 2, big / 2] });
  }

  function drawMap(fit) {
    layer.clearLayers();
    var pts = [];
    if (state.start) {
      L.marker([state.start.lat, state.start.lng], { icon: icon("me"), title: "出発地点", zIndexOffset: 1000 }).addTo(layer);
      pts.push([state.start.lat, state.start.lng]);
    }
    var planNo = {};
    var nextId = null;
    if (state.plan) {
      state.plan.ids.forEach(function (id, i) { planNo[id] = i + 1; });
      nextId = firstTodo();
      var line = [];
      if (state.plan.at) line.push([state.plan.at.lat, state.plan.at.lng]);
      state.plan.ids.forEach(function (id) { var s = byId(id); if (s && s.status === "todo") line.push([s.lat, s.lng]); });
      if (line.length > 1) L.polyline(line, { color: "#d9900f", weight: 4, opacity: .8 }).addTo(layer);
    }
    state.stops.forEach(function (s) {
      var r = state.plan && state.plan.rows[s.id];
      var cls = s.status !== "todo" ? "done" : s.id === nextId ? "next" : r && r.late > 0 ? "late" : s.s != null ? "tw" : "";
      var m = L.marker([s.lat, s.lng], {
        icon: icon(cls, planNo[s.id] || ""), draggable: !state.plan, zIndexOffset: s.id === nextId ? 900 : 0,
      }).addTo(layer);
      m.bindPopup("<b>" + esc(s.address) + "</b><br>" + esc(O.windowLabel(s.s, s.e)) +
        (state.plan ? "" : '<br><span style="font-size:12px">ピンを長押しで動かせます</span>'));
      m.on("dragend", function () { var p = m.getLatLng(); s.lat = p.lat; s.lng = p.lng; save(); });
      pts.push([s.lat, s.lng]);
    });
    if (fit && pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 16 });
  }

  map.on("click", function (e) {
    if (tapMode === "start") {
      setStart(e.latlng.lat, e.latlng.lng, "地図で決めた場所");
      setTap(null);
    } else if (tapMode === "add") {
      var n = state.stops.length + 1;
      state.stops.push({ id: state.seq++, address: "地図で置いた場所 " + n, lat: e.latlng.lat, lng: e.latlng.lng, s: null, e: null, status: "todo" });
      dropPlan(); save(); renderStops(); drawMap(false);
    }
  });
  function setTap(mode) {
    tapMode = mode;
    $("startTapBtn").classList.toggle("on", mode === "start");
    $("tapAddBtn").classList.toggle("on", mode === "add");
    $("tapAddBtn").textContent = mode === "add" ? "タップ追加をやめる" : "地図をタップして追加";
    map.getContainer().style.cursor = mode ? "crosshair" : "";
  }
  $("startTapBtn").onclick = function () { setTap(tapMode === "start" ? null : "start"); if (tapMode) $("startStatus").textContent = "地図の出発する場所をタップしてください"; };
  $("tapAddBtn").onclick = function () { setTap(tapMode === "add" ? null : "add"); };

  // ---------- 出発地点 ----------
  function setStart(lat, lng, label) {
    state.start = { lat: lat, lng: lng, label: label };
    $("startStatus").textContent = "✓ " + label + "から出発";
    $("startStatus").className = "status";
    save(); drawMap(false);
  }
  function getGps() {
    return new Promise(function (ok, ng) {
      if (!navigator.geolocation) return ng(new Error("この端末では現在地が使えません"));
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function () { ng(new Error("現在地が取れませんでした。位置情報の許可を確認するか、地図をタップして決めてください。")); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }
  $("gpsBtn").onclick = function () {
    $("startStatus").textContent = "現在地を調べています…";
    getGps().then(function (p) { setStart(p.lat, p.lng, "今いる場所"); map.setView([p.lat, p.lng], 15); })
      .catch(function (e) { $("startStatus").textContent = e.message; $("startStatus").className = "status err"; });
  };

  // ---------- 配達先の追加（国土地理院の住所検索） ----------
  function geocode(address) {
    return fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(address))
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (list) {
        if (!list || !list.length) return null;
        // 近くに出発地点があれば、同じ名前の候補のうち近い方を選ぶ
        var best = list[0];
        if (state.start && list.length > 1) {
          var d0 = Infinity;
          list.slice(0, 10).forEach(function (c) {
            var d = O.haversineKm(state.start, { lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0] });
            if (d < d0) { d0 = d; best = c; }
          });
        }
        return { lat: best.geometry.coordinates[1], lng: best.geometry.coordinates[0] };
      });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  $("addBtn").onclick = function () {
    var lines = $("paste").value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) { $("addStatus").textContent = "住所を入れてください"; return; }
    var btn = $("addBtn"); btn.disabled = true;
    var failed = [], added = 0, i = 0;
    var st = $("addStatus"); st.className = "status";
    (function next() {
      if (i >= lines.length) {
        btn.disabled = false;
        $("paste").value = failed.join("\n");
        st.textContent = added + "件を地図に置きました" + (failed.length ? "。見つからなかった" + failed.length + "件を上に残しています（住所を直すか「地図をタップして追加」で置いてください）" : "");
        st.className = failed.length ? "status err" : "status";
        dropPlan(); save(); renderStops(); drawMap(true);
        return;
      }
      var line = lines[i++];
      var p = O.parseLine(line);
      st.textContent = "住所を探しています… " + i + " / " + lines.length;
      if (!p.address) return next();
      geocode(p.address).then(function (pos) {
        if (!pos) { failed.push(line); return; }
        state.stops.push({ id: state.seq++, address: p.address, lat: pos.lat, lng: pos.lng, s: p.s, e: p.e, status: "todo" });
        added++;
      }).catch(function () { failed.push(line); })
        .then(function () { return wait(150); }).then(next);
    })();
  };

  // ---------- 配達先の一覧 ----------
  function slotSelect(s) {
    var html = '<select data-id="' + s.id + '" aria-label="時間指定">';
    var found = false;
    O.PRESETS.forEach(function (p, i) {
      var sel = p.s === s.s && p.e === s.e; if (sel) found = true;
      html += '<option value="' + i + '"' + (sel ? " selected" : "") + ">" + p.label + "</option>";
    });
    if (!found) html += '<option value="c" selected>' + esc(O.windowLabel(s.s, s.e)) + "</option>";
    return html + "</select>";
  }
  function renderStops() {
    var ul = $("stopList");
    ul.innerHTML = state.stops.map(function (s, i) {
      return '<li class="stop"><div class="pin ' + (s.s != null ? "tw" : "") + '">' + (i + 1) + '</div>' +
        '<div class="addr">' + esc(s.address) + (s.status !== "todo" ? ' <span class="tag">' + (s.status === "done" ? "完了" : "不在") + "</span>" : "") +
        '<div>' + slotSelect(s) + '</div></div>' +
        '<button class="x" type="button" data-del="' + s.id + '" aria-label="消す">×</button></li>';
    }).join("");
    $("listTools").hidden = !state.stops.length;
    $("listBox").hidden = !state.stops.length;
    $("listSum").textContent = "入れた配達先（" + state.stops.length + "件・時間指定はここで直せます）";
  }
  $("stopList").addEventListener("change", function (e) {
    var sel = e.target.closest("select"); if (!sel) return;
    var s = byId(+sel.dataset.id); var v = sel.value;
    if (v !== "c") { s.s = O.PRESETS[+v].s; s.e = O.PRESETS[+v].e; }
    dropPlan(); save(); renderStops(); drawMap(false);
  });
  $("stopList").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]"); if (!b) return;
    state.stops = state.stops.filter(function (s) { return s.id !== +b.dataset.del; });
    dropPlan(); save(); renderStops(); drawMap(false);
  });
  $("clearBtn").onclick = function () {
    if (!confirm("配達先を全部消しますか？")) return;
    state.stops = []; state.plan = null; save(); renderStops(); renderPlan(); drawMap(false);
  };
  function dropPlan() { if (state.plan) { state.plan = null; renderPlan(); } }

  // ---------- 順番を決める ----------
  function firstTodo() {
    if (!state.plan) return null;
    for (var i = 0; i < state.plan.ids.length; i++) { var s = byId(state.plan.ids[i]); if (s && s.status === "todo") return s.id; }
    return null;
  }
  function makePlan(from, extra) {
    var todo = state.stops.filter(function (s) { return s.status === "todo"; });
    var o = opts(extra);
    var res = O.optimize(from, todo, o);
    var keepDone = state.plan ? state.plan.ids.filter(function (id) { var s = byId(id); return s && s.status !== "todo"; }) : [];
    var rows = state.plan ? state.plan.rows : {};
    res.rows.forEach(function (r) { rows[todo[r.index].id] = r; });
    state.plan = { ids: keepDone.concat(res.order.map(function (i) { return todo[i].id; })), rows: rows, end: res.end, lateCount: res.lateCount, at: { lat: from.lat, lng: from.lng } };
    save(); renderPlan(); drawMap(true); renderStops();
  }
  // 1件終わったら、順番はそのままで到着予定だけ計算し直す
  function retime(from) {
    var ids = state.plan.ids.filter(function (id) { var s = byId(id); return s && s.status === "todo"; });
    var todo = ids.map(byId);
    var res = O.schedule(from, todo, opts({ startMin: liveMin() }));
    res.rows.forEach(function (r) { state.plan.rows[todo[r.index].id] = r; });
    state.plan.end = res.end; state.plan.lateCount = res.lateCount; state.plan.at = { lat: from.lat, lng: from.lng };
  }

  $("optBtn").onclick = function () {
    if (!state.start) { $("startStatus").textContent = "先に出発地点を決めてください"; $("startStatus").className = "status err"; $("startCard").scrollIntoView({ behavior: "smooth" }); return; }
    if (!state.stops.some(function (s) { return s.status === "todo"; })) { $("addStatus").textContent = "配達先を入れてください"; $("addStatus").className = "status err"; return; }
    setTap(null);
    var b = $("optBtn"); b.disabled = true; b.textContent = "考えています…";
    setTimeout(function () {
      state.plan = null;
      makePlan(state.start, {});
      b.disabled = false; b.textContent = "順番を決め直す";
      $("resultCard").scrollIntoView({ behavior: "smooth" });
    }, 30);
  };
  $("reoptBtn").onclick = function () {
    var b = $("reoptBtn"); b.disabled = true; b.textContent = "現在地を調べています…";
    getGps().catch(function () { return state.plan.at; }).then(function (p) {
      b.textContent = "考えています…";
      setTimeout(function () {
        makePlan(p, { startMin: liveMin() });
        b.disabled = false; b.textContent = "🔄 今いる場所から順番を組み直す";
      }, 30);
    });
  };

  function mark(id, status) {
    var s = byId(id); s.status = status;
    if (status === "todo") { makePlan(state.plan.at, { startMin: liveMin() }); return; }
    retime({ lat: s.lat, lng: s.lng });
    save(); renderPlan(); drawMap(false); renderStops();
  }

  // ---------- 結果の表示 ----------
  function tags(s, r) {
    var h = "";
    if (s.s != null) h += '<span class="tag tw">' + esc(O.windowLabel(s.s, s.e)) + "</span>";
    if (s.status === "done") return h + '<span class="tag ok">完了</span>';
    if (s.status === "absent") return h + '<span class="tag absent">不在</span>';
    if (!r) return h;
    h += '<span class="num">' + O.hm(r.arrive) + "着</span>";
    if (r.late > 0) h += '<span class="tag late">' + Math.ceil(r.late) + "分遅れそう</span>";
    else if (r.wait >= 1) h += '<span class="tag wait">' + Math.round(r.wait) + "分早い→" + O.hm(r.start) + "まで待つ</span>";
    return h;
  }
  function reason(s, r) {
    if (r.late > 0) return "⚠ このままだと時間指定に" + Math.ceil(r.late) + "分遅れます。着く前にお客様か営業所へ連絡しましょう。";
    if (r.wait >= 1) return "指定時間より早く着きます。" + O.hm(r.start) + "より前に渡してはいけないので、待つか、近くの指定なしの荷物を先に回って時間を合わせます。";
    if (s.s != null) return "時間指定（" + O.windowLabel(s.s, s.e) + "）があるので、間に合うようにここを先に回ります。";
    return "近くにあり、時間指定にも影響しないので、ここから回ります。";
  }
  function renderPlan() {
    var card = $("resultCard");
    $("listBox").open = !state.plan;
    if (!state.plan) { card.hidden = true; $("optBtn").textContent = "順番を決める"; return; }
    card.hidden = false;
    var p = state.plan, todo = p.ids.filter(function (id) { var s = byId(id); return s && s.status === "todo"; });
    $("sumCount").textContent = todo.length;
    $("sumEnd").textContent = todo.length ? O.hm(p.end) : "完了";
    $("sumLate").textContent = p.lateCount;
    $("sumLate").style.color = p.lateCount ? "var(--warn)" : "var(--ok)";
    $("lateAlert").hidden = !p.lateCount;
    $("lateAlert").textContent = p.lateCount + "件が時間指定に間に合わない見込みです。早めにお客様か営業所へ連絡しましょう（赤いピン）。";

    var nid = firstTodo(), nb = $("nextBox");
    if (nid) {
      var s = byId(nid), r = p.rows[nid];
      nb.innerHTML = '<p class="eyebrow">次はここ（' + (p.ids.indexOf(nid) + 1) + "番）</p>" +
        '<p class="addr">' + esc(s.address) + "</p><div class=\"meta\">" + tags(s, r) + "</div>" +
        '<p class="small">' + esc(reason(s, r)) + "</p>" +
        '<div class="btns"><a class="btn" target="_blank" rel="noopener" href="' + navUrl(s) + '">🧭 ナビ</a>' +
        '<button class="btn ghost" type="button" data-mark="done" data-id="' + nid + '">✓ 完了</button>' +
        '<button class="btn ghost" type="button" data-mark="absent" data-id="' + nid + '">不在</button></div>';
      nb.hidden = false;
    } else {
      nb.innerHTML = '<p class="addr">🎉 全部まわりました。おつかれさまでした！</p>';
    }
    var absent = state.stops.filter(function (s) { return s.status === "absent"; }).length;
    $("tip").innerHTML = absent
      ? "不在が" + absent + "件あります。再配達の時間が決まったら、一覧の「もう一度回る」を押すと順番に入れ直します。"
      : "道がふさがっていた・寄り道したなど、予定とずれたら「今いる場所から順番を組み直す」を押してください。";

    $("route").innerHTML = p.ids.map(function (id, i) {
      var s = byId(id); if (!s) return "";
      var r = s.status === "todo" ? p.rows[id] : null;
      var act = s.status === "todo"
        ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="' + navUrl(s) + '">ナビ</a>' +
          '<button class="btn ghost sm" type="button" data-mark="done" data-id="' + id + '">完了</button>' +
          '<button class="btn ghost sm" type="button" data-mark="absent" data-id="' + id + '">不在</button>'
        : '<button class="btn ghost sm" type="button" data-mark="todo" data-id="' + id + '">' + (s.status === "absent" ? "もう一度回る" : "完了を取り消す") + "</button>";
      return '<li class="row' + (s.status !== "todo" ? " done" : "") + '"><div class="no">' + (i + 1) + "</div><div>" +
        '<div class="addr">' + esc(s.address) + '</div><div class="meta">' + tags(s, r) + '</div><div class="btns" style="margin-top:6px">' + act + "</div></div></li>";
    }).join("");
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mark]"); if (!b) return;
    mark(+b.dataset.id, b.dataset.mark);
  });

  // ---------- 起動 ----------
  if (state.start) { $("startStatus").textContent = "✓ " + (state.start.label || "前回の場所") + "から出発（変える時は上のボタン）"; }
  renderStops(); renderPlan(); drawMap(true);
  if (state.plan) $("optBtn").textContent = "順番を決め直す";
})();
