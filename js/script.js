document.getElementById('year').textContent = new Date().getFullYear();

// Highlight the active sidebar nav link based on which section is in view.
const sections = document.querySelectorAll('main section[id]');
const navLinks = document.querySelectorAll('.side-nav a');

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`);
    });
  });
}, { rootMargin: '-40% 0px -50% 0px' });

sections.forEach((section) => observer.observe(section));

// Marathon-inspired ambient pixel-grid bursts.
// Only spawns inside verified text-free zones computed from real layout
// geometry (never guessed), so it can never render behind readable text.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const MIN_ONSCREEN = 7; // biased floor — spawn chance jumps way up below this
  const MAX_CONCURRENT = 17;
  const CHECK_INTERVAL_MS = 900;
  const CELL = 12;
  const CELL_GAP = 3;
  const STEP = CELL + CELL_GAP;
  const JITTER = 5; // px — per-cell random offset so positions never sit on a perfect lattice
  const GRID_SIZE = 6;
  const GLOW_RANGE = 3; // cells within this Chebyshev distance of a lit cell get a soft falloff glow
  const BREATHING_ROOM = 30; // px minimum gap enforced between any two pattern bounding boxes
  const STACK_BREAKPOINT = 880; // matches the CSS breakpoint where the sidebar stacks

  let active = 0;
  let activeRects = []; // bounding boxes of currently-live patterns, for collision checks

  function pick(options) {
    return options[Math.floor(Math.random() * options.length)];
  }

  function rectsCollide(a, b, pad) {
    return !(
      a.x + a.w + pad < b.x ||
      b.x + b.w + pad < a.x ||
      a.y + a.h + pad < b.y ||
      b.y + b.h + pad < a.y
    );
  }

  function safeZones(patternSize) {
    // Below the stack breakpoint the sidebar stacks full-width above main,
    // so there is no reliable text-free column left to use — skip entirely.
    if (window.innerWidth <= STACK_BREAKPOINT) return [];

    const sidebar = document.querySelector('.sidebar');
    const layout = document.querySelector('.layout');
    if (!sidebar || !layout) return [];

    const sRect = sidebar.getBoundingClientRect();
    const lRect = layout.getBoundingClientRect();
    const margin = 24;
    const zones = [];

    // Zone 1: the column below the sidebar box. The sidebar's column never
    // holds any other content, so this stays text-free at any scroll position.
    const belowHeight = window.innerHeight - sRect.bottom - margin;
    if (belowHeight > patternSize) {
      zones.push({ x: sRect.left, y: sRect.bottom + margin, w: sRect.width, h: belowHeight });
    }

    // Zone 2: outer right gutter, only present when the viewport is wider
    // than the centered .layout max-width.
    const rightGutterW = window.innerWidth - lRect.right - margin;
    if (rightGutterW > patternSize) {
      zones.push({ x: lRect.right + margin, y: 0, w: rightGutterW, h: window.innerHeight });
    }

    // Zone 3: outer left gutter (mirrors zone 2 since .layout is centered).
    const leftGutterW = lRect.left - margin;
    if (leftGutterW > patternSize) {
      zones.push({ x: margin, y: 0, w: leftGutterW, h: window.innerHeight });
    }

    return zones.filter((z) => z.w >= patternSize && z.h >= patternSize);
  }

  // Renders a soft distance-based glow instead of a binary on/off grid: lit
  // cells are fully bright, cells within glowRange fade smoothly with
  // distance, anything further is fully invisible. This is what keeps the
  // pattern reading as an organic cluster rather than a visible square.
  // Some grid positions have no cell at all (see buildExistenceMask) — the
  // simulation underneath still runs on the full square lattice, they just
  // have nothing to paint, which is what breaks up the square silhouette.
  function renderGlow(cells, aliveSet, gridSize, glowRange) {
    const aliveCoords = Array.from(aliveSet, (key) => key.split(',').map(Number));
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = cells[r][c];
        if (!cell) continue;
        let dist = Infinity;
        for (let i = 0; i < aliveCoords.length; i++) {
          const [ar, ac] = aliveCoords[i];
          const d = Math.max(Math.abs(r - ar), Math.abs(c - ac));
          if (d < dist) dist = d;
        }
        if (dist === 0) {
          cell.classList.add('pixel-on');
          cell.style.opacity = '1';
        } else if (dist <= glowRange) {
          cell.classList.remove('pixel-on');
          cell.style.opacity = String(((glowRange + 1 - dist) / (glowRange + 1)) * 0.7);
        } else {
          cell.classList.remove('pixel-on');
          cell.style.opacity = '0';
        }
      }
    }
  }

  // Carves an organic blob out of the square lattice instead of filling
  // every cell — a randomized center/radius plus per-cell edge noise rounds
  // off the corners (and roughs up the edges) so no two instances share the
  // same silhouette and the pattern never reads as "a square on a grid".
  function buildExistenceMask(gridSize) {
    const center = (gridSize - 1) / 2;
    const cx = center + (Math.random() - 0.5) * 1.2;
    const cy = center + (Math.random() - 0.5) * 1.2;
    const radius = center * (0.82 + Math.random() * 0.3);
    const mask = [];
    for (let r = 0; r < gridSize; r++) {
      const row = [];
      for (let c = 0; c < gridSize; c++) {
        const dist = Math.hypot(r - cy, c - cx);
        const edgeNoise = (Math.random() - 0.5) * 1.1;
        row.push(dist + edgeNoise <= radius);
      }
      mask.push(row);
    }
    return mask;
  }

  function fizzleOut(grid, rect) {
    const fadeDuration = 1800;
    grid.classList.add('fizzle-out');
    setTimeout(() => {
      grid.remove();
      active--;
      const idx = activeRects.indexOf(rect);
      if (idx !== -1) activeRects.splice(idx, 1);
    }, fadeDuration + 100);
  }

  // Behavior 1: a single lit cell chases around the outer ring.
  function runScan(cells, grid, rect, gridSize) {
    const perimeter = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1) {
          perimeter.push([row, col]);
        }
      }
    }
    let i = 0;
    const STEPS = perimeter.length * 2;
    const iv = setInterval(() => {
      const [r, c] = perimeter[i % perimeter.length];
      renderGlow(cells, new Set([`${r},${c}`]), gridSize, GLOW_RANGE);
      i++;
      if (i >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 140);
  }

  // Behavior 2: real Conway's Game of Life, seeded randomly, bounded edges.
  function runLife(cells, grid, rect, gridSize) {
    let state = [];
    for (let r = 0; r < gridSize; r++) {
      const row = [];
      for (let c = 0; c < gridSize; c++) row.push(Math.random() < 0.35);
      state.push(row);
    }
    function toAliveSet() {
      const s = new Set();
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) if (state[r][c]) s.add(`${r},${c}`);
      }
      return s;
    }
    function countNeighbors(r, c) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < gridSize && cc >= 0 && cc < gridSize && state[rr][cc]) n++;
        }
      }
      return n;
    }
    renderGlow(cells, toAliveSet(), gridSize, GLOW_RANGE);
    const GENERATIONS = 6;
    let gen = 0;
    const iv = setInterval(() => {
      const next = state.map((row) => row.slice());
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const n = countNeighbors(r, c);
          next[r][c] = state[r][c] ? (n === 2 || n === 3) : n === 3;
        }
      }
      state = next;
      renderGlow(cells, toAliveSet(), gridSize, GLOW_RANGE);
      gen++;
      if (gen >= GENERATIONS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 380);
  }

  // Behavior 3: chaotic random spread — a few seed cells grow outward in
  // random directions, with a chance to randomly flicker off ("struggling").
  function runStruggle(cells, grid, rect, gridSize) {
    const alive = new Set();
    const seedCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < seedCount; i++) {
      const r = Math.floor(Math.random() * gridSize);
      const c = Math.floor(Math.random() * gridSize);
      alive.add(`${r},${c}`);
    }
    renderGlow(cells, alive, gridSize, GLOW_RANGE);
    const STEPS = 10;
    let step = 0;
    const iv = setInterval(() => {
      Array.from(alive).forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        if (Math.random() < 0.6) {
          const rr = r + Math.floor(Math.random() * 3) - 1;
          const cc = c + Math.floor(Math.random() * 3) - 1;
          if (rr >= 0 && rr < gridSize && cc >= 0 && cc < gridSize) alive.add(`${rr},${cc}`);
        }
        if (Math.random() < 0.25 && alive.size > 1) alive.delete(key);
      });
      renderGlow(cells, alive, gridSize, GLOW_RANGE);
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 220);
  }

  // Behavior 4: a ring pulses outward from a random origin, like a radar
  // ping, until it clears the edge of the grid.
  function runPulse(cells, grid, rect, gridSize) {
    const originR = 1 + Math.floor(Math.random() * (gridSize - 2));
    const originC = 1 + Math.floor(Math.random() * (gridSize - 2));
    let radius = 0;
    const iv = setInterval(() => {
      const ring = new Set();
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (Math.max(Math.abs(r - originR), Math.abs(c - originC)) === radius) ring.add(`${r},${c}`);
        }
      }
      renderGlow(cells, ring, gridSize, GLOW_RANGE);
      radius++;
      if (radius > gridSize) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 220);
  }

  // Behavior 5: independent cells twinkle on and off at random, unrelated
  // to one another — no spread, no adjacency, just chaotic sparkle.
  function runSparkle(cells, grid, rect, gridSize) {
    const STEPS = 14;
    let step = 0;
    const iv = setInterval(() => {
      const lit = new Set();
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (Math.random() < 0.18) lit.add(`${r},${c}`);
        }
      }
      renderGlow(cells, lit, gridSize, GLOW_RANGE);
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 220);
  }

  // Behavior 6: a couple of satellites orbit the grid's center on a smooth
  // circular path (trig-driven), unlike the square-perimeter chase of runScan.
  function runOrbit(cells, grid, rect, gridSize) {
    const center = (gridSize - 1) / 2;
    const radius = center * (0.6 + Math.random() * 0.35);
    const satellites = Math.random() < 0.5 ? 1 : 2;
    const orbits = 1 + Math.floor(Math.random() * 2);
    const DEGREES_PER_STEP = 12;
    const STEPS = Math.floor((360 * orbits) / DEGREES_PER_STEP);
    let step = 0;
    const iv = setInterval(() => {
      const lit = new Set();
      for (let s = 0; s < satellites; s++) {
        const angle = (step * DEGREES_PER_STEP + s * (360 / satellites)) * (Math.PI / 180);
        const r = Math.round(center + Math.sin(angle) * radius);
        const c = Math.round(center + Math.cos(angle) * radius);
        if (r >= 0 && r < gridSize && c >= 0 && c < gridSize) lit.add(`${r},${c}`);
      }
      renderGlow(cells, lit, gridSize, GLOW_RANGE);
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, 220);
  }

  // Weighted so Conway's Game of Life shows up more often than the other
  // five behaviors, without ever fully excluding them.
  const BEHAVIOR_WEIGHTS = [
    { fn: runScan, weight: 1 },
    { fn: runLife, weight: 3 },
    { fn: runStruggle, weight: 1 },
    { fn: runPulse, weight: 1 },
    { fn: runSparkle, weight: 1 },
    { fn: runOrbit, weight: 1 },
  ];
  const BEHAVIOR_WEIGHT_TOTAL = BEHAVIOR_WEIGHTS.reduce((sum, b) => sum + b.weight, 0);

  function pickBehavior() {
    let roll = Math.random() * BEHAVIOR_WEIGHT_TOTAL;
    for (const b of BEHAVIOR_WEIGHTS) {
      if (roll < b.weight) return b.fn;
      roll -= b.weight;
    }
    return BEHAVIOR_WEIGHTS[0].fn;
  }

  function centerDistance(a, b) {
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    return Math.hypot(acx - bcx, acy - bcy);
  }

  // Gathers every non-colliding candidate spot across the safe zones (biased
  // toward whichever side of the viewport currently has fewer active
  // patterns, once that gap grows past 1), then picks whichever candidate is
  // farthest from its single nearest neighbor. Plain "first open spot found"
  // let instances land right next to each other whenever an early random
  // attempt happened to clear the collision check, even with plenty of open
  // space elsewhere — this makes spreading out the default instead of an
  // accident.
  function findPlacement(zones, patternSize) {
    const mid = window.innerWidth / 2;
    const sideOf = (z) => (z.x + z.w / 2 < mid ? 'left' : 'right');
    const leftCount = activeRects.filter((r) => r.x + r.w / 2 < mid).length;
    const rightCount = activeRects.length - leftCount;
    const gap = leftCount - rightCount;

    let candidateZones = zones;
    if (Math.abs(gap) >= 2) {
      const preferSide = gap > 0 ? 'right' : 'left';
      const sideMatch = zones.filter((z) => sideOf(z) === preferSide);
      if (sideMatch.length) candidateZones = sideMatch;
    }

    const candidates = [];
    for (const zone of candidateZones) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = {
          x: zone.x + Math.random() * Math.max(0, zone.w - patternSize),
          y: zone.y + Math.random() * Math.max(0, zone.h - patternSize),
          w: patternSize,
          h: patternSize,
        };
        const collides = activeRects.some((r) => rectsCollide(candidate, r, BREATHING_ROOM));
        if (!collides) candidates.push(candidate);
      }
    }

    if (candidates.length === 0) return null; // no non-colliding room right now — try again next tick
    if (activeRects.length === 0) return pick(candidates);

    let best = candidates[0];
    let bestMinDist = -Infinity;
    for (const candidate of candidates) {
      const minDist = Math.min(...activeRects.map((r) => centerDistance(candidate, r)));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = candidate;
      }
    }
    return best;
  }

  function spawnPattern() {
    const gridSize = GRID_SIZE;
    const patternSize = gridSize * STEP;

    const zones = safeZones(patternSize);
    if (zones.length === 0) return;

    const rect = findPlacement(zones, patternSize);
    if (!rect) return;

    const grid = document.createElement('div');
    grid.className = 'pixel-burst';
    grid.style.left = `${rect.x}px`;
    grid.style.top = `${rect.y}px`;
    grid.style.width = `${patternSize}px`;
    grid.style.height = `${patternSize}px`;

    // Row/col only drive the simulation's neighbor logic — each cell's
    // rendered position gets its own fixed random jitter, so nothing lines
    // up on a uniform raster even though the math underneath is gridded.
    // Positions outside the mask get no cell at all (left null), carving an
    // organic silhouette instead of a filled square.
    const mask = buildExistenceMask(gridSize);
    const cells = [];
    for (let row = 0; row < gridSize; row++) {
      const rowCells = [];
      for (let col = 0; col < gridSize; col++) {
        if (!mask[row][col]) {
          rowCells.push(null);
          continue;
        }
        const cell = document.createElement('div');
        cell.className = 'pixel-cell';
        cell.style.width = `${CELL}px`;
        cell.style.height = `${CELL}px`;
        cell.style.left = `${col * STEP + (Math.random() - 0.5) * 2 * JITTER}px`;
        cell.style.top = `${row * STEP + (Math.random() - 0.5) * 2 * JITTER}px`;
        grid.appendChild(cell);
        rowCells.push(cell);
      }
      cells.push(rowCells);
    }

    document.body.appendChild(grid);
    active++;
    activeRects.push(rect);

    const behavior = pickBehavior();
    behavior(cells, grid, rect, gridSize);
  }

  // Fill to capacity immediately on load rather than ramping up from zero —
  // the page should already look alive on first paint. This naturally
  // self-limits via findPlacement once the safe zones run out of room.
  for (let i = 0; i < MAX_CONCURRENT; i++) {
    if (active >= MAX_CONCURRENT) break;
    spawnPattern();
  }

  setInterval(() => {
    if (active >= MAX_CONCURRENT) return;
    // Strongly biased to refill up to the floor; still probabilistic above it
    // so the count doesn't feel mechanically pinned at exactly MIN_ONSCREEN.
    const chance = active < MIN_ONSCREEN ? 0.9 : 0.25;
    if (Math.random() < chance) {
      spawnPattern();
    }
  }, CHECK_INTERVAL_MS);
})();
