import { draw } from './draw.js';

const MAX_GIFTS = 15, MAX_PHOTO = 250000, MAX_BODY = 5e6;
const token = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Regalos: [{ id, title, url, details, photo }]; la foto es un JPEG reducido en el navegador (data URL).
function cleanGifts(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_GIFTS).map(i => {
    const url = clean(i && i.url, 500);
    const photo = String((i && i.photo) || '');
    return {
      id: token(),
      title: clean(i && i.title, 100),
      url: /^https?:\/\//i.test(url) ? url : '',
      details: clean(i && i.details, 500),
      photo: /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) && photo.length <= MAX_PHOTO ? photo : '',
    };
  }).filter(i => i.title || i.url || i.details || i.photo);
}

let ready;
const init = db => ready ||= db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, admin_token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, budget TEXT NOT NULL DEFAULT '')`),
  db.prepare(`CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL, edit_token TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    wishlist TEXT NOT NULL DEFAULT '[]', exclusions TEXT NOT NULL DEFAULT '[]', target_id TEXT, created INTEGER NOT NULL)`),
  db.prepare(`CREATE INDEX IF NOT EXISTS participants_group ON participants (group_id)`),
]);

const parse = r => ({ ...r, wishlist: JSON.parse(r.wishlist), exclusions: JSON.parse(r.exclusions) });
const members = async (db, gid) => (await db.prepare('SELECT * FROM participants WHERE group_id = ? ORDER BY created, id').bind(gid).all()).results.map(parse);
const isDrawn = ps => ps.length > 0 && ps.every(p => p.target_id);
const resetDraw = (db, gid) => db.prepare('UPDATE participants SET target_id = NULL WHERE group_id = ?').bind(gid);

const adminView = async (db, g) => {
  const ps = await members(db, g.id);
  return {
    name: g.name, budget: g.budget, drawn: isDrawn(ps),
    participants: ps.map(p => ({ id: p.id, name: p.name, giftCount: p.wishlist.length, exclusions: p.exclusions, token: p.token, editToken: p.edit_token })),
  };
};

export async function handleApi(request, env) {
  const db = env.DB;
  if (!db) return json(500, { error: 'Falta la base de datos (binding DB)' });
  await init(db);
  const method = request.method, url = new URL(request.url).pathname.replace(/\/$/, '');
  let body = {};
  if (method === 'POST' || method === 'PUT') {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: 'Demasiado grande' });
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json(400, { error: 'JSON no válido' }); }
  }
  let m;

  // Contraseña opcional (secreto CREATE_PASSWORD) solo para crear grupos; los enlaces de las familias no la necesitan.
  if (method === 'GET' && url === '/api/config') return json(200, { passwordRequired: !!env.CREATE_PASSWORD });

  if (method === 'POST' && url === '/api/groups') {
    if (env.CREATE_PASSWORD && String(body.password ?? '') !== env.CREATE_PASSWORD) return json(403, { error: 'Contraseña incorrecta' });
    const name = clean(body.name, 60);
    if (!name) return json(400, { error: 'Falta el nombre' });
    const adminToken = token();
    await db.prepare('INSERT INTO groups (id, admin_token, name, budget) VALUES (?, ?, ?, ?)').bind(token(), adminToken, name, clean(body.budget, 20)).run();
    return json(200, { adminToken });
  }

  if ((m = url.match(/^\/api\/admin\/(\w+)(?:\/(draw|participants|exclusions)(?:\/(\w+))?)?$/))) {
    const g = await db.prepare('SELECT * FROM groups WHERE admin_token = ?').bind(m[1]).first();
    if (!g) return json(404, { error: 'Grupo no encontrado' });
    const [, , sub, pid] = m;

    if (!sub && method === 'GET') return json(200, await adminView(db, g));
    if (!sub && method === 'PUT') {
      g.name = clean(body.name, 60) || g.name; g.budget = clean(body.budget, 20);
      await db.prepare('UPDATE groups SET name = ?, budget = ? WHERE id = ?').bind(g.name, g.budget, g.id).run();
      return json(200, await adminView(db, g));
    }
    if (!sub && method === 'DELETE') {
      await db.batch([db.prepare('DELETE FROM participants WHERE group_id = ?').bind(g.id), db.prepare('DELETE FROM groups WHERE id = ?').bind(g.id)]);
      return json(200, {});
    }
    if (sub === 'participants' && !pid && method === 'POST') {
      const name = clean(body.name, 40);
      if (!name) return json(400, { error: 'Falta el nombre' });
      await db.batch([
        db.prepare('INSERT INTO participants (id, group_id, token, edit_token, name, created) VALUES (?, ?, ?, ?, ?, ?)').bind(token(), g.id, token(), token(), name, Date.now()),
        resetDraw(db, g.id),
      ]);
      return json(200, await adminView(db, g));
    }
    if (sub === 'participants' && pid) {
      const ps = await members(db, g.id);
      const p = ps.find(p => p.id === pid);
      if (!p) return json(404, { error: 'Participante no encontrado' });
      if (method === 'DELETE') {
        await db.batch([
          db.prepare('DELETE FROM participants WHERE id = ?').bind(pid),
          ...ps.filter(x => x.exclusions.includes(pid)).map(x => db.prepare('UPDATE participants SET exclusions = ? WHERE id = ?').bind(JSON.stringify(x.exclusions.filter(e => e !== pid)), x.id)),
          resetDraw(db, g.id),
        ]);
      } else if (method === 'PUT') {
        const stmts = [];
        const name = 'name' in body ? clean(body.name, 40) : '';
        if (name) stmts.push(db.prepare('UPDATE participants SET name = ? WHERE id = ?').bind(name, pid));
        if (Array.isArray(body.exclusions)) {
          const valid = new Set(ps.map(x => x.id));
          const ex = [...new Set(body.exclusions)].filter(e => valid.has(e) && e !== pid);
          stmts.push(db.prepare('UPDATE participants SET exclusions = ? WHERE id = ?').bind(JSON.stringify(ex), pid), resetDraw(db, g.id));
        }
        if (stmts.length) await db.batch(stmts);
      } else return json(405, { error: 'Método no permitido' });
      return json(200, await adminView(db, g));
    }
    // Exclusiones de todos a la vez: { exclusions: { [participanteId]: [ids que no puede regalar] } }
    if (sub === 'exclusions' && method === 'PUT') {
      const ps = await members(db, g.id);
      const valid = new Set(ps.map(x => x.id));
      const stmts = [];
      for (const p of ps) {
        const want = body.exclusions && body.exclusions[p.id];
        if (!Array.isArray(want)) continue;
        const ex = [...new Set(want)].filter(e => valid.has(e) && e !== p.id);
        if (JSON.stringify([...ex].sort()) !== JSON.stringify([...p.exclusions].sort()))
          stmts.push(db.prepare('UPDATE participants SET exclusions = ? WHERE id = ?').bind(JSON.stringify(ex), p.id));
      }
      if (stmts.length) await db.batch([...stmts, resetDraw(db, g.id)]);
      return json(200, await adminView(db, g));
    }
    if (sub === 'draw' && method === 'POST') {
      const ps = await members(db, g.id);
      if (ps.length < 2) return json(400, { error: 'Hacen falta al menos 2 participantes' });
      const r = draw(ps);
      if (!r) return json(400, { error: 'Con esas exclusiones no hay ningún sorteo posible. Quita alguna.' });
      await db.batch(ps.map(p => db.prepare('UPDATE participants SET target_id = ? WHERE id = ?').bind(r[p.id], p.id)));
      return json(200, await adminView(db, g));
    }
  }

  // Enlace de consulta (solo lectura): a quién regalo. No permite editar nada.
  if (method === 'GET' && (m = url.match(/^\/api\/p\/(\w+)$/))) {
    const row = await db.prepare('SELECT * FROM participants WHERE token = ?').bind(m[1]).first();
    if (!row) return json(404, { error: 'Enlace no válido' });
    const g = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(row.group_id).first();
    const drawn = isDrawn(await members(db, g.id));
    const t = drawn && row.target_id ? await db.prepare('SELECT * FROM participants WHERE id = ?').bind(row.target_id).first() : null;
    return json(200, {
      name: row.name, group: g.name, budget: g.budget, drawn,
      target: t ? { name: t.name, wishlist: JSON.parse(t.wishlist) } : null,
    });
  }

  // Enlace de edición: solo la propia lista de deseos. No revela el sorteo.
  if ((method === 'GET' || method === 'PUT') && (m = url.match(/^\/api\/e\/(\w+)$/))) {
    const row = await db.prepare('SELECT * FROM participants WHERE edit_token = ?').bind(m[1]).first();
    if (!row) return json(404, { error: 'Enlace no válido' });
    let wishlist = JSON.parse(row.wishlist);
    if (method === 'PUT') {
      wishlist = cleanGifts(body.wishlist);
      await db.prepare('UPDATE participants SET wishlist = ? WHERE id = ?').bind(JSON.stringify(wishlist), row.id).run();
    }
    const g = await db.prepare('SELECT * FROM groups WHERE id = ?').bind(row.group_id).first();
    return json(200, { name: row.name, group: g.name, budget: g.budget, wishlist });
  }
  return json(404, { error: 'No encontrado' });
}
