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

  // The title tip shows only for a dot hovered or clicked on the map; from the list
  // the reader already sees the title, so only the dot and its links light up
  function focus(i, withTip = true) {
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
    if (i === null || !withTip) {
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

  // Hover (mouse) lights a book: a dot shows its title tip, a book only lights its dot.
  // Click or tap, on a dot or a book, picks the book: dot, links and book stay lit,
  // without the tip, until the next scroll, a click elsewhere or a hover on another
  // book. A picked dot also scrolls its book into view.
  let picked = null;
  let touch = false;    // the last press was a finger, which has no hover

  function pick(i) {
    picked = i;
    focus(i, false);
  }

  // Hovering another book moves on from the pick, so leaving it lights nothing.
  // Until the mouse moves after a click on a dot, hovers come only from reveal()
  // scrolling books under the pointer, and are ignored.
  let clickedAt = null;
  let pressedAt = null;
  const stillThere = (e) => clickedAt &&
    Math.abs(e.clientX - clickedAt[0]) < 1 && Math.abs(e.clientY - clickedAt[1]) < 1;
  function hover(e, i, withTip) {
    if (stillThere(e)) return;
    clickedAt = null;
    if (picked !== null && i !== picked) picked = null;
    focus(i, withTip);
  }
  function unhover(e) {
    if (stillThere(e)) return;
    focus(picked, false);
  }

  document.addEventListener("pointerdown", (e) => {
    touch = e.pointerType === "touch";
    pressedAt = [e.clientX, e.clientY];   // a click's own coordinates are rounded
  }, true);
  svg.addEventListener("pointerover", (e) => {
    if (e.target.dataset.node && e.pointerType !== "touch") hover(e, +e.target.dataset.node, true);
  });
  svg.addEventListener("pointerout", (e) => {
    if (e.target.dataset.node && e.pointerType !== "touch") unhover(e);
  });
  svg.addEventListener("click", (e) => {
    if (!e.target.dataset.node) return pick(null);
    const i = +e.target.dataset.node;
    pick(i);
    if (!touch) {
      focus(i);   // the mouse is still on the dot: keep the hover tip until it moves away
      clickedAt = pressedAt;
    }
    reveal(items[i]);
  });
  document.addEventListener("click", (e) => {
    if (picked !== null && !svg.contains(e.target) && !e.target.closest(".book[data-node]")) pick(null);
  });
  items.forEach((li, i) => {
    li.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") hover(e, i, false); });
    li.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") unhover(e); });
    li.addEventListener("click", () => pick(i));
  });

  // Docking: the intro is sticky (books.html), offset so it sticks once the map
  // reaches the top of the screen. Until then the scroll slides the map to the
  // middle and fades the text beside it, so the map stays in view over the shelf.
  const intro = box.closest(".books-intro");
  const figure = box.closest("figure");
  const text = intro && intro.querySelector(".books-intro-text");
  const GAP = 12;       // px: space above the docked map
  let stickAt = 1;      // scroll position where the intro sticks
  let shift = 0;        // px: from the map's place in the layout to the middle

  function measure() {
    if (!text) return;
    // The sticky intro is the figure's offsetParent; offsets ignore transforms
    const n = figure.offsetTop - GAP;
    intro.style.top = -n + "px";
    stickAt = Math.max(1, intro.parentElement.offsetTop + n);
    shift = intro.clientWidth / 2 - (figure.offsetLeft + figure.offsetWidth / 2);
    dock();
  }

  function dock() {
    if (!text) return;
    const p = Math.min(Math.max(window.scrollY / stickAt, 0), 1);
    figure.style.transform = Math.abs(shift) > 1 ? `translateX(${(shift * p).toFixed(1)}px)` : "";
    const fade = Math.min(1, p * 1.4);   // text is gone a little before the map lands
    text.style.opacity = 1 - fade;
    text.style.visibility = fade >= 1 ? "hidden" : "";
  }

  // Scroll a book into the part of the screen below the docked map
  function reveal(li) {
    const rect = li.getBoundingClientRect();
    if (text) {
      const band = intro.offsetHeight + parseFloat(intro.style.top);   // docked height
      const visibleTop = Math.max(band, intro.getBoundingClientRect().bottom);
      if (rect.top >= visibleTop && rect.bottom <= window.innerHeight) return;
      const room = window.innerHeight - band;
      const target = window.scrollY + rect.top - band - Math.max(0, (room - rect.height) / 2);
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      autoScroll();
      window.scrollTo({ top: target, behavior: still ? "auto" : "smooth" });
    } else {
      autoScroll();
      li.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  // Scrolling lets a picked book go, except for the scroll that reveal() starts:
  // that one counts as over once the page has been still for a moment
  let auto = 0;
  function autoScroll() {
    clearTimeout(auto);
    auto = setTimeout(() => { auto = 0; }, 150);
  }

  let frame = 0;
  window.addEventListener("scroll", () => {
    if (auto) autoScroll();
    else if (picked !== null) pick(null);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; dock(); });
  }, { passive: true });

  function layoutAll() { draw(); measure(); }

  layoutAll();
  // Labels are measured for the clamp, so measure again once the web fonts are in
  document.fonts.ready.then(layoutAll);
  focus(null);
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(layoutAll, 150);
  });
})();
