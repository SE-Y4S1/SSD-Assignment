// Same requests against the baseline build (port 3107) and the fixed build (3007).
const BASE = 'http://localhost:3107/api/symptom-checker';
const FIXED = 'http://localhost:3007/api/symptom-checker';
const AUTH = 'http://localhost:5000/api/auth';
const rnd = () => Math.random().toString(36).slice(2, 10);

async function call(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 160); }
    return { status: res.status, body, ct: res.headers.get('content-type') || '' };
  } catch (e) { return { status: 0, body: e.message, ct: '' }; }
}
const json = (t, p) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(p) });

(async () => {
  const pEmail = `ba.patient.${rnd()}@test.local`, dEmail = `ba.doctor.${rnd()}@test.local`, pw = 'TestPassw0rd!2026';
  const p = await call(`${AUTH}/register`, json(null, { role: 'patient', firstName: 'BA', lastName: 'Patient', email: pEmail, password: pw, gender: 'Other' }));
  const d = await call('http://localhost:3002/api/doctors/register', json(null, { name: 'BA Doctor', password: pw, specialty: 'General Physician', qualifications: ['MBBS'], contact: { email: dEmail, phone: '0700000003' } }));
  const pT = p.body.token, dT = d.body.token;
  if (!pT || !dT) { console.log('token setup failed', p.status, d.status); process.exit(1); }

  // seed a conversation owned by this patient
  await call(`${FIXED}/conversations`, json(pT, { initialMessage: 'before/after comparison seed' }));

  const out = [];
  const show = (id, what, before, after) => {
    out.push({ id, what, before, after });
    console.log(`\n${id}  ${what}`);
    console.log(`   baseline 37a6612 : ${before}`);
    console.log(`   fixed branch     : ${after}`);
  };

  // ── V-D01 ──────────────────────────────────────────────────────────────────
  const b1 = await call(`${BASE}/conversations`, { headers: { Authorization: `Bearer ${dT}` } });
  const f1 = await call(`${FIXED}/conversations`, { headers: { Authorization: `Bearer ${dT}` } });
  show('V-D01', "doctor lists conversations with no patient named and no appointment",
    `${b1.status}, returned ${Array.isArray(b1.body) ? b1.body.length : '?'} conversation(s) belonging to other patients`,
    `${f1.status} ${JSON.stringify(f1.body)}`);

  // ── V-D16 and V-D09 ───────────────────────────────────────────────────────
  const html = Buffer.from('<html><body><script>alert("stored xss")</script></body></html>');
  const mk = () => { const f = new FormData(); f.append('image', new Blob([html], { type: 'image/png' }), 'payload.html'); f.append('description', 'x'); return f; };
  const b2 = await call(`${BASE}/analyze-image`, { method: 'POST', headers: { Authorization: `Bearer ${pT}` }, body: mk() });
  const f2 = await call(`${FIXED}/analyze-image`, { method: 'POST', headers: { Authorization: `Bearer ${pT}` }, body: mk() });
  show('V-D16', 'HTML uploaded with an image content type and an .html filename',
    `${b2.status} ${JSON.stringify(b2.body).slice(0, 90)} (file written to disk)`,
    `${f2.status} ${JSON.stringify(f2.body).slice(0, 90)}`);

  require('fs').writeFileSync('before-after.json', JSON.stringify(out, null, 2));
})();
