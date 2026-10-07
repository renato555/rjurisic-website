// Strange attractors, drawn point by point into a density grid.
// Maps (Clifford, de Jong, Hénon) are iterated directly. Flows (Lorenz,
// Rössler, Aizawa) are integrated with RK4 and projected onto the canvas.
(function () {
  const TOTAL_POINTS = 3_500_000;
  const FRAMES = 40;
  const WARMUP = 1_000;     // iterations dropped while the orbit settles
  const SAMPLE = 60_000;    // iterations used to measure the bounds

  function fmt(v) {
    return (v < 0 ? "−" : "") + String(Math.abs(v));
  }
  function list(names, values) {
    return names.map((n, i) => `${n} = ${fmt(values[i])}`).join(", ");
  }

  // ── Maps ──
  function clifford(a, b, c, d) {
    return {
      name: "Clifford attractor",
      params: list(["a", "b", "c", "d"], [a, b, c, d]),
      init: () => [0.1, 0.1],
      next(s) {
        const x = s[0], y = s[1];
        s[0] = Math.sin(a * y) + c * Math.cos(a * x);
        s[1] = Math.sin(b * x) + d * Math.cos(b * y);
      },
      project(s, out) { out[0] = s[0]; out[1] = s[1]; },
    };
  }

  function deJong(a, b, c, d) {
    return {
      name: "Peter de Jong attractor",
      params: list(["a", "b", "c", "d"], [a, b, c, d]),
      init: () => [0.1, 0.1],
      next(s) {
        const x = s[0], y = s[1];
        s[0] = Math.sin(a * y) - Math.cos(b * x);
        s[1] = Math.sin(c * x) - Math.cos(d * y);
      },
      project(s, out) { out[0] = s[0]; out[1] = s[1]; },
    };
  }

  function henon(a, b) {
    return {
      name: "Hénon map",
      params: list(["a", "b"], [a, b]),
      stretch: 3,   // the attractor is long and flat; let it fill the square
      init: () => [0.1, 0.1],
      next(s) {
        const x = s[0];
        s[0] = 1 - a * x * x + s[1];
        s[1] = b * x;
      },
      project(s, out) { out[0] = s[0]; out[1] = s[1]; },
    };
  }

  // ── Flows: dx/dt = f(x), viewed with z up, turned by yaw then tilted by pitch ──
  function flow(name, params, deriv, dt, yaw, pitch) {
    const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], t = [0, 0, 0];
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return {
      name,
      params,
      init: () => [0.1, 0, 0],
      next(s) {
        deriv(s, k1);
        for (let i = 0; i < 3; i++) t[i] = s[i] + k1[i] * dt / 2;
        deriv(t, k2);
        for (let i = 0; i < 3; i++) t[i] = s[i] + k2[i] * dt / 2;
        deriv(t, k3);
        for (let i = 0; i < 3; i++) t[i] = s[i] + k3[i] * dt;
        deriv(t, k4);
        for (let i = 0; i < 3; i++) s[i] += (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6;
      },
      project(s, out) {
        const u = s[0] * cy - s[1] * sy;
        const w = s[0] * sy + s[1] * cy;
        out[0] = u;
        out[1] = s[2] * cp - w * sp;
      },
    };
  }

  function lorenz(sigma, rho, beta) {
    return flow("Lorenz attractor", "σ = 10, ρ = 28, β = 8/3", (s, d) => {
      d[0] = sigma * (s[1] - s[0]);
      d[1] = s[0] * (rho - s[2]) - s[1];
      d[2] = s[0] * s[1] - beta * s[2];
    }, 0.002, 0, 0);
  }

  function rossler(a, b, c) {
    return flow("Rössler attractor", list(["a", "b", "c"], [a, b, c]), (s, d) => {
      d[0] = -s[1] - s[2];
      d[1] = s[0] + a * s[1];
      d[2] = b + s[2] * (s[0] - c);
    }, 0.01, 0.4, 1.1);
  }

  function aizawa(a, b, c, dd, e, f) {
    return flow("Aizawa attractor", list(["a", "b", "c", "d", "e", "f"], [a, b, c, dd, e, f]), (s, d) => {
      const x = s[0], y = s[1], z = s[2];
      d[0] = (z - b) * x - dd * y;
      d[1] = dd * x + (z - b) * y;
      d[2] = c + a * z - z * z * z / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x;
    }, 0.01, 0, 0.35);
  }

  // "Draw another" walks through these in order
  const ATTRACTORS = [
    clifford(-1.4, 1.6, 1.0, 0.7),
    lorenz(10, 28, 8 / 3),
    deJong(1.641, 1.902, 0.316, 1.525),
    rossler(0.2, 0.2, 5.7),
    clifford(1.7, 1.7, 0.6, 1.2),
    aizawa(0.95, 0.7, 0.6, 3.5, 0.25, 0.1),
    deJong(-2.24, 0.43, -0.65, -2.43),
    henon(1.4, 0.3),
    clifford(-1.7, 1.3, -0.1, -1.21),
    deJong(2.01, -2.53, 1.61, -0.33),
  ];

  const canvas = document.getElementById("attractor");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const nameEl = document.getElementById("attractor-name");
  const caption = document.getElementById("attractor-params");
  const button = document.getElementById("attractor-redraw");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let att, state, density, w, h, maxCount, drawn, raf;
  let midX, midY, scaleX, scaleY;
  const pt = [0, 0];

  function hexToRgb(hex) {
    hex = hex.trim().replace("#", "");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function palette() {
    const s = getComputedStyle(document.documentElement);
    return {
      paper: hexToRgb(s.getPropertyValue("--paper")),
      bloom: hexToRgb(s.getPropertyValue("--bloom")),
      leaf: hexToRgb(s.getPropertyValue("--leaf")),
      ink: hexToRgb(s.getPropertyValue("--ink")),
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
  }

  // Let the orbit settle, then measure where it goes so any attractor fits the canvas
  function fit() {
    for (let i = 0; i < WARMUP; i++) att.next(state);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < SAMPLE; i++) {
      att.next(state);
      att.project(state, pt);
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
    const pad = 0.06;
    const sx = (w * (1 - 2 * pad)) / (maxX - minX || 1);
    const sy = (h * (1 - 2 * pad)) / (maxY - minY || 1);
    const s = Math.min(sx, sy);
    const stretch = att.stretch || 1;
    scaleX = Math.min(sx, s * stretch);
    scaleY = Math.min(sy, s * stretch);
    midX = (minX + maxX) / 2;
    midY = (minY + maxY) / 2;
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();
    density = new Uint32Array(w * h);
    maxCount = 1;
    drawn = 0;
    att = ATTRACTORS[index];
    state = att.init();
    fit();
    if (nameEl) nameEl.textContent = att.name + ",";
    if (caption) caption.textContent = att.params;
    canvas.setAttribute("aria-label",
      `A ${att.name}, drawn from millions of points in green and blueberry tones.`);
    if (reduceMotion) {
      step(TOTAL_POINTS);
      paint();
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  function step(count) {
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < count; i++) {
      att.next(state);
      att.project(state, pt);
      const px = (cx + (pt[0] - midX) * scaleX) | 0;
      const py = (cy - (pt[1] - midY) * scaleY) | 0;
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const k = py * w + px;
        const v = ++density[k];
        if (v > maxCount) maxCount = v;
      }
    }
    drawn += count;
  }

  function paint() {
    const p = palette();
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const logMax = Math.log(1 + maxCount);
    for (let i = 0; i < density.length; i++) {
      const o = i * 4;
      const v = density[i];
      let r = p.paper[0], g = p.paper[1], bl = p.paper[2];
      if (v > 0) {
        const t = Math.log(1 + v) / logMax;          // 0..1
        const alpha = Math.min(1, Math.pow(t, 0.55) * 1.1);
        // bloom (sparse) → leaf (dense) → ink (densest)
        let col;
        if (t < 0.6) {
          const u = t / 0.6;
          col = [
            p.bloom[0] + (p.leaf[0] - p.bloom[0]) * u,
            p.bloom[1] + (p.leaf[1] - p.bloom[1]) * u,
            p.bloom[2] + (p.leaf[2] - p.bloom[2]) * u,
          ];
        } else {
          const u = (t - 0.6) / 0.4;
          col = [
            p.leaf[0] + (p.ink[0] - p.leaf[0]) * u * 0.55,
            p.leaf[1] + (p.ink[1] - p.leaf[1]) * u * 0.55,
            p.leaf[2] + (p.ink[2] - p.leaf[2]) * u * 0.55,
          ];
        }
        r += (col[0] - r) * alpha;
        g += (col[1] - g) * alpha;
        bl += (col[2] - bl) * alpha;
      }
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = bl;
      data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function frame() {
    step(Math.ceil(TOTAL_POINTS / FRAMES));
    paint();
    if (drawn < TOTAL_POINTS) raf = requestAnimationFrame(frame);
  }

  if (button) {
    button.addEventListener("click", () => {
      index = (index + 1) % ATTRACTORS.length;
      start();
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(start, 200);
  });
  document.addEventListener("themechange", () => {
    if (drawn >= TOTAL_POINTS) paint();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (drawn >= TOTAL_POINTS) paint();
  });

  start();
})();
