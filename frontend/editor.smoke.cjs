// Optional browser regression: set PLAYWRIGHT_MODULE_PATH when using a bundled runtime.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');

async function serve(){
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=path.resolve(__dirname,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(__dirname+path.sep)){res.writeHead(403);res.end();return;}
      const content=await fs.readFile(file),type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type});res.end(content);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return server;
}

(async()=>{
  const server=process.env.FLOORPLAN_TEST_URL?null:await serve();let browser;
  try{
    browser=await chromium.launch({headless:true,channel:process.env.FLOORPLAN_BROWSER_CHANNEL||'msedge',args:['--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.FLOORPLAN_TEST_URL||`http://127.0.0.1:${server.address().port}/`);await page.waitForLoadState('networkidle');
    assert.ok(await page.getByRole('button',{name:'新建户型',exact:true}).count());
    const status=()=>page.locator('#status').innerText();
    const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('floorplan-designer-v1')));
    const clickPlan=async(x,z)=>{const p=await page.locator('#plan').evaluate((svg,p)=>{const point=svg.createSVGPoint();point.x=p.x;point.y=p.z;const result=point.matrixTransform(svg.getScreenCTM());return {x:result.x,y:result.y};},{x,z});await page.mouse.click(p.x,p.y);};
    const importDocument=async d=>{await page.locator('#project-file').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('方案已导入'));};
    await page.locator('#new-project').click();
    await page.locator('#wall-length').fill('4000');await clickPlan(100,100);await clickPlan(470,120);
    assert.equal((await state()).plan.walls[0].x2,500);assert.equal((await state()).plan.walls[0].z2,100);
    await page.locator('#wall-length').fill('');await page.locator('#new-project').click();
    for(const [x,z] of [[100,100],[500,100],[500,400],[100,400],[100,100]])await clickPlan(x,z);
    await page.keyboard.press('Escape');assert.equal((await state()).plan.walls.length,4);
    await page.locator('#recognize-rooms').click();let d=await state();assert.equal(d.rooms.length,1);assert.equal(d.autoRooms,true);
    await page.locator('[data-tool="door"]').click();await clickPlan(250,100);assert.equal((await state()).openings.length,1);
    await page.locator('#prop-offset').fill('1700');await page.getByRole('button',{name:'应用修改',exact:true}).click();assert.equal((await state()).openings[0].offset,1700);
    await page.locator('#prop-height').fill('4000');await page.getByRole('button',{name:'应用修改',exact:true}).click();assert.match(await status(),/超过墙高/);assert.equal((await state()).openings[0].height,2100);
    await page.locator('[data-tool="window"]').click();await clickPlan(500,250);assert.equal((await state()).openings.length,2);
    await page.locator('#prop-sillHeight').fill('1200');await page.getByRole('button',{name:'应用修改',exact:true}).click();assert.equal((await state()).openings[1].sillHeight,1200);
    await clickPlan(450,100);await page.locator('#prop-x2').fill('5500');await page.locator('#prop-height').fill('3400');await page.getByRole('button',{name:'应用修改',exact:true}).click();
    d=await state();assert.equal(d.plan.walls[0].x2,550);assert.equal(d.plan.walls[1].x1,550);assert.equal(d.plan.walls[0].height,3400);assert.equal(d.rooms.length,1);
    await page.locator('#undo').click();assert.equal((await state()).plan.walls[0].x2,500);await page.locator('#redo').click();assert.equal((await state()).plan.walls[0].x2,550);
    await clickPlan(450,100);await page.locator('#delete').click();assert.equal((await state()).openings.length,1);assert.equal((await state()).rooms.length,0);
    await page.locator('#undo').click();assert.equal((await state()).openings.length,2);assert.equal((await state()).rooms.length,1);
    await page.locator('button[data-mode="3d"]').click();await page.waitForFunction(()=>document.querySelector('#viewport canvas')?.clientWidth>0);
    assert.ok(await page.locator('#viewport canvas').count());
    const downloadPromise=page.waitForEvent('download');await page.locator('#export-image').click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.png$/);assert.equal(await download.failure(),null);
    if(process.env.FLOORPLAN_SCREENSHOT)await page.screenshot({path:process.env.FLOORPLAN_SCREENSHOT,fullPage:true});
    const saved=await state(),exportPromise=page.waitForEvent('download');await page.locator('#export').click();const exported=await exportPromise;
    const stream=await exported.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()),saved);
    await page.reload();await page.waitForLoadState('networkidle');assert.deepEqual(await state(),saved);assert.match(await status(),/已恢复/);
    await page.locator('#new-project').click();await importDocument(saved);assert.deepEqual(await state(),saved);
    const limited={...saved,measurements:Array.from({length:500},(_,i)=>({id:`limit-${i}`,x1:110,z1:120,x2:120,z2:130}))};
    await importDocument(limited);await page.locator('[data-tool="measure"]').click();await clickPlan(150,150);await clickPlan(200,150);
    assert.match(await status(),/修改未保存/);assert.equal((await state()).measurements.length,500);
    await importDocument(saved);
    // A failed restore cannot silently overwrite the only copy of the original cache.
    await page.evaluate(()=>localStorage.setItem('floorplan-designer-v1','{broken-cache'));await page.reload();await page.waitForLoadState('networkidle');
    assert.match(await status(),/自动保存已暂停/);await page.locator('#new-project').click();assert.equal(await page.evaluate(()=>localStorage.getItem('floorplan-designer-v1')),'{broken-cache');
    const backupPromise=page.waitForEvent('download');await page.locator('#backup-cache').click();const backup=await backupPromise;assert.equal(backup.suggestedFilename(),'原缓存备份.json');assert.equal((await state()).version,1);
    assert.deepEqual(errors,[]);console.log('PASS: drawing, rooms, openings, shared endpoints, validation rollback, undo/redo, wall deletion, 3D PNG, JSON round trip, reload and cache protection');
  }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
