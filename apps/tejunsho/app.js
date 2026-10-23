(function(){
  var $=function(id){return document.getElementById(id)};
  function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='class')e.className=attrs[k];else if(k==='text')e.textContent=attrs[k];else e.setAttribute(k,attrs[k]);}
    (kids||[]).forEach(function(c){if(c!=null)e.append(c)});return e}
  var STORE='gd-tejunsho-manuals';
  var MAX_IMAGES=10;
  // AI中継サーバーを設定していない時は、無料のAI（Claude・ChatGPT・Gemini）に依頼文を貼ってもらう
  var useAI=!!window.GD_API_BASE;
  var FORMAT='{"title":"作業名","summary":"1〜2文の説明","purpose":["この作業をする理由・目的"],"tools":["道具"],"safety":["安全のために必ず守ること"],"steps":[{"action":"1つの動作","point":"コツ（無ければ空文字）","why":"理由（無ければ空文字）"}],"checklist":["作業後に確認すること"],"questions":["ベテランに追加で聞くこと"]}';
  // 納品できる言語（key は保存する時の名前、ask はAIへの頼み方）
  var LANGS=[
    {key:'やさしい日本語',label:'やさしい日本語',ask:'やさしい日本語（短い文で、むずかしい言葉や漢語を使わない）'},
    {key:'ベトナム語',label:'Tiếng Việt',ask:'ベトナム語'},
    {key:'インドネシア語',label:'Bahasa Indonesia',ask:'インドネシア語'},
    {key:'ミャンマー語',label:'မြန်မာ',ask:'ミャンマー語'},
    {key:'ネパール語',label:'नेपाली',ask:'ネパール語'},
    {key:'タガログ語',label:'Tagalog',ask:'タガログ語（フィリピン）'},
    {key:'中国語',label:'中文',ask:'中国語（簡体字）'},
    {key:'韓国語',label:'한국어',ask:'韓国語'},
    {key:'ポルトガル語',label:'Português',ask:'ポルトガル語（ブラジル）'},
    {key:'スペイン語',label:'Español',ask:'スペイン語（中南米）'},
    {key:'英語',label:'English',ask:'英語'}];
  var OLD_KEYS={'やさしい日本語（漢字にふりがなはつけず、短い文で）':'やさしい日本語'};
  function langInfo(k){k=OLD_KEYS[k]||k;for(var i=0;i<LANGS.length;i++)if(LANGS[i].key===k)return LANGS[i];return {key:k,label:k,ask:k}}
  function pickedLangs(){return LANGS.filter(function(l){var c=document.getElementById('lp-'+LANGS.indexOf(l));return c&&c.checked})}
  function manualPrompt(task,industry,tr,purpose,langs){
    langs=langs||[];
    var fmt=FORMAT,multi='';
    if(langs.length){
      fmt='{"ja":'+FORMAT+',"translations":{'+langs.map(function(l){return '"'+l.key+'":{…"ja"と同じ形で'+l.ask+'に訳したもの…}'}).join(',')+'}}';
      multi='- 日本語の手順書を "ja" に入れ、同じ内容を '+langs.map(function(l){return l.ask}).join('・')+' に訳したものを "translations" に入れる（キーは '+langs.map(function(l){return '"'+l.key+'"'}).join('、')+'）。訳では形とキー名はそのまま、文字列だけ訳し、数値・単位はそのまま。現場の新人が読む想定で短く分かりやすく。\n';
    }
    return 'あなたは製造・建設・介護などの現場の技能継承の専門家です。以下はベテランが話した内容の書き起こしです。新人や外国人スタッフでも分かる作業手順書にしてください。\n'+
      '守ること:\n- 話に出てこない数値・手順・道具を作らない。\n- 足りない情報や、確認すべきことは questions に入れる。\n- 文は短く、1つの手順に1つの動作。\n- 安全に関わることは safety に必ず入れる。\n- purpose（この作業をする理由・目的）は、話の中の理由と「この作業をする理由」欄の内容から、短い文で1〜3つ。どちらにも無ければ空の配列にして、questions に「この作業をする目的は？」を入れる。\n\n'+
      multi+'\n'+
      '返事は、次の形のJSONだけを ```json のコードブロック1つで返してください。説明の文章はいりません。\n'+fmt+'\n\n'+
      '作業名: '+task+'\n業種: '+industry+'\nこの作業をする理由（作る人のメモ）: '+(purpose||'（なし）')+'\n書き起こし:\n"""\n'+tr+'\n"""';
  }
  function translatePrompt(manual,lang){
    return '次の作業手順書のJSONを'+langInfo(lang).ask+'に翻訳してください。構造とキー名はそのまま、文字列の値だけ訳す。数値・単位はそのまま。現場の新人が読む想定で短く分かりやすく。\n'+
      '返事は、訳したJSONだけを ```json のコードブロック1つで返してください。\n\n'+JSON.stringify(manual);
  }
  function askPrompt(manual,q){
    return 'あなたは会社の新人向けQ&A係です。次の作業手順書だけを根拠に、新人の質問に短く（3文以内）やさしく答えてください。手順書に書いていないことは推測せず「手順書には書いていません。ベテランに確認してください」と答える。安全に関わる質問では必ず注意を添える。\n\n手順書:\n'+JSON.stringify(manual)+'\n\n質問: '+q;
  }
  function extractJson(t){
    var m=String(t||'').match(/```(?:json)?\s*([\s\S]*?)```/);var x=m?m[1]:String(t||'');
    var a=x.indexOf('{'),b=x.lastIndexOf('}');if(a<0||b<a)return null;
    try{return JSON.parse(x.slice(a,b+1))}catch(e){return null}
  }
  async function copyText(t){
    try{await navigator.clipboard.writeText(t);return true}catch(e){return false}
  }
  var pending=null; // {kind:'manual'|'translate', lang, label, frames}
  async function openRelay(kind,prompt,extra){
    pending=Object.assign({kind:kind},extra||{});
    $('promptText').value=prompt;$('reply').value='';$('relaySt').textContent='';
    $('relayTitle').textContent=kind==='manual'?'無料のAIに手順書を頼む':'無料のAIに'+(extra.label||'')+'への翻訳を頼む';
    $('applyReply').textContent=kind==='manual'?'手順書にする':'翻訳を取り込む';
    $('relay').hidden=false;
    var ok=await copyText(prompt);
    $('relayCopied').textContent=ok?'AIへの依頼文をコピーしました。':'コピーできませんでした。下の「依頼文を見る」を開いて、長押しでコピーしてください。';
    if(!ok)$('relay').querySelector('details').open=true;
    $('relay').scrollIntoView({behavior:'smooth',block:'start'});
  }

  // 見本（ページを開いた時に表示）
  var SAMPLE={title:'アルミ板の曲げ加工（ベンダー）',summary:'2mmのアルミ板を、割れと傷を出さずに図面どおりの角度で曲げる手順です。',
    purpose:['割れや傷が出ると、材料も時間もむだになるため','同じ品質のものを、誰が作っても同じようにそろえるため'],
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
    var s1=Math.min(1,768/v.videoWidth),s2=Math.min(1,360/v.videoWidth);
    big.width=Math.round(v.videoWidth*s1);big.height=Math.round(v.videoHeight*s1);sm.width=Math.round(v.videoWidth*s2);sm.height=Math.round(v.videoHeight*s2);
    var out=[];
    for(var i=0;i<n;i++){
      var t=dur*(i+0.5)/n;$('vidSt').textContent='写真を切り出しています… '+(i+1)+' / '+n;
      await seek(v,t);
      big.getContext('2d').drawImage(v,0,0,big.width,big.height);sm.getContext('2d').drawImage(v,0,0,sm.width,sm.height);
      out.push({b64:big.toDataURL('image/jpeg',0.78).split(',')[1],thumb:sm.toDataURL('image/jpeg',0.6),t:t});
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

  function stepFrame(i){var s=state.manual.steps&&state.manual.steps[i];return s&&s.frame?s.frame:null}
  function stepImage(i){var f=stepFrame(i);return (f&&state.frames[f-1])?el('img',{class:'stepimg',src:state.frames[f-1].thumb,alt:'手順'+(i+1)+'の場面'}):null}
  function framePicker(i){
    if(!state.frames.length||!state.manual.steps||!state.manual.steps[i])return null;
    var sel=el('select',{class:'framepick','aria-label':'手順'+(i+1)+'の写真'},[el('option',{value:'',text:'写真なし'})].concat(state.frames.map(function(f,j){return el('option',{value:String(j+1),text:'写真'+(j+1)+'（'+fmt(f.t)+'）'})})));
    sel.value=stepFrame(i)?String(stepFrame(i)):'';
    sel.onchange=function(){state.manual.steps[i].frame=sel.value?Number(sel.value):null;render()};
    return sel;
  }
  function renderLangButtons(){
    var keys=['ja'];
    Object.keys(state.translations||{}).forEach(function(k){if(keys.indexOf(k)<0)keys.push(k)});
    pickedLangs().forEach(function(l){if(keys.indexOf(l.key)<0)keys.push(l.key)});
    var box=$('langs');
    box.replaceChildren.apply(box,keys.map(function(k){
      var done=k==='ja'||!!state.translations[k];
      return el('button',{class:'btn ghost sm',type:'button','data-lang':k,'aria-pressed':k===state.lang?'true':'false',text:(k==='ja'?'日本語':langInfo(k).label)+(done?'':'（未作成）')});
    }));
  }
  function render(){
    var m=state.lang==='ja'?state.manual:(state.translations[state.lang]||state.manual);
    var box=$('manual');box.replaceChildren();
    box.append(el('div',{class:'mhead'},[el('span',{class:'eyebrow',text:'作業手順書'}),el('h2',{text:m.title||''}),el('p',{class:'small',text:m.summary||''})]));
    if(m.purpose&&m.purpose.length)box.append(el('div',{class:'sec purpose'},[el('h3',{text:'この作業をする理由'}),el('ul',null,m.purpose.map(function(s){return el('li',{text:s})}))]));
    if(m.safety&&m.safety.length)box.append(el('div',{class:'sec safety'},[el('h3',{text:'⚠ 安全のために必ず守ること'}),el('ul',null,m.safety.map(function(s){return el('li',{text:s})}))]));
    if(m.tools&&m.tools.length)box.append(el('div',{class:'sec'},[el('h3',{text:'使う道具・材料'}),el('div',{class:'chips'},m.tools.map(function(t){return el('span',{class:'chip',text:t})}))]));
    if(m.steps&&m.steps.length)box.append(el('div',{class:'sec'},[el('h3',{text:'手順'}),el('ol',{class:'steps'},m.steps.map(function(s,i){
      return el('li',null,[el('span',{class:'no',text:String(i+1)}),el('div',null,[el('div',{class:'act',text:s.action||''}),
        s.point?el('div',{class:'pt'},[el('b',{text:'コツ：'}),document.createTextNode(s.point)]):null,
        s.why?el('div',{class:'why',text:'理由：'+s.why}):null,
        stepImage(i),framePicker(i)])])}))]));
    if(m.checklist&&m.checklist.length)box.append(el('div',{class:'sec checks'},[el('h3',{text:'作業後チェック'})].concat(m.checklist.map(function(c,i){
      var id='ck'+i;return el('label',{for:id},[el('input',{type:'checkbox',id:id}),el('span',{text:c})])}))));
    if(m.questions&&m.questions.length)box.append(el('div',{class:'sec qs'},[el('h3',{text:'ベテランに追加で聞くこと'}),el('ul',null,m.questions.map(function(q){return el('li',{text:q})}))]));
    $('exTag').hidden=!state.isSample;
    renderLangButtons();
  }
  render();

  var ctl=null;
  $('stop').onclick=function(){if(ctl)ctl.abort()};
  $('make').onclick=async function(){
    var tr=$('transcript').value.trim();
    var frames=media.frames.slice(0,MAX_IMAGES);
    if(!useAI){
      if(tr.length<20){$('st').className='status err';$('st').textContent='話した内容をもう少し入れてください（20文字以上）。';return}
      $('st').className='status';$('st').textContent='';
      openRelay('manual',manualPrompt($('task').value,$('industry').value,tr.slice(0,12000),$('purpose').value.trim(),pickedLangs()),{frames:frames});
      return;
    }
    if(tr.length<20&&!frames.length){$('st').className='status err';$('st').textContent=GD.errorText({code:'too_short'});return}
    ctl=new AbortController();
    $('make').disabled=true;$('stop').hidden=false;$('st').className='status';$('st').textContent='AIが手順書を書いています…（'+(frames.length?'写真つきなので1〜2分':'30秒〜1分')+'ほど）';
    try{
      var m=await GD.api('/manual',{task:$('task').value,industry:$('industry').value,purpose:$('purpose').value.trim(),transcript:tr,images:frames.map(function(f){return f.b64})},ctl.signal);
      if(!m||!Array.isArray(m.steps))throw {code:'invalid_json'};
      state={manual:m,translations:{},lang:'ja',isSample:false,docId:null,turns:[],frames:frames.map(function(f){return {thumb:f.thumb,t:f.t}})};
      resetChat();render();
      var langs=pickedLangs();
      for(var li=0;li<langs.length;li++){
        $('st').textContent=langs[li].label+'に訳しています…（'+(li+1)+'/'+langs.length+'）';
        try{var tr2=await GD.api('/translate',{manual:m,lang:langs[li].ask},ctl.signal);if(tr2&&Array.isArray(tr2.steps))state.translations[langs[li].key]=tr2}catch(e){if(e&&e.code==='cancelled')throw e}
      }
      render();
      $('st').textContent='できました。下で確認してください。';
      $('out-h').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){$('st').className=e&&e.code==='cancelled'?'status':'status err';$('st').textContent=GD.errorText(e)}
    finally{$('make').disabled=false;$('stop').hidden=true}
  };

  $('langs').addEventListener('click',async function(ev){
    var b=ev.target.closest('button');if(!b)return;var lang=b.dataset.lang;
    if(lang==='ja'||state.translations[lang]){state.lang=lang;render();return}
    var label=langInfo(lang).label;
    if(!useAI){openRelay('translate',translatePrompt(state.manual,lang),{lang:lang,label:label});return}
    $('st2').className='status';$('st2').textContent=label+'に訳しています…';b.disabled=true;
    try{
      var t=await GD.api('/translate',{manual:state.manual,lang:langInfo(lang).ask});
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
    if(!useAI){
      var ok=await copyText(askPrompt(state.manual,q));
      chat.append(el('div',{class:'msg b',text:ok?'質問文をコピーしました。Claude・ChatGPT・Geminiなどに貼って聞いてください。':'コピーできませんでした。この端末ではAIへの直接の質問はできません。'}));
      chat.scrollTop=chat.scrollHeight;return;
    }
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
    if(m.purpose&&m.purpose.length){L.push('## この作業をする理由');m.purpose.forEach(function(s){L.push('- '+s)});L.push('')}
    if(m.safety&&m.safety.length){L.push('## 安全のために必ず守ること');m.safety.forEach(function(s){L.push('- '+s)});L.push('')}
    if(m.tools&&m.tools.length){L.push('## 使う道具・材料');m.tools.forEach(function(s){L.push('- '+s)});L.push('')}
    L.push('## 手順');(m.steps||[]).forEach(function(s,i){L.push((i+1)+'. **'+s.action+'**'+(s.point?'  \n   コツ：'+s.point:'')+(s.why?'  \n   理由：'+s.why:''))});L.push('');
    if(m.checklist&&m.checklist.length){L.push('## 作業後チェック');m.checklist.forEach(function(s){L.push('- [ ] '+s)});L.push('')}
    if(m.questions&&m.questions.length){L.push('## ベテランに追加で聞くこと');m.questions.forEach(function(s){L.push('- '+s)})}
    return L.join('\n');
  }
  $('dl').onclick=function(){GD.download('tejunsho_'+new Date().toISOString().slice(0,10)+'.md',toMd(),'text/markdown')};

  // 納品用ページ（印刷・PDF・QR）
  $('deliver').onclick=function(){
    var cur={id:state.docId,manual:state.manual,translations:state.translations,frames:state.frames||[],industry:$('industry').value};
    if(!GD.save('gd-tejunsho-current',cur)){cur.frames=[];GD.save('gd-tejunsho-current',cur)}
    window.open('view.html?local=1','_blank');
  };

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

  // 納品する言語のチェック
  $('langPick').replaceChildren.apply($('langPick'),LANGS.map(function(l,i){
    var c=el('input',{type:'checkbox',id:'lp-'+i});c.onchange=function(){var n=pickedLangs().length;$('langNote').textContent=n>2?'3言語以上はAIの返事が長くなり、途中で切れることがあります。切れた時は、できた後に上の言語ボタンから1つずつ作ってください。':'選んだ言語は、日本語の手順書と一緒に1回で作ります。';renderLangButtons()};
    return el('label',{for:'lp-'+i},[c,document.createTextNode(l.key)]);
  }));

  $('recopy').onclick=async function(){var ok=await copyText($('promptText').value);$('relayCopied').textContent=ok?'もう一度コピーしました。':'コピーできませんでした。「依頼文を見る」から長押しでコピーしてください。'};
  $('applyReply').onclick=function(){
    var j=extractJson($('reply').value),extra=null;
    if(j&&j.ja&&Array.isArray(j.ja.steps)){extra=j.translations||{};j=j.ja}
    if(!j||!Array.isArray(j.steps)||!j.steps.length){$('relaySt').className='status err';$('relaySt').textContent='手順書の形になっていません。AIの返事を最初から最後まで全部コピーして貼ってください。';return}
    if(!pending)return;
    if(pending.kind==='manual'){
      var fr=(pending.frames||[]).map(function(f){return {thumb:f.thumb,t:f.t}});
      j.steps.forEach(function(s){s.frame=null});
      var tl={},got=[];
      if(extra)Object.keys(extra).forEach(function(k){var t=extra[k];if(t&&Array.isArray(t.steps)){var key=langInfo(k).key;tl[key]=t;got.push(langInfo(k).label)}});
      state={manual:j,translations:tl,lang:'ja',isSample:false,docId:null,turns:[],frames:fr};
      resetChat();
      var missing=pickedLangs().filter(function(l){return !tl[l.key]}).map(function(l){return l.label});
      $('st2').className='status';$('st2').textContent='手順書にしました。'+(got.length?'（'+got.join('・')+'版も取り込みました）':'')+(missing.length?' '+missing.join('・')+'は返事に入っていなかったので、上の言語ボタンから作ってください。':'')+(fr.length?' 各手順の下で、動画の写真を選んでつけられます。':'');
    }else{
      state.translations[pending.lang]=j;state.lang=pending.lang;
      $('st2').className='status';$('st2').textContent=pending.label+'版を取り込みました。';
    }
    render();$('relay').hidden=true;pending=null;
    $('out-h').scrollIntoView({behavior:'smooth',block:'start'});
  };
  if(!useAI){
    $('make').textContent='AIへの依頼文をつくる';
    var note=el('p',{class:'free-note',text:'無料のAI（Claude・ChatGPT・Gemini）を使う方式です。「AIへの依頼文をつくる」を押すと依頼文がコピーされるので、AIに貼って送り、返事をここに貼り戻してください。'});
    $('make').closest('.btns').before(note);
    $('vidBox').querySelector('p.muted').textContent='動画から場面の写真を切り出します。いらない写真は × で外せます。写真は、手順書ができた後に各手順の下で選んでつけられます。動画の中の声は自動で文字にできないので、説明は下の欄に入れてください。';
  }
})();
