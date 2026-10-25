'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');

let db = { groups: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) {}
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
const token = () => crypto.randomBytes(12).toString('hex');

const findByAdmin = t => Object.values(db.groups).find(g => g.adminToken === t);
const findByPart = t => {
  for (const g of Object.values(db.groups)) {
    const p = g.participants.find(p => p.token === t);
    if (p) return { g, p };
  }
};

// Sorteo: cada uno regala a otro, nadie a sí mismo ni a sus excluidos.
// Backtracking aleatorio; devuelve null si es imposible.
function draw(participants) {
  const ids = participants.map(p => p.id);
  const banned = new Map(participants.map(p => [p.id, new Set([p.id, ...p.exclusions])]));
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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

const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const MAX_GIFTS = 15, MAX_PHOTO = 250000;
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
// Datos antiguos: la lista era un texto libre.
const gifts = p => Array.isArray(p.wishlist) ? p.wishlist : (p.wishlist ? [{ id: token(), title: p.wishlist, url: '', details: '', photo: '' }] : []);
const adminView = g => ({
  name: g.name, budget: g.budget, drawn: !!g.assignments,
  participants: g.participants.map(p => ({ id: p.id, name: p.name, giftCount: gifts(p).length, exclusions: p.exclusions, token: p.token })),
});

function route(method, url, body) {
  let m;
  if (method === 'POST' && url === '/api/groups') {
    const name = clean(body.name, 60);
    if (!name) return [400, { error: 'Falta el nombre' }];
    const g = { id: token(), adminToken: token(), name, budget: clean(body.budget, 20), participants: [], assignments: null };
    db.groups[g.id] = g; save();
    return [200, { adminToken: g.adminToken }];
  }
  if ((m = url.match(/^\/api\/admin\/(\w+)(?:\/(draw|participants)(?:\/(\w+))?)?$/))) {
    const g = findByAdmin(m[1]);
    if (!g) return [404, { error: 'Grupo no encontrado' }];
    const [, , sub, pid] = m;
    if (!sub && method === 'GET') return [200, adminView(g)];
    if (!sub && method === 'PUT') {
      const name = clean(body.name, 60);
      if (name) g.name = name;
      g.budget = clean(body.budget, 20);
      save(); return [200, adminView(g)];
    }
    if (!sub && method === 'DELETE') { delete db.groups[g.id]; save(); return [200, {}]; }
    if (sub === 'participants' && !pid && method === 'POST') {
      const name = clean(body.name, 40);
      if (!name) return [400, { error: 'Falta el nombre' }];
      g.participants.push({ id: token(), token: token(), name, wishlist: [], exclusions: [] });
      g.assignments = null; save(); return [200, adminView(g)];
    }
    if (sub === 'participants' && pid) {
      const p = g.participants.find(p => p.id === pid);
      if (!p) return [404, { error: 'Participante no encontrado' }];
      if (method === 'DELETE') {
        g.participants = g.participants.filter(x => x !== p);
        g.participants.forEach(x => { x.exclusions = x.exclusions.filter(e => e !== pid); });
        g.assignments = null;
      } else if (method === 'PUT') {
        if ('name' in body && clean(body.name, 40)) p.name = clean(body.name, 40);
        if ('exclusions' in body) {
          const valid = new Set(g.participants.map(x => x.id));
          p.exclusions = [...new Set(body.exclusions)].filter(e => valid.has(e) && e !== pid);
          g.assignments = null;
        }
      } else return [405, { error: 'Método no permitido' }];
      save(); return [200, adminView(g)];
    }
    if (sub === 'draw' && method === 'POST') {
      if (g.participants.length < 2) return [400, { error: 'Hacen falta al menos 2 participantes' }];
      const r = draw(g.participants);
      if (!r) return [400, { error: 'Con esas exclusiones no hay ningún sorteo posible. Quita alguna.' }];
      g.assignments = r; save(); return [200, adminView(g)];
    }
  }
  if ((m = url.match(/^\/api\/p\/(\w+)$/))) {
    const f = findByPart(m[1]);
    if (!f) return [404, { error: 'Enlace no válido' }];
    const { g, p } = f;
    if (method === 'PUT') { p.wishlist = cleanGifts(body.wishlist); save(); }
    const t = g.assignments && g.participants.find(x => x.id === g.assignments[p.id]);
    return [200, {
      name: p.name, group: g.name, budget: g.budget, wishlist: gifts(p), drawn: !!g.assignments,
      target: t ? { name: t.name, wishlist: gifts(t) } : null,
    }];
  }
  return [404, { error: 'No encontrado' }];
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 5e6) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) { res.writeHead(400); return res.end('{}'); }
      const [status, data] = route(req.method, url, body);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    });
    return;
  }
  const file = path.join(PUBLIC, ['/', '/index.html'].includes(url) || url.startsWith('/a/') || url.startsWith('/p/') ? 'index.html' : path.normalize(url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

if (require.main === module) server.listen(PORT, () => console.log(`Amigo invisible en http://localhost:${PORT}`));
module.exports = { server, draw };
