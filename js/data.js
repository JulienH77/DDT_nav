/**
 * data.js – Loads all GeoJSON layers and builds the room catalogue
 */

window.BLDG = {
  // Raw GeoJSON (populated after load)
  raw: {},

  // All navigable rooms: { id, name, floor, bat, type, center, polygon }
  rooms: [],

  // Floors
  FLOORS: ['rdc', '1er'],
  BATS:   ['A', 'B', 'C'],

  // Color palette
  COLORS: {
    A:     { fill: '#1a2d4a', stroke: '#58a6ff' },
    B:     { fill: '#2e1e0f', stroke: '#ffa657' },
    C:     { fill: '#220d36', stroke: '#bc8cff' },
    WC:    { fill: '#0d2016', stroke: '#3fb950' },
    salle: { fill: '#1e1408', stroke: '#ffa657' },
    path:  '#ffd700',
    start: '#3fb950',
    end:   '#f85149',
    floor: { rdc: 0.18, '1er': 0.25 },
  },

  /**
   * Returns the color for a given bat / type
   */
  colorFor(bat, type) {
    const t = (type || '').toLowerCase();
    if (t.includes('wc') || t.includes('toilet')) return this.COLORS.WC;
    if (t.includes('salle') || t.includes('réunion') || t.includes('annexe') || t.includes('local') || t.includes('archive') || t.includes('serveur'))
      return this.COLORS.salle;
    return this.COLORS[bat] || this.COLORS.A;
  },

  /**
   * Compute centroid of a polygon ring
   */
  centroid(ring) {
    let x = 0, y = 0;
    ring.forEach(([lng, lat]) => { x += lng; y += lat; });
    return [x / ring.length, y / ring.length];
  },

  /**
   * Load all GeoJSON files via fetch
   */
  async loadAll() {
    const files = [
      { key: 'rdc_A',  floor: 'rdc', bat: 'A', url: 'data/rdc_bat_A.geojson' },
      { key: 'rdc_B',  floor: 'rdc', bat: 'B', url: 'data/rdc_bat_B.geojson' },
      { key: 'rdc_C',  floor: 'rdc', bat: 'C', url: 'data/rdc_bat_C.geojson' },
      { key: '1er_A',  floor: '1er', bat: 'A', url: 'data/1er_bat_A.geojson' },
      { key: '1er_B',  floor: '1er', bat: 'B', url: 'data/1er_bat_B.geojson' },
      { key: '1er_C',  floor: '1er', bat: 'C', url: 'data/1er_bat_C.geojson' },
    ];

    await Promise.all(files.map(async f => {
      const res = await fetch(f.url);
      const gj  = await res.json();
      this.raw[f.key] = { ...gj, _floor: f.floor, _bat: f.bat };

      gj.features.forEach(feat => {
        const p   = feat.properties;
        const typ = (p.type || '').toLowerCase();
        const nm  = p.name || '';
        const ring = feat.geometry.coordinates[0];
        const ctr  = this.centroid(ring);

        // Only register navigable rooms (not the floor outline itself)
        const isFloor = typ.includes('étage') || typ.includes('etage');
        if (!isFloor) {
          const id = `${f.floor}_${f.bat}_${nm.replace(/\s+/g,'_')}`;
          this.rooms.push({
            id,
            name: nm,
            floor: f.floor,
            bat:   f.bat,
            type:  typ,
            center: ctr,
            polygon: ring,
            geoKey: f.key,
          });
        }
      });
    }));

    // Sort rooms: floor first, then bat, then name
    this.rooms.sort((a, b) => {
      if (a.floor !== b.floor) return a.floor === 'rdc' ? -1 : 1;
      if (a.bat   !== b.bat)   return a.bat.localeCompare(b.bat);
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Get room by id
   */
  getRoom(id) { return this.rooms.find(r => r.id === id); },

  /**
   * Get all rooms on a floor
   */
  floorRooms(floor) { return this.rooms.filter(r => r.floor === floor); },

  /**
   * Get floor outline feature for a given floor+bat key
   */
  floorOutline(key) {
    const gj = this.raw[key];
    if (!gj) return null;
    return gj.features.find(f => {
      const t = (f.properties.type || '').toLowerCase();
      return t.includes('étage') || t.includes('etage');
    });
  },

  /**
   * Get features for a floor (all bats)
   */
  floorFeatures(floor) {
    return this.BATS.flatMap(bat => {
      const gj = this.raw[`${floor}_${bat}`];
      return gj ? gj.features : [];
    });
  },
};
