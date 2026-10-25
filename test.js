const assert = require('assert');
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), `ai-test-${process.pid}.json`);
const { server, draw } = require('./server');

// Sorteo: nadie a sí mismo, respeta exclusiones, es biyectivo
for (let n = 0; n < 200; n++) {
  const ps = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, exclusions: [] }));
  ps[0].exclusions = ['b']; ps[1].exclusions = ['a']; ps[2].exclusions = ['d', 'e'];
  const r = draw(ps);
  assert(r);
  assert.strictEqual(new Set(Object.values(r)).size, 5);
  for (const p of ps) { assert.notStrictEqual(r[p.id], p.id); assert(!p.exclusions.includes(r[p.id])); }
}
assert.strictEqual(draw([{ id: 'a', exclusions: ['b'] }, { id: 'b', exclusions: [] }]), null);

// API
server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const call = async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b && JSON.stringify(b) }); return { s: r.status, d: await r.json() }; };
  const { d: { adminToken: t } } = await call('POST', '/api/groups', { name: 'Familia', budget: '20 €' });
  let g;
  for (const n of ['Ana', 'Luis', 'Eva']) g = (await call('POST', `/api/admin/${t}/participants`, { name: n })).d;
  const [ana, luis] = g.participants;
  await call('PUT', `/api/admin/${t}/participants/${ana.id}`, { wishlist: 'Libro', exclusions: [luis.id] });
  assert.strictEqual((await call('POST', `/api/admin/${t}/draw`)).d.drawn, true);
  const seen = new Set();
  for (const p of g.participants) {
    const d = (await call('GET', `/api/p/${p.token}`)).d;
    assert(d.target && d.target.name !== p.name); assert.strictEqual(d.budget, '20 €'); seen.add(d.target.name);
  }
  assert.strictEqual(seen.size, 3);
  assert.notStrictEqual((await call('GET', `/api/p/${ana.token}`)).d.target.name, 'Luis');
  assert.strictEqual((await call('GET', `/api/admin/${t}`)).d.participants[0].assignment, undefined);
  console.log('OK'); server.close(); require('fs').rmSync(process.env.DATA_FILE, { force: true });
});
