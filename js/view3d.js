/**
 * view3d.js – Three.js 3D building + animated path camera
 */
window.VIEW3D = (() => {
  let renderer, scene, camera, animId;
  let isDragging = false, prevMouse = { x: 0, y: 0 };
  let theta = -0.7, phi = 1.0, radius = 55;
  let target = new THREE.Vector3(0, 0, 0);
  let rooms3d = {}; // roomId → mesh
  let pathMeshes = [], animState = null;
  let progressEl, playBtn;

  const FLOOR_HEIGHT  = 6;
  const ROOM_HEIGHT   = 3.5;
  const FLOOR_GAP     = 1.0; // visual gap between floors
  const WALL_COLOR    = 0x30363d;
  const FLOOR_BASE    = { rdc: 0, '1er': FLOOR_HEIGHT + FLOOR_GAP };

  // Project GeoJSON WGS84 → flat XZ (metres-ish)
  let originLng = 5.14530, originLat = 48.11641;
  const DEG_LNG = 111320 * Math.cos(48.11641 * Math.PI / 180); // m/deg lon
  const DEG_LAT = 110540;                                        // m/deg lat

  function lngLatToXZ(lng, lat) {
    return [
      (lng - originLng) * DEG_LNG,
      -(lat - originLat) * DEG_LAT,
    ];
  }

  function polygonToShape(ring) {
    const shape = new THREE.Shape();
    ring.forEach(([lng, lat], i) => {
      const [x, z] = lngLatToXZ(lng, lat);
      i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z);
    });
    shape.closePath();
    return shape;
  }

  function hexFromCss(cssVar) {
    // Convert hex string like '#58a6ff' to Three.js int
    const hex = cssVar.replace('#', '');
    return parseInt(hex, 16);
  }

  function init() {
    const canvas = document.getElementById('canvas3d');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.fog = new THREE.Fog(0x0d1117, 60, 130);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    updateCamera();

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8bbcff, 0.3);
    fill.position.set(-15, 20, -10);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(100, 40, 0x21262d, 0x1a1f26);
    grid.position.y = -0.05;
    scene.add(grid);

    setupControls(canvas);
    resize();
    window.addEventListener('resize', resize);

    progressEl = document.getElementById('progress-bar');
    playBtn    = document.getElementById('btn-play');
    if (playBtn) playBtn.addEventListener('click', () => replayAnim());

    render();
  }

  function buildAll() {
    // Clear previous room meshes
    Object.values(rooms3d).forEach(m => scene.remove(m));
    rooms3d = {};

    BLDG.FLOORS.forEach(floor => {
      const yBase = FLOOR_BASE[floor];

      BLDG.BATS.forEach(bat => {
        const key = `${floor}_${bat}`;
        const gj  = BLDG.raw[key];
        if (!gj) return;

        const colors = BLDG.COLORS[bat];

        gj.features.forEach(feat => {
          const p   = feat.properties;
          const typ = (p.type || '').toLowerCase();
          const nm  = p.name || '';
          const ring = feat.geometry.coordinates[0];
          const isFloorOutline = typ.includes('étage') || typ.includes('etage');

          if (isFloorOutline) {
            // Flat floor slab
            const shape = polygonToShape(ring);
            const geom  = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
            const mat   = new THREE.MeshLambertMaterial({
              color: hexFromCss(colors.stroke),
              transparent: true,
              opacity: 0.12,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = yBase;
            scene.add(mesh);

            // Outline
            const edges = new THREE.EdgesGeometry(geom);
            const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
              color: hexFromCss(colors.stroke),
              transparent: true,
              opacity: 0.6,
            }));
            line.rotation.x = -Math.PI / 2;
            line.position.y = yBase;
            scene.add(line);
          } else {
            // Room extrusion
            const roomColors = BLDG.colorFor(bat, typ);
            const shape = polygonToShape(ring);
            const geom  = new THREE.ExtrudeGeometry(shape, {
              depth: ROOM_HEIGHT,
              bevelEnabled: false,
            });

            const mat = new THREE.MeshLambertMaterial({
              color: hexFromCss(roomColors.fill.replace('#', '').length === 6 ? roomColors.fill : '#1a2d4a'),
              transparent: true,
              opacity: 0.7,
            });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = yBase + 0.15;
            mesh.receiveShadow = true;
            mesh.castShadow   = true;
            scene.add(mesh);

            // Edges (walls)
            const edges = new THREE.EdgesGeometry(geom);
            const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
              color: hexFromCss(roomColors.stroke),
              transparent: true,
              opacity: 0.85,
            }));
            line.rotation.x = -Math.PI / 2;
            line.position.y = yBase + 0.15;
            scene.add(line);

            const roomId = `${floor}_${bat}_${nm.replace(/\s+/g,'_')}`;
            rooms3d[roomId] = { mesh, line, mat, floor, bat, typ, nm };
          }
        });
      });
    });
  }

  function clearPathMeshes() {
    pathMeshes.forEach(m => scene.remove(m));
    pathMeshes = [];
    animState = null;
    document.getElementById('animation-bar').style.display = 'none';
  }

  function buildPath(fromRoom, toRoom) {
    clearPathMeshes();
    resetRoomColors();

    const fromY = FLOOR_BASE[fromRoom.floor] + ROOM_HEIGHT / 2 + 0.15;
    const toY   = FLOOR_BASE[toRoom.floor]   + ROOM_HEIGHT / 2 + 0.15;

    const [fx, fz] = lngLatToXZ(fromRoom.center[0], fromRoom.center[1]);
    const [tx, tz] = lngLatToXZ(toRoom.center[0],   toRoom.center[1]);

    // Highlight from/to rooms
    highlightRoom3d(fromRoom.id, '#3fb950');
    highlightRoom3d(toRoom.id,   '#f85149');

    // Build waypoints
    const waypoints = [];
    waypoints.push(new THREE.Vector3(fx, fromY, fz));

    if (fromRoom.floor !== toRoom.floor) {
      // Staircase: go to corridor, go up, continue
      const midX = (fx + tx) / 2;
      const midZ = (fz + tz) / 2;
      waypoints.push(new THREE.Vector3(midX, fromY, midZ));
      waypoints.push(new THREE.Vector3(midX, toY,   midZ));
    }
    waypoints.push(new THREE.Vector3(tx, toY, tz));

    // Smooth curve
    const curve = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.5);
    const pts3  = curve.getPoints(120);

    // Tube path
    const tubeGeom = new THREE.TubeGeometry(curve, 60, 0.10, 8, false);
    const tubeMat  = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.85 });
    const tube     = new THREE.Mesh(tubeGeom, tubeMat);
    scene.add(tube);
    pathMeshes.push(tube);

    // Sphere at start
    addSphere(new THREE.Vector3(fx, fromY, fz), 0x3fb950, 0.4);
    // Sphere at end
    addSphere(new THREE.Vector3(tx, toY, tz), 0xf85149, 0.4);

    // If cross-floor, sphere at staircase point
    if (fromRoom.floor !== toRoom.floor) {
      const mid = waypoints[1];
      addSphere(new THREE.Vector3(mid.x, mid.y, mid.z), 0xffa657, 0.3);
      addStaircaseVisual(new THREE.Vector3(mid.x, FLOOR_BASE[fromRoom.floor], mid.z),
                         new THREE.Vector3(mid.x, FLOOR_BASE[toRoom.floor] + ROOM_HEIGHT/2, mid.z));
    }

    // Start camera animation
    animState = {
      points: pts3,
      idx: 0,
      playing: true,
      startTime: performance.now(),
      duration: 4000 + pts3.length * 8,
    };

    document.getElementById('animation-bar').style.display = 'flex';

    // Fly camera to overview
    flyToOverview(fromRoom, toRoom);
  }

  function addSphere(pos, color, r = 0.35) {
    const g = new THREE.SphereGeometry(r, 16, 16);
    const m = new THREE.MeshLambertMaterial({ color });
    const s = new THREE.Mesh(g, m);
    s.position.copy(pos);
    scene.add(s);
    pathMeshes.push(s);

    // Pulsing ring
    const rg = new THREE.RingGeometry(r + 0.1, r + 0.3, 32);
    const rm = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const rs = new THREE.Mesh(rg, rm);
    rs.position.copy(pos);
    rs.rotation.x = -Math.PI / 2;
    rs._pulse = true;
    scene.add(rs);
    pathMeshes.push(rs);
    return s;
  }

  function addStaircaseVisual(bot, top) {
    // Small helical indicator
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t  = i / steps;
      const y  = bot.y + (top.y - bot.y) * t;
      const angle = t * Math.PI * 2;
      const g = new THREE.BoxGeometry(0.6, 0.1, 0.3);
      const m = new THREE.MeshLambertMaterial({ color: 0xffa657, transparent: true, opacity: 0.7 });
      const s = new THREE.Mesh(g, m);
      s.position.set(bot.x + Math.cos(angle) * 0.4, y, bot.z + Math.sin(angle) * 0.4);
      scene.add(s);
      pathMeshes.push(s);
    }
  }

  function highlightRoom3d(roomId, colorHex) {
    const r = rooms3d[roomId];
    if (!r) return;
    r.mat.color.set(parseInt(colorHex.replace('#',''), 16));
    r.mat.opacity = 0.85;
  }

  function resetRoomColors() {
    Object.entries(rooms3d).forEach(([id, r]) => {
      const room = BLDG.getRoom(id);
      if (!room) return;
      const col = BLDG.colorFor(room.bat, room.type);
      try {
        r.mat.color.set(parseInt(col.fill.replace('#',''), 16));
      } catch(e) {}
      r.mat.opacity = 0.7;
    });
  }

  function flyToOverview(fromRoom, toRoom) {
    const [fx, fz] = lngLatToXZ(fromRoom.center[0], fromRoom.center[1]);
    const [tx, tz] = lngLatToXZ(toRoom.center[0],   toRoom.center[1]);
    const cx = (fx + tx) / 2, cz = (fz + tz) / 2;
    target.set(cx, FLOOR_HEIGHT / 2, cz);

    const dist = Math.sqrt((fx-tx)**2 + (fz-tz)**2) + 20;
    radius = Math.max(30, dist);
    theta  = -0.8;
    phi    = 1.1;
    updateCamera();
  }

  function replayAnim() {
    if (!animState) return;
    animState.idx  = 0;
    animState.playing = true;
    animState.startTime = performance.now();
    if (progressEl) progressEl.style.width = '0%';
  }

  function updateCamera() {
    const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.set(x, y, z);
    camera.lookAt(target);
  }

  // Moving dot along path
  let movingDot;
  function ensureMovingDot() {
    if (!movingDot) {
      const g = new THREE.SphereGeometry(0.3, 16, 16);
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      movingDot = new THREE.Mesh(g, m);
      scene.add(movingDot);
    }
  }

  function render() {
    animId = requestAnimationFrame(render);
    const t = performance.now();

    // Pulse rings
    scene.traverse(o => {
      if (o._pulse) o.material.opacity = 0.3 + 0.2 * Math.sin(t * 0.003);
    });

    // Animate moving dot
    if (animState && animState.playing && animState.points.length > 1) {
      ensureMovingDot();
      const elapsed = t - animState.startTime;
      const progress = Math.min(elapsed / animState.duration, 1);
      const idx = Math.floor(progress * (animState.points.length - 1));
      const pt  = animState.points[idx];
      movingDot.position.copy(pt);
      movingDot.visible = true;
      if (progressEl) progressEl.style.width = (progress * 100).toFixed(1) + '%';
      if (progress >= 1) {
        animState.playing = false;
        if (progressEl) progressEl.style.width = '100%';
      }
    } else if (movingDot) {
      movingDot.visible = animState != null;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    const container = document.getElementById('view3d-container');
    if (!container || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ── ORBITAL CONTROLS ──────────────────────────────────────────
  function setupControls(canvas) {
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      theta -= dx * 0.008;
      phi   = Math.max(0.15, Math.min(Math.PI * 0.48, phi + dy * 0.008));
      prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    });
    canvas.addEventListener('mouseup',   () => isDragging = false);
    canvas.addEventListener('mouseleave',() => isDragging = false);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      radius = Math.max(8, Math.min(120, radius + e.deltaY * 0.05));
      updateCamera();
    }, { passive: false });

    // Touch
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx*dx + dy*dy);
      }
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - prevMouse.x;
        const dy = e.touches[0].clientY - prevMouse.y;
        theta -= dx * 0.008;
        phi   = Math.max(0.15, Math.min(Math.PI * 0.48, phi + dy * 0.008));
        prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateCamera();
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        radius = Math.max(8, Math.min(120, radius - (dist - lastTouchDist) * 0.05));
        lastTouchDist = dist;
        updateCamera();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => isDragging = false);
  }

  return { init, buildAll, buildPath, clearPathMeshes, resize };
})();
