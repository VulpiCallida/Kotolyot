const {chromium}=require('C:/Users/Reaper/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});const errors=[];
for(const locale of ['ru','en']){
 const p=await b.newPage({locale});p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8765/');await p.waitForFunction(()=>document.getElementById('loadingScreen').hidden);
 for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[900,600],[800,360],[768,251],[390,844],[320,568]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(60);
  for(const state of ['start','gameOver']){
   await p.evaluate(state=>{gameState=state;if(state==='gameOver')lastRun={characterId:selectedCharacter,score:10};refreshScreen()},state);
   const result=await p.evaluate(()=>{const panel=document.querySelector('.menu-panel').getBoundingClientRect();const c=canvas.getBoundingClientRect();return {top:panel.top,bottom:panel.bottom,width:panel.width,canvasRatio:c.width/c.height,worldRatio:GAME_WIDTH/GAME_HEIGHT,scroll:document.documentElement.scrollHeight>innerHeight}});
   assert.ok(result.top>=-1 && result.bottom<=height+1,JSON.stringify({locale,width,height,state,...result}));
   assert.ok(Math.abs(result.canvasRatio-result.worldRatio)<0.001);assert.equal(result.scroll,false);
  }
 }
 await p.setViewportSize({width:1920,height:1080});await p.evaluate(()=>{gameState='start';refreshScreen()});
 await p.getByRole('button',{name:locale==='ru'?'Играть':'Play',exact:true}).click();
 await p.evaluate(()=>{update(0);pauseFromVisibility()});
 await p.screenshot({path:`work/desktop-${locale}.png`});
 const before=await p.evaluate(()=>JSON.stringify({cat,obstacles,score}));await p.setViewportSize({width:390,height:844});await p.waitForTimeout(70);
 assert.equal(await p.evaluate(()=>JSON.stringify({cat,obstacles,score})),before);
 await p.close();
}
assert.deepEqual(errors,[]);console.log('PASS: RU/EN, 8 viewport sizes, start/game-over, resize preserves run, no JS errors');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
