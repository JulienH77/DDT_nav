// ===== ROUTING ENGINE =====
// Snap tolerance: coords rounded to 5 decimal places ≈ 1.1m — merges near-identical nodes

class RoutingEngine {
  constructor() {
    this.nodes = new Map();
  }

  // 5 decimal places ≈ ~1m precision (good for snapping slightly misaligned QGIS nodes)
  nodeKey(x, y, floor) {
    return `${parseFloat(x.toFixed(5))},${parseFloat(y.toFixed(5))},${floor}`;
  }

  addNode(x, y, floor) {
    const k = this.nodeKey(x, y, floor);
    if (!this.nodes.has(k)) {
      this.nodes.set(k, { x, y, floor, edges: [] });
    }
    return k;
  }

  addEdge(k1, k2, weight) {
    const n1 = this.nodes.get(k1);
    const n2 = this.nodes.get(k2);
    if (!n1 || !n2 || k1 === k2) return;
    if (!n1.edges.find(e => e.to === k2)) n1.edges.push({ to: k2, weight });
    if (!n2.edges.find(e => e.to === k1)) n2.edges.push({ to: k1, weight });
  }

  geoDistM(x1, y1, x2, y2) {
    const dx = (x2 - x1) * 111000 * Math.cos(y1 * Math.PI / 180);
    const dy = (y2 - y1) * 111000;
    return Math.sqrt(dx * dx + dy * dy);
  }

  buildFromGeoJSON(rdcChemin, ierChemin) {
    const buildFloor = (geojson, floor) => {
      for (const feat of geojson.features) {
        const coords = feat.geometry.coordinates;
        const apres = feat.properties.apres;
        const isTransition = apres && apres !== '' && apres !== floor;

        for (let i = 0; i < coords.length; i++) {
          const k = this.addNode(coords[i][0], coords[i][1], floor);
          if (i > 0) {
            const kPrev = this.nodeKey(coords[i-1][0], coords[i-1][1], floor);
            if (!this.nodes.has(kPrev)) continue;
            const dist = this.geoDistM(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
            // Stairs penalty: +30m equivalent so same-floor routes are preferred
            this.addEdge(kPrev, k, isTransition ? dist + 30 : dist);
          }
        }
      }
    };

    buildFloor(rdcChemin, 'RDC');
    buildFloor(ierChemin, '1ER');

    // Connect floors at staircase nodes: for each RDC segment with apres='1ER',
    // its last point is the staircase. Find the nearest 1ER node within 5m and link.
    for (const feat of rdcChemin.features) {
      if (feat.properties.apres !== '1ER') continue;
      const coords = feat.geometry.coordinates;
      const last = coords[coords.length - 1];
      const rdcKey = this.nodeKey(last[0], last[1], 'RDC');
      if (!this.nodes.has(rdcKey)) continue;

      // Find nearest 1ER node
      let bestKey = null, bestDist = Infinity;
      for (const [k, n] of this.nodes) {
        if (n.floor !== '1ER') continue;
        const d = this.geoDistM(last[0], last[1], n.x, n.y);
        if (d < bestDist) { bestDist = d; bestKey = k; }
      }
      if (bestKey && bestDist < 10) {
        // Staircase cost: 15m equivalent
        this.addEdge(rdcKey, bestKey, 15);
      }
    }
  }

  nearestNode(x, y, floor) {
    let best = null, bestDist = Infinity;
    for (const [k, n] of this.nodes) {
      if (n.floor !== floor) continue;
      const d = this.geoDistM(x, y, n.x, n.y);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    return best;
  }

  dijkstra(startKey, endKey) {
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    // Binary min-heap
    const heap = [];
    const heapPush = (cost, key) => {
      heap.push([cost, key]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
      }
    };
    const heapPop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        while (true) {
          let s = i, l = 2*i+1, r = 2*i+2;
          if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
          if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
          if (s === i) break;
          [heap[i], heap[s]] = [heap[s], heap[i]]; i = s;
        }
      }
      return top;
    };

    for (const k of this.nodes.keys()) dist.set(k, Infinity);
    dist.set(startKey, 0);
    heapPush(0, startKey);

    while (heap.length > 0) {
      const [cost, u] = heapPop();
      if (visited.has(u)) continue;
      visited.add(u);
      if (u === endKey) break;
      const node = this.nodes.get(u);
      if (!node) continue;
      for (const edge of node.edges) {
        const nc = cost + edge.weight;
        if (nc < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, nc);
          prev.set(edge.to, u);
          heapPush(nc, edge.to);
        }
      }
    }

    const path = [];
    let cur = endKey;
    while (cur !== undefined) {
      const node = this.nodes.get(cur);
      if (node) path.unshift({ x: node.x, y: node.y, floor: node.floor, key: cur });
      cur = prev.get(cur);
    }
    return path.length > 1 && path[0].key === startKey ? path : [];
  }

  findPath(fromRoom, toRoom, pointSalles) {
    const findPoint = (nom) => {
      for (const feat of pointSalles.features) {
        if (feat.properties.nom === nom) {
          return { x: feat.geometry.coordinates[0], y: feat.geometry.coordinates[1], floor: feat.properties.etage };
        }
      }
      return null;
    };

    const from = findPoint(fromRoom);
    const to   = findPoint(toRoom);
    if (!from || !to) return null;

    const startKey = this.nearestNode(from.x, from.y, from.floor);
    const endKey   = this.nearestNode(to.x,   to.y,   to.floor);
    if (!startKey || !endKey) return null;
    if (startKey === endKey) return { path: [this.nodes.get(startKey)], from, to };

    // Virtual nodes for exact room positions
    const SK = `__S__`, EK = `__E__`;
    this.nodes.set(SK, { x: from.x, y: from.y, floor: from.floor, edges: [{ to: startKey, weight: 0.1 }] });
    this.nodes.set(EK, { x: to.x,   y: to.y,   floor: to.floor,   edges: [] });
    const sn = this.nodes.get(startKey); if (sn) sn.edges.push({ to: SK, weight: 0.1 });
    const en = this.nodes.get(endKey);   if (en) en.edges.push({ to: EK, weight: 0.1 });

    const path = this.dijkstra(SK, EK);

    this.nodes.delete(SK); this.nodes.delete(EK);
    if (sn) sn.edges = sn.edges.filter(e => e.to !== SK);
    if (en) en.edges = en.edges.filter(e => e.to !== EK);

    return path.length > 1 ? { path, from, to } : null;
  }
}
