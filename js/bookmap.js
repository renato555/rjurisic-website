// Map of the books: each dot is a book, linked to the books most similar to it.
// The map is written into books.html by tools/book_graph.py; this adds the
// hover highlights and keeps sizes steady across screen widths.
(function () {
  const box = document.getElementById("bookmap");
  if (!box) return;

  const svg = box.querySelector("svg");
  const W = svg.viewBox.baseVal.width;
  const H = svg.viewBox.baseVal.height;
  const R = 3.5;        // px: dot radius
  const items = [...document.querySelectorAll(".book[data-node]")];
  const dots = [...svg.querySelectorAll(".nodes circle")];
  const links = [...svg.querySelectorAll(".links line")];
  const ends = links.map((line) => [+line.dataset.a, +line.dataset.b]);
  const labels = [...box.querySelectorAll(".bookmap-label")];
  const anchors = labels.map((label) => label.style.left);
  const pos = dots.map((c) => [c.cx.baseVal.value, c.cy.baseVal.value]);
  const neighbours = dots.map(() => new Set());
  ends.forEach(([a, b]) => { neighbours[a].add(b); neighbours[b].add(a); });

  const tip = document.createElement("div");
  tip.className = "bookmap-tip";
  box.appendChild(tip);

  // Dots are sized in screen pixels, so the map reads the same at any width
  function draw() {
    const unit = W / box.clientWidth;   // viewBox units per pixel
    dots.forEach((c) => c.setAttribute("r", R * unit));
    // Keep labels inside the box on narrow screens
    labels.forEach((label, k) => {
      label.style.left = anchors[k];
      const half = label.offsetWidth / 2;
      const x = label.offsetLeft;
      if (x < half || x > box.clientWidth - half) {
        label.style.left = Math.min(Math.max(x, half), box.clientWidth - half) + "px";
      }
    });
  }

  function focus(i) {
    box.classList.toggle("is-focused", i !== null);
    dots.forEach((c, j) => {
      c.classList.toggle("on", j === i);
      c.classList.toggle("near", i !== null && neighbours[i].has(j));
    });
    links.forEach((line, k) => {
      const [a, b] = ends[k];
      line.classList.toggle("on", i !== null && (a === i || b === i));
    });
    items.forEach((li, j) => li.classList.toggle("is-lit", j === i));
    if (i === null) {
      tip.hidden = true;
      return;
    }
    const li = items[i];
    tip.innerHTML = "";
    tip.append(li.querySelector("cite").cloneNode(true), li.querySelector(".author").cloneNode(true));
    tip.hidden = false;
    const [x, y] = pos[i];
    tip.style.left = (x / W) * 100 + "%";
    tip.style.top = (y / H) * 100 + "%";
    tip.classList.toggle("below", y / H < 0.3);
    tip.classList.toggle("left", x / W > 0.7);
    tip.classList.toggle("right", x / W < 0.3);
  }

  svg.addEventListener("pointerover", (e) => {
    if (e.target.dataset.node) focus(+e.target.dataset.node);
  });
  svg.addEventListener("pointerout", (e) => {
    // A tap keeps the book shown until the next tap
    if (e.target.dataset.node && e.pointerType !== "touch") focus(null);
  });
  svg.addEventListener("click", (e) => {
    if (!e.target.dataset.node) focus(null);
  });
  items.forEach((li, i) => {
    li.addEventListener("pointerenter", () => focus(i));
    li.addEventListener("pointerleave", () => focus(null));
  });

  draw();
  // Labels are measured for the clamp, so measure again once the web fonts are in
  document.fonts.ready.then(draw);
  focus(null);
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  });
})();
