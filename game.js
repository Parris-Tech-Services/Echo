/* ================================================================
   ECHO VAULT — mobile-ready
   Top-down arena shooter built around recording and replaying
   the player's last 3 seconds as ghostly "echoes" that fight for you.
   ================================================================ */

(() => {
'use strict';

// ---------------- Canvas & constants ----------------
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

// Logical game resolution (gameplay is designed around this)
const W = 960;
const H = 640;

const ARENA_PAD = 32;
const ARENA = { x: ARENA_PAD, y: ARENA_PAD, w: W - ARENA_PAD*2, h: H - ARENA_PAD*2 };

const ECHO_WINDOW = 3.0;
const ECHO_COOLDOWN = 2.5;
const ECHO_MAX = 3;
const DASH_COOLDOWN = 1.2;
const DASH_DURATION = 0.18;
const DASH_SPEED    = 620;
const PLAYER_SPEED  = 240;
const BULLET_SPEED  = 520;
const FIRE_RATE     = 0.18;

// ---------------- Device detection ----------------
const isTouch = ('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                window.matchMedia('(pointer: coarse)').matches;

if (isTouch) {
  document.body.classList.add('touch-device');
  document.getElementById('touch-ui').classList.remove('hidden');
}

// ---------------- Responsive canvas scaling ----------------
// We render to a logical 960x640 buffer. On resize we compute how to fit
// it into the viewport (letterbox preserving aspect ratio) and set the
// canvas's backing store to match DPR for crispness.

let scale = 1;          // logical -> CSS px scale
let offsetX = 0;        // CSS px offset of the play area inside the canvas
let offsetY = 0;
let cssWidth = W;
let cssHeight = H;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  let vw, vh;

  if (isTouch || window.innerWidth < 900) {
    vw = window.innerWidth;
    vh = window.innerHeight;
  } else {
    // On desktop keep 960x640 unless viewport is smaller
    vw = Math.min(window.innerWidth, 960);
    vh = Math.min(window.innerHeight, 640);
  }

  cssWidth = vw;
  cssHeight = vh;

  // Compute how big the logical 960x640 area should be, preserving aspect
  const s = Math.min(vw / W, vh / H);
  scale = s;
  offsetX = (vw - W * s) / 2;
  offsetY = (vh - H * s) / 2;

  // Set canvas CSS size to the full viewport area
  canvas.style.width  = vw + 'px';
  canvas.style.height = vh + 'px';

  // Backing store in device pixels
  canvas.width  = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);

  // Prepare a base transform that maps logical 960x640 to the centered
  // scaled region. We'll set this before each frame.
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
resize();

function applyWorldTransform() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(
    scale * dpr, 0,
    0, scale * dpr,
    offsetX * dpr, offsetY * dpr
  );
}

function clearCanvas() {
  // Work in backing pixels for the clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05070f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------------- Utilities ----------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b));
const dist2 = (ax, ay, bx, by) => { const dx = ax-bx, dy = ay-by; return dx*dx + dy*dy; };

// ---------------- Keyboard input ----------------
const keys = new Set();
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if (k === 'p')     Game.togglePause();
  if (k === 'enter') Game.handleEnter();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// ---------------- Touch joysticks ----------------
const Touch = {
  left:  { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0, maxR: 50 },
  right: { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0, maxR: 50 },
  dashPressed: false,
  echoPressed: false,
  dashConsumed: false,
  echoConsumed: false,
};

function setupStick(el, key) {
  const knob = el.querySelector('.stick-knob');
  const s = Touch[key];

  function getBase() {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  function start(e) {
    e.preventDefault();
    const t = e.changedTouches ? e.changedTouches[0] : e;
    s.active = true;
    s.id = e.changedTouches ? t.identifier : 'mouse';
    const base = getBase();
    s.baseX = base.x; s.baseY = base.y;
    update(t.clientX, t.clientY);
    el.classList.add('active');
  }

  function move(e) {
    if (!s.active) return;
    let t;
    if (e.changedTouches) {
      for (const touch of e.changedTouches) {
        if (touch.identifier === s.id) { t = touch; break; }
      }
      if (!t) return;
    } else t = e;
    e.preventDefault();
    update(t.clientX, t.clientY);
  }

  function end(e) {
    if (!s.active) return;
    if (e.changedTouches) {
      let matched = false;
      for (const touch of e.changedTouches) {
        if (touch.identifier === s.id) { matched = true; break; }
      }
      if (!matched) return;
    }
    e.preventDefault();
    s.active = false;
    s.id = null;
    s.dx = 0; s.dy = 0;
    knob.style.transform = 'translate(0px, 0px)';
    el.classList.remove('active');
  }

  function update(cx, cy) {
    let dx = cx - s.baseX;
    let dy = cy - s.baseY;
    const d = Math.hypot(dx, dy);
    if (d > s.maxR) {
      dx = (dx / d) * s.maxR;
      dy = (dy / d) * s.maxR;
    }
    s.dx = dx / s.maxR;
    s.dy = dy / s.maxR;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchmove',  move,  { passive: false });
  el.addEventListener('touchend',   end,   { passive: false });
  el.addEventListener('touchcancel',end,   { passive: false });
}

if (isTouch) {
  setupStick(document.getElementById('stick-left'),  'left');
  setupStick(document.getElementById('stick-right'), 'right');

  const btnDash = document.getElementById('btn-dash');
  const btnEcho = document.getElementById('btn-echo');
  const btnPause= document.getElementById('btn-pause');

  const pressBtn = (btn, onPress) => {
    const fire = (e) => {
      e.preventDefault();
      onPress();
    };
    btn.addEventListener('touchstart', fire, { passive: false });
    btn.addEventListener('click', fire);
  };

  pressBtn(btnDash, () => { Touch.dashPressed = true; Touch.dashConsumed = false; });
  pressBtn(btnEcho, () => { Touch.echoPressed = true; Touch.echoConsumed = false; });
  pressBtn(btnPause, () => Game.togglePause());
}

function readInput() {
  const mv = { x: 0, y: 0 };
  const aim = { x: 0, y: 0 };
  let dash = false, echo = false, fire = false;

  // Keyboard
  if (keys.has('w')) mv.y -= 1;
  if (keys.has('s')) mv.y += 1;
  if (keys.has('a')) mv.x -= 1;
  if (keys.has('d')) mv.x += 1;

  if (keys.has('arrowup'))    aim.y -= 1;
  if (keys.has('arrowdown'))  aim.y += 1;
  if (keys.has('arrowleft'))  aim.x -= 1;
  if (keys.has('arrowright')) aim.x += 1;

  if (keys.has(' ')) dash = true;
  if (keys.has('shift')) echo = true;

  // Touch joysticks (override if active)
  if (Touch.left.active) {
    mv.x = Touch.left.dx;
    mv.y = Touch.left.dy;
  }
  if (Touch.right.active) {
    const m = Math.hypot(Touch.right.dx, Touch.right.dy);
    if (m > 0.2) {
      aim.x = Touch.right.dx / m;
      aim.y = Touch.right.dy / m;
    }
  }

  // Touch buttons (edge-triggered for dash/echo)
  if (Touch.dashPressed && !Touch.dashConsumed) {
    dash = true;
    Touch.dashConsumed = true;
    Touch.dashPressed = false;
  }
  if (Touch.echoPressed && !Touch.echoConsumed) {
    echo = true;
    Touch.echoConsumed = true;
    Touch.echoPressed = false;
  }

  fire = (aim.x !== 0 || aim.y !== 0);

  return { move: mv, aim, fire, dash, echo };
}

// ---------------- Audio ----------------
const Audio = (() => {
  let actx = null;
  function ensure() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  // Unlock on first gesture (mobile requirement)
  const unlock = () => { ensure(); window.removeEventListener('touchstart', unlock); window.removeEventListener('click', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);

  function blip(freq, dur, type='square', vol=0.08, slideTo=null) {
    const a = ensure(); if (!a) return;
    const t0 = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol=0.08, bp=1200) {
    const a = ensure(); if (!a) return;
    const t0 = a.currentTime;
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2 - 1);
    const src = a.createBufferSource(); src.buffer = buf;
    const bpf = a.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = bp; bpf.Q.value = 0.9;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bpf); bpf.connect(gain); gain.connect(a.destination);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }
  return {
    shoot:     () => blip(820, 0.07, 'square', 0.04, 500),
    echoShoot: () => blip(1100, 0.06, 'triangle', 0.035, 720),
    hit:       () => noise(0.06, 0.05, 2200),
    kill:      () => { blip(180, 0.14, 'sawtooth', 0.07, 60); noise(0.12, 0.06, 700); },
    dash:      () => blip(620, 0.10, 'sine', 0.05, 260),
    echoCast:  () => { blip(520, 0.12, 'triangle', 0.06, 880); blip(720, 0.18, 'sine', 0.04, 1200); },
    wave:      () => { blip(330, 0.12, 'triangle', 0.05, 660); blip(660, 0.14, 'triangle', 0.05, 990); },
    death:     () => { noise(0.4, 0.1, 400); blip(120, 0.5, 'sawtooth', 0.07, 40); },
  };
})();

// ---------------- Particles ----------------
const particles = [];
function addParticle(x, y, angle, speed, life, color, size=2) {
  particles.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life, age: 0, color, size,
  });
}
function burst(x, y, count, color, speedMin=60, speedMax=220, life=0.5, size=2) {
  for (let i = 0; i < count; i++) {
    addParticle(x, y, Math.random()*TAU, rand(speedMin, speedMax), rand(life*0.5, life), color, size);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.vx *= 0.96; p.vy *= 0.96;
    p.x  += p.vx * dt;
    p.y  += p.vy * dt;
  }
}
function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const t = 1 - (p.age / p.life);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + t*0.8), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------- Screen shake ----------------
const shake = { amt: 0, decay: 6 };
function addShake(v) { shake.amt = Math.min(18, shake.amt + v); }
function shakeOffset() {
  if (shake.amt < 0.05) return { x: 0, y: 0 };
  return {
    x: (Math.random()*2 - 1) * shake.amt,
    y: (Math.random()*2 - 1) * shake.amt,
  };
}

// ---------------- Floating text ----------------
const floats = [];
function addFloat(x, y, text, color='#ffd36a') {
  floats.push({ x, y, text, color, age: 0, life: 0.9, vy: -40 });
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.age += dt;
    f.y += f.vy * dt;
    f.vy *= 0.94;
    if (f.age >= f.life) floats.splice(i, 1);
  }
}
function drawFloats() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px "SF Mono", Menlo, monospace';
  for (const f of floats) {
    const t = 1 - f.age / f.life;
    ctx.globalAlpha = t;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}

// ---------------- Bullets ----------------
const bullets = [];
const enemyBullets = [];

function spawnBullet(x, y, angle, opts = {}) {
  bullets.push({
    x, y,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: 1.3, age: 0, r: 4,
    echo: !!opts.echo,
    dmg: opts.dmg ?? 1,
  });
}
function spawnEnemyBullet(x, y, angle, speed=180) {
  enemyBullets.push({
    x, y,
    vx: Math.cos(angle)*speed,
    vy: Math.sin(angle)*speed,
    life: 3.0, age: 0, r: 5,
  });
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.age += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.age >= b.life ||
        b.x < ARENA.x || b.x > ARENA.x + ARENA.w ||
        b.y < ARENA.y || b.y > ARENA.y + ARENA.h) {
      bullets.splice(i, 1);
    }
  }
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.age += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.age >= b.life ||
        b.x < ARENA.x || b.x > ARENA.x + ARENA.w ||
        b.y < ARENA.y || b.y > ARENA.y + ARENA.h) {
      enemyBullets.splice(i, 1);
    }
  }
}

// ---------------- Player ----------------
const player = {
  x: W/2, y: H/2, r: 11,
  hp: 5, maxHp: 5,
  fireCd: 0, dashCd: 0, dashT: 0,
  dashVx: 0, dashVy: 0,
  invuln: 0, hitFlash: 0,
  aimAngle: -Math.PI/2,
  record: [],
};

function resetPlayer() {
  player.x = W/2; player.y = H/2;
  player.hp = player.maxHp;
  player.fireCd = 0; player.dashCd = 0; player.dashT = 0;
  player.invuln = 0; player.hitFlash = 0;
  player.aimAngle = -Math.PI/2;
  player.record.length = 0;
}

function updatePlayer(dt, input) {
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.x += player.dashVx * dt;
    player.y += player.dashVy * dt;
    player.invuln = Math.max(player.invuln, 0.05);
    if (Math.random() < 0.8) {
      burst(player.x, player.y, 1, 'rgba(122,242,255,0.9)', 10, 60, 0.35, 3);
    }
  } else {
    let mx = input.move.x, my = input.move.y;
    const m = Math.hypot(mx, my);
    if (m > 0) { mx /= m; my /= m; }
    player.x += mx * PLAYER_SPEED * dt;
    player.y += my * PLAYER_SPEED * dt;

    if (input.dash && player.dashCd <= 0 && (mx !== 0 || my !== 0)) {
      player.dashT = DASH_DURATION;
      player.dashCd = DASH_COOLDOWN;
      player.dashVx = mx * DASH_SPEED;
      player.dashVy = my * DASH_SPEED;
      Audio.dash();
      burst(player.x, player.y, 14, 'rgba(122,242,255,0.9)', 120, 320, 0.4, 2);
    }
  }

  player.x = clamp(player.x, ARENA.x + player.r, ARENA.x + ARENA.w - player.r);
  player.y = clamp(player.y, ARENA.y + player.r, ARENA.y + ARENA.h - player.r);

  const ax = input.aim.x, ay = input.aim.y;
  if (ax !== 0 || ay !== 0) {
    player.aimAngle = Math.atan2(ay, ax);
  }

  let fired = false;
  player.fireCd -= dt;
  if (input.fire && player.fireCd <= 0) {
    spawnBullet(player.x, player.y, player.aimAngle, { echo: false });
    player.fireCd = FIRE_RATE;
    Audio.shoot();
    fired = true;
    burst(player.x + Math.cos(player.aimAngle)*14,
          player.y + Math.sin(player.aimAngle)*14,
          3, 'rgba(122,242,255,0.9)', 40, 120, 0.18, 2);
  }

  player.dashCd  = Math.max(0, player.dashCd - dt);
  player.invuln  = Math.max(0, player.invuln - dt);
  player.hitFlash= Math.max(0, player.hitFlash - dt);

  player.record.push({
    t: Game.time, x: player.x, y: player.y,
    aimAngle: player.aimAngle, fired,
  });
  const cutoff = Game.time - ECHO_WINDOW - 0.1;
  while (player.record.length && player.record[0].t < cutoff) player.record.shift();
}

function drawPlayer() {
  if (player.invuln > 0 && Math.floor(player.invuln * 30) % 2 === 0) return;
  const flash = player.hitFlash > 0 ? 1 : 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createRadialGradient(player.x, player.y, 2, player.x, player.y, 40);
  grd.addColorStop(0, 'rgba(122,242,255,0.45)');
  grd.addColorStop(1, 'rgba(122,242,255,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(player.x, player.y, 40, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aimAngle);
  ctx.fillStyle = flash ? '#ffffff' : '#7af2ff';
  ctx.strokeStyle = '#e8ecff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, -9);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = flash ? '#ffffff' : '#e8ecff';
  ctx.beginPath(); ctx.arc(-2, 0, 3, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------- Echoes ----------------
const echoes = [];
let echoCd = 0;

function castEcho() {
  if (echoCd > 0) return;
  if (player.record.length < 10) return;
  if (echoes.length >= ECHO_MAX) echoes.shift();

  const frames = player.record.map(r => ({...r}));
  const start = frames[0].t;
  for (const f of frames) f.t -= start;
  const duration = frames[frames.length - 1].t;

  echoes.push({ frames, duration, age: 0, lastIdx: 0 });
  echoCd = ECHO_COOLDOWN;
  Audio.echoCast();
  addShake(4);
  burst(player.x, player.y, 26, 'rgba(200,122,255,0.9)', 80, 260, 0.55, 3);
  addFloat(player.x, player.y - 22, 'ECHO', '#c87aff');
}

function updateEchoes(dt) {
  echoCd = Math.max(0, echoCd - dt);
  for (let i = echoes.length - 1; i >= 0; i--) {
    const e = echoes[i];
    e.age += dt;
    if (e.age >= e.duration) { echoes.splice(i, 1); continue; }
    while (e.lastIdx + 1 < e.frames.length && e.frames[e.lastIdx + 1].t <= e.age) {
      e.lastIdx++;
      const f = e.frames[e.lastIdx];
      if (f.fired) {
        spawnBullet(f.x, f.y, f.aimAngle, { echo: true, dmg: 1 });
        Audio.echoShoot();
        burst(f.x + Math.cos(f.aimAngle)*12,
              f.y + Math.sin(f.aimAngle)*12,
              2, 'rgba(200,122,255,0.9)', 40, 120, 0.22, 2);
      }
    }
  }
}

function drawEchoes() {
  for (const e of echoes) {
    const f = e.frames[e.lastIdx];
    if (!f) continue;
    const t = 1 - (e.age / e.duration);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 36);
    grd.addColorStop(0, `rgba(200,122,255,${0.35 * t})`);
    grd.addColorStop(1, 'rgba(200,122,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(f.x, f.y, 36, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.aimAngle);
    ctx.globalAlpha = 0.45 + 0.4 * t;
    ctx.strokeStyle = '#c87aff';
    ctx.fillStyle   = 'rgba(200, 122, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------- Enemies ----------------
const enemies = [];

const EnemyDef = {
  grunt:  { r: 12, hp: 2, speed: 95,  score: 25,  color: '#ff4d7a', contact: 1 },
  darter: { r: 9,  hp: 1, speed: 160, score: 40,  color: '#ff9a5a', contact: 1 },
  turret: { r: 14, hp: 4, speed: 35,  score: 60,  color: '#ffd36a', contact: 1, fireEvery: 1.4 },
  brute:  { r: 22, hp: 8, speed: 55,  score: 120, color: '#b84dff', contact: 2 },
};

function spawnEnemy(type, x, y) {
  const d = EnemyDef[type];
  enemies.push({
    type, ...d,
    x, y, hp: d.hp, maxHp: d.hp,
    vx: 0, vy: 0, hitFlash: 0,
    fireCd: rand(0.2, (d.fireEvery || 1.4)),
    phase: Math.random() * TAU,
    dashCd: rand(0.5, 2.5),
    dashT: 0,
  });
}

function spawnEnemyAtEdge(type) {
  const side = randi(0, 4);
  let x, y;
  if (side === 0)      { x = rand(ARENA.x, ARENA.x + ARENA.w); y = ARENA.y + 10; }
  else if (side === 1) { x = rand(ARENA.x, ARENA.x + ARENA.w); y = ARENA.y + ARENA.h - 10; }
  else if (side === 2) { x = ARENA.x + 10; y = rand(ARENA.y, ARENA.y + ARENA.h); }
  else                 { x = ARENA.x + ARENA.w - 10; y = rand(ARENA.y, ARENA.y + ARENA.h); }

  for (let i = 0; i < 14; i++) {
    addParticle(x, y, Math.random()*TAU, rand(30, 80), rand(0.3, 0.6), 'rgba(255,77,122,0.9)', 2);
  }
  spawnEnemy(type, x, y);
}

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.hitFlash = Math.max(0, e.hitFlash - dt);

    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;

    if (e.type === 'grunt') {
      e.vx = lerp(e.vx, nx * e.speed, 0.08);
      e.vy = lerp(e.vy, ny * e.speed, 0.08);
    }
    else if (e.type === 'darter') {
      e.phase += dt * 4;
      e.dashCd -= dt;
      if (e.dashT > 0) {
        e.dashT -= dt;
      } else if (e.dashCd <= 0 && d < 420) {
        e.dashT = 0.28;
        e.dashCd = rand(1.6, 2.6);
        e.vx = nx * e.speed * 2.8;
        e.vy = ny * e.speed * 2.8;
      } else {
        const tangentX = -ny, tangentY = nx;
        const desiredX = nx * e.speed * 0.7 + tangentX * e.speed * 0.6 * Math.sin(e.phase);
        const desiredY = ny * e.speed * 0.7 + tangentY * e.speed * 0.6 * Math.sin(e.phase);
        e.vx = lerp(e.vx, desiredX, 0.1);
        e.vy = lerp(e.vy, desiredY, 0.1);
      }
    }
    else if (e.type === 'turret') {
      const want = 260;
      const push = (d - want);
      e.vx = lerp(e.vx, nx * Math.sign(push) * e.speed, 0.05);
      e.vy = lerp(e.vy, ny * Math.sign(push) * e.speed, 0.05);
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 520) {
        const ang = Math.atan2(dy, dx);
        spawnEnemyBullet(e.x + nx*e.r, e.y + ny*e.r, ang, 210);
        e.fireCd = e.fireEvery;
      }
    }
    else if (e.type === 'brute') {
      e.vx = lerp(e.vx, nx * e.speed, 0.04);
      e.vy = lerp(e.vy, ny * e.speed, 0.04);
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    e.x = clamp(e.x, ARENA.x + e.r, ARENA.x + ARENA.w - e.r);
    e.y = clamp(e.y, ARENA.y + e.r, ARENA.y + ARENA.h - e.r);

    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const o = enemies[j];
      const ddx = e.x - o.x, ddy = e.y - o.y;
      const dd = Math.hypot(ddx, ddy);
      const mind = e.r + o.r;
      if (dd > 0 && dd < mind) {
        const push = (mind - dd) * 0.5;
        e.x += (ddx/dd) * push;
        e.y += (ddy/dd) * push;
      }
    }
  }
}

function hexA(hex, a) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawEnemies() {
  for (const e of enemies) {
    const flash = e.hitFlash > 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glowR = e.r * 2.2;
    const grd = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, glowR);
    grd.addColorStop(0, hexA(e.color, 0.35));
    grd.addColorStop(1, hexA(e.color, 0));
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(e.x, e.y, glowR, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle   = flash ? '#ffffff' : e.color;
    ctx.strokeStyle = '#e8ecff';
    ctx.lineWidth = 1.5;

    if (e.type === 'grunt') {
      ctx.beginPath();
      ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0);
      ctx.lineTo(0, e.r);  ctx.lineTo(-e.r, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (e.type === 'darter') {
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(e.r, 0);
      ctx.lineTo(-e.r*0.7, -e.r*0.7);
      ctx.lineTo(-e.r*0.7,  e.r*0.7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (e.type === 'turret') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i/6 * TAU;
        const px = Math.cos(a) * e.r;
        const py = Math.sin(a) * e.r;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, e.r*0.35, 0, TAU); ctx.fill();
    } else if (e.type === 'brute') {
      ctx.beginPath();
      ctx.rect(-e.r, -e.r, e.r*2, e.r*2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -e.r*0.5); ctx.lineTo(e.r*0.5, 0);
      ctx.lineTo(0, e.r*0.5);  ctx.lineTo(-e.r*0.5, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    if (e.maxHp > 2 && e.hp < e.maxHp) {
      const w = e.r * 2, h = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w/2, e.y - e.r - 8, w, h);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w/2, e.y - e.r - 8, w * (e.hp/e.maxHp), h);
    }
  }
}

// ---------------- Collisions ----------------
function doCollisions() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (dist2(b.x, b.y, e.x, e.y) <= (b.r + e.r) * (b.r + e.r)) {
        e.hp -= b.dmg;
        e.hitFlash = 0.08;
        addShake(1.2);
        Audio.hit();
        burst(b.x, b.y, 6, b.echo ? 'rgba(200,122,255,0.9)' : 'rgba(122,242,255,0.9)',
              60, 220, 0.3, 2);
        bullets.splice(i, 1);
        if (e.hp <= 0) killEnemy(e, j, b.echo);
        break;
      }
    }
  }

  if (player.invuln <= 0) {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (dist2(b.x, b.y, player.x, player.y) <= (b.r + player.r) * (b.r + player.r)) {
        enemyBullets.splice(i, 1);
        damagePlayer(1);
        break;
      }
    }
  }

  if (player.invuln <= 0) {
    for (const e of enemies) {
      const rr = (e.r + player.r);
      if (dist2(e.x, e.y, player.x, player.y) <= rr*rr) {
        damagePlayer(e.contact);
        const dx = player.x - e.x, dy = player.y - e.y;
        const d = Math.hypot(dx,dy) || 1;
        player.x += (dx/d) * 14;
        player.y += (dy/d) * 14;
        break;
      }
    }
  }
}

function killEnemy(e, idx, byEcho) {
  const bonus = byEcho ? 1.5 : 1;
  const gained = Math.floor(e.score * bonus);
  Game.score += gained;
  Game.waveKills++;
  addFloat(e.x, e.y - 10, `+${gained}${byEcho ? ' ECHO' : ''}`, byEcho ? '#c87aff' : '#ffd36a');
  Audio.kill();
  addShake(3.5);
  burst(e.x, e.y, 26, e.color, 120, 320, 0.55, 3);
  burst(e.x, e.y, 10, '#ffffff', 60, 220, 0.4, 2);
  enemies.splice(idx, 1);
}

function damagePlayer(amt) {
  player.hp -= amt;
  player.invuln = 0.9;
  player.hitFlash = 0.15;
  addShake(7);
  Audio.hit();
  // Haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(40);
  burst(player.x, player.y, 18, 'rgba(255,77,122,0.9)', 80, 260, 0.5, 2);
  if (player.hp <= 0) Game.die();
}

// ---------------- Waves ----------------
const Waves = {
  number: 0, spawnTimer: 0, toSpawn: 0, active: false,
  interWave: 0, waveSize: 0,

  start() {
    this.number = 0; this.active = false;
    this.interWave = 2.0; this.toSpawn = 0; this.waveSize = 0;
  },

  next() {
    this.number++;
    this.waveSize = Math.min(36, 4 + Math.floor(this.number * 1.8));
    this.toSpawn = this.waveSize;
    this.spawnTimer = 0.2;
    this.active = true;
    Game.waveKills = 0;
    Audio.wave();
    addFloat(W/2, H/2 - 40, `WAVE ${this.number}`, '#7af2ff');
    addShake(3);
  },

  pickType() {
    const n = this.number;
    const pool = [['grunt', 10]];
    if (n >= 2) pool.push(['darter', 6]);
    if (n >= 3) pool.push(['turret', 4]);
    if (n >= 5) pool.push(['brute',  2]);
    if (n >= 6) pool.find(p => p[0]==='darter')[1] = 8;
    if (n >= 8) pool.find(p => p[0]==='turret')[1] = 7;
    if (n >= 10) pool.find(p => p[0]==='brute')[1]  = 5;

    const total = pool.reduce((s, p) => s + p[1], 0);
    let r = Math.random() * total;
    for (const [t, w] of pool) {
      if ((r -= w) <= 0) return t;
    }
    return 'grunt';
  },

  update(dt) {
    if (!this.active) {
      this.interWave -= dt;
      if (this.interWave <= 0) this.next();
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        spawnEnemyAtEdge(this.pickType());
        this.toSpawn--;
        const frac = 1 - this.toSpawn / this.waveSize;
        this.spawnTimer = lerp(0.65, 0.22, clamp(frac, 0, 1))
                        * Math.max(0.55, 1 - this.number * 0.03);
      }
    } else if (enemies.length === 0) {
      const bonus = 50 + this.number * 25;
      Game.score += bonus;
      addFloat(W/2, H/2, `WAVE CLEAR  +${bonus}`, '#ffd36a');
      if (this.number % 3 === 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 1);
        addFloat(player.x, player.y - 30, '+1 HP', '#7af2ff');
      }
      this.active = false;
      this.interWave = 2.8;
    }
  },
};

// ---------------- Background ----------------
function drawBackground() {
  ctx.save();
  ctx.strokeStyle = 'rgba(122, 242, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(122, 242, 255, 0.5)';
  ctx.shadowBlur = 14;
  ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(122, 242, 255, 0.06)';
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += step) {
    ctx.moveTo(x, ARENA.y);
    ctx.lineTo(x, ARENA.y + ARENA.h);
  }
  for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += step) {
    ctx.moveTo(ARENA.x, y);
    ctx.lineTo(ARENA.x + ARENA.w, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(200, 122, 255, 0.25)';
  ctx.lineWidth = 1.5;
  const corners = [
    [ARENA.x, ARENA.y], [ARENA.x + ARENA.w, ARENA.y],
    [ARENA.x, ARENA.y + ARENA.h], [ARENA.x + ARENA.w, ARENA.y + ARENA.h],
  ];
  corners.forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, TAU);
    ctx.stroke();
  });
  ctx.restore();

  // Letterbox mask: fill areas outside the logical 960x640 region
  // Done in screen space so the bars don't shake
  if (offsetX > 0 || offsetY > 0) {
    // We'll handle this after render; leave here as no-op.
  }
}

// ---------------- HUD ----------------
function drawHUD() {
  ctx.save();
  ctx.font = 'bold 11px "SF Mono", Menlo, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7e86a8';
  ctx.fillText('HP', 16, 12);
  for (let i = 0; i < player.maxHp; i++) {
    const x = 40 + i * 16;
    const y = 10;
    ctx.fillStyle = i < player.hp ? '#7af2ff' : 'rgba(122,242,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x + 6, y);
    ctx.lineTo(x + 12, y + 6);
    ctx.lineTo(x + 6, y + 12);
    ctx.lineTo(x, y + 6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#7e86a8';
  ctx.fillText('SCORE', W/2, 8);
  ctx.font = 'bold 22px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#ffd36a';
  ctx.fillText(Game.score.toString().padStart(5, '0'), W/2, 22);

  ctx.font = 'bold 10px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#7e86a8';
  ctx.fillText(`WAVE ${Waves.number}`, W/2, 50);

  ctx.textAlign = 'right';
  ctx.font = 'bold 10px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#7e86a8';
  ctx.fillText('BEST', W - 60, 12);
  ctx.font = 'bold 14px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#ffd36a';
  ctx.fillText(Game.hiscore.toString().padStart(5, '0'), W - 60, 26);

  // Echo meter
  const ex = 20, ey = H - 38;
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#7e86a8';
  ctx.fillText('ECHO', ex, ey);

  const barW = 160, barH = 10;
  const filled = 1 - (echoCd / ECHO_COOLDOWN);
  ctx.fillStyle = 'rgba(200,122,255,0.15)';
  ctx.fillRect(ex, ey + 12, barW, barH);
  ctx.fillStyle = echoCd <= 0 ? '#c87aff' : 'rgba(200,122,255,0.6)';
  ctx.fillRect(ex, ey + 12, barW * clamp(filled, 0, 1), barH);
  ctx.strokeStyle = 'rgba(200,122,255,0.5)';
  ctx.strokeRect(ex + 0.5, ey + 12 + 0.5, barW, barH);

  for (let i = 0; i < ECHO_MAX; i++) {
    const px = ex + barW + 10 + i * 12;
    ctx.fillStyle = i < echoes.length ? '#c87aff' : 'rgba(200,122,255,0.2)';
    ctx.beginPath();
    ctx.arc(px + 4, ey + 17, 4, 0, TAU);
    ctx.fill();
  }

  // Dash meter
  const dx = W - 20 - 160, dy = H - 38;
  ctx.fillStyle = '#7e86a8';
  ctx.fillText('DASH', dx, dy);
  const dfilled = 1 - (player.dashCd / DASH_COOLDOWN);
  ctx.fillStyle = 'rgba(122,242,255,0.15)';
  ctx.fillRect(dx, dy + 12, 160, 10);
  ctx.fillStyle = player.dashCd <= 0 ? '#7af2ff' : 'rgba(122,242,255,0.6)';
  ctx.fillRect(dx, dy + 12, 160 * clamp(dfilled, 0, 1), 10);
  ctx.strokeStyle = 'rgba(122,242,255,0.5)';
  ctx.strokeRect(dx + 0.5, dy + 12 + 0.5, 160, 10);

  ctx.restore();
}

function drawEnemyBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of enemyBullets) {
    const grd = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 14);
    grd.addColorStop(0, 'rgba(255, 77, 122, 0.9)');
    grd.addColorStop(1, 'rgba(255, 77, 122, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(b.x, b.y, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawBullets() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of bullets) {
    const col = b.echo ? 'rgba(200,122,255,0.9)' : 'rgba(122,242,255,0.9)';
    const core = b.echo ? '#e6c8ff' : '#d8faff';
    const grd = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 12);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(b.x, b.y, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------- Game state machine ----------------
const Game = {
  state: 'title', time: 0, score: 0, hiscore: 0, waveKills: 0,

  init() {
    this.hiscore = parseInt(localStorage.getItem('echovault.hiscore') || '0', 10) || 0;
    document.getElementById('title-hiscore').textContent = this.hiscore;

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      const handler = (e) => { e.preventDefault(); fn(); };
      el.addEventListener('click', handler);
      el.addEventListener('touchend', handler, { passive: false });
    };
    bind('start-btn',  () => this.startRun());
    bind('retry-btn',  () => this.startRun());
    bind('resume-btn', () => this.togglePause());
    bind('quit-btn',   () => this.toTitle());
    bind('title-btn',  () => this.toTitle());

    this.showOnly('title');

    let last = performance.now();
    const loop = (nowMs) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  handleEnter() {
    if (this.state === 'title' || this.state === 'gameover') this.startRun();
  },

  startRun() {
    this.state = 'playing';
    this.time = 0; this.score = 0; this.waveKills = 0;
    resetPlayer();
    enemies.length = 0; bullets.length = 0; enemyBullets.length = 0;
    echoes.length = 0; echoCd = 0;
    particles.length = 0; floats.length = 0;
    shake.amt = 0;
    Waves.start();
    this.showOnly(null);
  },

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.showOnly('pause'); }
    else if (this.state === 'paused') { this.state = 'playing'; this.showOnly(null); }
  },

  toTitle() {
    this.state = 'title';
    this.showOnly('title');
    document.getElementById('title-hiscore').textContent = this.hiscore;
  },

  die() {
    this.state = 'gameover';
    Audio.death();
    addShake(16);
    if (navigator.vibrate) navigator.vibrate([40, 60, 120]);
    burst(player.x, player.y, 50, 'rgba(255,77,122,0.9)', 120, 420, 1.0, 3);
    burst(player.x, player.y, 30, '#ffffff', 60, 260, 0.8, 2);
    if (this.score > this.hiscore) {
      this.hiscore = this.score;
      localStorage.setItem('echovault.hiscore', String(this.hiscore));
    }
    document.getElementById('final-score').textContent   = this.score;
    document.getElementById('final-wave').textContent    = Waves.number;
    document.getElementById('final-hiscore').textContent = this.hiscore;
    setTimeout(() => { if (this.state === 'gameover') this.showOnly('gameover'); }, 650);
  },

  showOnly(id) {
    ['title','pause','gameover'].forEach(k => {
      document.getElementById(k).classList.toggle('visible', k === id);
    });
    // Hide touch UI when not playing
    const tui = document.getElementById('touch-ui');
    if (isTouch) {
      tui.style.display = (id === null) ? '' : 'none';
    }
  },

  update(dt) {
    shake.amt = Math.max(0, shake.amt - shake.decay * dt);
    if (this.state !== 'playing') return;
    this.time += dt;

    const input = readInput();
    updatePlayer(dt, input);
    if (input.echo) castEcho();

    updateEchoes(dt);
    updateEnemies(dt);
    updateBullets(dt);
    doCollisions();
    Waves.update(dt);
    updateParticles(dt);
    updateFloats(dt);
  },

  render() {
    clearCanvas();

    // World-space render (logical 960x640)
    applyWorldTransform();
    const off = shakeOffset();
    ctx.translate(off.x, off.y);

    drawBackground();
    drawEchoes();
    drawEnemies();
    drawEnemyBullets();
    drawPlayer();
    drawBullets();
    drawParticles();
    drawFloats();

    // Undo shake translation for HUD (HUD uses world coords but shouldn't shake)
    ctx.translate(-off.x, -off.y);
    drawHUD();

    if (this.state === 'title') drawTitleDemo();

    // Letterbox bars (draw outside the 960x640 region, in backing-pixel space)
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070f';
    if (offsetX > 0) {
      ctx.fillRect(0, 0, offsetX * dpr, canvas.height);
      ctx.fillRect((offsetX + W * scale) * dpr, 0, canvas.width, canvas.height);
    }
    if (offsetY > 0) {
      ctx.fillRect(0, 0, canvas.width, offsetY * dpr);
      ctx.fillRect(0, (offsetY + H * scale) * dpr, canvas.width, canvas.height);
    }
  },
};

function drawTitleDemo() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const t = performance.now() / 1000;
  for (let i = 0; i < 3; i++) {
    const a = t * 0.6 + i * (TAU/3);
    const r = 180 + Math.sin(t + i) * 20;
    const x = W/2 + Math.cos(a) * r;
    const y = H/2 + Math.sin(a) * r;
    const grd = ctx.createRadialGradient(x, y, 2, x, y, 80);
    grd.addColorStop(0, i === 0 ? 'rgba(122,242,255,0.35)' :
                        i === 1 ? 'rgba(200,122,255,0.35)' :
                                  'rgba(255,211,106,0.28)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, 80, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Prevent scroll/zoom gestures while playing
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (Game.state === 'playing') e.preventDefault();
}, { passive: false });

Game.init();

})();
