// Clifford attractor, drawn point by point into a density grid.
//   x' = sin(a·y) + c·cos(a·x)
//   y' = sin(b·x) + d·cos(b·y)
(function () {
  const PRESETS = [
    [-1.4, 1.6, 1.0, 0.7],
    [1.7, 1.7, 0.6, 1.2],
    [-1.7, 1.3, -0.1, -1.21],
    [-1.8, -2.0, -0.5, -0.9],
    [1.5, -1.8, 1.6, 0.9],
    [-1.24, -1.25, -1.81, -1.91],
    [1.6, -0.6, -1.2, 1.6],
    [-1.3, -1.3, -1.8, -1.9],
  ];
  const TOTAL_POINTS = 3_500_000;
  const FRAMES = 40;

  const canvas = document.getElementById("attractor");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const caption = document.getElementById("attractor-params");
  const button = document.getElementById("attractor-redraw");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let presetIndex = 0;
  let params = PRESETS[0];
  let density, w, h, maxCount, drawn, x, y, raf;

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

  function fmt(v) {
    return (v < 0 ? "−" : "") + Math.abs(v).toFixed(2).replace(/0$/, "");
  }

  function start() {
    cancelAnimationFrame(raf);
    resize();
    density = new Uint32Array(w * h);
    maxCount = 1;
    drawn = 0;
    x = 0.1;
    y = 0.1;
    const [a, b, c, d] = params;
    if (caption) {
      caption.textContent = `a = ${fmt(a)}, b = ${fmt(b)}, c = ${fmt(c)}, d = ${fmt(d)}`;
    }
    if (reduceMotion) {
      step(TOTAL_POINTS);
      paint();
    } else {
      raf = requestAnimationFrame(frame);
    }
  }

  function step(count) {
    const [a, b, c, d] = params;
    const xr = 1 + Math.abs(c);
    const yr = 1 + Math.abs(d);
    const pad = 0.06;
    const scale = Math.min(w / (2 * xr), h / (2 * yr)) * (1 - pad * 2);
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < count; i++) {
      const nx = Math.sin(a * y) + c * Math.cos(a * x);
      const ny = Math.sin(b * x) + d * Math.cos(b * y);
      x = nx;
      y = ny;
      const px = (cx + x * scale) | 0;
      const py = (cy - y * scale) | 0;
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
      presetIndex = (presetIndex + 1) % PRESETS.length;
      params = PRESETS[presetIndex];
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
