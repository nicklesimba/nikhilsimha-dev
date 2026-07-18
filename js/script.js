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

  const MAX_CONCURRENT = 2;
  const SPAWN_CHANCE = 0.4;
  const CHECK_INTERVAL_MS = 6000;
  const GRID_SIZE = 6;
  const CELL = 12;
  const CELL_GAP = 3;
  const PATTERN_SIZE = GRID_SIZE * (CELL + CELL_GAP);
  const STACK_BREAKPOINT = 880; // matches the CSS breakpoint where the sidebar stacks

  let active = 0;

  function safeZones() {
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
    if (belowHeight > PATTERN_SIZE) {
      zones.push({ x: sRect.left, y: sRect.bottom + margin, w: sRect.width, h: belowHeight });
    }

    // Zone 2: outer right gutter, only present when the viewport is wider
    // than the centered .layout max-width.
    const rightGutterW = window.innerWidth - lRect.right - margin;
    if (rightGutterW > PATTERN_SIZE) {
      zones.push({ x: lRect.right + margin, y: 0, w: rightGutterW, h: window.innerHeight });
    }

    // Zone 3: outer left gutter (mirrors zone 2 since .layout is centered).
    const leftGutterW = lRect.left - margin;
    if (leftGutterW > PATTERN_SIZE) {
      zones.push({ x: margin, y: 0, w: leftGutterW, h: window.innerHeight });
    }

    return zones.filter((z) => z.w >= PATTERN_SIZE && z.h >= PATTERN_SIZE);
  }

  function setAlive(cell, alive) {
    cell.classList.toggle('pixel-on', alive);
  }

  function fizzleOut(grid) {
    const fadeDuration = 1800;
    grid.classList.add('fizzle-out');
    setTimeout(() => {
      grid.remove();
      active--;
    }, fadeDuration + 100);
  }

  // Behavior 1: the original outer-ring scan/chase (pure CSS animation).
  function runScan(cells, grid) {
    let order = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const isOuter = row === 0 || row === GRID_SIZE - 1 || col === 0 || col === GRID_SIZE - 1;
        if (!isOuter) continue;
        cells[row][col].classList.add('pixel-cell-outer');
        cells[row][col].style.animationDelay = `${order * 70}ms`;
        order++;
      }
    }
    const duration = order * 70 + 650 * 2;
    setTimeout(() => fizzleOut(grid), duration);
  }

  // Behavior 2: real Conway's Game of Life, seeded randomly, bounded edges.
  function runLife(cells, grid) {
    let state = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      const row = [];
      for (let c = 0; c < GRID_SIZE; c++) row.push(Math.random() < 0.4);
      state.push(row);
    }
    function render() {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) setAlive(cells[r][c], state[r][c]);
      }
    }
    function countNeighbors(r, c) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE && state[rr][cc]) n++;
        }
      }
      return n;
    }
    render();
    const GENERATIONS = 6;
    let gen = 0;
    const iv = setInterval(() => {
      const next = state.map((row) => row.slice());
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const n = countNeighbors(r, c);
          next[r][c] = state[r][c] ? (n === 2 || n === 3) : n === 3;
        }
      }
      state = next;
      render();
      gen++;
      if (gen >= GENERATIONS) {
        clearInterval(iv);
        fizzleOut(grid);
      }
    }, 380);
  }

  // Behavior 3: chaotic random spread — a few seed cells grow outward in
  // random directions, with a chance to randomly flicker off ("struggling").
  function runStruggle(cells, grid) {
    const alive = new Set();
    const seedCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < seedCount; i++) {
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);
      alive.add(`${r},${c}`);
    }
    function render() {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) setAlive(cells[r][c], alive.has(`${r},${c}`));
      }
    }
    render();
    const STEPS = 10;
    let step = 0;
    const iv = setInterval(() => {
      Array.from(alive).forEach((key) => {
        const [r, c] = key.split(',').map(Number);
        if (Math.random() < 0.6) {
          const rr = r + Math.floor(Math.random() * 3) - 1;
          const cc = c + Math.floor(Math.random() * 3) - 1;
          if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) alive.add(`${rr},${cc}`);
        }
        if (Math.random() < 0.25 && alive.size > 1) alive.delete(key);
      });
      render();
      step++;
      if (step >= STEPS) {
        clearInterval(iv);
        fizzleOut(grid);
      }
    }, 220);
  }

  const BEHAVIORS = [runScan, runLife, runStruggle];

  function spawnPattern() {
    const zones = safeZones();
    if (zones.length === 0) return;

    const zone = zones[Math.floor(Math.random() * zones.length)];
    const x = zone.x + Math.random() * Math.max(0, zone.w - PATTERN_SIZE);
    const y = zone.y + Math.random() * Math.max(0, zone.h - PATTERN_SIZE);

    const grid = document.createElement('div');
    grid.className = 'pixel-burst';
    grid.style.left = `${x}px`;
    grid.style.top = `${y}px`;
    grid.style.gridTemplateColumns = `repeat(${GRID_SIZE}, ${CELL}px)`;
    grid.style.gridTemplateRows = `repeat(${GRID_SIZE}, ${CELL}px)`;
    grid.style.gap = `${CELL_GAP}px`;

    const cells = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      const rowCells = [];
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = 'pixel-cell';
        grid.appendChild(cell);
        rowCells.push(cell);
      }
      cells.push(rowCells);
    }

    document.body.appendChild(grid);
    active++;

    const behavior = BEHAVIORS[Math.floor(Math.random() * BEHAVIORS.length)];
    behavior(cells, grid);
  }

  setInterval(() => {
    if (active < MAX_CONCURRENT && Math.random() < SPAWN_CHANCE) {
      spawnPattern();
    }
  }, CHECK_INTERVAL_MS);
})();
