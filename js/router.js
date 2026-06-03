/**
 * router.js – Path computation between rooms
 * Handles same-floor and cross-floor routing
 */
window.ROUTER = (() => {

  /**
   * Build a route description from room A to room B
   * Returns { steps: [...], sameBat, sameFloor, fromRoom, toRoom }
   */
  function route(fromId, toId) {
    const from = BLDG.getRoom(fromId);
    const to   = BLDG.getRoom(toId);
    if (!from || !to) return null;

    const steps = [];
    const sameBat   = from.bat   === to.bat;
    const sameFloor = from.floor === to.floor;

    steps.push({
      type: 'start',
      text: `Départ depuis <strong>${from.name}</strong>`,
      sub:  `Bât. ${from.bat} – ${floorLabel(from.floor)}`,
    });

    if (sameFloor && sameBat) {
      steps.push({
        type: 'walk',
        text: `Suivre le couloir jusqu'à <strong>${to.name}</strong>`,
        sub:  `Même bâtiment, même niveau`,
      });
    } else if (sameFloor && !sameBat) {
      steps.push({
        type: 'walk',
        text: `Se diriger vers le Bâtiment ${to.bat}`,
        sub:  `Traverser la liaison entre bâtiments`,
      });
      steps.push({
        type: 'walk',
        text: `Entrer dans le Bât. ${to.bat} et rejoindre <strong>${to.name}</strong>`,
        sub:  `${floorLabel(to.floor)}`,
      });
    } else if (!sameFloor && sameBat) {
      const goUp = to.floor === '1er';
      steps.push({
        type: 'stairs',
        text: `${goUp ? 'Monter' : 'Descendre'} au ${floorLabel(to.floor)}`,
        sub:  `Escalier / ascenseur Bât. ${from.bat}`,
      });
      steps.push({
        type: 'walk',
        text: `Rejoindre <strong>${to.name}</strong>`,
        sub:  `Bât. ${to.bat} – ${floorLabel(to.floor)}`,
      });
    } else {
      // Different floor AND different bat
      const goUp = to.floor === '1er';
      if (from.floor === 'rdc') {
        steps.push({
          type: 'walk',
          text: `Se diriger vers la cage d'escalier centrale`,
          sub:  `Rdc`,
        });
        steps.push({
          type: 'stairs',
          text: `${goUp ? 'Monter' : 'Descendre'} au ${floorLabel(to.floor)}`,
          sub:  `Escalier central`,
        });
        steps.push({
          type: 'walk',
          text: `Rejoindre le Bât. ${to.bat}`,
          sub:  `${floorLabel(to.floor)}`,
        });
      } else {
        steps.push({
          type: 'stairs',
          text: `${goUp ? 'Monter' : 'Descendre'} au ${floorLabel(to.floor)}`,
          sub:  `Escalier Bât. ${from.bat}`,
        });
        steps.push({
          type: 'walk',
          text: `Se diriger vers le Bât. ${to.bat}`,
          sub:  `${floorLabel(to.floor)}`,
        });
      }
      steps.push({
        type: 'walk',
        text: `Entrer dans le Bât. ${to.bat} et rejoindre <strong>${to.name}</strong>`,
        sub:  `${floorLabel(to.floor)}`,
      });
    }

    steps.push({
      type: 'end',
      text: `Arrivée à <strong>${to.name}</strong>`,
      sub:  `Bât. ${to.bat} – ${floorLabel(to.floor)}`,
    });

    return { steps, sameBat, sameFloor, fromRoom: from, toRoom: to };
  }

  function floorLabel(fl) {
    return fl === 'rdc' ? 'Rez-de-chaussée' : '1er Étage';
  }

  return { route, floorLabel };
})();
