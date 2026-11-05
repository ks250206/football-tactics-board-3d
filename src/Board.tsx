import { useRef } from 'react';
import { clamp, RAD, type Frame, type Project, type Sight, type ViewSettings } from './core';
interface Props { project:Project;frame:Frame;selected:string;ballActive:boolean;settings:ViewSettings;sights:Sight[];passMode:boolean;onPick:(id:string)=>void;onMove:(id:string,x:number,z:number)=>void;onPause:()=>void }
export function Board({project,frame,selected,ballActive,settings,sights,passMode,onPick,onMove,onPause}:Props){
  const svg=useRef<SVGSVGElement>(null),drag=useRef<{id:string;dx:number;dz:number}|null>(null);
  const p=frame.players[selected],yaw=(p.body+p.head)*RAD;
  const coords=(x:number,y:number)=>{const point=svg.current!.createSVGPoint();point.x=x;point.y=y;return point.matrixTransform(svg.current!.getScreenCTM()!.inverse());};
  const start=(event:React.PointerEvent<SVGGElement>,id:string,x:number,z:number)=>{
    if(event.button!==0)return;event.stopPropagation();onPause();onPick(id);if(passMode)return;
    const point=coords(event.clientX,event.clientY);drag.current={id,dx:x-point.x,dz:z-point.y};event.currentTarget.setPointerCapture(event.pointerId);
  };
  const coneLeft=yaw-settings.fov*RAD/2,coneRight=yaw+settings.fov*RAD/2;
  return <div className={`board-container ${passMode?'pass-targeting':''}`}><svg ref={svg} viewBox="-58 -40 116 80" role="img" aria-label="2D戦術ボード。選手とボールをドラッグして移動" data-testid="tactics-board" onPointerMove={event=>{const active=drag.current;if(!active)return;const point=coords(event.clientX,event.clientY);onMove(active.id,clamp(point.x+active.dx,-52.5,52.5),clamp(point.y+active.dz,-34,34));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    <defs><pattern id="grass-stripes" width="15" height="80" patternUnits="userSpaceOnUse"><rect width="7.5" height="80" fill="#234734"/><rect x="7.5" width="7.5" height="80" fill="#294e39"/></pattern><clipPath id="field-clip"><rect x="-52.5" y="-34" width="105" height="68"/></clipPath><radialGradient id="vision-cone"><stop stopColor="#d0f697" stopOpacity=".22"/><stop offset="1" stopColor="#d0f697" stopOpacity=".015"/></radialGradient><marker id="lane-arrow" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto"><path d="m0 0 4 2.5L0 5" fill="none" stroke="#d8edb1" strokeWidth=".8"/></marker></defs>
    <rect x="-53.2" y="-34.7" width="106.4" height="69.4" rx=".8" fill="#477157"/>
    <rect x="-52.5" y="-34" width="105" height="68" fill="url(#grass-stripes)"/>
    <g fill="none" stroke="#c4d7bf" strokeOpacity=".48" strokeWidth=".25"><rect x="-52.5" y="-34" width="105" height="68"/><path d="M0-34V34"/><circle r="9.15"/><circle r=".25" fill="#c4d7bf"/>
      {[-1,1].map(sign=><g key={sign} transform={`scale(${sign} 1)`}><path d="M52.5-20.16H36V20.16H52.5M52.5-9.16H47V9.16H52.5"/><path d="M36-7.3a9.15 9.15 0 0 0 0 14.6"/><circle cx="41.5" r=".28" fill="#c4d7bf"/><path d="M52.5-3.66H55V3.66H52.5" strokeOpacity=".8"/></g>)}
    </g>
    <g clipPath="url(#field-clip)">
      {settings.vision&&<><path d={`M${p.x},${p.z} L${p.x+Math.cos(coneLeft)*48},${p.z+Math.sin(coneLeft)*48} A48,48 0 0,1 ${p.x+Math.cos(coneRight)*48},${p.z+Math.sin(coneRight)*48}Z`} fill="url(#vision-cone)"/><path d={`M${p.x+Math.cos(coneLeft)*48},${p.z+Math.sin(coneLeft)*48}L${p.x},${p.z}L${p.x+Math.cos(coneRight)*48},${p.z+Math.sin(coneRight)*48}`} fill="none" stroke="#dbf7a3" strokeOpacity=".25" strokeWidth=".25"/>
        {sights.filter(s=>s.inView&&!s.occluded).map(s=>{const q=frame.players[s.id];return <path key={s.id} d={`M${p.x},${p.z}L${q.x},${q.z}`} stroke={s.clearPass?'#c2e78e':'#ee9374'} strokeWidth=".28" strokeDasharray={s.clearPass?'1 1':'0.5 1'} opacity=".5" markerEnd={s.clearPass?'url(#lane-arrow)':undefined}/>;})}</>}
      {settings.paths&&<><polyline points={project.frames.map(f=>`${f.players[selected].x},${f.players[selected].z}`).join(' ')} fill="none" stroke="#d3eab1" strokeWidth=".4" strokeDasharray="1 1" opacity=".65"/>{project.frames.map(f=><circle key={f.t} cx={f.players[selected].x} cy={f.players[selected].z} r=".5" fill="#d7eab2" opacity=".65"/>)}</>}
    </g>
    {project.roster.map(player=>{const pose=frame.players[player.id],active=player.id===selected&&!ballActive,home=player.team==='home';return <g key={player.id} transform={`translate(${pose.x} ${pose.z})`} className="player-token" data-testid={`player-${player.id}`} role="button" tabIndex={0} aria-label={`${home?'HOME':'AWAY'} ${player.number} ${player.role}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onPick(player.id);}}} onPointerDown={e=>start(e,player.id,pose.x,pose.z)}>
      <circle r="3.8" fill="transparent"/>{active&&<circle r="3.1" fill="none" stroke="#d2ef9b" strokeWidth=".35"/>}
      <g transform={`rotate(${pose.body})`}><path d="m1.1-1.4 2.5 1.4-2.5 1.4" fill={home?'#e0edc3':'#f4a48b'} opacity=".8"/></g>
      <circle r="1.95" fill={home?'#e4edcd':'#db7056'} stroke={active?'#f1ffd9':home?'#152b20':'#421e16'} strokeWidth=".38"/>
      <text textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize="1.9" fontWeight="700" fill={home?'#183423':'#fff5ea'} style={{pointerEvents:'none'}}>{player.number}</text>
      {active&&<path d={`M${Math.cos(yaw)*2.2},${Math.sin(yaw)*2.2}L${Math.cos(yaw)*5.8},${Math.sin(yaw)*5.8}`} stroke="#dcf5a9" strokeWidth=".5" strokeLinecap="round"/>}
    </g>;})}
    <g transform={`translate(${frame.ball.x} ${frame.ball.z})`} className="ball-token" data-testid="ball-token" role="button" tabIndex={0} aria-label="ボール" onKeyDown={e=>{if(e.key==='Enter'){onPick('ball');}}} onPointerDown={e=>start(e,'ball',frame.ball.x,frame.ball.z)}><circle r="2.8" fill="transparent"/>{ballActive&&<circle r="2.4" fill="none" stroke="#f4d48b" strokeWidth=".35"/>}<circle r="1.1" fill="#fff6dd" stroke="#1b2b23" strokeWidth=".32"/><path d="m0-.55.53.38-.2.61h-.66l-.2-.61Z" fill="#1c2923"/></g>
    <text x="-52" y="38" fill="#819c89" fontSize="1.7" letterSpacing=".3">HOME →</text><text x="52" y="38" textAnchor="end" fill="#819c89" fontSize="1.7" letterSpacing=".2">105 × 68 m</text>
  </svg>{passMode&&<div className="pass-instruction">パスの受け手をクリック <span>Escで解除</span></div>}</div>;
}
