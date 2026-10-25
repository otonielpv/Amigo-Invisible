// Uso: `npm run dev` en otra terminal y luego `npm test` (BASE_URL opcional)
import assert from 'node:assert';
import { draw } from './src/draw.js';

for (let n = 0; n < 200; n++) {
  const ps = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, exclusions: [] }));
  ps[0].exclusions = ['b']; ps[1].exclusions = ['a']; ps[2].exclusions = ['d', 'e'];
  const r = draw(ps);
  assert(r);
  assert.strictEqual(new Set(Object.values(r)).size, 5);
  for (const p of ps) { assert.notStrictEqual(r[p.id], p.id); assert(!p.exclusions.includes(r[p.id])); }
}
assert.strictEqual(draw([{ id: 'a', exclusions: ['b'] }, { id: 'b', exclusions: [] }]), null);

const base = process.env.BASE_URL || 'http://localhost:8788';
const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) }); return { s: r.status, d: await r.json() }; };
const { d: { adminToken: t } } = await call('POST', '/api/groups', { name: 'Familia', budget: '20 €' });
let g;
for (const n of ['Ana', 'Luis', 'Eva']) g = (await call('POST', `/api/admin/${t}/participants`, { name: n })).d;
const [ana, luis] = g.participants;
assert.deepStrictEqual(g.participants.map(p => p.name), ['Ana', 'Luis', 'Eva']);
const bulk = await call('PUT', `/api/admin/${t}/exclusions`, { exclusions: { [ana.id]: [luis.id, ana.id, 'nope'], [luis.id]: [] } });
assert.deepStrictEqual(bulk.d.participants.find(p => p.id === ana.id).exclusions, [luis.id]);
const put = await call('PUT', `/api/e/${ana.editToken}`, { wishlist: [
  { title: 'Libro', url: 'https://x.es/l', details: 'Tapa dura', photo: 'data:image/jpeg;base64,AAAA' },
  { title: 'Malo', url: 'javascript:alert(1)', photo: 'data:text/html;base64,AAAA' }, {}] });
assert.strictEqual(put.d.wishlist.length, 2);
assert.strictEqual(put.d.wishlist[0].photo, 'data:image/jpeg;base64,AAAA');
assert.strictEqual(put.d.wishlist[1].url, ''); assert.strictEqual(put.d.wishlist[1].photo, '');
assert.strictEqual((await call('POST', `/api/admin/${t}/draw`)).d.drawn, true);
assert.notStrictEqual(ana.token, ana.editToken);
assert.strictEqual((await call('PUT', `/api/p/${ana.token}`, { wishlist: [{ title: 'x' }] })).s, 404); // el enlace de consulta no edita
assert.strictEqual((await call('GET', `/api/e/${ana.token}`)).s, 404);
assert.strictEqual((await call('GET', `/api/p/${ana.editToken}`)).s, 404);
assert.strictEqual((await call('GET', `/api/e/${ana.editToken}`)).d.target, undefined); // la edición no revela el sorteo
const seen = new Set();
for (const p of g.participants) {
  const d = (await call('GET', `/api/p/${p.token}`)).d;
  assert(d.target && d.target.name !== p.name); assert.strictEqual(d.budget, '20 €'); seen.add(d.target.name);
}
assert.strictEqual(seen.size, 3);
assert.notStrictEqual((await call('GET', `/api/p/${ana.token}`)).d.target.name, 'Luis');
// Quitar a alguien invalida el sorteo; borrar el grupo borra todo
const after = (await call('DELETE', `/api/admin/${t}/participants/${luis.id}`)).d;
assert.strictEqual(after.drawn, false); assert.strictEqual(after.participants.length, 2);
assert.strictEqual((await call('DELETE', `/api/admin/${t}`)).s, 200);
assert.strictEqual((await call('GET', `/api/p/${ana.token}`)).s, 404);
console.log('OK');
