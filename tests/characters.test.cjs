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
