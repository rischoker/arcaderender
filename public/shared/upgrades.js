// Mejoras roguelike que otorgan las preguntas doradas (compartido servidor/cliente)
(function (root) {
  const list = {
    rate:     { icon: '⚡', name: 'Tight Strings',     desc: 'Ballistas shoot 20% faster' },
    dmg:      { icon: '🗡️', name: 'Steel Tips',        desc: 'Bolts deal +20% damage' },
    pierce:   { icon: '🎯', name: 'Piercing Bolts',    desc: 'Bolts go through +1 enemy' },
    fire:     { icon: '🔥', name: 'Fire Bolts',        desc: 'Bolts set enemies on fire' },
    range:    { icon: '🦅', name: 'Eagle Eye',         desc: 'Ballistas reach 20% farther' },
    armor:    { icon: '🛡️', name: 'Iron Walls',        desc: 'Walls take 20% less damage' },
    mason:    { icon: '🧱', name: 'Masons Guild',      desc: 'Walls slowly repair themselves' },
    carts:    { icon: '🛒', name: 'Bigger Carts',      desc: 'Villagers bring 40% more supplies' },
    blessing: { icon: '💖', name: 'Princess Blessing', desc: 'Repair every wall right now' },
    multi:    { icon: '🏹', name: 'Double Ballista',   desc: 'Every shot fires one more bolt', rare: true, max: 1 },
    catapult: { icon: '☄️', name: 'Tower Catapult',     desc: 'A catapult joins the defense', rare: true },
    frost:    { icon: '❄️', name: 'Frost Runes',       desc: 'Bolts slow enemies down', rare: true },
  };
  const api = { list };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UPGRADES = api;
})(typeof self !== 'undefined' ? self : this);
