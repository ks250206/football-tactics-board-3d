import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Lighting, Quality } from './core';

export function seeded(seed=71) { return () => { seed=(Math.imul(1664525,seed)+1013904223)>>>0; return seed/4294967296; }; }
export function texture(width:number,height:number,draw:(c:CanvasRenderingContext2D)=>void) {
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const context=canvas.getContext('2d'); if(!context) throw new Error('Canvas 2Dを初期化できません。');
  draw(context); const map=new T.CanvasTexture(canvas); map.colorSpace=T.SRGBColorSpace; return map;
}
export function noiseTexture() {
  const rng=seeded(); const map=texture(256,256,c=>{const image=c.createImageData(256,256);for(let i=0;i<image.data.length;i+=4){const v=110+rng()*100;image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}c.putImageData(image,0,0);});
  map.colorSpace=T.NoColorSpace; map.wrapS=map.wrapT=T.RepeatWrapping; return map;
}

export function createWorld(renderer:T.WebGLRenderer, quality:Quality) {
  const root=new T.Group(); root.name='Procedural stadium';
  const rng=seeded(138);
  const batches=new Map<T.Material,T.BufferGeometry[]>();
  const add=(geometry:T.BufferGeometry,material:T.Material,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>{
    const transform=new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(rx,ry,rz)),new T.Vector3(1,1,1));
    geometry.applyMatrix4(transform); const list=batches.get(material)??[]; list.push(geometry); batches.set(material,list);
  };
  const mat=(color:T.ColorRepresentation,roughness=.8,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const concrete=mat('#858e8a'), dark=mat('#27312e'), steel=mat('#a2aaa7',.4,.65), white=mat('#eeeae0',.5), aisle=mat('#535d57');
  const pitchMap=texture(2048,1434,c=>{
    c.fillStyle='#245029';c.fillRect(0,0,2048,1434);
    const sx=2048/120,sz=1434/84;
    c.save();c.translate(1024,717);c.scale(sx,sz);
    for(let i=0;i<14;i++){c.fillStyle=i%2?'#357631':'#2c6a2b';c.fillRect(-52.5+i*7.5,-34,7.5,68);}
    c.restore();
    for(let i=0;i<100000;i++){const v=rng();c.fillStyle=v>.5?'rgba(214,225,142,.035)':'rgba(0,24,0,.04)';c.fillRect(rng()*2048,rng()*1434,1,2);}
  });
  pitchMap.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const bump=noiseTexture();bump.repeat.set(150,100);bump.anisotropy=pitchMap.anisotropy;
  const pitchMaterial=new T.MeshStandardMaterial({map:pitchMap,bumpMap:bump,bumpScale:.004,roughness:.97,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const field=new T.Mesh(new T.PlaneGeometry(120,84),pitchMaterial);field.rotation.x=-Math.PI/2;field.receiveShadow=true;root.add(field);
  // Metre-scale vector paint stays crisp at eye height, unlike a magnified pitch texture.
  const paintVertices:number[]=[];
  const line=(ax:number,az:number,bx:number,bz:number)=>{
    const length=Math.hypot(bx-ax,bz-az);if(length<1e-8)return;
    const dx=-(bz-az)/length*.06,dz=(bx-ax)/length*.06,y=.008;
    paintVertices.push(ax-dx,y,az-dz,ax+dx,y,az+dz,bx+dx,y,bz+dz,ax-dx,y,az-dz,bx+dx,y,bz+dz,bx-dx,y,bz-dz);
  };
  const box=(x1:number,z1:number,x2:number,z2:number)=>{line(x1,z1,x2,z1);line(x2,z1,x2,z2);line(x2,z2,x1,z2);line(x1,z2,x1,z1);};
  const arc=(x:number,z:number,r:number,start=0,end=Math.PI*2)=>{
    const count=Math.ceil((end-start)*32);
    for(let i=0;i<count;i++){const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;line(x+Math.cos(a)*r,z+Math.sin(a)*r,x+Math.cos(b)*r,z+Math.sin(b)*r);}
  };
  box(-52.5,-34,52.5,34);line(0,-34,0,34);arc(0,0,9.15);
  for(const sign of [-1,1]){
    box(sign<0?-52.5:36,-20.16,sign<0?-36:52.5,20.16);
    box(sign<0?-52.5:47,-9.16,sign<0?-47:52.5,9.16);
    arc(sign*41.5,0,9.15,sign<0?-.925:Math.PI-.925,sign<0?.925:Math.PI+.925);
    for(const z of [-34,34])arc(sign*52.5,z,1,sign<0?(z<0?0:-Math.PI/2):(z<0?Math.PI/2:Math.PI),sign<0?(z<0?Math.PI/2:0):(z<0?Math.PI:Math.PI*1.5));
  }
  const paintGeometry=new T.BufferGeometry();paintGeometry.setAttribute('position',new T.Float32BufferAttribute(paintVertices,3));paintGeometry.computeVertexNormals();
  const paint=new T.MeshStandardMaterial({color:'#e4e9d6',roughness:1,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-12});
  const paintMesh=new T.Mesh(paintGeometry,paint);paintMesh.receiveShadow=true;root.add(paintMesh);
  for(const x of [-41.5,0,41.5]){const spot=new T.Mesh(new T.CircleGeometry(.14,20),paint);spot.rotation.x=-Math.PI/2;spot.position.set(x,.008,0);spot.receiveShadow=true;root.add(spot);}
  const earth=new T.Mesh(new T.PlaneGeometry(4000,4000),mat('#28332c'));earth.rotation.x=-Math.PI/2;earth.position.y=-.5;root.add(earth);

  const wind={value:0};
  if(quality!=='low') {
    const blade=new T.PlaneGeometry(.006,.028,1,2);blade.translate(0,.014,0);
    const material=new T.MeshStandardMaterial({color:'#ffffff',roughness:1,side:T.DoubleSide});
    material.onBeforeCompile=shader=>{shader.uniforms.uWind=wind;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.17 + uWind) * uv.y * uv.y * 0.004;\nfloat grassDistance = distance(cameraPosition, (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz);\ntransformed *= 1.0 - smoothstep(12.0,32.0,grassDistance);');};
    const grass=new T.InstancedMesh(blade,material,quality==='cinematic'?65000:24000);
    const dummy=new T.Object3D();
    for(let i=0;i<grass.count;i++) {dummy.position.set((rng()-.5)*104,.004,(rng()-.5)*67);dummy.rotation.y=rng()*Math.PI;dummy.scale.setScalar(.65+rng()*.7);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);grass.setColorAt(i,new T.Color('#326c2c').lerp(new T.Color('#648c40'),rng()));}
    grass.receiveShadow=true;root.add(grass);
  }

  const seatTransforms:T.Matrix4[]=[]; const seatColors:T.Color[]=[];
  for(const sign of [-1,1]) {
    for(let row=0;row<12;row++) {
      const height=1.8+row*.62,z=sign*(43+row*1.02);
      add(new T.BoxGeometry(130,.62,1.1),concrete,0,height-.4,z);
      for(let col=0;col<246;col++) {
        if(col%41<3) continue;
        const dummy=new T.Object3D();dummy.position.set(-64+col*.52,height,z);dummy.rotation.y=sign>0?Math.PI:0;dummy.updateMatrix();seatTransforms.push(dummy.matrix.clone());
        seatColors.push(new T.Color((row+Math.floor(col/18))%7===0?'#c9d0bc':rng()>.14?'#274b46':'#506d65'));
      }
    }
    add(new T.BoxGeometry(136,.36,15),dark,0,11.4,sign*54.8);
    add(new T.BoxGeometry(136,.22,.28),steel,0,10.9,sign*47.5);
    for(let x=-64;x<=64;x+=8) {
      add(new T.CylinderGeometry(.11,.11,12,8),steel,x,5.5,sign*56.4);
      add(new T.BoxGeometry(.12,.22,14.5),steel,x,11,sign*53.7);
      add(new T.BoxGeometry(2.4,.12,13),aisle,x,5,sign*49.5,sign*-.55);
    }
    for(let row=0;row<10;row++) {
      const x=sign*(62+row*1.02),height=1.8+row*.62;
      add(new T.BoxGeometry(1.1,.62,86),concrete,x,height-.4,0);
      for(let col=0;col<162;col++){if(col%41<3)continue;const dummy=new T.Object3D();dummy.position.set(x,height,-42+col*.52);dummy.rotation.y=-sign*Math.PI/2;dummy.updateMatrix();seatTransforms.push(dummy.matrix.clone());seatColors.push(new T.Color(col%23<5?'#a8b5a3':'#315b50'));}
    }
    add(new T.BoxGeometry(12,.36,90),dark,sign*69,10,0);
    for(let z=-40;z<=40;z+=10) add(new T.CylinderGeometry(.11,.11,10,8),steel,sign*74,5,z);
  }
  const seatGeometry=mergeGeometries([new T.BoxGeometry(.43,.12,.4),new T.BoxGeometry(.43,.36,.08).translate(0,.16,-.17)])!;
  const seats=new T.InstancedMesh(seatGeometry,mat('#ffffff',.65),seatTransforms.length);
  seatTransforms.forEach((matrix,i)=>{seats.setMatrixAt(i,matrix);seats.setColorAt(i,seatColors[i]);});root.add(seats);

  const ledMap=texture(2048,64,c=>{c.fillStyle='#162522';c.fillRect(0,0,2048,64);c.fillStyle='#c9ed91';c.font='600 29px sans-serif';c.textAlign='center';for(let i=0;i<4;i++)c.fillText('TOUCHLINE   /   SEE THE NEXT PASS',256+i*512,43);});
  const led=new T.MeshStandardMaterial({map:ledMap,emissiveMap:ledMap,emissive:'#ffffff',emissiveIntensity:.65,roughness:.6});
  for(const sign of [-1,1]) {
    add(new T.BoxGeometry(112,.9,.16),led,0,.55,sign*38.5);
    add(new T.BoxGeometry(.16,.9,76),dark,sign*57.5,.55,0);
  }
  const bulb=new T.MeshStandardMaterial({color:'#e5f2ff',emissive:'#d6e8ff',emissiveIntensity:4,roughness:.2});
  for(const x of [-57,57])for(const z of [-40,40]){
    add(new T.CylinderGeometry(.22,.34,26,10),steel,x,13,z);
    const lamp=new T.Mesh(new T.BoxGeometry(5,2,.25),bulb);lamp.position.set(x,26,z);lamp.lookAt(0,3,0);root.add(lamp);
    for(let j=-2;j<=2;j++)add(new T.CylinderGeometry(.035,.035,25,5),steel,x+j*.13,12.5,z+.15);
  }
  for(const sign of [-1,1]) {
    const x=sign*52.5;
    for(const z of [-3.66,3.66]){add(new T.CylinderGeometry(.06,.06,2.44,12),white,x,1.22,z);add(new T.CylinderGeometry(.035,.035,2.5,8),white,x+sign*1.15,1.22,z,0,0,sign*1.1);}
    add(new T.CylinderGeometry(.06,.06,7.32,12),white,x,2.44,0,Math.PI/2);
    const vertices:number[]=[];const netLine=(a:number[],b:number[])=>vertices.push(...a,...b);
    for(let z=-3.66;z<=3.67;z+=.2){netLine([x,2.44,z],[x+sign*2,2.44,z]);netLine([x+sign*2,0,z],[x+sign*2,2.44,z]);}
    for(let y=0;y<=2.45;y+=.2){netLine([x+sign*2,y,-3.66],[x+sign*2,y,3.66]);for(const z of [-3.66,3.66])netLine([x,y,z],[x+sign*2,y,z]);}
    for(let n=0;n<=2;n+=.2){netLine([x+sign*n,2.44,-3.66],[x+sign*n,2.44,3.66]);for(const z of [-3.66,3.66])netLine([x+sign*n,0,z],[x+sign*n,2.44,z]);}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    root.add(new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#e2e9dd',transparent:true,opacity:.45})));
    for(const z of [-34,34]){add(new T.CylinderGeometry(.018,.018,1.5,6),white,x,.75,z);add(new T.PlaneGeometry(.4,.3),new T.MeshStandardMaterial({color:'#edc65e',side:T.DoubleSide}),x+.18,1.32,z);}
  }
  batches.forEach((geometries,material)=>{const merged=mergeGeometries(geometries);if(merged){const mesh=new T.Mesh(merged,material);mesh.receiveShadow=true;mesh.castShadow=material===white;root.add(mesh);}geometries.forEach(g=>g.dispose());});

  const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#3c78a0')},bottom:{value:new T.Color('#f0c49a')},sunDirection:{value:new T.Vector3(-.65,.3,-.25).normalize()},sunColor:{value:new T.Color('#fff0c0')},sunPower:{value:.7}},vertexShader:'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',fragmentShader:'varying vec3 direction; uniform vec3 top,bottom,sunDirection,sunColor; uniform float sunPower; void main(){ vec3 d=normalize(direction); float h=pow(max(d.y,0.0),0.32); vec3 col=mix(bottom,top,h); float mu=max(dot(d,sunDirection),0.0); col+=sunColor*(pow(mu,2200.0)*5.0+pow(mu,14.0)*0.25)*sunPower; gl_FragColor=vec4(col,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }'});
  const sky=new T.Mesh(new T.SphereGeometry(1500,32,16),skyMaterial);root.add(sky);
  const hemi=new T.HemisphereLight('#c9e4ff','#354b28',.85);root.add(hemi);
  const sun=new T.DirectionalLight('#ffe1ac',3.3);sun.position.set(-35,35,-25);sun.castShadow=true;
  sun.shadow.mapSize.set(quality==='cinematic'?4096:2048,quality==='cinematic'?4096:2048);
  sun.shadow.camera.left=-35;sun.shadow.camera.right=35;sun.shadow.camera.top=35;sun.shadow.camera.bottom=-35;sun.shadow.camera.near=1;sun.shadow.camera.far=160;sun.shadow.bias=-.00015;sun.shadow.normalBias=.035;
  root.add(sun,sun.target);
  const fill=new T.DirectionalLight('#cadfff',.45);fill.position.set(30,20,20);root.add(fill);
  let lighting:Lighting='golden';
  function setLighting(mode:Lighting) {
    lighting=mode;const night=mode==='night',day=mode==='day';
    hemi.color.set(night?'#718baa':day?'#d4ebff':'#c9deee');hemi.groundColor.set(night?'#20392c':day?'#6e716b':'#354b28');hemi.intensity=night?.65:day?1.2:.85;
    sun.color.set(night?'#e4eeff':day?'#ffffff':'#ffdda9');sun.intensity=night?2.8:day?3.3:3.3;
    fill.intensity=night?1.3:.55;bulb.emissiveIntensity=night?8:.7;led.emissiveIntensity=night?1.3:.3;
    skyMaterial.uniforms.top.value.set(night?'#040b17':day?'#2879b2':'#3c78a0');skyMaterial.uniforms.bottom.value.set(night?'#172a40':day?'#bdd9e7':'#f0c49a');skyMaterial.uniforms.sunPower.value=night?0:day?.55:.85;
  }
  function update(t:number,x:number,z:number) {
    wind.value=t;sun.target.position.set(x,0,z);
    sun.position.set(x+(lighting==='night'?-32:-38),lighting==='day'?65:lighting==='night'?40:28,z-28);
  }
  setLighting('golden');
  return {root,setLighting,update};
}
