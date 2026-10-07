"""Build the book map on books.html from tools/books.json.

Each book's description is embedded with a small sentence-embedding model,
every book is linked to its most similar books, and the resulting graph is
split into topics and laid out in 2D. The script writes:

  - js/book-graph.js    node positions, links and topic outlines for the map
  - books.html          the book list, between the books:start/end markers

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
RESOLUTION = 1.5        # higher → more, smaller topics
SEED = 7
ASPECT = 4 / 3        # width / height of the map

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

    r = lambda v: round(float(v), 4)
    data = {
        "aspect": ASPECT,
        "nodes": [{"x": r(x), "y": r(y), "t": topic_of[i]} for i, (x, y) in enumerate(xy)],
        "links": sorted([sorted((a, b)) for a, b in g.edges]),
        "topics": [
            {"name": name, "size": len(members),
             "hull": [[r(x), r(y)] for x, y in hull(xy[sorted(members)])]}
            for name, members in zip(names, communities)
        ],
    }
    (ROOT / "js" / "book-graph.js").write_text(
        "// Generated by tools/book_graph.py from tools/books.json. Do not edit by hand.\n"
        f"window.BOOK_GRAPH = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n")

    page = ROOT / "books.html"
    text = page.read_text()
    text = fill(text, "books", "\n".join(book_item(i, b) for i, b in enumerate(books)))
    page.write_text(text)


if __name__ == "__main__":
    main()
