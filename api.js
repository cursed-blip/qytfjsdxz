// api/api.js  — Vercel serverless handler
// Note: persistent storage requires SUPABASE_URL + SUPABASE_KEY env vars (optional).
const textJson = (res, obj, code=200) => { res.status(code).setHeader('content-type','application/json'); res.end(JSON.stringify(obj)); };

const SUPA_URL = process.env.SUPABASE_URL || null; // https://xxx.supabase.co
const SUPA_KEY = process.env.SUPABASE_KEY || null;

// In-memory fallback (ephemeral on serverless)
let store = {
  banlist: [], // array of ips
  logs: [],    // {t,txt}
  calls: 0,
  blocked: 0
};

// helper to record a log
function pushLog(txt) {
  const entry = { t: new Date().toISOString(), txt };
  store.logs.unshift(entry);
  if (store.logs.length > 500) store.logs.pop();
}

// Supabase helper
async function supabaseInsert(table, obj) {
  if (!SUPA_URL || !SUPA_KEY) throw new Error('no supabase');
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
    body: JSON.stringify(obj)
  });
  const text = await res.text();
  if (!res.ok) throw new Error('supabase error: ' + text);
  return text;
}

export default async function handler(req, res) {
  // simple CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return textJson(res, { ok: true }, 200);

  const url = req.url || '';
  const method = req.method || 'GET';
  // quick health
  if (url.startsWith('/api/status') && method === 'GET') {
    return textJson(res, { ok: true, now: new Date().toISOString(), supabase: !!(SUPA_URL && SUPA_KEY) });
  }

  // Stats
  if (url.startsWith('/api/stats') && method === 'GET') {
    store.calls = (store.calls || 0);
    return textJson(res, { calls: store.calls, blocked: store.blocked||0, banlist: store.banlist||[], logs: store.logs||[] });
  }

  // banlist
  if (url.startsWith('/api/banlist') && method === 'GET') {
    return textJson(res, { banlist: store.banlist || [] });
  }

  // block ip
  if (url.startsWith('/api/block') && method === 'POST') {
    try {
      const body = await bodyJson(req);
      const ip = (body && body.ip) ? String(body.ip) : null;
      if (!ip) return textJson(res, { error:'ip required' }, 400);
      if (!store.banlist.includes(ip)) store.banlist.push(ip);
      pushLog(`blocked ${ip}`);
      // optional persist
      if (SUPA_URL && SUPA_KEY) {
        try { await supabaseInsert('skidprot_banlist', { ip, time: new Date().toISOString() }); } catch(e){ pushLog('supabase ban save failed: '+e.message); }
      }
      return textJson(res, { ok:true, banlist: store.banlist });
    } catch (err) { return textJson(res, { error: err.message }, 500); }
  }

  // unblock ip
  if (url.startsWith('/api/unblock') && method === 'POST') {
    try {
      const body = await bodyJson(req);
      const ip = (body && body.ip) ? String(body.ip) : null;
      if (!ip) return textJson(res, { error:'ip required' }, 400);
      store.banlist = (store.banlist || []).filter(x=>x!==ip);
      pushLog(`unblocked ${ip}`);
      return textJson(res, { ok:true, banlist: store.banlist });
    } catch (err) { return textJson(res, { error: err.message }, 500); }
  }

  // check - used by frontend to see if an IP should be blocked
  if (url.startsWith('/api/check') && method === 'POST') {
    try {
      const body = await bodyJson(req);
      const ip = (body && body.ip) ? String(body.ip) : null;
      if (!ip) return textJson(res, { error:'ip required' }, 400);
      const blocked = (store.banlist || []).includes(ip);
      if (blocked) store.blocked = (store.blocked||0) + 1;
      store.calls = (store.calls||0) + 1;
      return textJson(res, { blocked });
    } catch (err) { return textJson(res, { error: err.message }, 500); }
  }

  // logs
  if (url.startsWith('/api/log') && method === 'POST') {
    try {
      const body = await bodyJson(req);
      const txt = (body && body.txt) ? String(body.txt) : JSON.stringify(body);
      pushLog(txt);
      return textJson(res, { ok:true });
    } catch (err) { return textJson(res, { error: err.message }, 500); }
  }

  // fallback
  return textJson(res, { error: 'unknown endpoint' }, 404);
}

// small helper to parse body in serverless (works with Vercel)
async function bodyJson(req) {
  if (req.body) return req.body;
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data',d=>data+=d);
    req.on('end',()=> {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch(e){ reject(e); }
    });
    req.on('error',reject);
  });
}
