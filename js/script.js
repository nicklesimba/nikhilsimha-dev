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
  const GRID_SIZE_OPTIONS = [5, 6, 7, 8];
  const GLOW_RANGE_OPTIONS = [2, 3, 4];
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
  function renderGlow(cells, aliveSet, gridSize, glowRange) {
    const aliveCoords = Array.from(aliveSet, (key) => key.split(',').map(Number));
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        let dist = Infinity;
        for (let i = 0; i < aliveCoords.length; i++) {
          const [ar, ac] = aliveCoords[i];
          const d = Math.max(Math.abs(r - ar), Math.abs(c - ac));
          if (d < dist) dist = d;
        }
        const cell = cells[r][c];
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

  // Behavior 1: a single lit cell chases around the outer ring. Direction,
  // speed, and lap count are randomized per spawn.
  function runScan(cells, grid, rect, gridSize) {
    const glowRange = pick(GLOW_RANGE_OPTIONS);
    const perimeter = [];
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1) {
          perimeter.push([row, col]);
        }
      }
    }
    if (Math.random() < 0.5) perimeter.reverse();
    const laps = 1 + Math.floor(Math.random() * 2);
    const speed = 100 + Math.floor(Math.random() * 90);
    let i = 0;
    const STEPS = perimeter.length * laps;
    const iv = setInterval(() => {
      const [r, c] = perimeter[i % perimeter.length];
      renderGlow(cells, new Set([`${r},${c}`]), gridSize, glowRange);
      i++;
      if (i >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, speed);
  }

  // Behavior 2: real Conway's Game of Life. Seed density, generation count,
  // and tick speed are all randomized per spawn.
  function runLife(cells, grid, rect, gridSize) {
    const glowRange = pick(GLOW_RANGE_OPTIONS);
    const density = 0.25 + Math.random() * 0.2;
    const GENERATIONS = 4 + Math.floor(Math.random() * 6);
    const speed = 300 + Math.floor(Math.random() * 200);
    let state = [];
    for (let r = 0; r < gridSize; r++) {
      const row = [];
      for (let c = 0; c < gridSize; c++) row.push(Math.random() < density);
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
    renderGlow(cells, toAliveSet(), gridSize, glowRange);
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
      renderGlow(cells, toAliveSet(), gridSize, glowRange);
      gen++;
      if (gen >= GENERATIONS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, speed);
  }

  // Behavior 3: chaotic random spread — seed cells grow outward in random
  // directions, with a chance to randomly flicker off ("struggling"). Seed
  // count, spread/flicker odds, step count, and speed all randomized.
  function runStruggle(cells, grid, rect, gridSize) {
    const glowRange = pick(GLOW_RANGE_OPTIONS);
    const alive = new Set();
    const seedCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < seedCount; i++) {
      const r = Math.floor(Math.random() * gridSize);
      const c = Math.floor(Math.random() * gridSize);
      alive.add(`${r},${c}`);
    }
    const spreadChance = 0.4 + Math.random() * 0.35;
    const flickerChance = 0.15 + Math.random() * 0.2;
    const STEPS = 6 + Math.floor(Math.random() * 10);
    const speed = 160 + Math.floor(Math.random() * 140);
    renderGlow(cells, alive, gridSize, glowRange);
    let step = 0;
    const iv = setInterval(() => {
      Array.from(alive).forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        if (Math.random() < spreadChance) {
          const rr = r + Math.floor(Math.random() * 3) - 1;
          const cc = c + Math.floor(Math.random() * 3) - 1;
          if (rr >= 0 && rr < gridSize && cc >= 0 && cc < gridSize) alive.add(`${rr},${cc}`);
        }
        if (Math.random() < flickerChance && alive.size > 1) alive.delete(key);
      });
      renderGlow(cells, alive, gridSize, glowRange);
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, speed);
  }

  // Behavior 4: a ring pulses outward from a random origin, like a radar
  // ping, until it clears the edge of the grid.
  function runPulse(cells, grid, rect, gridSize) {
    const glowRange = pick(GLOW_RANGE_OPTIONS);
    const originR = 1 + Math.floor(Math.random() * (gridSize - 2));
    const originC = 1 + Math.floor(Math.random() * (gridSize - 2));
    const speed = 130 + Math.floor(Math.random() * 110);
    let radius = 0;
    const iv = setInterval(() => {
      const ring = new Set();
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (Math.max(Math.abs(r - originR), Math.abs(c - originC)) === radius) ring.add(`${r},${c}`);
        }
      }
      renderGlow(cells, ring, gridSize, glowRange);
      radius++;
      if (radius > gridSize) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, speed);
  }

  // Behavior 5: independent cells twinkle on and off at random, unrelated
  // to one another — no spread, no adjacency, just chaotic sparkle.
  function runSparkle(cells, grid, rect, gridSize) {
    const glowRange = pick(GLOW_RANGE_OPTIONS);
    const density = 0.12 + Math.random() * 0.18;
    const STEPS = 10 + Math.floor(Math.random() * 8);
    const speed = 150 + Math.floor(Math.random() * 120);
    let step = 0;
    const iv = setInterval(() => {
      const lit = new Set();
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          if (Math.random() < density) lit.add(`${r},${c}`);
        }
      }
      renderGlow(cells, lit, gridSize, glowRange);
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid, rect);
      }
    }, speed);
  }

  const BEHAVIORS = [runScan, runLife, runStruggle, runPulse, runSparkle];

  // Tries every safe zone (in random order) looking for a spot that doesn't
  // collide with any currently-live pattern, given real breathing room.
  function findPlacement(zones, patternSize) {
    const shuffled = zones.slice().sort(() => Math.random() - 0.5);
    for (const zone of shuffled) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = {
          x: zone.x + Math.random() * Math.max(0, zone.w - patternSize),
          y: zone.y + Math.random() * Math.max(0, zone.h - patternSize),
          w: patternSize,
          h: patternSize,
        };
        const collides = activeRects.some((r) => rectsCollide(candidate, r, BREATHING_ROOM));
        if (!collides) return candidate;
      }
    }
    return null; // no non-colliding room right now — try again next tick
  }

  function spawnPattern() {
    const gridSize = pick(GRID_SIZE_OPTIONS);
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
    const cells = [];
    for (let row = 0; row < gridSize; row++) {
      const rowCells = [];
      for (let col = 0; col < gridSize; col++) {
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

    const behavior = pick(BEHAVIORS);
    behavior(cells, grid, rect, gridSize);
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
