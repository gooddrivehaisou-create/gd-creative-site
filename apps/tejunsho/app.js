(function(){
  var $=function(id){return document.getElementById(id)};
  function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}
    (kids||[]).forEach(function(c){if(c!=null)e.append(c)});return e}
  var STORE='gd-tejunsho-manuals';
  var MAX_IMAGES=10;

  // 見本（ページを開いた時に表示）
  var SAMPLE={title:'アルミ板の曲げ加工（ベンダー）',summary:'2mmのアルミ板を、割れと傷を出さずに図面どおりの角度で曲げる手順です。',
    tools:['図面','ベンダー（プレスブレーキ）','V金型（V幅12〜16mm）','端材','分度器','記録表','保護シート'],
    safety:['手は絶対に金型の間に入れない','フットペダルは曲げる時だけ踏む。足を乗せたままにしない'],
    steps:[
      {action:'図面で曲げ寸法と板厚を確認する',point:'今回は板厚2mmのアルミ',why:'寸法と板厚で金型の選び方が変わるため'},
      {action:'V幅が板厚の6〜8倍の金型を選ぶ',point:'2mmなら V12〜V16',why:'狭すぎると曲げの外側が割れるため'},
      {action:'材料の目（ロール目）の向きを見る',point:'なるべく目に直角に曲げる',why:'目に沿って曲げるとアルミは割れやすいため'},
      {action:'端材で1回試し曲げをして角度を測る',point:'分度器で測る',why:'本番の材料をむだにしないため'},
      {action:'スプリングバックの分だけ深めに曲げる',point:'90度がほしい時は1〜2度深く',why:'アルミは曲げた後に少し戻るため'},
      {action:'ワークを突き当てにしっかり当てて曲げる',point:'手は金型の間に入れない',why:'寸法ずれとけがを防ぐため'},
      {action:'角度と寸法を測って記録表に書く',point:'5枚に1回は測る',why:'ずれに早く気づくため'},
      {action:'保護シートの上に置く',point:'重ねて置かない',why:'アルミは傷がつきやすいため'}],
    checklist:['板厚と寸法を図面で確認した','V幅は板厚の6〜8倍','目に直角に曲げる向きにした','試し曲げで角度を確認した','5枚に1回、角度と寸法を記録した'],
    questions:['重ねて置いてよい枚数は？（話の中に出てきていません）','角度の許容範囲（±何度まで合格か）は？','試し曲げで角度が合わない時、何回まで調整してよいか？']};

  var state={manual:SAMPLE,translations:{},lang:'ja',isSample:true,docId:null,turns:[],frames:[]};
  var media={frames:[]}; // {thumb, b64, t}

  // ---- 動画：場面を写真として切り出す ----
  var vidUrl=null,audUrl=null;
  function seek(v,t){return new Promise(function(res){var fin=false;function done(){if(fin)return;fin=true;v.removeEventListener('seeked',done);res()}v.addEventListener('seeked',done);v.currentTime=t;setTimeout(done,4000)})}
  function fmt(t){t=Math.floor(t);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')}
  async function extractFrames(file){
    var n=MAX_IMAGES;
    if(vidUrl)URL.revokeObjectURL(vidUrl);vidUrl=URL.createObjectURL(file);
    $('vidPrev').src=vidUrl;
    var v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=vidUrl;
    await new Promise(function(res,rej){v.onloadedmetadata=res;v.onerror=function(){rej(new Error('decode'))};setTimeout(function(){rej(new Error('timeout'))},20000)});
    var dur=v.duration;if(!isFinite(dur)||dur<=0)throw new Error('decode');
    try{await v.play();v.pause()}catch(e){}
    var big=document.createElement('canvas'),sm=document.createElement('canvas');
    var s1=Math.min(1,768/v.videoWidth),s2=Math.min(1,200/v.videoWidth);
    big.width=Math.round(v.videoWidth*s1);big.height=Math.round(v.videoHeight*s1);sm.width=Math.round(v.videoWidth*s2);sm.height=Math.round(v.videoHeight*s2);
    var out=[];
    for(var i=0;i<n;i++){
      var t=dur*(i+0.5)/n;$('vidSt').textContent='写真を切り出しています… '+(i+1)+' / '+n;
      await seek(v,t);
      big.getContext('2d').drawImage(v,0,0,big.width,big.height);sm.getContext('2d').drawImage(v,0,0,sm.width,sm.height);
      out.push({b64:big.toDataURL('image/jpeg',0.78).split(',')[1],thumb:sm.toDataURL('image/jpeg',0.55),t:t});
    }
    v.removeAttribute('src');v.load();
    return out;
  }
  function renderFrames(){
    var box=$('frames');box.replaceChildren.apply(box,media.frames.map(function(f,i){
      var x=el('button',{type:'button','aria-label':'写真'+(i+1)+'を外す',text:'×'});
      x.onclick=function(){media.frames.splice(i,1);renderFrames()};
      return el('div',{class:'fr'},[el('img',{src:f.thumb,alt:'場面 '+fmt(f.t)}),el('span',{class:'n',text:(i+1)+' · '+fmt(f.t)}),x])}));
  }
  $('vidIn').addEventListener('change',async function(){
    var f=this.files&&this.files[0];this.value='';if(!f)return;
    $('vidBox').hidden=false;$('frames').replaceChildren();media.frames=[];$('vidSt').className='small';$('vidSt').textContent='動画を読み込んでいます…';
    try{media.frames=await extractFrames(f);renderFrames();$('vidSt').textContent=media.frames.length+'枚の写真を切り出しました。'}
    catch(e){$('vidSt').className='small status err';$('vidSt').textContent='この動画は読み込めませんでした。MP4形式で保存し直すか、別の動画で試してください。'}
  });
  // ---- 録音：聞きながら書き起こす ----
  $('audIn').addEventListener('change',function(){
    var f=this.files&&this.files[0];this.value='';if(!f)return;
    if(audUrl)URL.revokeObjectURL(audUrl);audUrl=URL.createObjectURL(f);$('audPrev').src=audUrl;$('audBox').hidden=false;
  });
  $('speed').addEventListener('click',function(ev){
    var b=ev.target.closest('button');if(!b)return;var a=$('audPrev');
    if(b.dataset.back){a.currentTime=Math.max(0,a.currentTime-5);return}
    a.playbackRate=Number(b.dataset.rate);
    document.querySelectorAll('#speed [data-rate]').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
  });

  function render(){
    var m=state.lang==='ja'?state.manual:(state.translations[state.lang]||state.manual);
    var box=$('manual');box.replaceChildren();
    box.append(el('div',{class:'mhead'},[el('span',{class:'eyebrow',text:'作業手順書'}),el('h2',{text:m.title||''}),el('p',{class:'small',text:m.summary||''})]));
    if(m.safety&&m.safety.length)box.append(el('div',{class:'sec safety'},[el('h3',{text:'⚠ 安全のために必ず守ること'}),el('ul',null,m.safety.map(function(s){return el('li',{text:s})}))]));
    if(m.tools&&m.tools.length)box.append(el('div',{class:'sec'},[el('h3',{text:'使う道具・材料'}),el('div',{class:'chips'},m.tools.map(function(t){return el('span',{class:'chip',text:t})}))]));
    if(m.steps&&m.steps.length)box.append(el('div',{class:'sec'},[el('h3',{text:'手順'}),el('ol',{class:'steps'},m.steps.map(function(s,i){
      return el('li',null,[el('span',{class:'no',text:String(i+1)}),el('div',null,[el('div',{class:'act',text:s.action||''}),
        s.point?el('div',{class:'pt'},[el('b',{text:'コツ：'}),document.createTextNode(s.point)]):null,
        s.why?el('div',{class:'why',text:'理由：'+s.why}):null,
        (s.frame&&state.frames[s.frame-1])?el('img',{class:'stepimg',src:state.frames[s.frame-1].thumb,alt:'手順'+(i+1)+'の場面'}):null])])}))]));
    if(m.checklist&&m.checklist.length)box.append(el('div',{class:'sec checks'},[el('h3',{text:'作業後チェック'})].concat(m.checklist.map(function(c,i){
      var id='ck'+i;return el('label',{for:id},[el('input',{type:'checkbox',id:id}),el('span',{text:c})])}))));
    if(m.questions&&m.questions.length)box.append(el('div',{class:'sec qs'},[el('h3',{text:'ベテランに追加で聞くこと'}),el('ul',null,m.questions.map(function(q){return el('li',{text:q})}))]));
    $('exTag').hidden=!state.isSample;
    document.querySelectorAll('#langs button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.lang===state.lang?'true':'false')});
  }
  render();

  var ctl=null;
  $('stop').onclick=function(){if(ctl)ctl.abort()};
  $('make').onclick=async function(){
    var tr=$('transcript').value.trim();
    var frames=media.frames.slice(0,MAX_IMAGES);
    if(tr.length<20&&!frames.length){$('st').className='status err';$('st').textContent=GD.errorText({code:'too_short'});return}
    ctl=new AbortController();
    $('make').disabled=true;$('stop').hidden=false;$('st').className='status';$('st').textContent='AIが手順書を書いています…（'+(frames.length?'写真つきなので1〜2分':'30秒〜1分')+'ほど）';
    try{
      var m=await GD.api('/manual',{task:$('task').value,industry:$('industry').value,transcript:tr,images:frames.map(function(f){return f.b64})},ctl.signal);
      if(!m||!Array.isArray(m.steps))throw {code:'invalid_json'};
      state={manual:m,translations:{},lang:'ja',isSample:false,docId:null,turns:[],frames:frames.map(function(f){return {thumb:f.thumb,t:f.t}})};
      resetChat();render();
      $('st').textContent='できました。下で確認してください。';
      $('out-h').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){$('st').className=e&&e.code==='cancelled'?'status':'status err';$('st').textContent=GD.errorText(e)}
    finally{$('make').disabled=false;$('stop').hidden=true}
  };

  $('langs').addEventListener('click',async function(ev){
    var b=ev.target.closest('button');if(!b)return;var lang=b.dataset.lang;
    if(lang==='ja'||state.translations[lang]){state.lang=lang;render();return}
    var label=b.dataset.label||b.textContent;
    $('st2').className='status';$('st2').textContent=label+'に訳しています…';b.disabled=true;
    try{
      var t=await GD.api('/translate',{manual:state.manual,lang:lang});
      if(!t||!Array.isArray(t.steps))throw {code:'invalid_json'};
      state.translations[lang]=t;state.lang=lang;render();$('st2').textContent=label+'版ができました。';
    }catch(e){$('st2').className='status err';$('st2').textContent=GD.errorText(e)}
    finally{b.disabled=false}
  });

  // Q&A
  function resetChat(){state.turns=[];$('chat').replaceChildren(el('div',{class:'msg b',text:'手順書について質問してみてください。'}))}
  $('askForm').addEventListener('submit',async function(ev){
    ev.preventDefault();var q=$('q').value.trim();if(!q)return;
    var chat=$('chat');chat.append(el('div',{class:'msg u',text:q}));$('q').value='';
    var bubble=el('div',{class:'msg b',text:'考えています…'});chat.append(bubble);chat.scrollTop=chat.scrollHeight;
    $('askBtn').disabled=true;
    state.turns.push({role:'user',content:q});
    try{
      var r=await GD.api('/ask',{manual:state.manual,turns:state.turns.slice(-8)});
      bubble.textContent=r.text;state.turns.push({role:'assistant',content:r.text});
    }catch(e){bubble.textContent=GD.errorText(e);state.turns.pop()}
    finally{$('askBtn').disabled=false;chat.scrollTop=chat.scrollHeight}
  });

  // ファイル
  function toMd(){
    var m=state.lang==='ja'?state.manual:(state.translations[state.lang]||state.manual);var L=[];
    L.push('# '+m.title,'',m.summary||'','');
    if(m.safety&&m.safety.length){L.push('## 安全のために必ず守ること');m.safety.forEach(function(s){L.push('- '+s)});L.push('')}
    if(m.tools&&m.tools.length){L.push('## 使う道具・材料');m.tools.forEach(function(s){L.push('- '+s)});L.push('')}
    L.push('## 手順');(m.steps||[]).forEach(function(s,i){L.push((i+1)+'. **'+s.action+'**'+(s.point?'  \n   コツ：'+s.point:'')+(s.why?'  \n   理由：'+s.why:''))});L.push('');
    if(m.checklist&&m.checklist.length){L.push('## 作業後チェック');m.checklist.forEach(function(s){L.push('- [ ] '+s)});L.push('')}
    if(m.questions&&m.questions.length){L.push('## ベテランに追加で聞くこと');m.questions.forEach(function(s){L.push('- '+s)})}
    return L.join('\n');
  }
  $('dl').onclick=function(){GD.download('tejunsho_'+new Date().toISOString().slice(0,10)+'.md',toMd(),'text/markdown')};

  // 保存（この端末の中）
  $('save').onclick=function(){
    var list=GD.load(STORE,[]);
    var id=state.docId||('m'+Date.now().toString(36));
    var body={id:id,title:state.manual.title||'無題',industry:$('industry').value,manual:state.manual,translations:state.translations,isSample:state.isSample,frames:state.frames||[],savedAt:new Date().toISOString()};
    list=list.filter(function(x){return x.id!==id});list.unshift(body);
    var ok=GD.save(STORE,list),dropped=false;
    while(!ok&&body.frames.length){body.frames=[];dropped=true;ok=GD.save(STORE,list)}
    if(!ok){$('st2').className='status err';$('st2').textContent='この端末の保存容量がいっぱいです。古い手順書を消してください。';return}
    state.docId=id;$('st2').className='status';$('st2').textContent='保存しました。'+(dropped?'（容量の都合で写真は保存していません）':'');
    renderSaved();
  };
  function renderSaved(){
    var list=GD.load(STORE,[]);var box=$('saved');if(!list.length)return;
    box.replaceChildren.apply(box,list.map(function(v){
      var open=el('button',{class:'item',type:'button'},[el('span',{text:v.title}),el('span',{class:'d',text:String(v.savedAt||'').slice(0,10)})]);
      open.onclick=function(){state={manual:v.manual,translations:Object.assign({},v.translations||{}),lang:'ja',isSample:!!v.isSample,docId:v.id,turns:[],frames:(v.frames||[]).slice()};resetChat();render();$('out-h').scrollIntoView({behavior:'smooth'})};
      return open}));
  }
  renderSaved();
})();
