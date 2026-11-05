import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture, texture } from './world';
import { RAD, type Player, type Pose } from './core';

export interface Athlete { root:T.Group; head:T.Group; label:T.Sprite; pose:(p:Pose,time:number,speed:number)=>void }
const skinColors=['#b47d56','#633d29','#dab18c','#8b593c','#e0bea0'];
/** Articulated, original procedural human. Anatomical proportions, not a licensed scan. */
export function createAthlete(player:Player):Athlete {
  const root=new T.Group();root.name=player.id;root.userData.playerId=player.id;
  const home=player.team==='home',keeper=player.number===1;
  const shirtColor=keeper?(home?'#f4bc49':'#c2dc57'):home?'#e4e8d8':'#c94e38';
  const shortsColor=keeper?(home?'#b68224':'#637d37'):home?'#263e38':'#431f23';
  const fabric=noiseTexture();fabric.repeat.set(24,24);
  const shirt=new T.MeshStandardMaterial({color:shirtColor,roughness:.88,bumpMap:fabric,bumpScale:.0035});
  const shorts=new T.MeshStandardMaterial({color:shortsColor,roughness:.95,bumpMap:fabric,bumpScale:.002});
  const skin=new T.MeshPhysicalMaterial({color:skinColors[player.skin],roughness:.62,metalness:0,clearcoat:.04,clearcoatRoughness:.85});
  const socks=new T.MeshStandardMaterial({color:home?'#e0e7d8':'#a7352c',roughness:.95});
  const boots=new T.MeshStandardMaterial({color:player.number%3===0?'#e5d56d':'#202622',roughness:.5,metalness:.08});
  const trim=new T.MeshStandardMaterial({color:home?'#385a45':'#e6bc90',roughness:.7});
  const eyeMaterial=new T.MeshStandardMaterial({color:'#2b211b',roughness:.4});
  const add=(parent:T.Object3D,geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const ellipsoid=(parent:T.Object3D,material:T.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>add(parent,new T.SphereGeometry(1,12,10),material,x,y,z,sx,sy,sz);
  const torso=new T.Group();torso.position.y=1.02;root.add(torso);
  const rings=[[0,.17],[.08,.18],[.22,.205],[.38,.235],[.46,.22],[.5,.145]];
  add(torso,new T.LatheGeometry(rings.map(([y,r])=>new T.Vector2(r,y)),20),shirt,0,0,0,1,1,.62);
  ellipsoid(torso,shirt,-.215,.405,0,.105,.115,.12);ellipsoid(torso,shirt,.215,.405,0,.105,.115,.12);
  add(torso,new T.TorusGeometry(.085,.014,7,24),trim,0,.491,.012).rotation.x=Math.PI/2;
  add(torso,new T.CylinderGeometry(.065,.075,.115,12),skin,0,.53,0);
  const chest=texture(128,128,c=>{c.clearRect(0,0,128,128);c.fillStyle=home?'#233c32':'#f9ecd2';c.font='bold 68px sans-serif';c.textAlign='center';c.fillText(String(player.number),64,94);c.font='600 11px sans-serif';c.fillText('TOUCHLINE',64,25);});
  const badgeMat=new T.MeshStandardMaterial({map:chest,transparent:true,depthWrite:false,roughness:.9});
  add(torso,new T.PlaneGeometry(.2,.23),badgeMat,0,.24,.144);
  const back=add(torso,new T.PlaneGeometry(.24,.28),badgeMat,0,.25,-.144);back.rotation.y=Math.PI;
  const head=new T.Group();head.position.set(0,.66,.01);torso.add(head);
  ellipsoid(head,skin,0,0,0,.088,.119,.092);ellipsoid(head,skin,0,-.06,.028,.069,.065,.068);
  ellipsoid(head,skin,0,-.005,.09,.018,.026,.029);
  ellipsoid(head,skin,-.087,-.008,0,.015,.029,.018);ellipsoid(head,skin,.087,-.008,0,.015,.029,.018);
  for(const s of [-1,1]) {ellipsoid(head,eyeMaterial,s*.034,.018,.081,.008,.005,.005);add(head,new T.BoxGeometry(.032,.004,.006),eyeMaterial,s*.034,.039,.078);}
  const hairMat=new T.MeshStandardMaterial({color:player.number%4===0?'#382819':'#171a16',roughness:1});
  add(head,new T.SphereGeometry(.092,14,10,0,Math.PI*2,0,Math.PI*.42),hairMat,0,.015,-.008,1,1.18,1);
  ellipsoid(root,shorts,0,1.025,0,.185,.125,.135);
  const hips:T.Group[]=[],knees:T.Group[]=[],arms:T.Group[]=[],elbows:T.Group[]=[];
  for(const s of [-1,1]) {
    const hip=new T.Group();hip.position.set(s*.105,1.02,0);root.add(hip);hips.push(hip);
    add(hip,new T.CylinderGeometry(.105,.095,.23,12),shorts,0,-.09,0);
    ellipsoid(hip,skin,0,-.24,.003,.078,.18,.082);
    const knee=new T.Group();knee.position.y=-.48;hip.add(knee);knees.push(knee);
    ellipsoid(knee,skin,0,0,.012,.063,.068,.068);
    ellipsoid(knee,socks,0,-.22,-.004,.054,.22,.06);
    add(knee,new T.CylinderGeometry(.06,.058,.045,12),trim,0,-.07,0);
    ellipsoid(knee,boots,0,-.48,.06,.065,.054,.13);
    add(knee,new T.BoxGeometry(.12,.018,.23),boots,0,-.525,.045);
    const arm=new T.Group();arm.position.set(s*.245,1.405,0);root.add(arm);arms.push(arm);
    add(arm,new T.CapsuleGeometry(.065,.12,4,10),shirt,0,-.07,0);
    ellipsoid(arm,skin,0,-.18,0,.055,.105,.06);
    const elbow=new T.Group();elbow.position.y=-.25;arm.add(elbow);elbows.push(elbow);
    add(elbow,new T.CapsuleGeometry(.043,.17,4,10),skin,0,-.085,0);
    ellipsoid(elbow,skin,0,-.235,.005,.04,.064,.026);
    ellipsoid(elbow,skin,-s*.035,-.219,.015,.018,.034,.016);
    arm.rotation.z=s*.11;
  }
  const labelMap=texture(128,80,c=>{c.fillStyle='rgba(9,17,16,.84)';c.beginPath();c.roundRect(13,8,102,60,22);c.fill();c.fillStyle=home?'#dbf4bb':'#ffb19a';c.font='600 34px sans-serif';c.textAlign='center';c.fillText(String(player.number).padStart(2,'0'),64,51);});
  const label=new T.Sprite(new T.SpriteMaterial({map:labelMap,transparent:true,depthTest:true,depthWrite:false}));label.position.y=2.02;label.scale.set(.77,.48,1);root.add(label);
  mergeRigidParts(root);
  root.scale.setScalar(player.height/1.8);
  return {root,head,label,pose(p,time,speed){
    root.position.set(p.x,0,p.z);root.rotation.y=Math.PI/2-p.body*RAD;
    const moving=Math.min(speed/4,1),phase=time*7.5+player.number*.7;
    torso.rotation.x=moving*.08;torso.rotation.z=Math.cos(phase)*moving*.025;
    head.rotation.y=-p.head*RAD;head.rotation.x=-p.pitch*RAD;
    hips.forEach((hip,i)=>{const phaseLeg=phase+i*Math.PI;hip.rotation.x=Math.sin(phaseLeg)*.65*moving;knees[i].rotation.x=Math.max(0,-Math.sin(phaseLeg))*.95*moving;arms[i].rotation.x=-Math.sin(phaseLeg)*.6*moving-.08;elbows[i].rotation.x=-.2-moving*.6;});
  }};
}

/** Truncated-icosahedron panels projected onto a sphere: 12 black pentagons, 20 white hexagons. */
export function createBall():T.Mesh {
  const source=new T.IcosahedronGeometry(1,0);const attr=source.getAttribute('position');const vertices:T.Vector3[]=[];const faces:number[][]=[];
  const index=(v:T.Vector3)=>{let i=vertices.findIndex(p=>p.distanceToSquared(v)<1e-8);if(i<0){i=vertices.length;vertices.push(v);}return i;};
  for(let i=0;i<attr.count;i+=3)faces.push([0,1,2].map(k=>index(new T.Vector3().fromBufferAttribute(attr,i+k))));
  source.dispose();
  const neighbors=vertices.map(()=>new Set<number>());faces.forEach(f=>f.forEach((v,i)=>{neighbors[v].add(f[(i+1)%3]);neighbors[v].add(f[(i+2)%3]);}));
  const cut=(a:number,b:number)=>vertices[a].clone().multiplyScalar(2/3).addScaledVector(vertices[b],1/3).normalize();
  const panels:{points:T.Vector3[];color:T.Color}[]=[];
  vertices.forEach((v,i)=>{const pts=[...neighbors[i]].map(n=>cut(i,n));const axis=pts[0].clone().sub(v.clone().multiplyScalar(pts[0].dot(v))).normalize();const cross=new T.Vector3().crossVectors(v,axis);pts.sort((a,b)=>Math.atan2(a.dot(cross),a.dot(axis))-Math.atan2(b.dot(cross),b.dot(axis)));panels.push({points:pts,color:new T.Color('#17201d')});});
  faces.forEach(([a,b,c])=>panels.push({points:[cut(a,b),cut(b,a),cut(b,c),cut(c,b),cut(c,a),cut(a,c)],color:new T.Color('#e9e8da')}));
  const positions:number[]=[],normals:number[]=[],colors:number[]=[];
  function tri(a:T.Vector3,b:T.Vector3,c:T.Vector3,color:T.Color,depth=2) {
    if(depth){const ab=a.clone().add(b).normalize(),bc=b.clone().add(c).normalize(),ca=c.clone().add(a).normalize();tri(a,ab,ca,color,depth-1);tri(ab,b,bc,color,depth-1);tri(ca,bc,c,color,depth-1);tri(ab,bc,ca,color,depth-1);return;}
    const n=new T.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));if(n.dot(a)<0)[b,c]=[c,b];
    for(const p of [a,b,c]){positions.push(p.x*.11,p.y*.11,p.z*.11);normals.push(p.x,p.y,p.z);colors.push(color.r,color.g,color.b);}
  }
  panels.forEach(({points,color})=>{const center=points.reduce((a,b)=>a.add(b),new T.Vector3()).normalize();points.forEach((p,i)=>tri(center,p,points[(i+1)%points.length],color));});
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const ball=new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.6,metalness:0}));ball.castShadow=true;ball.receiveShadow=true;return ball;
}

/** Merge geometry rigidly attached to one joint/material; preserve all animated joints. */
function mergeRigidParts(parent:T.Object3D):void {
  for(const child of [...parent.children]) if(child instanceof T.Group) mergeRigidParts(child);
  const batches=new Map<T.Material,T.Mesh[]>();
  for(const child of parent.children) {
    if(!(child instanceof T.Mesh) || Array.isArray(child.material)) continue;
    const list=batches.get(child.material)??[];list.push(child);batches.set(child.material,list);
  }
  for(const [material,meshes] of batches) {
    if(meshes.length<2)continue;
    const geometries=meshes.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
    const geometry=mergeGeometries(geometries);
    geometries.forEach(g=>g.dispose());
    if(!geometry)continue;
    const combined=new T.Mesh(geometry,material);combined.castShadow=true;combined.receiveShadow=true;
    parent.add(combined);
    for(const mesh of meshes){parent.remove(mesh);mesh.geometry.dispose();}
  }
}
