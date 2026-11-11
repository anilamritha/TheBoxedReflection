/*
============================================================================
FILE:        show.js
AUTHOR:      Amritha Anil
STUDENT ID:  n11539151
UNIT/COURSE: DXB311 Interaction Design Capstone
ASSIGNMENT:  The Boxed Reflection (exhibition installation)
DATE:        23 October 2026
============================================================================
DESCRIPTION:
    The p5.js sketch that runs on the projector. It draws a field of 7200
    particles of light and moves them with three behaviours: express bursts
    outward like fireworks, suppress shrinks and fades into the distance, and
    dismiss is ten small clusters of light that go one orb at a time, one
    cluster after another, while a dark wash of the colour comes up behind. Each answer gets a five second segment
    in its scenario colour. Afterwards it shows the counts, then the verdict
    (expressive, suppressive or dismissive), and adds the answers to an
    anonymous running tally.
BASED ON / SOURCES:
    p5.js (v1.9.4) and the p5.js reference: setup(), draw(), createGraphics(),
    blendMode(), drawingContext, fullscreen(), windowResized(), keyPressed().
    The Coding Train and The Nature of Code (Daniel Shiffman) videos and
    written lessons: getting started with p5.js, arrays of objects, polar
    coordinates, lerp and easing, and particle systems. Each one is marked
    "LEARNED FROM" where it is used below. Full list in REFERENCES.md.
    Canvas 2D globalCompositeOperation (MDN) for the light blending.
    mulberry32 seeded random number generator by Tommy Ettinger (public domain).
    Bokeh and firework look based on my own reference boards.
    Links in REFERENCES.md.
INTERACTS WITH:
    show.html      the page and canvas this draws into
    scenarios.js   SCENARIOS, TIEBREAKER, SEGMENT_MS, CHANNEL, leadersOf
    mapping.js     the corner warp (mappingSetup, mappingDraw and friends)
    app.js         receives session / start / abort / calibrate / lockToggle,
                   sends hello / finished / mapping / state
    localStorage   boxed-reflection-tally (the running total)
CHANGE HISTORY (what was changed and why):
    Oct 2026: the results stayed up too briefly to read and then place a
    sticker. The counts screen went from 5.6 to 10 seconds and the verdict from
    6.8 to 15 seconds (BEAT_ONE_MS and BEAT_TWO_MS).
    Oct 2026: the verdict was two way (expressive or suppressive, with dismiss
    counted as suppressive). It is now three way with DISMISSIVE added. A
    "You're more likely to ..." wording was tried first, then changed back to
    the original "You are more ..." look.
    Oct 2026: the film plays the tie breaker as a tenth segment, and draw()
    checks the canvas still matches the screen after going fullscreen.
    Nov 2026: dismiss was changed. It used to be a still field of dots across
    the whole wall that cut out in a single frame at two seconds, on top of a
    dark wash that was there from the start. Now the first frame is ten
    small clusters of six to twelve orbs each. From 0.4 seconds the clusters
    disappear one at a time, one orb at a time, until every orb has gone at
    4.5 seconds. The dark wash slowly comes up the whole time they are going,
    and the last 0.5 seconds is just the wash. The old 'snap' version and the
    'vanish' version are both still in the code (DISMISS_STYLE).
HONOUR CODE / ACADEMIC INTEGRITY:
    I hereby declare that this submission is my own work. Any code, ideas,
    or text from other sources have been fully acknowledged and cited.

    AI acknowledgement: Generative AI (Claude, by Anthropic) was used as a
    coding assistant during development (explanations, debugging and some
    implementation). The October and November 2026 changes in the change
    history above were written with Claude. Full details are in my AI use declaration.
============================================================================
*/

/* ==========================================================================
   NOTES

   This is the window that goes on the projector. Drag it to the second
   display and press F for fullscreen.

   It does nothing on its own. It waits for the control page to send the
   answers (nine, or ten with a tie breaker), then waits again for the
   attendant to press start.

     IDLE    slow drift, nothing has been sent yet
     ARMED   answers received, waiting for the attendant
     PLAYING the forty-five second film, nine segments of five seconds
             (fifty seconds and ten segments when there was a tie breaker)
     RESULT  their counts, then the verdict, then back to IDLE
     then back to IDLE

   THE WHOLE SYSTEM IN ONE LINE
     the scenario sets the colour, the answer sets the motion.
   Nine colours times three motions is twenty-seven outcomes.

   p5.min.js sits in the same folder rather than being loaded from a CDN,
   because the room may have no wifi.
   ========================================================================== */

const channel = new BroadcastChannel(CHANNEL);

let state    = 'IDLE';
let answers  = [];
let startAt  = 0;
let orbs     = [];
let sprite   = null;

let cx, cy, RX, RY, minDim;

/* ============================ ORB FIELD ============================ */

/* Ten times the old count. The reference boards are wall to wall circles,
   "a lot going on", so the frame has to be crowded before anything moves. */
const ORB_COUNT = 7200;

/* A small share of the field are the big soft out of focus discs from the
   bokeh reference. The rest are small sparkles. Mostly small with a long tail
   is what makes it read as depth rather than confetti. */
const BOKEH_SHARE = 0.048;

/* CODE REVIEW: a seeded random number generator. Math.random() gives a
   different field every time the page loads; seeding it means the orbs land in
   the same places every run, so the film looks the same for every visitor and
   on every rehearsal. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* LEARNED FROM: arrays of objects (The Coding Train, 7.3 Arrays of Objects)
   and particle systems (The Nature of Code, chapter 4). Every orb is one
   object in the orbs array that remembers its own burst, angle, distance,
   size and twinkle, and every frame loops through the array and asks each one
   where it should be. That is the particle system idea in its simplest form. */
function buildOrbs() {
  const rnd = mulberry32(20260924);
  orbs = [];

  const perBurst = Math.floor(ORB_COUNT / BURSTS);
  const dots     = Math.max(4, Math.floor(perBurst / RAYS_PER_BURST));

  /* Explicit core, ray, dot. WHAT DIDN'T WORK: the earlier version derived all
     three from i with modular arithmetic and the spokes came out scrambled,
     which is why it read as a cloud instead of a firework. */
  for (let c = 0; c < BURSTS; c++) {
    for (let r = 0; r < RAYS_PER_BURST; r++) {

      /* evenly spaced spokes with only a little jitter. Too much jitter and
         the spokes dissolve back into a cloud. */
      const ang = (r / RAYS_PER_BURST) * TWO_PI + (rnd() - 0.5) * 0.045;

      for (let d = 0; d < dots; d++) {
        /* dots strung out along the spoke: the tip travels furthest, the ones
           behind it trail. This is the whole reason a firework has spokes. */
        const along = Math.pow(d / (dots - 1 || 1), 0.78);
        const isBokeh = rnd() < BOKEH_SHARE;

        /* an independent even scatter over a disc, kept for suppress, which
           has nothing to do with the burst geometry */
        const sa = rnd() * TWO_PI, sr = Math.sqrt(rnd());

        /* and a separate scatter over the whole RECTANGLE for dismiss. A disc
           leaves the corners bare and reads as a shape; this fills the window
           edge to edge with no shape to it at all. */
        const fx = rnd() * 2 - 1, fy = rnd() * 2 - 1;

        orbs.push({
          ci: c,
          ang: ang,
          spd: 0.03 + along * 0.97 + (rnd() - 0.5) * 0.035,
          along: along,

          hx: Math.cos(sa) * sr, hy: Math.sin(sa) * sr, hr: sr, ha: sa,
          fx: fx, fy: fy,

          /* dismiss gets its own size and shade rolls, so the field does not
             inherit the burst field's look */
          dOn: rnd() < 0.30,
          dR: 3 + Math.pow(rnd(), 1.9) * 30,
          dA: 0.30 + rnd() * 0.70,
          dPhase: rnd() * TWO_PI,

          z: 0.40 + rnd() * 0.60,
          baseR: isBokeh ? 14 + rnd() * 22 : 2.5 + Math.pow(rnd(), 2.6) * 13,
          bokeh: isBokeh,
          pi: (Math.floor(rnd() * HUE_STEPS) * SHADE_STEPS) + Math.floor(rnd() * SHADE_STEPS),
          twPhase: rnd() * TWO_PI,
          twRate: 0.7 + rnd() * 1.9,
          burst: 1,
          ph: rnd(),
          star: rnd() < 0.055
        });
      }
    }
  }
  orbs.sort((a, b) => a.z - b.z);
}

/* Two sprites. A soft glow for the sparkles, and a bokeh disc with a brighter
   rim and a flatter middle, which is what an out of focus highlight actually
   looks like through a lens. */
let spriteGlow = null;
let spriteBokeh = null;

function buildSprite() {
  const S = 128;

  spriteGlow = createGraphics(S, S);
  spriteGlow.noStroke();
  let ctx = spriteGlow.drawingContext;
  let g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.62)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  spriteBokeh = createGraphics(S, S);
  spriteBokeh.noStroke();
  ctx = spriteBokeh.drawingContext;
  g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  g.addColorStop(0.00, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.52, 'rgba(255,255,255,0.50)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.78)');   // the rim
  g.addColorStop(0.88, 'rgba(255,255,255,0.30)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  sprite = spriteGlow;    // anything still reaching for the old name
}

/* ============================ EASING ============================ */
/* LEARNED FROM: The Coding Train, "What is lerp?", and the p5.js lerp() and
   map() reference pages. An easing curve is lerp with a bend in it: instead of
   moving at a constant speed, things shoot off and settle, or start slowly and
   build. The curve shapes are from easings.net. */
/* WHAT DIDN'T WORK: do not name any of these "smooth". p5 already owns that
   name and yours gets overwritten by it, which silently breaks the sketch with
   no error at all. */

const easeOutCubic   = t => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
const easeInQuart    = t => t * t * t * t;
const easeOutQuint   = t => 1 - Math.pow(1 - t, 5);

/* lub-dub. Two gaussian bumps close together, then a rest, on about a 1.15
   second cycle. Used once suppression has settled into its held core. */
function heartbeat(seconds) {
  const p = seconds % 1.15;
  const lub = Math.exp(-Math.pow((p - 0.08) / 0.105, 2));
  const dub = Math.exp(-Math.pow((p - 0.33) / 0.125, 2)) * 0.62;
  return Math.min(1, lub + dub);
}

/* ============================ THE THREE BEHAVIOURS ============================

   EXPRESS   the frame is already full, and everything keeps growing outward
             past the edge. Brighter as it goes. Some orbs burst ahead.
   SUPPRESS  swallowed inward fast, shrinking into the distance, but it never
             leaves: a small dim core stays and beats quietly.
   DISMISS   ten small clusters of light. From 0.4 seconds they go one orb at
             a time, one cluster after another, all gone by 4.5 seconds, while
             a very dark wash of the emotion colour rises behind them. Not
             black.

   Express and suppress both still exist at five seconds. Dismiss does not.
   ============================================================================= */

/* ============================ THE BURSTS ============================

   The note was fireworks: several going off at once, from different cores, at
   different moments. Everything before this radiated from one point in the
   middle, which is one firework on a loop, and one firework can never have a
   gap in it. Sixteen cores (BURSTS) scattered across the sky, each on its own
   clock and its own scale, is what makes the wall read as a display.
   ==================================================================== */

const BURSTS = 16;
let bursts = [];

function buildBursts() {
  const rnd = mulberry32(77003);
  bursts = [];
  for (let i = 0; i < BURSTS; i++) {
    bursts.push({
      /* scattered wide, sitting a little high, the way a real display does */
      bx: (rnd() * 2 - 1) * 1.28,
      by: (rnd() * 2 - 1) * 1.05 - 0.08,
      scale: 0.40 + rnd() * 0.70,
      cycles: 0.52 + rnd() * 0.62,   // fires less often, so each burst lives longer and they overlap
      phase: rnd(),                  // and never in step with its neighbours
      gravity: 0.10 + rnd() * 0.20   // the trails droop as they die
    });
  }
}

/* Rays per core. 7200 orbs over 16 bursts is 450 each, and 26 rays gives
   about 17 dots strung out along each ray (buildOrbs works this out), which
   reads as a spray with visible spokes rather than a cloud.
   DOTS_PER_RAY below is left over from an earlier version with fewer orbs and
   is no longer used; buildOrbs calculates the dots per ray itself. */
const RAYS_PER_BURST = 26;
const DOTS_PER_RAY   = 8;

/* CODE REVIEW (express, suppress, dismiss): each takes one orb "o" and "t",
   how far through the five second segment we are (0 to 1), and returns where
   that orb is, how big and how bright, or null if it should not be drawn. */
function express(o, t) {
  const B = bursts[o.ci];
  const k = (t * B.cycles + B.phase) % 1;

  /* fast out of the shell, then drag. The deceleration is most of what makes
     it read as a firework rather than a zoom. */
  const travel = 1 - Math.pow(1 - k, 2.7);
  const dist   = o.spd * B.scale * travel;
  const droop  = B.gravity * k * k * minDim * 0.55;

  /* a hard flash at detonation, then a tailing fade. The tip of each spoke
     dies first, which is what gives the spokes their taper. */
  /* the detonation. A short hard overexposure right at the start, which is
     what a firework actually does and what the reference photographs are
     full of: a white hot core with colour thrown off it. */
  const flash = k < 0.05 ? (k / 0.05) * 2.6 : 1 + Math.pow(1 - k / 0.22, 3) * 1.6 * (k < 0.22 ? 1 : 0);
  const life  = flash * Math.pow(1 - k, 0.85 + o.along * 0.75);

  const lift = 0.95 + 0.45 * easeOutCubic(t);

  /* LEARNED FROM: polar coordinates (The Coding Train, 9.20 Polar
     Coordinates, and The Nature of Code, 3.4). Each dot has its own angle
     (o.ang) and distance, and cos() and sin() turn that into an x and a y.
     Dots that share an angle line up into the rays of the firework. */
  /* ONE radius for both axes, so the burst is round. WHAT DIDN'T WORK:
     spraying through RX and RY separately squashed every burst into a flat
     ellipse. */
  const R = minDim * 0.60;

  return {
    x: cx + B.bx * width  * 0.36 + Math.cos(o.ang) * dist * R,
    y: cy + B.by * height * 0.34 + Math.sin(o.ang) * dist * R + droop,
    size:  o.baseR * o.z * (0.40 + (1 - travel) * 1.15),
    alpha: 320 * o.z * life * lift,
    orb: o
  };
}

function suppress(o, t) {
  /* Big, then medium, then small, then gone. No pulse and no held core: it
     simply recedes until there is nothing, the way something you decided not
     to say gets quieter the longer you hold it.

     The same dark emotion wash sits under this the whole segment, so it opens
     and closes the same way dismiss does and the film never jump cuts. */

  /* nearly linear on purpose. WHAT DIDN'T WORK: easing it made the whole withdrawal happen in
     the first two seconds and then sit there empty, which is not big, medium,
     small, gone: it is just gone. */
  const shrink = t * 0.92 + easeInOutCubic(t) * 0.08;

  /* pulled in toward a point, from wider than the frame to almost nothing */
  const pull = 1 - shrink * 0.88;

  /* size falls a little faster than position, so it reads as receding into
     the distance rather than being dragged to the middle */
  const size = Math.pow(1 - shrink, 1.15);

  /* it keeps its brightness the whole way down and only goes at the very end.
     Fading early reads as a dissolve, not a withdrawal. */
  const fade = t < 0.84 ? 1 : Math.max(0, 1 - (t - 0.84) / 0.16);
  if (fade <= 0) return null;

  return {
    x: cx + o.hx * RX * 1.75 * pull,
    y: cy + o.hy * RY * 1.75 * pull,
    size:  o.baseR * o.z * (0.10 + size * 1.15),
    alpha: (52 + 150 * size) * o.z * fade,
    orb: o
  };
}

/* KEPT ON PURPOSE, NOT COMMENTED OUT: three dismiss behaviours live here. Flip DISMISS_STYLE to compare
   them on the wall, which is the only place the difference actually matters.
     'clusters' ten clusters go one orb at a time while the wash rises (current, Nov 2026)
     'snap'     the pixels arrive, hold, and cut out in a single frame (used until Nov 2026)
     'vanish'   the pixels arrive, then wink out one at a time */
let DISMISS_STYLE = 'clusters'; // flip to 'snap' or 'vanish' here, or type DISMISS_STYLE='snap' in the console while it runs
/* Two seconds in, not a fraction of the segment, so the hold is the same
   length no matter what SEGMENT_MS is set to. */
const SNAP_AT_MS = 2000;

/* Where a dismiss dot sits and how big it is. Shared by both styles so the
   two only differ in HOW the light leaves, never in what was there. */
function dismissField(o) {
  if (!o.dOn) return null;
  const drift = Math.sin(GLINT * 0.5 + o.dPhase) * 0.004;
  return {
    x: cx + o.fx * width  * (0.54 + drift),
    y: cy + o.fy * height * (0.54 + drift),
    size: o.dR * o.z
  };
}

function dismissSnap(o, t) {
  const cut = SNAP_AT_MS / SEGMENT_MS;
  if (t >= cut) return null;                 // gone. One frame. No fade at all.

  const f = dismissField(o);
  if (!f) return null;

  /* No ramp in and no ramp out. Every dot is simply there, at full, from the
     first frame of the segment, and at 2000ms every one of them is simply
     not. The only thing left is the dark wash. */
  return {
    x: f.x, y: f.y,
    size: f.size,
    alpha: 200 * o.z * o.dA,
    orb: o
  };
}

function dismissVanish(o, t) {
  const f = dismissField(o);
  if (!f) return null;

  /* each dot has its own moment to go, staggered right across the segment */
  const leaveAt = 0.20 + o.ph * 0.66;
  const left = t < leaveAt ? 1 : Math.max(0, 1 - (t - leaveAt) / 0.09);
  if (left <= 0) return null;

  return {
    x: f.x, y: f.y,
    size: f.size * (0.55 + left * 0.45),
    alpha: 200 * o.z * o.dA * left,
    orb: o
  };
}

/* ---------------------------- THE CLUSTERS ----------------------------
   The current dismiss. A small separate set of orbs (about ninety), not taken
   from the main field, so building them does not change a single random
   number that express and suppress rely on. They get their own seed. */
const CLUSTERS        = 10;
const MIN_PER_CLUSTER = 6;
const MAX_PER_CLUSTER = 12;
const HOLD_MS         = 400;     // the clusters hold this long before the first orb goes
const WASH_HOLD_MS    = 500;     // the end of the segment is just the wash, no orbs
const CLEAR_BY_MS     = SEGMENT_MS - WASH_HOLD_MS;   // every orb gone by here (4.5 seconds)
const ORB_FADE_MS     = 100;     // how long one orb takes to go (a little faster or slower each)
const CLUSTER_GAP     = 2;       // a short pause, two orbs long, between one cluster and the next
let clusterOrbs = [];

/* CODE REVIEW: picks ten centres spread around the wall (a new centre is
   rejected if it lands too close to one already chosen, so the clusters never
   clump together), then puts six to twelve orbs around each one. Positions
   are kept as fractions of the screen, so they still fit after a resize.
   Then it works out when each orb goes (goAt): the clusters are put in a
   random order, the orbs inside each cluster are shuffled, and they are
   spaced evenly in one queue from HOLD_MS to CLEAR_BY_MS, with a small gap
   between clusters. So only one cluster is ever going at a time. */
function buildClusters() {
  const rnd = mulberry32(51123);
  const centres = [];
  let tries = 0;

  while (centres.length < CLUSTERS && tries < 5000) {
    tries++;
    const x = 0.08 + rnd() * 0.84;
    const y = 0.12 + rnd() * 0.76;
    let ok = true;
    for (let i = 0; i < centres.length; i++) {
      const dx = (x - centres[i].x) * 1.6;    // the wall is wider than it is tall
      const dy = y - centres[i].y;
      if (dx * dx + dy * dy < 0.28 * 0.28) { ok = false; break; }
    }
    if (ok) centres.push({ x: x, y: y });
  }

  clusterOrbs = [];
  for (let c = 0; c < centres.length; c++) {
    const count  = MIN_PER_CLUSTER + Math.floor(rnd() * (MAX_PER_CLUSTER - MIN_PER_CLUSTER + 1));
    const spread = 0.055 + rnd() * 0.035;

    for (let i = 0; i < count; i++) {
      const a = rnd() * TWO_PI;
      const r = Math.sqrt(rnd());
      const isBokeh = rnd() < 0.18;

      clusterOrbs.push({
        cluster: true,
        cx: centres[c].x,
        cy: centres[c].y,
        ox: Math.cos(a) * r,
        oy: Math.sin(a) * r,
        spread: spread,
        z: 0.70 + rnd() * 0.30,
        baseR: isBokeh ? 15 + rnd() * 13 : 5 + Math.pow(rnd(), 1.6) * 12,
        bokeh: isBokeh,
        dA: 0.65 + rnd() * 0.35,
        pi: (Math.floor(rnd() * HUE_STEPS) * SHADE_STEPS) + Math.floor(rnd() * SHADE_STEPS),
        twPhase: rnd() * TWO_PI,
        twRate: 0.7 + rnd() * 1.9,
        dPhase: rnd() * TWO_PI,
        fadeRate: 0.85 + rnd() * 0.30,
        ci: c,
        goAt: 0
      });
    }
  }

  /* the order the clusters go in, then the order inside each cluster.
     null in the queue is the short pause between two clusters. */
  const order = [];
  for (let c = 0; c < centres.length; c++) order.push(c);
  shuffleInPlace(order, rnd);

  const queue = [];
  for (let n = 0; n < order.length; n++) {
    const members = clusterOrbs.filter(o => o.ci === order[n]);
    shuffleInPlace(members, rnd);
    for (let i = 0; i < members.length; i++) queue.push(members[i]);
    if (n < order.length - 1) {
      for (let g = 0; g < CLUSTER_GAP; g++) queue.push(null);
    }
  }

  /* the last orb has to have finished going by CLEAR_BY_MS, so the queue
     stops one (slowest) orb fade short of it */
  const span = CLEAR_BY_MS - HOLD_MS - ORB_FADE_MS * 1.15;
  const step = span / (queue.length - 1);
  for (let i = 0; i < queue.length; i++) {
    if (queue[i]) queue[i].goAt = HOLD_MS + i * step;
  }
}

/* Fisher-Yates shuffle, using the seeded random so the order is the same
   every run. */
function shuffleInPlace(list, rnd) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
}

/* CODE REVIEW: every cluster orb is at full brightness on the first frame.
   When its own moment comes (goAt) it fades out over about ORB_FADE_MS, which
   is quick enough that it reads as the orbs going one at a time.
   The orbs in the main field are never drawn during dismiss (returns null). */
function dismissClusters(o, t) {
  if (!o.cluster) return null;
  const ms = t * SEGMENT_MS;

  const k = constrain((ms - o.goAt) / (ORB_FADE_MS * o.fadeRate), 0, 1);
  const fade = Math.pow(1 - k, 1.5);
  if (fade <= 0) return null;

  const R = minDim * o.spread;
  const sway = Math.sin(GLINT * 0.5 + o.dPhase) * 2;   // a couple of pixels, so it is not frozen

  return {
    x: o.cx * width  + o.ox * R + sway,
    y: o.cy * height + o.oy * R + sway * 0.6,
    size: o.baseR * o.z,
    alpha: 270 * o.z * o.dA * fade,
    orb: o
  };
}

/* The wash for the clusters: nothing while they hold, then it slowly comes
   up the whole time the orbs are going (eased, so it starts slowly), reaches
   full as the last orb goes at CLEAR_BY_MS, and stays full to the end. */
function clusterWash(t) {
  const ms = t * SEGMENT_MS;
  return easeInOutCubic(constrain((ms - HOLD_MS) / (CLEAR_BY_MS - HOLD_MS), 0, 1));
}

function dismiss(o, t) {
  if (DISMISS_STYLE === 'clusters') return dismissClusters(o, t);
  return DISMISS_STYLE === 'snap' ? dismissSnap(o, t) : dismissVanish(o, t);
}

/* The clusters are their own small set of orbs, so a dismiss segment draws
   that set instead of the main field. */
function orbsFor(answer) {
  return (answer === 'dismiss' && DISMISS_STYLE === 'clusters') ? clusterOrbs : orbs;
}

const BEHAVIOUR = { express, suppress, dismiss };

/* How strong the dark residue is at this moment of the segment.
   Suppress, snap and vanish clear it before the next scenario. The clusters
   hold it at full for the last 0.5 seconds instead. */
function washFor(answer, t) {
  /* clusters: the wash comes up slowly while the orbs go (clusterWash).
     snap and vanish: the wash is at full from frame one, so the dots sit on
     the dark colour the whole time and what is left when they go is the same
     dark colour. Suppress eases into it. */
  if (answer === 'dismiss' && DISMISS_STYLE === 'clusters') return clusterWash(t);
  if (answer === 'dismiss') return t > 0.88 ? Math.max(0, 1 - (t - 0.88) / 0.12) : 1;
  if (answer === 'suppress') return dismissResidue(t);
  return 0;
}

function dismissResidue(t) {
  /* Present for the WHOLE segment, not only once the light has gone. It fades
     up as the scenario opens and eases away at the very end, so neither the
     vanishing nor the change of scenario lands as a jump cut. */
  const inn = Math.min(1, t / 0.10);
  const out = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
  return inn * Math.max(0, out);
}

/* CODE REVIEW: how one answer eases into the next instead of cutting. For
   the first half second of each segment, drawPlaying() asks every orb where
   the previous behaviour left it and where the new one wants it, and this
   mixes the two with p5's lerp() (position, size and brightness), shaped by
   easeInOutCubic. Dismiss is the exception and is simply there, whole, on its
   first frame. LEARNED FROM: the lerp tutorial above. */
function blendOrbState(a, b, amount) {
  if (!a) return b;
  if (!b) return a;
  return {
    x: lerp(a.x, b.x, amount),
    y: lerp(a.y, b.y, amount),
    size: lerp(a.size, b.size, amount),
    alpha: lerp(a.alpha, b.alpha, amount),
    orb: b.orb || a.orb
  };
}

/* --------------------------------------------------------------------------
   THE ALIGNMENT TARGET

   Only ever on screen while the corners are being dragged. Deliberately plain
   and deliberately bright: a white field so the beam is visible on the wall, a
   dark border just inside the edge so you can see whether the mapping is
   square to the surface, and crosshairs through the middle so you can tell a
   skewed quad from a straight one by eye.
   -------------------------------------------------------------------------- */

function drawCalibrationTarget() {
  blendMode(BLEND);
  background(255);
  noFill();

  const inset = Math.max(10, minDim * 0.022);

  /* a frame just inside the edge. If this looks like a trapezoid on the wall,
     the corners are not where you think they are. */
  stroke(20, 20, 26);
  strokeWeight(Math.max(2, minDim * 0.004));
  rect(inset, inset, width - inset * 2, height - inset * 2);

  /* crosshairs, so a skew shows up as the middle lines not meeting square */
  stroke(20, 20, 26, 90);
  strokeWeight(1.5);
  line(width / 2, inset, width / 2, height - inset);
  line(inset, height / 2, width - inset, height / 2);

  /* thirds, faint. Useful for judging where a figure will stand. */
  stroke(20, 20, 26, 38);
  for (let i = 1; i < 3; i++) {
    line(width * i / 3, inset, width * i / 3, height - inset);
    line(inset, height * i / 3, width - inset, height * i / 3);
  }

  noStroke();
  textAlign(CENTER, CENTER);

  /* the mode, small, above */
  fill(20, 20, 26, 130);
  textSize(minDim * 0.026);
  text('PROJECTION MAPPING', width / 2, height / 2 - minDim * 0.095);

  /* the piece's name in the middle, which is what you are actually aiming */
  fill(20, 20, 26);
  textSize(minDim * 0.082);
  text('The Boxed Reflection', width / 2, height / 2 - minDim * 0.015);

  fill(20, 20, 26, 145);
  textSize(minDim * 0.027);
  text('Drag the four corners to the edges of the wall',
       width / 2, height / 2 + minDim * 0.065);

  /* corner labels, so number 1 on the wall matches number 1 on the handle */
  fill(20, 20, 26, 120);
  textSize(minDim * 0.032);
  const pad = inset + minDim * 0.035;
  textAlign(LEFT,  TOP);    text('1', pad, pad);
  textAlign(RIGHT, TOP);    text('2', width - pad, pad);
  textAlign(RIGHT, BOTTOM); text('3', width - pad, height - pad);
  textAlign(LEFT,  BOTTOM); text('4', pad, height - pad);

  textAlign(CENTER, CENTER);
}

/* --------------------------------------------------------------------------
   SETUP
   -------------------------------------------------------------------------- */

/* CODE REVIEW: p5 calls setup() once when the page loads, then calls draw()
   about sixty times a second for as long as the page is open. */
function setup() {
  createCanvas(windowWidth, windowHeight);
  measure();
  buildBursts();
  buildOrbs();
  buildClusters();
  buildSprite();
  noStroke();
  textFont('Georgia');
  if (typeof audioSetup === 'function') audioSetup();
  if (typeof mappingSetup === 'function') mappingSetup();
}

function measure() {
  cx = width / 2;
  cy = height * 0.48;          // biased up, the beam spills onto the floor
  RX = width * 0.30;
  RY = height * 0.30;
  minDim = Math.min(width, height);
}

function windowResized() {
  /* window.innerWidth rather than p5's windowWidth, because this is also
     called from the fullscreen check in draw(), where p5 may not have heard
     about the new size yet. */
  resizeCanvas(window.innerWidth, window.innerHeight);
  measure();
  if (typeof mappingResized === 'function') mappingResized();
}

/* Going fullscreen (F, F11, or the green button) does not always end with a
   clean resize event, especially on a second display. This catches whatever
   the event missed, so the canvas and the corners always match the screen. */
function keepFullSize() {
  if (width !== window.innerWidth || height !== window.innerHeight) windowResized();
}
document.addEventListener('fullscreenchange', () => setTimeout(keepFullSize, 120));

/* --------------------------------------------------------------------------
   THE DRAW LOOP
   -------------------------------------------------------------------------- */

/* CODE REVIEW: every frame. If the corners are being set it paints the white
   target; otherwise it clears to near black and draws whichever state the
   piece is in (IDLE, ARMED, PLAYING or RESULT). This is a simple state
   machine: arm(), begin(), finish() and reset() are the only places the state
   changes. */
function draw() {
  GLINT = millis() / 1000;
  keepFullSize();

  /* While the corners are being set, the canvas goes solid white. That white
     shape IS the mapped area: it is the thing the matrix3d warp is applied
     to, so the projector throws a lit rectangle onto the wall and the edges
     of it are exactly where the edges of the film will be. On a near black
     canvas you cannot see where the mapping lands at all, which is the whole
     problem with aligning it in the dark. */
  if (typeof mappingIsCalibrating === 'function' && mappingIsCalibrating()) {
    drawCalibrationTarget();
    blendMode(BLEND);
    if (typeof mappingDraw === 'function') mappingDraw();
    return;
  }

  background(8, 8, 12);
  blendMode(ADD);               // overlapping light adds up, like real light

  if (state === 'IDLE')    drawIdle();
  if (state === 'ARMED')   drawArmed();
  if (state === 'PLAYING') drawPlaying();
  if (state === 'RESULT')  drawResult();

  blendMode(BLEND);
  if (typeof mappingDraw === 'function') mappingDraw();
}

/* ============================ THE RENDERER ============================

   WHAT DIDN'T WORK: p5's tint() rebuilds a tinted copy of the sprite every
   time the colour changes. With 4200 orbs at the time, each on its own shade,
   that was 4200 canvas rebuilds per frame, and it ran at 1fps. So the tinting happens ONCE per emotion
   colour instead: a small palette of pre-coloured sprites is baked the first
   time a colour is used, and each orb just picks the one it belongs to.
   Brightness then comes from globalAlpha, which is free.

   Compositing is split in two, which is what makes it look like the bokeh
   reference rather than a floodlight:
     small sparkles  ->  'lighter', they add up and glint
     big soft discs  ->  'source-over', they sit in front of each other like
                         real out of focus highlights instead of blowing out
   ====================================================================== */

const SHADE_STEPS = 6;
const HUE_STEPS   = 3;
const palettes    = {};              // keyed by "r,g,b", built once, kept

function shadeOf(rgb, s, hueNudge) {
  let r, g, b;
  if (s > 0.5) {                     // pale, lifted toward white
    const k = (s - 0.5) * 2 * 0.62;
    r = rgb[0] + (255 - rgb[0]) * k;
    g = rgb[1] + (255 - rgb[1]) * k;
    b = rgb[2] + (255 - rgb[2]) * k;
  } else {                           // deep, sunk toward the shadow
    const k = 1 - (0.5 - s) * 2 * 0.30;
    r = rgb[0] * k; g = rgb[1] * k; b = rgb[2] * k;
  }
  const h = hueNudge;                // small channel rotation, stays in colour
  return [r + (g - r) * h, g + (b - g) * h, b + (r - b) * h];
}

function canvasOf(pg) { return pg.canvas || pg.elt; }

function tintSprite(src, col) {
  const S = canvasOf(src).width;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.drawImage(canvasOf(src), 0, 0);
  x.globalCompositeOperation = 'source-in';   // keep the alpha, replace the colour
  x.fillStyle = 'rgb(' + (col[0]|0) + ',' + (col[1]|0) + ',' + (col[2]|0) + ')';
  x.fillRect(0, 0, S, S);
  return c;
}

function palette(rgb) {
  const key = rgb.join(',');
  if (palettes[key]) return palettes[key];
  const glow = [], bokeh = [];
  for (let h = 0; h < HUE_STEPS; h++) {
    for (let s = 0; s < SHADE_STEPS; s++) {
      const col = shadeOf(rgb, s / (SHADE_STEPS - 1), (h - 1) * 0.12);
      glow.push(tintSprite(spriteGlow, col));
      bokeh.push(tintSprite(spriteBokeh, col));
    }
  }
  palettes[key] = { glow, bokeh };
  return palettes[key];
}

/* Reused every frame. Allocating thousands of objects 60 times a second is how you
   hand the garbage collector a reason to stutter halfway through someone's
   film. */
const MAX_DISC = 118;

const FRAME = [];
let frameLen = 0;

let GLINT = 0;                       // set once per frame, not once per orb

function blit(ctx, pal, s) {
  const o = s.orb;
  const tw = 0.80 + 0.20 * (0.5 + 0.5 * Math.sin(GLINT * o.twRate + o.twPhase));
  let a = (s.alpha * tw * (o.bokeh ? 0.62 : 1)) / 255;
  if (a < 0.010) return;
  if (a > 1) a = 1;

  let d = s.size * (o.bokeh ? 2.3 : 3.2);
  if (d < 1.2) return;

  /* A handful of very large discs were costing more fill than the other four
     thousand orbs put together, so the drawn size is capped. Past this the
     disc is so soft you cannot tell it grew anyway. */
  if (d > MAX_DISC) d = MAX_DISC;

  const h = d / 2;
  const x = s.x - h, y = s.y - h;

  /* Anything entirely off the wall costs fill rate for nothing. Express
     throws most of the field past the edge, so this is not a micro
     optimisation, it is most of the frame. */
  if (x > width || y > height || x + d < 0 || y + d < 0) return;

  ctx.globalAlpha = a;
  ctx.drawImage(o.bokeh ? pal.bokeh[o.pi] : pal.glow[o.pi], x, y, d, d);
}

/* getState(orb) returns a state or null. Orbs are already sorted far to near
   at build time, so plain index order is depth order and costs nothing. */
/* CODE REVIEW: draws the whole field for one frame. First it asks every orb
   where it is, then draws the small sparkles with additive "lighter" blending
   so they glow, then the big soft bokeh discs with normal blending so they sit
   in front of each other like real out of focus lights. */
function renderField(rgb, getState, list = orbs) {
  const pal = palette(rgb);
  const ctx = drawingContext;

  frameLen = 0;
  for (let i = 0; i < list.length; i++) {
    const s = getState(list[i]);
    if (s) FRAME[frameLen++] = s;
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < frameLen; i++) if (!FRAME[i].orb.bokeh) blit(ctx, pal, FRAME[i]);

  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < frameLen; i++) if (FRAME[i].orb.bokeh) blit(ctx, pal, FRAME[i]);

  ctx.globalAlpha = 1;
}

/* Kept so anything still calling stamp() keeps working. */
function stamp(s, rgb) {
  if (!s || !s.orb) return;
  const ctx = drawingContext;
  ctx.globalCompositeOperation = s.orb.bokeh ? 'source-over' : 'lighter';
  blit(ctx, palette(rgb), s);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}


/* attract mode: a slow neutral drift so the room is never a dead black box */
function drawIdle() {
  const t = millis() / 1000;
  for (let i = 0; i < orbs.length * 0.12; i++) {
    const o = orbs[i];
    const wob = Math.sin(t * 0.4 + o.ha) * 0.08;
    stamp({
      x: cx + o.hx * RX * (0.55 + wob),
      y: cy + o.hy * RY * (0.55 + wob),
      size: o.baseR * o.z * 0.7,
      alpha: 22 * o.z
    }, [150, 140, 180]);
  }
}

/* armed: almost black, one slow pulse at the centre, so the attendant can see
   the room is loaded without the visitor learning anything */
function drawArmed() {
  const pulse = (Math.sin(millis() / 900) + 1) / 2;
  stamp({ x: cx, y: cy, size: 40 + pulse * 18, alpha: 26 + pulse * 22 },
        [200, 190, 220]);
}

/* CODE REVIEW: works out which answer is playing from the time since Start.
   seg = which five second segment, t = how far through it (0 to 1). The
   scenario gives the colour, the answer picks express, suppress or dismiss. */
function drawPlaying() {
  const elapsed = millis() - startAt;
  const seg = Math.floor(elapsed / SEGMENT_MS);

  /* nine segments, or ten when a tie breaker was asked */
  const scenes = filmScenes(answers);
  if (seg >= scenes.length) { finish(); return; }

  const t = (elapsed % SEGMENT_MS) / SEGMENT_MS;
  const scenario = scenes[seg];
  const rgb = scenario.rgb.split(',').map(n => parseInt(n, 10));

  /* The residue dismiss leaves behind. Painted UNDER the orbs in normal blend
     mode, so once the light has gone the wall holds a very dark version of
     the emotion colour rather than going to black. It clears itself before
     the next scenario starts. */
  {
    const r = washFor(answers[seg], t);
    if (r > 0) {
      blendMode(BLEND);
      noStroke();
      fill(rgb[0] * 0.11, rgb[1] * 0.11, rgb[2] * 0.11, 255 * r);
      rect(0, 0, width, height);
      blendMode(ADD);
    }
  }

  const now = BEHAVIOUR[answers[seg]];
  const was = seg > 0 ? BEHAVIOUR[answers[seg - 1]] : null;

  /* dismiss is deliberately not morphed in. Everything else eases out of the
     previous segment over half a second, but dismiss has to arrive whole. */
  const morph = (t < 0.10 && was && answers[seg] !== 'dismiss')
    ? easeInOutCubic(t / 0.10) : -1;

  renderField(rgb, (o) => {
    const s = now(o, t);
    if (morph < 0) return s;
    return blendOrbState(was(o, 1.0), s, morph);
  }, orbsFor(answers[seg]));

  if (typeof audioSegment === 'function') audioSegment(seg, t, scenario, answers[seg]);
}

/* ============================ THE TALLY ============================

   Two beats on the wall: first their counts, then the verdict. Separately,
   their answers are added to a running total across every visit. The running
   total lives in localStorage on this machine, so it survives a reload and
   builds through the day without needing a server or any network at all.
   It is not shown on the wall. Do not clear it: it is the piece's collected
   data.
   ==================================================================== */

const TALLY_KEY = 'boxed-reflection-tally';

function loadTally() {
  try {
    const raw = localStorage.getItem(TALLY_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (t && typeof t.express === 'number') return t;
    }
  } catch (e) { /* private window, cleared data, blocked storage */ }
  return { express: 0, suppress: 0, dismiss: 0, visits: 0 };
}

function addToTally(list) {
  const t = loadTally();
  list.forEach(a => { if (t[a] !== undefined) t[a]++; });
  t.visits++;
  try { localStorage.setItem(TALLY_KEY, JSON.stringify(t)); } catch (e) {}
  return t;
}

const WORDS_LOCAL = ['zero','one','two','three','four','five','six','seven',
                     'eight','nine','ten','eleven','twelve'];
function inWordsLocal(n) { return WORDS_LOCAL[n] || String(n); }

const ROWS = [['express',  'Express your emotions',  [255, 233, 196]],
              ['suppress', 'Suppress your emotions', [116, 150, 190]],
              ['dismiss',  'Dismiss your emotions',  [150,  90,  90]]];

/* How long each results screen stays on the wall. Both were too quick to
   read and then go and place a sticker, so they are roughly doubled. Change
   these two numbers to taste: they are in milliseconds. */
const BEAT_ONE_MS = 10000;   // "Results are in", their counts
const BEAT_TWO_MS = 15000;   // "You are more...", and the sticker

let resultAt = 0;
let sessionTally = null;     // the running total, captured when the film ends

/* Three rows of "Express your emotions  3  times", laid out so the numbers
   form a column down the middle.

   Each row is three pieces of text at two different sizes, which centring as
   one string cannot do. So the widest label is measured first, the block is
   centred from that, and every row hangs off the same three anchors: label
   right aligned, number centred, word left aligned. Rows stay tidy no matter
   how long the labels get. */
function drawResultRows(counts, fade, yTop, rowGap, numSize, labSize) {
  const gap = minDim * 0.026;

  textStyle(NORMAL);
  textSize(labSize);
  let labelW = 0;
  ROWS.forEach(([, label]) => { labelW = Math.max(labelW, textWidth(label)); });
  const timesW = textWidth('times');

  textStyle(BOLD);
  textSize(numSize);
  const numW = textWidth('0');

  const total  = labelW + gap + numW + gap + timesW;
  const startX = cx - total / 2;
  const labelRight = startX + labelW;
  const numMid     = labelRight + gap + numW / 2;
  const timesLeft  = numMid + numW / 2 + gap;

  ROWS.forEach(([key, label, rgb], i) => {
    const appear = constrain((fade - i * 420) / 620, 0, 1);
    if (appear <= 0) return;
    const y    = yTop + i * rowGap;
    const rise = (1 - appear) * minDim * 0.018;

    textStyle(NORMAL);
    textSize(labSize);
    fill(212, 212, 226, 205 * appear);
    textAlign(RIGHT, CENTER);
    text(label, labelRight, y + rise);

    /* the number is the loud thing in the sentence */
    textStyle(BOLD);
    textSize(numSize);
    fill(rgb[0], rgb[1], rgb[2], 245 * appear);
    textAlign(CENTER, CENTER);
    text(counts[key], numMid, y + rise);

    textStyle(NORMAL);
    textSize(labSize);
    fill(212, 212, 226, 205 * appear);
    textAlign(LEFT, CENTER);
    text('times', timesLeft, y + rise);
  });

  textStyle(NORMAL);
}

/* The verdict words. Expressive and suppressive keep their original colours,
   dismissive takes the colour of its row on the count screen, lifted a little
   so it holds up at headline size. */
const VERDICT = {
  express:  ['EXPRESSIVE',  [255, 219, 168]],
  suppress: ['SUPPRESSIVE', [140, 168, 205]],
  dismiss:  ['DISMISSIVE',  [206, 132, 132]]
};

/* Draws one or more verdict words on a single centred line, each in its own
   colour, joined by "&" or ", ". Shrinks to fit if three words would run off
   the wall. */
function drawVerdictWords(keys, y, size, alpha) {
  const parts = [];
  keys.forEach((k, i) => {
    if (i > 0) parts.push([i === keys.length - 1 ? '  &  ' : ',  ', [190, 190, 205]]);
    parts.push([VERDICT[k][0], VERDICT[k][1]]);
  });

  textSize(size);
  let total = parts.reduce((w, [str]) => w + textWidth(str), 0);
  if (total > width * 0.88) {
    size *= (width * 0.88) / total;
    textSize(size);
    total = parts.reduce((w, [str]) => w + textWidth(str), 0);
  }

  textAlign(LEFT, CENTER);
  let x = cx - total / 2;
  parts.forEach(([str, rgb]) => {
    fill(rgb[0], rgb[1], rgb[2], alpha);
    text(str, x, y);
    x += textWidth(str);
  });
  textAlign(CENTER, CENTER);
}

/* CODE REVIEW: the results. For BEAT_ONE_MS it shows the counts, then for
   BEAT_TWO_MS the verdict, then resets for the next visitor. */
function drawResult() {
  const counts = countAnswers(answers);

  const since = millis() - resultAt;
  blendMode(BLEND);

  if (since < BEAT_ONE_MS) {
    /* beat one: the count */
    const out = since > BEAT_ONE_MS - 700
      ? 1 - (since - (BEAT_ONE_MS - 700)) / 700 : 1;

    push();
    drawingContext.globalAlpha = Math.max(0, out);
    textAlign(CENTER, CENTER);

    const h1 = constrain(since / 650, 0, 1);
    textStyle(BOLD);
    fill(238, 238, 248, 250 * h1);
    textSize(minDim * 0.105);
    text('Results are in', cx, cy - minDim * 0.190);

    const h2 = constrain((since - 380) / 650, 0, 1);
    textStyle(NORMAL);
    fill(172, 172, 192, 190 * h2);
    textSize(minDim * 0.036);
    text('According to your responses you would:', cx, cy - minDim * 0.100);

    drawResultRows(counts, since - 700, cy + minDim * 0.020,
                   minDim * 0.105, minDim * 0.100, minDim * 0.040);
    pop();
    return;
  }

  /* beat two: the verdict.

     Same look as the original, but dismiss is now its own answer rather than
     being counted with suppress, so it is one of three: expressive,
     suppressive or dismissive, whichever they chose most. The tie breaker on
     the laptop means this is always one word. If it somehow still comes out
     level (the tie breaker switched off, say), it names every one that tied
     and asks for a sticker on each. */
  const since2 = since - BEAT_ONE_MS;
  if (since2 < BEAT_TWO_MS) {
    const lead = leadersOf(answers);
    const single = lead.length === 1;
    const out = since2 > BEAT_TWO_MS - 800
      ? 1 - (since2 - (BEAT_TWO_MS - 800)) / 800 : 1;

    push();
    drawingContext.globalAlpha = Math.max(0, out);
    textAlign(CENTER, CENTER);
    textStyle(NORMAL);

    const a1 = constrain(since2 / 700, 0, 1);
    fill(150, 150, 170, 150 * a1);
    textSize(minDim * 0.026);
    text('BASED ON YOUR ANSWERS', cx, cy - minDim * 0.175);

    const a2 = constrain((since2 - 500) / 800, 0, 1);
    if (single) {
      const [word, tint] = VERDICT[lead[0]];
      fill(tint[0], tint[1], tint[2], 240 * a2);
      textSize(minDim * 0.088);
      text('You are more', cx, cy - minDim * 0.055);
      textSize(minDim * 0.105);
      text(word, cx, cy + minDim * 0.055);
    } else {
      fill(222, 222, 236, 230 * a2);
      textSize(minDim * 0.088);
      text('You are equally', cx, cy - minDim * 0.055);
      drawVerdictWords(lead, cy + minDim * 0.055, minDim * 0.105, 240 * a2);
    }

    const a3 = constrain((since2 - 2000) / 900, 0, 1);
    if (a3 > 0) {
      fill(205, 205, 220, 175 * a3);
      textSize(minDim * 0.032);
      text(single ? 'Place the sticker on the corresponding side'
                  : 'Place a sticker on each of these sides',
           cx, cy + minDim * 0.185);
    }
    pop();
    return;
  }

  reset();
}

/* --------------------------------------------------------------------------
   STATE CHANGES
   -------------------------------------------------------------------------- */

/* CODE REVIEW: the state changes. arm() stores the answers and waits,
   begin() starts the film, finish() moves to the results and saves the tally,
   reset() goes back to IDLE and tells the laptop it can start again. */
function arm(list) {
  answers = list;
  state = 'ARMED';
  if (typeof mappingForceOff === 'function') mappingForceOff();
  announce();
}

function begin() {
  if (state !== 'ARMED') return;
  startAt = millis();
  state = 'PLAYING';
  // never let a calibration grid end up on top of somebody's film
  if (typeof mappingForceOff === 'function') mappingForceOff();
  if (typeof audioStart === 'function') audioStart();
  announce();
}

function finish() {
  state = 'RESULT';
  resultAt = millis();
  sessionTally = addToTally(answers);   // counted once, when the film ends (tie breaker included)
  if (typeof audioStop === 'function') audioStop();
  announce();
}

function reset() {
  state = 'IDLE';
  answers = [];
  if (typeof audioStop === 'function') audioStop();
  channel.postMessage({ type: 'finished' });
  announce();
}

function announce() {
  channel.postMessage({ type: 'state', state });
}

/* --------------------------------------------------------------------------
   TALKING TO THE CONTROL PAGE
   -------------------------------------------------------------------------- */

channel.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'session') arm(m.answers);
  if (m.type === 'start')   begin();
  if (m.type === 'abort')   { state = 'IDLE'; answers = []; if (typeof audioStop === 'function') audioStop(); }
  if (m.type === 'ping')    { announce(); if (typeof reportMapping === 'function') reportMapping(); }
  if (m.type === 'calibrate' && typeof mappingToggleCalibrate === 'function') mappingToggleCalibrate();
  if (m.type === 'lockToggle' && typeof mappingToggleLock === 'function') mappingToggleLock();
};

/* heartbeat, so the control page knows this window is open and can enable its
   Start button. Without this the attendant can press start into nothing. */
/* The mapping state rides along too, so the corner grid and lock buttons on
   the laptop are right even when this window was opened after it. */
setInterval(() => {
  channel.postMessage({ type: 'hello', state });
  if (typeof reportMapping === 'function') reportMapping();
}, 2000);

/* --------------------------------------------------------------------------
   KEYBOARD
   -------------------------------------------------------------------------- */

function keyPressed() {
  if (key === 'f' || key === 'F') {
    const fs = fullscreen();
    fullscreen(!fs);
  }
  if (typeof mappingKey === 'function') mappingKey(key);
  if (typeof audioKey === 'function') audioKey(key);
}
