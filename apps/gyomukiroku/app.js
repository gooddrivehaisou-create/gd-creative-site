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
  function persist(){return GD.save(STORE,{days:days,accidents:accidents,profile:profile})}
  $('sName').value=profile.name||'';$('sCar').value=profile.car||'';$('sOffice').value=profile.office||'';

  // タブ
  document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){
    document.querySelectorAll('.tab').forEach(function(x){x.setAttribute('aria-selected',x===t?'true':'false')});
    ['today','hist','acc','set'].forEach(function(v){$('v-'+v).hidden=v!==t.dataset.v})}});
  document.querySelectorAll('#ex button').forEach(function(b){b.onclick=function(){$('say').value=b.textContent;$('say').focus()}});

  // AI を使えない時の簡易読み取り
  function localParse(text){
    var ev={type:'note',time:null,place:null,odometer:null,minutes:null,note:text};
    var tm=text.match(/(\d{1,2})\s*[時:：]\s*(半|\d{1,2})?/);if(tm){ev.time=pad(tm[1])+':'+(tm[2]==='半'?'30':pad(tm[2]||0))}
    var od=text.match(/(?:メーター|ODO|走行)\D{0,4}(\d{4,7})/i)||text.match(/(\d{5,7})\s*(?:km|キロ)/i);if(od)ev.odometer=Number(od[1]);
    var mn=text.match(/休憩\D{0,6}(\d{1,3})\s*分/)||text.match(/(\d{1,3})\s*分\s*(?:間)?\s*休/);if(mn)ev.minutes=Number(mn[1]);
    if(/開始|出発|スタート/.test(text))ev.type='start';else if(/終了|終わり|上がり|戻って/.test(text))ev.type='end';else if(/休憩|休み/.test(text))ev.type='break';else if(/回っ|経由|通っ/.test(text))ev.type='waypoint';
    var pl=text.match(/(?:場所は|から|で|に)\s*([^\s、。,]{2,20}?)(?:から|で|に|を|。|、|$)/);if(pl&&ev.type!=='note')ev.place=pl[1];
    if(!ev.time)ev.time=nowHM();
    return [ev];
  }

  async function parse(text){
    try{
      var r=await GD.api('/log',{text:text,date:todayKey(),now:nowHM()});
      if(!r||!Array.isArray(r.events)||!r.events.length)throw {code:'invalid_json'};
      return {events:r.events};
    }catch(e){
      if(e&&(e.code==='not_configured'||e.code==='network'||e.code==='no_code'))return {events:localParse(text),msg:'AIにつながらないため、簡易読み取りで記録しました：'};
      throw e;
    }
  }

  function saveDay(key,events){days[key]={date:key,events:events};var ok=persist();renderAll();return ok}

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
  renderAll();

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
    accidents.unshift(a);
    if(!persist()){accidents.shift();$('st5').className='status err';$('st5').textContent='この端末の保存容量がいっぱいで保存できませんでした。';return}
    $('st5').className='status';$('st5').textContent='保存しました。'+(/あり|けが|負傷|死/.test(a.hurt)&&!/なし/.test(a.hurt)?' 死傷者がいる場合は国への事故報告も必要です。':'');
    ['accSay','aWhen','aWhere','aWhat','aWhy','aFix','aHurt'].forEach(function(i){$(i).value=''});
    renderAcc();
  };

  // 設定
  $('sSave').onclick=function(){
    profile={name:$('sName').value.trim(),car:$('sCar').value.trim(),office:$('sOffice').value.trim()};
    var ok=persist();renderToday();
    $('st6').className=ok?'status':'status err';$('st6').textContent=ok?'保存しました。':'保存できませんでした。';
  };
})();
