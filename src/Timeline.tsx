import { useT } from "./i18n";
import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { clamp, type Project } from './core';
interface Props { project:Project;time:number;playing:boolean;speed:number;loop:boolean;onTime:(t:number)=>void;onPlay:()=>void;onSpeed:(s:number)=>void;onLoop:()=>void;onKey:()=>void;onDelete:()=>void;onExtend:()=>void }
export function Timeline({project,time,playing,speed,loop,onTime,onPlay,onSpeed,onLoop,onKey,onDelete,onExtend}:Props){
  const t = useT();
  const [compact,setCompact]=useState(false);
  const rail=useRef<HTMLDivElement>(null),scrub=useRef(false);
  const seek=(x:number)=>{const rect=rail.current!.getBoundingClientRect();onTime(clamp((x-rect.left)/rect.width*project.duration,0,project.duration));};
  const tick=Math.max(1,Math.ceil(project.duration/12));const ticks=Array.from({length:Math.floor(project.duration/tick)+1},(_,i)=>i*tick);
  const atKey=project.frames.some(f=>Math.abs(f.t-time)<.025);
  return <section className={`timeline panel ${compact?'timeline-compact':''}`} aria-label={t("時間軸")}>
    <div className="timeline-toolbar"><div className="transport"><button className="icon-button" aria-label={t("最初に戻る")} onClick={()=>onTime(0)}><Icon name="back" size={17}/></button><button className={`play-button ${playing?'is-playing':''}`} aria-label={playing?t("一時停止"):t("再生")} data-testid="play-button" onClick={onPlay}><Icon name={playing?'pause':'play'} size={20}/></button><button className="icon-button" aria-label={t("最後に進む")} onClick={()=>onTime(project.duration)}><Icon name="forward" size={17}/></button><span className="timecode" data-testid="timecode">{time.toFixed(2)}<small> / {project.duration.toFixed(2)} s</small></span><select aria-label={t("再生速度")} value={speed} onChange={e=>onSpeed(Number(e.target.value))}>{[.25,.5,1,2].map(v=><option key={v} value={v}>{v}×</option>)}</select><button className={`icon-button ${loop?'active':''}`} aria-label={t("ループ再生")} aria-pressed={loop} onClick={onLoop}><Icon name="loop" size={17}/></button></div>
    <div className="timeline-actions"><button className="icon-button" aria-label={compact?t("時間軸を展開"):t("時間軸を縮小")} aria-expanded={!compact} onClick={()=>setCompact(v=>!v)}><Icon name="chevron" size={15} style={{transform:`rotate(${compact?-90:90}deg)`}}/></button><span className="key-count">{project.frames.length} KEYFRAMES</span><button className="button secondary small" onClick={onExtend}>{t("+5秒")}</button><button className="button secondary small" onClick={onKey} data-testid="add-keyframe"><Icon name="plus" size={15}/>{t("キーを追加")} <kbd>K</kbd></button><button className="icon-button" aria-label={t("現在のキーフレームを削除")} disabled={!atKey||time===0||time===project.duration} onClick={onDelete}><Icon name="trash" size={16}/></button></div></div>
    <div className="tracks"><div className="track-labels"><span>SEQUENCE</span><span><i className="track-dot positions"/>{t("選手の動き")}</span><span><i className="track-dot gaze"/>{t("体・首の向き")}</span><span><i className="track-dot ball"/>{t("ボール")}</span></div>
      <div ref={rail} className="track-rail" data-testid="timeline-rail" onPointerDown={e=>{scrub.current=true;e.currentTarget.setPointerCapture(e.pointerId);seek(e.clientX);}} onPointerMove={e=>{if(scrub.current)seek(e.clientX);}} onPointerUp={()=>{scrub.current=false;}} onPointerCancel={()=>{scrub.current=false;}}>
        <div className="ruler">{ticks.map(t=><span key={t} style={{left:`${t/project.duration*100}%`}}>{t.toString().padStart(2,'0')}</span>)}</div>
        {[0,1,2].map(row=><div className={`track-row row-${row}`} key={row}><div className="track-fill"/>{project.frames.map(f=><button key={f.t} className={`keyframe ${Math.abs(f.t-time)<.025?'selected':''}`} style={{left:`${f.t/project.duration*100}%`}} aria-label={t("{0} キーフレーム {1}秒", row===0?t("位置"):row===1?t("視線"):t("ボール"), f.t.toFixed(1))} onPointerDown={e=>{e.stopPropagation();onTime(f.t);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onTime(f.t);}}}/>)}</div>)}
        <div className="playhead" style={{left:`${time/project.duration*100}%`}}><span/></div>
      </div></div>
    <div className="timeline-foot"><span><span className="auto-key-dot"/> AUTO KEY <em>{t("編集した時刻に自動でキーを作成")}</em></span><span>{t("SPACE 再生 / 停止")} <i>·</i> {t("← → 0.1秒移動")} <i>·</i> {t("⌘ / Ctrl Z 元に戻す")}</span></div>
  </section>;
}
