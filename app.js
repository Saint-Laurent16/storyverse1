import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const STORAGE_KEY = 'storyverse-progress-v1';
const EDITOR_KEY = 'storyverse-editor-v1';
const FIREBASE_SDK_VERSION = '13.1.0';
let firebaseAuth = null;
let firebaseDb = null;
let firebaseApi = null;
let signedInUser = null;
let signedInProfile = null;
let authMode = 'login';
let authActionInProgress = false;
let classroomRefreshToken = 0;
let progressSyncQueue = Promise.resolve();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const stageEl = $('#sceneStage');
const toastEl = $('#toast');
let baseData = null;
let storyData = null;
let activeStory = null;
let activeScene = 0;
let scanner = null;
let qrScannerRunning = false;
let toastTimer = null;
let narrationUtterance = null;
let musicContext = null;
let musicNodes = [];
let musicOn = false;
let threeExperience = null;
let quizState = null;
let currentProgress = readProgress();

function readProgress(key = STORAGE_KEY) {
  try {
    return JSON.parse(localStorage.getItem(key)) || { name: '', scenes: {}, completed: [], results: [] };
  } catch {
    return { name: '', scenes: {}, completed: [], results: [] };
  }
}
function activeProgressKey() {
  return signedInUser ? `${STORAGE_KEY}-${signedInUser.uid}` : STORAGE_KEY;
}
function saveProgress() {
  try { localStorage.setItem(activeProgressKey(), JSON.stringify(currentProgress)); }
  catch { showToast('This browser could not save progress.'); }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}
function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!$('.modal-shell.open')) document.body.classList.remove('modal-open');
}
function stopNarration() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  narrationUtterance = null;
  $('#narrationToggle').textContent = '▶';
  $('#audioStatus').textContent = 'Narration is ready';
}
function speakText(text, status = 'Playing narration') {
  if (!('speechSynthesis' in window)) {
    showToast('Speech narration is not available in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  narrationUtterance = new SpeechSynthesisUtterance(text);
  narrationUtterance.lang = 'en-US';
  narrationUtterance.rate = Number($('#speechRate').value || 1);
  narrationUtterance.pitch = 1.02;
  narrationUtterance.volume = 0.92;
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => /^en(-|_)/i.test(v.lang) && /natural|samantha|google|aria|jenny/i.test(v.name)) || voices.find(v => /^en(-|_)/i.test(v.lang));
  if (englishVoice) narrationUtterance.voice = englishVoice;
  narrationUtterance.onend = () => {
    $('#narrationToggle').textContent = '▶';
    $('#audioStatus').textContent = 'Narration finished';
  };
  narrationUtterance.onerror = () => {
    $('#narrationToggle').textContent = '▶';
    $('#audioStatus').textContent = 'Narration unavailable';
  };
  $('#narrationToggle').textContent = 'Ⅱ';
  $('#audioStatus').textContent = status;
  window.speechSynthesis.speak(narrationUtterance);
}
function toggleNarration() {
  if (!('speechSynthesis' in window)) return showToast('Speech narration is not available here.');
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
    $('#narrationToggle').textContent = '▶';
    $('#audioStatus').textContent = 'Narration paused';
  } else if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    $('#narrationToggle').textContent = 'Ⅱ';
    $('#audioStatus').textContent = 'Playing narration';
  } else if (activeStory) {
    speakText(activeStory.scenes[activeScene].narration || activeStory.scenes[activeScene].text);
  }
}
function startMusic() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return showToast('Background audio is not supported by this browser.');
  if (!musicContext) {
    musicContext = new AudioCtx();
    const master = musicContext.createGain();
    master.gain.value = 0.023;
    master.connect(musicContext.destination);
    const tones = [130.81, 196, 261.63];
    tones.forEach((hz, index) => {
      const osc = musicContext.createOscillator();
      const gain = musicContext.createGain();
      osc.type = index === 1 ? 'sine' : 'triangle';
      osc.frequency.value = hz;
      gain.gain.value = index === 0 ? 0.65 : 0.23;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      musicNodes.push(osc, gain);
    });
    musicNodes.push(master);
  }
  musicContext.resume();
  musicOn = true;
  $('#musicToggle').textContent = '♫ ON';
  $('#musicToggle').setAttribute('aria-label', 'Turn background music off');
}
function stopMusic() {
  if (musicContext) musicContext.suspend();
  musicOn = false;
  $('#musicToggle').textContent = '♫';
  $('#musicToggle').setAttribute('aria-label', 'Turn background music on');
}
function toggleMusic() { musicOn ? stopMusic() : startMusic(); }

async function loadStories() {
  const response = await fetch('./data/stories.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load story content.');
  baseData = await response.json();
  const savedEditor = localStorage.getItem(EDITOR_KEY);
  if (savedEditor) {
    try { storyData = JSON.parse(savedEditor); }
    catch { storyData = structuredClone(baseData); }
  } else storyData = structuredClone(baseData);
  validateStoryData(storyData);
  renderStoryLibrary();
  renderProgress();
  if (signedInProfile?.role === 'student') void syncStudentProgress();
  const params = new URLSearchParams(location.search);
  const storyId = params.get('story');
  if (storyId && findStory(storyId)) setTimeout(() => openStory(storyId), 500);
}
function validateStoryData(data) {
  if (!data || !Array.isArray(data.stories) || data.stories.length < 1) throw new Error('Story JSON must contain a stories array.');
  for (const story of data.stories) {
    if (!story.id || !story.title || !Array.isArray(story.scenes) || story.scenes.length !== 3 || !Array.isArray(story.quiz)) {
      throw new Error(`Story "${story.title || 'unnamed'}" must have an id, title, exactly 3 scenes, and quiz questions.`);
    }
    for (const scene of story.scenes) if (!scene.title || !scene.text) throw new Error(`A scene in "${story.title}" is missing a title or text.`);
    for (const question of story.quiz) {
      if (!question.question || !Array.isArray(question.choices) || !Number.isInteger(question.answer)) throw new Error(`A quiz question in "${story.title}" is incomplete.`);
      if (question.answer < 0 || question.answer >= question.choices.length) throw new Error(`A quiz answer in "${story.title}" points outside its choice list.`);
    }
  }
}
function findStory(id) { return storyData?.stories.find(story => story.id === id); }
function makeStoryUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set('story', id);
  url.hash = '';
  return url.href;
}
function renderStoryLibrary() {
  const grid = $('#storyGrid');
  $('#storyCount').textContent = String(storyData.stories.length).padStart(2, '0');
  grid.innerHTML = storyData.stories.map(story => {
    const symbol = story.world === 'web' ? '🕷️' : story.world === 'forest' ? '🌲' : '🐢';
    return `<article class="story-card" data-story-card="${escapeHtml(story.id)}">
      <div class="story-cover">
        <div class="cover-art"><span class="cover-title-mark">STORYVERSE · ${escapeHtml(story.genre || 'STORY')}</span><span class="cover-orbit"></span><span class="cover-spark s1">✦</span><span class="cover-spark s2">✧</span><span class="cover-spark s3">✦</span><span class="cover-subject">${symbol}</span></div>
      </div>
      <div class="story-meta"><div class="story-tags"><span>${escapeHtml(story.genre || 'STORY')}</span><span class="scene-count">03 SCENES</span></div><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.description)}</p><div class="story-card-actions"><button class="open-story" data-open-story="${escapeHtml(story.id)}">OPEN STORY ↗</button><button class="qr-button" data-toggle-qr="${escapeHtml(story.id)}" aria-label="Show QR code for ${escapeHtml(story.title)}">⌗</button></div></div>
      <div class="qr-card" id="qr-${escapeHtml(story.id)}"><div class="qr-render" id="qr-render-${escapeHtml(story.id)}"></div><div class="qr-explain"><b>${escapeHtml(story.title)} · STORY QR</b>Scan this unique code to open this story on the published site.<br/><a href="#" class="print-qr" data-print-qr="${escapeHtml(story.id)}">Print this code ↗</a></div></div>
    </article>`;
  }).join('');
  $$('[data-open-story]', grid).forEach(button => button.addEventListener('click', () => openStory(button.dataset.openStory)));
  $$('[data-toggle-qr]', grid).forEach(button => button.addEventListener('click', () => toggleQr(button.dataset.toggleQr)));
  $$('[data-print-qr]', grid).forEach(link => link.addEventListener('click', event => { event.preventDefault(); window.print(); }));
  storyData.stories.forEach(story => makeQr(story));
}
function makeQr(story) {
  const holder = document.getElementById(`qr-render-${story.id}`);
  if (!holder) return;
  holder.innerHTML = '';
  const value = makeStoryUrl(story.id);
  if (window.QRCode) {
    new QRCode(holder, { text: value, width: 76, height: 76, colorDark: '#17122f', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } else {
    holder.textContent = 'QR library unavailable';
    holder.style.fontSize = '7px';
    holder.style.color = '#17122f';
    holder.style.textAlign = 'center';
  }
}
function toggleQr(id) {
  const card = document.getElementById(`qr-${id}`);
  const wasOpen = card.classList.contains('show');
  $$('.qr-card').forEach(el => el.classList.remove('show'));
  if (!wasOpen) card.classList.add('show');
}

function openStory(id) {
  const story = findStory(id);
  if (!story) return showToast('That story code was not recognized.');
  activeStory = story;
  activeScene = 0;
  stopNarration();
  stopMusic();
  $('#storyTitle').textContent = story.title;
  renderScene();
  openModal('storyModal');
}
function renderScene() {
  if (!activeStory) return;
  const scene = activeStory.scenes[activeScene];
  $('#sceneCounter').textContent = `SCENE ${activeScene + 1} OF ${activeStory.scenes.length}`;
  $('#sceneLabel').textContent = scene.label || `SCENE ${activeScene + 1}`;
  $('#sceneHeading').textContent = scene.title;
  $('#storyCopy').textContent = scene.text;
  $('#sceneProgressText').textContent = `${Math.min(activeScene, Number(currentProgress.scenes[activeStory.id] || 0))} / 3 scenes completed`;
  $('#sceneProgressBar').style.width = `${Math.min(100, Number(currentProgress.scenes[activeStory.id] || 0) / 3 * 100)}%`;
  $('#nextScene').innerHTML = activeScene === 2 ? 'FINISH & TAKE QUIZ <span>→</span>' : 'NEXT SCENE <span>→</span>';
  $('#audioStatus').textContent = 'Narration is ready';
  $('#narrationToggle').textContent = '▶';
  const words = scene.vocabulary || [];
  $('#wordHelp').innerHTML = words.map(item => `<button class="vocab-chip" data-word="${escapeHtml(item.word)}" title="${escapeHtml(item.meaning)}"><b>${escapeHtml(item.word)}</b> · ${escapeHtml(item.meaning)}</button>`).join('');
  $$('[data-word]').forEach(button => button.addEventListener('click', () => {
    showToast(`${button.dataset.word}: ${button.title}`);
    speakText(button.dataset.word, `Pronouncing “${button.dataset.word}”`);
  }));
  disposeThree();
  buildThreeScene(activeStory, activeScene);
}
function nextScene() {
  if (!activeStory) return;
  stopNarration();
  const prior = Number(currentProgress.scenes[activeStory.id] || 0);
  currentProgress.scenes[activeStory.id] = Math.max(prior, activeScene + 1);
  saveProgress();
  void syncStudentProgress(activeStory.id);
  renderProgress();
  if (activeScene < 2) {
    activeScene += 1;
    renderScene();
  } else {
    stopMusic();
    closeModal('storyModal');
    openQuiz(activeStory);
  }
}

// Three.js story-world renderer. Environments and characters are created procedurally
// so the site works without paid 3D assets or API keys.
function mat(color, roughness = 0.8, metalness = 0.02, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
function addMesh(group, geometry, material, position, scale, name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function addCylinderBetween(group, start, end, radius, material) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const direction = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
function makePerson(group, x, z, bodyColor = '#8866c7', hairColor = '#302446', scale = 1, accessory = '#f4b3da') {
  const person = new THREE.Group();
  person.position.set(x, 0, z);
  person.scale.setScalar(scale);
  const skin = mat('#e7ad91'), hair = mat(hairColor), body = mat(bodyColor), pants = mat('#333d68'), shoes = mat('#211d39');
  addMesh(person, new THREE.CapsuleGeometry(.23, .48, 4, 8), body, [0, .78, 0], [1, 1, 1], 'story character');
  addMesh(person, new THREE.SphereGeometry(.25, 16, 12), skin, [0, 1.43, 0], [1, 1, .92]);
  addMesh(person, new THREE.SphereGeometry(.255, 16, 9, 0, Math.PI * 2, 0, Math.PI * .58), hair, [0, 1.53, -.015], [1.03, .9, 1]);
  addMesh(person, new THREE.SphereGeometry(.045, 8, 8), mat('#251d35'), [-.09, 1.43, .22], [1, 1, .4]);
  addMesh(person, new THREE.SphereGeometry(.045, 8, 8), mat('#251d35'), [.09, 1.43, .22], [1, 1, .4]);
  addCylinderBetween(person, [-.18, .97, 0], [-.32, .49, .03], .075, pants);
  addCylinderBetween(person, [.18, .97, 0], [.32, .49, .03], .075, pants);
  addMesh(person, new THREE.SphereGeometry(.105, 10, 8), shoes, [-.32, .45, .07], [1.2, .55, 1.5]);
  addMesh(person, new THREE.SphereGeometry(.105, 10, 8), shoes, [.32, .45, .07], [1.2, .55, 1.5]);
  addCylinderBetween(person, [-.22, 1.06, 0], [-.48, .78, .16], .065, skin);
  addCylinderBetween(person, [.22, 1.06, 0], [.48, .78, .16], .065, skin);
  addMesh(person, new THREE.SphereGeometry(.07, 10, 8), mat(accessory, .4, .1, { emissive: accessory, emissiveIntensity: .1 }), [0, 1.07, .2], [.7, .7, .3]);
  group.add(person);
  return person;
}
function makeSpider(group, x, z) {
  const spider = new THREE.Group();
  spider.position.set(x, .58, z);
  const dark = mat('#29244c'), abdomen = mat('#513c7c'), eye = mat('#ffd9a8', .2, .05, { emissive: '#ffbb8b', emissiveIntensity: .45 });
  addMesh(spider, new THREE.SphereGeometry(.36, 18, 12), abdomen, [0, 0, -.28], [1.2, .8, 1.2]);
  addMesh(spider, new THREE.SphereGeometry(.23, 16, 12), dark, [0, .03, .2]);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const zOff = -.22 + row * .15;
    const joint = [side * (.42 + row * .015), -.04 + (row % 2) * .05, zOff];
    const foot = [side * (.77 + row * .02), -.26, zOff + (row - 1.5) * .07];
    addCylinderBetween(spider, [side * .12, 0, zOff], joint, .045, dark);
    addCylinderBetween(spider, joint, foot, .035, dark);
  }
  addMesh(spider, new THREE.SphereGeometry(.045, 9, 8), eye, [-.09, .1, .39]);
  addMesh(spider, new THREE.SphereGeometry(.045, 9, 8), eye, [.09, .1, .39]);
  group.add(spider);
  return spider;
}
function makeTree(group, x, z, scale = 1, leafColor = '#4b9b91') {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  addMesh(tree, new THREE.CylinderGeometry(.15, .23, 1.55, 8), mat('#725071'), [0, .77, 0]);
  const leafMat = mat(leafColor, .85, 0, { roughness: .9 });
  addMesh(tree, new THREE.IcosahedronGeometry(.8, 1), leafMat, [0, 1.75, 0], [1, 1.12, 1]);
  addMesh(tree, new THREE.IcosahedronGeometry(.58, 1), leafMat, [-.4, 2.02, .05], [1, 1, 1]);
  group.add(tree);
  return tree;
}
function makeTurtle(group, x, z) {
  const turtle = new THREE.Group();
  turtle.position.set(x, .25, z);
  const green = mat('#63bb9a'), shell = mat('#286e78'), shellLight = mat('#63c8b8');
  addMesh(turtle, new THREE.SphereGeometry(.43, 18, 12), shell, [0, .3, 0], [1.18, .65, 1]);
  addMesh(turtle, new THREE.SphereGeometry(.32, 14, 10), green, [0, .27, .43], [.65, .58, .95]);
  addMesh(turtle, new THREE.SphereGeometry(.15, 12, 10), green, [0, .39, .71], [1, .95, 1]);
  addMesh(turtle, new THREE.SphereGeometry(.04, 8, 8), mat('#162a48'), [-.07, .43, .84]);
  addMesh(turtle, new THREE.SphereGeometry(.04, 8, 8), mat('#162a48'), [.07, .43, .84]);
  [[-.4,.05,-.25],[.4,.05,-.25],[-.4,.05,.27],[.4,.05,.27]].forEach(([a,b,c]) => addMesh(turtle, new THREE.SphereGeometry(.17, 10, 8), green, [a,b,c], [1,.5,1.3]));
  addMesh(turtle, new THREE.CircleGeometry(.27, 6), shellLight, [0, .62, 0], [1,1,1]).rotation.x = -Math.PI/2;
  group.add(turtle);
  return turtle;
}
function addGround(sceneGroup, color) {
  const ground = addMesh(sceneGroup, new THREE.CircleGeometry(5.7, 64), mat(color, 1), [0, -.07, 0], [1,1,1], 'world ground');
  ground.rotation.x = -Math.PI / 2;
  return ground;
}
function addStars(scene, count = 250, radius = 13) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const y = Math.random() * 8 - 1;
    const r = radius * (.7 + Math.random() * .3);
    positions[i*3] = Math.cos(angle) * r;
    positions[i*3+1] = y;
    positions[i*3+2] = Math.sin(angle) * r;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#dfd4ff', size: .045, transparent: true, opacity: .7 }));
  scene.add(points);
  return points;
}
function addClickable(mesh, message, clickables) {
  if (mesh) {
    mesh.userData.storyObject = true;
    mesh.userData.message = message;
    clickables.push(mesh);
  }
}
function buildThreeScene(story, sceneIndex) {
  stageEl.innerHTML = '<div class="stage-loading"><span class="loader-orb"></span><p>Building your story world…</p></div>';
  let renderer, scene, camera, controls, resizeObserver, animationId;
  const clickables = [];
  const animated = [];
  const sceneGroup = new THREE.Group();
  const sceneBackgrounds = story.world === 'web' ? ['#27204d','#1c2450','#25345b'] : story.world === 'forest' ? ['#153f48','#16494b','#1d4c47'] : ['#0d3d69','#104c72','#0b3d65'];
  const bg = new THREE.Color(sceneBackgrounds[sceneIndex] || sceneBackgrounds[0]);
  try {
    scene = new THREE.Scene();
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 8, 19);
    camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
    camera.position.set(0, 3.4, 7.6);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.xr.enabled = true;
    stageEl.innerHTML = '';
    stageEl.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .055;
    controls.minDistance = 4.5;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI * .48;
    controls.target.set(0, 1, 0);
    scene.add(new THREE.HemisphereLight('#d9deff', '#40315c', 2.15));
    const keyLight = new THREE.DirectionalLight('#fff1d9', 3.1);
    keyLight.position.set(-4, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(512, 512);
    scene.add(keyLight);
    const rim = new THREE.PointLight(story.accent || '#b99cff', 5, 15);
    rim.position.set(4, 3, -3);
    scene.add(rim);
    scene.add(sceneGroup);
    const stars = addStars(scene, 180);
    const clickMessage = story.scenes[sceneIndex].objectMessage || 'You found a hidden detail in this story world.';

    if (story.world === 'web') {
      addGround(sceneGroup, sceneIndex === 2 ? '#43518b' : '#38416c');
      makeTree(sceneGroup, -3.1, -1.1, 1.35, '#4e9b92');
      makeTree(sceneGroup, 3.2, -1.7, 1.12, '#5db2a4');
      makeTree(sceneGroup, -2.5, 2.7, .75, '#528b98');
      const webMat = new THREE.LineBasicMaterial({ color: '#e8d8ff', transparent: true, opacity: .72 });
      const webPoints = [];
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        webPoints.push(new THREE.Vector3(Math.cos(a) * 1.1, 2.2 + Math.sin(a) * .45, -1.25 + Math.sin(a) * .15));
      }
      const webGeo = new THREE.BufferGeometry().setFromPoints(webPoints);
      const webLine = new THREE.LineLoop(webGeo, webMat);
      sceneGroup.add(webLine);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const pts = [new THREE.Vector3(0,2.2,-1.25),new THREE.Vector3(Math.cos(a)*1.1,2.2+Math.sin(a)*.45,-1.25+Math.sin(a)*.15)];
        sceneGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), webMat));
      }
      const spider = makeSpider(sceneGroup, -.65, .7);
      animated.push({ object: spider, type: 'bob', speed: 1.5, base: .58 });
      if (sceneIndex === 0) {
        const jar = addMesh(sceneGroup, new THREE.CylinderGeometry(.28,.33,.72,24), mat('#c27eae',.22,.2,{transparent:true,opacity:.85,emissive:'#642c78',emissiveIntensity:.3}), [.9,.53,.3], null, 'wisdom jar');
        const lid = addMesh(sceneGroup, new THREE.CylinderGeometry(.32,.32,.11,20), mat('#f2ca8e',.35), [.9,.95,.3]);
        addMesh(sceneGroup, new THREE.TorusGeometry(.31,.045,8,24), mat('#f8d7a6'), [.9,.65,.3]);
        addClickable(jar, clickMessage, clickables); addClickable(lid, clickMessage, clickables);
        animated.push({object:jar,type:'turn',speed:.45});
      } else if (sceneIndex === 1) {
        makePerson(sceneGroup, 1.45, .25, '#4d83a6', '#382b46', .9, '#91e2d3');
        const webOrb = addMesh(sceneGroup, new THREE.IcosahedronGeometry(.35,1), mat('#edbcff',.2,.1,{emissive:'#c57aff',emissiveIntensity:1}), [1.5,2.1,-.35]);
        addClickable(webOrb, clickMessage, clickables); animated.push({object:webOrb,type:'bob',speed:1.8,base:2.1});
      } else {
        const shards = new THREE.Group();
        for (let i=0;i<7;i++) {
          const orb = addMesh(shards,new THREE.IcosahedronGeometry(.13+Math.random()*.09,1),mat('#ffd990',.25,.1,{emissive:'#f9b850',emissiveIntensity:.8}),[(Math.random()-.5)*2.4,.7+Math.random()*1.4,(Math.random()-.5)*1.8]);
          addClickable(orb, clickMessage, clickables);
          animated.push({object:orb,type:'bob',speed:1+Math.random(),base:orb.position.y});
        }
        sceneGroup.add(shards);
      }
    } else if (story.world === 'forest') {
      addGround(sceneGroup, '#326c5c');
      makeTree(sceneGroup,-3.15,-1,1.45,'#388c79');
      makeTree(sceneGroup,3.15,-1.35,1.35,'#4f9b77');
      makeTree(sceneGroup,-2.45,2.2,.85,'#3c9075');
      makeTree(sceneGroup,2.4,2.4,.8,'#3d816e');
      const path = addMesh(sceneGroup,new THREE.PlaneGeometry(2.1,7),mat('#927c69'),[0,.015,0]); path.rotation.x=-Math.PI/2; path.rotation.z=.12;
      makePerson(sceneGroup,-.8,.2,'#b16e9a','#2d263c',.92,'#f4c48d');
      makePerson(sceneGroup,.15,.45,'#568bb2','#34304a',.87,'#8ee2d0');
      makePerson(sceneGroup,1.05,.15,'#cb8d55','#432d37',.9,'#a8a0ff');
      if (sceneIndex === 0) {
        for (let i=0;i<5;i++) {
          const fern=addMesh(sceneGroup,new THREE.ConeGeometry(.26,.8,7),mat('#6ec69c'),[-2.2+i*.25,.42,1.3+i*.08],[.8,1.1,.65]);
          fern.rotation.z=(i-2)*.22;
          if(i===2)addClickable(fern,clickMessage,clickables);
        }
        const mist = addMesh(sceneGroup,new THREE.SphereGeometry(1.6,16,10),new THREE.MeshBasicMaterial({color:'#b8e6e3',transparent:true,opacity:.12,depthWrite:false}),[0,1.8,-1],[1.8,.7,1]);
        animated.push({object:mist,type:'drift',speed:.25});
      } else if (sceneIndex === 1) {
        const stream=addMesh(sceneGroup,new THREE.PlaneGeometry(1.25,6),new THREE.MeshStandardMaterial({color:'#68d2d5',roughness:.18,metalness:.22,transparent:true,opacity:.82}),[-.15,.035,-.1]); stream.rotation.x=-Math.PI/2; stream.rotation.z=.18;
        const flowerMat=mat('#82dcf2',.3,.05,{emissive:'#298fa8',emissiveIntensity:.7});
        for(let i=0;i<6;i++){
          const flower=addMesh(sceneGroup,new THREE.SphereGeometry(.18,10,8),flowerMat,[1.6+(i%2)*.3,.5,-1.5+i*.65],[1,.55,1]);
          addClickable(flower,clickMessage,clickables); animated.push({object:flower,type:'bob',speed:1.3+i*.1,base:.5});
        }
      } else {
        const ribbon=addMesh(sceneGroup,new THREE.BoxGeometry(.12,1.25,.05),mat('#ff9ac9',.4,0,{emissive:'#ad4985',emissiveIntensity:.3}),[-2.3,1.35,-.6]);
        ribbon.rotation.z=-.25; addClickable(ribbon,clickMessage,clickables); animated.push({object:ribbon,type:'sway',speed:1.5});
        const marker=addMesh(sceneGroup,new THREE.BoxGeometry(.55,.65,.12),mat('#d8c6a0'),[2.15,.45,-.5]); addClickable(marker,clickMessage,clickables);
      }
    } else {
      addGround(sceneGroup,'#145a77');
      for(let i=0;i<9;i++){
        const coral=addMesh(sceneGroup,new THREE.ConeGeometry(.18,.8+(i%3)*.22,7),mat(i%2?'#e78cae':'#6bd4cf'),[-3.4+(i%5)*1.45,.45,-2.2+Math.floor(i/5)*2.4],[1,1,1]);
        coral.rotation.z=(i%2?-.18:.16);
      }
      const turtle=makeTurtle(sceneGroup,-.85,.15);
      animated.push({object:turtle,type:'bob',speed:.85,base:.25});
      if(sceneIndex===0){
        const shell=addMesh(sceneGroup,new THREE.SphereGeometry(.47,22,14),mat('#73d6f0',.2,.1,{emissive:'#208cb8',emissiveIntensity:1}),[1.4,.42,.15],[1,.55,.72]);
        const shellRing=addMesh(sceneGroup,new THREE.TorusGeometry(.5,.045,8,30),mat('#b1f5ff',.3,.2,{emissive:'#3da9d0',emissiveIntensity:.6}),[1.4,.45,.15]); shellRing.rotation.x=Math.PI/2;
        addClickable(shell,clickMessage,clickables); addClickable(shellRing,clickMessage,clickables); animated.push({object:shell,type:'pulse',speed:1.8});
      }else if(sceneIndex===1){
        const netMat=new THREE.LineBasicMaterial({color:'#e6d7bd',transparent:true,opacity:.83});
        const coords=[[-1.2,.3,-1.1],[1.5,.7,-.8],[1.8,.2,.8],[-1.1,.6,.9]];
        const points=coords.map(p=>new THREE.Vector3(...p));
        const net=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),netMat); sceneGroup.add(net); addClickable(net,clickMessage,clickables);
        for(let i=0;i<5;i++){
          const fish=addMesh(sceneGroup,new THREE.SphereGeometry(.16,12,8),mat('#ffb77e'),[-1+i*.48,.55,-.25+i*.13],[1.35,.7,.55]);
          addClickable(fish,clickMessage,clickables); animated.push({object:fish,type:'bob',speed:1.2+i*.13,base:.55});
        }
      } else {
        const coralGlow=addMesh(sceneGroup,new THREE.IcosahedronGeometry(.52,1),mat('#f2a6d4',.25,.05,{emissive:'#d34fbb',emissiveIntensity:.85}),[1.35,.95,-.5],[1,1.6,.8]);
        addClickable(coralGlow,clickMessage,clickables); animated.push({object:coralGlow,type:'pulse',speed:1.3});
        const marker=addMesh(sceneGroup,new THREE.CylinderGeometry(.08,.08,.7,10),mat('#e9d18c'),[2.1,.42,.5]); addClickable(marker,clickMessage,clickables);
      }
    }
    const reticle = new THREE.Mesh(new THREE.RingGeometry(.12,.18,32), new THREE.MeshBasicMaterial({color:'#c8fff5',side:THREE.DoubleSide}));
    reticle.rotation.x = -Math.PI/2;
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hitTestSource = null;
    let placedInAR = false;
    let arSession = null;
    let disposed = false;
    const xrController = renderer.xr.getController(0);
    xrController.addEventListener('select', placeInAR);
    scene.add(xrController);

    function onPointerDown(event) {
      if (renderer.xr.isPresenting) {
        if (reticle.visible) placeInAR();
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickables, true)[0];
      if (hit) {
        const target = hit.object;
        const message = target.userData.message || clickMessage;
        showToast(message);
        if ('speechSynthesis' in window) speakText(message, 'Story discovery');
      }
    }
    function placeInAR() {
      if (!renderer.xr.isPresenting || placedInAR) return;
      if (reticle.visible) {
        sceneGroup.position.setFromMatrixPosition(reticle.matrix);
        sceneGroup.quaternion.setFromRotationMatrix(reticle.matrix);
      } else {
        sceneGroup.position.set(0, 0, -1.15);
      }
      sceneGroup.scale.setScalar(.27);
      reticle.visible = false;
      placedInAR = true;
      showToast('Story world placed! Move around to explore.');
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.xr.addEventListener('sessionstart', async () => {
      scene.background = null;
      scene.fog = null;
      placedInAR = false;
      sceneGroup.scale.setScalar(.27);
      sceneGroup.position.set(0, 0, -1.15);
      reticle.visible = false;
      arSession = renderer.xr.getSession();
      try {
        const viewerSpace = await arSession.requestReferenceSpace('viewer');
        hitTestSource = await arSession.requestHitTestSource({ space: viewerSpace });
      } catch { hitTestSource = null; }
    });
    renderer.xr.addEventListener('sessionend', () => {
      hitTestSource = null;
      reticle.visible = false;
      sceneGroup.scale.setScalar(1);
      sceneGroup.position.set(0,0,0);
      sceneGroup.rotation.set(0,0,0);
      scene.background = bg;
      scene.fog = new THREE.Fog(bg,8,19);
      placedInAR = false;
      arSession = null;
    });
    renderer.setAnimationLoop((time, frame) => {
      if (disposed) return;
      const t = time * .001;
      controls.update();
      animated.forEach(item => {
        if (item.type === 'bob') item.object.position.y = item.base + Math.sin(t * item.speed) * .11;
        if (item.type === 'turn') item.object.rotation.y = Math.sin(t * item.speed) * .34;
        if (item.type === 'drift') item.object.position.x = Math.sin(t * item.speed) * .17;
        if (item.type === 'sway') item.object.rotation.z = -.25 + Math.sin(t * item.speed) * .18;
        if (item.type === 'pulse') { const s = 1 + Math.sin(t * item.speed) * .08; item.object.scale.set(s,s,s); }
      });
      stars.rotation.y = t * .012;
      if (frame && hitTestSource && !placedInAR) {
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length) {
          const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
          if (pose) { reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); }
        } else reticle.visible = false;
      }
      renderer.render(scene,camera);
    });
    const resize = () => {
      if (!renderer || disposed) return;
      const width = Math.max(1, stageEl.clientWidth);
      const height = Math.max(1, stageEl.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width,height,false);
    };
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stageEl);
    const arButton = $('#arLaunch');
    const arLabel = $('#arSupportLabel');
    arButton.disabled = true;
    arButton.textContent = '◎ CHECKING AR…';
    if (navigator.xr && window.isSecureContext) {
      navigator.xr.isSessionSupported('immersive-ar').then(supported => {
        if (!disposed) {
          arButton.disabled = !supported;
          arButton.textContent = supported ? '◎ TRY AR VIEW' : '◎ 3D VIEW ACTIVE';
          arLabel.textContent = supported ? 'Place this world in your space' : 'Immersive AR is not supported here; rotate the 3D scene instead.';
        }
      }).catch(() => {
        arButton.disabled = true;
        arButton.textContent = '◎ 3D VIEW ACTIVE';
        arLabel.textContent = 'Use the interactive 3D view on this device.';
      });
    } else {
      arButton.disabled = true;
      arButton.textContent = '◎ 3D VIEW ACTIVE';
      arLabel.textContent = !window.isSecureContext ? 'AR needs a secure HTTPS site. 3D mode is ready.' : 'This browser does not expose WebXR AR. 3D mode is ready.';
    }
    arButton.onclick = () => {
      if (!navigator.xr || !window.isSecureContext) return showToast('Open the published HTTPS site on a WebXR-compatible device to try AR.');
      // requestSession is invoked directly from this tap to preserve the browser user gesture.
      const request = navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['hit-test','dom-overlay'], domOverlay: { root: document.body } });
      request.then(session => renderer.xr.setSession(session)).catch(error => {
        console.warn('AR session was not started:', error);
        showToast('AR could not start here. The interactive 3D scene is still available.');
      });
    };
    threeExperience = {
      dispose() {
        disposed = true;
        try { if (renderer.xr.isPresenting) renderer.xr.getSession()?.end(); } catch {}
        renderer.setAnimationLoop(null);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        controls.dispose();
        resizeObserver?.disconnect();
        renderer.dispose();
        stageEl.innerHTML = '';
      }
    };
  } catch (error) {
    console.error('3D scene error:', error);
    stageEl.innerHTML = '<div class="stage-loading"><span class="loader-orb"></span><p>3D mode is unavailable on this device. You can still read and listen to the story below.</p></div>';
    $('#arLaunch').disabled = true;
    $('#arLaunch').textContent = '3D VIEW UNAVAILABLE';
    $('#arSupportLabel').textContent = 'Try a recent browser with WebGL enabled.';
  }
}
function disposeThree() {
  if (threeExperience) threeExperience.dispose();
  threeExperience = null;
}

function openQuiz(story) {
  quizState = { story, index: 0, selected: null, answered: false, score: 0, finished: false, responses: [] };
  $('#quizTitle').textContent = `${story.title}: quick check`;
  $('#quizIntro').textContent = 'Think back to the characters, clues, vocabulary, and big idea in the story.';
  $('#quizResult').hidden = true;
  $('#quizContent').hidden = false;
  $('#quizNext').hidden = false;
  renderQuizQuestion();
  openModal('quizModal');
}
function renderQuizQuestion() {
  const q = quizState.story.quiz[quizState.index];
  quizState.selected = null;
  quizState.answered = false;
  const total = quizState.story.quiz.length;
  $('#quizQuestionCounter').textContent = `QUESTION ${quizState.index + 1} OF ${total}`;
  $('#quizProgressLabel').textContent = `${Math.round(quizState.index / total * 100)}%`;
  $('#quizProgressBar').style.width = `${quizState.index / total * 100}%`;
  $('#quizContent').innerHTML = `<h3>${escapeHtml(q.question)}</h3><div class="quiz-options">${q.choices.map((choice,index)=>`<button class="quiz-option" data-answer="${index}"><span class="option-letter">${String.fromCharCode(65+index)}</span><span>${escapeHtml(choice)}</span></button>`).join('')}</div><div class="answer-feedback" id="answerFeedback" hidden></div>`;
  $$('[data-answer]').forEach(button => button.addEventListener('click', () => {
    if (quizState.answered) return;
    quizState.selected = Number(button.dataset.answer);
    $$('[data-answer]').forEach(el => el.classList.toggle('selected', el === button));
    $('#quizNext').disabled = false;
  }));
  $('#quizNext').textContent = 'CHECK ANSWER';
  $('#quizNext').disabled = true;
}
function quizAdvance() {
  if (!quizState) return;
  if (!quizState.answered) {
    if (quizState.selected === null) return;
    const q = quizState.story.quiz[quizState.index];
    const correct = quizState.selected === q.answer;
    if (correct) quizState.score++;
    quizState.responses.push({ correct, explanation: q.explanation, question: q.question });
    quizState.answered = true;
    $$('[data-answer]').forEach(button => {
      const value = Number(button.dataset.answer);
      button.disabled = true;
      if (value === q.answer) button.classList.add('correct-answer');
      else if (value === quizState.selected) button.classList.add('wrong-answer');
    });
    const feedback = $('#answerFeedback');
    feedback.hidden = false;
    feedback.className = `answer-feedback ${correct ? 'good' : 'bad'}`;
    feedback.innerHTML = `<b>${correct ? 'That’s right!' : 'Not quite yet.'}</b> ${escapeHtml(q.explanation)}`;
    $('#quizNext').textContent = quizState.index === quizState.story.quiz.length - 1 ? 'SEE MY SCORE' : 'NEXT QUESTION';
  } else if (quizState.index < quizState.story.quiz.length - 1) {
    quizState.index++;
    renderQuizQuestion();
  } else showQuizResult();
}
function showQuizResult() {
  quizState.finished = true;
  const total = quizState.story.quiz.length;
  const score = quizState.score;
  const pct = Math.round(score / total * 100);
  currentProgress.completed = [...new Set([...(currentProgress.completed || []), quizState.story.id])];
  currentProgress.results = currentProgress.results || [];
  currentProgress.results.unshift({ storyId: quizState.story.id, title: quizState.story.title, score, total, date: new Date().toISOString() });
  currentProgress.results = currentProgress.results.slice(0, 12);
  saveProgress();
  void syncStudentProgress(quizState.story.id);
  renderProgress();
  $('#quizQuestionCounter').textContent = 'YOUR STORYVERSE RESULT';
  $('#quizProgressLabel').textContent = '100%';
  $('#quizProgressBar').style.width = '100%';
  $('#quizContent').hidden = true;
  $('#quizNext').hidden = true;
  const result = $('#quizResult');
  result.hidden = false;
  const message = pct >= 80 ? 'Excellent reading! You caught the important details and the bigger meaning.' : pct >= 60 ? 'Nice work! Review the explanations and notice what the story is teaching.' : 'Good effort. Revisit the scenes and try again to strengthen your understanding.';
  result.innerHTML = `<strong>${score} / ${total}</strong><p><b>${pct}% · ${pct >= 80 ? 'STORY EXPLORER' : pct >= 60 ? 'CURIOUS READER' : 'KEEP PRACTISING'}</b><br/>${message}</p><div class="quiz-review">${quizState.responses.map((r,i)=>`<div class="review-line ${r.correct?'good':'bad'}">${r.correct?'✓':'↻'} ${escapeHtml(r.question)} — ${escapeHtml(r.explanation)}</div>`).join('')}</div>`;
  const done = document.createElement('button');
  done.className = 'button button-primary';
  done.textContent = 'BACK TO STORYVERSE';
  done.style.marginTop = '17px';
  done.addEventListener('click', () => {
    closeModal('quizModal');
    activeStory = null;
    document.getElementById('progress').scrollIntoView({ behavior: 'smooth' });
  });
  result.appendChild(done);
}

function renderProgress() {
  currentProgress = currentProgress || { name:'', scenes:{}, completed:[], results:[] };
  const totalStories = storyData?.stories.length || 3;
  const scenes = storyData?.stories.reduce((sum,story)=>sum+Math.min(3,Number(currentProgress.scenes?.[story.id]||0)),0) || 0;
  const completed = currentProgress.completed?.length || 0;
  const results = currentProgress.results || [];
  const avg = results.length ? Math.round(results.reduce((sum,item)=>sum+(item.score/item.total*100),0)/results.length) : null;
  $('#statStories').textContent = `${completed}`;
  $('#statScenes').textContent = `${scenes}/${totalStories*3}`;
  $('#statAverage').textContent = avg === null ? '—' : `${avg}%`;
  $('#studentName').value = signedInProfile?.displayName || currentProgress.name || '';
  $('#studentName').placeholder = signedInUser ? 'Your account name' : 'Sign in to see your name';
  $('#profileSyncNote').textContent = signedInUser ? 'Your progress is connected to your STORYVERSE account.' : 'Progress is stored on this device until you sign in.';
  $('#storyProgressList').innerHTML = storyData.stories.map(story=>{
    const count = Math.min(3,Number(currentProgress.scenes?.[story.id]||0));
    return `<div class="progress-row"><span class="progress-row-title">${escapeHtml(story.title)}</span><small>${count}/3 scenes</small><div class="progress-bar"><span style="width:${count/3*100}%"></span></div></div>`;
  }).join('');
  $('#recentResults').innerHTML = results.length ? results.slice(0,5).map(item=>{
    const date = new Date(item.date);
    return `<div class="result-row"><div><div class="result-title">${escapeHtml(item.title)}</div><div class="result-date">${Number.isNaN(date.getTime())?'Recent attempt':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div></div><div class="result-score">${item.score}/${item.total}</div></div>`;
  }).join('') : '<p class="empty-note">No quiz results yet. Finish a story to see your score.</p>';
}

function openScanner() {
  openModal('scannerModal');
  $('#scannerStatus').textContent = 'Tap “Start camera” and allow camera access when your browser asks.';
  $('#startScanner').disabled = false;
  $('#startScanner').textContent = 'START CAMERA';
}
async function startQrScanner() {
  if (!window.Html5Qrcode) return showToast('The QR scanner could not load. Check your internet connection and reload.');
  if (!window.isSecureContext && location.hostname !== 'localhost') {
    $('#scannerStatus').textContent = 'Camera scanning requires HTTPS. Publish this site or open it on localhost. You can still upload a QR image.';
  }
  try {
    if (!scanner) scanner = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
    $('#startScanner').disabled = true;
    $('#scannerStatus').textContent = 'Requesting camera permission…';
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 }, decoded => handleQr(decoded), () => {});
    qrScannerRunning = true;
    $('#scannerStatus').textContent = 'Camera is on. Hold a STORYVERSE code inside the frame.';
    $('#startScanner').textContent = 'CAMERA READY';
  } catch (error) {
    console.error('QR camera error:', error);
    $('#startScanner').disabled = false;
    $('#scannerStatus').textContent = 'Could not start the camera. Check browser permission, HTTPS, and that another app is not using the camera. You can upload a QR image instead.';
  }
}
async function stopQrScanner() {
  if (scanner && qrScannerRunning) {
    try { await scanner.stop(); } catch {}
    qrScannerRunning = false;
  }
}
function storyIdFromQr(decoded) {
  const value = String(decoded || '').trim();
  if (findStory(value)) return value;
  if (/^storyverse:/i.test(value)) {
    const token = value.split(/[/:]/).filter(Boolean).pop();
    if (findStory(token)) return token;
  }
  try {
    const url = new URL(value);
    const id = url.searchParams.get('story') || url.pathname.split('/').filter(Boolean).pop();
    if (findStory(id)) return id;
  } catch {}
  const match = value.match(/(?:story=|storyverse[:/])([a-z0-9_-]+)/i);
  if (match && findStory(match[1])) return match[1];
  return null;
}
async function handleQr(decoded) {
  const id = storyIdFromQr(decoded);
  if (!id) {
    $('#scannerStatus').textContent = 'That QR code is not a STORYVERSE story code. Try one of the codes in this library.';
    return;
  }
  await stopQrScanner();
  closeModal('scannerModal');
  showToast(`Story found: ${findStory(id).title}`);
  openStory(id);
}
async function scanQrImage(file) {
  if (!file || !window.Html5Qrcode) return;
  try {
    if (!scanner) scanner = new Html5Qrcode('qr-reader', { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
    $('#scannerStatus').textContent = 'Reading QR image…';
    const decoded = await scanner.scanFile(file, true);
    await handleQr(decoded);
  } catch (error) {
    console.warn('QR image scan failed:', error);
    $('#scannerStatus').textContent = 'Could not read a QR code from that image. Try a clearer, well-lit photo.';
  }
}

function openEditor() {
  $('#editorJson').value = JSON.stringify(storyData, null, 2);
  $('#editorStatus').textContent = 'Tip: keep exactly 3 scenes per story. Each quiz answer is the zero-based choice index (A = 0).';
  openModal('editorModal');
}
function saveEditorPreview() {
  try {
    const parsed = JSON.parse($('#editorJson').value);
    validateStoryData(parsed);
    storyData = parsed;
    localStorage.setItem(EDITOR_KEY, JSON.stringify(storyData));
    renderStoryLibrary();
    renderProgress();
    $('#editorStatus').textContent = 'Saved to this browser. Export the JSON and replace data/stories.json to publish your changes for everyone.';
    showToast('Story edits saved in this browser.');
  } catch (error) {
    $('#editorStatus').textContent = `Could not save: ${error.message}`;
    showToast('Check your JSON formatting and required story fields.');
  }
}
function resetEditor() {
  storyData = structuredClone(baseData);
  localStorage.removeItem(EDITOR_KEY);
  $('#editorJson').value = JSON.stringify(storyData, null, 2);
  renderStoryLibrary();
  renderProgress();
  $('#editorStatus').textContent = 'Restored the original stories for this browser.';
}
function downloadStoriesJson() {
  try {
    const parsed = JSON.parse($('#editorJson').value);
    validateStoryData(parsed);
    const blob = new Blob([JSON.stringify(parsed,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stories.json'; a.click();
    URL.revokeObjectURL(url);
    $('#editorStatus').textContent = 'Exported stories.json. Replace the file in your site’s data folder to publish edits.';
  } catch (error) {
    $('#editorStatus').textContent = `Export failed: ${error.message}`;
  }
}



// ---------------- STORYVERSE accounts + private classrooms ----------------
function firebaseConfiguredMessage() {
  return 'Firebase is not connected yet. Complete the Firebase setup and add your web-app config to firebase-config.js.';
}
function openAuthModal(mode = 'login') {
  setAuthMode(mode);
  $('#authName').value = '';
  $('#authPassword').value = '';
  $('#authConfirm').value = '';
  $('#authError').textContent = '';
  $('#authError').className = 'auth-error';
  openModal('authModal');
}
function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  $$('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === authMode));
  $('#authTitle').innerHTML = authMode === 'register' ? 'Create your <em>account.</em>' : 'Welcome <em>back.</em>';
  $('#authIntro').textContent = authMode === 'register'
    ? 'Choose your role, then create your name-and-password account.'
    : 'Log in with your name and password to continue your reading journey.';
  $('#authRoleWrap').hidden = authMode !== 'register';
  $('#authConfirmWrap').hidden = authMode !== 'register';
  $('#authPassword').setAttribute('autocomplete', authMode === 'register' ? 'new-password' : 'current-password');
  $('#authSubmit').textContent = authMode === 'register' ? 'CREATE ACCOUNT' : 'LOG IN';
  $('#authError').textContent = '';
}
function normalizeAccountName(name) {
  return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}
async function accountEmailForName(name) {
  const normalized = normalizeAccountName(name);
  if (!normalized) throw new Error('Enter your name first.');
  const bytes = new TextEncoder().encode(normalized);
  let digest;
  if (globalThis.crypto?.subtle) {
    digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return `sv-${hex}@storyverse.invalid`;
  }
  // Fallback for older browsers; HTTPS browsers normally support Web Crypto.
  let hash = 2166136261;
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); }
  return `sv-${(hash >>> 0).toString(16)}-${normalized.length}@storyverse.invalid`;
}
function setAuthMessage(message, success = false) {
  $('#authError').textContent = message || '';
  $('#authError').className = success ? 'auth-error success' : 'auth-error';
}
function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use': 'That name is already registered. Try logging in, or use a different unique name.',
    'auth/invalid-credential': 'The name or password is incorrect.',
    'auth/user-not-found': 'No account was found with that name. Create an account first.',
    'auth/wrong-password': 'The name or password is incorrect.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
    'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication settings.',
    'auth/network-request-failed': 'Network problem. Check your internet connection and try again.',
    'permission-denied': 'Firebase blocked this action. Check that the Firestore security rules were published.'
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}
async function initializeFirebase() {
  if (!isFirebaseConfigured) {
    updateAccountButton();
    renderClassroomPanel();
    return;
  }
  try {
    const version = FIREBASE_SDK_VERSION;
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`)
    ]);
    const firebaseApp = appModule.initializeApp(firebaseConfig);
    firebaseAuth = authModule.getAuth(firebaseApp);
    firebaseDb = firestoreModule.getFirestore(firebaseApp);
    firebaseApi = { ...authModule, ...firestoreModule };
    authModule.onAuthStateChanged(firebaseAuth, async user => {
      if (authActionInProgress) return;
      await handleAuthState(user);
    });
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    updateAccountButton();
    renderClassroomPanel('Firebase could not connect. Check your firebase-config.js values and internet connection.');
  }
}
async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!isFirebaseConfigured || !firebaseAuth || !firebaseDb) {
    setAuthMessage(firebaseConfiguredMessage());
    return;
  }
  const name = $('#authName').value.trim();
  const password = $('#authPassword').value;
  if (name.length < 2) return setAuthMessage('Enter a name with at least 2 characters.');
  if (password.length < 8) return setAuthMessage('Use a password with at least 8 characters.');
  const button = $('#authSubmit');
  button.disabled = true;
  button.textContent = authMode === 'register' ? 'CREATING…' : 'LOGGING IN…';
  try {
    const email = await accountEmailForName(name);
    authActionInProgress = true;
    if (authMode === 'register') {
      const confirm = $('#authConfirm').value;
      if (password !== confirm) throw new Error('Your passwords do not match.');
      const role = $('#authRole').value === 'teacher' ? 'teacher' : 'student';
      const credential = await firebaseApi.createUserWithEmailAndPassword(firebaseAuth, email, password);
      try {
        await firebaseApi.setDoc(firebaseApi.doc(firebaseDb, 'users', credential.user.uid), {
          displayName: name.replace(/\s+/g, ' ').slice(0, 70),
          role,
          joinedClassCodes: [],
          createdAt: firebaseApi.serverTimestamp()
        });
      } catch (profileError) {
        await firebaseApi.deleteUser(credential.user).catch(() => {});
        throw profileError;
      }
      authActionInProgress = false;
      await handleAuthState(credential.user);
      closeModal('authModal');
      showToast(`Welcome to STORYVERSE, ${name}!`);
    } else {
      const credential = await firebaseApi.signInWithEmailAndPassword(firebaseAuth, email, password);
      authActionInProgress = false;
      await handleAuthState(credential.user);
      closeModal('authModal');
      showToast(`Welcome back, ${signedInProfile?.displayName || name}!`);
    }
  } catch (error) {
    authActionInProgress = false;
    setAuthMessage(firebaseErrorMessage(error));
  } finally {
    button.disabled = false;
    button.textContent = authMode === 'register' ? 'CREATE ACCOUNT' : 'LOG IN';
  }
}
async function handleAuthState(user) {
  signedInUser = user || null;
  signedInProfile = null;
  if (!user) {
    currentProgress = readProgress(STORAGE_KEY);
    updateAccountButton();
    renderProgress();
    await renderClassroomPanel();
    return;
  }
  try {
    const profileSnap = await firebaseApi.getDoc(firebaseApi.doc(firebaseDb, 'users', user.uid));
    if (!profileSnap.exists()) throw new Error('Your account profile is missing. Please contact the project editor.');
    signedInProfile = profileSnap.data();
    currentProgress = readProgress(`${STORAGE_KEY}-${user.uid}`);
    currentProgress.name = signedInProfile.displayName || '';
    await loadCloudProgress();
    saveProgress();
    updateAccountButton();
    renderProgress();
    await renderClassroomPanel();
    if (signedInProfile.role === 'student') void syncStudentProgress();
  } catch (error) {
    console.error('Could not load account profile:', error);
    showToast(firebaseErrorMessage(error));
  }
}
async function logoutAccount() {
  if (!firebaseAuth) return;
  try {
    await firebaseApi.signOut(firebaseAuth);
    showToast('You are now signed out.');
  } catch (error) { showToast(firebaseErrorMessage(error)); }
}
function updateAccountButton() {
  const button = $('#accountButton');
  if (!button) return;
  button.textContent = signedInUser ? `LOG OUT · ${(signedInProfile?.displayName || 'ACCOUNT').toLocaleUpperCase().slice(0, 15)}` : 'LOG IN / SIGN UP';
  button.title = signedInUser ? 'Sign out of STORYVERSE' : 'Log in or create a STORYVERSE account';
}
async function loadCloudProgress() {
  if (!signedInUser || !firebaseDb) return;
  const snap = await firebaseApi.getDocs(firebaseApi.collection(firebaseDb, 'users', signedInUser.uid, 'progress'));
  const scenes = { ...(currentProgress.scenes || {}) };
  const completed = new Set(currentProgress.completed || []);
  const results = [];
  snap.forEach(docSnap => {
    const record = docSnap.data();
    scenes[docSnap.id] = Math.max(Number(scenes[docSnap.id] || 0), Number(record.scenesCompleted || 0));
    if (record.completed) completed.add(docSnap.id);
    (record.attempts || []).forEach(attempt => results.push({ storyId: docSnap.id, title: record.title || docSnap.id, score: Number(attempt.score || 0), total: Number(attempt.total || 0), date: attempt.date || new Date().toISOString() }));
  });
  currentProgress.scenes = scenes;
  currentProgress.completed = [...completed];
  currentProgress.results = [...results, ...(currentProgress.results || [])]
    .filter((item, index, all) => all.findIndex(other => other.storyId === item.storyId && other.date === item.date && other.score === item.score) === index)
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
}
function syncStudentProgress(storyId = null) {
  if (!signedInUser || signedInProfile?.role !== 'student' || !firebaseDb) return Promise.resolve();
  progressSyncQueue = progressSyncQueue.then(() => performStudentProgressSync(storyId)).catch(error => {
    console.error('Student progress sync failed:', error);
    showToast('Your progress is saved on this device, but could not sync to the classroom. Check your connection and try Refresh.');
  });
  return progressSyncQueue;
}
async function performStudentProgressSync(storyId = null) {
  if (!signedInUser || signedInProfile?.role !== 'student' || !firebaseDb) return;
  const stories = storyId ? (storyData?.stories || []).filter(item => item.id === storyId) : (storyData?.stories || []);
  const joinedCodes = signedInProfile.joinedClassCodes || [];
  for (const story of stories) {
    const attempts = (currentProgress.results || []).filter(item => item.storyId === story.id).slice(0, 20).map(item => ({ score: Number(item.score || 0), total: Number(item.total || 0), date: item.date || new Date().toISOString() }));
    const record = {
      storyId: story.id,
      title: story.title,
      scenesCompleted: Math.min(3, Number(currentProgress.scenes?.[story.id] || 0)),
      completed: (currentProgress.completed || []).includes(story.id),
      attempts,
      latestScore: attempts[0]?.score ?? null,
      latestTotal: attempts[0]?.total ?? null,
      latestPercent: attempts[0] && attempts[0].total ? Math.round(attempts[0].score / attempts[0].total * 100) : null,
      updatedAt: firebaseApi.serverTimestamp()
    };
    await firebaseApi.setDoc(firebaseApi.doc(firebaseDb, 'users', signedInUser.uid, 'progress', story.id), record, { merge: true });
    for (const code of joinedCodes) {
      await firebaseApi.setDoc(firebaseApi.doc(firebaseDb, 'classrooms', code, 'members', signedInUser.uid, 'progress', story.id), record, { merge: true });
    }
  }
}
function generateClassCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
}
async function handleClassroomSubmit(event) {
  const form = event.target.closest('form[data-classroom-form]');
  if (!form) return;
  event.preventDefault();
  if (!signedInUser || !signedInProfile) return openAuthModal('login');
  const status = form.querySelector('.classroom-form-status');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (form.dataset.classroomForm === 'create') {
      if (signedInProfile.role !== 'teacher') throw new Error('Only teacher accounts can create classrooms.');
      const input = form.querySelector('[name="className"]');
      const className = input.value.trim();
      if (className.length < 2) throw new Error('Enter a classroom name with at least 2 characters.');
      let code = generateClassCode();
      let ref = firebaseApi.doc(firebaseDb, 'classrooms', code);
      for (let attempt = 0; attempt < 4 && (await firebaseApi.getDoc(ref)).exists(); attempt++) {
        code = generateClassCode(); ref = firebaseApi.doc(firebaseDb, 'classrooms', code);
      }
      await firebaseApi.setDoc(ref, { ownerUid: signedInUser.uid, teacherName: signedInProfile.displayName, className: className.slice(0, 60), isActive: true, createdAt: firebaseApi.serverTimestamp() });
      showToast(`Class created! Share code ${code} with your students.`);
      await renderClassroomPanel();
    } else if (form.dataset.classroomForm === 'join') {
      if (signedInProfile.role !== 'student') throw new Error('Teacher accounts cannot join a classroom as students.');
      const code = form.querySelector('[name="classCode"]').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 6) throw new Error('Enter the classroom code shared by your teacher.');
      if ((signedInProfile.joinedClassCodes || []).includes(code)) throw new Error('You are already in this classroom.');
      const classRef = firebaseApi.doc(firebaseDb, 'classrooms', code);
      const classSnap = await firebaseApi.getDoc(classRef);
      if (!classSnap.exists() || !classSnap.data().isActive) throw new Error('That classroom code was not found or is no longer active. Check the code and try again.');
      const memberRef = firebaseApi.doc(firebaseDb, 'classrooms', code, 'members', signedInUser.uid);
      const memberSnap = await firebaseApi.getDoc(memberRef);
      if (!memberSnap.exists()) await firebaseApi.setDoc(memberRef, { uid: signedInUser.uid, studentName: signedInProfile.displayName, joinedAt: firebaseApi.serverTimestamp() });
      await firebaseApi.updateDoc(firebaseApi.doc(firebaseDb, 'users', signedInUser.uid), { joinedClassCodes: firebaseApi.arrayUnion(code) });
      signedInProfile.joinedClassCodes = [...new Set([...(signedInProfile.joinedClassCodes || []), code])];
      await syncStudentProgress();
      showToast(`You joined ${classSnap.data().className}!`);
      await renderClassroomPanel();
    }
  } catch (error) {
    if (status) status.textContent = firebaseErrorMessage(error);
    else showToast(firebaseErrorMessage(error));
  } finally { button.disabled = false; }
}
async function handleClassroomClick(event) {
  const copyButton = event.target.closest('[data-copy-class]');
  if (copyButton) {
    const code = copyButton.dataset.copyClass;
    try { await navigator.clipboard.writeText(code); showToast('Class code copied.'); }
    catch { showToast(`Class code: ${code}`); }
  }
  const refreshButton = event.target.closest('[data-refresh-classrooms]');
  if (refreshButton) await renderClassroomPanel();
}
function renderClassroomPanel(message = '') {
  const panel = $('#classroomPanel');
  if (!panel) return;
  if (!signedInUser || !signedInProfile) {
    panel.innerHTML = `<div class="classroom-empty"><div class="classroom-empty-icon">✦</div><h3>${message ? 'Connect your classroom.' : 'Your STORYVERSE classroom starts here.'}</h3><p>${escapeHtml(message || (isFirebaseConfigured ? 'Log in or create a teacher or student account to open your private learning space.' : 'Finish connecting Firebase to activate accounts, class codes, and synced progress. Your stories remain available while you set it up.'))}</p><button class="button button-primary" id="classroomLoginButton">LOG IN / CREATE ACCOUNT</button></div>`;
    $('#classroomLoginButton')?.addEventListener('click', () => openAuthModal('login'));
    return;
  }
  if (signedInProfile.role === 'teacher') {
    panel.innerHTML = `<div class="classroom-head"><div><span class="classroom-eyebrow">TEACHER WORKSPACE</span><h3>Hello, ${escapeHtml(signedInProfile.displayName)}.</h3><p>Create a private classroom and share its code with your students. Only enrolled students' reading data appears here.</p></div><div><span class="classroom-user-pill">TEACHER ACCOUNT</span><button type="button" class="button button-secondary classroom-refresh" data-refresh-classrooms>REFRESH DATA ↻</button></div></div><div class="classroom-actions"><div class="classroom-action-card"><h4>Create a classroom</h4><p>Each classroom has its own private join code.</p><form class="classroom-form" data-classroom-form="create"><input name="className" maxlength="60" placeholder="Example: Grade 8 – English" required/><button class="button button-primary" type="submit">CREATE CLASS</button></form><div class="classroom-form-status" role="status"></div></div><div class="classroom-action-card"><h4>What you can monitor</h4><p>Student names, completed scenes, quiz attempts, latest scores, and score history are synchronized after students finish each scene or quiz.</p><div class="classroom-footer-note">Use study codes or approved display names for student accounts. Share each class code only with the intended class.</div></div></div><div class="classroom-list" id="teacherClassList"><p class="classroom-empty-note">Loading your classrooms…</p></div>`;
    void loadTeacherClassrooms();
  } else {
    panel.innerHTML = `<div class="classroom-head"><div><span class="classroom-eyebrow">STUDENT WORKSPACE</span><h3>Welcome, ${escapeHtml(signedInProfile.displayName)}.</h3><p>Join your teacher's private class with the code they shared. Your quiz and reading progress will be visible to that classroom's teacher.</p></div><div><span class="classroom-user-pill">STUDENT ACCOUNT</span><button type="button" class="button button-secondary classroom-refresh" data-refresh-classrooms>REFRESH DATA ↻</button></div></div><div class="classroom-action-card"><h4>Join a classroom</h4><p>Ask your teacher for the private class code.</p><form class="classroom-form" data-classroom-form="join"><input name="classCode" maxlength="12" placeholder="Enter class code" autocomplete="off" required/><button class="button button-primary" type="submit">JOIN CLASS</button></form><div class="classroom-form-status" role="status"></div></div><div class="classroom-list" id="studentClassList"><p class="classroom-empty-note">Loading your classrooms…</p></div>`;
    void loadStudentClassrooms();
  }
}
async function loadTeacherClassrooms() {
  if (!signedInUser || signedInProfile?.role !== 'teacher' || !firebaseDb) return;
  const token = ++classroomRefreshToken;
  const host = $('#teacherClassList');
  if (!host) return;
  try {
    const classQuery = firebaseApi.query(firebaseApi.collection(firebaseDb, 'classrooms'), firebaseApi.where('ownerUid', '==', signedInUser.uid));
    const classSnap = await firebaseApi.getDocs(classQuery);
    if (token !== classroomRefreshToken || !$('#teacherClassList')) return;
    if (classSnap.empty) { host.innerHTML = '<p class="classroom-empty-note">No classrooms yet. Create your first class above, then share its code with students.</p>'; return; }
    const records = [];
    for (const classDoc of classSnap.docs) {
      const classroom = classDoc.data();
      const membersSnap = await firebaseApi.getDocs(firebaseApi.collection(firebaseDb, 'classrooms', classDoc.id, 'members'));
      const students = [];
      let percentTotal = 0, percentCount = 0, sceneTotal = 0;
      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data();
        const progressSnap = await firebaseApi.getDocs(firebaseApi.collection(firebaseDb, 'classrooms', classDoc.id, 'members', memberDoc.id, 'progress'));
        const allAttempts = [];
        let studentScenes = 0, storiesDone = 0;
        progressSnap.forEach(progressDoc => {
          const progress = progressDoc.data();
          studentScenes += Math.min(3, Number(progress.scenesCompleted || 0));
          if (progress.completed) storiesDone++;
          (progress.attempts || []).forEach(attempt => allAttempts.push({ ...attempt, title: progress.title || progressDoc.id }));
        });
        allAttempts.sort((a,b)=>new Date(b.date)-new Date(a.date));
        const latest = allAttempts[0];
        if (latest && latest.total) { percentTotal += latest.score/latest.total*100; percentCount++; }
        sceneTotal += studentScenes;
        students.push({ name: member.studentName || 'Student', scenes: studentScenes, storiesDone, latest, attempts: allAttempts });
      }
      records.push({ code: classDoc.id, ...classroom, students, average: percentCount ? Math.round(percentTotal/percentCount) : null, sceneTotal });
    }
    host.innerHTML = records.map(classroom => {
      const rows = classroom.students.length ? classroom.students.map(student => {
        const ordered = [...student.attempts].sort((a,b)=>new Date(a.date)-new Date(b.date));
        const trend = ordered.length ? ordered.map(attempt => attempt.total ? `${Math.round(attempt.score/attempt.total*100)}%` : '—').join(' → ') : 'No results yet';
        return `<tr><td>${escapeHtml(student.name)}</td><td>${student.storiesDone}</td><td>${student.scenes}/9</td><td class="classroom-score">${student.latest && student.latest.total ? `${Math.round(student.latest.score/student.latest.total*100)}%` : '—'}</td><td>${student.attempts.length}</td><td>${escapeHtml(trend)}</td></tr>`;
      }).join('') : '<tr><td colspan="6">No students have joined this classroom yet.</td></tr>';
      return `<article class="classroom-card"><div class="classroom-card-top"><div><h4>${escapeHtml(classroom.className || 'Untitled classroom')}</h4><small>${classroom.students.length} student${classroom.students.length===1?'':'s'} · Created classroom</small></div><div class="classroom-code">${escapeHtml(classroom.code)} <button type="button" data-copy-class="${escapeHtml(classroom.code)}">COPY</button></div></div><div class="classroom-card-metrics"><span class="classroom-metric">Students <b>${classroom.students.length}</b></span><span class="classroom-metric">Scenes completed <b>${classroom.sceneTotal}</b></span><span class="classroom-metric">Latest-score average <b>${classroom.average === null ? '—' : `${classroom.average}%`}</b></span></div><div class="classroom-table-wrap"><table class="classroom-table"><thead><tr><th>STUDENT</th><th>STORIES</th><th>SCENES</th><th>LATEST SCORE</th><th>ATTEMPTS</th><th>SCORE TREND · OLD TO NEW</th></tr></thead><tbody>${rows}</tbody></table></div><p class="classroom-footer-note">Score history is retained per student. Use the trend column to compare older and newer quiz attempts. Press Refresh data to fetch the latest classroom activity.</p></article>`;
    }).join('');
  } catch (error) {
    console.error('Teacher classroom load failed:', error);
    if (host) host.innerHTML = `<p class="classroom-empty-note">Could not load your classes: ${escapeHtml(firebaseErrorMessage(error))}</p>`;
  }
}
async function loadStudentClassrooms() {
  if (!signedInUser || signedInProfile?.role !== 'student' || !firebaseDb) return;
  const host = $('#studentClassList');
  if (!host) return;
  const codes = signedInProfile.joinedClassCodes || [];
  if (!codes.length) { host.innerHTML = '<p class="classroom-empty-note">You have not joined a classroom yet. Enter your teacher’s code above. You can still explore stories while you wait.</p>'; return; }
  try {
    const cards = [];
    for (const code of codes) {
      const classSnap = await firebaseApi.getDoc(firebaseApi.doc(firebaseDb, 'classrooms', code));
      if (!classSnap.exists()) continue;
      const classroom = classSnap.data();
      const progressSnap = await firebaseApi.getDocs(firebaseApi.collection(firebaseDb, 'classrooms', code, 'members', signedInUser.uid, 'progress'));
      let scenes = 0, complete = 0, attempts = 0, score = 0, total = 0;
      progressSnap.forEach(docSnap => {
        const item = docSnap.data();
        scenes += Math.min(3, Number(item.scenesCompleted || 0));
        if (item.completed) complete++;
        (item.attempts || []).forEach(attempt => { attempts++; score += Number(attempt.score || 0); total += Number(attempt.total || 0); });
      });
      cards.push(`<article class="classroom-card"><div class="classroom-card-top"><div><h4>${escapeHtml(classroom.className || 'Classroom')}</h4><small>Teacher: ${escapeHtml(classroom.teacherName || 'Teacher')}</small></div><span class="classroom-join-code">${escapeHtml(code)}</span></div><div class="classroom-card-metrics"><span class="classroom-metric">Scenes completed <b>${scenes}/9</b></span><span class="classroom-metric">Stories completed <b>${complete}</b></span><span class="classroom-metric">Quiz average <b>${total ? `${Math.round(score/total*100)}%` : '—'}</b></span></div><p class="classroom-footer-note">Your progress is synchronized with this classroom's teacher dashboard.</p></article>`);
    }
    host.innerHTML = cards.join('') || '<p class="classroom-empty-note">Your classrooms could not be found. Check with your teacher for an updated code.</p>';
  } catch (error) {
    console.error('Student classroom load failed:', error);
    host.innerHTML = `<p class="classroom-empty-note">Could not load your classrooms: ${escapeHtml(firebaseErrorMessage(error))}</p>`;
  }
}

function wireEvents() {
  $('#heroScan').addEventListener('click',openScanner);
  $('#navScan').addEventListener('click',openScanner);
  $('#closeScanner').addEventListener('click',async()=>{await stopQrScanner();closeModal('scannerModal');});
  $('#startScanner').addEventListener('click',startQrScanner);
  $('#qrImageInput').addEventListener('change',event=>scanQrImage(event.target.files?.[0]));
  $('#openFirstStory').addEventListener('click',async()=>{await stopQrScanner();closeModal('scannerModal');openStory(storyData.stories[0].id);});
  $('#closeStory').addEventListener('click',()=>{stopNarration();stopMusic();disposeThree();closeModal('storyModal');});
  $('#nextScene').addEventListener('click',nextScene);
  $('#narrationToggle').addEventListener('click',toggleNarration);
  $('#musicToggle').addEventListener('click',toggleMusic);
  $('#pronounceButton').addEventListener('click',()=>showToast('Tap a vocabulary word above to hear it pronounced.'));
  $('#saveName').addEventListener('click',()=>{
    if (!signedInUser) openAuthModal('login');
    else showToast(`Signed in as ${signedInProfile?.displayName || 'STORYVERSE reader'}.`);
  });
  $('#accountButton').addEventListener('click',()=> signedInUser ? logoutAccount() : openAuthModal('login'));
  $('#classroomLoginButton').addEventListener('click',()=>openAuthModal('login'));
  $('#closeAuth').addEventListener('click',()=>closeModal('authModal'));
  $$('[data-close="auth"]').forEach(el=>el.addEventListener('click',()=>closeModal('authModal')));
  $$('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>setAuthMode(button.dataset.authMode)));
  $('#authForm').addEventListener('submit',handleAuthSubmit);
  $('#classroomPanel').addEventListener('submit',handleClassroomSubmit);
  $('#classroomPanel').addEventListener('click',handleClassroomClick);
  $('#quizNext').addEventListener('click',quizAdvance);
  $('#openEditor').addEventListener('click',openEditor);
  $('#closeEditor').addEventListener('click',()=>closeModal('editorModal'));
  $('#saveEditor').addEventListener('click',saveEditorPreview);
  $('#resetEditor').addEventListener('click',resetEditor);
  $('#downloadStories').addEventListener('click',downloadStoriesJson);
  $('#mobileMenuButton').addEventListener('click',()=>{
    const nav=$('#mainNav'); const isOpen=nav.classList.toggle('open');
    $('#mobileMenuButton').setAttribute('aria-expanded',String(isOpen));
    $('#mobileMenuButton').textContent=isOpen?'×':'☰';
  });
  $$('.main-nav a').forEach(a=>a.addEventListener('click',()=>{$('#mainNav').classList.remove('open');$('#mobileMenuButton').setAttribute('aria-expanded','false');$('#mobileMenuButton').textContent='☰';}));
  $$('[data-close="story"]').forEach(el=>el.addEventListener('click',()=>$('#closeStory').click()));
  $$('[data-close="scanner"]').forEach(el=>el.addEventListener('click',()=>$('#closeScanner').click()));
  $$('[data-close="editor"]').forEach(el=>el.addEventListener('click',()=>closeModal('editorModal')));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if($('#scannerModal').classList.contains('open'))$('#closeScanner').click();
      if($('#storyModal').classList.contains('open'))$('#closeStory').click();
      if($('#editorModal').classList.contains('open'))closeModal('editorModal');
      if($('#authModal').classList.contains('open'))closeModal('authModal');
    }
  });
  window.addEventListener('beforeunload',()=>{stopNarration();stopMusic();disposeThree();});
}

$('#yearNow').textContent = new Date().getFullYear();
currentProgress = currentProgress || {name:'',scenes:{},completed:[],results:[]};
wireEvents();
void initializeFirebase();
window.addEventListener('load', () => { if (storyData?.stories) storyData.stories.forEach(makeQr); });
loadStories().catch(error=>{
  console.error(error);
  $('#storyGrid').innerHTML = `<div class="loading-card">We couldn’t load the story library. Please run STORYVERSE from a web server and check that data/stories.json is present. (${escapeHtml(error.message)})</div>`;
});
