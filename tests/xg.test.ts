import { describe, expect, it } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import { compileBooster, predictBooster } from '../src/xg/booster';
import { analyseXg, extractFeatures, FEATURES, goalDistance, MODEL_FILES, predictShot, probabilityColor, toStatsBomb, type ModelSet, type Snapshot } from '../src/xg/analysis';
import { firstBlocker, shotGeometry } from '../src/xg/geometry';
const models = Object.fromEntries(Object.entries(MODEL_FILES).map(([id, file]) => [id, compileBooster(JSON.parse(readFileSync(`public/models/adamsaidane/${file}`, 'utf8')))])) as ModelSet;
function scene(): Snapshot {
  return { team:'home',time:0,shot:{x:40,z:0,y:.11},shooter:'home-9',oneOnOne:false,bodies:[
    {id:'away-1',x:51,z:0,height:1.9,keeper:true,opponent:true},
    {id:'away-2',x:44,z:0,height:1.8,keeper:false,opponent:true},
    {id:'home-9',x:39.52,z:0,height:1.8,keeper:false,opponent:false},
  ] };
}
describe('adamsaidane feature contract',()=>{
  it('maps landmarks instead of stretching the goal mouth',()=>{
    expect(toStatsBomb({x:0,z:0},'home')).toEqual({x:60,y:40});
    expect(toStatsBomb({x:52.5,z:3.66},'home')).toEqual({x:120,y:44});
    expect(toStatsBomb({x:36,z:-20.16},'home')).toEqual({x:102,y:18});
    expect(toStatsBomb({x:47,z:9.16},'home')).toEqual({x:114,y:50});
    expect(toStatsBomb({x:-52.5,z:-34},'home')).toEqual({x:0,y:0});
  });
  it('rotates the whole scene for away attacks',()=>{
    const s=scene(), rotated={...s,team:'away' as const,shot:{...s.shot,x:-s.shot.x,z:-s.shot.z},bodies:s.bodies.map(b=>({...b,x:-b.x,z:-b.z}))};
    expect(extractFeatures(rotated)).toEqual(extractFeatures(s));
    expect(predictShot(models,rotated).value).toBe(predictShot(models,s).value);
  });
  it('uses distance to the goal segment, not goal centre, and degrees',()=>{
    expect(goalDistance({x:110,y:40})).toBe(10);
    expect(goalDistance({x:110,y:50})).toBeCloseTo(Math.hypot(10,6));
    expect(extractFeatures(scene()).f.angle).toBeCloseTo(32.6963430947);
  });
  it('counts opponents in the triangle INCLUDING GK, but never teammates',()=>{
    const s=scene();s.bodies.push({id:'home-8',x:45,z:0,height:1.8,keeper:false,opponent:false});
    expect(extractFeatures(s).f.num_opposing_players).toBe(2);
    s.bodies[1].z=8;expect(extractFeatures(s).f.num_opposing_players).toBe(1);
    s.bodies[0].z=6;expect(extractFeatures(s).f.num_opposing_players).toBe(0);
  });
  it('matches all published feature names and order',()=>{
    for(const id of ['near','oneOnOne','far'] as const)expect(models[id].names).toEqual(FEATURES[id]);
  });
  it('routes by upstream distance<=20 and explicit 1v1, not the demo app conditional',()=>{
    const s=scene();expect(predictShot(models,s).model).toBe('near');
    s.oneOnOne=true;expect(predictShot(models,s).model).toBe('oneOnOne');
    s.shot.x=20;expect(predictShot(models,s).value).toBeNull();
    s.oneOnOne=false;expect(predictShot(models,s).model).toBe('far');
  });
  it('matches a pinned reference layout and responds to GK/DF placement',()=>{
    const s=scene();expect(predictShot(models,s).value).toBeCloseTo(.111239438647,7);
    s.bodies[1].z=8;expect(predictShot(models,s).value).toBeCloseTo(.147951205295,7);
    s.bodies[0].z=5;expect(predictShot(models,s).value).toBeCloseTo(.184116388422,7);
  });
  it('does not invent defender dependence for the far model',()=>{
    const s=scene();s.shot.x=15;const before=predictShot(models,s).value;
    s.bodies[1].x=30;s.bodies[1].z=15;expect(predictShot(models,s).value).toBe(before);
  });
  it.each([{x:52.5,z:0,y:.11},{x:-52.5,z:0,y:.11},{x:40,z:35,y:.11},{x:40,z:0,y:.51},{x:40,z:0,y:-.01},{x:NaN,z:0,y:.11}])('rejects unsupported shot %j',shot=>{
    expect(predictShot(models,{...scene(),shot}).value).toBeNull();
    expect(shotGeometry({...scene(),shot})).toBeNull();
  });
  it('does not fabricate a goalkeeper for missing-input snapshots',()=>{
    const s=scene();s.bodies=s.bodies.filter(b=>!b.keeper);
    expect(predictShot(models,s).reason).toContain('GK');
  });
  it('makes 884 finite hypothetical ground shots without mutating the frame',()=>{
    const s=scene();s.shot.y=3;const before=structuredClone(s);const r=analyseXg(models,s,true);
    expect(r.prediction.value).toBeNull();expect(r.heatmap).toHaveLength(884);expect(s).toEqual(before);
    expect(r.heatmap.every(c=>c.value>=0&&c.value<=1&&c.x>0&&c.x<52.5)).toBe(true);
    expect(analyseXg(models,s,false).heatmap).toEqual([]);
  });
  it('masks unsupported far 1v1 cells, mirrors the map for AWAY',()=>{
    const s=scene();s.oneOnOne=true;const r=analyseXg(models,s,true);expect(r.heatmap.length).toBeGreaterThan(0);expect(r.heatmap.length).toBeLessThan(884);
    const a={...scene(),team:'away' as const};expect(analyseXg(models,a,true).heatmap.every(c=>c.x<0)).toBe(true);
  });
  it('uses a fixed probability colour scale',()=>{
    expect(probabilityColor(0)).toBe('rgb(38,69,137)');expect(probabilityColor(1)).toBe('rgb(172,39,81)');
  });
});
describe('static geometric shot lanes (not probabilities)',()=>{
  const target={x:52.5,z:0,y:.11};
  it('keeps an empty goal completely clear',()=>{
    const g=shotGeometry({...scene(),bodies:[]})!;expect(g.openFraction).toBe(1);expect(g.cells).toHaveLength(192);expect(g.lanes).toHaveLength(24);
  });
  it('finds the nearest defender, differentiates goalkeeper and teammate',()=>{
    const s=scene();expect(firstBlocker(s.shot,target,s.bodies,s.shooter)).toBe('defender');
    s.bodies[1].z=10;expect(firstBlocker(s.shot,target,s.bodies,s.shooter)).toBe('keeper');
    s.bodies.push({id:'home-8',x:44,z:0,height:1.8,opponent:false,keeper:false});expect(firstBlocker(s.shot,target,s.bodies,s.shooter)).toBe('teammate');
  });
  it('excludes the shooter, players behind the ball and beyond the goal',()=>{
    const s=scene();s.bodies[0].x=55;s.bodies[1].x=35;expect(firstBlocker(s.shot,target,s.bodies,s.shooter)).toBe('clear');
  });
  it('checks height along the cylinder intersection rather than a flat 2D shadow',()=>{
    const s=scene();s.bodies=[{...s.bodies[1],height:.4}];
    expect(firstBlocker(s.shot,{...target,y:2.3},s.bodies,s.shooter)).toBe('clear');
    expect(firstBlocker(s.shot,target,s.bodies,s.shooter)).toBe('defender');
  });
  it('does not double count overlapping blockers as additional covered area',()=>{
    const s=scene(), first=shotGeometry(s)!;s.bodies.push({...s.bodies[1],id:'away-3'});expect(shotGeometry(s)!.openFraction).toBe(first.openFraction);
  });
});
describe('small safe XGBoost evaluator',()=>{
  const raw=()=>JSON.parse(readFileSync('public/models/adamsaidane/xG_foot_openplay_inside_1on1.json','utf8'));
  it('supports missing values but rejects infinite input',()=>{
    expect(predictBooster(models.oneOnOne,[NaN,NaN,NaN,NaN,NaN])).toBeGreaterThan(0);
    expect(()=>predictBooster(models.oneOnOne,[Infinity,0,0,0,0])).toThrow();
    expect(()=>predictBooster(models.oneOnOne,[0])).toThrow();
  });
  it('rejects incompatible model objectives, categories and cyclic trees',()=>{
    let r=raw();r.learner.objective.name='reg:squarederror';expect(()=>compileBooster(r)).toThrow();
    r=raw();r.learner.gradient_booster.model.trees[0].split_type[0]=1;expect(()=>compileBooster(r)).toThrow();
    r=raw();r.learner.gradient_booster.model.trees[0].left_children[0]=0;expect(()=>compileBooster(r)).toThrow();
  });
});
