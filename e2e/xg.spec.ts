import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createDemo } from '../src/core';

function fixture() {
  const p=createDemo();
  for(const f of p.frames) {
    p.roster.forEach((r,i)=>{ f.players[r.id]={x:r.team==='home'?-10:18,z:-28+(i%11)*5,body:r.team==='home'?0:180,head:0,pitch:0}; });
    f.players['home-6']={x:40,z:0,body:0,head:0,pitch:0};
    f.players['away-1']={x:51,z:0,body:180,head:0,pitch:0};
    f.players['away-2']={x:45,z:.5,body:180,head:0,pitch:0};
    f.ball={x:40,z:0,y:.11,owner:'home-6',arc:0};
  }
  return p;
}
async function load(page:Page) {
  await page.addInitScript(p=>localStorage.setItem('touchline.project.v1',JSON.stringify(p)),fixture());
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
}
async function settled(page:Page) {
  await expect(page.getByTestId('trained-xg-value')).toHaveText(/^0\.\d{3}$/,{timeout:30000});
  await expect(page.getByTestId('xg-freshness')).toContainText('更新済み');
}
async function dragPlayer(page:Page,id:string,x:number,z:number) {
  await page.getByTestId('tactics-board').scrollIntoViewIfNeeded();
  const target=await page.getByTestId('tactics-board').evaluate((el,p)=>{
    const svg=el as unknown as SVGSVGElement;const point=svg.createSVGPoint();point.x=p.x;point.y=p.z;const result=point.matrixTransform(svg.getScreenCTM()!);return {x:result.x,y:result.y};
  },{x,z});
  const b=await page.getByTestId(`player-${id}`).boundingBox();if(!b)throw new Error('Missing player');
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:5});await page.mouse.up();
}

test('scores trained xG, updates heatmap and goal masks on a real defender drag, preserves renderer',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const external:string[]=[];page.on('request',r=>{if(r.url().startsWith('http')&&!r.url().startsWith('http://127.0.0.1:4173/'))external.push(r.url());});
  await load(page);
  await page.getByRole('button',{name:'学習済みxG',exact:true}).click();
  await page.getByRole('button',{name:'xGヒートマップ',exact:true}).click();
  await page.getByRole('button',{name:'シュートコース',exact:true}).click();
  await settled(page);
  await expect(page.getByTestId('xg-heatmap').locator('rect')).toHaveCount(884);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-heatmap-cells','884');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-goal-cells','192');
  const before=await page.getByTestId('trained-xg-value').textContent();
  const heatBefore=await page.getByTestId('xg-heatmap').innerHTML();
  await page.getByTestId('scene-canvas').evaluate(el=>el.setAttribute('data-identity','retained'));
  await page.getByRole('button',{name:'視点を固定',exact:true}).click();
  await dragPlayer(page,'away-2',45,14);await settled(page);
  expect(await page.getByTestId('trained-xg-value').textContent()).not.toBe(before);
  expect(await page.getByTestId('xg-heatmap').innerHTML()).not.toBe(heatBefore);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-identity','retained');
  await page.getByRole('button',{name:'自由',exact:true}).click();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/xg-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'一人称',exact:true}).click();
  await page.screenshot({path:'artifacts/xg-first-person.png',fullPage:true});
  await page.getByRole('button',{name:'xGヒートマップ',exact:true}).click();
  await page.getByRole('button',{name:'シュートコース',exact:true}).click();
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-heatmap-cells','0');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-xg-goal-cells','0');
  expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('mobile controls, explicit 1v1 and timeline edits keep analysis current',async({page})=>{
  await page.setViewportSize({width:390,height:844});await load(page);
  await page.getByRole('button',{name:'xGヒートマップ',exact:true}).click();
  await page.getByRole('button',{name:'シュートコース',exact:true}).click();await settled(page);
  await page.getByLabel('1対1を仮定',{exact:true}).check();await settled(page);
  await expect(page.getByTestId('xg-readout')).toContainText('近距離・1対1');
  expect(await page.getByTestId('xg-heatmap').locator('rect').count()).toBeLessThan(884);
  await page.getByTestId('play-button').click();
  await expect.poll(()=>page.getByTestId('xg-freshness').textContent()).not.toContain('解析時刻 0.00 s');
  await page.getByTestId('play-button').click();await settled(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/xg-mobile.png',fullPage:true});
});

test('model fetch failure is explicit and retry recovers without heuristic xG',async({page})=>{
  await page.route('**/models/adamsaidane/*.json',route=>route.fulfill({status:503,body:'test unavailable'}));
  await load(page);await page.getByRole('button',{name:'学習済みxG',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('モデルを読み込めません');
  await expect(page.getByTestId('trained-xg-value')).toHaveText('—');
  await page.unroute('**/models/adamsaidane/*.json');await page.getByRole('button',{name:'モデルを再試行',exact:true}).click();await settled(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
