(function(){
  var $=function(id){return document.getElementById(id)};
  function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}(kids||[]).forEach(function(c){if(c!=null)e.append(c)});return e}
  function pad(n){return String(n).padStart(2,'0')}
  function todayKey(d){d=d||new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  function nowHM(){var d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())}
  var LABEL={start:'乗務開始',end:'乗務終了',break:'休憩',break_start:'休憩開始',break_end:'休憩終了',waypoint:'経過地点',note:'メモ'};
  var STORE='gd-gyomukiroku';

  // この端末の中の記録
  var data=GD.load(STORE,{days:{},accidents:[],profile:{}});
  var days=data.days||{},accidents=data.accidents||[],profile=data.profile||{};
  var device=data.device||('d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
  function persist(){return GD.save(STORE,{days:days,accidents:accidents,profile:profile,device:device})}
  $('sName').value=profile.name||'';$('sCar').value=profile.car||'';$('sOffice').value=profile.office||'';$('sCode').value=profile.code||'';

  // タブ
  document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){
    document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected',x===t?'true':'false')});
    ['today','hist','acc','set'].forEach(function(v){$('v-'+v).hidden=v!==t.dataset.v})}});
  document.querySelectorAll('#ex button').forEach(function(b){b.onclick=function(){$('say').value=b.textContent;$('say').focus()}});

  // 標準はこの端末の中で読み取る（無料）。AI中継サーバーを設定した時だけAIを使う
  var useAI=!!window.GD_API_BASE;
  async function parse(text){
    if(!useAI)return {events:GyomuParse.parse(text,nowHM())};
    try{
      var r=await GD.api('/log',{text:text,date:todayKey(),now:nowHM()});
      if(!r||!Array.isArray(r.events)||!r.events.length)throw {code:'invalid_json'};
      return {events:r.events};
    }catch(e){
      if(e&&(e.code==='network'||e.code==='no_code'))return {events:GyomuParse.parse(text,nowHM()),msg:'AIにつながらないため、端末の中で読み取りました：'};
      throw e;
    }
  }
  if(!useAI){$('accSay').closest('label').hidden=true;$('accAi').closest('.btns').hidden=true}

  function saveDay(key,events){var prev=days[key]||{};days[key]={date:key,events:events,updatedAt:new Date().toISOString(),syncedAt:prev.syncedAt||null};var ok=persist();renderAll();syncAll();return ok}

  // ---- 会社のスプレッドシートへ送る（設定がある時だけ） ----
  var SHEET_URL=(window.GD_SHEET&&window.GD_SHEET.url)||'';
  if(!SHEET_URL)$('sCodeWrap').hidden=true;
  function setSync(cls,text){var e=$('sync');e.hidden=false;e.className='syncline'+(cls?' '+cls:'');e.textContent=text}
  async function postSheet(payload){
    var res=await fetch(SHEET_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    var j=await res.json();
    if(!j||!j.ok)throw {code:(j&&j.error)||'sheet_error'};
  }
  function dayPayload(k){
    var sm=summarize(days[k]);
    return {kind:'day',code:profile.code,device:device,date:k,updatedAt:days[k].updatedAt,
      profile:{name:profile.name||'',car:profile.car||'',office:profile.office||''},
      summary:{start:sm.s?sm.s.time:'',startPlace:sm.s&&sm.s.place||'',end:sm.en?sm.en.time:'',endPlace:sm.en&&sm.en.place||'',breaks:sm.brText,distance:sm.dist,waypoints:sm.wp.join('、'),odoStart:sm.s&&sm.s.odometer,odoEnd:sm.en&&sm.en.odometer},
      events:sm.ev.map(function(e){return {time:e.time,label:LABEL[e.type],detail:[e.place,e.odometer!=null?'メーター '+e.odometer:null,e.minutes?e.minutes+'分':null,e.type==='note'?e.note:null].filter(Boolean).join('・')}})};
  }
  var syncing=false,again=false;
  async function syncAll(){
    if(!SHEET_URL)return;
    if(!profile.code){setSync('ng','会社コードが未設定のため、会社には送っていません（「設定」で入れてください）');return}
    if(syncing){again=true;return}
    syncing=true;
    try{
      var pendDays=Object.keys(days).filter(function(k){return days[k].updatedAt&&(!days[k].syncedAt||days[k].syncedAt<days[k].updatedAt)}).sort();
      var pendAcc=accidents.filter(function(a){return !a.synced});
      if(!pendDays.length&&!pendAcc.length){setSync('ok','会社のスプレッドシートに送信済み');return}
      setSync('','会社に送っています…');
      for(var i=0;i<pendDays.length;i++){
        var k=pendDays[i],stamp=days[k].updatedAt;
        await postSheet(dayPayload(k));
        if(days[k]&&days[k].updatedAt===stamp){days[k].syncedAt=stamp;persist()}
      }
      for(var j=0;j<pendAcc.length;j++){
        var a=pendAcc[j];if(!a.id){a.id='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);persist()}
        await postSheet({kind:'accident',code:profile.code,device:device,profile:{name:profile.name||'',car:profile.car||'',office:profile.office||''},accident:a});
        a.synced=true;persist();
      }
      setSync('ok','会社のスプレッドシートに送信済み');
    }catch(e){
      if(e&&e.code==='bad_code')setSync('ng','会社コードが違います。「設定」で確認してください（記録はこのスマホに残っています）');
      else setSync('ng','まだ会社に送れていません。電波が戻ったら次の記録の時に自動で送ります');
    }finally{
      syncing=false;
      if(again){again=false;syncAll()}
    }
  }
  window.addEventListener('online',syncAll);

  $('rec').onclick=async function(){
    var text=$('say').value.trim();if(!text)return;
    $('rec').disabled=true;$('st').className='status';$('st').textContent='読み取っています…';
    try{
      var r=await parse(text);var key=todayKey();var cur=(days[key]&&days[key].events)||[];
      var add=r.events.map(function(e){return {id:Math.random().toString(36).slice(2,10),type:LABEL[e.type]?e.type:'note',time:/^\d{2}:\d{2}$/.test(e.time||'')?e.time:nowHM(),
        place:e.place||null,odometer:(typeof e.odometer==='number'&&isFinite(e.odometer))?e.odometer:null,minutes:(typeof e.minutes==='number'&&isFinite(e.minutes))?e.minutes:null,note:e.note||null,raw:text}});
      if(!saveDay(key,cur.concat(add))){$('st').className='status err';$('st').textContent='この端末の保存容量がいっぱいです。CSVで保存してから古い記録を整理してください。';return}
      $('say').value='';$('st').textContent=(r.msg||'記録しました：')+' '+add.map(function(a){return LABEL[a.type]+' '+a.time}).join('、');
    }catch(e){$('st').className='status err';$('st').textContent=GD.errorText(e)}
    finally{$('rec').disabled=false}
  };

  function summarize(day){
    var ev=(day&&day.events||[]).slice().sort(function(a,b){return a.time.localeCompare(b.time)});
    var s=ev.find(function(e){return e.type==='start'}),en=ev.slice().reverse().find(function(e){return e.type==='end'});
    var br=ev.filter(function(e){return e.type==='break'||e.type==='break_start'||e.type==='break_end'});
    var wp=ev.filter(function(e){return e.type==='waypoint'&&e.place}).map(function(e){return e.place});
    var dist=(s&&en&&s.odometer!=null&&en.odometer!=null&&en.odometer>=s.odometer)?en.odometer-s.odometer:null;
    var brText=br.map(function(b){return b.time+(b.type==='break_end'?' 終了':b.minutes?'〜 '+b.minutes+'分':'〜')+(b.place?'（'+b.place+'）':'')}).join(' / ');
    return {ev:ev,s:s,en:en,br:br,brText:brText,wp:wp,dist:dist};
  }

  function renderToday(){
    var key=todayKey();$('todayLabel').textContent=key;var sm=summarize(days[key]);
    var rows=[['運転者',profile.name||null,'設定で入力'],['車両番号',profile.car||null,'設定で入力'],
      ['開始',sm.s?(sm.s.time+(sm.s.place?'　'+sm.s.place:'')):null,'未入力'],
      ['終了',sm.en?(sm.en.time+(sm.en.place?'　'+sm.en.place:'')):null,'未入力'],
      ['休憩',sm.brText||null,'未入力'],
      ['走行距離',sm.dist!=null?sm.dist+' km':null,'開始と終了のメーターが必要'],
      ['主な経過地点',sm.wp.length?sm.wp.join('、'):null,'未入力']];
    var dl=el('dl');rows.forEach(function(r){dl.append(el('dt',{text:r[0]}),el('dd',{class:r[1]?'':'miss',text:r[1]||r[2]}))});
    $('sheet').replaceChildren(el('div',{class:'sheet'},[el('div',{class:'hd'},[el('span',{text:'業務記録'}),el('span',{class:'num',text:key})]),dl]));
    var miss=[];if(!sm.s)miss.push('開始');if(!sm.en)miss.push('終了');if(sm.s&&!sm.s.place)miss.push('開始地点');if(sm.en&&!sm.en.place)miss.push('終了地点');if(sm.dist==null)miss.push('メーター');if(!profile.name||!profile.car)miss.push('氏名・車両番号');
    $('check').replaceChildren(miss.length?el('div',{class:'okline ng',text:'足りない項目：'+miss.join('・')}):el('div',{class:'okline ok',text:'今日の記録はそろっています'}));
    var tl=$('tl');tl.replaceChildren();
    if(!sm.ev.length){tl.append(el('li',{style:'display:block',class:'empty',text:'まだ入力がありません。上の例を押して「記録する」を試してください。'}));return}
    sm.ev.forEach(function(e){
      var detail=[e.place,e.odometer!=null?'メーター '+e.odometer:null,e.minutes?e.minutes+'分':null,e.type==='note'?e.note:null].filter(Boolean).join('・');
      var del=el('button',{class:'del',type:'button','aria-label':'この行を消す',text:'×'});
      del.onclick=function(){saveDay(key,(days[key].events||[]).filter(function(x){return x.id!==e.id}))};
      tl.append(el('li',null,[el('span',{class:'t',text:e.time}),el('span',{class:'badge '+(e.type==='start'?'start':e.type==='end'?'end':''),text:LABEL[e.type]}),el('span',{text:detail||'—'}),del]));
    });
  }

  function renderHist(){
    var keys=Object.keys(days).filter(function(k){return days[k].events&&days[k].events.length}).sort().reverse();var box=$('hist');
    if(!keys.length){box.replaceChildren(el('div',{class:'empty',text:'まだ記録がありません。「今日」の画面で話して記録すると、日ごとにここへ並びます。'}));return}
    box.replaceChildren.apply(box,keys.map(function(k){var sm=summarize(days[k]);
      return el('div',{class:'it'},[el('span',{class:'num',text:k}),el('span',{text:(sm.s?sm.s.time:'--:--')+' 〜 '+(sm.en?sm.en.time:'--:--')}),el('span',{class:'num',text:sm.dist!=null?sm.dist+' km':'— km'})])}));
  }
  function renderAcc(){
    var box=$('accList');if(!accidents.length){box.replaceChildren(el('div',{class:'empty',text:'事故記録はありません。'}));return}
    box.replaceChildren.apply(box,accidents.map(function(a){return el('div',{class:'it'},[el('span',{class:'num',text:String(a.savedAt||'').slice(0,10)}),el('span',{text:(a.when||'')+' '+(a.where||'')}),el('span',{class:'small muted',text:a.hurt||''})])}));
  }
  function renderAll(){renderToday();renderHist();renderAcc()}
  Object.keys(days).forEach(function(k){if(days[k].events&&days[k].events.length&&!days[k].updatedAt)days[k].updatedAt=new Date().toISOString()});
  renderAll();
  persist();syncAll();

  // CSV
  function csvCell(v){v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
  $('csv').onclick=function(){
    var keys=Object.keys(days).filter(function(k){return days[k].events&&days[k].events.length}).sort();
    if(!keys.length){$('st3').className='status err';$('st3').textContent='記録がまだありません。';return}
    var L=[['日付','運転者','車両番号','開始時刻','開始地点','終了時刻','終了地点','休憩','走行距離km','主な経過地点','開始メーター','終了メーター'].join(',')];
    keys.forEach(function(k){var sm=summarize(days[k]);L.push([k,profile.name,profile.car,sm.s&&sm.s.time,sm.s&&sm.s.place,sm.en&&sm.en.time,sm.en&&sm.en.place,sm.brText,sm.dist,sm.wp.join('、'),sm.s&&sm.s.odometer,sm.en&&sm.en.odometer].map(csvCell).join(','))});
    GD.download('gyomu-kiroku_'+keys[0]+'_'+keys[keys.length-1]+'.csv','﻿'+L.join('\r\n'),'text/csv');
    $('st3').className='status';$('st3').textContent='CSVを保存しました。';
  };

  // 事故記録
  $('accAi').onclick=async function(){
    var t=$('accSay').value.trim();if(!t)return;
    $('accAi').disabled=true;$('st4').className='status';$('st4').textContent='項目に分けています…';
    try{
      var r=await GD.api('/accident',{text:t,date:todayKey()});
      $('aWhen').value=r.when||'';$('aWhere').value=r.where||'';$('aWhat').value=r.what||'';$('aWhy').value=r.why||'';$('aFix').value=r.fix||'';$('aHurt').value=r.hurt||'';
      $('st4').textContent='分けました。内容を確認して直してから保存してください。';
    }catch(e){$('st4').className='status err';$('st4').textContent=GD.errorText(e)+(e&&e.code==='not_configured'?' 下の欄に直接書いても保存できます。':'')}
    finally{$('accAi').disabled=false}
  };
  $('accSave').onclick=function(){
    var a={when:$('aWhen').value,where:$('aWhere').value,what:$('aWhat').value,why:$('aWhy').value,fix:$('aFix').value,hurt:$('aHurt').value,savedAt:new Date().toISOString()};
    if(!a.what){$('st5').className='status err';$('st5').textContent='事故の概要を入れてください。';return}
    a.id='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);a.synced=false;
    accidents.unshift(a);
    if(!persist()){accidents.shift();$('st5').className='status err';$('st5').textContent='この端末の保存容量がいっぱいで保存できませんでした。';return}
    $('st5').className='status';$('st5').textContent='保存しました。'+(/あり|けが|負傷|死/.test(a.hurt)&&!/なし/.test(a.hurt)?' 死傷者がいる場合は国への事故報告も必要です。':'');
    ['accSay','aWhen','aWhere','aWhat','aWhy','aFix','aHurt'].forEach(function(i){$(i).value=''});
    renderAcc();syncAll();
  };

  // 設定
  $('sSave').onclick=function(){
    profile={name:$('sName').value.trim(),car:$('sCar').value.trim(),office:$('sOffice').value.trim(),code:$('sCode').value.trim()};
    var ok=persist();renderToday();
    // 名前や車両番号が変わったら、その内容で送り直す
    Object.keys(days).forEach(function(k){if(days[k].events&&days[k].events.length&&!days[k].updatedAt)days[k].updatedAt=new Date().toISOString()});
    Object.keys(days).forEach(function(k){if(days[k].syncedAt)days[k].syncedAt=null});persist();syncAll();
    $('st6').className=ok?'status':'status err';$('st6').textContent=ok?'保存しました。':'保存できませんでした。';
  };
})();
