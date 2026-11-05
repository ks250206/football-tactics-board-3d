import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Frame, Project, ViewSettings } from './core';
import { clamp } from './core';
import { TacticsEngine } from './engine';

export interface StageHandle { capture:()=>string|undefined; canvas:()=>HTMLCanvasElement|undefined; fullscreen:()=>void }
interface Props { project:Project; frame:Frame; selected:string; settings:ViewSettings; onLook:(head:number,pitch:number)=>void; onPause:()=>void; onAspect:(aspect:number)=>void }
export const Stage=forwardRef<StageHandle,Props>(function Stage(props,ref){
  const host=useRef<HTMLDivElement>(null),engine=useRef<TacticsEngine|null>(null),current=useRef(props);
  current.current=props;
  const rosterKey=JSON.stringify(props.project.roster);
  const [error,setError]=useState(''),[fps,setFps]=useState(0);
  const drag=useRef<{x:number;y:number;head:number;pitch:number}|null>(null);
  useImperativeHandle(ref,()=>({capture:()=>engine.current?.capture(),canvas:()=>engine.current?.canvas,fullscreen:()=>{void host.current?.parentElement?.requestFullscreen().catch(()=>{});}}),[]);
  useEffect(()=>{
    if(!host.current)return;
    setError('');
    try {
      const instance=new TacticsEngine(host.current,props.project,props.settings,props.settings.quality);
      instance.onStats=setFps;instance.onAspect=aspect=>current.current.onAspect(aspect);engine.current=instance;
      current.current.onAspect(host.current.clientWidth/Math.max(1,host.current.clientHeight));
      const lost=(e:Event)=>{e.preventDefault();setError('GPUコンテキストを失いました。軽量モードに切り替えるか、ページを再読み込みしてください。');};
      instance.canvas.addEventListener('webglcontextlost',lost);
      return()=>{instance.canvas.removeEventListener('webglcontextlost',lost);instance.dispose();engine.current=null;};
    }catch(e){setError(e instanceof Error?e.message:'3D描画を初期化できませんでした。');}
  },[props.settings.quality,rosterKey]);
  useEffect(()=>{engine.current?.update(props.project,props.frame,props.selected,props.settings);},[props.project,props.frame,props.selected,props.settings]);
  const player=props.project.roster.find(p=>p.id===props.selected)!;
  return <div className="stage-shell" data-testid="stage">
    <div ref={host} className="stage-canvas" onPointerDown={e=>{
      if(props.settings.camera!=='eye'||e.button!==0)return;props.onPause();const pose=props.frame.players[props.selected];drag.current={x:e.clientX,y:e.clientY,head:pose.head,pitch:pose.pitch};e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e=>{const start=drag.current;if(!start)return;props.onLook(clamp(start.head+(e.clientX-start.x)*.18,-110,110),clamp(start.pitch-(e.clientY-start.y)*.13,-35,35));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} />
    {error?<div className="render-error" role="alert"><strong>3D表示を開始できません</strong><p>{error}</p><p>WebGL 2対応ブラウザで、ハードウェアアクセラレーションを有効にしてください。2D編集とJSON保存は引き続き利用できます。</p></div>:<>
      <div className="stage-top"><span className="live-tag"><i/> LIVE VIEW</span><span>{props.settings.lighting==='golden'?'GOLDEN HOUR':props.settings.lighting==='day'?'DAYLIGHT':'FLOODLIGHTS'}</span></div>
      {props.settings.camera==='eye'&&<div className="crosshair"><i/><i/></div>}
      <div className="stage-bottom"><div><span className="eyebrow">{props.settings.camera==='eye'?"PLAYER'S EYE":props.settings.camera==='follow'?'FOLLOW CAMERA':'FREE CAMERA'}</span><strong>{String(player.number).padStart(2,'0')} <span>{player.role} · {player.team==='home'?'HOME':'AWAY'}</span></strong></div><div className="lens-data"><span>{props.settings.eye.toFixed(2)} m</span><span>H-FOV {props.settings.fov}°</span><span>{fps>0?`${fps} FPS`:'READY'}</span></div></div>
      <div className="look-hint">{props.settings.camera==='eye'?'ドラッグで首振り · 体の向きは変わりません':props.settings.camera==='orbit'?'ドラッグで回転 · ホイールでズーム · 右ドラッグで移動':'選択した選手を後方から追従'}</div>
    </>}
  </div>;
});
