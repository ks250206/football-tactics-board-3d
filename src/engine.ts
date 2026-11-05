import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createAthlete, createBall, type Athlete } from './athlete';
import { createWorld } from './world';
import { BIELSA_ZONES, LANE_ZONES, resolveDefence } from './tactics';
import { distance, RAD, sample, verticalFov, type Frame, type Project, type Quality, type ViewSettings } from './core';

function disposeObject(root:T.Object3D) {
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  root.traverse(object=>{
    const mesh=object as T.Mesh;
    if(mesh.geometry)geometries.add(mesh.geometry);
    if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);
    }
  });
  textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
}

export class TacticsEngine {
  readonly canvas:HTMLCanvasElement;
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(60,1,.06,2200);
  private renderer:T.WebGLRenderer;
  private controls:OrbitControls;
  private composer:EffectComposer;
  private fxaa:ShaderPass;
  private environment:T.WebGLRenderTarget;
  private world:ReturnType<typeof createWorld>;
  private athletes=new Map<string,Athlete>();
  private ball=createBall();
  private ring:T.Mesh;
  private lanes=new T.Group();
  private bielsa=new T.Group();
  private captureRequest=()=>{this.needsRender=true;};
  private path:T.Line;
  private resizeObserver:ResizeObserver;
  private animation=0;
  private disposed=false;
  private width=1;
  private height=1;
  private lastMode='eye';
  private lastLighting='';
  private project:Project;
  private frame:Frame;
  private selected='home-6';
  private settings:ViewSettings;
  private lastProject:Project|null=null;
  private lastSelected='';
  private statsAt=0;
  private ticks=0;
  private needsRender=true;
  onStats?:(fps:number)=>void;
  onAspect?:(aspect:number)=>void;

  constructor(private host:HTMLElement,project:Project,settings:ViewSettings,quality:Quality) {
    this.project=project;this.frame=sample(project,0);this.settings=settings;
    this.renderer=new T.WebGLRenderer({antialias:quality!=='low',alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='cinematic'?2:quality==='balanced'?1.5:1));
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.AgXToneMapping;
    this.renderer.toneMappingExposure=1.05;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','リアルタイム3Dピッチ');this.canvas.dataset.testid='scene-canvas';host.appendChild(this.canvas);
    const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.28;
    room.dispose();pmrem.dispose();
    this.world=createWorld(this.renderer,quality);this.scene.add(this.world.root);
    this.scene.fog=new T.FogExp2('#d9d2b9',.0038);
    for(const player of project.roster){const athlete=createAthlete(player);this.athletes.set(player.id,athlete);this.scene.add(athlete.root);}
    this.scene.add(this.ball);
    for(const zone of LANE_ZONES){
      const mesh=new T.Mesh(new T.PlaneGeometry(zone.length,zone.width),new T.MeshBasicMaterial({color:zone.color,transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide}));
      mesh.rotation.x=-Math.PI/2;mesh.position.set(zone.x+zone.length/2,.012,zone.z+zone.width/2);this.lanes.add(mesh);
    }
    for(const zone of BIELSA_ZONES){
      const geometry=new T.BufferGeometry(),vertices:number[]=[];
      for(const i of [1,2])for(const index of [0,i,i+1]){const [x,z]=zone.points[index];vertices.push(x,.016,z);}
      geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      this.bielsa.add(new T.Mesh(geometry,new T.MeshBasicMaterial({color:zone.color,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide})));
      const border=new T.BufferGeometry().setFromPoints([...zone.points,zone.points[0]].map(([x,z])=>new T.Vector3(x,.018,z)));
      this.bielsa.add(new T.Line(border,new T.LineBasicMaterial({color:zone.color,transparent:true,opacity:.85})));
    }
    this.scene.add(this.lanes,this.bielsa);
    this.ring=new T.Mesh(new T.RingGeometry(.52,.55,48),new T.MeshBasicMaterial({color:'#d3f29b',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));this.ring.rotation.x=-Math.PI/2;this.scene.add(this.ring);
    this.path=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#d0e5ae',dashSize:.6,gapSize:.45,transparent:true,opacity:.6}));this.scene.add(this.path);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.maxPolarAngle=Math.PI*.475;this.controls.minDistance=2;this.controls.maxDistance=140;this.controls.enabled=false;
    this.controls.addEventListener('change',()=>{this.needsRender=true;});
    this.canvas.addEventListener('touchline-capture-request',this.captureRequest);
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    if(quality==='cinematic'){
      const ao=new SSAOPass(this.scene,this.camera,1,1);ao.kernelRadius=3;ao.minDistance=.00015;ao.maxDistance=.012;this.composer.addPass(ao);
      const bloom=new UnrealBloomPass(new T.Vector2(1,1),.14,.3,1.3);this.composer.addPass(bloom);
    }
    this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);this.composer.addPass(new OutputPass());
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    this.animate();
  }
  private resize(){
    this.needsRender=true;
    this.width=Math.max(1,this.host.clientWidth);this.height=Math.max(1,this.host.clientHeight);
    this.renderer.setSize(this.width,this.height,false);this.composer.setSize(this.width,this.height);
    const ratio=this.renderer.getPixelRatio();this.fxaa.uniforms.resolution.value.set(1/(this.width*ratio),1/(this.height*ratio));
    this.camera.aspect=this.width/this.height;this.camera.fov=verticalFov(this.settings.fov,this.camera.aspect);this.camera.updateProjectionMatrix();this.onAspect?.(this.camera.aspect);
  }
  update(project:Project,frame:Frame,selected:string,settings:ViewSettings){this.project=project;this.frame=frame;this.selected=selected;this.settings=settings;this.needsRender=true;}
  private apply(){
    const {project,frame,selected,settings}=this;
    const p=frame.players[selected];if(!p)return;
    const a=resolveDefence(project,sample(project,Math.max(0,frame.t-.04))),b=resolveDefence(project,sample(project,Math.min(project.duration,frame.t+.04)));
    const dt=Math.max(.001,b.t-a.t);
    let selectedSpeed=0;
    this.athletes.forEach((athlete,id)=>{
      const speed=distance(a.players[id],b.players[id])/dt;
      athlete.pose(frame.players[id],frame.t,speed);athlete.label.visible=settings.labels;
      athlete.root.visible=!(settings.camera==='eye'&&id===selected);if(id===selected)selectedSpeed=speed;
    });
    this.lanes.visible=settings.lanes;this.bielsa.visible=settings.bielsa;
    this.ball.position.set(frame.ball.x,frame.ball.y,frame.ball.z);this.ball.rotation.set(frame.ball.z/.11,0,-frame.ball.x/.11);
    this.ring.position.set(p.x,.018,p.z);this.ring.visible=settings.camera!=='eye';
    if(this.lastProject!==project||this.lastSelected!==selected){
      const geometry=new T.BufferGeometry().setFromPoints(project.frames.map(f=>{const pose=resolveDefence(project,f).players[selected];return new T.Vector3(pose.x,.035,pose.z);}));
      this.path.geometry.dispose();this.path.geometry=geometry;this.path.computeLineDistances();this.lastProject=project;this.lastSelected=selected;
    }
    this.path.visible=settings.paths&&settings.camera!=='eye';
    this.world.update(frame.t,p.x,p.z);
    if(this.lastLighting!==settings.lighting){
      this.world.setLighting(settings.lighting);(this.scene.fog as T.FogExp2).color.set(settings.lighting==='night'?'#182834':settings.lighting==='day'?'#c4d5da':'#d9d2b9');
      this.scene.environmentIntensity=settings.lighting==='night'?.2:.28;this.lastLighting=settings.lighting;
    }
    this.camera.fov=verticalFov(settings.fov,this.width/this.height);this.camera.updateProjectionMatrix();
    this.controls.enabled=settings.camera==='orbit';
    const yaw=(p.body+p.head)*RAD,pitch=p.pitch*RAD;
    if(settings.camera==='eye'){
      const bob=settings.bob?Math.sin(frame.t*15)*Math.min(selectedSpeed,5)*.004:0;
      this.camera.position.set(p.x,settings.eye+bob,p.z);
      this.camera.lookAt(p.x+Math.cos(yaw)*Math.cos(pitch)*10,settings.eye+bob+Math.sin(pitch)*10,p.z+Math.sin(yaw)*Math.cos(pitch)*10);
    } else if(settings.camera==='follow'){
      const heading=p.body*RAD;this.camera.position.set(p.x-Math.cos(heading)*5.8,3.1,p.z-Math.sin(heading)*5.8);
      this.camera.lookAt(p.x+Math.cos(yaw)*12,1.4,p.z+Math.sin(yaw)*12);
    } else {
      if(this.lastMode!=='orbit'){this.camera.position.set(p.x-18,35,p.z+36);this.controls.target.set(p.x,0,p.z);}
      this.controls.update();
    }
    this.lastMode=settings.camera;
  }
  private animate=()=>{
    if(this.disposed)return;
    if(this.controls.enabled)this.controls.update();
    if(this.needsRender){
      this.needsRender=false;this.apply();this.composer.render();this.canvas.dataset.ready='true';this.canvas.dispatchEvent(new Event('touchline-frame'));this.ticks++;
    }
    const now=performance.now();
    if(now-this.statsAt>1000){this.onStats?.(Math.round(this.ticks*1000/(now-this.statsAt)));this.statsAt=now;this.ticks=0;}
    this.animation=requestAnimationFrame(this.animate);
  };
  capture(){this.apply();this.composer.render();this.canvas.dispatchEvent(new Event('touchline-frame'));return this.canvas.toDataURL('image/png');}
  dispose(){
    this.disposed=true;cancelAnimationFrame(this.animation);this.resizeObserver.disconnect();this.canvas.removeEventListener('touchline-capture-request',this.captureRequest);this.controls.dispose();
    for(const pass of this.composer.passes)pass.dispose();this.composer.dispose();disposeObject(this.scene);this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
