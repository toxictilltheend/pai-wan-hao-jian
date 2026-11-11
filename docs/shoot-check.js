'use strict';
(() => {
  const panel=$('field-check');
  const coffeeShots={
    prepare:{id:'prepare',title:'压紧咖啡粉',clipId:'3572',hint:'对准粉碗和手，把压粉前后的变化拍完整。'},
    extract:{id:'extract',title:'咖啡流进杯中',clipId:'3571',hint:'让出液口和杯口同时入镜，至少录 7 秒，保留开始和结束。'},
    machine:{id:'machine',title:'操作咖啡机',clipId:'3578',hint:'从侧面拍手操作机器，保留动作的开始和结束。'},
    milk:{id:'milk',title:'倒入牛奶',clipId:'3573',hint:'从壶嘴入画开始拍，让观众看见倒入动作和杯面变化。'}
  };
  const draftShots=()=>state.aiPlan?.source==='mine'?state.aiPlan.shots:[];
  const defaultTitles=()=>draftShots().length?draftShots().map(shot=>shot.title):['开场交代场景','拍清关键动作','拍到最后的结果'];

  function checkState() {
    if(!state.field)state.field={source:state.aiPlan?.source==='mine'?'mine':'sample',titles:defaultTitles(),assignments:{},added:{},ran:!!state.project};
    return state.field;
  }
  function requiredShots(field) {
    if(field.source==='sample')return [coffeeShots.prepare,coffeeShots[middleTag()],coffeeShots.milk];
    const titles=state.project?draftShots().map(shot=>shot.title):field.titles;
    return titles.map((title,index)=>({id:'mine-'+index,title,
      hint:draftShots().find(shot=>shot.title===title)?.intent||'把这个动作从开始到结束拍完整，并留出一点裁切空间。'}));
  }
  function evidence(field,shot) {
    const marked=field.assignments[shot.id];
    const planned=draftShots().find(item=>item.title===shot.title);
    const preset=field.source==='sample'&&(shot.id==='prepare'||shot.id==='milk'||field.added[shot.id]);
    const clipId=marked?.clipId??(preset?shot.clipId:planned?.clipId||planned?.candidate?.clipId);
    const clip=getClip(clipId);
    if(!clip||marked?.decision==='missing')return {status:'missing',clip:null};
    const confirmed=marked?.decision==='found'||(!marked&&(shot.id==='prepare'||planned?.evidenceStatus==='found'));
    return {status:confirmed?'found':'pending',clip};
  }
  function render() {
    const field=checkState(), shots=requiredShots(field), canShoot=canReshootNow();
    const rows=shots.map(shot=>({...shot,...evidence(field,shot)}));
    const missing=rows.filter(shot=>shot.status==='missing');
    const pending=rows.filter(shot=>shot.status==='pending');
    const found=rows.length-missing.length-pending.length;
    const available=media.filter(clip=>clip.custom);
    const titleEditor=field.source==='mine'&&!state.project?'<label class="field-input">必拍动作，每行写一项（2–4 项）'+
      '<textarea id="field-titles" rows="3" maxlength="220">'+escapeText(field.titles.join('\n'))+'</textarea></label>':'';
    $('tasks').hidden=field.ran&&!state.task;
    panel.innerHTML='<div class="field-heading"><div><h3>离场前检查</h3><p>'+ (state.project?'检查按已关联和确认的项目视频统计。':'先核对必拍动作，再决定还要补哪一镜。')+'</p></div>'+
      (state.project?'<button data-page="edit">打开剪辑草稿</button>':'<label>检查哪组素材 <select id="field-source"><option value="sample" '+(field.source==='sample'?'selected':'')+'>咖啡拍摄示例</option><option value="mine" '+(field.source==='mine'?'selected':'')+'>我的素材</option></select></label>')+'</div>'+
      '<div class="field-controls"><label for="field-reshoot">还能补拍吗？</label><select id="field-reshoot"><option value="yes" '+(canShoot?'selected':'')+'>还在现场，可以补拍</option><option value="no" '+(!canShoot?'selected':'')+'>已经离场，无法补拍</option></select></div>'+
      (field.source==='mine'?'<div class="field-custom">'+titleEditor+'<div class="actions"><button class="primary" id="field-import">导入视频</button><button id="field-ai">'+(state.project?'调整创作目标':'用本机 AI 找候选')+'</button></div><p class="muted">关联视频后，播放确认动作。自动识别需启动本机 AI。</p></div>':'')+
      '<button id="field-run" class="primary">'+(field.ran?'重新检查':'检查这次拍到的画面')+'</button><p id="field-error" class="muted" role="status"></p>'+
      (field.ran?'<div class="field-summary" role="status"><div><span>已找到</span><strong>'+found+'</strong></div><div><span>待确认</span><strong>'+pending.length+'</strong></div><div><span>缺少</span><strong>'+missing.length+'</strong></div></div>'+
        (missing.length?'<div class="field-next"><strong>'+(canShoot?'先补拍 · ':'先处理 · ')+escapeText(missing[0].title)+'</strong><p>'+
          escapeText(canShoot?missing[0].hint:'先查未用素材。如果找不到这一步的画面，可以缩短或换个讲法。')+'</p>'+
          (!canShoot?'<button data-page="edit">回草稿问小镜</button>':'')+'</div>':pending.length?'<div class="field-next">播放待确认的片段，确认关键动作能看清。</div>':'<div class="field-next">必拍动作已确认，可以回到草稿检查顺序和节奏。</div>'):'')+
      '<div class="field-rows">'+rows.map(shot=>{
        const label=shot.status==='found'?'已找到':shot.status==='pending'?'待确认':'缺少';
        const draft=draftShots().find(item=>item.title===shot.title);
        const usage=state.project&&draft?.clipId&&draft.clipId===shot.clip?.id?' · 草稿已用 '+draft.start+'–'+draft.end+' 秒':'';
        return '<article class="field-row" data-field-status="'+(field.ran?shot.status:'unchecked')+'"><div><span class="field-label">'+(field.ran?label:'必拍')+'</span><h4>'+escapeText(shot.title)+'</h4>'+
          (field.ran?'<p>'+escapeText(shot.clip?shot.clip.name+usage:canShoot?shot.hint:'本轮没找到能支撑这个动作的画面。')+'</p>':'')+'</div>'+
          (field.ran?'<div class="actions">'+(field.source==='mine'?'<label class="field-select">关联视频<select data-field-clip="'+shot.id+'" aria-label="为'+escapeText(shot.title)+'关联视频"><option value="">选择本地视频</option>'+
            available.map(clip=>'<option value="'+clip.id+'" '+(clip.id===shot.clip?.id?'selected':'')+'>'+escapeText(clip.name)+'</option>').join('')+'</select></label>':'')+
            (shot.clip?'<button data-field-preview="'+shot.id+'">'+(shot.status==='found'?'查看原视频':'播放并核对')+'</button>':'')+
            (field.source==='sample'&&shot.status==='missing'&&canShoot?'<button data-field-add="'+shot.id+'">用示例片段补拍</button>':'')+
            (field.source==='sample'&&shot.status==='found'&&shot.id===middleTag()&&!state.filled&&!state.aiPlan?'<button class="primary" data-field-draft="'+shot.id+'">加到剪辑草稿</button>':'')+'</div>':'')+'</article>';
      }).join('')+'</div>';
  }
  function readTitles() {
    const input=$('field-titles');
    if(!input)return true;
    const titles=[...new Set(input.value.split(/\r?\n/).map(line=>line.trim().slice(0,55)).filter(Boolean))];
    if(titles.length<2||titles.length>4){$('field-error').textContent='请写 2–4 个不同的必拍动作。';input.focus();return false;}
    const field=checkState();
    if(JSON.stringify(titles)!==JSON.stringify(field.titles))field.assignments={};
    field.titles=titles;
    return true;
  }
  function preview(shot,clip) {
    const draft=state.project?draftShots().find(item=>item.title===shot.title):null;
    const end=Math.min(clip.duration,draft?.seconds??clip.duration);
    const range=draft?'<div class="project-fields"><label>开始时间（秒）<input id="field-from" type="number" min="0" step="any" value="'+(draft.clipId===clip.id?draft.start:0)+'"></label><label>结束时间（秒）<input id="field-to" type="number" min="0" step="any" value="'+(draft.clipId===clip.id?draft.end:end)+'"></label></div><p id="field-range-error" role="status"></p>':'';
    dialog('核对 · '+shot.title,'<video id="field-video" controls playsinline preload="metadata" src="'+clip.source+'"></video>'+
      '<p>'+escapeText(clip.name)+'。播放确认「'+escapeText(shot.title)+'」能看清。</p>'+range+'<div class="actions">'+
      '<button class="primary" id="field-confirm" disabled>'+(draft?'确认并加入草稿':'确认拍到了')+'</button><button id="field-reject">这段拍得不清楚</button></div>');
    const record=decision=>{
      if(!draft){checkState().assignments[shot.id]={clipId:clip.id,decision};persist();closeDialog();render();return;}
      const from=Number($('field-from').value),to=Number($('field-to').value);
      if(decision==='found'&&(!$('field-from').value||!$('field-to').value||from<0||to<=from||to>clip.duration||to-from>draft.seconds+.001)){
        $('field-range-error').textContent='请选择原视频内最多 '+draft.seconds+' 秒的有效区间。';return;
      }
      closeDialog();
      change((decision==='found'?'确认并加入草稿 · ':'标为缺少 · ')+shot.title,()=>{
        checkState().assignments[shot.id]={clipId:clip.id,decision};
        if(decision==='found'){
          Object.assign(draft,{clipId:clip.id,start:from,end:to,evidence:{second:from,description:'用户播放后确认了这段画面。'},evidenceStatus:'found',reason:''});
          delete draft.candidate;
          if(!state.aiPlan.clipIds.includes(clip.id))state.aiPlan.clipIds.push(clip.id);
        } else if(draft.clipId===clip.id||draft.candidate?.clipId===clip.id){
          Object.assign(draft,{clipId:null,start:0,end:0,evidence:null,evidenceStatus:'missing',reason:'用户复看后未采用'});
          delete draft.candidate;
        }
      });
      loadSlot(draftShots().indexOf(draft));render();
    };
    $('field-video').addEventListener('play',()=>{$('field-confirm').disabled=false;},{once:true});
    if(draft)$('field-from').addEventListener('change',()=>{
      const player=$('field-video'),start=Number($('field-from').value);
      if(player.readyState>=1&&start>=0&&start<player.duration)player.currentTime=start;
    });
    $('field-confirm').onclick=()=>record('found');
    $('field-reject').onclick=()=>record('missing');
  }
  panel.addEventListener('change',event=>{
    const field=checkState(), target=event.target;
    if(target.id==='field-source'){
      field.source=target.value;
      field.ran=false;
    } else if(target.id==='field-reshoot'){
      if(!readTitles()){target.value=canReshootNow()?'yes':'no';return;}
      state.canReshoot=target.value==='yes';
      if(state.aiPlan)state.aiPlan.canReshoot=state.canReshoot;
    } else if(target.dataset.fieldClip){
      field.assignments[target.dataset.fieldClip]={clipId:target.value,decision:target.value?'pending':'missing'};
    } else return;
    persist();render();
  });
  panel.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const field=checkState();
    if(button.id==='field-run'){
      if(!readTitles())return;
      field.ran=true;persist();render();return;
    }
    if(button.id==='field-import'||button.id==='field-ai'){
      if(!readTitles())return;
      persist();
      if(button.id==='field-import')$('import').click();
      else {navigate('ai');if(!state.project)window.studioAI?.prepareField(field.titles);}
      return;
    }
    const {fieldPreview,fieldAdd,fieldDraft}=button.dataset;
    const shot=requiredShots(field).find(item=>item.id===(fieldPreview||fieldAdd||fieldDraft));
    if(!shot)return;
    if(fieldAdd&&canReshootNow()){
      field.added[shot.id]=true;delete field.assignments[shot.id];persist();render();
      preview(shot,getClip(shot.clipId));
    }
    if(fieldPreview){
      const plannedIndex=draftShots().findIndex(item=>item.title===shot.title);
      if(field.source==='mine'&&!field.assignments[shot.id]&&draftShots()[plannedIndex]?.candidate)window.studioAI.previewDraft(plannedIndex);
      else {const {clip}=evidence(field,shot);if(clip)preview(shot,clip);}
    }
    if(fieldDraft&&evidence(field,shot).status==='found')fillMiddle(shot.clipId,'把已确认的补拍画面加到第 2 段');
  });
  window.fieldCheck={
    render,
    export() {
      const field=state.field;
      if(!field?.ran)return false;
      const lines=['离场前检查',canReshootNow()?'仍可补拍':'无法补拍，优先找未使用的素材或调整表达',''];
      for(const shot of requiredShots(field)){
        const {status,clip}=evidence(field,shot);
        const label={found:'已找到',pending:'待确认',missing:'缺少'}[status];
        lines.push(label+' · '+shot.title,clip?.name||(canReshootNow()?shot.hint:'看看现有素材还能讲清什么。'),'');
      }
      download('拍完好剪-离场检查.txt',lines.join('\n'),'text/plain;charset=utf-8');
      return true;
    }
  };
})();
