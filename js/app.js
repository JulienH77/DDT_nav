/**
 * app.js – Application controller
 */
window.APP = (() => {
  let selFrom = null, selTo = null;
  let currentFloor = 'rdc';
  let currentView  = 'map'; // 'map' | '3d'

  async function init() {
    // Load all data
    await BLDG.loadAll();

    // Populate selects
    populateSelects();

    // Init 2D map
    MAP2D.init();
    buildAndShowFloor('rdc');

    // Init 3D
    VIEW3D.init();

    // Wire UI
    document.getElementById('btn-go').addEventListener('click', onGo);
    document.getElementById('btn-reset').addEventListener('click', onReset);

    document.querySelectorAll('.ftab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchView(btn.dataset.floor);
      });
    });

    document.getElementById('info-close').addEventListener('click', () => {
      document.getElementById('info-panel').style.display = 'none';
    });

    document.getElementById('sel-from').addEventListener('change', function() {
      selFrom = this.value || null;
    });
    document.getElementById('sel-to').addEventListener('change', function() {
      selTo = this.value || null;
    });
  }

  function populateSelects() {
    const fromSel = document.getElementById('sel-from');
    const toSel   = document.getElementById('sel-to');

    // Group by floor then bat
    const groups = {};
    BLDG.rooms.forEach(r => {
      const gKey = `${r.floor === 'rdc' ? 'Rez-de-chaussée' : '1er Étage'} – Bâtiment ${r.bat}`;
      if (!groups[gKey]) groups[gKey] = [];
      groups[gKey].push(r);
    });

    [fromSel, toSel].forEach(sel => {
      // Keep placeholder
      while (sel.options.length > 1) sel.remove(1);

      Object.entries(groups).forEach(([label, rooms]) => {
        const og = document.createElement('optgroup');
        og.label = label;
        rooms.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.id;
          opt.textContent = r.name + (r.type && !r.type.includes('bureau') ? ` (${r.type})` : '');
          og.appendChild(opt);
        });
        sel.appendChild(og);
      });
    });
  }

  function buildAndShowFloor(floor) {
    MAP2D.buildFloor(floor);
    MAP2D.showFloor(floor);
    MAP2D.panToFloor(floor);
    currentFloor = floor;
  }

  function switchView(floorOrAll) {
    const mapContainer   = document.getElementById('map-container');
    const view3dContainer = document.getElementById('view3d-container');

    if (floorOrAll === 'all') {
      // 3D view
      currentView = '3d';
      mapContainer.style.display   = 'none';
      view3dContainer.style.display = 'block';
      VIEW3D.buildAll();
      VIEW3D.resize();

      // If there's a route, draw it
      if (selFrom && selTo) {
        const r = ROUTER.route(selFrom, selTo);
        if (r) VIEW3D.buildPath(r.fromRoom, r.toRoom);
      }
    } else {
      currentView = 'map';
      mapContainer.style.display   = 'block';
      view3dContainer.style.display = 'none';

      currentFloor = floorOrAll;
      buildAndShowFloor(floorOrAll);

      // Re-apply highlights
      if (selFrom && selTo) {
        const r = ROUTER.route(selFrom, selTo);
        if (r) {
          applyRoute2D(r);
        }
      }
    }
  }

  function onGo() {
    if (!selFrom || !selTo) {
      toast('⚠️ Sélectionnez un bureau de départ et un bureau de destination.');
      return;
    }
    if (selFrom === selTo) {
      toast('ℹ️ Vous êtes déjà dans ce bureau !');
      return;
    }

    const result = ROUTER.route(selFrom, selTo);
    if (!result) { toast('Erreur de routage.'); return; }

    showInfoPanel(result);

    if (currentView === 'map') {
      // Show the departure floor first
      const targetFloor = result.fromRoom.floor;
      if (currentFloor !== targetFloor) {
        document.querySelectorAll('.ftab').forEach(b => {
          b.classList.toggle('active', b.dataset.floor === targetFloor);
        });
        buildAndShowFloor(targetFloor);
      }
      applyRoute2D(result);
      toast('✅ Itinéraire tracé !');
    } else {
      // Switch to 3D
      VIEW3D.buildAll();
      VIEW3D.buildPath(result.fromRoom, result.toRoom);
      toast('✅ Animation 3D lancée !');
    }
  }

  function applyRoute2D(result) {
    MAP2D.clearHighlights();
    MAP2D.highlightRoom(result.fromRoom.id, 'from');
    MAP2D.highlightRoom(result.toRoom.id,   'to');
    MAP2D.drawPath2D(result.fromRoom, result.toRoom);
    // Pan to departure
    MAP2D.panTo(result.fromRoom);
  }

  function onReset() {
    selFrom = null; selTo = null;
    document.getElementById('sel-from').value = '';
    document.getElementById('sel-to').value   = '';
    MAP2D.clearHighlights();
    VIEW3D.clearPathMeshes();
    document.getElementById('info-panel').style.display = 'none';
  }

  function onRoomClick(roomId) {
    // Clicking a room selects it as from or to
    const room = BLDG.getRoom(roomId);
    if (!room) return;

    if (!selFrom) {
      selFrom = roomId;
      document.getElementById('sel-from').value = roomId;
      MAP2D.highlightRoom(roomId, 'from');
      toast(`Départ : ${room.name}`);
    } else if (!selTo && roomId !== selFrom) {
      selTo = roomId;
      document.getElementById('sel-to').value = roomId;
      MAP2D.highlightRoom(roomId, 'to');
      toast(`Destination : ${room.name}`);
      // Auto-go
      setTimeout(onGo, 300);
    } else {
      // Reset and start over
      onReset();
      selFrom = roomId;
      document.getElementById('sel-from').value = roomId;
      MAP2D.highlightRoom(roomId, 'from');
      toast(`Départ : ${room.name}`);
    }
  }

  function onMapClick() {
    // Clicking the map background does nothing special
  }

  function showInfoPanel(result) {
    const panel     = document.getElementById('info-panel');
    const titleEl   = document.getElementById('info-title');
    const stepsEl   = document.getElementById('info-steps');

    titleEl.textContent = `${result.fromRoom.name} → ${result.toRoom.name}`;
    stepsEl.innerHTML = '';

    const icons = { start: '🟢', walk: '🚶', stairs: '🪜', end: '🔴' };

    result.steps.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'step-item';

      const numEl = document.createElement('div');
      numEl.className = 'step-num' + (step.type === 'end' ? ' end' : '');
      numEl.textContent = i + 1;

      const txtEl = document.createElement('div');
      txtEl.className = 'step-text';
      txtEl.innerHTML = `${icons[step.type] || '•'} ${step.text}<br><small style="color:var(--text-muted)">${step.sub}</small>`;

      div.appendChild(numEl);
      div.appendChild(txtEl);
      stepsEl.appendChild(div);

      // Separator
      if (i < result.steps.length - 1) {
        const line = document.createElement('div');
        line.className = 'step-line';
        stepsEl.appendChild(line);
      }
    });

    panel.style.display = 'block';
  }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  return { init, onRoomClick, onMapClick };
})();

document.addEventListener('DOMContentLoaded', () => APP.init());
