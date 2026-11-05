import { useRef } from 'react';
import { Icon } from './Icon';
import { clamp, type Project } from './core';
interface Props { project:Project;time:number;playing:boolean;speed:number;loop:boolean;onTime:(t:number)=>void;onPlay:()=>void;onSpeed:(s:number)=>void;onLoop:()=>void;onKey:()=>void;onDelete:()=>void;onExtend:()=>void }
export function Timeline({project,time,playing,speed,loop,onTime,onPlay,onSpeed,onLoop,onKey,onDelete,onExtend}:Props){
  const rail=useRef<HTMLDivElement>(null),scrub=useRef(false);
  const seek=(x:number)=>{const rect=rail.current!.getBoundingClientRect();onTime(clamp((x-rect.left)/rect.width*project.duration,0,project.duration));};
  const tick=Math.max(1,Math.ceil(project.duration/12));const ticks=Array.from({length:Math.floor(project.duration/tick)+1},(_,i)=>i*tick);
  const atKey=project.frames.some(f=>Math.abs(f.t-time)<.025);
  return <section className="timeline panel" aria-label="時間軸">
    <div className="timeline-toolbar"><div className="transport"><button className="icon-button" aria-label="最初に戻る" onClick={()=>onTime(0)}><Icon name="back" size={17}/></button><button className={`play-button ${playing?'is-playing':''}`} aria-label={playing?'一時停止':'再生'} data-testid="play-button" onClick={onPlay}><Icon name={playing?'pause':'play'} size={20}/></button><button className="icon-button" aria-label="最後に進む" onClick={()=>onTime(project.duration)}><Icon name="forward" size={17}/></button><span className="timecode" data-testid="timecode">{time.toFixed(2)}<small> / {project.duration.toFixed(2)} s</small></span><select aria-label="再生速度" value={speed} onChange={e=>onSpeed(Number(e.target.value))}>{[.25,.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select><button className={`icon-button ${loop?'active':''}`} aria-label="ループ再生" aria-pressed={loop} onClick={onLoop}><Icon name="loop" size={17}/></button></div>
    <div className="timeline-actions"><span className="key-count">{project.frames.length} KEYFRAMES</span><button className="button secondary small" onClick={onExtend}>+5秒</button><button className="button secondary small" onClick={onKey} data-testid="add-keyframe"><Icon name="plus" size={15}/>キーを追加 <kbd>K</kbd></button><button className="icon-button" aria-label="現在のキーフレームを削除" disabled={!atKey||time===0||time===project.duration} onClick={onDelete}><Icon name="trash" size={16}/></button></div></div>
    <div className="tracks"><div className="track-labels"><span>SEQUENCE</span><span><i className="track-dot positions"/>選手の動き</span><span><i className="track-dot gaze"/>体・首の向き</span><span><i className="track-dot ball"/>ボール</span></div>
      <div ref={rail} className="track-rail" data-testid="timeline-rail" onPointerDown={e=>{scrub.current=true;e.currentTarget.setPointerCapture(e.pointerId);seek(e.clientX);}} onPointerMove={e=>{if(scrub.current)seek(e.clientX);}} onPointerUp={()=>{scrub.current=false;}} onPointerCancel={()=>{scrub.current=false;}}>
        <div className="ruler">{ticks.map(t=><span key={t} style={{left:`${t/project.duration*100}%`}}>{t.toString().padStart(2,'0')}</span>)}</div>
        {[0,1,2].map(row=><div className={`track-row row-${row}`} key={row}><div className="track-fill"/>{project.frames.map(f=><button key={f.t} className={`keyframe ${Math.abs(f.t-time)<.025?'selected':''}`} style={{left:`${f.t/project.duration*100}%`}} aria-label={`${row===0?'位置':row===1?'視線':'ボール'} キーフレーム ${f.t.toFixed(1)}秒`} onPointerDown={e=>{e.stopPropagation();onTime(f.t);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTime(f.t);}}}/>)}</div>)}
        <div className="playhead" style={{left:`${time/project.duration*100}%`}}><span/></div>
      </div></div>
    <div className="timeline-foot"><span><span className="auto-key-dot"/> AUTO KEY <em>編集した時刻に自動でキーを作成</em></span><span>SPACE 再生 / 停止 <i>·</i> ← → 0.1秒移動 <i>·</i> ⌘ / Ctrl Z 元に戻す</span></div>
  </section>;
}
