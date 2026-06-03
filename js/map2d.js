/**
 * map2d.js – Leaflet 2D floor plan viewer
 */
window.MAP2D = (() => {
  let map, layerGroups = {}, labelLayer, currentFloor = 'rdc';
  let highlightFrom = null, highlightTo = null, pathLayer = null;

  function init() {
    map = L.map('map', {
      center: [48.11641, 5.14530],
      zoom: 19,
      maxZoom: 22,
      minZoom: 17,
      zoomControl: true,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 22,
    }).addTo(map);

    labelLayer = L.layerGroup().addTo(map);

    // Init layer groups for each floor
    ['rdc', '1er'].forEach(fl => {
      layerGroups[fl] = L.layerGroup();
    });

    map.on('click', () => APP && APP.onMapClick && APP.onMapClick());
  }

  function buildFloor(floor) {
    const lg = layerGroups[floor];
    lg.clearLayers();

    BLDG.BATS.forEach(bat => {
      const key = `${floor}_${bat}`;
      const gj  = BLDG.raw[key];
      if (!gj) return;

      gj.features.forEach(feat => {
        const p   = feat.properties;
        const typ = (p.type || '').toLowerCase();
        const nm  = p.name || '';
        const isFloor = typ.includes('étage') || typ.includes('etage');
        const coords  = feat.geometry.coordinates[0];
        const latlngs = coords.map(([lng, lat]) => [lat, lng]);

        const colors = BLDG.colorFor(bat, typ);

        if (isFloor) {
          // Floor outline
          L.polygon(latlngs, {
            color:       colors.stroke,
            fillColor:   colors.fill,
            weight:      2.5,
            fillOpacity: 0.25,
            opacity:     0.8,
            className:   'floor-outline',
          }).addTo(lg);
        } else {
          // Room
          const roomId = `${floor}_${bat}_${nm.replace(/\s+/g,'_')}`;
          const poly = L.polygon(latlngs, {
            color:       colors.stroke,
            fillColor:   colors.fill,
            weight:      1.5,
            fillOpacity: 0.55,
            opacity:     1,
            _roomId:     roomId,
          });

          poly.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            APP.onRoomClick(roomId);
          });

          poly.on('mouseover', () => {
            if (!poly._isHighlighted) {
              poly.setStyle({ fillOpacity: 0.8, weight: 2 });
            }
            const room = BLDG.getRoom(roomId);
            if (room) {
              poly.bindPopup(
                `<div style="font-family:var(--mono);font-size:12px">
                  <b style="color:var(--accent)">${nm}</b><br>
                  <span style="color:var(--text-muted)">${ucFirst(typ)} · Bât. ${bat} · ${floor === 'rdc' ? 'Rdc' : '1er étage'}</span>
                </div>`,
                { closeButton: false, offset: [0, -5] }
              ).openPopup();
            }
          });

          poly.on('mouseout', () => {
            if (!poly._isHighlighted) {
              poly.setStyle({ fillOpacity: 0.55, weight: 1.5 });
            }
            poly.closePopup();
          });

          poly._roomId = roomId;
          poly.addTo(lg);

          // Room label (only shown at high zoom)
          const ctr = BLDG.centroid(coords);
          const lbl = L.marker([ctr[1], ctr[0]], {
            icon: L.divIcon({
              className: 'room-label',
              html: `<span>${nm}</span>`,
              iconSize: null,
            }),
            interactive: false,
          });
          labelLayer.addLayer(lbl);
        }
      });
    });
  }

  function showFloor(floor) {
    currentFloor = floor;
    // Remove all floor layers
    ['rdc', '1er'].forEach(fl => {
      if (map.hasLayer(layerGroups[fl])) map.removeLayer(layerGroups[fl]);
    });
    layerGroups[floor].addTo(map);
  }

  function highlightRoom(roomId, role) {
    // role: 'from' | 'to' | null
    ['rdc', '1er'].forEach(fl => {
      layerGroups[fl].eachLayer(layer => {
        if (layer._roomId === roomId) {
          const col = role === 'from' ? '#3fb950' : '#f85149';
          layer._isHighlighted = true;
          layer.setStyle({
            color: col,
            fillColor: col,
            fillOpacity: 0.75,
            weight: 3,
          });
          layer.bringToFront();
        }
      });
    });
  }

  function clearHighlights() {
    ['rdc', '1er'].forEach(fl => {
      layerGroups[fl].eachLayer(layer => {
        if (layer._roomId) {
          const room = BLDG.getRoom(layer._roomId);
          if (!room) return;
          const colors = BLDG.colorFor(room.bat, room.type);
          layer._isHighlighted = false;
          layer.setStyle({
            color:       colors.stroke,
            fillColor:   colors.fill,
            fillOpacity: 0.55,
            weight:      1.5,
          });
        }
      });
    });
    if (pathLayer) { map.removeLayer(pathLayer); pathLayer = null; }
  }

  function drawPath2D(fromRoom, toRoom) {
    if (pathLayer) map.removeLayer(pathLayer);
    pathLayer = L.layerGroup().addTo(map);

    const fromCtr = fromRoom.center;
    const toCtr   = toRoom.center;

    // If same floor: straight line with midpoints
    if (fromRoom.floor === toRoom.floor) {
      const pts = [[fromCtr[1], fromCtr[0]], [toCtr[1], toCtr[0]]];
      L.polyline(pts, {
        color: '#ffd700',
        weight: 4,
        opacity: 0.9,
        dashArray: '8,6',
        lineCap: 'round',
      }).addTo(pathLayer);

      // Animated dot
      animateDotOnPath(pts);
    } else {
      // Cross-floor: go to staircase midpoint (corridor between bats)
      // Use a computed passage point near the center of the building
      const buildingCenter = [48.11641, 5.14520];
      const ptsA = [[fromCtr[1], fromCtr[0]], buildingCenter];
      const ptsB = [buildingCenter, [toCtr[1], toCtr[0]]];

      L.polyline([...ptsA, ...ptsB], {
        color: '#ffd700',
        weight: 4,
        opacity: 0.9,
        dashArray: '8,6',
        lineCap: 'round',
      }).addTo(pathLayer);
    }

    // Start / end markers
    L.circleMarker([fromCtr[1], fromCtr[0]], {
      radius: 8,
      color: '#3fb950',
      fillColor: '#3fb950',
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip('Départ', { permanent: false }).addTo(pathLayer);

    L.circleMarker([toCtr[1], toCtr[0]], {
      radius: 8,
      color: '#f85149',
      fillColor: '#f85149',
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip('Arrivée', { permanent: false }).addTo(pathLayer);
  }

  function animateDotOnPath(pts) {
    if (pts.length < 2) return;
    const p1 = pts[0], p2 = pts[1];
    const dot = L.circleMarker(p1, {
      radius: 6,
      color: '#fff',
      fillColor: '#ffd700',
      fillOpacity: 1,
      weight: 2,
    }).addTo(pathLayer);

    let t = 0;
    const duration = 2000;
    const start = performance.now();
    function frame(now) {
      t = Math.min((now - start) / duration, 1);
      const lat = p1[0] + (p2[0] - p1[0]) * t;
      const lng = p1[1] + (p2[1] - p1[1]) * t;
      dot.setLatLng([lat, lng]);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function panTo(room) {
    map.flyTo([room.center[1], room.center[0]], 20, { duration: 1 });
  }

  function panToFloor(floor) {
    // Fit to all bats of the floor
    const pts = [];
    BLDG.BATS.forEach(bat => {
      const key = `${floor}_${bat}`;
      const gj  = BLDG.raw[key];
      if (!gj) return;
      const outline = BLDG.floorOutline(key);
      if (outline) {
        outline.geometry.coordinates[0].forEach(([lng, lat]) => pts.push([lat, lng]));
      }
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40] });
  }

  function ucFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  return { init, buildFloor, showFloor, highlightRoom, clearHighlights, drawPath2D, panTo, panToFloor };
})();
