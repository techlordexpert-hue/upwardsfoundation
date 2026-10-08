const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SECRET = process.env.SECRET || 'dev-secret-change-me';
const mem = global.__m || (global.__m = {});
async function kv(cmd) {
  if (URL_) {
    const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK }, body: JSON.stringify(cmd) });
    const j = await r.json(); if (j.error) throw new Error('Storage error: ' + j.error); return j.result;
  }
  const [c, k, ...x] = cmd;
  switch (c) {
    case 'GET': return mem[k] ?? null; case 'SET': mem[k] = x[0]; return 'OK';
    case 'INCR': return (mem[k] = (+mem[k] || 0) + 1); case 'EXPIRE': return 1; case 'DEL': delete mem[k]; return 1;
    case 'HSET': (mem[k] = mem[k] || {})[x[0]] = x[1]; return 1; case 'HDEL': delete (mem[k] || {})[x[0]]; return 1;
    case 'HGET': return (mem[k] || {})[x[0]] ?? null; case 'HGETALL': return Object.entries(mem[k] || {}).flat();
  }
}
const hash = p => crypto.createHash('sha256').update('uf:' + p).digest('hex');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const uid = () => crypto.randomBytes(5).toString('hex');
const S = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const digits = p => String(p || '').replace(/\D/g, '');
const intl = p => { p = digits(p); return p.startsWith('0') ? '233' + p.slice(1) : p; };
const okPhone = p => { const d = digits(p); return d.length >= 9 && d.length <= 13; };
const today = () => new Date().toISOString().slice(0, 10);
const COLS = ['members', 'payments', 'expenses', 'news', 'slides', 'execs', 'messages'];
const FIELDS = { members: ['name', 'email', 'phone', 'gender', 'dob', 'occupation', 'location', 'ecName', 'ecPhone', 'photo', 'status'], payments: ['name', 'phone', 'type', 'amount', 'date', 'status'], expenses: ['desc', 'cat', 'amount', 'date', 'by'], news: ['cat', 'title', 'body', 'pinned', 'date'], slides: ['type', 'src', 'caption'], execs: ['name', 'position', 'bio', 'photo'], messages: ['read'] };
const list = async c => { const a = (await kv(['HGETALL', 'h:' + c])) || []; const o = []; for (let i = 0; i < a.length; i += 2) { try { o.push(JSON.parse(a[i + 1])); } catch {} } return o.sort((x, y) => (x.created || 0) - (y.created || 0)); };
const put = (c, o) => kv(['HSET', 'h:' + c, o.id, JSON.stringify(o)]);
const one = async (c, id) => { const r = await kv(['HGET', 'h:' + c, id]); return r ? JSON.parse(r) : null; };
const getPw = async () => { const r = await kv(['GET', 'pw']); return r ? JSON.parse(r) : { admin: hash('lord@123'), treasurer: hash('frema@123') }; };
const DEF = { momoName: 'Eric Baffoe', momoNumber: '0547710039', dues: 10, regFee: 20, whatsapp: 'https://whatsapp.com/channel/0029VbBZ3uo9mrGcpe6tBN40' };
const getSet = async () => ({ ...DEF, ...JSON.parse((await kv(['GET', 'settings'])) || '{}') });
const mk = (role, pw) => { const p = role + '.' + (Date.now() + 12 * 3600e3) + '.' + pw[role].slice(0, 8); return p + '.' + sign(p); };
const auth = (h, pw) => { const [r, e, t, s] = String(h || '').replace('Bearer ', '').split('.'); return s && pw[r] && sign(r + '.' + e + '.' + t) === s && +e > Date.now() && pw[r].slice(0, 8) === t ? r : null; };
const pick = (d, c) => { const o = {}; for (const k of FIELDS[c]) if (d[k] !== undefined) o[k] = typeof d[k] === 'string' ? d[k].trim().slice(0, 2000) : d[k]; if ('amount' in o) { o.amount = Number(o.amount); if (!(o.amount > 0 && o.amount <= 100000)) throw Object.assign(new Error('Amount must be between 1 and 100000'), { code: 400 }); } if (o.status && !['pending', 'verified', 'rejected', 'active', 'suspended'].includes(o.status)) throw Object.assign(new Error('Bad status'), { code: 400 }); return o; };

module.exports = async (req, res) => {
  const out = (d, c = 200) => res.status(c).json(d);
  try {
    res.setHeader('Cache-Control', 'no-store');
    const a = req.query.a, b = req.body && typeof req.body === 'object' ? req.body : {};
    if (a === 'img') {
      const d = await kv(['GET', 'img:' + S(req.query.id, 20).replace(/[^\w]/g, '')]);
      const m = d && d.match(/^data:(.+?);base64,(.*)$/); if (!m) return res.status(404).end();
      res.setHeader('Content-Type', m[1]); res.setHeader('Cache-Control', 'public,max-age=31536000,immutable'); return res.end(Buffer.from(m[2], 'base64'));
    }
    if (a === 'up') {
      const d = String(b.data || '');
      if (d.length > 900000) return out({ error: 'Image too large. Choose a smaller photo.' }, 413);
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) return out({ error: 'Invalid image' }, 400);
      const id = uid() + uid().slice(0, 2); await kv(['SET', 'img:' + id, d]); return out({ id });
    }
    const pw = await getPw(), role = auth(req.headers.authorization, pw);
    if (a === 'login') {
      const ip = 'lock:' + S(req.headers['x-forwarded-for'], 60).split(',')[0];
      if ((+(await kv(['GET', ip])) || 0) >= 8) return out({ error: 'Too many failed attempts. Try again in 15 minutes.' }, 429);
      const p = hash(S(b.password, 100)), r = p === pw.admin ? 'admin' : p === pw.treasurer ? 'treasurer' : null;
      if (!r) { await kv(['INCR', ip]); await kv(['EXPIRE', ip, 900]); return out({ error: 'Incorrect password' }, 401); }
      await kv(['DEL', ip]); return out({ token: mk(r, pw), role: r });
    }
    if (a === 'pub') {
      if (!(await kv(['GET', 'seeded']))) { await put('news', { id: uid(), created: Date.now(), cat: 'Announcement', title: 'Welcome to the Upwards Foundation Portal!', body: 'Members can now register, pay monthly dues and follow foundation news online.', date: today(), pinned: true }); await kv(['SET', 'seeded', '1']); }
      const [news, slides, execs, members, settings] = await Promise.all([list('news'), list('slides'), list('execs'), list('members'), getSet()]);
      return out({ news, slides, execs, settings, stats: { members: members.filter(m => m.status === 'active').length } });
    }
    if (a === 'reg' && req.method === 'POST') {
      if (S(b.name).length < 3 || !/^\S+@\S+\.\S+$/.test(S(b.email)) || !okPhone(b.phone)) return out({ error: 'Enter a valid name, email and phone number' }, 400);
      if (!/^\w{6,20}$/.test(S(b.photo, 20))) return out({ error: 'A passport photo is required' }, 400);
      if ((await list('members')).some(x => intl(x.phone) === intl(b.phone))) return out({ error: 'This phone number is already registered. Use "Get my ID card" below.' }, 409);
      const n = await kv(['INCR', 'seq:member']);
      const m = { id: 'MB-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0'), created: Date.now(), joined: today(), ...pick({ ...b, status: undefined }, 'members'), status: 'pending' };
      await put('members', m); return out(m);
    }
    if (a === 'card') {
      const m = (await list('members')).find(x => x.id === S(req.query.id, 20).toUpperCase() && intl(x.phone) === intl(req.query.phone));
      return m ? out(m) : out({ error: 'No member found with that ID and phone number' }, 404);
    }
    if (a === 'pay' && req.method === 'POST') {
      if (S(b.name).length < 3 || !okPhone(b.phone)) return out({ error: 'Enter a valid name and phone number' }, 400);
      const p = { id: uid(), created: Date.now(), ref: 'UF-' + Math.floor(1000 + Math.random() * 9000), ...pick({ name: b.name, phone: b.phone, amount: b.amount, date: S(b.date, 10) || today() }, 'payments'), type: b.type === 'donation' ? 'donation' : 'dues', status: 'pending' };
      await put('payments', p); return out(p);
    }
    if (a === 'support' && req.method === 'POST') {
      if (S(b.name).length < 2 || S(b.message).length < 3) return out({ error: 'Name and message are required' }, 400);
      await put('messages', { id: uid(), created: Date.now(), name: S(b.name, 80), phone: S(b.phone, 20), email: S(b.email, 80), subject: S(b.subject, 100), message: S(b.message, 2000), date: new Date().toISOString(), read: false });
      return out({ ok: true });
    }
    if (!role) return out({ error: 'Unauthorized' }, 401);
    if (a === 'admin') {
      const adm = role === 'admin', [members, payments, expenses, news, slides, execs, messages, settings] = await Promise.all(COLS.map(c => (adm || ['payments', 'expenses', 'news'].includes(c)) ? list(c) : []).concat(getSet()));
      return out({ role, members, payments, expenses, news, slides, execs, messages, settings, persistent: !!URL_, bms: !!(process.env.BMS_API_KEY && process.env.BMS_API_URL) });
    }
    if (a === 'op') {
      const ok = role === 'admin' ? COLS : ['payments', 'expenses'];
      if (!ok.includes(b.c)) return out({ error: 'Not permitted' }, 403);
      if (b.t === 'add') {
        const o = { id: uid(), created: Date.now(), ...pick(b.d || {}, b.c) };
        if (b.c === 'payments') { o.status = 'verified'; o.ref = 'CASH-' + uid().slice(0, 4).toUpperCase(); o.type = o.type === 'donation' ? 'donation' : 'dues'; }
        await put(b.c, o);
      } else if (b.t === 'set') {
        const o = await one(b.c, S(b.id, 30)); if (!o) return out({ error: 'Not found' }, 404);
        await put(b.c, { ...o, ...pick(b.d || {}, b.c), id: o.id });
      } else if (b.t === 'del') await kv(['HDEL', 'h:' + b.c, S(b.id, 30)]);
      else return out({ error: 'Bad operation' }, 400);
      return out({ ok: true });
    }
    if (a === 'settings') {
      if (role !== 'admin') return out({ error: 'Not permitted' }, 403);
      const s = { momoName: S(b.momoName, 80), momoNumber: S(b.momoNumber, 20), dues: +b.dues, regFee: +b.regFee, whatsapp: S(b.whatsapp, 300) };
      if (!(s.dues > 0) || !(s.regFee >= 0) || !/^https:\/\//.test(s.whatsapp) || !okPhone(s.momoNumber)) return out({ error: 'Check the settings values' }, 400);
      await kv(['SET', 'settings', JSON.stringify(s)]); return out({ ok: true });
    }
    if (a === 'pw') {
      if (role !== 'admin') return out({ error: 'Only the admin can change passwords' }, 403);
      if (hash(S(b.current, 100)) !== pw.admin) return out({ error: 'Your current admin password is incorrect' }, 403);
      if (!['admin', 'treasurer'].includes(b.who) || S(b.password, 100).length < 8) return out({ error: 'New password must be at least 8 characters' }, 400);
      pw[b.who] = hash(S(b.password, 100)); await kv(['SET', 'pw', JSON.stringify(pw)]); return out({ ok: true });
    }
    if (a === 'sms') {
      if (role !== 'admin') return out({ error: 'Not permitted' }, 403);
      const key = process.env.BMS_API_KEY, url = process.env.BMS_API_URL;
      if (!key || !url) return out({ error: 'Set BMS_API_KEY and BMS_API_URL in Vercel environment variables, then redeploy' }, 500);
      const msg = S(b.message, 640);
      const to = [...new Set((b.to === 'all' ? (await list('members')).filter(m => m.status === 'active').map(m => m.phone) : String(b.to).split(/[\s,;]+/)).filter(okPhone).map(intl))];
      if (!to.length || !msg) return out({ error: 'Add at least one valid recipient and a message' }, 400);
      const sender = process.env.BMS_SENDER_ID || 'Upwards';
      let tpl; try { tpl = JSON.parse(process.env.BMS_BODY || '{"key":"{key}","sender":"{sender}","recipient":"{to}","message":"{message}"}'); } catch { return out({ error: 'BMS_BODY is not valid JSON' }, 500); }
      const sub = v => typeof v !== 'string' ? v : v === '{to}' ? to : v === '{to_csv}' ? to.join(',') : v.replace('{key}', key).replace('{sender}', sender).replace('{message}', msg);
      const body = Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, sub(v)]));
      let extra = {}; try { extra = JSON.parse(process.env.BMS_HEADERS || '{}'); } catch {}
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
      try {
        const r = await fetch(url, { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, 'api-key': key, 'x-api-key': key, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v).replace('{key}', key)])) }, body: JSON.stringify(body) });
        return out({ sent: to.length, ok: r.ok, status: r.status, provider: (await r.text()).slice(0, 600) });
      } catch (e) { return out({ error: 'Could not reach the BMS server: ' + e.message }, 502); } finally { clearTimeout(t); }
    }
    out({ error: 'Unknown action' }, 404);
  } catch (e) { out({ error: e.message || 'Server error' }, e.code || 500); }
};
