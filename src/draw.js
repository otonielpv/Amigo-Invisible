// Sorteo: cada uno regala a otro, nadie a sí mismo ni a sus excluidos.
// Backtracking aleatorio; devuelve null si es imposible.
const randInt = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function draw(participants) {
  const ids = participants.map(p => p.id);
  const banned = new Map(participants.map(p => [p.id, new Set([p.id, ...p.exclusions])]));
  const order = shuffle([...ids]).sort((a, b) => banned.get(b).size - banned.get(a).size);
  const used = new Set(), result = {};
  const go = i => {
    if (i === order.length) return true;
    const giver = order[i];
    for (const r of shuffle(ids.filter(x => !banned.get(giver).has(x) && !used.has(x)))) {
      used.add(r); result[giver] = r;
      if (go(i + 1)) return true;
      used.delete(r); delete result[giver];
    }
    return false;
  };
  return go(0) ? result : null;
}
