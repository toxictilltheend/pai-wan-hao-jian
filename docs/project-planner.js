'use strict';
(() => {
  const ordered = /(?:第一步|第二步|第三步|第四步|首先|接着|然后|之后|最后|再(?=拍|录|展|给|把|让|切|加|演|对|换|放|倒|做|看|讲|进|来|补)|先(?=拍|录|展|给|把|让|切|加|演|对|换|放|倒|做|看|讲|进|来|补))/g;

  function actionText(value) {
    return value.split(/[。！？!?；;\n]|[，,]\s*(?:我|视频|时长|片长|已经|已离场|不能|无法|画面风格)/,1)[0]
      .replace(/^[：:，,、\s]+|[：:，,、\s]+$/g,'').slice(0,55);
  }
  function durationOf(text) {
    const seconds=text.match(/(\d{1,4})\s*秒/);
    const minutes=text.match(/(\d+(?:\.\d+)?)\s*分钟/);
    return seconds?Number(seconds[1]):minutes?Math.round(Number(minutes[1])*60):30;
  }
  function actionHint(action,index) {
    if(/对比|前后/.test(action))return '用同一个角度和距离拍前后两次，让变化容易看出来。';
    if(/全景|环境|场地|外观/.test(action))return '先用全景交代位置，再停几秒让观众看清现场。';
    if(/合影|集体照|合照/.test(action))return '先确认所有人入镜，再多留几秒拍到反应。';
    if(/采访|口播|提问|发言/.test(action))return '靠近说话的人，录完整一句，并在现场回听是否清楚。';
    if(/把|放|收|装|换|操作|按/.test(action))return '把手和物品放进同一个画面，保留动作开始到完成的过程。';
    return ['让观众看清人物、物品或动作从哪里开始。','镜头靠近关键动作，保留动作的起止。',
      '补一个能看清结果或变化的画面。','多留一点停顿，给结尾和裁切留空间。'][index];
  }
  function suggestedShots(topic) {
    if(/教程|步骤|演示|怎么|如何/.test(topic))return [
      ['展示「'+topic+'」开始前的状态','先让观众看清操作对象和起点。'],
      ['拍清「'+topic+'」的关键动作','靠近拍手和物品接触的位置，保留动作起止。'],
      ['展示「'+topic+'」做完的结果','尽量用同一角度拍前后变化，便于对照。']];
    if(/活动|比赛|演出|聚会|现场|毕业|旅行|市集/.test(topic))return [
      ['交代「'+topic+'」的地点和人物','先用全景交代在哪里、有哪些人在场。'],
      ['记录「'+topic+'」最值得看的瞬间','提前想清楚是哪一个动作或互动，等它发生时连续拍一段。'],
      ['拍到「'+topic+'」结束时的结果或反应','留一段参与者的反应或结果画面，给视频一个清楚的结尾。']];
    if(/口播|采访|测评|开箱|种草|推荐/.test(topic))return [
      ['说清「'+topic+'」要回答的问题','拍下能让观众马上明白主题的一句话。'],
      ['展示能支撑「'+topic+'」的具体细节','拍实物、使用过程或对比。尽量给出一处观众能自己判断的画面。'],
      ['给出「'+topic+'」的结论','录完整结论。能同时给到结果画面时，留几秒供剪辑使用。']];
    return [
      ['交代「'+topic+'」是谁、在哪里','先让观众看懂你在拍什么。'],
      ['拍清「'+topic+'」最想让观众看到的画面','把这一条改成具体动作，靠近拍清它的开始和结束。'],
      ['给「'+topic+'」留一个结尾','拍到最终状态、人物反应，或用一句话交代结果。']];
  }
  function plan(idea,targetInput='',canReshoot=null) {
    idea=String(idea).trim();
    if(idea.length<4||idea.length>420)throw Error('请用 4–420 个字写清你想拍的内容。');
    const lead=idea.split(/[，,。！？!?；;\n]/,1)[0];
    const topic=lead.replace(/^(?:我)?(?:想要|想|准备|打算|要)?(?:做|拍|剪|记录|制作)(?:一条|一个|一段|一支|一部)?\s*/,'')
      .replace(/\d+(?:\.\d+)?\s*(?:秒钟?|分钟)(?:的)?/g,'').replace(/^(?:关于|有关)\s*/,'').trim().slice(0,38);
    if(!topic||/^(?:个|条|一个|一条|的|短视频|视频|片子|短片|vlog|的短视频|的短片)$/i.test(topic))throw Error('请补一个具体主题，例如「宿舍桌面收纳」或「校园市集记录」。');
    const markers=[...idea.matchAll(ordered)];
    let actions=markers.map((marker,index)=>actionText(idea.slice(marker.index+marker[0].length,markers[index+1]?.index)));
    if(actions.filter(Boolean).length<2){
      const list=idea.match(/(?:必拍|需要拍到|想让观众看到|拍到这几项)\s*[：:]?\s*([^。！？!?；;\n]+)/);
      if(list)actions=list[1].split(/[、，,]|以及/).map(actionText);
    }
    const allActions=[...new Set(actions.filter(action=>action.length>=2))];
    const explicit=allActions.slice(0,4);
    const fallback=suggestedShots(topic);
    const rows=explicit.length>=2?explicit.map((action,index)=>[action,actionHint(action,index)]):
      explicit.length===1?[fallback[0],[explicit[0],fallback[1][1]],fallback[2]]:fallback;
    const target=targetInput===''?durationOf(idea):Number(targetInput);
    if(!Number.isInteger(target)||target<Math.max(6,rows.length*2)||target>90)throw Error('请填写 '+Math.max(6,rows.length*2)+'–90 秒的目标片长。');
    const note=allActions.length>4?'描述里有 '+allActions.length+' 个动作。先保留前 4 个，你可以改成最重要的。':
      explicit.length>=2?'按你的描述排出了 '+explicit.length+' 个必拍动作。可以直接改写每一项。':
      '先根据主题列出一版拍法。把笼统的镜头改成观众需要看见的具体动作。';
    const reshoot=canReshoot??!/不能补拍|无法补拍|没法补拍|已.{0,3}离场|已.{0,3}离店/.test(idea);
    return {title:topic,idea,target,canReshoot:reshoot,note,shots:rows.map(([title,intent])=>({title,intent}))};
  }
  function draft(project) {
    const base=Math.floor(project.target/project.shots.length), extra=project.target%project.shots.length;
    return {title:project.title,audience:project.idea,brief:project.idea,canReshoot:project.canReshoot,target:project.target,
      clipIds:[],mode:'workspace',source:'mine',shots:project.shots.map((shot,index)=>({
        title:shot.title,intent:shot.intent,seconds:base+(index<extra?1:0),clipId:null,start:0,end:0,evidence:null,
        evidenceStatus:'missing',reason:'还没关联视频',next:shot.intent
      }))};
  }
  window.projectPlanner={plan,draft};
})();
