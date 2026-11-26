// =====================================================================
//  ASSIGNED ON ARRIVAL
//  Every visitor gets a number, computed from what their browser reveals.
//  Drag over the card to smear it like wet ink: the fields scramble until the cables bring the data back.
//  Type to overwrite the number. It comes back.
//  Drag across a cable to cut it: that signal is lost and the number changes.
//
//  Layer 1: the typography interaction            (done)
//  Layer 2: ID card layout, signal fields, fingerprint, machine-readable zone (done)
//  Layer 3: cables from the signals into the card, pulses, the eye   (done)
//  Arrival: the eye comes down to the glass and scans you top to bottom, then the cables
//           grow out of the floor, plug into the card and fill it in   (this version)
// =====================================================================

// ---------- fingerprint: collect signals, hash them ----------

let signals = []; // [{ key, label, value, show }]  value feeds the hash, show is printed on the card
let fullHash = ''; // 32 hex characters, from the stable signals
let trueId = ''; // the 12 characters shown big on the card, e.g. "7F3A91C0D2E4"

function collectSignals() {
  const out = [];
  const add = (key, label, value, show) =>
    out.push({ key, label, value: String(value), show: String(show ?? value).toUpperCase() });

  add(
    'screen',
    'SCREEN',
    `${screen.width}x${screen.height} ${screen.colorDepth}bit`,
    `${screen.width} x ${screen.height}`,
  );

  // GPU: the graphics card renders this page and tells us its name while doing it
  let gpu = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch (e) {}
  add('gpu', 'GPU', gpu, shortGpu(gpu));

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  add('timezone', 'TIMEZONE', tz);
  const langs = (navigator.languages || [navigator.language]).join(', ');
  add('language', 'LANGUAGE', langs);
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'unknown';
  add('platform', 'PLATFORM', plat, platformName(plat));
  add('cores', 'CPU CORES', navigator.hardwareConcurrency || 'n/a');
  // display: colour gamut and dynamic range, answered by CSS media queries in every current browser
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const gamut = mq('(color-gamut: rec2020)') ? 'REC2020' : mq('(color-gamut: p3)') ? 'P3' : 'SRGB';
  const range = mq('(dynamic-range: high)') ? 'HDR' : 'SDR';
  add('display', 'DISPLAY', `${gamut} ${range}`, `${gamut} COLOUR · ${range}`);
  add('touch', 'TOUCH POINTS', navigator.maxTouchPoints || 0);

  // fonts: an installed font renders a test string at a different width than the fallback
  const installed = probeFonts();
  add('fonts', 'FONTS', installed.join(','), `${installed.length} INSTALLED`);

  add('agent', 'BROWSER', navigator.userAgent, browserName(navigator.userAgent));

  // canvas: the same drawing comes out slightly different on every machine.
  // Some browsers add noise to it in private windows, so it is shown but kept out of the number.
  add('canvas', 'CANVAS', canvasHash());
  return out;
}

function shortGpu(s) {
  let m;
  if ((m = s.match(/Apple (M\d+\w*(?: (?:Pro|Max|Ultra))?)/))) return 'Apple ' + m[1];
  if ((m = s.match(/(GeForce[^,)/]+|Radeon[^,)/]+|Iris[^,)/]+|UHD Graphics[^,)/]+|Adreno[^,)/]+|Mali[^,)/]+)/)))
    return m[1].trim();
  if ((m = s.match(/ANGLE \(([^,]+),\s*([^,)]+)/))) return m[2].trim();
  return s;
}

function platformName(p) {
  if (/mac/i.test(p)) return 'macOS';
  if (/win/i.test(p)) return 'Windows';
  if (/iphone|ipad/i.test(p)) return 'iOS';
  if (/android/i.test(p)) return 'Android';
  if (/linux/i.test(p)) return 'Linux';
  return p;
}

function browserName(ua) {
  let m;
  if ((m = ua.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
  if ((m = ua.match(/Edg\/(\d+)/))) return 'Edge ' + m[1];
  if ((m = ua.match(/OPR\/(\d+)/))) return 'Opera ' + m[1];
  if ((m = ua.match(/Chrome\/(\d+)/))) return (navigator.brave ? 'Brave ' : 'Chrome ') + m[1];
  if ((m = ua.match(/Version\/(\d+).*Safari/))) return 'Safari ' + m[1];
  return 'unknown';
}

function probeFonts() {
  const candidates = [
    'Arial',
    'Helvetica Neue',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Verdana',
    'Trebuchet MS',
    'Comic Sans MS',
    'Impact',
    'Tahoma',
    'Calibri',
    'Cambria',
    'Segoe UI',
    'Consolas',
    'Menlo',
    'Monaco',
    'Roboto',
    'Ubuntu',
    'Noto Sans',
    'Fira Code',
    'JetBrains Mono',
    'Futura',
    'Gill Sans',
    'Optima',
    'Palatino',
    'Avenir',
    'Baskerville',
    'Didot',
    'Garamond',
    'Lucida Grande',
    'Lucida Console',
    'Century Gothic',
    'Franklin Gothic Medium',
    'Rockwell',
    'Copperplate',
    'Papyrus',
    'Brush Script MT',
    'SF Pro Display',
    'Inter',
    'Source Code Pro',
  ];
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const test = 'mmmmmmmmmmlli10WQ';
  const bases = ['monospace', 'sans-serif', 'serif'];
  const baseWidths = bases.map((b) => {
    ctx.font = `72px ${b}`;
    return ctx.measureText(test).width;
  });
  const found = [];
  for (const f of candidates) {
    for (let i = 0; i < bases.length; i++) {
      ctx.font = `72px "${f}", ${bases[i]}`;
      if (ctx.measureText(test).width !== baseWidths[i]) {
        found.push(f);
        break;
      }
    }
  }
  return found;
}

function canvasHash() {
  try {
    const c = document.createElement('canvas');
    c.width = 240;
    c.height = 60;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(100, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '11pt no-real-font-123';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, \u{1F512}', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '18pt Arial';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, \u{1F512}', 4, 45);
    ctx.globalCompositeOperation = 'multiply';
    for (const [col, x, y] of [
      ['#f0f', 50, 50],
      ['#0ff', 100, 50],
      ['#ff0', 75, 100],
    ]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, 50, 0, Math.PI * 2);
      ctx.fill();
    }
    return toHex(cyrb128(c.toDataURL())).slice(0, 8);
  } catch (e) {
    return 'BLOCKED';
  }
}

// cyrb128: a small, fast 128-bit string hash (public domain, by bryc)
function cyrb128(str) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
const toHex = (arr) =>
  arr
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();

// p5 2.x textWidth() under-reports the advance of these fonts, so widths are measured natively
const measureCtx = document.createElement('canvas').getContext('2d');
function nativeWidth(font, size, str) {
  measureCtx.font = `${size}px "${font.face.family}"`;
  return measureCtx.measureText(str).width;
}

// ---------- the card ----------

let fontA, fontB; // OCR-A for the number, OCR-B for everything small
let card, staticLayer; // card face (per frame), its static parts (once)
let floorGeom; // the room's floor grid, built once
let mask; // small offscreen graphics used to rasterize one letter
let fpLayer,
  fpSettled = false; // cached fingerprint while nothing moves

const TEX_W = 1000,
  TEX_H = 630; // ID-1 card proportions, 1000 px = 85.6 mm
const M = 44; // card margin
const R_CORNER = 36; // 3.18 mm corner radius
const FP = { x: M, y: 112, w: 186, h: 248 }; // where the portrait would be
const FIELDS_X = [262, 612],
  FIELDS_Y = 112,
  ROW_H = 50;
const ID_LABEL_Y = 416,
  ID_BASE_Y = 508;
const ID_MAX_SIZE = 108; // keeps the number clear of the fields above and the MRZ below
const MRZ_Y = [556, 598],
  MRZ_COLS = 44;

let cardW, cardH; // size of the card in the 3D scene
let ID_SIZE = 115; // font size of the number, computed in layoutGlyphs()
const SLOTS = 12,
  GROUP = 4; // "7F3A 91C0 D2E4"
const GRID = 5; // spacing of the dot grid that fills each letter

let glyphs = []; // one per slot: { ch, x, y, pts:[{x,y,hx,hy,wet}], flash, locked }
let ridges = []; // fingerprint characters: { x,y,hx,hy,wet, ch, a, ring }  wet = smeared, stays put until healed
let display = ''; // what is currently shown (differs from trueId while you type)
let caret = 0;
let lastTypeMs = -1e9,
  lastFixMs = 0;
const FIX_DELAY = 1000; // ms after the last keystroke before the correction starts
const FIX_STEP = 140; // ms between corrected characters

let rx = 0,
  ry = 0,
  panX = 0,
  panY = 0; // card orientation, eased
let prevHit = null; // previous drag position on the card texture
const CARD_Y = 28; // the card hangs a little below centre, under the eye

const N_CABLES = 10; // one per field on the card
const FIELD_ORDER = [
  'screen',
  'gpu',
  'platform',
  'agent',
  'cores',
  'timezone',
  'language',
  'display',
  'fonts',
  'canvas',
];
let cables = []; // per cable: { cut, tCut, cutMs }
let pulses = []; // { cable, t, speed, onArrive }  travelling down a cable
let nextIdlePulse = 0;
let fixing = new Set(); // slots whose correction is already on its way
let scrambled = Array(N_CABLES).fill(null); // per field: garbled text shown until its cable delivers the value again
let repairing = new Set(); // fields whose repair pulse is on its way
let lastSmudgeMs = -1e9,
  smearDist = 0, // finger travel through the ink since the last scrambled character
  repairStart = 0;
const SMEAR_STEP = 45; // texture px of smearing per scrambled character
let eye = { look: { x: 0, y: 0 }, dilate: 0, saccadeUntil: 0, nextSaccade: 0, alarmUntil: 0, swing: 0 };
const floorY = () => height / 2 - 40; // the floor is just inside the bottom of the frame

const BG = [242, 242, 239];
const CARD_BG = [250, 250, 247];
const INK = 'rgb(18,18,18)';
const GREY = [128, 128, 124];
const CAM_Z = 800; // p5 2.x puts its default camera 800 units in front of the scene

// ---------- the arrival: the eye scans you, the cables plug in, the card fills in ----------
// everything here is a function of intro.t (seconds of drawn frames), so a click can jump to the end

const PLAN = {
  approach: [0.5, 1.8], // the eye comes down to the glass
  scan: [2.1, 4.0], // the laser runs from the top of the screen to the bottom
  retract: [4.3, 5.4], // back up under the ceiling
  sockets: 4.9, // the floor sockets open
  grow: 5.1, // the first cable starts to grow out of the floor
  growStep: 0.1, // between two cables
  growDur: 0.8,
  pulseDur: 0.45, // the value travels up its cable into the card
  charDur: 0.03, // one character of a field typed in
};
let intro = { on: true, t: 0, skip: false, end: 0, number: 0, print: 0, mrz: 0, shown: '', rings: -1, doneMs: -1e9 };
let A = null; // what the arrival shows this frame; null once it is over

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const span = (t, [a, b]) => clamp01((t - a) / (b - a));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const HEX = '0123456789ABCDEF';
const scrambleChar = (i, b) => HEX[Math.floor(Math.abs(Math.sin(i * 78.233 + b * 12.9898) * 43758.5453)) % 16];

const cableRank = (i) => (i % 5) * 2 + Math.floor(i / 5); // left and right take turns, top row first
const connectAt = (i) => PLAN.grow + cableRank(i) * PLAN.growStep + PLAN.growDur;
function fieldText(i) {
  const s = signals.find((z) => z.key === FIELD_ORDER[i]);
  return s ? s.show.slice(0, 24) : '';
}

// the number waits for the last field, the print and the machine-readable zone follow the number
function planArrival() {
  let typed = 0;
  for (let i = 0; i < N_CABLES; i++)
    typed = Math.max(typed, connectAt(i) + PLAN.pulseDur + fieldText(i).length * PLAN.charDur);
  intro.number = typed + 0.3;
  intro.print = intro.number + 0.45;
  intro.mrz = intro.number + 1.0;
  intro.end = intro.mrz + 1.0;
}

function arrival(t) {
  const a = { t, grow: [], socket: [], connected: [], pulses: [], chars: [], typing: [], slots: [], locked: [] };
  a.close = easeInOut(span(t, PLAN.approach)) * (1 - easeInOut(span(t, PLAN.retract)));
  a.laser = clamp01((t - PLAN.scan[0] + 0.25) / 0.25) * (1 - clamp01((t - PLAN.scan[1]) / 0.3));
  a.scan = easeInOut(span(t, PLAN.scan));
  for (let i = 0; i < N_CABLES; i++) {
    const c = connectAt(i),
      arrive = c + PLAN.pulseDur,
      len = fieldText(i).length;
    a.socket.push(easeOutBack(clamp01((t - PLAN.sockets - cableRank(i) * 0.05) / 0.3)));
    a.grow.push(easeOut(clamp01((t - c + PLAN.growDur) / PLAN.growDur)));
    a.connected.push(t >= c);
    if (t >= c && t < arrive) a.pulses.push({ cable: i, t: (t - c) / PLAN.pulseDur });
    const n = t < arrive ? 0 : Math.min(len, Math.floor((t - arrive) / PLAN.charDur) + 1);
    a.chars.push(n);
    a.typing.push(t >= arrive && n < len);
  }
  // the number flickers through random characters, then locks from left to right
  for (let i = 0; i < SLOTS; i++) {
    const from = intro.number + i * 0.03,
      lock = intro.number + 0.35 + i * 0.065;
    a.locked.push(t >= lock);
    a.slots.push(t < from ? null : t >= lock ? trueId[i] : scrambleChar(i, Math.floor(t / 0.05)));
  }
  a.rings = Math.round(clamp01((t - intro.print) / 1.1) * 24 * 8) / 8; // the print spreads from its core
  a.mrz = Math.floor(clamp01((t - intro.mrz) / 0.7) * 2 * MRZ_COLS);
  a.key = a.chars.join(',') + '|' + a.connected.map(Number).join('') + '|' + a.mrz; // what the static layer shows

  // one line at the bottom says what the machine is doing
  const lines = [
    [PLAN.approach[0], 'VISITOR DETECTED'],
    [PLAN.scan[0], 'SCANNING VISITOR'],
    [PLAN.scan[1] + 0.4, 'READING WHAT YOUR BROWSER REVEALS'],
    [intro.number, 'ASSIGNING YOUR NUMBER'],
  ];
  a.status = '';
  for (const [from, msg] of lines) if (t >= from) a.status = msg.slice(0, Math.floor((t - from) / 0.025));
  return a;
}

// bring the card, the number and the print up to the arrival's current moment
function applyArrival() {
  if (A.key !== intro.shown) {
    intro.shown = A.key;
    drawStatic();
  }
  A.slots.forEach((c, i) => {
    const g = glyphs[i];
    if (c === null) return;
    if (A.locked[i]) {
      if (!g.locked) {
        snapGlyph(i, trueId[i]);
        g.flash = 1;
        g.locked = true;
      }
    } else if (g.ch !== c) snapGlyph(i, c);
  });
  if (A.rings !== intro.rings) {
    intro.rings = A.rings;
    fpSettled = false;
  }
}

function endArrival() {
  intro.on = false;
  A = null;
  intro.doneMs = millis();
  glyphs.forEach((g, i) => {
    if (g.ch !== display[i]) snapGlyph(i, display[i]);
    if (!g.locked) g.flash = 1;
    g.locked = true;
  });
  fpSettled = false;
  drawStatic();
  nextIdlePulse = millis() + 1200;
}

// a click or a key jumps to the end
function skipArrival() {
  intro.skip = true; // a flag, so a click while the fonts still load is not lost
}

async function setup() {
  backButton();
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));

  fontA = await loadFont('OCRA.ttf');
  fontB = await loadFont('OCRB.ttf');

  signals = collectSignals();
  cables = FIELD_ORDER.map(() => ({ cut: false, tCut: 0, cutMs: 0 }));
  recomputeId();
  display = trueId;
  intro.on = !new URLSearchParams(location.search).has('nointro');
  planArrival();
  if (intro.on) A = arrival(0);

  card = createGraphics(TEX_W, TEX_H);
  card.pixelDensity(2);
  staticLayer = createGraphics(TEX_W, TEX_H);
  staticLayer.pixelDensity(2);
  fpLayer = createGraphics(FP.w, FP.h);
  fpLayer.pixelDensity(2);

  layoutGlyphs();
  buildFingerprint();
  drawStatic();
  sizeCard();
  buildFloor();
  deviceNotice();
  debugReadout();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  sizeCard();
  buildFloor();
}

function sizeCard() {
  cardW = min(width * 0.52, 700);
  cardH = (cardW * TEX_H) / TEX_W;
}

// ---------- the number as points ----------

// the letter is drawn once into a small mask, then every grid cell inside it becomes a point
function pointsFor(ch, x, y) {
  const pad = GRID * 2;
  const w = mask.width,
    h = mask.height;
  const base = Math.round(ID_SIZE * 1.05);
  mask.background(0);
  mask.fill(255);
  mask.noStroke();
  mask.textFont(fontA);
  mask.textSize(ID_SIZE);
  mask.textAlign(LEFT, BASELINE);
  mask.text(ch, pad, base);
  mask.loadPixels();
  const pts = [];
  for (let sy = GRID / 2; sy < h; sy += GRID) {
    for (let sx = GRID / 2; sx < w; sx += GRID) {
      const i = 4 * (Math.floor(sy) * w + Math.floor(sx));
      if (mask.pixels[i] > 110) pts.push({ x: x + sx - pad, y: y + sy - base });
    }
  }
  return pts;
}

function layoutGlyphs() {
  // size the number so that twelve characters plus two group gaps fill the card width
  const adv100 = nativeWidth(fontA, 100, '0'); // OCR-A is monospaced
  const groups = SLOTS / GROUP;
  const total100 = SLOTS * adv100 + (groups - 1) * adv100 * 0.5;
  ID_SIZE = Math.min(ID_MAX_SIZE, Math.floor((100 * (TEX_W - 2 * M)) / total100));
  const adv = nativeWidth(fontA, ID_SIZE, '0');
  const gap = adv * 0.5;
  const x0 = M;

  if (!mask) {
    mask = createGraphics(Math.ceil(adv * 1.3 + GRID * 4), Math.ceil(ID_SIZE * 1.4));
    mask.pixelDensity(1);
  }

  glyphs = [];
  for (let i = 0; i < SLOTS; i++) {
    const g = Math.floor(i / GROUP);
    const x = x0 + i * adv + g * gap;
    const pts = pointsFor(display[i], x, ID_BASE_Y).map((p) => ({ x: p.x, y: p.y, hx: p.x, hy: p.y }));
    glyphs.push({ ch: display[i], x, y: ID_BASE_Y, pts, flash: 0, locked: !intro.on });
  }
}

// replace one glyph's character at once, with no morph (the flicker while the number is computed)
function snapGlyph(i, ch) {
  const g = glyphs[i];
  g.pts = pointsFor(ch, g.x, g.y).map((p) => ({ x: p.x, y: p.y, hx: p.x, hy: p.y }));
  g.ch = ch;
}

// replace one glyph's character; its points morph from where the old points are now
function setGlyph(i, ch) {
  const g = glyphs[i];
  if (g.ch === ch) return;
  const fresh = pointsFor(ch, g.x, g.y);
  const old = g.pts;
  g.pts = fresh.map((p, k) => {
    const src = old.length ? old[k % old.length] : p;
    return { x: src.x, y: src.y, hx: p.x, hy: p.y };
  });
  g.ch = ch;
  g.flash = 1;
}

// the number is made from every signal that is still connected
function recomputeId() {
  const stable = signals.filter((s) => FIELD_ORDER.includes(s.key) && s.key !== 'canvas' && !s.cut);
  fullHash = stable.length ? toHex(cyrb128(stable.map((s) => s.key + '=' + s.value).join('|'))) : '?'.repeat(32);
  trueId = fullHash.slice(0, SLOTS);
}

// cutting a cable loses that signal: its field reads ????????, the number and the print change
function cutCable(i, t) {
  const c = cables[i];
  if (c.cut) return;
  c.cut = true;
  c.tCut = t;
  c.cutMs = millis();
  const sig = signals.find((z) => z.key === FIELD_ORDER[i]);
  if (sig) sig.cut = true;
  for (const p of pulses) if (p.cable === i && p.slot !== undefined) fixing.delete(p.slot); // re-send on another cable
  pulses = pulses.filter((p) => p.cable !== i);
  repairing.delete(i); // its field reads ???????? now, nothing left to repair
  scrambled[i] = null;
  recomputeId();
  drawStatic();
  buildFingerprint(true);
  lastTypeMs = millis() - FIX_DELAY + 250; // the correction toward the new number starts soon
  eye.alarmUntil = millis() + 1500;
}

const intactCables = () => cables.map((c, i) => (c.cut ? -1 : i)).filter((i) => i >= 0);

// ---------- the fingerprint: ridges made of the hash's characters ----------

function buildFingerprint(morph = false) {
  const old = ridges;
  const seed = parseInt(fullHash.slice(0, 8), 16) || 0;
  noiseSeed(seed);
  randomSeed(seed);
  const cx = FP.x + FP.w * 0.5 + random(-14, 14);
  const cy = FP.y + FP.h * 0.56 + random(-12, 12);
  const squash = 1.22; // a thumb is taller than wide
  const spacing = 9.5; // distance between ridges
  const drift = { x: random(-0.5, 0.5), y: random(-0.4, 0.4) }; // the core sits off-centre
  ridges = [];
  for (let i = 0; i < 24; i++) {
    const r0 = 6 + i * spacing;
    const n = max(8, floor((TWO_PI * r0 * 1.1) / 6.2));
    const phase = random(TWO_PI);
    for (let k = 0; k < n; k++) {
      const th = phase + (k / n) * TWO_PI;
      const wobble = (noise(cos(th) * 1.4 + 10, sin(th) * 1.4 + 10, i * 0.09) - 0.5) * 0.5;
      const r = r0 * (1 + wobble);
      const x = cx + drift.x * i + cos(th) * r;
      const y = cy + drift.y * i + sin(th) * r * squash;
      if (x < FP.x + 7 || x > FP.x + FP.w - 7 || y < FP.y + 7 || y > FP.y + FP.h - 7) continue;
      ridges.push({
        x,
        y,
        hx: x,
        hy: y,
        ch: fullHash[(i * 5 + k) % 32],
        a: atan2(cos(th) * squash, -sin(th)),
        ring: i,
      });
    }
  }
  if (morph && old.length) {
    // new ridges start where the old ones are now
    ridges.forEach((p, k) => {
      const o = old[k % old.length];
      p.x = o.x;
      p.y = o.y;
    });
  }
  fpSettled = false;
}

function drawRidges(ctx, ox, oy) {
  ctx.save();
  ctx.fillStyle = 'rgb(40,40,40)';
  ctx.font = `8px "${fontB.face.family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const rings = A ? A.rings : Infinity; // during the arrival the print spreads ring by ring
  for (const p of ridges) {
    if (p.ring >= rings) continue;
    ctx.globalAlpha = Math.min(1, rings - p.ring);
    ctx.save();
    ctx.translate(p.x + ox, p.y + oy);
    ctx.rotate(p.a);
    ctx.fillText(p.ch, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- motion: no momentum. points ease straight home, except wet (smeared) ones ----------

function updatePoints() {
  const ease = (p) => {
    if (p.wet || (p.x === p.hx && p.y === p.hy)) return false;
    const dx = p.hx - p.x,
      dy = p.hy - p.y;
    if (abs(dx) + abs(dy) < 0.05) {
      p.x = p.hx;
      p.y = p.hy;
    } else {
      p.x += dx * 0.12;
      p.y += dy * 0.12;
    }
    return true;
  };
  for (const g of glyphs) {
    for (const p of g.pts) ease(p);
    g.flash *= 0.9;
  }
  let moving = false;
  for (const p of ridges) if (ease(p)) moving = true;
  if (moving) fpSettled = false;
}

// a fingertip through wet ink: dots near its path are dragged part of the way along and stay where
// they are left. the further a dot already is from home, the less it gives. returns whether anything moved
function smudge(from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    len2 = dx * dx + dy * dy;
  if (len2 < 0.01) return false;
  const R = 24;
  let moved = false;
  const drag = (p) => {
    const u = clamp01(((p.x - from.x) * dx + (p.y - from.y) * dy) / len2); // nearest point on the path
    const d = dist(p.x, p.y, from.x + u * dx, from.y + u * dy);
    if (d >= R) return;
    const f = ((1 - d / R) ** 2 * 0.6) / (1 + dist(p.x, p.y, p.hx, p.hy) / 22);
    p.x += dx * f;
    p.y += dy * f;
    p.wet = true;
    moved = true;
  };
  for (const g of glyphs) for (const p of g.pts) drag(p);
  for (const p of ridges) drag(p);
  if (moved) fpSettled = false;
  return moved;
}

// ---------- smearing corrupts the fields; the cables bring the data back ----------

const GLITCH = '0123456789ABCDEF#%&@?/<>*+=';

function scrambleFields(n) {
  const live = intactCables().filter((i) => fieldText(i).length);
  if (!live.length) return;
  for (let k = 0; k < n; k++) {
    const i = random(live);
    const chars = [...(scrambled[i] ?? fieldText(i))];
    chars[floor(random(chars.length))] = random([...GLITCH]);
    scrambled[i] = chars.join('');
  }
  drawStatic();
}

// once the finger has been off the ink for a moment, every scrambled field gets its value sent again.
// when the last of those pulses arrives, the smeared ink flows back into place
function repair() {
  if (repairing.size || prevHit || millis() - lastSmudgeMs < FIX_DELAY) return;
  const isWet = (p) => p.wet;
  const wet = scrambled.some(Boolean) || ridges.some(isWet) || glyphs.some((g) => g.pts.some(isWet));
  if (!wet) return;
  const live = intactCables();
  if (!live.length) {
    // nothing connected: nothing to wait for
    scrambled.fill(null);
    drawStatic();
    heal();
    return;
  }
  let targets = live.filter((i) => scrambled[i]);
  if (!targets.length) targets = [random(live)]; // only ink to fix: one refresh is enough
  repairStart = millis();
  targets.forEach((i, k) => {
    repairing.add(i);
    pulses.push({ cable: i, t: -k * 0.12, speed: 1 / 40, onArrive: () => restoreField(i) }); // staggered
  });
}

function restoreField(i) {
  repairing.delete(i);
  if (scrambled[i]) {
    scrambled[i] = null;
    drawStatic();
  }
  if (!repairing.size && lastSmudgeMs < repairStart) heal(); // not smeared again since the pulses left
}

function heal() {
  for (const g of glyphs) for (const p of g.pts) p.wet = false;
  for (const p of ridges) p.wet = false;
}

// ---------- typing and correction ----------

const ALLOWED = /^[A-Z0-9#*+\-=?!$%&@.:;,<>\/\\]$/;

function keyTyped() {
  if (!glyphs.length) return;
  if (intro.on) {
    skipArrival();
    return false;
  }
  const ch = key.toUpperCase();
  if (!ALLOWED.test(ch)) return;
  if (caret >= SLOTS) caret = 0;
  display = display.slice(0, caret) + ch + display.slice(caret + 1);
  setGlyph(caret, ch);
  caret++;
  lastTypeMs = millis();
  return false;
}

function keyPressed(e) {
  if (intro.on) {
    if (!(e && (e.metaKey || e.ctrlKey || e.altKey))) skipArrival(); // leave browser shortcuts alone
    return;
  }
  if (keyCode === BACKSPACE) {
    caret = max(0, caret - 1);
    lastTypeMs = millis();
    return false;
  }
}

// the signals send the right character back down a cable; the glyph is fixed when it arrives
function correct() {
  const now = millis();
  if (display === trueId && fixing.size === 0) {
    caret = 0;
    return;
  }
  if (now - lastTypeMs < FIX_DELAY || now - lastFixMs < FIX_STEP) return;
  for (let i = 0; i < SLOTS; i++) {
    if (display[i] !== trueId[i] && !fixing.has(i)) {
      fixing.add(i);
      lastFixMs = now;
      const fix = () => {
        display = display.slice(0, i) + trueId[i] + display.slice(i + 1);
        setGlyph(i, trueId[i]);
        fixing.delete(i);
      };
      const live = intactCables();
      if (live.length) spawnPulse(random(live), fix, i);
      else fix(); // nothing connected: no signal to wait for
      break;
    }
  }
}

// ---------- cables, pulses, the eye ----------

function spawnPulse(cable, onArrive, slot) {
  pulses.push({ cable, t: 0, speed: 1 / 40, onArrive, slot });
}

function updatePulses() {
  for (const p of pulses) p.t += p.speed;
  const arrived = pulses.filter((p) => p.t >= 1);
  pulses = pulses.filter((p) => p.t < 1);
  for (const p of arrived) if (p.onArrive) p.onArrive();
  // now and then a cable pulses on its own: the card is being kept up to date
  if (millis() > nextIdlePulse) {
    const live = intactCables();
    if (live.length) spawnPulse(random(live), null);
    nextIdlePulse = millis() + random(1800, 4500);
  }
}

// a point given on the card (card units, z toward the viewer) in world coordinates
function cardToWorld(lx, ly, lz) {
  const v = rotXv(rotYv({ x: lx, y: ly, z: lz }, ry), rx);
  return { x: v.x + panX, y: v.y + panY + CARD_Y, z: v.z };
}

// each cable leaves the card edge at the row of its field and hangs down to the floor
function cableGeometry(i) {
  const col = Math.floor(i / 5),
    row = i % 5;
  const texY = FIELDS_Y + row * ROW_H + 26;
  const ly = (texY / TEX_H - 0.5) * cardH;
  const side = col === 0 ? -1 : 1;
  const p0 = cardToWorld(side * (cardW / 2 - 18), ly, -3);
  const p3 = { x: side * (cardW / 2 + 150 + row * 60), y: floorY() + 8, z: -150 - row * 42 };
  const p1 = { x: p0.x + side * (90 + row * 22), y: p0.y + 10, z: p0.z - 6 };
  const p2 = { x: p3.x - side * 6, y: p3.y - 170, z: p3.z + 10 };
  return [p0, p1, p2, p3];
}

// world point to screen pixels under p5's default camera
function toScreen(w) {
  const k = CAM_Z / (CAM_Z - w.z);
  return { x: w.x * k + width / 2, y: w.y * k + height / 2 };
}

// the cable's points, with the gap and the drooping ends if it has been cut
function cablePoints(i) {
  const geo = cableGeometry(i);
  const grow = A ? A.grow[i] : 1;
  if (grow <= 0) return [];
  if (grow < 1) return [bezierRange(...geo, 1 - grow, 1, 28)]; // still growing up out of the floor
  const pts = bezierPts(...geo, 28);
  const c = cables[i];
  if (!c.cut) return [pts];
  const cutIdx = c.tCut * 28;
  const droop = 22 * min(1, (millis() - c.cutMs) / 900);
  const near = (k, d) => max(0, 1 - abs(k - cutIdx) / d);
  const a = pts.filter((p, k) => k < cutIdx - 1).map((p, k) => ({ x: p.x, y: p.y + droop * near(k, 5), z: p.z }));
  const b = pts.filter((p, k) => k > cutIdx + 1);
  const off = a.length;
  const b2 = b.map((p, k) => ({ x: p.x, y: p.y + droop * 0.6 * near(k + off + 3, 5), z: p.z }));
  return [a, b2].filter((seg) => seg.length > 1);
}

// which intact cables does the screen segment from A to B cross? returns [{ cable, t }]
function cableCrossings(A, B) {
  const found = [];
  const cross = (p, q, r, s2) => {
    // segment p-q against r-s2
    const d = (q.x - p.x) * (s2.y - r.y) - (q.y - p.y) * (s2.x - r.x);
    if (abs(d) < 1e-9) return false;
    const u = ((r.x - p.x) * (s2.y - r.y) - (r.y - p.y) * (s2.x - r.x)) / d;
    const v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  };
  for (const i of intactCables()) {
    const pts = bezierPts(...cableGeometry(i), 28).map(toScreen);
    for (let k = 2; k < pts.length - 1; k++) {
      // skip the part hidden under the card
      if (cross(A, B, pts[k], pts[k + 1])) {
        found.push({ cable: i, t: (k + 0.5) / 28 });
        break;
      }
    }
  }
  return found;
}

// is the mouse near an intact cable? (for the caret)
function nearCable(mx, my) {
  for (const i of intactCables()) {
    const pts = bezierPts(...cableGeometry(i), 28).map(toScreen);
    for (let k = 2; k < pts.length; k++) if (dist(mx, my, pts[k].x, pts[k].y) < 10) return true;
  }
  return false;
}

// cables are flat ribbons of triangles facing the viewer: far cheaper than p5's WEBGL strokes.
// all ribbons go into one triangle strip, joined by degenerate triangles, so it is a single draw call
function ribbons(polylines, w, dz) {
  beginShape(TRIANGLE_STRIP);
  let last = null;
  for (const pts of polylines) {
    const edge = (i) => {
      const a = pts[max(i - 1, 0)],
        b = pts[min(i + 1, pts.length - 1)];
      let nx = -(b.y - a.y),
        ny = b.x - a.x;
      const len = max(1e-6, sqrt(nx * nx + ny * ny));
      nx = ((nx / len) * w) / 2;
      ny = ((ny / len) * w) / 2;
      const p = pts[i];
      return [
        [p.x + nx, p.y + ny, p.z + dz],
        [p.x - nx, p.y - ny, p.z + dz],
      ];
    };
    const first = edge(0);
    if (last) {
      vertex(...last);
      vertex(...first[0]);
    } // zero-area bridge between cables
    for (let i = 0; i < pts.length; i++) {
      const [l, r] = edge(i);
      vertex(...l);
      vertex(...r);
      last = r;
    }
  }
  endShape();
}

const bezierPts = (a, b, c, d, n) => bezierRange(a, b, c, d, 0, 1, n);

// n + 1 points on the curve between t0 and t1
function bezierRange(a, b, c, d, t0, t1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    pts.push({
      x: bezierPoint(a.x, b.x, c.x, d.x, t),
      y: bezierPoint(a.y, b.y, c.y, d.y, t),
      z: bezierPoint(a.z, b.z, c.z, d.z, t),
    });
  }
  return pts;
}

function drawCables() {
  push();
  noStroke();
  const lines = [],
    ends = [],
    tips = [];
  for (let i = 0; i < N_CABLES; i++) {
    const segs = cablePoints(i);
    lines.push(...segs);
    if (cables[i].cut && segs.length === 2) ends.push(segs[0][segs[0].length - 1], segs[1][0]); // the two cut ends
    if (A && A.grow[i] > 0 && A.grow[i] < 1) tips.push(segs[0][0]); // the plug on its way up to the card
  }
  fill(54, 54, 52);
  ribbons(lines, 6, 0);
  fill(130, 130, 126); // highlight along the top
  ribbons(
    lines.map((pts) => pts.map((p) => ({ x: p.x, y: p.y - 1.8, z: p.z }))),
    1.4,
    1,
  );
  for (const e of ends) {
    // bare copper at the cut
    push();
    translate(e.x, e.y, e.z + 2);
    fill(184, 115, 51);
    sphere(3, 8, 6);
    pop();
  }
  for (const e of tips) {
    push();
    translate(e.x, e.y, e.z - 4); // stays behind the card face when it slides into its socket
    fill(40, 40, 38);
    sphere(5, 10, 8);
    pop();
  }
  for (let i = 0; i < N_CABLES; i++) {
    // floor sockets where the cables go in; during the arrival they open one after the other
    const s = A ? A.socket[i] : 1;
    if (s <= 0) continue;
    const d = cableGeometry(i)[3];
    push();
    translate(d.x, floorY() - 0.5, d.z);
    rotateX(HALF_PI);
    fill(70, 70, 68);
    ellipse(0, 0, 22 * s, 22 * s, 16);
    pop();
  }
  for (const p of A ? A.pulses : pulses) {
    if (p.t < 0) continue; // waiting for its turn in the floor
    const [a, b, c, d] = cableGeometry(p.cable);
    const t = 1 - p.t; // from the far end into the card
    push();
    translate(
      bezierPoint(a.x, b.x, c.x, d.x, t),
      bezierPoint(a.y, b.y, c.y, d.y, t),
      bezierPoint(a.z, b.z, c.z, d.z, t) + 4,
    );
    fill(205, 40, 28);
    sphere(4.5, 10, 8);
    pop();
  }
  pop();
}

// a lens that hangs from the ceiling on a jointed arm, held by a claw. it follows the cursor,
// glances at the card now and then, and dilates when you type or cut something.
// during the arrival it comes down to the glass (toward the camera) and looks straight out at you
const EYE_R = 39,
  EYE_ARM = 122;

function updateEye() {
  const now = millis();
  eye.swing = lerp(eye.swing, map(mouseX, 0, width, -0.06, 0.06, true), 0.03);
  const close = A ? A.close : 0;
  const swing = eye.swing * (1 - close);
  // up close the lens looks S times bigger; moving it toward the camera does that through perspective
  const S = constrain((0.34 * height) / (2 * EYE_R), 2.4, 4.6);
  const k = lerp(1, S, close);
  const sx = lerp(sin(swing) * EYE_ARM, 0, close),
    sy = lerp(-height / 2 + cos(swing) * EYE_ARM, -0.1 * height, close); // where it appears on screen
  eye.pos = { x: sx / k, y: sy / k, z: CAM_Z * (1 - 1 / k) };

  let lx,
    ly,
    follow = 0.15;
  if (A && A.t < PLAN.retract[1]) {
    // looking out of the screen at the visitor, the core riding along with its laser
    lx = 0;
    ly = A.laser > 0 ? lerp(-9, 9, A.scan) : 0;
  } else {
    let tx = mouseX - width / 2,
      ty = mouseY - height / 2;
    if (A) {
      tx = panX; // back under the ceiling it watches the card being filled in
      ty = CARD_Y;
    } else if (now < eye.saccadeUntil) {
      tx = panX;
      ty = CARD_Y + cardH * 0.3;
    } else if (now > eye.nextSaccade) {
      if (random() < 0.35) eye.saccadeUntil = now + random(250, 500);
      eye.nextSaccade = now + random(3000, 7000);
    }
    if (now < eye.saccadeUntil) follow = 0.5;
    const dx = tx - eye.pos.x,
      dy = ty - eye.pos.y,
      d = max(1, sqrt(dx * dx + dy * dy));
    const reach = min(11, d * 0.05);
    lx = (dx / d) * reach;
    ly = (dy / d) * reach;
  }
  eye.look.x = lerp(eye.look.x, lx, follow);
  eye.look.y = lerp(eye.look.y, ly, follow);
  const alert = A ? A.close > 0.3 : now - lastTypeMs < 1200 || now < eye.alarmUntil;
  eye.dilate = lerp(eye.dilate, alert ? 1 : 0, 0.08);
}

function drawEye() {
  const R = EYE_R;
  const { x: ex, y: ey, z: ez } = eye.pos;
  const breathe = 0.5 + 0.5 * sin(frameCount * 0.025);
  const flare = A ? A.laser : 0; // the core burns hotter while the laser is on
  const px = 0,
    py = -height / 2; // pivot on the ceiling

  // the arm runs from the ceiling plate to a hub just above the lens; up close it reaches toward you
  let ux = ex - px,
    uy = ey - py;
  const ul = max(1e-6, sqrt(ux * ux + uy * uy));
  ux /= ul;
  uy /= ul;
  const top = { x: px + ux * 6, y: py + uy * 6, z: 0 };
  const hub = { x: ex - ux * (R + 2), y: ey - uy * (R + 2), z: ez };
  const elbow = { x: (top.x + hub.x) / 2, y: (top.y + hub.y) / 2, z: (top.z + hub.z) / 2 };

  push();
  translate(0, 0, 3);
  noStroke();

  // ceiling plate and the arm
  fill(40, 40, 38);
  push();
  translate(px, py, 0);
  rect(-38, 0, 76, 9, 0, 0, 3, 3);
  pop();
  ribbons([[top, elbow]], 7, 0); // upper rod
  ribbons([[elbow, hub]], 6, 0); // lower rod
  push();
  translate(elbow.x, elbow.y, elbow.z);
  circle(0, 0, 15); // elbow
  pop();
  push();
  translate(hub.x, hub.y, hub.z);
  circle(0, 0, 20); // hub the claw grows from
  pop();

  // the lens
  push();
  translate(ex, ey, ez);
  fill(40, 40, 38);
  ellipse(0, 0, R * 2, R * 2, 72); // bezel (72 segments: smooth when the lens comes up close)
  fill(14, 14, 14);
  ellipse(0, 0, R * 2 - 12, R * 2 - 12, 72); // glass
  const G = 26 + eye.dilate * 6;
  for (let i = 10; i >= 1; i--) {
    // red glow, brightest in the middle
    const f = i / 10;
    fill(190 + 60 * (1 - f), 20 + 40 * (1 - f), 15, 26 + 10 * breathe);
    ellipse(eye.look.x * 0.6, eye.look.y * 0.6, G * 2 * f, G * 2 * f, 72);
  }
  fill(255, 220 + 25 * flare, 150 + 80 * flare);
  circle(eye.look.x, eye.look.y, 6 + eye.dilate * 3 + flare * 2); // the hot core
  fill(255, 255, 255, 70);
  circle(-14, -14, 10); // reflection on the glass
  pop();

  // the claw: two fingers from the hub around the bezel, pinching in below
  const fingers = [];
  for (const dir of [-1, 1]) {
    const pts = [];
    const a0 = -HALF_PI,
      a1 = dir < 0 ? -PI - radians(42) : radians(42);
    for (let k = 0; k <= 16; k++) {
      const a = lerp(a0, a1, k / 16);
      const r = R + 3 - (k / 16) * 4; // overlaps the bezel a little, so no gap shows when the lens is up close
      pts.push({ x: ex + cos(a) * r, y: ey + sin(a) * r, z: ez + 1 });
    }
    fingers.push(pts);
  }
  fill(40, 40, 38);
  ribbons(fingers, 6.5, 0);
  for (const f of fingers) {
    const t = f[f.length - 1];
    push();
    translate(t.x, t.y, ez + 2);
    fill(26, 26, 24);
    circle(0, 0, 9);
    pop();
  }
  pop();
}

// the scan: a red line of light from the lens, run down the glass over whoever sits in front of it.
// z = 0 is the screen plane, one unit per pixel, so the line is drawn there; the fan comes from the core
const laserY = () => lerp(-height / 2, height / 2, A.scan);

function drawLaserFan() {
  if (!A || A.laser <= 0) return;
  const y = laserY(),
    w2 = width / 2;
  push();
  noStroke();
  beginShape(TRIANGLES);
  fill(235, 40, 28, 70 * A.laser);
  vertex(eye.pos.x + eye.look.x, eye.pos.y + eye.look.y, eye.pos.z + 3);
  fill(235, 40, 28, 14 * A.laser);
  vertex(-w2, y, 0);
  vertex(w2, y, 0);
  endShape();
  pop();
}

function drawLaserLine() {
  if (!A || A.laser <= 0) return;
  const al = A.laser,
    y = laserY(),
    w2 = width / 2;
  push();
  noStroke();
  beginShape(TRIANGLE_STRIP); // afterglow above the line, where it has just been, and a short lead below
  fill(235, 40, 28, 0);
  vertex(-w2, y - 70, 0);
  vertex(w2, y - 70, 0);
  fill(235, 40, 28, 60 * al);
  vertex(-w2, y, 0);
  vertex(w2, y, 0);
  fill(235, 40, 28, 0);
  vertex(-w2, y + 12, 0);
  vertex(w2, y + 12, 0);
  endShape();
  fill(225, 30, 20, 255 * al);
  rect(-w2, y - 1.5, width, 3);
  fill(255, 225, 205, 255 * al);
  rect(-w2, y - 0.5, width, 1); // the hot centre of the beam
  // a ruler along both edges lights up where the line has passed
  for (let k = 0, ty = -height / 2; ty < y; k++, ty += 16) {
    const f = 1 - (y - ty) / 320;
    if (f <= 0) continue;
    const len = k % 5 === 0 ? 16 : 7;
    fill(225, 30, 20, 200 * f * al);
    rect(-w2 + 14, ty, len, 1.5);
    rect(w2 - 14 - len, ty, len, 1.5);
  }
  textFont(fontB);
  textSize(11);
  textAlign(RIGHT, BASELINE);
  fill(225, 30, 20, 255 * al);
  text('SCAN ' + String(Math.round(A.scan * 100)).padStart(3, '0') + ' %', w2 - 40, y - 9);
  pop();
}

// ---------- mouse -> card texture coordinates ----------

const rotXv = (v, a) => ({ x: v.x, y: v.y * cos(a) - v.z * sin(a), z: v.y * sin(a) + v.z * cos(a) });
const rotYv = (v, a) => ({ x: v.x * cos(a) + v.z * sin(a), y: v.y, z: -v.x * sin(a) + v.z * cos(a) });

// returns {x, y} on the card texture, or null if the mouse ray misses the card
function cardHit(mx, my) {
  const C = { x: 0, y: 0, z: CAM_Z };
  const d = { x: mx - width / 2, y: my - height / 2, z: -CAM_Z };
  const n = rotXv(rotYv({ x: 0, y: 0, z: 1 }, ry), rx);
  const P0 = { x: panX, y: panY + CARD_Y, z: 0 };
  const denom = d.x * n.x + d.y * n.y + d.z * n.z;
  if (abs(denom) < 1e-6) return null;
  const t = ((P0.x - C.x) * n.x + (P0.y - C.y) * n.y + (P0.z - C.z) * n.z) / denom;
  const P = { x: C.x + d.x * t - P0.x, y: C.y + d.y * t - P0.y, z: C.z + d.z * t - P0.z };
  const L = rotYv(rotXv(P, -rx), -ry);
  const u = (L.x / cardW + 0.5) * TEX_W;
  const v = (L.y / cardH + 0.5) * TEX_H;
  if (u < -24 || u > TEX_W + 24 || v < -24 || v > TEX_H + 24) return null;
  return { x: u, y: v };
}

let lastMouse = null; // previous drag position in pixels (p5's pmouse is per frame, not per event)
function mousePressed() {
  if (intro.on) return skipArrival();
  prevHit = cardHit(mouseX, mouseY);
  lastMouse = { x: mouseX, y: mouseY };
  smearDist = SMEAR_STEP; // the first touch of the ink scrambles something straight away
}
function mouseReleased() {
  prevHit = null;
  lastMouse = null;
}
function mouseDragged() {
  if (intro.on) return;
  const hit = cardHit(mouseX, mouseY);
  const now = { x: mouseX, y: mouseY };
  if (hit && prevHit) {
    if (smudge(prevHit, hit)) {
      lastSmudgeMs = millis();
      smearDist += dist(prevHit.x, prevHit.y, hit.x, hit.y);
      const n = floor(smearDist / SMEAR_STEP);
      if (n > 0) scrambleFields(n);
      smearDist -= n * SMEAR_STEP;
    }
  } else if (!hit && lastMouse) for (const x of cableCrossings(lastMouse, now)) cutCable(x.cable, x.t);
  prevHit = hit;
  lastMouse = now;
}

// ---------- drawing the card ----------

// text with letter spacing, left aligned; returns the x after the last character
function spaced(g, str, x, y, size, sp) {
  g.textSize(size);
  let cx = x;
  for (const ch of str) {
    g.text(ch, cx, y);
    cx += nativeWidth(fontB, size, ch) + sp + (ch === ' ' ? size * 0.2 : 0);
  }
  return cx;
}

function mrzLines() {
  const pad = (s) => (s + '<'.repeat(MRZ_COLS)).slice(0, MRZ_COLS);
  const l1 = pad('I<VISVISITOR<<UNKNOWN<' + fullHash.slice(12, 20) + '<<' + fullHash.slice(20, 32));
  const l2 = pad(
    trueId + '0VIS' + fullHash.slice(12, 18) + '<' + fullHash.slice(18, 24) + '<<<<<<<<<<<<' + fullHash.slice(28, 32),
  );
  return [l1, l2];
}

// everything on the card that never moves: drawn once
function drawStatic() {
  const g = staticLayer;
  g.clear();
  g.noStroke();
  g.fill(...CARD_BG);
  g.rect(0, 0, TEX_W, TEX_H, R_CORNER);

  g.textFont(fontB);
  g.textAlign(LEFT, BASELINE);

  // header
  g.fill(18);
  spaced(g, 'VISITOR IDENTITY CARD', M, 76, 21, 3);
  g.fill(...GREY);
  g.textAlign(RIGHT, BASELINE);
  g.textSize(13);
  g.text('ISSUED ON ARRIVAL  ·  NO CONSENT REQUIRED', TEX_W - M, 76);
  g.textAlign(LEFT, BASELINE);
  g.stroke(0, 0, 0, 40);
  g.strokeWeight(1.5);
  g.line(M, 92, TEX_W - M, 92);
  g.noStroke();

  // portrait box
  g.noFill();
  g.stroke(0, 0, 0, 60);
  g.strokeWeight(1.5);
  g.rect(FP.x, FP.y, FP.w, FP.h);
  g.noStroke();
  g.fill(...GREY);
  spaced(g, 'PRINT GENERATED FROM ID', FP.x, FP.y + FP.h + 20, 11, 1.4);

  // signal fields, two columns of five
  FIELD_ORDER.forEach((key, i) => {
    const s = signals.find((z) => z.key === key);
    if (!s) return;
    const col = Math.floor(i / 5),
      row = i % 5;
    const x = FIELDS_X[col],
      y = FIELDS_Y + row * ROW_H;
    g.fill(...GREY);
    spaced(g, s.label, x, y + 14, 11, 1.4);
    g.fill(s.cut ? 150 : 18);
    g.textSize(19);
    // typed in as its cable delivers it; garbled while smeared, until the cable delivers it again
    const str = s.cut ? '????????' : (scrambled[i] ?? s.show.slice(0, 24)).slice(0, A ? A.chars[i] : 24);
    g.text(str, x, y + 38);
    if (A && A.typing[i]) {
      g.fill(205, 40, 28);
      g.rect(x + nativeWidth(fontB, 19, str) + 2, y + 24, 9, 15);
    }
  });

  // sockets where the cables enter: pale until a cable is plugged in
  for (let i = 0; i < N_CABLES; i++) {
    const col = Math.floor(i / 5),
      row = i % 5;
    const y = FIELDS_Y + row * ROW_H + 26;
    g.fill((cables[i] && cables[i].cut) || (A && !A.connected[i]) ? 200 : 60);
    if (col === 0) g.rect(0, y - 8, 12, 16, 0, 3, 3, 0);
    else g.rect(TEX_W - 12, y - 8, 12, 16, 3, 0, 0, 3);
  }

  // number label
  g.fill(...GREY);
  spaced(g, 'VISITOR NO.', M, ID_LABEL_Y, 11, 1.4);

  // machine-readable zone
  g.fill(18);
  g.textSize(30);
  const pitch = (TEX_W - 2 * M) / MRZ_COLS;
  let left = A ? A.mrz : Infinity; // printed character by character at the end of the arrival
  mrzLines().forEach((line, li) => {
    for (let i = 0; i < line.length && left > 0; i++, left--) g.text(line[i], M + i * pitch, MRZ_Y[li]);
  });

  // frame
  g.noFill();
  g.stroke(0, 0, 0, 30);
  g.strokeWeight(2);
  g.rect(1, 1, TEX_W - 2, TEX_H - 2, R_CORNER - 1);
}

function drawCard() {
  card.clear();
  card.image(staticLayer, 0, 0);
  const ctx = card.drawingContext;

  // the number, as dots
  ctx.fillStyle = INK;
  for (let i = 0; i < glyphs.length; i++) {
    if (A && A.slots[i] === null) continue; // not computed yet
    const gl = glyphs[i];
    const s = GRID * 0.62 + gl.flash * 4;
    for (const p of gl.pts) ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }

  // the fingerprint: redrawn while it moves, reused from the cache while it rests
  if (!fpSettled) {
    fpLayer.clear();
    drawRidges(fpLayer.drawingContext, -FP.x, -FP.y);
    fpSettled = true;
  }
  card.image(fpLayer, FP.x, FP.y);
}

function draw() {
  background(...BG);
  if (!glyphs.length) return;

  // the arrival's clock only runs on frames that are drawn: a background tab or a slow font load can't eat it
  if (intro.on) intro.t = intro.skip ? intro.end : intro.t + Math.min(deltaTime, 250) / 1000;
  A = intro.on ? arrival(intro.t) : null;
  if (A && A.t >= intro.end) endArrival();

  updatePoints();
  if (A) applyArrival();
  else {
    updatePulses();
    correct();
    repair();
  }
  drawCard();

  // the card follows the mouse a little: tilt and pan
  const maxTilt = 0.16;
  const tRx = map(mouseY, 0, height, maxTilt, -maxTilt, true);
  const tRy = map(mouseX, 0, width, -maxTilt, maxTilt, true);
  rx = lerp(rx, tRx, 0.06);
  ry = lerp(ry, tRy, 0.06);
  panX = lerp(panX, map(mouseX, 0, width, -18, 18, true), 0.06);
  panY = lerp(panY, map(mouseY, 0, height, -12, 12, true), 0.06);

  drawRoom();
  drawCables();

  push();
  translate(panX, panY + CARD_Y, 0);
  rotateX(rx);
  rotateY(ry);
  noStroke();
  texture(card);
  plane(cardW, cardH);
  pop();

  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST); // overlays: always on top of the room
  updateEye();
  drawLaserFan();
  drawEye();
  drawLaserLine();

  cursor(!A && !mouseIsPressed && nearCable(mouseX, mouseY) ? CROSS : ARROW);

  // flat on the screen: what the machine is doing during the arrival, then the hint and footer
  push();
  textFont(fontB);
  textAlign(CENTER, BASELINE);
  if (A) {
    fill(18);
    textSize(13);
    text(A.status, 0, height / 2 - 50);
    fill(...GREY);
    textSize(11);
    text('CLICK TO SKIP', 0, height / 2 - 28);
  } else {
    fill(...GREY, 255 * clamp01((millis() - intro.doneMs) / 900));
    textSize(11);
    text('DRAG OVER THE CARD TO SMUDGE  ·  TYPE TO OVERWRITE  ·  DRAG ACROSS A CABLE TO CUT IT', 0, height / 2 - 50);
    textSize(13);
    text('OPEN THIS PAGE IN A PRIVATE WINDOW. IF THE NUMBER IS THE SAME, NOTHING IS PROTECTING YOU.', 0, height / 2 - 28);
  }
  pop();
  gl.enable(gl.DEPTH_TEST);
}

// ---------- the room ----------

// a quad lying on the floor; the fill may change between the two ends to fade with distance
function floorLine(a, b, w, y, alphaA, alphaB) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = max(1e-6, sqrt(dx * dx + dz * dz));
  const nx = ((-dz / len) * w) / 2,
    nz = ((dx / len) * w) / 2;
  beginShape(TRIANGLE_STRIP);
  fill(0, 0, 0, alphaA);
  vertex(a.x + nx, y, a.z + nz);
  vertex(a.x - nx, y, a.z - nz);
  fill(0, 0, 0, alphaB);
  vertex(b.x + nx, y, b.z + nz);
  vertex(b.x - nx, y, b.z - nz);
  endShape();
}

// an opaque floor in the wall's colour, with tile seams that vanish toward the horizon
function buildFloor() {
  const fy = floorY();
  const near = 300,
    far = -5200,
    step = 170,
    tone = 30;
  floorGeom = buildGeometry(() => {
    noStroke();
    fill(...BG);
    push();
    translate(0, fy, (near + far) / 2);
    rotateX(HALF_PI);
    plane(9000, near - far);
    pop();
    for (let x = -4000; x <= 4000; x += step) floorLine({ x, z: near }, { x, z: far }, 2.4, fy - 1, tone, 0);
    for (let z = -step; z > far; z -= step) {
      const a = tone * (1 - -z / -far);
      floorLine({ x: -4000, z }, { x: 4000, z }, 2.4, fy - 1, a, a);
    }
  });
}

function drawRoom() {
  push();
  noStroke();
  model(floorGeom);
  // the card's shadow on the floor
  push();
  translate(panX * 0.5, floorY() - 2, -70);
  rotateX(HALF_PI);
  for (const [f, a] of [
    [1, 7],
    [0.78, 7],
    [0.55, 8],
  ]) {
    fill(0, 0, 0, a);
    ellipse(0, 0, cardW * 0.95 * f, cardW * 0.26 * f, 32);
  }
  pop();
  pop();
}

// ---------- helpers ----------

// a small frosted-glass button in the corner that leads back to the intro page
function backButton() {
  const el = document.createElement('a');
  el.innerHTML =
    '<svg width="16" height="12" viewBox="0 0 16 12"><path d="M6 1 L1 6 L6 11 M1.5 6 H15" fill="none" ' +
    'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Back';
  el.href = '../../index.html';
  Object.assign(el.style, {
    position: 'fixed',
    left: '16px',
    top: '16px',
    zIndex: '20',
    padding: '9px 16px',
    borderRadius: '999px',
    font: '700 13px/1 monospace',
    color: '#222',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.45)',
    backdropFilter: 'blur(14px) saturate(170%)',
    webkitBackdropFilter: 'blur(14px) saturate(170%)',
    boxShadow:
      'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -6px 12px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.25)',
    transition: 'transform 0.3s ease',
  });
  el.onmouseenter = () => {
    el.style.transform = 'scale(1.08)';
  };
  el.onmouseleave = () => {
    el.style.transform = 'scale(1)';
  };
  document.body.appendChild(el);
}

// phones have no mouse to smudge with and no keyboard to type on
function deviceNotice() {
  const coarse = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (!coarse) return;
  const el = document.createElement('div');
  el.textContent = 'This piece needs a mouse and a keyboard. Open it on a computer.';
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    padding: '14px 18px',
    font: '13px/1.4 monospace',
    color: '#555',
    background: 'rgba(242,242,239,0.92)',
    textAlign: 'center',
  });
  document.body.appendChild(el);
}

// compare two windows: each signal gets its own 4-character hash, so a changed one stands out
function debugReadout() {
  const rows = signals.map((s) => ({ signal: s.label, hash: toHex(cyrb128(s.value)).slice(0, 4), value: s.value }));
  console.table(rows);
  console.log('ID', trueId, 'full', fullHash);
  if (!new URLSearchParams(location.search).has('debug')) return;
  const el = document.createElement('pre');
  el.textContent = `ID ${trueId}\n\n` + rows.map((r) => `${r.hash}  ${r.signal.padEnd(13)} ${r.value}`).join('\n');
  Object.assign(el.style, {
    position: 'fixed',
    left: '12px',
    top: '64px',
    margin: '0',
    padding: '10px 12px',
    maxWidth: '60vw',
    whiteSpace: 'pre-wrap',
    font: '11px/1.5 monospace',
    color: '#333',
    background: 'rgba(250,250,247,0.95)',
    border: '1px solid #ccc',
    zIndex: '10',
  });
  document.body.appendChild(el);
}
