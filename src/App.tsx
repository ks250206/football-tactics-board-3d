import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyse, clamp, clone, makePass, parseProject, RAD, removeKeyframe, sample, upsert, wrap, type Pose, type Project, type ViewSettings } from './core';
import { createScenario as createDemo } from './scenarios';
import { createCanvasRecorder } from './recording';
import { Board } from './Board';
import { Timeline } from './Timeline';
import { Icon } from './Icon';
import type { StageHandle } from './Stage';
const Stage=lazy(()=>import('./Stage').then(module=>({default:module.Stage})));
const STORAGE='touchline.project.v1';
function initialProject(){try{const saved=localStorage.getItem(STORAGE);return saved?parseProject(saved):createDemo();}catch{return createDemo();}}
function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function Slider({label,value,min,max,step=1,unit='°',onChange,testId}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(value:number)=>void;testId?:string}){
  return <label className="slider-control"><span>{label}<strong>{step<1?value.toFixed(step<.1?2:1):Math.round(value)}<small>{unit}</small></strong></span><input type="range" min={min} max={max} step={step} value={value} aria-label={label} data-testid={testId} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
function Toggle({label,checked,onChange,icon}:{label:string;checked:boolean;onChange:()=>void;icon?:string}){return <button className={`toggle-chip ${checked?'checked':''}`} onClick={onChange} aria-pressed={checked}>{icon&&<Icon name={icon} size={14}/>}<span>{label}</span><i/></button>;}
function ToolButton({label,icon,onClick,disabled=false,active=false}:{label:string;icon:string;onClick:()=>void;disabled?:boolean;active?:boolean}){return <button className={`icon-button ${active?'active':''}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon name={icon}/></button>;}

export default function App(){
  const [project,setProject]=useState<Project>(initialProject),projectRef=useRef(project);projectRef.current=project;
  const [time,setTime]=useState(0),timeRef=useRef(0);timeRef.current=time;
  const [playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[loop,setLoop]=useState(true);
  const [selected,setSelected]=useState('home-6'),[ballActive,setBallActive]=useState(false),[passMode,setPassMode]=useState(false);
  const [settings,setSettings]=useState<ViewSettings>(()=>({camera:'eye',lighting:'golden',quality:window.innerWidth<700?'low':'balanced',fov:90,eye:1.72,labels:false,paths:true,vision:true,bob:false}));
  const [aspect,setAspect]=useState(1.6),[saved,setSaved]=useState('保存済み'),[toast,setToast]=useState(''),[help,setHelp]=useState(false),[recording,setRecording]=useState(false);
  const [revision,setRevision]=useState(0);
  const history=useRef<{past:Project[];future:Project[];tag:string;at:number}>({past:[],future:[],tag:'',at:0});
  const stage=useRef<StageHandle>(null),fileInput=useRef<HTMLInputElement>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
  const selectedSafe=project.roster.some(p=>p.id===selected)?selected:project.roster[0].id;
  const frame=useMemo(()=>sample(project,time),[project,time]),pose=frame.players[selectedSafe];
  const player=project.roster.find(p=>p.id===selectedSafe)!;
  const sights=useMemo(()=>analyse(project,frame,selectedSafe,settings.fov,settings.eye,aspect),[project,frame,selectedSafe,settings.fov,settings.eye,aspect]);
  const visible=sights.filter(s=>s.inView&&!s.occluded),clear=visible.filter(s=>s.clearPass);
  const commit=useCallback((next:Project,tag='')=>{
    if(next===projectRef.current)return;
    const h=history.current,now=performance.now();
    if(!tag||h.tag!==tag||now-h.at>650){h.past.push(projectRef.current);if(h.past.length>60)h.past.shift();}
    h.tag=tag;h.at=now;h.future=[];
    // Authoring rounds key times to 0.01 s. Show that exact authored pose,
    // not an adjacent interpolated pose (which can wrap +180 to -180).
    if(next.frames!==projectRef.current.frames){
      const key=next.frames.find(f=>Math.abs(f.t-timeRef.current)<.025);
      if(key){timeRef.current=key.t;setTime(key.t);}
    }
    projectRef.current=next;setProject(next);setRevision(n=>n+1);
  },[]);
  const seek=useCallback((t:number)=>{setPlaying(false);const value=clamp(t,0,projectRef.current.duration);timeRef.current=value;setTime(value);},[]);
  const undo=useCallback(()=>{const h=history.current,last=h.past.pop();if(!last)return;h.future.push(projectRef.current);h.tag='';projectRef.current=last;setProject(last);setTime(t=>Math.min(t,last.duration));setPlaying(false);setRevision(n=>n+1);},[]);
  const redo=useCallback(()=>{const h=history.current,next=h.future.pop();if(!next)return;h.past.push(projectRef.current);h.tag='';projectRef.current=next;setProject(next);setTime(t=>Math.min(t,next.duration));setPlaying(false);setRevision(n=>n+1);},[]);
  const editPose=(patch:Partial<Pose>,tag='pose')=>{setPlaying(false);commit(upsert(projectRef.current,timeRef.current,f=>{f.players[selectedSafe]={...f.players[selectedSafe],...patch};}),`${tag}-${selectedSafe}`);};
  const setView=<K extends keyof ViewSettings,>(key:K,value:ViewSettings[K])=>setSettings(s=>({...s,[key]:value}));
  const addKey=useCallback(()=>{setPlaying(false);commit(upsert(projectRef.current,timeRef.current,()=>{}));setToast('現在の配置と視線をキーフレームに保存しました。');},[commit]);
  const play=useCallback(()=>{setPlaying(p=>{if(!p&&timeRef.current>=projectRef.current.duration){timeRef.current=0;setTime(0);}return !p;});},[]);
  useEffect(()=>{
    if(!playing)return;let raf=0;const startedAt=performance.now(),startedTime=timeRef.current;
    const tick=(now:number)=>{
      let next=startedTime+(now-startedAt)/1000*speed;
      const repeats=loop&&!recorder.current;
      if(next>=projectRef.current.duration){if(repeats)next%=projectRef.current.duration;else{next=projectRef.current.duration;setPlaying(false);}}
      timeRef.current=next;setTime(next);
      if(next<projectRef.current.duration||repeats)raf=requestAnimationFrame(tick);
    };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
  },[playing,speed,loop,recording]);
  useEffect(()=>{setSaved('保存中…');const timeout=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(project));setSaved('ローカル保存済み');}catch{setSaved('保存できません');setToast('ブラウザ保存に失敗しました。JSONを書き出して保存してください。');}},450);return()=>clearTimeout(timeout);},[project]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(timeout);},[toast]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){setPassMode(false);setHelp(false);return;}
      const target=e.target as HTMLElement;if(target.matches('input,select,textarea,button')||target.isContentEditable)return;
      if(e.code==='Space'){e.preventDefault();play();}
      if(e.key.toLowerCase()==='k'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();addKey();}
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(timeRef.current+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1));}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[play,addKey,seek,undo,redo]);
  useEffect(()=>{const hide=()=>{if(document.hidden){setPlaying(false);if(recorder.current?.state==='recording')recorder.current.stop();}};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);};},[]);
  useEffect(()=>{if(recording&&time>=project.duration&&recorder.current?.state==='recording')recorder.current.stop();},[time,recording,project.duration]);
  useEffect(()=>()=>{if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());},[]);

  const choose=(id:string)=>{
    if(passMode&&id!=='ball'){
      if(id===selectedSafe){setToast('別の選手を受け手に選んでください。');return;}
      if(timeRef.current>project.duration-.1){setToast('終了直前です。時間軸を戻すか、5秒追加してください。');return;}
      commit(makePass(projectRef.current,timeRef.current,selectedSafe,id,1.2,frame.ball.arc));setPassMode(false);setToast('1.2秒のパスを追加しました。再生して軌道を確認できます。');return;
    }
    setBallActive(id==='ball');if(id!=='ball')setSelected(id);
  };
  const move=(id:string,x:number,z:number)=>{setPlaying(false);commit(upsert(projectRef.current,timeRef.current,f=>{if(id==='ball'){f.ball={...f.ball,x,z,owner:null};}else{f.players[id]={...f.players[id],x,z};}}),`drag-${id}`);};
  const preset=(kind:string)=>{if(!kind)return;if(recording){setToast('録画を停止してからプリセットを変更してください。');return;}setPlaying(false);setPassMode(false);commit(createDemo(kind));seek(0);setSelected(kind==='overlap'?'home-7':'home-6');setBallActive(false);setToast('プリセットを読み込みました。元に戻す操作で直前の編集へ戻れます。');};
  const exportJSON=()=>saveBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'touchline-sequence.json');
  const capture=()=>{const data=stage.current?.capture();if(!data){setToast('3D表示の初期化が完了していません。');return;}const link=document.createElement('a');link.href=data;link.download=`touchline-${time.toFixed(2)}s.png`;link.click();};
  const toggleRecord=()=>{
    if(recorder.current?.state==='recording'){recorder.current.stop();setPlaying(false);return;}
    const canvas=stage.current?.canvas();if(!canvas||typeof canvas.captureStream!=='function'||typeof MediaRecorder==='undefined'){setToast('このブラウザでは動画録画を利用できません。PNG保存をご利用ください。');return;}
    const mime=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){setToast('対応する動画形式がありません。Chrome / Edgeでお試しください。');return;}
    try{
      const session=createCanvasRecorder(canvas,mime);stream.current=session.stream;const rec=session.recorder;const chunks:BlobPart[]=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onstop=()=>{if(chunks.length)saveBlob(new Blob(chunks,{type:mime}),`touchline-player-view.${mime.includes('mp4')?'mp4':'webm'}`);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;recorder.current=null;setRecording(false);setToast(chunks.length?'3D映像を保存しました。音声・操作パネルは含まれません。':'録画フレームを取得できませんでした。軽量モードで再試行してください。');};
      rec.onerror=()=>{setToast('録画に失敗しました。PNG保存をご利用ください。');if(rec.state!=='inactive')rec.stop();};
      recorder.current=rec;rec.start(250);timeRef.current=0;setTime(0);setSpeed(1);setLoop(false);setRecording(true);setPlaying(true);
    }catch(e){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setToast(e instanceof Error?e.message:'録画を開始できませんでした。');}
  };
  const lookAtBall=()=>{const heading=Math.atan2(frame.ball.z-pose.z,frame.ball.x-pose.x)/RAD;const d=Math.hypot(frame.ball.x-pose.x,frame.ball.z-pose.z);editPose({head:clamp(wrap(heading-pose.body),-110,110),pitch:clamp(Math.atan2(frame.ball.y-settings.eye,d)/RAD,-35,35)},'ball-look');};
  const extend=()=>{if(project.duration>=300)return;const next=clone(project);next.duration=Math.min(300,next.duration+5);const last=clone(next.frames.at(-1)!);last.t=next.duration;next.frames.push(last);commit(next);};
  const ballEdit=(patch:Partial<typeof frame.ball>)=>{setPlaying(false);commit(upsert(projectRef.current,timeRef.current,f=>{f.ball={...f.ball,...patch};}),'ball-controls');};
  const heading=wrap(pose.body+pose.head);
  void revision;

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="./" aria-label="TOUCHLINE ホーム"><span className="brand-mark"><Icon name="pitch" size={24}/></span><span><strong>TOUCHLINE<span className="brand-dot">.</span></strong><small>PLAYER PERSPECTIVE LAB</small></span></a><div className="header-middle"><span className="version-pill">TACTICS STUDIO</span><span className="local-badge"><i/>LOCAL FIRST</span></div><div className="header-actions"><ToolButton label="元に戻す" icon="undo" onClick={undo} disabled={!history.current.past.length||recording}/><ToolButton label="やり直す" icon="redo" onClick={redo} disabled={!history.current.future.length||recording}/><span className="toolbar-divider"/><button className="button secondary" disabled={recording} onClick={()=>fileInput.current?.click()}><Icon name="upload" size={16}/><span>読み込み</span></button><button className="button primary" onClick={exportJSON}><Icon name="download" size={16}/><span>JSONを書き出す</span></button><ToolButton label="使い方" icon="help" onClick={()=>setHelp(true)}/></div></header>
    <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" data-testid="import-file" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>2_000_000)throw new Error('ファイルは2 MB以下にしてください。');const imported=parseProject(await file.text());setPlaying(false);setPassMode(false);commit(imported);seek(0);setSelected(imported.roster[0].id);setToast('シーケンスを読み込みました。');}catch(error){setToast(error instanceof Error?error.message:'読み込みに失敗しました。');}}}/>
    <main><div className="project-bar"><div><span className="eyebrow">WORKSPACE <span>/</span> 01</span><input className="project-title" aria-label="シーケンス名" value={project.name} maxLength={120} onChange={e=>commit({...projectRef.current,name:e.target.value},'name')}/></div><div className="project-tools"><span className="saved-indicator"><Icon name="check" size={13}/>{saved}</span><select aria-label="プリセットを読み込む" value="" onChange={e=>preset(e.target.value)}><option value="" disabled>プリセットを読み込む</option><option value="build">首振りとビルドアップ</option><option value="through">スルーパス</option><option value="overlap">オーバーラップ</option></select></div></div>
      <div className="workspace">
        <section className="board-panel panel"><div className="panel-header"><h2><Icon name="pitch" size={17}/>Tactical board <span>2D</span></h2><div className="team-legend"><span><i/>HOME</span><span><i/>AWAY</span></div></div>
          <Board project={project} frame={frame} selected={selectedSafe} ballActive={ballActive} settings={settings} sights={sights} passMode={passMode} onPick={choose} onMove={move} onPause={()=>setPlaying(false)}/>
          <div className="board-tools"><span>選手 / ボールをドラッグして配置</span><div><Toggle label="視野" checked={settings.vision} onChange={()=>setView('vision',!settings.vision)} icon="eye"/><Toggle label="軌跡" checked={settings.paths} onChange={()=>setView('paths',!settings.paths)} icon="route"/></div></div>
          <div className="inspector"><div className="selection-heading"><div className={`number-tile ${player.team==='away'?'away':''}`}>{ballActive?<Icon name="ball" size={24}/>:String(player.number).padStart(2,'0')}</div><div className="selection-title"><span className="eyebrow">{ballActive?'BALL CONTROLS':'SELECTED PLAYER'}</span><select aria-label="視点の選手" value={selectedSafe} onChange={e=>{setSelected(e.target.value);setBallActive(false);}}>{project.roster.map(p=><option key={p.id} value={p.id}>{p.team==='home'?'HOME':'AWAY'} · {String(p.number).padStart(2,'0')} / {p.role}</option>)}</select></div><div className="position-readout"><span>X <b>{pose.x.toFixed(1)}</b></span><span>Z <b>{pose.z.toFixed(1)}</b></span></div></div>
          {ballActive?<div className="ball-controls"><label className="field-label">ボール保持者<select aria-label="ボール保持者" value={frame.ball.owner??''} onChange={e=>ballEdit({owner:e.target.value||null})}><option value="">自由な位置 / パス中</option>{project.roster.map(p=><option key={p.id} value={p.id}>{p.team.toUpperCase()} {p.number} · {p.role}</option>)}</select></label><div className="slider-grid"><Slider label="ボールの高さ" value={frame.ball.y} min={.11} max={8} step={.01} unit="m" onChange={y=>ballEdit({y,owner:null})}/><Slider label="次区間の浮き高さ" value={frame.ball.arc} min={0} max={8} step={.1} unit="m" onChange={arc=>ballEdit({arc})}/></div></div>:<><div className="slider-grid"><Slider label="体の向き" value={wrap(pose.body)} min={-180} max={180} onChange={body=>editPose({body},'body')} testId="body-slider"/><Slider label="首の向き" value={pose.head} min={-110} max={110} onChange={head=>editPose({head},'head')} testId="head-slider"/></div><div className="gaze-controls"><Slider label="視線の上下" value={pose.pitch} min={-35} max={35} onChange={pitch=>editPose({pitch},'pitch')}/><button className="button subtle small" onClick={lookAtBall}><Icon name="target" size={15}/>ボールを見る</button><ToolButton label="首と上下視線を正面へ戻す" icon="undo" onClick={()=>editPose({head:0,pitch:0})}/></div></>}
          <div className="inspector-foot"><span>視線方向 <b>{Math.round(heading)}°</b><i>体 + 首</i></span><button className={`button small ${passMode?'primary':'secondary'}`} onClick={()=>{setPlaying(false);setPassMode(v=>!v);}} data-testid="pass-button"><Icon name={passMode?'close':'arrow'} size={15}/>{passMode?'キャンセル':'パスを作る'}</button></div></div>
        </section>
        <section className="view-panel panel"><div className="panel-header"><h2><Icon name="eye" size={17}/>Player perspective <span>3D</span></h2><div className="view-actions"><div className="segmented" aria-label="カメラモード">{([['eye','一人称'],['follow','追従'],['orbit','自由']] as const).map(([mode,label])=><button key={mode} className={settings.camera===mode?'selected':''} aria-pressed={settings.camera===mode} onClick={()=>setView('camera',mode)}>{label}</button>)}</div><ToolButton label="3D映像をPNG保存" icon="camera" onClick={capture}/><ToolButton label={recording?'録画を停止':'最初から3D映像を録画'} icon="record" onClick={toggleRecord} active={recording}/><ToolButton label="3D画面を全画面表示" icon="expand" onClick={()=>stage.current?.fullscreen()}/></div></div>
          <Suspense fallback={<div className="stage-loading"><span className="loading-spinner"/>ピッチを準備しています</div>}><Stage ref={stage} project={project} frame={frame} selected={selectedSafe} settings={settings} onLook={(head,pitch)=>editPose({head,pitch},'look-drag')} onPause={()=>setPlaying(false)} onAspect={setAspect}/></Suspense>
          {recording&&<div className="recording-banner"><i/>RECORDING · {time.toFixed(1)} / {project.duration}s <button onClick={toggleRecord}>停止して保存</button></div>}
          <div className="view-controls"><label><Icon name="sun" size={15}/><select aria-label="ライティング" value={settings.lighting} onChange={e=>setView('lighting',e.target.value as ViewSettings['lighting'])}><option value="golden">夕方 / Golden hour</option><option value="day">日中 / Daylight</option><option value="night">ナイトゲーム</option></select></label><label><Icon name="settings" size={15}/><select aria-label="描画品質" value={settings.quality} onChange={e=>{if(recording){setToast('録画を停止してから品質を変更してください。');return;}setView('quality',e.target.value as ViewSettings['quality']);}}><option value="low">軽量</option><option value="balanced">バランス</option><option value="cinematic">シネマティック</option></select></label><Toggle label="背番号" checked={settings.labels} onChange={()=>setView('labels',!settings.labels)}/></div>
          <div className="camera-controls"><Slider label="水平視野角" value={settings.fov} min={55} max={120} onChange={v=>setView('fov',v)}/><Slider label="目線の高さ" value={settings.eye} min={1.4} max={2.05} step={.01} unit="m" onChange={v=>setView('eye',v)}/><Toggle label="歩行の揺れ" checked={settings.bob} onChange={()=>setView('bob',!settings.bob)}/></div>
        </section>
      </div>
      <section className="analysis-strip" aria-label="選手視点の幾何解析"><div className="analysis-title"><Icon name="eye" size={18}/><span>VISION CHECK<small>選択選手の設定視線を解析</small></span></div><div className="analysis-stat"><strong>{visible.length}<small> / 10</small></strong><span>視界内の味方</span></div><div className="analysis-stat"><strong>{clear.length}</strong><span>直線パスコースが空いている味方</span></div><div className="sight-players">{sights.map(s=>{const p=project.roster.find(p=>p.id===s.id)!;return <button key={s.id} className={!s.inView?'not-visible':s.occluded?'blocked':s.clearPass?'clear':'risky'} title={`${p.number}: ${!s.inView?'視野外':s.occluded?'他の選手で遮蔽':s.clearPass?'視野内 / 直線コースが空き':'視野内 / コースに相手'} · ${s.distance.toFixed(1)}m`} aria-label={`${p.number}番の視点に切り替え`} onClick={()=>{setSelected(s.id);setBallActive(false);}}>{p.number}</button>;})}</div><span className="analysis-note">現在位置による近似判定<br/>到達時間・注意・周辺視野は未推定</span></section>
      <Timeline project={project} time={time} playing={playing} speed={speed} loop={loop} onTime={seek} onPlay={play} onSpeed={setSpeed} onLoop={()=>setLoop(v=>!v)} onKey={addKey} onDelete={()=>commit(removeKeyframe(project,time))} onExtend={extend}/>
      <footer className="app-footer"><span>DESIGNED TO SEE THE GAME DIFFERENTLY.</span><span>METRES · SECONDS · DEGREES <i>/</i> NO SERVER. YOUR TACTICS STAY HERE.</span></footer>
    </main>
    {toast&&<div className="toast" role="status"><Icon name="check" size={17}/>{toast}<button aria-label="通知を閉じる" onClick={()=>setToast('')}><Icon name="close" size={15}/></button></div>}
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="使い方" onClick={e=>e.stopPropagation()}><div className="panel-header"><h2>ピッチを、選手の目で。</h2><ToolButton label="使い方を閉じる" icon="close" onClick={()=>setHelp(false)}/></div><div className="help-content"><p>左のボードで選手を選ぶと、右の3Dがその選手の目線に切り替わります。配置と視線は、下の時間軸と常に同期します。</p><HelpStep n="01" title="動きをつくる">時間軸をクリックして時刻を選び、選手やボールをドラッグ。編集時刻にキーフレームが自動で追加されます。位置はキー間を直線で補間します。</HelpStep><HelpStep n="02" title="体と首を、別々に動かす">「体の向き」と「首の向き」は独立しています。一人称画面のドラッグでも首振りを編集できます。首は±110°まで。水平視野角は画面の縦横比に合わせて3Dに反映されます。</HelpStep><HelpStep n="03" title="パスを通す">出し手を選択し「パスを作る」→受け手をクリック。1.2秒後までのパスを作成します。ボールを選択すると保持者・高さ・次区間の浮き高さを変更できます。</HelpStep><HelpStep n="04" title="保存する / 見返す">編集はこのブラウザに自動保存されます。端末間で移すときはJSONを書き出してください。カメラボタンでPNG、録画ボタンで3Dのみの動画を保存できます。録画は実時間で、描画性能に依存します。</HelpStep><div className="help-note">これは戦術の幾何学的なプレビューです。実際の視覚・選手の注意・身体運動・ボールの力学を完全に再現するものではありません。選手はオリジナルのプロシージャルモデルです。</div><button className="button primary" autoFocus onClick={()=>setHelp(false)}>ピッチに戻る <Icon name="arrow" size={16}/></button></div></section></div>}
  </div>;
}
function HelpStep({n,title,children}:{n:string;title:string;children:ReactNode}){return <div className="help-step"><b>{n}</b><div><h3>{title}</h3><p>{children}</p></div></div>;}
