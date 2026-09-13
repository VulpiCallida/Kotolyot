const GAME_WIDTH = 420;
const GAME_HEIGHT = 640;
const DEFAULT_LANGUAGE = "en";
const RUSSIAN_FALLBACK_LANGUAGES = ["ru", "be", "kk", "uk", "uz"];

const TEXTS = {
  ru: {
    htmlLang: "ru",
    pageTitle: "Котолёт",
    gameTitle: "Котолёт",
    loading: "Загрузка...",
    best: "Рекорд",
    score: "Счёт",
    startLine1: "Помоги котику пролететь",
    startLine2: "между препятствиями",
    chooseHero: "Выбери героя",
    lastScore: "Последний счёт",
    startButton: "Играть",
    controlsHint: "Клик / Тап / Пробел",
    pauseTitle: "Пауза",
    pauseLine: "Игра приостановлена",
    continueButton: "Продолжить",
    gameOverTitle: "Котик устал",
    gameOverLine1: "Немного отдохнёт",
    gameOverLine2: "и полетит дальше",
    gameOverButton: "Играть ещё"
  },

  en: {
    htmlLang: "en",
    pageTitle: "Cat Flight",
    gameTitle: "Cat Flight",
    loading: "Loading...",
    best: "Best",
    score: "Score",
    startLine1: "Help the kitty fly",
    startLine2: "between obstacles",
    chooseHero: "Choose your hero",
    lastScore: "Last score",
    startButton: "Play",
    controlsHint: "Tap / Click / Space",
    pauseTitle: "Paused",
    pauseLine: "Game paused",
    continueButton: "Continue",
    gameOverTitle: "Kitty needs a break",
    gameOverLine1: "After a little rest,",
    gameOverLine2: "kitty will fly again",
    gameOverButton: "Play Again"
  }
};

function detectLanguageFromSources({ sdkLanguage, browserLanguage } = {}) {
  const rawLanguage = sdkLanguage || browserLanguage;

  if (!rawLanguage) {
    return DEFAULT_LANGUAGE;
  }

  const languageCode = rawLanguage.toLowerCase().split("-")[0];

  if (RUSSIAN_FALLBACK_LANGUAGES.includes(languageCode)) {
    return "ru";
  }

  if (languageCode === "en") {
    return "en";
  }

  return DEFAULT_LANGUAGE;
}

function getTextForLanguage(languageCode) {
  return TEXTS[languageCode] ?? TEXTS.en;
}

function randomBetween(min, max, random = Math.random) {
  if (max < min) {
    return min;
  }

  return Math.floor(random() * (max - min + 1)) + min;
}

function getObstacleTopHeightRange({
  gameHeight = GAME_HEIGHT,
  groundHeight = 78,
  gap = 225,
  minTopHeight = 90,
  maxTopOffset = 130
} = {}) {
  const maxTopHeight = gameHeight - groundHeight - gap - maxTopOffset;

  return {
    min: minTopHeight,
    max: Math.max(minTopHeight, maxTopHeight)
  };
}

function checkObstacleCollision(
  cat,
  obstacle,
  {
    obstacleWidth = 115,
    hitboxPaddingX = 9,
    hitboxPaddingY = 0,
    obstaclePaddingX = 15
  } = {}
) {
  const catLeft = cat.x + hitboxPaddingX;
  const catRight = cat.x + cat.width - hitboxPaddingX;
  const catTop = cat.y + hitboxPaddingY;
  const catBottom = cat.y + cat.height - hitboxPaddingY;

  const obstacleLeft = obstacle.x + obstaclePaddingX;
  const obstacleRight = obstacle.x + obstacleWidth - obstaclePaddingX;

  const hitsX = catRight > obstacleLeft && catLeft < obstacleRight;
  const hitsTopObstacle = catTop < obstacle.topHeight;
  const hitsBottomObstacle = catBottom > obstacle.bottomY;

  return hitsX && (hitsTopObstacle || hitsBottomObstacle);
}

// Прогрессия сложности: скорость и частота препятствий растут вместе со счётом,
// но всегда ограничены потолком/полом, чтобы игра не стала невозможной.
const DIFFICULTY_CONFIG = {
  baseSpeed: 2.85,
  maxSpeed: 4.5,
  speedStep: 0.05, // +0.05 px/кадр за каждое очко

  baseSpawnInterval: 1550,
  minSpawnInterval: 1150, // не чаще, чем раз в 1150мс
  spawnIntervalStep: 15, // -15мс за каждое очко

  baseGap: 249,
  minGap: 219, // +24px preserves clearance after increasing collision height from 64 to 88.
  gapStep: 1 // -1px за каждое очко
};

function getDifficultyForScore(currentScore, config = DIFFICULTY_CONFIG) {
  return {
    speed: Math.min(config.maxSpeed, config.baseSpeed + currentScore * config.speedStep),
    spawnInterval: Math.max(
      config.minSpawnInterval,
      config.baseSpawnInterval - currentScore * config.spawnIntervalStep
    ),
    gap: Math.max(config.minGap, config.baseGap - currentScore * config.gapStep)
  };
}

function getMenuPanelLayout(
  gameWidth = GAME_WIDTH,
  panelHeight = 390,
  panelY = 95,
  buttonOffsetY = 195
) {
  const panelWidth = 300;
  const panelX = (gameWidth - panelWidth) / 2;

  return {
    panelX,
    panelY,
    panelWidth,
    panelHeight,
    buttonX: gameWidth / 2 - 100,
    buttonY: panelY + buttonOffsetY,
    buttonWidth: 200,
    buttonHeight: 52
  };
}

function getPausePanelLayout(gameWidth = GAME_WIDTH) {
  return getMenuPanelLayout(gameWidth, 220, 210, 140);
}

function mapCanvasPoint(clientX, clientY, rect, gameWidth = GAME_WIDTH, gameHeight = GAME_HEIGHT) {
  const scaleX = gameWidth / rect.width;
  const scaleY = gameHeight / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function buildAccessibilityStatusText({
  gameState,
  isPausedByVisibility,
  text,
  score,
  bestScore
}) {
  if (gameState === "loading") {
    return text.loading;
  }

  if (gameState === "start") {
    return `${text.gameTitle}. ${text.startLine1} ${text.startLine2}. ${text.best}: ${bestScore}.`;
  }

  if (gameState === "playing" && isPausedByVisibility) {
    return `${text.pauseTitle}. ${text.pauseLine}.`;
  }

  if (gameState === "playing") {
    return `${text.score}: ${score}. ${text.best}: ${bestScore}.`;
  }

  if (gameState === "gameOver") {
    return `${text.gameOverTitle}. ${text.score}: ${score}. ${text.best}: ${bestScore}.`;
  }

  return "";
}

function isGameplayActiveState(gameState, isPausedByVisibility) {
  return gameState === "playing" && !isPausedByVisibility;
}

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const MAX_DEVICE_PIXEL_RATIO = 3;

let canvasPixelWidth = 0;
let canvasPixelHeight = 0;

let currentLanguage = DEFAULT_LANGUAGE;
let TEXT = TEXTS.en;

function detectLanguage() {
  return detectLanguageFromSources({
    sdkLanguage: ysdk?.environment?.i18n?.lang,
    browserLanguage: navigator.language || navigator.userLanguage
  });
}

function applyDomLanguageTexts() {
  document.documentElement.lang = TEXT.htmlLang;
  document.title = TEXT.pageTitle;

  const pageTitleElement = document.getElementById("pageTitle");

  if (pageTitleElement) {
    pageTitleElement.textContent = TEXT.pageTitle;
  }
}

function applyLanguageTexts() {
  currentLanguage = detectLanguage();
  TEXT = getTextForLanguage(currentLanguage);

  applyDomLanguageTexts();
  syncAccessibility();
}

function applyLanguage() {
  applyLanguageTexts();
  refreshScreen();
}

function bootstrapLanguage() {
  currentLanguage = detectLanguageFromSources({
    browserLanguage: navigator.language || navigator.userLanguage
  });
  TEXT = getTextForLanguage(currentLanguage);

  applyDomLanguageTexts();
}

function preventNativeUiEvents() {
  const gameRoot = document.querySelector(".page");
  const blockNativeUi = event => {
    event.preventDefault();
  };

  canvas.setAttribute("draggable", "false");

  for (const target of [canvas, gameRoot, document.body]) {
    if (!target) {
      continue;
    }

    target.addEventListener("contextmenu", blockNativeUi);
    target.addEventListener("selectstart", blockNativeUi);
    target.addEventListener("dragstart", blockNativeUi);
  }
}

let ysdk = null;
let isYandexSDKReady = false;
let isGameReadySent = false;
let isGameplayStarted = false;

function setupCanvasResolution() {
  function applyCanvasResolution() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    if (displayWidth <= 0 || displayHeight <= 0) {
      return;
    }

    const pixelWidth = Math.round(displayWidth * dpr);
    const pixelHeight = Math.round(displayHeight * dpr);

    if (pixelWidth === canvasPixelWidth && pixelHeight === canvasPixelHeight) {
      return;
    }

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvasPixelWidth = pixelWidth;
    canvasPixelHeight = pixelHeight;

    ctx.setTransform(
      pixelWidth / GAME_WIDTH,
      0,
      0,
      pixelHeight / GAME_HEIGHT,
      0,
      0
    );
    ctx.imageSmoothingEnabled = true;

    if (!isActiveGameplay()) {
      draw();
    }
  }

  applyCanvasResolution();
  requestAnimationFrame(applyCanvasResolution);

  window.addEventListener("resize", applyCanvasResolution);
  window.visualViewport?.addEventListener("resize", applyCanvasResolution);

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(applyCanvasResolution);
    resizeObserver.observe(canvas);
  }
}

const CHARACTERS = {
  valencia: { names: { ru: "Валенсия", en: "Valencia" }, obstacle: "valencia_scratcher", flipTop: false },
  musia: { names: { ru: "Муся", en: "Musia" }, obstacle: "musia_kitchenshelf", flipTop: true },
  nyusia: { names: { ru: "Нюся", en: "Nyusia" }, obstacle: "nyusia_bookshelf", flipTop: true }
};
const CHARACTER_IDS = Object.keys(CHARACTERS);
const SELECTED_CHARACTER_KEY = "kotolyotSelectedCharacter";
let selectedCharacter = "valencia";
try {
  const saved = localStorage.getItem(SELECTED_CHARACTER_KEY);
  if (CHARACTER_IDS.includes(saved)) selectedCharacter = saved;
} catch (error) {
  console.warn("Не удалось прочитать выбранного героя:", error);
}

const ASSETS = Object.fromEntries(CHARACTER_IDS.map(id => [id, {
  background: `assets/background/${id}_room.png`,
  ground: `assets/background/${id}_ground.png`,
  ...Object.fromEntries(["Idle", "Jump", "Fall", "Sleep", "Reach"].map(pose => [
    `cat${pose}`, `assets/cats/${id}_${pose.toLowerCase()}_transparent.png`
  ])),
  obstacleTop: `assets/obstacles/${CHARACTERS[id].obstacle}${id === "valencia" ? "_top" : ""}.png`,
  obstacleBottom: `assets/obstacles/${CHARACTERS[id].obstacle}${id === "valencia" ? "_bottom" : ""}.png`
}]));
const characterImages = Object.fromEntries(CHARACTER_IDS.map(id => [id, {}]));
let images = characterImages[selectedCharacter];
let lastRun = null;

function characterName(id = selectedCharacter) {
  return CHARACTERS[id].names[currentLanguage] || CHARACTERS[id].names.en;
}

const gravity = 0.47;
const jumpForce = -8.5;

const groundHeight = 78;

const groundSettings = {
  yOffset: 18,
  extraWidth: 34,
  visualHeight: 96,
  coverColor: "#f3d9aa"
};

const cat = {
  x: 80,
  y: 260,
  width: 88,
  height: 88,
  velocityY: 0
};

const obstacleSettings = {
  width: 115,

  renderHeight: 290,
  topInset: 20,
  bottomInset: 28
};

let obstacles = [];
let score = 0;
let gameState = "loading"; // loading | start | playing | gameOver
let isPausedByVisibility = false;
let isPausedByPlatform = false;
let wasGameplayActiveBeforePlatformPause = false;
let obstacleElapsedTime = null;
let lastFrameTime = 0;
let animationFrameId = null;

const BEST_SCORE_KEY = "kotolyotBestScore";
const LEGACY_BEST_SCORE_KEY = "flappyCatBestScore";
const ERROR_LOG_KEY = "kotolyotErrorLog";

function scoreKey(id, kind = "best") {
  return `kotolyot:${id}:${kind}`;
}

function normalizeScore(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function getStoredScore(id, kind = "best") {
  try {
    const stored = localStorage.getItem(scoreKey(id, kind));
    if (stored !== null) return normalizeScore(stored);
    // The original game had only Valencia; migrate its record once.
    if (id === "valencia" && kind === "best") {
      const old = localStorage.getItem(BEST_SCORE_KEY) ?? localStorage.getItem(LEGACY_BEST_SCORE_KEY);
      const value = normalizeScore(old);
      try { localStorage.setItem(scoreKey(id), String(value)); } catch (_) { /* Read-only storage. */ }
      return value;
    }
  } catch (error) {
    console.warn("Не удалось прочитать счёт:", error);
  }
  return 0;
}

const bestScores = Object.fromEntries(CHARACTER_IDS.map(id => [id, getStoredScore(id)]));
const lastScores = Object.fromEntries(CHARACTER_IDS.map(id => [id, getStoredScore(id, "last")]));
let bestScore = bestScores[selectedCharacter];

function saveCharacterScore(id, kind, value) {
  try {
    localStorage.setItem(scoreKey(id, kind), String(value));
  } catch (error) {
    console.warn("Не удалось сохранить счёт:", error);
  }
}

function saveBestScore(value) {
  bestScores[selectedCharacter] = value;
  saveCharacterScore(selectedCharacter, "best", value);
}

function selectCharacter(id) {
  if (!CHARACTER_IDS.includes(id) || !["start", "gameOver"].includes(gameState)) return;
  selectedCharacter = id;
  images = characterImages[id];
  bestScore = bestScores[id];
  try { localStorage.setItem(SELECTED_CHARACTER_KEY, id); } catch (_) { /* Selection still works. */ }
  refreshScreen();
}

function setupCharacterMenu() {
  const picker = document.getElementById("heroPicker");
  for (const id of CHARACTER_IDS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hero-card";
    button.dataset.hero = id;
    const portrait = document.createElement("img");
    portrait.src = ASSETS[id].catIdle;
    portrait.alt = "";
    portrait.className = "hero-portrait";
    portrait.draggable = false;
    button.append(portrait);
    for (const className of ["hero-name", "hero-best", "hero-last"]) {
      const label = document.createElement("span");
      label.className = className;
      button.append(label);
    }
    button.addEventListener("click", () => selectCharacter(id));
    picker.append(button);
  }
  document.getElementById("playButton").addEventListener("click", () => {
    if (!["start", "gameOver"].includes(gameState)) return;
    resetGame();
    canvas.focus({ preventScroll: true });
  });
}

function syncCharacterMenu() {
  const menu = document.getElementById("characterMenu");
  if (!menu) return;
  menu.hidden = !["start", "gameOver"].includes(gameState);
  document.getElementById("playButton").disabled = isPausedByPlatform;
  if (menu.hidden) return;
  const isOver = gameState === "gameOver";
  document.getElementById("menuTitle").textContent = isOver ? TEXT.gameOverTitle : TEXT.gameTitle;
  document.getElementById("menuSubtitle").textContent = isOver
    ? TEXT.gameOverLine1 + " " + TEXT.gameOverLine2
    : TEXT.startLine1 + " " + TEXT.startLine2;
  const result = document.getElementById("runResult");
  result.hidden = !isOver || !lastRun;
  result.textContent = lastRun ? `${characterName(lastRun.characterId)} · ${TEXT.score}: ${lastRun.score}` : "";
  document.getElementById("heroLabel").textContent = TEXT.chooseHero;
  for (const button of document.querySelectorAll(".hero-card")) {
    const id = button.dataset.hero;
    const pose = isOver && lastRun?.characterId === id ? "catSleep" : "catIdle";
    button.querySelector(".hero-portrait").src = ASSETS[id][pose];
    button.setAttribute("aria-pressed", String(id === selectedCharacter));
    button.querySelector(".hero-name").textContent = characterName(id);
    button.querySelector(".hero-best").textContent = `${TEXT.best}: ${bestScores[id]}`;
    button.querySelector(".hero-last").textContent = `${TEXT.lastScore}: ${lastScores[id]}`;
  }
  document.getElementById("playButton").textContent = isOver ? TEXT.gameOverButton : TEXT.startButton;
  document.getElementById("menuHint").textContent = TEXT.controlsHint;
}

function saveErrorLog(errorInfo) {
  try {
    const currentLog = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || "[]");

    currentLog.unshift({
      ...errorInfo,
      date: new Date().toISOString(),
      gameState,
      score,
      bestScore
    });

    const trimmedLog = currentLog.slice(0, 10);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(trimmedLog));
  } catch (error) {
    console.warn("Не удалось сохранить лог ошибки:", error);
  }
}

function trackError(source, error) {
  const message =
    error?.message ||
    error?.reason?.message ||
    String(error?.reason || error || "Unknown error");

  const stack =
    error?.stack ||
    error?.error?.stack ||
    error?.reason?.stack ||
    null;

  const errorInfo = {
    source,
    message,
    stack,
    userAgent: navigator.userAgent,
    url: location.href
  };

  console.error("Game error tracked:", errorInfo);
  saveErrorLog(errorInfo);
}

window.addEventListener("error", event => {
  trackError("window.error", event.error || event.message);
});

window.addEventListener("unhandledrejection", event => {
  trackError("unhandledrejection", event.reason);
});

async function initYandexSDK() {
  if (typeof YaGames === "undefined") {
    console.warn("Yandex Games SDK не найден. Локальный режим без SDK.");
    return;
  }

  try {
    ysdk = await YaGames.init();
    isYandexSDKReady = true;
    ysdk.on?.("game_api_pause", pauseFromPlatform);
    ysdk.on?.("game_api_resume", resumeFromPlatform);
    if (gameState !== "loading") {
      sendGameReady();
      if (isActiveGameplay()) startGameplay();
    }
    console.log("Yandex Games SDK initialized");
  } catch (error) {
    console.warn("Не удалось инициализировать Yandex Games SDK:", error);
  }
}

function sendGameReady() {
  if (isGameReadySent || !ysdk || gameState === "loading") {
    return;
  }

  try {
    ysdk.features.LoadingAPI?.ready();
    isGameReadySent = true;
    console.log("Game Ready sent");
  } catch (error) {
    console.warn("Не удалось отправить LoadingAPI.ready():", error);
  }
}

function startGameplay() {
  if (isGameplayStarted || !ysdk || !isActiveGameplay()) {
    return;
  }

  try {
    ysdk.features.GameplayAPI?.start();
    isGameplayStarted = true;
  } catch (error) {
    console.warn("Не удалось отправить GameplayAPI.start():", error);
  }
}

function stopGameplay() {
  if (!isGameplayStarted) {
    return;
  }

  isGameplayStarted = false;

  if (!ysdk) {
    return;
  }

  try {
    ysdk.features.GameplayAPI?.stop();
  } catch (error) {
    console.warn("Не удалось отправить GameplayAPI.stop():", error);
  }
}

function loadImages() {
  const entries = Object.entries(ASSETS).flatMap(([id, assets]) =>
    Object.entries(assets).map(([key, src]) => ({ id, key, src }))
  );
  let settledCount = 0;
  const failedAssets = [];

  function onAssetSettled(key, src, isSuccess) {
    settledCount += 1;

    if (!isSuccess) {
      failedAssets.push(src);
      console.error(`Не удалось загрузить изображение: ${src}`);
    }

    if (settledCount === entries.length) {
      if (failedAssets.length > 0) {
        console.warn("Игра запущена без части ассетов:", failedAssets);
      }

      gameState = "start";
      sendGameReady();
      refreshScreen();
    }
  }

  entries.forEach(({ id, key, src }) => {
    const image = new Image();

    image.onload = () => {
      onAssetSettled(key, src, true);
    };

    image.onerror = () => {
      onAssetSettled(key, src, false);
    };

    image.src = src;
    characterImages[id][key] = image;
  });
}

function resetGame() {
  if (isPausedByPlatform) return;
  cat.y = 260;
  cat.velocityY = 0;
  obstacles = [];
  score = 0;
  obstacleElapsedTime = null;
  lastFrameTime = 0;
  isPausedByVisibility = false;
  gameState = "playing";
  startGameplay();
  refreshScreen();
}

function isActiveGameplay() {
  return isGameplayActiveState(gameState, isPausedByVisibility || isPausedByPlatform);
}

function scheduleGameLoop() {
  if (animationFrameId !== null) {
    return;
  }

  animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
  if (animationFrameId === null) {
    return;
  }

  cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
}

function refreshScreen() {
  syncAccessibility();
  draw();

  if (isActiveGameplay()) {
    scheduleGameLoop();
  } else {
    stopGameLoop();
  }
}

// SDK events already send GameplayAPI.stop/start. Reconcile our local marker
// without sending duplicate events, and preserve a separate visibility pause.
function pauseFromPlatform() {
  if (isPausedByPlatform) return;
  wasGameplayActiveBeforePlatformPause = isGameplayStarted;
  isPausedByPlatform = true;
  isGameplayStarted = false;
  refreshScreen();
}

function resumeFromPlatform() {
  if (!isPausedByPlatform) return;
  isPausedByPlatform = false;
  isGameplayStarted = wasGameplayActiveBeforePlatformPause;
  wasGameplayActiveBeforePlatformPause = false;
  if (gameState === "playing" && document.hidden) isPausedByVisibility = true;
  lastFrameTime = 0;
  if (isActiveGameplay()) {
    startGameplay();
  } else {
    stopGameplay();
  }
  refreshScreen();
}

function pauseFromVisibility() {
  if (gameState !== "playing" || isPausedByVisibility) {
    return;
  }

  isPausedByVisibility = true;
  stopGameplay();
  refreshScreen();
}

function resumeFromPause() {
  if (isPausedByPlatform || document.hidden) return;
  if (gameState !== "playing" || !isPausedByVisibility) {
    return;
  }

  isPausedByVisibility = false;
  lastFrameTime = 0;
  startGameplay();
  refreshScreen();
}

function isPointInPauseContinueButton(x, y) {
  const layout = getPausePanelLayout(GAME_WIDTH);

  return (
    x >= layout.buttonX &&
    x <= layout.buttonX + layout.buttonWidth &&
    y >= layout.buttonY &&
    y <= layout.buttonY + layout.buttonHeight
  );
}

function getCanvasPoint(clientX, clientY) {
  return mapCanvasPoint(clientX, clientY, canvas.getBoundingClientRect());
}

function handleCanvasInput(clientX, clientY) {
  if (isPausedByPlatform) return;
  if (gameState === "playing" && isPausedByVisibility) {
    const point = getCanvasPoint(clientX, clientY);

    if (isPointInPauseContinueButton(point.x, point.y)) {
      resumeFromPause();
    }

    return;
  }

  jump();
}

function jump() {
  if (isPausedByPlatform) return;
  if (gameState === "loading") {
    return;
  }

  if (gameState === "playing" && isPausedByVisibility) {
    return;
  }

  if (gameState === "start") {
    resetGame();
    return;
  }

  if (gameState === "gameOver") {
    resetGame();
    return;
  }

  if (gameState !== "playing") {
    return;
  }

  cat.velocityY = jumpForce;
}

function spawnObstacle() {
  const difficulty = getDifficultyForScore(score);
  const { min, max } = getObstacleTopHeightRange({ gap: difficulty.gap });
  const topHeight = randomBetween(min, max);

  obstacles.push({
    x: GAME_WIDTH,
    topHeight,
    bottomY: topHeight + difficulty.gap,
    passed: false
  });
}

function update(deltaTime) {
  if (!isActiveGameplay()) {
    return;
  }

  // Movement and spawning share the same capped simulation time.
  const simulationDelta = Math.max(0, Math.min(deltaTime, 33.34));
  const frameFactor = simulationDelta / 16.67;
  const difficulty = getDifficultyForScore(score);

  cat.velocityY += gravity * frameFactor;
  cat.y += cat.velocityY * frameFactor;

  if (obstacleElapsedTime === null) {
    obstacleElapsedTime = 0;
    spawnObstacle();
  }

  obstacleElapsedTime += simulationDelta;
  if (obstacleElapsedTime >= difficulty.spawnInterval) {
    spawnObstacle();
    obstacleElapsedTime -= difficulty.spawnInterval;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= difficulty.speed * frameFactor;

    if (!obstacle.passed && obstacle.x + obstacleSettings.width < cat.x) {
      obstacle.passed = true;
      score += 1;

      if (score > bestScore) {
        bestScore = score;
        saveBestScore(bestScore);
      }

      syncAccessibility();
    }

    if (isCollidingWithObstacle(obstacle)) {
      endGame();
      return;
    }
  }

  obstacles = obstacles.filter(
    obstacle => obstacle.x + obstacleSettings.width > -40
  );

  if (cat.y < -20 || cat.y + cat.height > GAME_HEIGHT - groundHeight + 10) {
    endGame();
  }
}

function isCollidingWithObstacle(obstacle) {
  return checkObstacleCollision(cat, obstacle, {
    obstacleWidth: obstacleSettings.width,
    hitboxPaddingX: 9,
    hitboxPaddingY: 0
  });
}

function endGame() {
  if (gameState !== "playing") {
    return;
  }

  lastRun = { characterId: selectedCharacter, score };
  lastScores[selectedCharacter] = score;
  saveCharacterScore(selectedCharacter, "last", score);
  gameState = "gameOver";
  stopGameplay();
  refreshScreen();
}

function draw() {
  drawBackground();

  if (gameState !== "loading") {
    drawObstacles();
    drawGround();
    drawCat();
    drawScore();
  }

  if (gameState === "loading") {
    drawLoadingScreen();
  }

  if (gameState === "start" || gameState === "gameOver") {
    drawOverlay();
  }

  if (gameState === "playing" && (isPausedByVisibility || isPausedByPlatform)) {
    drawPauseScreen();
  }
}

function drawBackground() {
  if (images.background && images.background.complete && images.background.naturalWidth > 0) {
    const background = images.background;
    if (selectedCharacter === "musia") {
      // Cover the playfield without squeezing the original landscape image.
      const scale = Math.max(GAME_WIDTH / background.naturalWidth, GAME_HEIGHT / background.naturalHeight);
      const width = background.naturalWidth * scale;
      const height = background.naturalHeight * scale;
      ctx.drawImage(background, (GAME_WIDTH - width) / 2, (GAME_HEIGHT - height) / 2, width, height);
    } else {
      ctx.drawImage(background, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  } else {
    ctx.fillStyle = "#f7ead7";
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

// Безопасная обёртка над ctx.drawImage: рисует только полностью загруженные
// изображения. Защищает от InvalidStateError, если ассет не загрузился
// (см. failedAssets в loadImages()), и не даёт краху экрана превратиться
// в необработанное исключение (пункт модерации "нет технических ошибок").
function drawImageSafe(image, ...args) {
  if (image && image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, ...args);
  }
}

// Source rectangles exclude the empty margins in these original PNGs.
// Use the same rug framing at every viewport size, including desktop panels.
const GROUND_CROPS = {
  musia: { x: 0, y: 260, width: 2172, height: 190 },
  nyusia: { x: 0, y: 340, width: 1672, height: 230 }
};

function drawGround() {
  const groundY = GAME_HEIGHT - groundHeight + groundSettings.yOffset;

  // Подложка под ковер, чтобы через прозрачные части не было видно room/когтеточку
  ctx.fillStyle = groundSettings.coverColor;
  ctx.fillRect(0, groundY + 18, GAME_WIDTH, GAME_HEIGHT - groundY);

  const crop = GROUND_CROPS[selectedCharacter];
  if (crop) {
    // Scale by the ground height and center in game coordinates, independent of CSS size.
    const width = Math.max(
      GAME_WIDTH + groundSettings.extraWidth,
      groundSettings.visualHeight * crop.width / crop.height
    );
    drawImageSafe(
      images.ground,
      crop.x, crop.y, crop.width, crop.height,
      (GAME_WIDTH - width) / 2, groundY, width, groundSettings.visualHeight
    );
    return;
  }

  // Valencia: a modest zoom, centered horizontally and anchored at the same bottom.
  const scale = 1.15;
  const width = (GAME_WIDTH + groundSettings.extraWidth) * scale;
  const height = groundSettings.visualHeight * scale;
  drawImageSafe(
    images.ground,
    (GAME_WIDTH - width) / 2,
    groundY + groundSettings.visualHeight - height,
    width,
    height
  );
}

// Visible silhouette bounds measured from each original character PNG.
// Crop only while drawing; the original artwork remains untouched.
const CHARACTER_POSE_CROPS = {
  valencia: {
    catIdle: { x: 12, y: 12, width: 922, height: 461 },
    catJump: { x: 19, y: 24, width: 1431, height: 1010 },
    catFall: { x: 12, y: 12, width: 842, height: 622 },
    catSleep: { x: 12, y: 12, width: 742, height: 509 }
  },
  musia: {
  catIdle: { x: 39, y: 213, width: 1158, height: 633 },
  catJump: { x: 75, y: 240, width: 1017, height: 729 },
  catFall: { x: 114, y: 168, width: 948, height: 780 },
  catSleep: { x: 123, y: 246, width: 1077, height: 714 }
  },
  nyusia: {
    catIdle: { x: 54, y: 258, width: 1389, height: 600 },
    catJump: { x: 105, y: 135, width: 1275, height: 831 },
    catFall: { x: 138, y: 69, width: 1242, height: 939 },
    catSleep: { x: 57, y: 153, width: 1345, height: 882 }
  }
};

function drawCat() {
  const pose = getCurrentCatPose();
  const id = gameState === "gameOver" && lastRun ? lastRun.characterId : selectedCharacter;
  const catImage = characterImages[id][pose];
  const crop = CHARACTER_POSE_CROPS[id]?.[pose];
  if (crop) {
    // Match apparent body size between poses, not the transparent image canvas.
    const width = 110;
    const height = 96;
    drawImageSafe(catImage, crop.x, crop.y, crop.width, crop.height,
      cat.x + (cat.width - width) / 2, cat.y + (cat.height - height) / 2,
      width, height);
    return;
  }
  drawImageSafe(catImage, cat.x, cat.y, cat.width, cat.height);
}

function getCurrentCatPose() {
  if (gameState === "gameOver") return "catSleep";
  if (cat.velocityY < -1) return "catJump";
  if (cat.velocityY > 2) return "catFall";
  return "catIdle";
}

function getCurrentCatImage() {
  return images[getCurrentCatPose()];
}

function drawObstacles() {
  const groundTopY = GAME_HEIGHT - groundHeight + groundSettings.yOffset;

  for (const obstacle of obstacles) {
    const topY =
      obstacle.topHeight - obstacleSettings.renderHeight + obstacleSettings.topInset;

    ctx.save();
    const flipTop = CHARACTERS[selectedCharacter].flipTop;
    if (flipTop) {
      ctx.translate(0, topY + obstacleSettings.renderHeight);
      ctx.scale(1, -1);
    }
    drawImageSafe(
      images.obstacleTop,
      obstacle.x,
      flipTop ? 0 : topY,
      obstacleSettings.width,
      obstacleSettings.renderHeight
    );
    ctx.restore();

    const bottomY = obstacle.bottomY - obstacleSettings.bottomInset;

    const bottomHeight = Math.max(
      obstacleSettings.renderHeight,
      groundTopY + 70 - bottomY
    );

    drawImageSafe(
      images.obstacleBottom,
      obstacle.x,
      bottomY,
      obstacleSettings.width,
      bottomHeight
    );
  }
}

function drawScore() {
  drawRoundedRect(12, 12, GAME_WIDTH - 24, 76, 12, "rgba(255, 248, 238, 0.88)");
  ctx.fillStyle = "#5a3a24";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "left";
  ctx.fillText(String(score), 22, 48);

  ctx.font = "16px Arial";
  ctx.fillText(`${characterName()} · ${TEXT.best}: ${bestScore}`, 22, 76);
}

function drawLoadingScreen() {
  drawOverlay();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "bold 28px Arial";
  ctx.fillText(TEXT.loading, GAME_WIDTH / 2, GAME_HEIGHT / 2);
}

function drawMenuScreen({
  panelY = 95,
  panelHeight = 390,
  title,
  titleFont,
  lines = [],
  imageKey = null,
  imageWidth = 150,
  imageHeight = 110,
  imageOffsetY = 122,
  stats = [],
  buttonText = null,
  buttonOffsetY = 195,
  showButton = true,
  showControlsHint = true,
  controlsHintOffsetY = null
}) {
  drawOverlay();

  const layout = getMenuPanelLayout(GAME_WIDTH, panelHeight, panelY, buttonOffsetY);

  drawRoundedRect(
    layout.panelX,
    layout.panelY,
    layout.panelWidth,
    layout.panelHeight,
    24,
    "rgba(255, 248, 238, 0.92)",
    "rgba(145, 106, 72, 0.22)",
    2
  );

  ctx.fillStyle = "#6b4528";
  ctx.textAlign = "center";
  ctx.font = titleFont;
  ctx.fillText(title, GAME_WIDTH / 2, layout.panelY + 54);

  ctx.fillStyle = "#9b6f4b";
  ctx.font = "17px Arial";

  lines.forEach((line, index) => {
    ctx.fillText(line, GAME_WIDTH / 2, layout.panelY + 84 + index * 22);
  });

  if (imageKey) {
    const catX = GAME_WIDTH / 2 - imageWidth / 2;
    const catY = layout.panelY + imageOffsetY;

    drawImageSafe(images[imageKey], catX, catY, imageWidth, imageHeight);
  }

  stats.forEach(({ text, font, offsetY }) => {
    ctx.fillStyle = "#6b4528";
    ctx.font = font;
    ctx.fillText(text, GAME_WIDTH / 2, layout.panelY + offsetY);
  });

  if (showButton && buttonText) {
    drawRoundedRect(
      layout.buttonX,
      layout.buttonY,
      layout.buttonWidth,
      layout.buttonHeight,
      18,
      "#f3d8a8"
    );

    ctx.fillStyle = "#6b4528";
    ctx.font = "bold 22px Arial";
    ctx.fillText(buttonText, GAME_WIDTH / 2, layout.buttonY + 33);
  }

  if (showControlsHint) {
    ctx.fillStyle = "#8c6a50";
    ctx.font = "16px Arial";
    ctx.fillText(
      TEXT.controlsHint,
      GAME_WIDTH / 2,
      layout.panelY + (controlsHintOffsetY ?? panelHeight - 25)
    );
  }
}

function drawPauseScreen() {
  const layout = getPausePanelLayout(GAME_WIDTH);

  drawMenuScreen({
    panelY: layout.panelY,
    panelHeight: layout.panelHeight,
    title: TEXT.pauseTitle,
    titleFont: currentLanguage === "en" ? "bold 30px Arial" : "bold 34px Arial",
    lines: [TEXT.pauseLine],
    buttonText: TEXT.continueButton,
    buttonOffsetY: 140,
    showButton: !isPausedByPlatform,
    showControlsHint: false
  });
}

function getAccessibilityStatusText() {
  if (gameState === "gameOver" && lastRun) {
    return `${TEXT.gameOverTitle}. ${characterName(lastRun.characterId)}. ${TEXT.score}: ${lastRun.score}. ${TEXT.best}: ${bestScores[lastRun.characterId]}.`;
  }
  const status = buildAccessibilityStatusText({
    gameState,
    isPausedByVisibility: isPausedByVisibility || isPausedByPlatform,
    text: TEXT,
    score,
    bestScore
  });
  return gameState === "loading" ? status : `${characterName()}. ${status}`;
}

function syncAccessibility() {
  syncCharacterMenu();
  const statusElement = document.getElementById("gameStatus");
  const instructionsElement = document.getElementById("gameInstructions");

  if (instructionsElement) {
    instructionsElement.textContent = TEXT.controlsHint;
  }

  if (!statusElement) {
    return;
  }

  statusElement.textContent = getAccessibilityStatusText();
}

function drawRoundedRect(x, y, width, height, radius, fillColor, strokeColor = null, lineWidth = 0) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();

  if (strokeColor && lineWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawOverlay() {
  ctx.fillStyle = "rgba(76, 48, 28, 0.45)";
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

function gameLoop(timestamp) {
  animationFrameId = null;

  if (!isActiveGameplay()) {
    return;
  }

  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  update(deltaTime);
  draw();
  scheduleGameLoop();
}

window.addEventListener("keydown", event => {
  if (event.target.closest?.("button")) return;
  if (event.code !== "Space" && event.code !== "Enter") {
    return;
  }

  event.preventDefault();

  if (gameState === "playing" && isPausedByVisibility) {
    resumeFromPause();
    return;
  }

  jump();
});

canvas.addEventListener("mousedown", event => {
  handleCanvasInput(event.clientX, event.clientY);
});

canvas.addEventListener("touchstart", event => {
  event.preventDefault();

  const touch = event.touches[0];

  if (touch) {
    handleCanvasInput(touch.clientX, touch.clientY);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseFromVisibility();
  }
});

window.addEventListener("blur", () => {
  pauseFromVisibility();
});

async function startApp() {
  preventNativeUiEvents();
  setupCharacterMenu();
  setupCanvasResolution();
  refreshScreen();

  // loadImages() не зависит от Yandex SDK — запускаем сразу, не дожидаясь
  // инициализации SDK, чтобы игрок увидел старт как можно раньше.
  loadImages();

  await initYandexSDK();
  applyLanguage();
}

bootstrapLanguage();
startApp();