'use strict';
(() => {
  const local=location.protocol==='http:'&&location.hostname==='127.0.0.1';
  const modelStatus={text:false,vision:false};
  const examples={
    tutorial:'做一条 18 秒的咖啡制作教程。观众需要看到压紧咖啡粉、咖啡液流入杯中、再倒入牛奶。已经离店，尽量用现有素材。',
    mood:'做一条 12 秒的咖啡氛围短片。先看压紧咖啡粉和机器操作，最后停在倒入牛奶。已经离店，不能补拍。'
  };
  const sampleFrames={
    '3572':[{second:0,description:'手握咖啡机手柄，粉碗内装满咖啡粉。'}],
    '3571':[{second:3,description:'咖啡机下方有透明杯，咖啡液流入杯内。'}],
    '3573':[{second:1,description:'金属壶向白色杯子倾倒液体，近景可见杯面变化。'}],
    '3578':[{second:0,description:'咖啡机与手柄近景，机器下方有装咖啡粉的手柄。'}]
  };
  const observations=new Map();
  let source='sample', selectedIds=new Set(Object.keys(sampleFrames));
  let plan=null, run=null, fieldActions=[];
  const declined=new Map();
  let askRun=null;

  async function checkStatus() {
    if(local){
      try {
        const response=await fetch('/api/ai/status',{signal:AbortSignal.timeout(4500)});
        Object.assign(modelStatus,await response.json());
      } catch {modelStatus.text=false;modelStatus.vision=false;}
    }
    $('model-status').textContent=modelStatus.text
      ? (modelStatus.vision?'本地文字与视觉模型已连接':'本地文字模型已连接')
      : local?'本机模型未连接':'公开示例 · 可直接体验';
    $('mirror-mode').textContent=modelStatus.text?'本地模型':'示例模式';
  }
  async function request(route,body,signal) {
    const response=await fetch('/api/ai/'+route,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),signal
    });
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'本地模型暂时不可用。');
    return result;
  }
  function available() {
    return source==='sample'?media.filter(clip=>Object.hasOwn(sampleFrames,clip.id)):media.filter(clip=>clip.custom);
  }
  function renderAssets() {
    const clips=available();
    $('ai-assets').innerHTML=clips.length
      ? '<div class="ai-assets">'+clips.map(clip=>'<div class="ai-asset">'+(clip.poster?'<img src="'+clip.poster+'" alt="">':'')+
        '<label><input type="checkbox" data-ai-clip="'+clip.id+'" '+(selectedIds.has(clip.id)?'checked':'')+'> '+escapeText(clip.name)+'</label><small>'+clip.duration.toFixed(1)+' 秒</small></div>').join('')+'</div>'
      : '<div class="notice">还没有导入的视频。可以先生成拍摄清单，或导入后检查画面。</div>';
  }
  function useSource(next) {
    source=next;
    if(next==='sample')fieldActions=[];
    $('ai-source').value=next;
    selectedIds=new Set(available().slice(0,next==='mine'?3:8).map(clip=>clip.id));
    renderAssets();
  }
  function clearResult(message) {
    plan=null;
    declined.clear();
    $('ai-result-kind').textContent='待分析';
    $('ai-result').innerHTML='<p class="muted">'+escapeText(message)+'</p>';
  }
  function inputChanged() {
    run?.abort();
    clearResult('目标或素材已变更，请重新生成方案。');
  }
  function videoEvent(video,event,signal) {
    return new Promise((resolve,reject)=>{
      if(signal.aborted){reject(signal.reason);return;}
      const timer=setTimeout(()=>finish(Error('浏览器无法读取这个视频的画面。')),10000);
      function finish(error) {
        clearTimeout(timer);
        video.removeEventListener(event,success);
        video.removeEventListener('error',failure);
        signal.removeEventListener('abort',cancel);
        if(error)reject(error);else resolve();
      }
      const success=()=>finish();
      const failure=()=>finish(Error('视频格式无法播放。'));
      const cancel=()=>finish(signal.reason);
      video.addEventListener(event,success,{once:true});
      video.addEventListener('error',failure,{once:true});
      signal.addEventListener('abort',cancel,{once:true});
    });
  }
  async function sampleVideo(clip,signal) {
    const video=document.createElement('video');
    video.muted=true;
    video.preload='auto';
    const ready=videoEvent(video,'loadeddata',signal);
    video.src=clip.source;
    try {
      await ready;
      const canvas=document.createElement('canvas');
      const ratio=Math.min(1,448/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));
      canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
      const context=canvas.getContext('2d'), frames=[];
      for(const fraction of [.15,.5,.82]){
        const second=Number((video.duration*fraction).toFixed(2));
        const seek=videoEvent(video,'seeked',signal);
        video.currentTime=second;
        await seek;
        context.drawImage(video,0,0,canvas.width,canvas.height);
        frames.push({second,jpeg:canvas.toDataURL('image/jpeg',.73).split(',')[1]});
      }
      return frames;
    } finally {video.removeAttribute('src');video.load();}
  }
  function clipRecord(clip,evidence) {
    return {id:clip.id,name:clip.name,duration:clip.duration,evidence};
  }
  async function analyzeClips(clips,signal) {
    const records=[];
    for(const [index,clip] of clips.entries()){
      signal.throwIfAborted();
      if(source==='sample'){
        records.push(clipRecord(clip,sampleFrames[clip.id]||[]));
        continue;
      }
      if(!observations.has(clip.id)){
        $('ai-step').textContent='正在读取第 '+(index+1)+' / '+clips.length+' 段视频的画面 · '+clip.name;
        try {
          const frames=await sampleVideo(clip,signal);
          const result=await request('inspect',{images:frames.map(frame=>frame.jpeg)},signal);
          observations.set(clip.id,frames.map((frame,i)=>({second:frame.second,description:result.frames[i]})).filter(frame=>frame.description));
        } catch(error) {
          if(signal.aborted)throw error;
          records.push(clipRecord(clip,[]));
          continue;
        }
      }
      records.push(clipRecord(clip,observations.get(clip.id)));
    }
    return records;
  }
  function offlineSample(brief,clips) {
    const mood=/氛围|治愈|慢节奏|随手|vlog/i.test(brief);
    const mentioned=brief.match(/(\d{1,2})\s*秒/);
    const target=mentioned?Math.max(6,Math.min(30,Number(mentioned[1]))):(mood?12:18);
    const first=Math.max(2,Math.floor(target*.28));
    const second=Math.max(2,Math.floor(target*.28));
    const ids=['3572',mood?'3578':'3571','3573'];
    const canReshoot=!/不能补拍|无法补拍|离店|离开|只能用|没法补拍/.test(brief);
    const titles=['准备咖啡粉',mood?'机器运转':'咖啡流入杯中','倒入牛奶'];
    const intents=['交代咖啡制作从哪里开始',mood?'用机器操作承接节奏':'让观众看到咖啡液怎样进入杯中','留出倒入牛奶的过程'];
    const next=['靠近拍手柄和粉碗','同时拍到杯口和咖啡流出的地方','从壶嘴入画开始，保留完整倒入动作'];
    return {title:mood?'咖啡机开工了':'从咖啡粉到一杯拿铁',audience:mood?'记录做咖啡的片刻氛围':'让观众看懂咖啡制作的三个步骤',
      target,canReshoot,shots:ids.map((id,i)=>({
        title:titles[i],intent:intents[i],seconds:[first,second,target-first-second][i],
        clipId:clips.some(clip=>clip.id===id)?id:'',evidenceIndex:0,
        next:canReshoot?next[i]:'看看已有画面还能支持哪种讲法，必要时缩短或改主题。'
      }))
    };
  }
  function validate(raw,clips,brief,mode) {
    if(!raw||!Array.isArray(raw.shots)||raw.shots.length!==(fieldActions.length||3))throw Error('镜头数量不符，请重试。');
    const count=raw.shots.length, minimum=Math.max(6,2*count);
    const explicit=brief.match(/(\d{1,2})\s*秒/);
    const desired=Number(raw.target);
    const target=explicit?Number(explicit[1]):Number.isInteger(desired)&&desired>=6&&desired<=30?desired:18;
    if(target<minimum||target>30)throw Error('请把目标控制在 '+minimum+'–30 秒。');
    let seconds=raw.shots.map(shot=>Number(shot.seconds));
    if(seconds.some(value=>!Number.isInteger(value)||value<2||value>14)||seconds.reduce((sum,value)=>sum+value,0)!==target){
      const base=Math.floor(target/count),extra=target%count;
      seconds=Array.from({length:count},(_,index)=>base+(index<extra?1:0));
    }
    const canReshoot=state.canReshoot!==false&&raw.canReshoot!==false&&!/不能补拍|无法补拍|离店|离开现场|已离场|没法补拍/.test(brief);
    const reserved=new Map();
    const short=(value,fallback,max=150)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
    const shots=raw.shots.map((shot,index)=>{
      const clip=clips.find(item=>item.id===shot.clipId);
      const evidence=clip?.evidence[shot.evidenceIndex];
      const length=seconds[index];
      const rejected=mode==='model'&&shot.evidenceMatch==='mismatch';
      const hasEvidence=!rejected&&!!(evidence?.description&&Number.isFinite(evidence.second)&&evidence.second>=0&&evidence.second<clip.duration);
      const existing=hasEvidence?(reserved.get(clip.id)||[]):[];
      const window=hasEvidence?freeWindow(clip.duration,length,evidence.second,existing):null;
      if(window)reserved.set(clip.id,[...existing,window]);
      const reason=rejected?'看到的是其他动作':hasEvidence&&!window?(clip.duration<length?'原视频时长不足':'候选区间与其他镜头重叠'):'';
      const evidenceStatus=window?(mode==='model'?'pending':'found'):
        !rejected&&clips.some(item=>!item.evidence.length)?'unread':'missing';
      return {title:short(shot.title,'镜头 '+(index+1),55),intent:short(shot.intent,'说明这一段要讲的内容。'),
        seconds:length,clipId:window?clip.id:null,start:window?.start||0,end:window?.end||0,
        evidence:window?{second:evidence.second,description:evidence.description}:null,evidenceStatus,reason,
        next:window?'预览并确认关键动作是否完整。':!canReshoot?'看看手里的画面还能讲清什么，必要时缩短或换个讲法。':short(shot.next,'补拍时保留关键动作的开始和结束。')
      };
    });
    return {title:short(raw.title,'我的短片',32),audience:short(raw.audience,brief,130),
      brief,canReshoot,target,shots,clipIds:clips.map(clip=>clip.id),mode,source};
  }
  function freeWindow(duration,length,second,reserved) {
    const sorted=[...reserved].sort((a,b)=>a.start-b.start);
    const available=[];
    let cursor=0;
    for(const range of sorted){
      available.push([cursor,range.start]);cursor=range.end;
    }
    available.push([cursor,duration]);
    for(const [from,to] of available){
      const low=Math.max(Math.ceil(from*10-1e-7),Math.floor((second-length)*10+1e-7)+1);
      const high=Math.floor(Math.min(to-length,second)*10+1e-7);
      if(low>high)continue;
      const start=Math.max(low,Math.min(high,Math.round((second-length/2)*10)))/10;
      return {start,end:Number((start+length).toFixed(1))};
    }
    return null;
  }
  function renderProposal() {
    const found=plan.shots.filter(shot=>shot.evidenceStatus==='found').length;
    const missing=plan.shots.filter(shot=>shot.evidenceStatus==='missing').length;
    const pending=plan.shots.length-found-missing;
    $('ai-result-kind').textContent=plan.mode==='model'?'本地模型':'示例体验';
    $('ai-result').innerHTML='<div><h3>'+escapeText(plan.title)+'</h3><p>'+escapeText(plan.audience)+'</p><small>'+
      plan.target+' 秒 · 已找到 '+found+' · 待确认 '+pending+' · 缺少 '+missing+(plan.canReshoot?'':' · 无法补拍')+'</small></div>'+
      plan.shots.map((shot,index)=>{
        const clip=getClip(shot.clipId);
        const label=shot.evidenceStatus==='found'?'已找到':shot.evidenceStatus==='missing'?'缺少':'待确认';
        return '<article class="ai-shot '+(!clip?'is-missing':'')+'" data-evidence-status="'+shot.evidenceStatus+'"><div class="ai-meta"><span>镜头 '+(index+1)+'</span><span>'+shot.seconds+' 秒 · '+label+'</span></div>'+
          '<h3>'+escapeText(shot.title)+'</h3><p>'+escapeText(shot.intent)+'</p>'+
          (clip?'<div class="ai-evidence"><strong>'+escapeText(clip.name)+'</strong><p>原视频 '+shot.evidence.second+' 秒 · '+escapeText(shot.evidence.description)+'</p></div>'+
            '<div class="ai-actions"><button data-ai-preview="'+index+'">预览 '+shot.start+'–'+shot.end+' 秒</button><button data-ai-decline="'+index+'">暂不采用</button></div>':
            declined.has(index)?'<button data-ai-restore="'+index+'">恢复推荐片段</button>':'')+
          '<small>'+escapeText(shot.reason||(shot.evidenceStatus==='unread'?'有素材未读到画面，请打开原视频核对。':'')||shot.next)+'</small><div class="ai-actions"><button data-ai-move="'+index+'" data-dir="-1" '+(index===0?'disabled':'')+'>上移</button>'+
          '<button data-ai-move="'+index+'" data-dir="1" '+(index===plan.shots.length-1?'disabled':'')+'>下移</button></div></article>';
      }).join('')+
      '<small>待确认的片段会保留为空位。打开预览核对动作后，可以确认用到草稿。采用后可撤销。</small>'+
      '<div class="ai-actions"><button id="ai-apply" class="primary">'+(found===0?'保存镜头安排到拍摄清单':'把这套方案加到草稿')+'</button><button id="ai-export">下载镜头清单</button></div>';
  }
  async function generate() {
    const brief=$('ai-brief').value.trim();
    if(brief.length<4){$('ai-step').textContent='请先写一句你想拍或剪什么。';$('ai-brief').focus();return;}
    const clips=available().filter(clip=>selectedIds.has(clip.id));
    if(clips.length>8){$('ai-step').textContent='每次最多选择 8 段视频。';return;}
    if(source==='mine'&&clips.length>3){$('ai-step').textContent='首次画面检查请选择最多 3 段，缩短分析时间。';return;}
    const controller=new AbortController();run=controller;
    $('ai-generate').disabled=true;$('ai-cancel').hidden=false;
    clearResult('正在分析目标与素材…');
    try {
      await checkStatus();
      controller.signal.throwIfAborted();
      if(!modelStatus.text&&source==='mine')throw Error('此评审版可以导入并预览本地视频。AI 识别视频画面需使用本机版；在本页可切换到咖啡案例体验生成镜头安排。');
      if(!modelStatus.text&&!/咖啡|拿铁|倒入牛奶|萃取/.test(brief))throw Error('示例模式只覆盖咖啡示例。分析其他主题请启动本地 AI。');
      if(source==='mine'&&clips.length&&!modelStatus.vision)throw Error('导入视频的画面分析需要本地视觉模型。');
      const records=await analyzeClips(clips,controller.signal);
      controller.signal.throwIfAborted();
      $('ai-step').textContent='正在检查需要哪些镜头、手里的素材够不够…';
      const result=modelStatus.text?await request('plan',{brief,clips:records,requiredActions:fieldActions},controller.signal):null;
      controller.signal.throwIfAborted();
      plan=validate(result?.output||offlineSample(brief,records),records,brief,result?'model':'sample');
      renderProposal();
      const unread=records.filter(clip=>!clip.evidence.length).length;
      $('ai-step').textContent=unread?unread+' 段没有获得可用画面描述，已保留为待确认。':'方案已生成，可先播放每段推荐片段。';
    } catch(error) {
      clearResult(controller.signal.aborted?'已取消，本次分析未改动草稿。':error.message);
      $('ai-step').textContent=controller.signal.aborted?'已取消':'可调整输入后重试。';
    } finally {
      if(run===controller){run=null;$('ai-generate').disabled=false;$('ai-cancel').hidden=true;}
    }
  }
  function previewShot(shot,onConfirm=null) {
    const clip=getClip(shot.clipId);
    if(!clip){toast('这段素材暂不可用，请重新导入。');return;}
    dialog('预览 · '+shot.title,'<video id="ai-preview-video" controls playsinline preload="metadata" src="'+clip.source+'" poster="'+(clip.poster||'')+'"></video>'+
      '<p>'+escapeText(clip.name)+' · 推荐原视频 '+shot.start+'–'+shot.end+' 秒</p>'+
      '<div class="ai-evidence">参考画面 '+shot.evidence.second+' 秒 · '+escapeText(shot.evidence.description)+'</div><button id="ai-jump-evidence">跳到参考画面</button>'+
      (onConfirm?'<button class="primary" id="ai-confirm-evidence" disabled>确认动作拍到了</button>':''));
    const player=$('ai-preview-video');
    player.addEventListener('loadedmetadata',()=>{player.currentTime=shot.start;},{once:true});
    player.addEventListener('timeupdate',()=>{if(player.currentTime>=shot.end&&!player.paused)player.pause();});
    $('ai-jump-evidence').onclick=()=>{player.pause();player.currentTime=shot.evidence.second;};
    const confirm=$('ai-confirm-evidence');
    if(confirm){
      player.addEventListener('play',()=>{confirm.disabled=false;},{once:true});
      confirm.onclick=()=>{closeDialog();onConfirm();};
    }
  }
  function applyPlan() {
    if(!plan)return;
    const draft=structuredClone(plan);
    if(draft.shots.some(shot=>shot.clipId&&!getClip(shot.clipId))){toast('素材已变化，请重新生成方案。');return;}
    draft.shots=draft.shots.map(shot=>shot.evidenceStatus==='pending'
      ?{...shot,candidate:{clipId:shot.clipId,start:shot.start,end:shot.end,evidence:shot.evidence},clipId:null,evidence:null,start:0,end:0,reason:'候选画面待确认'}:shot);
    currentSlot=null;
    change('采用 AI 镜头安排方案 · '+draft.title,()=>{
      state.aiPlan=draft;
      if(!draft.canReshoot)state.canReshoot=false;
      if(fieldActions.length&&state.field?.source==='mine')state.field.ran=true;
    });
    const blank=draft.shots.every(shot=>!shot.clipId);
    navigate(blank?'shoot':'edit');
    if(!blank)loadSlot(0);
  }
  function moveShot(index,offset) {
    const target=index+offset;
    if(!plan||!plan.shots[target])return;
    [plan.shots[index],plan.shots[target]]=[plan.shots[target],plan.shots[index]];
    const before=declined.get(index), after=declined.get(target);
    declined.delete(index);declined.delete(target);
    if(before)declined.set(target,before);
    if(after)declined.set(index,after);
    renderProposal();
  }
  function renderDraft() {
    const draft=state.aiPlan;
    const missing=draft.shots.filter(shot=>!getClip(shot.clipId)).length;
    $('assistant').innerHTML='<div class="hero-stat"><b>'+missing+'</b><span>段等待素材</span></div>'+
      draft.shots.map((shot,index)=>'<article class="'+(getClip(shot.clipId)?'good':'issue')+'"><h3>'+escapeText(shot.title)+'</h3><p>'+escapeText(shot.next)+'</p>'+
        '<button data-locate="'+index+'">定位片段</button>'+
        (getClip(shot.clipId||shot.candidate?.clipId)?'<button data-ai-draft-preview="'+index+'">'+(shot.candidate?'核对候选画面':'查看引用画面')+'</button>':'')+'</article>').join('')+
      '<button data-page="'+(missing&&canReshootNow()?'shoot':'ai')+'">'+(missing&&canReshootNow()?'打开拍摄清单':'调整素材与表达')+'</button>';
  }
  function previewDraft(index) {
    const shot=state.aiPlan?.shots[index];
    if(!shot)return;
    if(!shot.candidate){previewShot(shot);return;}
    previewShot({...shot,...shot.candidate},()=>{
      if(state.aiPlan?.shots[index]!==shot)return;
      change('确认动作拍到了 · '+shot.title,()=>{
        Object.assign(shot,shot.candidate,{evidenceStatus:'found',reason:''});
        delete shot.candidate;
      });
      if(page==='edit')loadSlot(index);
      if(page==='shoot')window.fieldCheck?.render();
    });
  }
  function renderShotList() {
    const draft=state.aiPlan;
    $('tasks').innerHTML=draft.shots.map((shot,index)=>'<article class="task"><div><span class="status">'+(getClip(shot.clipId)?'已有可用片段':shot.candidate?'待确认':canReshootNow()?'待拍':'待调整表达')+'</span><h3>'+escapeText(shot.title)+'</h3></div><div><p>'+escapeText(shot.intent)+'</p><p>'+shot.seconds+' 秒 · '+escapeText(!shot.clipId&&!canReshootNow()?'用现有画面调整表达。':shot.next)+'</p></div>'+
      (getClip(shot.clipId||shot.candidate?.clipId)?'<button data-ai-draft-preview="'+index+'">'+(shot.candidate?'核对候选画面':'查看引用画面')+'</button>':'<button data-page="ai">更新素材</button>')+'</article>').join('');
  }
  function downloadShotList(draft) {
    const lines=[draft.title,draft.audience,draft.target+' 秒',draft.canReshoot?'拍摄清单':'使用已有素材的镜头清单',''];
    for(const [index,shot] of draft.shots.entries())lines.push((index+1)+'. '+shot.title+' · '+shot.seconds+' 秒',shot.intent,shot.next,
      shot.evidenceStatus==='pending'?'候选片段待确认：'+(getClip(shot.clipId)?.name||'等待素材'):getClip(shot.clipId)?.name||'等待素材','');
    download('拍完好剪-镜头清单.txt',lines.join('\n'),'text/plain;charset=utf-8');
  }
  const chat=[];
  function currentActions(info) {
    const list=[];
    const {focus,shots}=info;
    if(focus>=0)list.push({id:'locate-'+focus,label:'定位当前镜头'});
    if(focus>=0&&shots[focus+1])list.push({id:'locate-'+(focus+1),label:'看下一镜'});
    list.push({id:'play',label:'顺播当前草稿'});
    if(state.aiPlan){
      state.aiPlan.shots.forEach((shot,index)=>{
        if(getClip(shot.clipId||shot.candidate?.clipId))list.push({id:'proof-'+index,label:'查看「'+shot.title+'」的画面依据'});
      });
      if(canReshootNow())list.push({id:'shoot',label:'打开拍摄清单'});
    } else {
      const gaps=issues();
      if(gaps.some(item=>item.type==='missing'))list.push({id:'find',label:'看看中间这段能用什么'});
      if(gaps.some(item=>item.type==='short'))list.push({id:'extend',label:'看看倒牛奶的原视频'});
      if(gaps.length)list.push({id:'alternative',label:'预览 12 秒的氛围剪法'});
    }
    return [...list,{id:'ai',label:'按一句话重新策划'}].slice(0,10);
  }
  function context(question='') {
    let offset=0;
    const timeline=slots();
    const named=timeline.findIndex(slot=>question.includes(slot.title));
    const keywords=state.aiPlan?[]:['压紧咖啡粉','咖啡流入','倒入牛奶'];
    const namedKeyword=keywords.findIndex(word=>question.includes(word));
    const focus=named>=0?named:namedKeyword>=0?namedKeyword:
      currentSlot!==null?currentSlot:timeline.findIndex(slot=>slot.id===selected);
    const shots=timeline.map(slot=>{
      const clip=getClip(slot.id), used=clip?Math.max(0,Math.min(slot.end,clip.duration)-slot.start):0;
      const position=clock(offset);
      offset+=slot.length;
      return {title:slot.title,position,range:position+'–'+clock(offset),plannedSeconds:slot.length,
        clip:clip?.name||null,usedSeconds:Number(used.toFixed(1)),rawSeconds:clip?Number(clip.duration.toFixed(1)):null};
    });
    return {
      goal:state.aiPlan?.audience||$('goal').selectedOptions[0].textContent, target:targetSeconds(), focus,
      shots,
      inventory:(state.aiPlan?media.filter(clip=>state.aiPlan.clipIds.includes(clip.id)):media).map(clip=>({name:clip.name,tag:tags[clip.tag],duration:clip.duration})),
      knownIssues:state.aiPlan?state.aiPlan.shots.filter(shot=>!getClip(shot.clipId)).map(shot=>shot.title+'缺画面证据'):issues().map(issue=>issue.body)
    };
  }
  function scopeLabel(info) {
    const shot=info.shots[info.focus];
    return shot?shot.range+' · '+shot.title:'整条剪辑草稿 · '+info.target+' 秒';
  }
  function updateMirrorScope() {
    $('mirror-scope').textContent=scopeLabel(context())+(compare?'（建议依据当前草稿）':'');
  }
  function hintedTopic(question) {
    if(/下一镜|怎么接|衔接|转场|硬切/.test(question))return 'transition';
    if(/留多长|时长|几秒|节奏|切点|怎么裁|太短|太长|快一点|慢一点/.test(question))return 'timing';
    if(/缺|补拍|离店|离场|找.{0,2}素材|不够|替代/.test(question))return 'gap';
    if(/开头|结尾|顺序|结构|怎么剪|表达/.test(question))return 'structure';
    return '';
  }
  function groundedAdvice(topic,info,question,actionId,noReshoot) {
    const shot=info.shots[info.focus], next=info.shots[info.focus+1];
    const gap=info.shots.find(item=>!item.clip);
    const available=new Set(currentActions(info).map(action=>action.id));
    const advice=(basis,suggestion,id='')=>({basis,suggestion,actionId:available.has(id)?id:''});
    if(topic==='timing'){
      if(!shot)return advice('你当前在看整条剪辑草稿。','先选中一个镜头，我就能结合它的计划时长和原视频给建议。');
      const basis='「'+shot.title+'」计划 '+shot.plannedSeconds+' 秒，已用 '+shot.usedSeconds+' 秒。';
      if(!shot.clip)return advice(basis,'先补上能看清关键动作的画面，再从动作结束处判断切点。',!state.aiPlan&&info.focus===1?'find':'ai');
      if(shot.usedSeconds<shot.plannedSeconds&&shot.rawSeconds>=shot.plannedSeconds){
        return advice(basis+' 原视频 '+shot.rawSeconds+' 秒。','先预览原视频，把动作留完整。若动作在计划时长之前就结束，可以缩短这一段。',!state.aiPlan&&info.focus===2?'extend':'locate-'+info.focus);
      }
      return advice(basis,shot.usedSeconds<shot.plannedSeconds
        ?'这段原视频长度不足。可以缩短段落，再把多出来的时间留给更需要解释的镜头。'
        :/快一点|太长|加快/.test(question)
          ?'先试着裁掉动作前后的停顿，保留能看清主体和结果的部分。请预览确认具体切点。'
          :'先保留当前时长，顺播看关键动作是否已经讲清。若完成后还有明显停顿，再尝试缩短。',state.aiPlan?'proof-'+info.focus:'locate-'+info.focus);
    }
    if(topic==='transition'){
      if(!shot)return advice('当前没有选中的剪辑草稿镜头。','先选一个镜头，我会结合它和下一镜给衔接建议。');
      if(!next)return advice('「'+shot.title+'」是当前最后一镜。','可以在关键动作完成后收尾，顺播确认结尾是否有足够的停留。','play');
      const basis='「'+shot.title+'」之后是 '+next.position+' 的「'+next.title+'」。';
      if(!next.clip)return advice(basis+' 下一镜还没有素材。','先补齐下一镜再试接点。保留制作过程时，应让观众看见这一步。',!state.aiPlan&&info.focus===0?'find':'ai');
      if(!shot.clip)return advice(basis+' 当前镜头还没有素材。','先确认这一镜能否补齐，再顺播检查两个动作能否接上。',!state.aiPlan&&info.focus===1?'find':'ai');
      return advice(basis,'先试硬切，等前一个关键动作交代清楚再切进下一镜。需要在预览里确认动作和声音是否顺畅。','locate-'+(info.focus+1));
    }
    if(topic==='gap'){
      if(!state.aiPlan&&available.has('alternative')&&/氛围|换.{0,2}讲|改.{0,2}表达/.test(question)){
        return advice('当前有一个 12 秒氛围剪法可供预览。','用机器操作连上压紧咖啡粉和倒入牛奶。先看推荐片段，再决定是否采用。','alternative');
      }
      if(gap){
        const basis=gap.range+' 的「'+gap.title+'」还没有放入画面。';
        const gapIndex=info.shots.indexOf(gap);
        if(state.aiPlan?.shots[gapIndex]?.candidate)return advice(basis,'有候选片段。先打开原视频，确认能看到关键动作，再放进草稿。','proof-'+gapIndex);
        if(!state.aiPlan&&available.has('find'))return advice(basis,'先查项目里未用的镜头。若没有合适片段'+(noReshoot?'，可以调整表达，避免跳过一个还承诺会展示的步骤。':'，再决定是否安排补拍。'),'find');
        return advice(basis,noReshoot?'用已有画面调整想讲的内容，再核对新方案。':'先检查是否有可用的原视频区间。仍缺时，把它带到拍摄清单。',noReshoot?'ai':actionId==='shoot'?'shoot':'ai');
      }
      const short=info.shots.find(item=>item.usedSeconds<item.plannedSeconds);
      if(short)return advice('「'+short.title+'」比计划少 '+Number((short.plannedSeconds-short.usedSeconds).toFixed(1))+' 秒画面。','先看原视频能否延长。若内容已经讲清，也可以缩短这段。',available.has('extend')?'extend':'locate-'+info.shots.indexOf(short));
      return advice('当前草稿各段已有画面。','顺播确认画面能否支撑原先的表达目标。','play');
    }
    if(topic==='structure'){
      const order=info.shots.map(item=>item.title).join(' → ');
      return advice('当前 '+info.target+' 秒草稿是「'+order+'」。','先按现有顺序顺播，确认开头能让观众知道要看什么，中段交代关键动作，末段给出结果。想换表达时可以先生成一版新镜头安排。',gap?'ai':'play');
    }
    return advice('小镜会参考当前项目和选中镜头。','你可以问这一镜留多长、怎么接下一镜，或缺素材时先处理什么。');
  }
  function drawChat() {
    const history=$('mirror-history');
    const last=chat.at(-1);
    history.innerHTML=chat.map((turn,index)=>{
      const pending=!turn.reply&&!turn.error;
      const suggestion=turn.reply&&turn.actions.find(action=>action.id===turn.reply.actionId);
      return '<div class="mirror-bubble user">'+escapeText(turn.question)+'</div>'+
        '<div class="mirror-turn"><img class="mirror-avatar" src="assets/xiaojing.png" alt="" width="24" height="24"><div class="mirror-bubble">'+
        '<small>'+escapeText(turn.scope)+(turn.model?' · 本地模型':'')+'</small>'+
        (pending?'<p>正在看这段草稿…</p>':turn.error?'<p>'+escapeText(turn.error)+'</p><button data-mirror-retry="'+index+'">重新提问</button>':
          '<p><strong>依据</strong> '+escapeText(turn.reply.basis)+'</p><p><strong>建议</strong> '+escapeText(turn.reply.suggestion)+'</p>'+
          (suggestion?'<button data-mirror-action="'+index+'">'+escapeText(suggestion.label)+'</button>':''))+'</div></div>';
    }).join('');
    if(last)history.scrollTop=history.scrollHeight;
  }
  async function askMirror() {
    const input=$('mirror-question'),question=input.value.trim();
    if(!question){input.focus();return;}
    if(askRun)return;
    const info=context(question), actions=currentActions(info);
    const previous=chat.at(-1);
    const signature=JSON.stringify(info.shots);
    if(/不能补|无法补|没法补|已.{0,3}离店|已.{0,3}离场/.test(question)){
      state.canReshoot=false;persist();
    } else if(!canReshootNow()&&/还在现场|现在可以补拍/.test(question)){
      state.canReshoot=true;persist();
    }
    const noReshoot=!canReshootNow()||/不想补/.test(question);
    const turn={question,scope:scopeLabel(info),actions,focus:info.focus,signature,noReshoot};
    chat.push(turn);
    if(chat.length>12)chat.shift();
    input.value='';
    const controller=new AbortController();askRun=controller;
    const button=$('mirror-send');button.disabled=true;drawChat();
    try {
      await checkStatus();
      const continuity=previous?.scope===turn.scope?previous.topic:'';
      const known=hintedTopic(question)||(/为什么|再说|那呢|然后呢/.test(question)?continuity:'');
      const result=modelStatus.text?await request('ask',{question,context:{...info,previousTopic:continuity,noReshoot},actions},controller.signal):null;
      turn.topic=known||result?.topic||'other';
      turn.model=!!result;
      turn.reply=groundedAdvice(turn.topic,info,question,result?.actionId,noReshoot);
    } catch(error){
      turn.topic=hintedTopic(question)||'other';
      if(turn.topic==='other')turn.error='本地模型暂不可用。可以重试，或问用了多少秒、下一镜怎么接、素材不够怎么处理。';
      else turn.reply=groundedAdvice(turn.topic,info,question,'',noReshoot);
      turn.scope+=' · 本地模型暂不可用';
    } finally {
      askRun=null;button.disabled=false;drawChat();
    }
  }
  function handleMirrorAction(index) {
    const turn=chat[index], id=turn?.reply?.actionId;
    if(!id)return;
    const info=context(turn.question);
    if(turn.signature!==JSON.stringify(info.shots)||!currentActions({...info,focus:turn.focus}).some(action=>action.id===id)){
      toast('草稿已变化，请重新提问。');return;
    }
    if(id.startsWith('locate-')){stop();loadSlot(Number(id.slice(7)));}
    else if(id.startsWith('proof-'))previewDraft(Number(id.slice(6)));
    else if(id==='play'){stop();playAll();}
    else if(id==='ai'||id==='shoot')navigate(id);
    else if(['find','extend','alternative'].includes(id)){
      if(!state.analyzed){state.analyzed=true;renderAssistant();persist();}
      document.querySelector('#assistant [data-action="'+id+'"]')?.click();
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    if(button.dataset.example){useSource('sample');$('ai-brief').value=examples[button.dataset.example];inputChanged();}
    if(button.dataset.aiPreview!==undefined&&plan){
      const index=Number(button.dataset.aiPreview);
      const shot=plan.shots[index];
      previewShot(shot,shot.evidenceStatus==='pending'?()=>{
        if(plan?.shots[index]!==shot)return;
        shot.evidenceStatus='found';renderProposal();
      }:null);
    }
    if(button.dataset.aiMove!==undefined)moveShot(Number(button.dataset.aiMove),Number(button.dataset.dir));
    if(button.dataset.aiDecline!==undefined&&plan){
      const index=Number(button.dataset.aiDecline),shot=plan.shots[index];
      declined.set(index,shot);
      plan.shots[index]={...shot,clipId:null,start:0,end:0,evidence:null,evidenceStatus:'missing',reason:'已跳过这段',next:'你已跳过这段推荐画面，可先保留为空位。'};
      renderProposal();
    }
    if(button.dataset.aiRestore!==undefined&&plan){
      const index=Number(button.dataset.aiRestore);
      plan.shots[index]=declined.get(index);
      declined.delete(index);
      renderProposal();
    }
    if(button.dataset.aiDraftPreview!==undefined&&state.aiPlan)previewDraft(Number(button.dataset.aiDraftPreview));
    if(button.id==='ai-apply')applyPlan();
    if(button.id==='ai-export'&&plan)downloadShotList(plan);
    if(button.dataset.mirrorExample){$('mirror-question').value=button.dataset.mirrorExample;$('mirror-question').focus();}
    if(button.dataset.mirrorRetry!==undefined){$('mirror-question').value=chat[Number(button.dataset.mirrorRetry)].question;askMirror();}
    if(button.dataset.mirrorAction!==undefined)handleMirrorAction(Number(button.dataset.mirrorAction));
  });
  document.addEventListener('change',event=>{
    const id=event.target.dataset.aiClip;
    if(!id)return;
    if(event.target.checked)selectedIds.add(id);else selectedIds.delete(id);
    inputChanged();
  });
  $('ai-source').onchange=()=>{fieldActions=[];useSource($('ai-source').value);inputChanged();};
  $('ai-brief').oninput=inputChanged;
  $('ai-import').onclick=()=>{useSource('mine');$('import').click();};
  $('ai-generate').onclick=generate;
  $('ai-cancel').onclick=()=>run?.abort();
  $('mirror-form').onsubmit=event=>{event.preventDefault();askMirror();};
  $('mirror-question').onkeydown=event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();askMirror();}
  };
  window.studioAI={
    open() {if(source==='mine'&&!selectedIds.size)useSource('mine');renderAssets();checkStatus();},
    refresh() {renderAssets();},
    onImport() {useSource('mine');inputChanged();},
    prepareField(titles) {
      useSource('mine');fieldActions=[...titles];
      $('ai-brief').value='检查这条短片的必拍动作。按顺序：'+titles.join('、')+'。'+(canReshootNow()?'还在现场。':'已经离场，无法补拍。');
      inputChanged();$('ai-brief').focus();
    },
    renderDraft,renderShotList,updateMirrorScope,previewDraft,
    exportShotList() {downloadShotList(state.aiPlan);}
  };
  render();
  checkStatus();
})();
