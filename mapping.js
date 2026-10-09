/* ==========================================================================
   VERSION B · PROJECTION MAPPING SETUP
   DXB311 Interaction Design Capstone · Amritha Anil · n11539151

   THE PROBLEM
   A projector is almost never perfectly square to the wall. The image comes
   out as a trapezoid, and the edges of the light spill onto things that are
   not the wall.

   THE APPROACH
   Four draggable corners. Drag them to the real corners of the wall, and the
   whole canvas is warped to fit. The warp is applied to the CANVAS ELEMENT as
   a CSS transform, not inside the drawing code, which means no behaviour,
   colour or orb code is aware that calibration exists at all. p5 keeps drawing
   into a plain rectangle and the browser bends the finished image.

   THE LOCK
   Once it is aligned it gets locked, and the corners stop responding. This
   matters because the alignment is set before the audience arrives, and a
   stray click during the exhibition would ruin the rest of the night. Locking
   is deliberate and unlocking is deliberate.

     C          enter or leave calibration   (ignored while locked)
     L          lock or unlock
     R          reset the corners to the screen edges
     drag       move a corner
     arrows     nudge the selected corner one pixel

   Corner positions and the lock state are saved in localStorage, so a reload,
   a crash or a laptop restart does not lose the alignment.

   WHY THE CORNERS ARE STORED AS FRACTIONS
   They used to be saved in pixels for one exact window size. Going fullscreen
   on the projector changes the size (and passes through in between sizes on
   the way), so the saved corners stopped matching, the canvas got squeezed
   into the old window size, and C showed the grid in the wrong place or not
   at all. Corners are now kept as fractions of the screen (0 to 1), so they
   follow the window into and out of fullscreen and always land on the same
   spot of the wall.

   DO THE HARDWARE FIRST
   Most projectors have keystone correction in their own menu. Square the
   image there first. A software warp correcting a badly keystoned projector
   throws away resolution, so this should only ever be doing fine adjustment.
   ========================================================================== */

const STORE_KEY = 'boxed-reflection-mapping';

let corners = null;       // [{x,y} x4] in screen pixels: TL, TR, BR, BL
let norm = null;          // the same four corners as fractions of the screen
let calibrating = false;
let mapLocked = false;
let dragIndex = -1;
let selected = 0;

function mappingSetup() {
  const saved = loadMapping();
  if (saved) {
    norm = saved.norm;
    mapLocked = saved.locked;
    cornersFromNorm();
  } else {
    resetCorners();
  }
  applyWarp();
  attachHandleDragging();
}

function cornersFromNorm() {
  corners = norm.map(p => ({ x: p.x * width, y: p.y * height }));
}

function normFromCorners() {
  if (!corners || !width || !height) return;
  norm = corners.map(c => ({ x: c.x / width, y: c.y / height }));
}

function resetCorners() {
  corners = [
    { x: 0,     y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0,     y: height }
  ];
  normFromCorners();
}

/* Window went fullscreen, came out of it, or moved to the projector. The
   corners are rebuilt from the fractions at the new size, so the alignment
   and the lock both survive. */
function mappingResized() {
  if (norm) cornersFromNorm(); else resetCorners();
  applyWarp();
  reportMapping();
}

function loadMapping() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Array.isArray(d.norm) && d.norm.length === 4) {
      return { norm: d.norm, locked: !!d.locked };
    }
    // an older save, in pixels for one window size: convert it to fractions
    if (Array.isArray(d.corners) && d.corners.length === 4 && d.w && d.h) {
      return { norm: d.corners.map(c => ({ x: c.x / d.w, y: c.y / d.h })),
               locked: !!d.locked };
    }
    return null;
  } catch (e) { return null; }
}

function saveMapping() {
  normFromCorners();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ norm, locked: mapLocked }));
  } catch (e) { console.warn('could not save the mapping:', e); }
}

/* --------------------------------------------------------------------------
   THE MATHS

   A homography maps the four corners of a square onto any four points. For
   the unit square there is a closed form, so no matrix solver is needed.
   Source: Heckbert, Fundamentals of Texture Mapping and Image Warping, 1989.
   The same formulas are all over the place under "unit square to quad".

   The result goes into a CSS matrix3d. CSS applies transforms right to left,
   so the canvas is first squashed to a 1 by 1 square, then the homography
   maps that unit square onto the four corners in real pixels.
   -------------------------------------------------------------------------- */

function unitSquareToQuad(p) {
  const [p0, p1, p2, p3] = p;

  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  let a, b, c, d, e, f, g, h;

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // the four points still form a parallelogram, so no perspective needed
    a = p1.x - p0.x;  b = p2.x - p1.x;  c = p0.x;
    d = p1.y - p0.y;  e = p2.y - p1.y;  f = p0.y;
    g = 0;            h = 0;
  } else {
    const dx1 = p1.x - p2.x, dy1 = p1.y - p2.y;
    const dx2 = p3.x - p2.x, dy2 = p3.y - p2.y;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-9) return null;      // corners collapsed onto a line

    g = (sx * dy2 - dx2 * sy) / den;
    h = (dx1 * sy - sx * dy1) / den;

    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }
  return { a, b, c, d, e, f, g, h };
}

function applyWarp() {
  const cvs = document.querySelector('canvas');
  if (!cvs || !corners) return;

  const m = unitSquareToQuad(corners);
  if (!m) return;

  // keep the fractions in step with every move, saved or not
  normFromCorners();

  cvs.style.transformOrigin = '0 0';
  cvs.style.transform =
    `matrix3d(${m.a}, ${m.d}, 0, ${m.g},` +
    ` ${m.b}, ${m.e}, 0, ${m.h},` +
    ` 0, 0, 1, 0,` +
    ` ${m.c}, ${m.f}, 0, 1)` +
    ` scale(${1 / width}, ${1 / height})`;
}

/* --------------------------------------------------------------------------
   THE CALIBRATION OVERLAY
   Drawn as plain DOM on top of the canvas, so it is never itself warped.
   -------------------------------------------------------------------------- */

function mappingDraw() {
  const ui = document.getElementById('calib');
  if (!ui) return;

  /* SAFETY RULE, learned the hard way.
     If the attendant leaves calibration on and a visitor starts their film,
     the wall gets a gold grid and four numbered circles over the top of it and
     the whole thing looks broken. So the overlay is not allowed to exist in
     any state except IDLE and ARMED, no matter what was left switched on. */
  if (typeof state !== 'undefined' && state !== 'IDLE' && state !== 'ARMED') {
    calibrating = false;
    ui.hidden = true;
    return;
  }

  ui.hidden = !calibrating;
  if (!calibrating) return;

  /* A corner sitting exactly on the screen edge puts half its handle off
     screen, where it cannot be grabbed. The handle is nudged back into view
     while the corner itself stays where it really is, so the dashed outline
     still shows the true shape. */
  const PAD = 26;
  const handles = ui.querySelectorAll('.handle');
  corners.forEach((c, i) => {
    const el = handles[i];
    el.style.left = Math.min(Math.max(c.x, PAD), width  - PAD) + 'px';
    el.style.top  = Math.min(Math.max(c.y, PAD), height - PAD) + 'px';
    el.classList.toggle('is-selected', i === selected);
  });

  const poly = ui.querySelector('polygon');
  poly.setAttribute('points', corners.map(c => c.x + ',' + c.y).join(' '));

  ui.querySelector('#calib-lock').textContent = mapLocked ? 'LOCKED' : 'UNLOCKED';
  ui.querySelector('#calib-lock').className = mapLocked ? 'locked' : 'unlocked';
}

/* The attendant is usually looking at the CONTROL window, not this one, so
   keyboard shortcuts here are not enough on their own. These two let the
   control page drive calibration over the same BroadcastChannel the answers
   use. The master spec reserved a `calibrate` message for exactly this. */
function mappingToggleCalibrate() { mappingKey('c'); reportMapping(); }

/* Called by show.js when a session arms or the film begins. */
/* show.js asks this every frame so it knows whether to paint the white
   alignment target instead of the film. */
function mappingIsCalibrating() {
  return calibrating && !mapLocked;
}

function mappingForceOff() {
  if (calibrating) {
    calibrating = false;
    saveMapping();
    reportMapping();
  }
  const ui = document.getElementById('calib');
  if (ui) ui.hidden = true;
}
function mappingToggleLock()      { mappingKey('l'); reportMapping(); }

function reportMapping() {
  channel.postMessage({ type: 'mapping', calibrating, locked: mapLocked });
}

function mappingKey(k) {
  const key = String(k).toLowerCase();

  if (key === 'l') {
    mapLocked = !mapLocked;
    if (mapLocked) calibrating = false;
    saveMapping();
    flash(mapLocked ? 'Mapping locked' : 'Mapping unlocked');
    reportMapping();
    return;
  }

  if (key === 'c') {
    if (mapLocked) { flash('Locked. Press L to unlock first.'); return; }
    calibrating = !calibrating;
    if (!calibrating) saveMapping();
    reportMapping();
    return;
  }

  if (key === 'r' && calibrating && !mapLocked) {
    resetCorners();
    applyWarp();
    flash('Corners reset');
  }
}

/* one pixel nudges, because dragging cannot hit a single pixel reliably */
function keyReleased() { return true; }

document.addEventListener('keydown', (e) => {
  if (!calibrating || mapLocked) return;
  const step = e.shiftKey ? 10 : 1;
  const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (map[e.key]) {
    e.preventDefault();
    corners[selected].x += map[e.key][0];
    corners[selected].y += map[e.key][1];
    applyWarp();
    saveMapping();
  }
  if (e.key >= '1' && e.key <= '4') selected = parseInt(e.key, 10) - 1;
});

/* --------------------------------------------------------------------------
   DRAGGING

   This used to go through p5's mousePressed / mouseDragged. That was a bug:
   the handles are DOM elements with pointer-events turned on, so a click
   landing exactly on a handle was swallowed by the handle and p5's canvas
   never saw it. Grabbing a corner did nothing, and only clicking slightly
   beside it worked, which felt broken and was.

   Native pointer events on the handles themselves fix it properly.
   setPointerCapture means once a drag starts the handle keeps receiving moves
   even if the cursor runs off it or off the window, so a corner never gets
   dropped halfway. preventDefault on pointerdown stops the browser starting a
   text selection, which was the other half of the problem.
   -------------------------------------------------------------------------- */

function attachHandleDragging() {
  const ui = document.getElementById('calib');
  if (!ui) return;

  ui.querySelectorAll('.handle').forEach((el, i) => {

    el.addEventListener('pointerdown', (e) => {
      if (mapLocked) return;
      e.preventDefault();             // no text selection, no image dragging
      e.stopPropagation();
      dragIndex = i;
      selected = i;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });

    el.addEventListener('pointermove', (e) => {
      if (dragIndex !== i || mapLocked) return;
      e.preventDefault();
      corners[i].x = e.clientX;
      corners[i].y = e.clientY;
      applyWarp();
    });

    const end = (e) => {
      if (dragIndex !== i) return;
      dragIndex = -1;
      el.style.cursor = 'grab';
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      saveMapping();
    };

    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}

/* Clicking anywhere else on the screen while calibrating selects and moves the
   nearest corner, so there is a way to grab one even if a handle ends up under
   the instruction panel. */
/* winMouseX rather than mouseX: mouseX is measured against the canvas, and
   once the canvas is warped its box no longer lines up with the screen, so a
   click put the corner in the wrong place. */
function mousePressed() {
  if (!calibrating || mapLocked || dragIndex >= 0) return;

  let best = -1, bestDist = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = dist(winMouseX, winMouseY, corners[i].x, corners[i].y);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  if (best >= 0 && bestDist < 160) {
    selected = best;
    corners[best].x = winMouseX;
    corners[best].y = winMouseY;
    applyWarp();
    saveMapping();
  }
}

/* --------------------------------------------------------------------------
   A SHORT MESSAGE IN THE CORNER
   -------------------------------------------------------------------------- */

let flashText = '';
let flashUntil = 0;

function flash(msg) {
  flashText = msg;
  flashUntil = Date.now() + 2200;
  const el = document.getElementById('flash');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  setTimeout(() => {
    if (Date.now() >= flashUntil) el.classList.remove('is-on');
  }, 2300);
}
