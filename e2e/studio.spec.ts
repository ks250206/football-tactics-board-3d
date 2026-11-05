import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('renders WebGL, changes camera and produces studio screenshots',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('tactics-board')).toBeVisible();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/studio-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'自由',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/orbit.png',fullPage:true});
  await page.getByLabel('ライティング',{exact:true}).selectOption('night');await page.waitForTimeout(800);await page.screenshot({path:'artifacts/night.png',fullPage:true});
  await page.getByRole('button',{name:'一人称',exact:true}).click();await page.getByLabel('描画品質',{exact:true}).selectOption('cinematic');
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await page.waitForTimeout(800);await page.screenshot({path:'artifacts/cinematic.png',fullPage:true});
  expect(errors.filter(e=>!e.includes('favicon.ico'))).toEqual([]);
});

test('edits body and gaze independently, scrubs, auto-keys and undoes',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  const rail=await page.getByTestId('timeline-rail').boundingBox();if(!rail)throw new Error('Missing timeline');
  await page.mouse.click(rail.x+rail.width*.18,rail.y+6);
  const before=await page.getByTestId('head-slider').inputValue();
  await page.getByTestId('body-slider').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('body-slider')).toHaveValue('-179');await expect(page.getByTestId('head-slider')).toHaveValue(before);
  await page.getByTestId('head-slider').focus();await page.keyboard.press('End');await expect(page.getByTestId('head-slider')).toHaveValue('110');
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await expect(page.getByTestId('head-slider')).toHaveValue(before);
  await page.getByTestId('play-button').click();const t=await page.getByTestId('timecode').innerText();await page.waitForTimeout(700);expect(await page.getByTestId('timecode').innerText()).not.toEqual(t);await page.getByTestId('play-button').click();
  await page.waitForTimeout(600);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('touchline.project.v1')!));expect(saved.frames.length).toBeGreaterThan(9);
});

test('drags a player and creates a pass; exports and validates JSON',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  const player=page.getByTestId('player-home-6');const rect=await player.boundingBox();if(!rect)throw new Error('Missing player');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+25,rect.y+rect.height/2+10,{steps:6});await page.mouse.up();
  await page.getByTestId('pass-button').click();await page.getByTestId('player-home-7').click();await expect(page.getByRole('status')).toContainText('パスを追加');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'JSONを書き出す'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('touchline-sequence.json');
  await page.getByTestId('import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});await expect(page.getByRole('status')).toContainText('TOUCHLINE形式');
  await expect(page.getByTestId('tactics-board')).toBeVisible();
});

test('fits a mobile viewport and keeps all editing controls available',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  await expect(page.getByLabel('描画品質',{exact:true})).toHaveValue('low');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);expect(overflow).toBe(false);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/studio-mobile.png',fullPage:true});
});
