/* ==========================================================================
   BOXED REFLECTION · CONTROL PAGE · logic
   DXB311 Interaction Design Capstone · Amritha Anil · n11539151

   Same form as the standalone mockup, with one thing added: it now talks to
   show.html.

   HOW THE TWO PAGES TALK
   BroadcastChannel lets two tabs or windows from the same website send each
   other messages. It is in memory on this one machine, so there is no server,
   no wifi and no delay worth measuring. Reference:
     https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel

   MESSAGES THIS PAGE SENDS
     { type:'session', answers:[...10] }   the ten answers, arms the projection
     { type:'start' }                      host pressed start
     { type:'abort' }                      reset everything

   MESSAGES THIS PAGE LISTENS FOR
     { type:'hello', state }               heartbeat from show.html, every 2s
     { type:'finished' }                   the film reached the end
   ========================================================================== */

const channel = new BroadcastChannel(CHANNEL);

let showAlive = false;
let lastHello = 0;
let mapIsLocked = false;   // mirrors the projection's lock, reported back to us

channel.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'hello') { lastHello = Date.now(); setLink(true); }
  if (m.type === 'finished') goWelcome();
  if (m.type === 'mapping')  setMappingUI(m.calibrating, m.locked);
};

/* The projection says hello every 2 seconds. If we have not heard from it in
   6, treat it as gone and disable Start. */
setInterval(() => {
  if (showAlive && Date.now() - lastHello > 6000) setLink(false);
}, 1000);

function setLink(live) {
  showAlive = live;
  const el = document.getElementById('link');
  el.classList.toggle('is-live', live);
  document.getElementById('link-text').textContent =
    live ? 'Projection connected' : 'Projection window not open';
  // Lock needs the projection up. Calibrate needs the projection up AND the
  // mapping unlocked, because a locked mapping stays locked until someone
  // deliberately unlocks it.
  const lb = document.getElementById('btn-lock');
  const cb = document.getElementById('btn-calibrate');
  if (lb) lb.disabled = !live;
  if (cb) cb.disabled = !live || mapIsLocked;

  const start = document.getElementById('btn-start');
  if (start) {
    start.disabled = !live;
    document.getElementById('start-hint').textContent = live
      ? 'Press only once the visitor is inside the box and facing right'
      : 'Open show.html in a second window and drag it to the projector';
  }
}

/* --------------------------------------------------------------------------
   PROJECTION MAPPING, DRIVEN FROM THIS WINDOW

   The projection window has keyboard shortcuts, but the host is normally
   looking at this screen, so pressing C over here would do nothing. These send
   the same instruction over the channel instead.
   -------------------------------------------------------------------------- */

function setMappingUI(calibrating, locked) {
  mapIsLocked = locked;

  const state = document.getElementById('map-state');
  const calib = document.getElementById('btn-calibrate');
  const lock  = document.getElementById('btn-lock');
  if (!state) return;

  state.textContent = locked ? 'locked' : 'unlocked';
  state.classList.toggle('locked', locked);

  calib.textContent = calibrating ? 'Hide corner grid' : 'Show corner grid';
  calib.disabled = locked || !showAlive;

  lock.textContent = locked ? 'Unlock' : 'Lock';
  lock.disabled = !showAlive;
}

/* The setup bar is only useful before the doors open, so it disappears the
   moment someone starts answering. */
function showSetupBar(on) {
  const el = document.getElementById('setup');
  if (el) el.hidden = !on;
}

/* --------------------------------------------------------------------------
   THE BARS  ·  adapted from gradient-bars-background by @waleedkibhen, 21st.dev
   https://21st.dev/community/components?q=gradient&preview=%2F%40waleedkibhen%2Fcomponents%2Fgradient-bars-background
   -------------------------------------------------------------------------- */

const NUM_BARS = 15;

function barHeight(index, total) {
  const position = index / (total - 1);
  const distanceFromCentre = Math.abs(position - 0.5);
  const curve = Math.pow(distanceFromCentre * 2, 1.2);
  return 30 + (100 - 30) * curve;
}

function buildBars() {
  const wrap = document.getElementById('bars');
  for (let i = 0; i < NUM_BARS; i++) {
    const scale = barHeight(i, NUM_BARS) / 100;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.transform = `scaleY(${scale})`;
    bar.style.setProperty('--initial-scale', scale);
    bar.style.animationDelay = `${i * 0.1}s`;
    wrap.appendChild(bar);
  }
  layoutBars();
}

/* Whole pixels, not percentages. Percentages leave sub pixel slivers that show
   as hairlines straight through the frosted card. */
function layoutBars() {
  const wrap = document.getElementById('bars');
  const total = wrap.clientWidth;
  const bars = wrap.children;
  for (let i = 0; i < bars.length; i++) {
    const left  = Math.round(i * total / NUM_BARS);
    const right = Math.round((i + 1) * total / NUM_BARS);
    bars[i].style.left  = left + 'px';
    bars[i].style.width = (right - left) + 'px';
  }
}
window.addEventListener('resize', layoutBars);

function setEmotionColour(rgb, alpha) {
  const root = document.documentElement.style;
  root.setProperty('--emotion', rgb);
  root.setProperty('--bar-alpha', alpha);
}

/* --------------------------------------------------------------------------
   SCREENS AND STATE
   -------------------------------------------------------------------------- */

const SCREENS = ['welcome', 'question', 'handoff', 'playing'];

function show(name) {
  SCREENS.forEach(s =>
    document.getElementById('screen-' + s).classList.toggle('is-active', s === name));
}

let current = 0;
let answers = [];
let locked = false;
let playTimer = null;

/* --------------------------------------------------------------------------
   TRANSITIONS
   Web Animations API, so the content swap happens at one exact moment while
   the card is invisible. https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
   Easing from easings.net.
   -------------------------------------------------------------------------- */

const REDUCED_MOTION =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAN_ANIMATE = !REDUCED_MOTION && typeof Element.prototype.animate === 'function';
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function staggerOptions() {
  if (!CAN_ANIMATE) return;
  document.querySelectorAll('#q-options .option').forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: 'translateY(10px)' },
       { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, delay: 120 + i * 70, easing: EASE_OUT, fill: 'backwards' });
  });
}

function crossfade(swap, done) {
  const card = document.getElementById('q-card');
  if (!CAN_ANIMATE) { swap(); staggerOptions(); done(); return; }

  const out = card.animate(
    [{ opacity: 1, transform: 'translateY(0) scale(1)' },
     { opacity: 0, transform: 'translateY(-12px) scale(0.992)' }],
    { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });

  out.finished.then(() => {
    swap();
    out.cancel();
    card.animate(
      [{ opacity: 0, transform: 'translateY(16px) scale(0.99)' },
       { opacity: 1, transform: 'translateY(0) scale(1)' }],
      { duration: 520, easing: EASE_OUT });
    staggerOptions();
    done();
  });
}

function fadeOutCard(done) {
  const card = document.getElementById('q-card');
  if (!CAN_ANIMATE) { done(); return; }
  const out = card.animate(
    [{ opacity: 1, transform: 'translateY(0) scale(1)' },
     { opacity: 0, transform: 'translateY(-14px) scale(0.99)' }],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
  out.finished.then(() => { done(); out.cancel(); });
}

/* --------------------------------------------------------------------------
   QUESTIONS
   -------------------------------------------------------------------------- */

function renderQuestion() {
  const s = SCENARIOS[current];
  setEmotionColour(s.rgb, 0.42);

  document.getElementById('q-count').textContent =
    String(current + 1).padStart(2, '0') +
    ' / ' + String(SCENARIOS.length).padStart(2, '0');
  document.getElementById('q-progress').style.width =
    (current / SCENARIOS.length * 100) + '%';
  document.getElementById('q-text').textContent = s.text;

  const box = document.getElementById('q-options');
  box.innerHTML = '';
  [['A', s.a, 'express'], ['B', s.b, 'suppress'], ['C', s.c, 'dismiss']]
    .forEach(([letter, copy, behaviour]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.innerHTML = '<span class="letter">' + letter + '</span><span>' + copy + '</span>';
      if (answers[current] === behaviour) btn.classList.add('is-chosen');
      btn.addEventListener('click', () => choose(btn, behaviour));
      box.appendChild(btn);
    });

  document.getElementById('btn-back').hidden = (current === 0);
}

function choose(button, behaviour) {
  if (locked) return;
  locked = true;

  answers[current] = behaviour;
  document.querySelectorAll('#q-options .option')
    .forEach(el => el.classList.remove('is-chosen'));
  button.classList.add('is-chosen');

  document.getElementById('q-progress').style.width =
    ((current + 1) / SCENARIOS.length * 100) + '%';

  setTimeout(() => {
    if (current < SCENARIOS.length - 1) {
      crossfade(() => { current++; renderQuestion(); }, () => { locked = false; });
    } else {
      fadeOutCard(() => { goHandoff(); locked = false; });
    }
  }, 420);
}

function goBack() {
  if (locked || current === 0) return;
  locked = true;
  crossfade(() => { current--; renderQuestion(); }, () => { locked = false; });
}

/* --------------------------------------------------------------------------
   THE OTHER SCREENS, AND THE MESSAGES THEY SEND
   -------------------------------------------------------------------------- */

function goWelcome() {
  clearInterval(playTimer);
  current = 0;
  answers = [];
  locked = false;
  setEmotionColour(NEUTRAL_RGB, 0.34);
  channel.postMessage({ type: 'abort' });
  showSetupBar(true);
  show('welcome');
}

function goQuestions() {
  showSetupBar(false);
  current = 0;
  answers = [];
  locked = false;
  renderQuestion();
  show('question');
  staggerOptions();
}

function goHandoff() {
  setEmotionColour(NEUTRAL_RGB, 0.30);
  show('handoff');
  setLink(showAlive);

  // THIS is the line that connects the form to the projection.
  // The ten answers go across, the projection arms itself and waits.
  channel.postMessage({ type: 'session', answers: answers.slice() });
}

function goPlaying() {
  if (!showAlive) return;
  setEmotionColour(NEUTRAL_RGB, 0.52);
  show('playing');

  channel.postMessage({ type: 'start' });

  const total = SCENARIOS.length * (SEGMENT_MS / 1000);
  let left = total;
  const status = document.getElementById('play-status');
  const fill = document.getElementById('play-progress');

  const tick = () => {
    fill.style.width = ((total - left) / total * 100) + '%';
    status.textContent = left > 0
      ? left + ' second' + (left === 1 ? '' : 's') + ' remaining'
      : 'Finished';
    if (left <= 0) clearInterval(playTimer);
    left--;
  };
  tick();
  clearInterval(playTimer);
  playTimer = setInterval(tick, 1000);
}


/* --------------------------------------------------------------------------
   HOW MANY SCENARIOS THERE ARE

   The wording used to say "ten" and "fifty seconds" in five separate places in
   the HTML. Removing one scenario meant hunting all five down, and I missed a
   couple the first time. So the copy now carries placeholders and this fills
   them in from the array at boot. Add or remove a scenario and every count,
   every word and the runtime follow on their own.
   -------------------------------------------------------------------------- */

const WORDS = ['zero','one','two','three','four','five','six','seven','eight',
               'nine','ten','eleven','twelve'];

function inWords(n) {
  if (WORDS[n]) return WORDS[n];
  if (n < 20) return 'nineteen';
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const unit = n % 10;
  return unit ? tens[Math.floor(n / 10)] + '-' + WORDS[unit] : tens[Math.floor(n / 10)];
}

function stampCounts() {
  const n       = SCENARIOS.length;
  const seconds = n * (SEGMENT_MS / 1000);
  const values  = {
    count:        String(n),
    countWord:    inWords(n),
    countWordCap: inWords(n).charAt(0).toUpperCase() + inWords(n).slice(1),
    seconds:      String(seconds),
    secondsWord:  inWords(seconds)
  };
  document.querySelectorAll('[data-count-slot]').forEach((el) => {
    const key = el.getAttribute('data-count-slot');
    if (values[key] !== undefined) el.textContent = values[key];
  });
}

/* --------------------------------------------------------------------------
   WIRING
   -------------------------------------------------------------------------- */

buildBars();
setEmotionColour(NEUTRAL_RGB, 0.34);
setLink(false);
channel.postMessage({ type: 'ping' });

const calibBtn = document.getElementById('btn-calibrate');
const lockBtn  = document.getElementById('btn-lock');
if (calibBtn) calibBtn.addEventListener('click', () => channel.postMessage({ type: 'calibrate' }));
if (lockBtn)  lockBtn.addEventListener('click',  () => channel.postMessage({ type: 'lockToggle' }));

/* Opens the projection page in its own window, which saves hunting for the
   file. It has to be a real window rather than a tab, because it gets dragged
   onto the projector and put fullscreen. Popup blockers allow this because it
   happens inside a click. */
const openBtn = document.getElementById('btn-open');
if (openBtn) {
  openBtn.addEventListener('click', () => {
    const w = window.open('show.html', 'boxed-reflection-projection',
                          'width=1280,height=800');
    if (!w) {
      openBtn.textContent = 'Blocked, open show.html yourself';
      return;
    }
    openBtn.textContent = 'Opened';
    w.focus();
  });
}

document.getElementById('btn-begin').addEventListener('click', goQuestions);
document.getElementById('btn-back').addEventListener('click', goBack);
document.getElementById('btn-start').addEventListener('click', goPlaying);
document.getElementById('btn-finish').addEventListener('click', goWelcome);

document.addEventListener('keydown', (e) => {
  const on = n => document.getElementById('screen-' + n).classList.contains('is-active');
  if (e.key === 'Enter' && on('welcome')) goQuestions();
  if (e.key === 'Escape') goWelcome();
  if (on('question') && !locked) {
    const map = { '1': 0, '2': 1, '3': 2, a: 0, b: 1, c: 2 };
    const i = map[e.key.toLowerCase()];
    if (i !== undefined) {
      const opts = document.querySelectorAll('.option');
      if (opts[i]) opts[i].click();
    }
  }
});

stampCounts();   // fill the "nine" and "forty-five" placeholders in the copy
