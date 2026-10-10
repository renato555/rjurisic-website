"""Build the book map on books.html from tools/books.json.

Each book's description is embedded with a small sentence-embedding model,
every book is linked to its most similar books, and the resulting graph is
split into topics and laid out in 2D. The script writes into books.html:

  - the map, as SVG, between the bookmap:start/end markers
  - the book list, between the books:start/end markers

The map is part of the page, so it shows up with it; js/bookmap.js only adds
the hover highlights.

Run after editing books.json:

  pip install -r tools/requirements.txt
  python tools/book_graph.py
"""

import html
import json
import math
import re
from pathlib import Path

import networkx as nx
import numpy as np
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parent.parent
MODEL = "sentence-transformers/all-mpnet-base-v2"
NEIGHBOURS = 3          # links per book
RESOLUTION = 1.4        # higher → more, smaller topics
SEED = 9
ASPECT = 4 / 3        # width / height of the map

# Drawing, in the map's own units (the SVG viewBox is W by H)
W = 1600
H = round(W / ASPECT)
DOT = 3.5               # px: dot radius
MAP_PX = 448            # px: width of the map on a desktop (28rem in books.html);
                        # bookmap.js rescales the dots for other widths
LABEL_GAP = 13          # px: label baseline above a topic's highest book

# A topic is named after the anchor book it contains. Topics without an
# anchor are left unnamed; the script prints them so a name can be added.
TOPICS = {
    "Software & computer science": "Designing Data-Intensive Applications",
    "Mind & people": "Atomic Habits",
    "Science": "A Brief History of Time",
    "Fiction": "The Fellowship of the Ring",
    "Maths & mechanics": "How Not to Be Wrong",
    "Builders & strategy": "Steve Jobs",
    "Humanity & the future": "Sapiens",
}


def embed(books):
    model = SentenceTransformer(MODEL)
    # Descriptions only: titles like "Chaos" or "Built to Last" mislead the model
    return model.encode([b["about"] for b in books], normalize_embeddings=True)


def build_graph(vectors):
    sim = vectors @ vectors.T
    np.fill_diagonal(sim, -1)
    g = nx.Graph()
    g.add_nodes_from(range(len(vectors)))
    for i, row in enumerate(sim):
        for j in np.argsort(-row)[:NEIGHBOURS]:
            g.add_edge(i, int(j), weight=float(row[j]))
    return g


def name_topics(books, communities):
    titles = [b["title"] for b in books]
    named = []
    for members in communities:
        names = [n for n, anchor in TOPICS.items() if titles.index(anchor) in members]
        named.append(" / ".join(names) if names else None)
    return named


def layout(g, communities):
    """Place topics first, then each topic's books inside a circle around it.

    Works in a frame ASPECT wide and 1 tall; returns x and y both in 0..1.
    """
    topic_of = {n: t for t, members in enumerate(communities) for n in members}
    radius = [0.07 * math.sqrt(len(m)) for m in communities]

    # Topics are linked as strongly as the books between them
    tg = nx.Graph()
    tg.add_nodes_from(range(len(communities)))
    for a, b, w in g.edges(data="weight"):
        ta, tb = topic_of[a], topic_of[b]
        if ta != tb:
            prev = tg.get_edge_data(ta, tb, {"weight": 0})["weight"]
            tg.add_edge(ta, tb, weight=prev + w)
    centres = nx.spring_layout(tg, weight="weight", seed=SEED, iterations=500)
    c = np.array([centres[t] for t in range(len(communities))])

    # Widest spread runs horizontally; stretch to the frame's shape
    c -= c.mean(axis=0)
    _, _, vt = np.linalg.svd(c, full_matrices=False)
    c = c @ vt.T
    c /= np.abs(c).max(axis=0)
    c *= [ASPECT / 2, 0.5]

    # Push overlapping topics apart
    gap = 0.16
    for _ in range(500):
        moved = False
        for i in range(len(c)):
            for j in range(i + 1, len(c)):
                d = c[j] - c[i]
                dist = np.hypot(*d) or 1e-9
                need = radius[i] + radius[j] + gap
                if dist < need:
                    push = d / dist * (need - dist) / 2
                    c[i] -= push
                    c[j] += push
                    moved = True
        if not moved:
            break

    # Books of each topic, laid out on their own and scaled into the topic's circle
    xy = np.zeros((g.number_of_nodes(), 2))
    for t, members in enumerate(communities):
        sub = g.subgraph(members)
        if len(members) == 1:
            local = {n: np.zeros(2) for n in members}
        else:
            local = nx.spring_layout(sub, weight="weight", seed=SEED, iterations=300)
        pts = np.array([local[n] for n in sorted(members)])
        pts -= pts.mean(axis=0)
        pts /= np.hypot(*pts.T).max() or 1
        for n, p in zip(sorted(members), pts):
            xy[n] = c[t] + p * radius[t]

    # Fit everything into the frame with one scale, so circles stay round
    pad = 0.07
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    scale = min((ASPECT - 2 * pad) / (hi[0] - lo[0]), (1 - 2 * pad) / (hi[1] - lo[1]))
    xy = (xy - (lo + hi) / 2) * scale + [ASPECT / 2, 0.5]
    xy[:, 0] /= ASPECT
    return xy


def hull(points):
    pts = sorted(map(tuple, points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def book_item(i, b):
    lang = f' lang="{b["lang"]}"' if b.get("lang") else ""
    return (f'      <li class="book" data-node="{i}"><cite{lang}>{html.escape(b["title"], quote=False)}</cite> '
            f'<span class="author">{html.escape(b["author"], quote=False)}</span></li>')


def book_map(books, g, communities, names, topic_of, xy):
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
    pts = [(f(x * W), f(y * H)) for x, y in xy]
    hulls = [f'            <polygon points="{" ".join(f"{f(x * W)},{f(y * H)}" for x, y in hull(xy[sorted(m)]))}"/>'
             for m in communities]
    links = []
    for a, b in sorted(sorted(e) for e in g.edges):
        # Links between topics are drawn fainter than links within one
        cls = "" if topic_of[a] == topic_of[b] else ' class="across"'
        links.append(f'            <line x1="{pts[a][0]}" y1="{pts[a][1]}" x2="{pts[b][0]}" y2="{pts[b][1]}" '
                     f'data-a="{a}" data-b="{b}"{cls}/>')
    r = f(DOT * W / MAP_PX)
    dots = [f'            <circle cx="{x}" cy="{y}" r="{r}" data-node="{i}"/>' for i, (x, y) in enumerate(pts)]
    labels = []
    for name, members in zip(names, communities):
        if not name:
            continue
        # Label sits just above the topic's highest book
        h = np.array(hull(xy[sorted(members)]))
        left, top = h[:, 0].mean() * 100, h[:, 1].min() * 100
        labels.append(f'        <span class="bookmap-label" style="left: {left:.2f}%; '
                      f'top: calc({top:.2f}% - {LABEL_GAP}px)">{html.escape(name, quote=False)}</span>')
    return "\n".join([
        f'      <div class="bookmap" id="bookmap" style="aspect-ratio: {W} / {H}">',
        f'        <svg viewBox="0 0 {W} {H}" aria-hidden="true">',
        '          <g class="hulls">', *hulls, '          </g>',
        '          <g class="links">', *links, '          </g>',
        '          <g class="nodes">', *dots, '          </g>',
        '        </svg>',
        *labels,
        '      </div>',
    ])


def fill(text, name, content):
    """Replace what sits between <!-- name:start --> and <!-- name:end --> in a page."""
    text, count = re.subn(rf"(<!-- {name}:start.*?-->).*?(\n\s*<!-- {name}:end -->)",
                          lambda m: m.group(1) + "\n" + content + m.group(2), text, flags=re.S)
    if count != 1:
        raise SystemExit(f"books.html: missing {name}:start / {name}:end markers")
    return text


def main():
    books = json.loads((ROOT / "tools" / "books.json").read_text())
    vectors = embed(books)
    g = build_graph(vectors)
    communities = nx.community.louvain_communities(g, weight="weight", resolution=RESOLUTION, seed=SEED)
    communities = sorted(communities, key=len, reverse=True)
    names = name_topics(books, communities)
    topic_of = {n: t for t, members in enumerate(communities) for n in members}
    xy = layout(g, communities)

    for name, members in zip(names, communities):
        print(f"{name or 'UNNAMED'} ({len(members)}):")
        for n in sorted(members):
            print(f"    {books[n]['title']}")

    page = ROOT / "books.html"
    text = page.read_text()
    text = fill(text, "bookmap", book_map(books, g, communities, names, topic_of, xy))
    text = fill(text, "books", "\n".join(book_item(i, b) for i, b in enumerate(books)))
    page.write_text(text)


if __name__ == "__main__":
    main()
