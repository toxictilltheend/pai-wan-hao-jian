'use strict';
(() => {
  const form=$('project-form'), result=$('project-result'), error=$('project-error');
  let proposed=null;

  function listProjects() {
    let projects=[];
    try {
      projects=Object.keys(localStorage).filter(key=>key.startsWith(PROJECT_PREFIX)).flatMap(key=>{
        try {
          const project=JSON.parse(localStorage.getItem(key))?.data?.project;
          return project?.id&&project.title?[project]:[];
        } catch {return [];}
      }).sort((a,b)=>b.updatedAt-a.updatedAt);
    } catch { /* The sample still works without saved projects. */ }
    $('saved-projects').innerHTML=projects.length?projects.map(project=>'<a class="saved-project" href="?project='+encodeURIComponent(project.id)+'"><strong>'+escapeText(project.title)+'</strong><span>'+project.target+' 秒 · 打开工作区</span></a>').join(''):
      '<p class="muted">新建的工作区会保存在这个浏览器。</p>';
  }
  function readIdea() {
    const stage=$('project-stage').value;
    return window.projectPlanner.plan($('project-idea').value,$('project-seconds').value,stage==='auto'?null:stage==='yes');
  }
  form.addEventListener('input',()=>{
    proposed=null;result.hidden=true;error.textContent='';
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try {
      proposed=readIdea();error.textContent='';
      const shooting=proposed.canReshoot?'优先补关键动作，再拍好开头和结尾。':'先找已有片段。缺的动作保留为空位，需要时改写表达。';
      const draft=window.projectPlanner.draft(proposed);
      result.innerHTML='<h2>必拍清单 <span class="pill">'+proposed.target+' 秒</span></h2><p class="muted">'+escapeText(proposed.note)+'</p>'+
        draft.shots.map((shot,index)=>'<label class="project-shot"><span>镜头 '+(index+1)+'</span><input data-project-shot maxlength="55" value="'+escapeText(shot.title)+'"><small>建议用 '+shot.seconds+' 秒 · '+escapeText(shot.intent)+'</small></label>').join('')+
        '<p class="project-next">'+shooting+'</p><button type="button" class="primary" id="create-project">创建我的工作区</button>';
      result.hidden=false;$('create-project').scrollIntoView({block:'nearest'});
    } catch(err){error.textContent=err.message;}
  });
  result.addEventListener('click',event=>{
    if(event.target.id!=='create-project'||!proposed)return;
    const titles=[...result.querySelectorAll('[data-project-shot]')].map(input=>input.value.trim());
    if(titles.some(title=>title.length<2)||new Set(titles).size!==titles.length){error.textContent='请把每个镜头写成不同的动作，至少两个字。';return;}
    const id=crypto.randomUUID();
    const project={...proposed,id,updatedAt:Date.now(),shots:proposed.shots.map((shot,index)=>({...shot,title:titles[index]}))};
    const data={...initial(),project,canReshoot:project.canReshoot,aiPlan:window.projectPlanner.draft(project)};
    try {
      localStorage.setItem(PROJECT_PREFIX+id,JSON.stringify({version:2,data}));
      location.assign('?project='+encodeURIComponent(id));
    } catch {error.textContent='浏览器无法保存项目，请检查浏览器存储设置后重试。';}
  });
  window.projectHub={refresh:listProjects};
  if(state.project)navigate('shoot');
  else if(!new URLSearchParams(location.search).has('example'))navigate('projects');
})();
