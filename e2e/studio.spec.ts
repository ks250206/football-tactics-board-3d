import { popover } from './ui';
import { test, expect } from '@playwright/test';
import { mkdir, stat } from 'node:fs/promises';

test('renders WebGL, changes camera and produces studio screenshots',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('tactics-board')).toBeVisible();
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/studio-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'自由',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/orbit.png',fullPage:true});
  await popover(page,'カメラ設定');
  await page.getByLabel('ライティング',{exact:true}).selectOption('night');await page.waitForTimeout(800);await page.screenshot({path:'artifacts/night.png',fullPage:true});
  await page.getByRole('button',{name:'一人称',exact:true}).click();await popover(page,'カメラ設定');await page.getByLabel('描画品質',{exact:true}).selectOption('cinematic');await popover(page,'カメラ設定',false);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');await page.waitForTimeout(800);await page.screenshot({path:'artifacts/cinematic.png',fullPage:true});
  expect(errors.filter(e=>!e.includes('favicon.ico'))).toEqual([]);
});

test('edits body and gaze independently, scrubs, auto-keys and undoes',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  // This test exercises authored body/neck independence rather than automatic ball gaze.
  await popover(page,'カメラ設定');await page.getByRole('button',{name:'ボールを自動で見る',exact:true}).click();await popover(page,'カメラ設定',false);
  await page.getByTestId('timeline-rail').scrollIntoViewIfNeeded();
  const rail=await page.getByTestId('timeline-rail').boundingBox();if(!rail)throw new Error('Missing timeline');
  await page.mouse.click(rail.x+rail.width*.18,rail.y+6);
  const before=await page.getByTestId('head-slider').inputValue();
  await page.getByTestId('scene-canvas').evaluate(el=>el.setAttribute('data-test-identity','same-renderer'));
  await page.getByTestId('body-slider').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('body-slider')).toHaveValue('-179');await expect(page.getByTestId('head-slider')).toHaveValue(before);
  await page.getByTestId('head-slider').focus();await page.keyboard.press('End');await expect(page.getByTestId('head-slider')).toHaveValue('110');
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();await expect(page.getByTestId('head-slider')).toHaveValue(before);
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-test-identity','same-renderer');
  const t=await page.getByTestId('timecode').innerText();await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-button')).toHaveAttribute('aria-label','一時停止');
  await expect.poll(()=>page.getByTestId('timecode').innerText(),{timeout:10000}).not.toEqual(t);
  await page.getByTestId('play-button').click();
  await page.waitForTimeout(600);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('touchline.project.v1')!));expect(saved.frames.length).toBeGreaterThan(9);
});

test('drags a player, authors a pass and exports JSON, PNG and video',async({page})=>{
  await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  const player=page.getByTestId('player-home-6');await player.scrollIntoViewIfNeeded();const rect=await player.boundingBox();if(!rect)throw new Error('Missing player');
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+25,rect.y+rect.height/2+10,{steps:6});await page.mouse.up();
  await page.getByTestId('pass-button').click();await page.getByTestId('player-home-7').click();await expect(page.getByRole('status')).toContainText('パスを追加');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'JSONを書き出す'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('touchline-sequence.json');
  await page.getByTestId('import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});await expect(page.getByRole('status')).toContainText('TOUCHLINE形式');
  await expect(page.getByTestId('tactics-board')).toBeVisible();
  await popover(page,'映像出力');
  const pngPromise=page.waitForEvent('download');await page.getByRole('button',{name:'3D映像をPNG保存',exact:true}).click();
  const png=await pngPromise;expect(png.suggestedFilename()).toMatch(/\.png$/);expect((await stat((await png.path())!)).size).toBeGreaterThan(1000);
  // Observe from before recording starts; verify automatic end-of-sequence export.
  const moviePromise=page.waitForEvent('download',{timeout:60000});
  await page.getByRole('button',{name:'最初から3D映像を録画',exact:true}).click();
  await expect(page.locator('.recording-banner')).toBeVisible();
  const movie=await moviePromise;
  expect(movie.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  expect((await stat((await movie.path())!)).size).toBeGreaterThan(1000);
  await expect(page.locator('.recording-banner')).toHaveCount(0);
});

test('fits a mobile viewport and keeps all editing controls available',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByTestId('scene-canvas')).toHaveAttribute('data-ready','true');
  await page.getByLabel('モバイル表示').getByRole('button',{name:'3D',exact:true}).click();await popover(page,'カメラ設定');
  await expect(page.getByLabel('描画品質',{exact:true})).toHaveValue('low');await popover(page,'カメラ設定',false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);expect(overflow).toBe(false);
  await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/studio-mobile.png',fullPage:true});
});
