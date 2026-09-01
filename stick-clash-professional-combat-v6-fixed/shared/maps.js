/**
 * Single-plane 1v1 arena. No platforms, pits, holes or ring-outs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameMaps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const rooftop = {
    id: 'rooftop',
    name: 'Shadow Dojo',
    theme: {
      sky: ['#15171a', '#090a0c'],
      accent: '#25282c',
      fog: 'rgba(255,255,255,0.035)',
    },
    // One uninterrupted fighting plane. Characters can never fall through it.
    platforms: [
      { x: 0, y: 600, w: 1280, h: 120, kind: 'ground' },
    ],
    hazards: [],
    spawnPoints: [
      { x: 250, y: 516 },
      { x: 996, y: 516 },
    ],
    killPlaneY: 1000,
    width: 1280,
    height: 720,
  };

  return { rooftop, getMap(id) { return rooftop; } };
});
