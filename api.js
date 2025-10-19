// api/save.js  — Vercel Serverless function (Node 18+)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  // If SUPABASE configured, insert into table 'skidprot_snapshots'
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    // no remote configured — just echo
    console.log('Received remote save (no supabase configured):', body);
    return res.status(200).json({ message:'received (no remote configured)', payload: body });
  }

  try {
    // PostgREST insert into table (ensure table exists)
    const resp = await fetch(`${SUPA_URL}/rest/v1/skidprot_snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('Supabase insert failed', resp.status, text);
      return res.status(502).json({ error:'supabase failure', status: resp.status, body: text });
    }
    return res.status(200).json({ message:'saved to supabase', result: text });
  } catch (err) {
    console.error('Save error', err);
    return res.status(500).json({ error: 'server error', details: err.message });
  }
}
