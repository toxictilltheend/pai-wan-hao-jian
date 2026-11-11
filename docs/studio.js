'use strict';
const $ = id => document.getElementById(id);
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initial = () => ({
  goal:'process', target:18, filled:false, fillId:null, end:2, task:false,
  taskDone:false, analyzed:false, aiPlan:null, canReshoot:null, field:null, logs:[], undo:[], imports:[]
});
const stock = [
  {id:'3572',name:'01 · 压实咖啡粉',tag:'prepare',duration:11,source:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3572.mp4',poster:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3572.jpg'},
  {id:'3573',name:'02 · 倒入牛奶',tag:'milk',duration:11,source:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3573.mp4',poster:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3573.jpg'},
  {id:'3571',name:'03 · 咖啡流入杯中',tag:'extract',duration:10,source:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3571.mp4',poster:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3571.jpg'},
  {id:'3578',name:'04 · 研磨与机器操作',tag:'machine',duration:12,source:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3578.mp4',poster:'https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3578.jpg'}
];
const SAMPLE_KEY='shot-studio-v2';
const PROJECT_PREFIX='shot-studio-project-v1:';
const requestedProject=new URLSearchParams(location.search).get('project');
let storageKey=SAMPLE_KEY;
let state = initial();
try {
  const own=requestedProject&&/^[0-9a-f-]{36}$/.test(requestedProject)?JSON.parse(localStorage.getItem(PROJECT_PREFIX+requestedProject)):null;
  if(own?.version===2&&own.data?.project?.id===requestedProject&&Array.isArray(own.data.aiPlan?.shots)&&own.data.aiPlan.shots.length)storageKey=PROJECT_PREFIX+requestedProject;
  const saved=storageKey===SAMPLE_KEY?JSON.parse(localStorage.getItem(SAMPLE_KEY)):own;
  if (saved?.version===2 && saved.data && Array.isArray(saved.data.logs)) state={...initial(),...saved.data};
} catch { /* Fall back to a clean sample if the browser has no readable draft. */ }
let selected='3572', page='edit', currentSlot=null, playing=false, compare=false, pending=null;
let media = state.project?[]:[...stock], database, toastTimer;
const tags={prepare:'准备咖啡粉',machine:'机器操作',extract:'咖啡流入杯中',milk:'倒入牛奶',unknown:'待标注'};
function toast(message) {
  $('toast').textContent=message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200);
}
function persist() {
  try {
    if(state.project)state.project.updatedAt=Date.now();
    localStorage.setItem(storageKey,JSON.stringify({version:2,data:state}));
    $('save').textContent='已保存到此浏览器';
  } catch { $('save').textContent='保存失败，请导出方案'; }
}
function snapshot() {
  const {goal,target,filled,fillId,end,task,taskDone,analyzed,aiPlan}=state;
  return {goal,target,filled,fillId,end,task,taskDone,analyzed,aiPlan:aiPlan?structuredClone(aiPlan):null,
    ...(state.project?{field:structuredClone(state.field),project:structuredClone(state.project)}:{})};
}
function log(message) {
  state.logs.unshift({at:new Date().toISOString(),message});
  state.logs=state.logs.slice(0,100);
}
function change(message,mutate) {
  stop();
  compare=false;
  state.undo.push(snapshot());
  state.undo=state.undo.slice(-20);
  mutate();
  log(message);
  persist();render();toast(message);
}
function getClip(id) { return media.find(clip=>clip.id===id); }
function canReshootNow() { return state.canReshoot??(state.aiPlan?.canReshoot!==false); }
const processGoal = () => state.goal==='process';
const middleTitle = () => processGoal() ? '咖啡流入杯中' : '机器运转';
const middleTag = () => processGoal() ? 'extract' : 'machine';
function placeholder(clip) {
  return clip.poster ? '<img src="'+clip.poster+'" alt="">' : '<div class="asset-placeholder">本地视频</div>';
}
function slots(original=false) {
  if(state.aiPlan)return state.aiPlan.shots.map(shot=>({
    title:shot.title,id:shot.clipId,start:shot.start,end:shot.end,length:shot.seconds,caption:shot.intent
  }));
  const unit=state.target===18 ? 5 : 3;
  const final=state.target-unit*2;
  return [
    {title:'准备咖啡粉',id:'3572',start:0,end:unit,length:unit,caption:processGoal()?'准备咖啡粉，压实。':'从压紧咖啡粉开始。'},
    {title:middleTitle(),id:(!original&&state.filled)?state.fillId||'3571':null,start:0,end:unit,length:unit,caption:processGoal()?'接下来，让咖啡液流入杯中。':'咖啡机开工了。'},
    {title:'倒入牛奶',id:'3573',start:0,end:original?2:Math.min(state.end,final),length:final,caption:'最后慢慢倒入牛奶，看它们融合。'}
  ];
}
function targetSeconds() {return state.aiPlan?.target??state.target;}
function clock(seconds) {
  const whole=Math.max(0,Math.floor(seconds));
  return String(Math.floor(whole/60)).padStart(2,'0')+':'+String(whole%60).padStart(2,'0');
}
function issues() {
  const list=[];
  const middle=slots()[1], clip=getClip(middle.id);
  if (!clip || clip.tag!==middleTag() || clip.duration<middle.length) {
    const mismatch=!!clip;
    list.push({
      type:'missing',
      title:mismatch?'中间的片段需要复核':processGoal()?'制作步骤少了一段画面':'中间还有一段空位',
      body:mismatch?'这段画面可能不合适，或长度不够。请核对原视频，再选择替换。':processGoal()?'从压紧咖啡粉直接跳到倒入牛奶，草稿里少了咖啡流进杯子的画面。':'可以用机器操作的画面连接前后两个镜头。'
    });
  }
  const needed=slots()[2].length;
  if (state.end<needed) list.push({type:'short',title:'倒入牛奶用到的片段比计划短 '+(needed-state.end).toFixed(1)+' 秒',body:'这个段落计划 '+needed+' 秒，目前只用了原视频的 0–'+state.end+' 秒。先看原视频能不能多留一点。'});
  return list;
}
function used(id) { return slots().some(slot=>slot.id===id); }
function navigate(next) {
  stop();
  page=next;
  document.querySelectorAll('.page').forEach(section=>section.hidden=section.id!==page);
  document.querySelectorAll('.rail button').forEach(button=>{
    const active=button.dataset.page===page;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  if (page==='library') renderLibrary();
  if (page==='shoot'){renderTasks();window.fieldCheck?.render();}
  if (page==='history') renderHistory();
  $('brief-bar').hidden=page==='ai'||page==='projects';
  $('project-head').hidden=page==='projects';
  $('export').hidden=page==='projects';
  $('save').hidden=page==='projects';
  $('footnote').textContent=page==='projects'?'项目保存在此浏览器':state.project?'素材和草稿保存在此浏览器':'示例项目 · 实拍素材来自 Mixkit';
  $('retry').hidden=page==='projects';
  if(page==='projects')window.projectHub?.refresh();
  if (page==='ai')window.studioAI?.open();
}
function showClip(id) {
  const clip=getClip(id);
  if (!clip) return;
  stop();selected=id;currentSlot=null;
  $('gap-screen').hidden=true;
  $('video').src=clip.source;
  $('video').poster=clip.poster||'';
  $('preview-title').textContent=clip.name;
  $('timecode').textContent='原视频 · '+clip.duration.toFixed(1)+' 秒';
  $('caption').textContent=clip.tag==='unknown'?'新素材的内容等待你确认。':'素材标注 · '+tags[clip.tag];
  $('trim').innerHTML='<label>原视频信息</label><p>'+clip.duration.toFixed(1)+' 秒 · '+(clip.custom?'本地导入视频':'Mixkit 实拍素材')+'</p>'+
    (id==='3573'?'<div class="fields"><span>从 0 秒开始</span><label>结束时间 <input id="trim-end" type="number" min="0.1" max="'+clip.duration+'" step="0.1" value="'+state.end+'"></label><button id="apply-trim">应用用到的片段</button></div><p>改结束时间后，草稿会显示新的片段时长。</p>':'');
  renderBin();renderTimeline();window.studioAI?.updateMirrorScope();
}
function renderBin() {
  const projectMedia=state.aiPlan&&!state.project?media.filter(clip=>state.aiPlan.clipIds.includes(clip.id)):media;
  $('clip-count').textContent=projectMedia.length+' 段';
  $('bin').innerHTML=projectMedia.slice(0,4).map(clip=>'<button class="clip '+(clip.id===selected?'selected':'')+'" data-clip="'+clip.id+'" aria-pressed="'+(clip.id===selected)+'">'+
    placeholder(clip)+'<div class="meta">'+escapeText(clip.name)+'<small>'+clip.duration.toFixed(1)+' 秒 · '+(used(clip.id)?'已在剪辑草稿':'未使用')+'</small></div></button>').join('')||'<p class="muted">还没有导入视频。</p>';
}
function renderTimeline() {
  const timeline=slots(compare);
  const missing=timeline.reduce((sum,slot)=>sum+(getClip(slot.id)?Math.max(0,slot.length-Math.min(slot.end,getClip(slot.id).duration)+slot.start):slot.length),0);
  const target=targetSeconds();
  $('coverage').textContent=(compare?'修改前 · ':'')+(target-missing).toFixed(1)+' / '+target+' 秒有画面';
  $('ruler-middle').textContent=clock(target/2);
  $('ruler-end').textContent=clock(target);
  $('track').innerHTML=timeline.map((slot,index)=>{
    const clip=getClip(slot.id), end=clip?Math.min(slot.end,clip.duration):0;
    return '<button class="segment '+(!clip?'gap':end-slot.start<slot.length?'short':'')+(index===currentSlot?' focus':'')+'" style="flex:'+slot.length+'" data-slot="'+index+'">'+
      (clip?.poster?'<img src="'+clip.poster+'" alt="">':'')+'<strong>'+String(index+1).padStart(2,'0')+'　'+escapeText(slot.title)+'</strong><small>'+slot.length+' 秒 · '+(clip?(end-slot.start).toFixed(1)+' 秒已用':'等待素材')+'</small></button>';
  }).join('');
  $('script-track').innerHTML=timeline.map(slot=>'<span style="flex:'+slot.length+'">'+escapeText(slot.caption)+'</span>').join('');
  $('compare').hidden=!!state.aiPlan;
  $('compare').textContent=compare?'回到当前版本':'查看修改前';
  $('undo').disabled=!state.undo.length;
}
function renderAssistant() {
  if(state.aiPlan&&window.studioAI){window.studioAI.renderDraft();return;}
  if (!state.analyzed) {
    $('assistant').innerHTML='<div class="hero-stat"><b>先看一遍</b></div><p>播放草稿，留意画面在哪里中断。检查后可以定位缺口，找回未使用的镜头。</p><div class="notice">示例语义来自示例素材说明；缺少的秒数按当前用到的片段计算。</div>';
    return;
  }
  const list=issues();
  const timeline=slots();
  $('assistant').innerHTML='<div class="hero-stat"><b>'+list.length+'</b><span>处需要处理 · 依据当前目标与剪辑草稿</span></div>'+
    (list.length?list.map(issue=>{
      const index=issue.type==='missing'?1:2;
      const start=timeline.slice(0,index).reduce((sum,slot)=>sum+slot.length,0);
      const range=[start,start+timeline[index].length].map(second=>'00:'+String(second).padStart(2,'0')).join('–');
      return '<article class="issue"><span class="number">'+range+' · '+(issue.type==='missing'?'还缺哪些画面':'用了多少秒')+'</span><h3>'+issue.title+'</h3><p>'+issue.body+'</p><button data-locate="'+index+'">定位片段</button>'+
      (issue.type==='missing'?'<button data-action="find">查看可用素材</button>'+(canReshootNow()?'<button data-action="task">加入补拍清单</button>':''):'<button data-action="extend">看看原视频能否多留几秒</button>')+'</article>';
    }).join(''):
      '<div class="good"><h3>这版剪辑草稿已有连续画面</h3><p>三个段落都有可用片段。播放确认节奏，再决定是否继续调整。</p><button data-action="play">播放当前版本</button></div>')+
    (list.length?'<button data-action="alternative">改剪成 12 秒氛围短片</button>':'');
}
function render() {
  $('goal').value=state.goal;$('target').value=state.target;
  const plan=state.aiPlan;
  $('project-title').textContent=plan?.title||'从咖啡粉到一杯拿铁';
  $('project-kind').textContent=state.project?'自建工作区':plan?'创作草稿':'咖啡制作记录';
  $('reset').hidden=!!state.project;
  $('goal-field').hidden=!!plan;$('duration-field').hidden=!!plan;
  $('ai-brief-summary').hidden=!plan;
  $('ai-brief-summary').textContent=plan?plan.audience+' · '+plan.target+' 秒':'';
  $('analysis-kind').textContent=state.project?(plan?.mode==='model'?'本机模型':'项目检查'):plan?(plan.mode==='model'?'本地模型':'示例体验'):'示例分析';
  $('analyze').textContent=state.project?'✧ 检查素材缺口':plan?'✧ 调整 AI 方案':'✧ 检查素材缺口';
  renderBin();renderTimeline();renderAssistant();renderTasks();renderHistory();
  if(page==='library')renderLibrary();
  window.studioAI?.updateMirrorScope();
}
function dialog(title,html) {
  $('dialog-title').textContent=title;$('dialog-body').innerHTML=html;
  $('dialog').showModal();
}
function closeDialog() {
  $('dialog').querySelectorAll('video').forEach(video=>video.pause());
  $('dialog').close();
}
function candidates() {
  const needed=slots()[1].length;
  const desired=middleTag();
  const found=media.filter(clip=>clip.tag===desired&&clip.duration>=needed&&!used(clip.id));
  dialog('给中间这一段找素材', '<p>需要 '+needed+' 秒 '+(desired==='extract'?'咖啡流入杯中':'机器操作 / 氛围')+' 画面。结果基于当前项目素材的已有标注。</p>'+
    (found.length?found.map(clip=>'<div><h3>'+escapeText(clip.name)+'</h3><video controls preload="metadata" poster="'+(clip.poster||'')+'" src="'+clip.source+'"></video><p>可试用的片段 0–'+needed+' 秒 · 原视频 '+clip.duration.toFixed(1)+' 秒</p><button class="primary" data-fill="'+clip.id+'">确认插入这段</button></div>').join(''):
    '<div class="notice">当前项目没有找到符合内容标注和时长要求的片段。</div>'+(canReshootNow()?'<button data-action="task">加入补拍清单</button>':'<button data-action="alternative">看看现有素材能怎么讲</button>')));
}
function extend() {
  const clip=getClip('3573'),needed=slots()[2].length;
  dialog('先确认原视频后面的内容还能用', '<video id="extension" controls src="'+clip.source+'" poster="'+clip.poster+'"></video><p>目前使用 0–'+state.end+' 秒，建议改为 0–'+needed+' 秒。试听和查看动作是否完整后再确认。</p><button class="primary" data-action="confirm-extend">使用这 '+needed+' 秒</button>');
}
function fillMiddle(id, message) {
  const clip=getClip(id);
  if (!clip || clip.tag!==middleTag() || clip.duration<slots()[1].length) {
    toast('该片段与当前目标或时长不合适，请检查素材标注。');
    return;
  }
  closeDialog();
  change(message,()=>{
    state.filled=true;state.fillId=id;state.taskDone=state.task;
  });
  navigate('edit');loadSlot(1);
}
function renderLibrary() {
  const query=$('search').value.toLowerCase();
  $('library-grid').innerHTML=media.filter(clip=>(clip.name+(state.project?'':tags[clip.tag])).toLowerCase().includes(query)).map(clip=>
    '<article class="media-card">'+placeholder(clip)+'<div class="body"><h3>'+escapeText(clip.name)+'</h3><p>'+clip.duration.toFixed(1)+' 秒 · '+(clip.custom?'本地导入':'公开实拍素材')+' · '+(used(clip.id)?'已使用':'未使用')+'</p>'+
    (state.project?'':'<label>内容标注<select data-tag="'+clip.id+'">'+Object.entries(tags).map(([key,label])=>'<option value="'+key+'" '+(key===clip.tag?'selected':'')+'>'+label+'</option>').join('')+'</select></label>')+
    '<button data-preview="'+clip.id+'">播放原视频</button></div></article>').join('');
  if (!$('library-grid').children.length) $('library-grid').innerHTML='<div class="notice">'+(media.length?'没有找到相关素材，试试其他关键词。':'还没有视频。到拍摄清单导入素材，再把它关联到对应镜头。')+'</div>';
}
function shotInstruction() {
  return processGoal()?'让杯口和咖啡流出的地方同时入镜，保持机位稳定。':'从侧面拍手操作咖啡机，保留完整动作和现场声。';
}
function renderTasks() {
  if(state.aiPlan&&window.studioAI){window.studioAI.renderShotList();return;}
  const [prep,middle,milk]=slots();
  const checks=[prep,middle,milk].map((slot,index)=>{
    const expected=['prepare',middleTag(),'milk'][index];
    const has=media.some(clip=>clip.tag===expected&&clip.duration>=slot.length);
    return '<article class="task"><div><span class="status">'+(has?'已有可用素材':canReshootNow()?'待拍摄':'待调整表达')+'</span><h3>'+slot.title+'</h3></div><p>成片预计使用 '+slot.length+' 秒。'+(index===1?shotInstruction():'建议保留动作起止，方便后续裁切。')+'</p>'+
      (index===1?'<button data-action="find">查看可用素材</button>':'')+'</article>';
  }).join('');
  const sample=processGoal()?'3571':'3578';
  const task=state.task ?
    '<article class="task"><img src="https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/'+sample+'.jpg" alt="拍摄参考"><div><span class="status">'+(state.taskDone?'已加到草稿':'待补拍 · 剪辑草稿第 2 段')+'</span><h3>'+middleTitle()+'</h3><p>至少录 '+(middle.length+2)+' 秒。'+shotInstruction()+'</p></div><div class="task-actions"><button data-action="find" '+(state.taskDone?'disabled':'')+'>关联已拍视频</button><button data-action="task-sample" '+(state.taskDone?'disabled':'')+'>用示例片段试一试</button></div></article>' :
    '<div class="notice">如需重拍，可从剪辑草稿建议卡创建任务并带上时间线位置。</div>';
  $('tasks').innerHTML='<h3>剪辑草稿里的拍摄清单</h3>'+checks+'<h3>补拍任务</h3>'+task;
}
function renderHistory() {
  $('history-list').innerHTML=state.logs.length?state.logs.map(log=>'<div class="log"><time>'+new Date(log.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+'</time><div>'+escapeText(log.message)+'<small>已记在草稿里</small></div></div>').join(''):'<div class="notice">采用第一条建议后，修改记录会显示在这里。</div>';
}
function stop() {
  playing=false;
  $('video').onloadedmetadata=null;
  $('video').pause();
  $('play-all').textContent='▶ 播放草稿';
}
function loadSlot(index,autoplay=false) {
  currentSlot=index;
  const timeline=slots(compare),slot=timeline[index];
  window.studioAI?.updateMirrorScope();
  document.querySelectorAll('[data-slot]').forEach(button=>button.classList.toggle('focus',Number(button.dataset.slot)===index));
  $('caption').textContent=slot.caption;
  $('preview-title').textContent=(compare?'修改前 · ':'剪辑草稿 · ')+slot.title;
  const offset=timeline.slice(0,index).reduce((sum,item)=>sum+item.length,0);
  $('timecode').textContent=clock(offset)+' / '+clock(targetSeconds());
  const clip=getClip(slot.id);
  $('trim').innerHTML='<p>'+slot.length+' 秒计划时长 · '+(clip?'选用原视频 '+slot.start+'–'+slot.end+' 秒':'没有可用片段')+'</p>';
  $('gap-screen').hidden=!!clip;
  if (!clip) {
    stop();
    const video=$('video');video.removeAttribute('src');video.removeAttribute('poster');video.load();
    if(autoplay)toast('播放停在缺口处，填入素材后可继续。');
    return;
  }
  const video=$('video');
  video.poster=clip.poster||'';
  video.onloadedmetadata=()=>{
    video.currentTime=slot.start;
    if(autoplay&&playing) video.play().catch(error=>{
      if(error.name!=='AbortError'){stop();toast('点击播放器开始播放。');}
    });
  };
  video.src=clip.source;
}
function playAll() {
  if(playing){stop();return;}
  playing=true;$('play-all').textContent='Ⅱ 暂停草稿';
  loadSlot(0,true);
}
$('video').addEventListener('timeupdate',()=>{
  if(!playing)return;
  const timeline=slots(compare),slot=timeline[currentSlot];
  const elapsed=$('video').currentTime-slot.start;
  const offset=timeline.slice(0,currentSlot).reduce((sum,item)=>sum+item.length,0);
  $('timecode').textContent=clock(offset+elapsed)+' / '+clock(targetSeconds());
  const playable=Math.min(slot.end,$('video').duration)-slot.start;
  if(elapsed>=Math.min(playable,slot.length)-.08){
    if(playable<slot.length){stop();toast('用到的片段已经结束，这个段落还缺画面。');}
    else if(currentSlot<timeline.length-1)loadSlot(currentSlot+1,true);
    else stop();
  }
});
$('video').addEventListener('error',()=>{
  if(!$('video').getAttribute('src'))return;
  stop();toast('视频读取失败，请检查素材文件或重新导入。');
});
function analyze(fail=false) {
  clearTimeout(pending);$('analyze').disabled=true;
  $('mirror-check').open=true;
  $('assistant').innerHTML='<div class="good"><h3>正在核对这版剪辑草稿</h3><p>查看用了多少秒、关键步骤和未使用素材…</p></div>';
  pending=setTimeout(()=>{
    $('analyze').disabled=false;
    if(fail){$('assistant').innerHTML='<article class="issue"><h3>本次检查未完成</h3><p>素材、用到的片段和草稿都已保留。</p><button data-action="retry">重试检查</button></article>';return;}
    state.analyzed=true;persist();renderAssistant();
  },500);
}
function download(name,text,type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportPlan() {
  download('拍完好剪-剪辑方案.json',JSON.stringify({project:state.aiPlan?.title||'从咖啡粉到一杯拿铁',goal:state.aiPlan?.audience||state.goal,target:targetSeconds(),slots:slots(),plan:state.aiPlan,media:media.map(({source,poster,...clip})=>clip),tasks:state.project?state.field:{created:state.task,done:state.taskDone},history:state.logs},null,2));
  toast('剪辑方案已导出，包含用到的片段与拍摄任务。');
}
async function loadImports() {
  database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('shot-studio-media',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('clips',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  const saved=await new Promise((resolve,reject)=>{
    const request=database.transaction('clips').objectStore('clips').getAll();
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  for(const record of saved) {
    const meta=state.imports.find(clip=>clip.id===record.id);
    if(meta)media.push({...meta,source:URL.createObjectURL(record.blob),custom:true});
  }
  render();window.studioAI?.refresh();
  if(page==='shoot')window.fieldCheck?.render();
}
async function importVideos(files) {
  const returnPage=['ai','shoot'].includes(page)?page:'library';
  for(const file of files) {
    if(!file.type.startsWith('video/')){toast('请选择视频文件。');continue;}
    const url=URL.createObjectURL(file);
    try {
      const duration=await new Promise((resolve,reject)=>{
        const video=document.createElement('video'),timer=setTimeout(()=>reject(Error('读取超时')),12000);
        video.preload='metadata';
        video.onloadedmetadata=()=>{clearTimeout(timer);resolve(video.duration);};
        video.onerror=()=>{clearTimeout(timer);reject(Error('格式不可播放'));};video.src=url;
      });
      if(!Number.isFinite(duration)||duration<=0)throw Error('无法读取时长');
      if(!database)throw Error('浏览器素材保存尚未准备好');
      const meta={id:'local-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),name:file.name,tag:'unknown',duration};
      await new Promise((resolve,reject)=>{
        const transaction=database.transaction('clips','readwrite');
        transaction.objectStore('clips').put({id:meta.id,blob:file});
        transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);
      });
      media.push({...meta,source:url,custom:true});
      state.imports.push(meta);
      log('导入素材「'+file.name+'」');
      persist();render();
    } catch(error) {URL.revokeObjectURL(url);toast(file.name+' 导入失败：'+error.message);}
  }
  navigate(returnPage);
  if(returnPage==='ai')window.studioAI?.onImport();
  $('import').value='';
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.page)navigate(button.dataset.page);
  if(button.dataset.clip)showClip(button.dataset.clip);
  if(button.dataset.preview){navigate('edit');showClip(button.dataset.preview);}
  if(button.dataset.slot!==undefined){stop();loadSlot(Number(button.dataset.slot));}
  if(button.dataset.locate!==undefined){stop();loadSlot(Number(button.dataset.locate));}
  if(button.dataset.fill){
    const id=button.dataset.fill, clip=getClip(id);
    if(clip)fillMiddle(id,'把「'+clip.name+'」插入第 2 段');
  }
  const act=button.dataset.action;
  if(act==='find')candidates();
  if(act==='extend')extend();
  if(act==='confirm-extend'){closeDialog();change('倒入牛奶用到的片段延长至 '+slots()[2].length+' 秒',()=>state.end=slots()[2].length);loadSlot(2);}
  if(act==='task'&&canReshootNow()){
    if($('dialog').open)closeDialog();
    if(!state.task)change('创建补拍任务 · '+middleTitle(),()=>state.task=true);
    navigate('shoot');
  }
  if(act==='task-sample'){
    const clip=getClip(processGoal()?'3571':'3578');
    dialog('确认加入补拍片段','<video controls src="'+clip.source+'" poster="'+clip.poster+'"></video><p>用这段内置视频演示把补拍片段加进草稿，取前 '+slots()[1].length+' 秒。</p><button data-fill="'+clip.id+'" class="primary">确认加到第 2 段</button>');
  }
  if(act==='alternative')dialog('改剪成 12 秒的咖啡氛围短片', '<p>用压紧咖啡粉 3 秒、机器操作 3 秒和倒入牛奶 6 秒讲一段咖啡制作片刻。这个版本不要求展示咖啡流入杯中的步骤。</p><video controls src="https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3578.mp4" poster="https://haicha-yijing-demo.frillypitch1.chatgpt.site/assets/3578.jpg"></video><button data-action="accept-short" class="primary">采用这个表达</button>');
  if(act==='accept-short'){
    const clip=getClip('3578');
    if(clip.tag!=='machine'||clip.duration<3){toast('这段备用素材已修改标注，请先到素材库复核。');return;}
    closeDialog();
    change('采用 12 秒的咖啡氛围方案',()=>{
      Object.assign(state,{goal:'mood',target:12,filled:true,fillId:clip.id,end:6,task:false,taskDone:false});
    });
    loadSlot(0);
  }
  if(act==='retry')analyze();
  if(act==='play')playAll();
  if(button.id==='apply-trim'){
    const end=Number($('trim-end').value),clip=getClip('3573');
    if(!Number.isFinite(end)||end<.1||end>clip.duration){toast('结束时间应在 0.1–'+clip.duration.toFixed(1)+' 秒之间。');return;}
    change('手动调整倒入牛奶结束时间至 '+end+' 秒',()=>state.end=end);showClip('3573');
  }
});
document.addEventListener('change',event=>{
  if(!event.target.dataset.tag)return;
  const clip=getClip(event.target.dataset.tag),tag=event.target.value;
  if(!clip||!tags[tag])return;
  clip.tag=tag;
  if(clip.custom){const entry=state.imports.find(item=>item.id===clip.id);if(entry)entry.tag=tag;}
  else state.stockTags={...state.stockTags,[clip.id]:tag};
  log('更新素材标注「'+clip.name+'」为 '+tags[tag]);persist();render();
});
['goal','target'].forEach(id=>$(id).addEventListener('change',()=>{
  clearTimeout(pending);$('analyze').disabled=false;
  const value=id==='target'?Number($(id).value):$(id).value;
  change(id==='goal'?'更换创作目标':'调整目标片长',()=>{
    state[id]=value;state.analyzed=false;
    if(id==='goal'){state.task=false;state.taskDone=false;}
  });
  if(currentSlot!==null)loadSlot(currentSlot);
}));
$('analyze').onclick=()=>{if(state.project){navigate('shoot');return;}if(state.aiPlan){navigate('ai');return;}navigate('edit');analyze();};
$('retry').onclick=()=>{navigate('edit');analyze(true);};
$('play-all').onclick=playAll;
$('compare').onclick=()=>{stop();compare=!compare;renderTimeline();loadSlot(0);};
$('undo').onclick=()=>{
  if(!state.undo.length)return;stop();
  const previous=state.undo.pop();Object.assign(state,previous);
  log('撤销上一步剪辑修改');
  compare=false;persist();render();
  if(state.project){loadSlot(0);if(page==='shoot')window.fieldCheck?.render();}else showClip('3572');
};
$('reset').onclick=()=>dialog('重新体验这个示例', '<p>重置当前剪辑、任务和修改记录。已导入的视频会继续保存在素材库。</p><button id="confirm-reset" class="primary">重置剪辑与任务</button>');
document.addEventListener('click',event=>{
  if(event.target.id!=='confirm-reset')return;
  clearTimeout(pending);$('analyze').disabled=false;stop();compare=false;
  const imports=state.imports;state=initial();state.imports=imports;
  const defaults={'3571':'extract','3572':'prepare','3573':'milk','3578':'machine'};
  stock.forEach(clip=>clip.tag=defaults[clip.id]);
  closeDialog();persist();navigate('edit');render();showClip('3572');
});
$('guide').onclick=()=>dialog('体验路径','<h3>从你自己的目标开始</h3><p>在「我的项目」写下想拍的内容，编辑生成的必拍动作，创建工作区。</p><h3>拍完准备离开</h3><p>打开「离场前检查」，导入视频并关联动作。播放视频，确认动作后可以放进草稿。</p><h3>已经在剪辑</h3><p>选中一个镜头，问小镜留多长、怎么接下一镜。网页按目标、时间线和你的确认给反馈，自动识别自有视频可在本机版体验。</p>');
$('credits').onclick=()=>dialog('素材来源与能力说明','<p>咖啡示例使用公开实拍素材和自编脚本。我的素材来自用户主动导入。</p><p><a href="https://mixkit.co/free-stock-video/tamping-coffee-for-a-coffee-maker-3572/" target="_blank" rel="noopener">Mixkit 3572 · 压紧咖啡粉</a><br><a href="https://mixkit.co/free-stock-video/coffee-is-served-in-a-cup-3573/" target="_blank" rel="noopener">Mixkit 3573 · 倒入牛奶</a><br><a href="https://mixkit.co/free-stock-video/coffee-maker-serving-an-espresso-3571/" target="_blank" rel="noopener">Mixkit 3571 · 咖啡流进杯子</a><br><a href="https://mixkit.co/free-stock-video/coffee-maker-making-coffee-3578/" target="_blank" rel="noopener">Mixkit 3578 · 机器操作</a></p><p>连接本地模型后，小镜根据当前草稿推荐操作，AI 方案可分析导入视频的抽帧。画面在本机处理，剪辑草稿与素材保存在浏览器。直接打开 HTML 时可使用示例体验。导出内容是剪辑方案与拍摄清单。</p>');
$('close-dialog').onclick=closeDialog;
$('dialog').addEventListener('cancel',()=>{$('dialog').querySelectorAll('video').forEach(video=>video.pause());});
$('export').onclick=exportPlan;
$('export-tasks').onclick=()=>{
  if(window.fieldCheck?.export())return;
  if(state.aiPlan){window.studioAI.exportShotList();return;}
  const lines=slots().map(slot=>slot.title+' · 预计使用 '+slot.length+' 秒');
  if(state.task)lines.push('', '补拍任务 · '+middleTitle(),shotInstruction(),state.taskDone?'已加入草稿':'待拍');
  download('拍完好剪-拍摄清单.txt',lines.join('\n'),'text/plain;charset=utf-8');
};
$('import').onchange=event=>importVideos([...event.target.files]);
$('search').oninput=renderLibrary;
for(const clip of stock)if(state.stockTags?.[clip.id])clip.tag=state.stockTags[clip.id];
persist();
render();if(state.project)loadSlot(0);else showClip(selected);
loadImports().catch(()=>toast('浏览器未允许保存本地视频，内置示例仍可使用。'));
for(const clip of state.project?[]:stock){
  const probe=document.createElement('video');probe.preload='metadata';probe.src=clip.source;
  probe.onloadedmetadata=()=>{clip.duration=probe.duration;renderBin();};
}
