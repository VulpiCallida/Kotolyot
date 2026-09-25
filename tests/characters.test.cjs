// Run with: node --test tests/characters.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

function game(saved = new Map(), { blocked = false, sdk = false, language = 'ru' } = {}) {
  const pendingImages = [], sdkCalls = [], noop = () => {};
  let resolveSDK;
  const sdkListeners = new Map();
  let sdkWasPlaying = false;
  const context2d = new Proxy({}, { get: (t, k) => t[k] || noop, set: (t, k, v) => (t[k] = v, true) });
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; }
    append(child) { this.children.push(child); }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    setAttribute(k, v) { this.attributes[k] = v; }
    querySelector(selector) { return this.children.find(c => c.className === selector.slice(1)); }
    getContext() { return context2d; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 640 }; }
    focus() {}
  }
  const nodes = new Map();
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    document: { getElementById: get, createElement: () => new Element(), querySelector: () => new Element(), querySelectorAll: () => get('heroPicker').children, body: new Element(), documentElement: {}, addEventListener: noop },
    window: { addEventListener: noop }, navigator: { language }, location: { href: 'test' },
    localStorage: { getItem: k => { if (blocked) throw Error('blocked'); return saved.get(k) ?? null; }, setItem: (k, v) => { if (blocked) throw Error('blocked'); saved.set(k, v); } },
    performance: { now: () => 1000 }, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    Audio: class {
      constructor(src) { this.src=src; this.paused=true; this.currentTime=0; this.playCalls=0; }
      play() { this.paused=false; this.playCalls++; return Promise.resolve(); }
      pause() { this.paused=true; }
    },
    Image: class { constructor() { pendingImages.push(this); this.complete = true; this.naturalWidth = 100; } }
  };
  if (sdk) sandbox.YaGames = { init: () => new Promise(resolve => { resolveSDK = () => resolve({ on: (name, callback) => sdkListeners.set(name, callback), features: { LoadingAPI: { ready: () => sdkCalls.push('ready') }, GameplayAPI: { start: () => sdkCalls.push('start'), stop: () => sdkCalls.push('stop') } } }); }) };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const run = code => vm.runInContext(code, sandbox);
  return { run, saved, get, sdkCalls, platform: event => {
    if (event === 'game_api_pause') {
      sdkWasPlaying = run('isGameplayStarted');
      if (sdkWasPlaying) sdkCalls.push('stop');
    } else if (sdkWasPlaying) { sdkCalls.push('start'); sdkWasPlaying = false; }
    assert.ok(sdkListeners.has(event), 'SDK handler must be registered');
    sdkListeners.get(event)();
  }, resolveSDK: () => resolveSDK(), load: () => pendingImages.forEach(i => i.onload()), json: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}

function earn(g, points) {
  // Pass real obstacle scoring checks without depending on frame scheduling.
  for (let i = 0; i < points; i++) g.run('cat.y = 200; cat.velocityY = 0; obstacles = [{x:-40,topHeight:90,bottomY:450,passed:false}]; update(0)');
}

test('every hero asset exists and pose/theme selection is independent', () => {
  const g = game(); g.load();
  for (const [id, assets] of Object.entries(g.json('ASSETS'))) {
    for (const src of Object.values(assets)) assert.ok(fs.existsSync(path.join(root, src)), src);
    g.run(`selectCharacter('${id}')`);
    assert.equal(g.run('images.catIdle.src'), assets.catIdle);
    assert.equal(g.run('images.background.src'), assets.background);
    assert.equal(g.run('images.obstacleTop.src'), assets.obstacleTop);
  }
});

test('old scores migrate only to Valencia and do not overwrite an existing hero record', () => {
  for (const oldKey of ['kotolyotBestScore', 'flappyCatBestScore']) {
    const saved = new Map([[oldKey, '17']]);
    const g = game(saved);
    assert.deepEqual(g.json('bestScores'), {valencia:17,musia:0,nyusia:0});
    assert.equal(saved.get('kotolyot:valencia:best'), '17');
    saved.set('kotolyot:valencia:best', '24');
    assert.equal(game(saved).run('bestScores.valencia'), 24);
  }
});

test('score and last result survive switching and reload, without contaminating other heroes', () => {
  const g = game(); g.load();
  for (const [id, points] of [['valencia',2],['musia',4],['nyusia',3]]) {
    g.run(`selectCharacter('${id}'); resetGame()`); earn(g, points); g.run('endGame()');
  }
  assert.deepEqual(g.json('bestScores'), {valencia:2,musia:4,nyusia:3});
  assert.deepEqual(g.json('lastScores'), {valencia:2,musia:4,nyusia:3});
  g.run("selectCharacter('musia'); resetGame()"); earn(g,1); g.run('endGame()');
  assert.equal(g.run('bestScore'),4);
  const again = game(g.saved); again.load();
  assert.equal(again.run('selectedCharacter'),'musia');
  assert.deepEqual(again.json('bestScores'),{valencia:2,musia:4,nyusia:3});
  assert.deepEqual(again.json('lastScores'),{valencia:2,musia:1,nyusia:3});
});

test('selection cannot change a running or paused game; result keeps the original hero', () => {
  const g = game(); g.load(); g.run("selectCharacter('musia'); resetGame(); selectCharacter('nyusia')");
  assert.equal(g.run('selectedCharacter'),'musia');
  g.run("pauseFromVisibility(); selectCharacter('nyusia')");
  assert.equal(g.run('selectedCharacter'),'musia');
  g.run('resumeFromPause()'); earn(g,3); g.run("endGame(); selectCharacter('nyusia')");
  assert.deepEqual(g.json('lastRun'),{characterId:'musia',score:3});
  assert.equal(g.get('runResult').textContent,'Муся · Счёт: 3');
  assert.equal(g.run('bestScore'),0);
});

test('all heroes have identical physics and difficulty', () => {
  const states=[];
  for (const id of ['valencia','musia','nyusia']) {
    const g=game();g.load();g.run(`selectCharacter('${id}'); resetGame(); Math.random=()=>0.5`);
    for(let i=0;i<30;i++) g.run('update(16.67)');
    states.push(g.json('({cat,obstacles,score,gameState,difficulty:getDifficultyForScore(10)})'));
  }
  assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);
});

test('unavailable storage and invalid saved values do not block the game', () => {
  const g=game(new Map(),{blocked:true});g.load();g.run("selectCharacter('nyusia'); resetGame()");earn(g,2);g.run('endGame()');
  assert.equal(g.run('bestScores.nyusia'),2);
  const corrupt=game(new Map([['kotolyotSelectedCharacter','unknown'],['kotolyot:musia:best','Infinity'],['kotolyot:nyusia:best','-5']]));
  assert.equal(corrupt.run('selectedCharacter'),'valencia');assert.equal(corrupt.run('bestScores.musia'),0);assert.equal(corrupt.run('bestScores.nyusia'),0);
});

test('English menu labels and native card clicks work', () => {
  const g=game(new Map(),{language:'en'});g.load();
  const card=g.get('heroPicker').children[2];card.listeners.click();
  assert.equal(card.querySelector('.hero-name').textContent,'Nyusia');
  assert.equal(card.attributes['aria-pressed'],'true');
  assert.equal(g.get('heroLabel').textContent,'Choose your hero');
  g.get('playButton').listeners.click();assert.equal(g.run('gameState'),'playing');assert.equal(g.get('characterMenu').hidden,true);
});

test('delayed SDK still receives ready and start exactly once', async () => {
  const g=game(new Map(),{sdk:true});g.load();g.run("selectCharacter('musia');resetGame()");g.resolveSDK();await new Promise(setImmediate);
  assert.deepEqual(g.sdkCalls,['ready','start']);g.run('pauseFromVisibility();resumeFromPause();endGame()');assert.deepEqual(g.sdkCalls,['ready','start','stop','start','stop']);
});

test('Musia body collides at the visible obstacle edge and fits a clear gap', () => {
  const g=game();g.load();g.run("selectCharacter('musia');resetGame();cat.y=200");
  // Body is x=89..159, y=200..288; obstacle padding is 15.
  assert.equal(g.run('isCollidingWithObstacle({x:143,topHeight:213,bottomY:450})'),true);
  assert.equal(g.run('isCollidingWithObstacle({x:144,topHeight:213,bottomY:450})'),false);
  assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:199,bottomY:289})'),false);
  assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:199,bottomY:287})'),true);
  // Valencia uses exactly the same collision bounds.
  g.run("endGame();selectCharacter('valencia');resetGame();cat.y=200");
  assert.equal(g.run('isCollidingWithObstacle({x:143,topHeight:213,bottomY:450})'),true);
});

test('Nyusia matches Musia collision bounds and retains them across poses', () => {
  const g=game();g.load();g.run("selectCharacter('nyusia');resetGame();cat.y=200");
  for(const velocity of [0,-8.5,4]) {
    g.run(`cat.velocityY=${velocity}`);
    assert.equal(g.run('isCollidingWithObstacle({x:143,topHeight:213,bottomY:450})'),true);
    assert.equal(g.run('isCollidingWithObstacle({x:144,topHeight:213,bottomY:450})'),false);
    assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:199,bottomY:289})'),false);
    assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:199,bottomY:287})'),true);
  }
  for(const [pose,crop] of Object.entries(g.json('CHARACTER_POSE_CROPS.nyusia'))) {
    const data=fs.readFileSync(path.join(root,g.run(`ASSETS.nyusia.${pose}`)));
    assert.ok(crop.x>=0 && crop.y>=0);
    assert.ok(crop.x+crop.width<=data.readUInt32BE(16));
    assert.ok(crop.y+crop.height<=data.readUInt32BE(20));
  }
});

test('only the defeated hero sleeps in the result menu, independent of next selection', () => {
  const g=game();g.load();
  const portraits=()=>g.get('heroPicker').children.map(card=>card.querySelector('.hero-portrait').src);
  assert.ok(portraits().every(src=>src.includes('_idle_')));
  for(const id of ['valencia','musia','nyusia']) {
    g.run(`selectCharacter('${id}');resetGame();endGame()`);
    g.run(`selectCharacter('${id==='valencia'?'musia':'valencia'}')`);
    for(const card of g.get('heroPicker').children) {
      const pose=card.dataset.hero===id?'sleep':'idle';
      assert.ok(card.querySelector('.hero-portrait').src.endsWith(`_${pose}_transparent.png`));
    }
  }
  g.run('gameState="start";refreshScreen()');
  assert.ok(portraits().every(src=>src.includes('_idle_')));
});

test('platform ad freezes play and blocks restart/input until resume', async () => {
  const g=game(new Map(),{sdk:true});g.load();g.resolveSDK();await new Promise(setImmediate);
  g.run('resetGame()');earn(g,2);
  const before=g.json('({cat,score,obstacles,obstacleElapsedTime})');
  g.platform('game_api_pause');
  g.run('jump();resetGame();resumeFromPause();update(1000)');
  assert.deepEqual(g.json('({cat,score,obstacles,obstacleElapsedTime})'),before);
  assert.equal(g.run('isActiveGameplay()'),false);
  g.platform('game_api_resume');
  assert.equal(g.run('isActiveGameplay()'),true);
  assert.equal(g.run('lastFrameTime'),0);
  assert.deepEqual(g.sdkCalls,['ready','start','stop','start']);
});

test('startup ad cannot start a game behind the overlay', async () => {
  const g=game(new Map(),{sdk:true});g.resolveSDK();await new Promise(setImmediate);
  g.platform('game_api_pause');g.load();g.run('jump();resetGame()');
  assert.equal(g.run('gameState'),'start');
  assert.equal(g.get('playButton').disabled,true);
  g.platform('game_api_resume');
  assert.equal(g.run('gameState'),'start');
  assert.equal(g.get('playButton').disabled,false);
  assert.deepEqual(g.sdkCalls,['ready']);
});

test('ad closing preserves visibility pause and does not restart a finished run', async () => {
  const g=game(new Map(),{sdk:true});g.load();g.resolveSDK();await new Promise(setImmediate);
  g.run('resetGame()');g.platform('game_api_pause');g.run('document.hidden=true;pauseFromVisibility()');
  g.platform('game_api_resume');assert.equal(g.run('isActiveGameplay()'),false);
  g.run('resumeFromPause()');assert.equal(g.run('isActiveGameplay()'),false);
  g.run('document.hidden=false;resumeFromPause()');assert.equal(g.run('isActiveGameplay()'),true);
  g.run('endGame()');g.platform('game_api_pause');g.platform('game_api_resume');
  assert.equal(g.run('gameState'),'gameOver');assert.equal(g.run('isGameplayStarted'),false);
});


test('all heroes detect ear overlap and retain a forgiving clear corridor', () => {
  for (const id of ['valencia','musia','nyusia']) {
    for (const velocity of [-8.5,0,4]) {
      const g=game();g.load();g.run(`selectCharacter('${id}');resetGame();cat.y=200;cat.velocityY=${velocity}`);
      assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:201,bottomY:450})'),true);
      assert.equal(g.run('isCollidingWithObstacle({x:100,topHeight:199,bottomY:289})'),false);
      g.run('obstacles=[{x:100,topHeight:201,bottomY:450,passed:false}];obstacleElapsedTime=0;update(0)');
      assert.equal(g.run('gameState'),'gameOver');
      for (const score of [0,30,100]) {
        const gap=g.run(`getDifficultyForScore(${score}).gap`);
        assert.ok(gap-88>=131,'minimum vertical clearance must remain forgiving');
      }
    }
  }
});


test('restart ads wait 180 seconds and repeated input cannot request another ad', () => {
  const g=game();g.load();
  g.run('globalThis.adCalls=0;globalThis.now=1000;performance.now=()=>now;ysdk={adv:{showFullscreenAdv:({callbacks})=>{adCalls++;globalThis.adCallbacks=callbacks}}};requestGameStart();endGame();now=180999;requestGameStart()');
  assert.equal(g.run('adCalls'),0);
  g.run('endGame();now=181000;requestGameStart();requestGameStart();jump();resetGame();selectCharacter("musia")');
  assert.equal(g.run('adCalls'),1);
  assert.equal(g.run('gameState'),'gameOver');
  assert.equal(g.run('selectedCharacter'),'valencia');
  assert.equal(g.get('playButton').disabled,true);
  g.run('now=190000;adCallbacks.onClose(true)');
  assert.equal(g.run('gameState'),'playing');
  g.run('endGame();now=369999;requestGameStart()');
  assert.equal(g.run('adCalls'),1);
  g.run('endGame();now=370000;requestGameStart()');
  assert.equal(g.run('adCalls'),2);
});

test('ad close and platform resume work in either order, including hidden tabs and failures', () => {
  for(const closeFirst of [true,false]) {
    const g=game();g.load();
    g.run('performance.now=()=>200000;ysdk={adv:{showFullscreenAdv:({callbacks})=>{globalThis.adCallbacks=callbacks;pauseFromPlatform()}}};resetGame();endGame();requestGameStart()');
    if(closeFirst) {
      g.run('adCallbacks.onClose(true)');assert.equal(g.run('gameState'),'gameOver');g.run('resumeFromPlatform()');
    } else {
      g.run('resumeFromPlatform()');assert.equal(g.run('gameState'),'gameOver');g.run('adCallbacks.onClose(true)');
    }
    assert.equal(g.run('gameState'),'playing');
    g.run('score=7;adCallbacks.onClose(true);adCallbacks.onError({})');assert.equal(g.run('score'),7);
  }
  for(const mode of ['error','throw','unavailable','not-shown']) {
    const g=game();g.load();
    g.run('performance.now=()=>200000;resetGame();endGame()');
    if(mode==='throw') g.run('ysdk={adv:{showFullscreenAdv:()=>{throw Error("offline")}}}');
    else if(mode!=='unavailable') g.run('ysdk={adv:{showFullscreenAdv:({callbacks})=>{globalThis.adCallbacks=callbacks}}}');
    g.run('document.hidden=true;requestGameStart()');
    if(mode==='error') g.run('adCallbacks.onError({})');
    if(mode==='not-shown') g.run('adCallbacks.onClose(false)');
    assert.equal(g.run('gameState'),'playing');
    assert.equal(g.run('isActiveGameplay()'),false);
    assert.equal(g.run('pendingAd'),null);
  }
});


test('room backgrounds retain aspect ratio and start at the requested source positions', () => {
  const g=game();
  for (const [id,start] of [['valencia',0],['musia',0.25],['nyusia',0.5]]) {
    const data=fs.readFileSync(path.join(root,g.run(`ASSETS.${id}.background`)));
    const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
    const crop=g.json(`getBackgroundCrop('${id}',${width},${height})`);
    assert.equal(crop.x,width*start);
    assert.ok(Math.abs(crop.width/crop.height-420/640)<1e-10);
    assert.ok(crop.x+crop.width<=width);
    assert.equal(crop.y,0);
    assert.equal(crop.height,height);
  }
});


test('music plays in menus and flight, restarts for a run and pauses for ads', () => {
  const g=game();g.load();
  assert.ok(fs.existsSync(path.join(root,g.run('gameMusic.src'))));
  assert.equal(g.run('gameMusic.playCalls'),1);
  g.run('resetGame()');assert.equal(g.run('gameMusic.paused'),false);
  g.run('gameMusic.currentTime=12;pauseFromVisibility()');assert.equal(g.run('gameMusic.paused'),true);
  g.run('resumeFromPause()');assert.equal(g.run('gameMusic.paused'),false);assert.equal(g.run('gameMusic.currentTime'),12);
  g.run('pauseFromPlatform();jump()');assert.equal(g.run('gameMusic.paused'),true);
  g.run('resumeFromPlatform()');assert.equal(g.run('gameMusic.paused'),false);
  g.run('endGame();selectCharacter("nyusia")');assert.equal(g.run('gameMusic.paused'),false);
  g.run('resetGame()');assert.equal(g.run('gameMusic.currentTime'),0);
  g.run('document.hidden=true;pauseFromVisibility();resumeFromPause()');assert.equal(g.run('gameMusic.paused'),true);
});

test('blocked audio playback does not prevent play and retries on the next jump', async () => {
  const g=game();g.load();
  g.run('musicRequested=false;gameMusic.play=()=>Promise.reject(Error("autoplay"));resetGame()');
  await new Promise(setImmediate);
  assert.equal(g.run('gameState'),'playing');assert.equal(g.run('musicRequested'),false);
  g.run('gameMusic.play=()=>{gameMusic.paused=false;return Promise.resolve()};jump()');
  assert.equal(g.run('gameMusic.paused'),false);
});

test('menu sound preference persists and stays muted across pause and restart', () => {
  const g = game(); g.load();
  assert.equal(g.get('soundButton').textContent, 'Звук: вкл.');
  g.get('soundButton').listeners.click();
  assert.equal(g.get('soundButton').attributes['aria-pressed'], 'false');
  g.run('resetGame(); pauseFromPlatform(); resumeFromPlatform(); endGame(); resetGame()');
  assert.equal(g.run('gameMusic.paused'), true);
  const again = game(g.saved, {language: 'en'}); again.load();
  assert.equal(again.get('soundButton').textContent, 'Sound: off');
  again.get('soundButton').listeners.click();
  assert.equal(again.run('gameMusic.paused'), false);
  again.run('resetGame()');
  assert.equal(again.run('gameMusic.paused'), false);
  const blocked = game(new Map(), {blocked: true}); blocked.load();
  blocked.get('soundButton').listeners.click();
  blocked.run('resetGame()');
  assert.equal(blocked.run('gameMusic.paused'), true);
});

test('wide and portrait fields share physics, first obstacle and obstacle stream', () => {
  const phone = game(), desktop = game(); phone.load(); desktop.load();
  desktop.run('GAME_WIDTH = WORLD_WIDTH');
  for (const g of [phone, desktop]) {
    g.run('Math.random = () => 0.5; resetGame(); update(0)');
    assert.equal(g.run('obstacles[0].x'), 420);
    for (let i = 0; i < 300; i++) g.run('cat.y = 260; cat.velocityY = 0; update(16.67)');
  }
  assert.deepEqual(desktop.json('obstacles'), phone.json('obstacles'));
  assert.equal(desktop.run('score'), phone.run('score'));
  assert.equal(desktop.run('cat.y'), phone.run('cat.y'));
  assert.equal(desktop.run('gameState'), 'playing');
  const before = desktop.json('({cat, obstacles, score})');
  desktop.run('GAME_WIDTH = PORTRAIT_WIDTH; refreshScreen()');
  assert.deepEqual(desktop.json('({cat, obstacles, score})'), before);
});

test('wide backgrounds use the complete source without stretching for all heroes', () => {
  const g = game(); g.load(); g.run('GAME_WIDTH = WORLD_WIDTH');
  for (const id of ['valencia', 'musia', 'nyusia']) {
    const c = g.json(`getBackgroundCrop('${id}',1672,941)`);
    assert.ok(Math.abs(c.width/c.height-16/9)<1e-10);
    assert.ok(c.width > 1670 && c.height > 940);
    assert.ok(c.x >= 0 && c.y >= 0);
  }
});

test('game over keeps the lost hero scene until the selected next hero starts', () => {
  const g = game(); g.load();
  for (const lost of ['valencia', 'musia', 'nyusia']) {
    g.run(`gameState='start'; selectCharacter('${lost}'); resetGame()`);
    earn(g, 3); g.run('endGame()');
    for (const next of ['valencia', 'musia', 'nyusia']) {
      g.run(`selectCharacter('${next}')`);
      assert.equal(g.run('selectedCharacter'), next);
      assert.equal(g.run('sceneCharacterId()'), lost);
      assert.equal(g.run('lastRun.score'), 3);
    }
    g.run('resetGame()');
    assert.equal(g.run('sceneCharacterId()'), 'nyusia');
    assert.equal(g.run('score'), 0);
  }
});

test('desktop camera places every cat at 40 percent without changing collision distances', () => {
  const g = game(); g.load();
  for (const id of ['valencia','musia','nyusia']) {
    g.run(`gameState='start';selectCharacter('${id}');GAME_WIDTH=WORLD_WIDTH;resetGame();update(0)`);
    assert.ok(Math.abs(g.run('(cat.x+cat.width/2+getFlightOffset())/GAME_WIDTH')-0.4)<1e-10);
    assert.equal(g.run('obstacles[0].x-cat.x'),340);
    const before=g.json('({cat,obstacles})');
    g.run('GAME_WIDTH=PORTRAIT_WIDTH;refreshScreen()');
    assert.equal(g.run('getFlightOffset()'),0);
    assert.deepEqual(g.json('({cat,obstacles})'),before);
  }
});
