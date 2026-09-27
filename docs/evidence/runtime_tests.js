// Runtime verification of the V-D fixes against the running stack.
// Every result printed here is an observed HTTP status and body, not an assertion of success.

const AUTH = 'http://localhost:5000/api/auth';
const AI = 'http://localhost:3007/api/symptom-checker';
const TELE = 'http://localhost:3004/api/sessions';
const FRONTEND = 'http://localhost:3000';

const results = [];
const rec = (id, what, expected, observed, pass) => {
  results.push({ id, what, expected, observed, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}`);
  console.log(`      expected: ${expected}`);
  console.log(`      observed: ${observed}`);
};

const rnd = () => Math.random().toString(36).slice(2, 10);

async function call(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: String(err.message) };
  }
}

const json = (token, payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(payload),
});

(async () => {
  // ── accounts ───────────────────────────────────────────────────────────────
  const pEmail = `patient.${rnd()}@test.local`;
  const dEmail = `doctor.${rnd()}@test.local`;
  const pw = 'TestPassw0rd!2026';

  const patientReg = await call(`${AUTH}/register`, json(null, {
    role: 'patient', firstName: 'Test', lastName: 'Patient', email: pEmail, password: pw,
    dateOfBirth: '1990-01-01', gender: 'Other', phone: '0700000001',
  }));
  // Registering a doctor through the auth service returns 404 because
  // DOCTOR_SERVICE_URL in .env.example omits the /api/doctors path that the
  // auth service appends to. Registering directly against the doctor service
  // instead; the configuration defect is reported separately.
  const doctorReg = await call('http://localhost:3002/api/doctors/register', json(null, {
    name: 'Test Doctor', password: pw,
    specialty: 'General Physician', qualifications: ['MBBS'],
    contact: { email: dEmail, phone: '0700000002' },
  }));
  console.log('patient register:', patientReg.status, JSON.stringify(patientReg.body).slice(0, 160));
  console.log('doctor register:', doctorReg.status, JSON.stringify(doctorReg.body).slice(0, 160));

  const pToken = patientReg.body?.token || (await call(`${AUTH}/login`, json(null, { email: pEmail, password: pw }))).body?.token;
  const dToken = doctorReg.body?.token
    || (await call('http://localhost:3002/api/doctors/login', json(null, { email: dEmail, password: pw }))).body?.token;
  console.log('patient token:', pToken ? 'obtained' : 'MISSING');
  console.log('doctor token:', dToken ? 'obtained' : 'MISSING');
  if (!pToken || !dToken) { console.log('cannot continue without both tokens'); process.exit(1); }

  const pClaims = JSON.parse(Buffer.from(pToken.split('.')[1], 'base64').toString());
  const patientId = pClaims.patientId || pClaims.userId || pClaims.id;

  // ── normal functionality: a patient's own symptom check ───────────────────
  const check = await call(`${AI}/analyze`, json(pToken, { symptoms: 'mild sore throat for two days', severity: 'mild' }));
  rec('N1', 'patient can run a symptom check (normal functionality)',
      '200 with results', `${check.status} ${JSON.stringify(check.body).slice(0, 140)}`, check.status === 200);

  const convo = await call(`${AI}/conversations`, json(pToken, { initialMessage: 'I have had a sore throat for two days' }));
  const convoId = convo.body?.conversationId || convo.body?._id;
  rec('N2', 'patient can open a conversation (normal functionality)',
      '200 or 201', `${convo.status} id=${convoId || 'none'}`, [200, 201].includes(convo.status));

  const ownList = await call(`${AI}/conversations`, { headers: { Authorization: `Bearer ${pToken}` } });
  rec('N3', 'patient sees their own conversations (normal functionality)',
      '200 with a list', `${ownList.status} count=${Array.isArray(ownList.body) ? ownList.body.length : 'n/a'}`,
      ownList.status === 200);

  // ── V-D01: clinician access without a care relationship ───────────────────
  const docAll = await call(`${AI}/conversations`, { headers: { Authorization: `Bearer ${dToken}` } });
  rec('T-D01a', 'doctor listing conversations without naming a patient',
      '400, filter is never left empty', `${docAll.status} ${JSON.stringify(docAll.body).slice(0, 120)}`,
      docAll.status === 400);

  const docOther = await call(`${AI}/conversations/patient/${patientId}`, { headers: { Authorization: `Bearer ${dToken}` } });
  rec('T-D01b', "doctor reading another patient's conversations with no appointment",
      '403 forbidden', `${docOther.status} ${JSON.stringify(docOther.body).slice(0, 120)}`,
      docOther.status === 403);

  const docHistory = await call(`${AI}/history/${patientId}`, { headers: { Authorization: `Bearer ${dToken}` } });
  rec('T-D01c', "doctor reading another patient's history with no appointment",
      '403 forbidden', `${docHistory.status} ${JSON.stringify(docHistory.body).slice(0, 120)}`,
      docHistory.status === 403);

  // ── V-D08: closing someone else's conversation ────────────────────────────
  if (convoId) {
    const close = await call(`${AI}/conversations/${convoId}/close`, {
      method: 'PUT', headers: { Authorization: `Bearer ${dToken}` },
    });
    rec('T-D08', "doctor closing another patient's conversation",
        '403 forbidden', `${close.status} ${JSON.stringify(close.body).slice(0, 120)}`, close.status === 403);
  }

  // ── V-D09: uploads are no longer served ───────────────────────────────────
  const uploads = await call('http://localhost:3007/uploads/anything.png');
  rec('T-D09', 'static uploads path on the AI service',
      '404, the mount is gone', `${uploads.status}`, uploads.status === 404);

  // ── V-D16: file type is decided by content, not the header ────────────────
  const htmlBytes = Buffer.from('<html><script>alert(1)</script></html>');
  const form = new FormData();
  form.append('image', new Blob([htmlBytes], { type: 'image/png' }), 'payload.html');
  form.append('description', 'type check');
  const upload = await call(`${AI}/analyze-image`, {
    method: 'POST', headers: { Authorization: `Bearer ${pToken}` }, body: form,
  });
  rec('T-D16', 'HTML uploaded with an image content type',
      '400, rejected on file signature', `${upload.status} ${JSON.stringify(upload.body).slice(0, 140)}`,
      upload.status === 400);

  // ── V-D07 and V-D15: session authorization and signalling URL ─────────────
  const fakeAppt = '0'.repeat(24);
  const session = await call(TELE, json(pToken, {
    appointmentId: fakeAppt, doctorId: 'attacker', patientId, signalingUrl: 'http://attacker.example/ws',
  }));
  rec('T-D07', 'creating a session for an appointment the caller is not part of',
      '403 forbidden', `${session.status} ${JSON.stringify(session.body).slice(0, 140)}`,
      session.status === 403);

  // ── V-D26: the diagnostic page ────────────────────────────────────────────
  // With a session cookie the middleware does not redirect, so the router's own
  // answer for the deleted route is visible.
  const scribeAuthed = await fetch(`${FRONTEND}/doctor/scribe-test`, {
    headers: { Cookie: `medsync_token=${dToken}` }, redirect: 'manual',
  });
  const scribeAnon = await fetch(`${FRONTEND}/doctor/scribe-test`, { redirect: 'manual' });
  rec('T-D26', 'diagnostic scribe page in the production build',
      '404 with a session; unauthenticated requests redirect to login',
      `authenticated=${scribeAuthed.status}, anonymous=${scribeAnon.status} -> ${scribeAnon.headers.get('location') || ''}`,
      scribeAuthed.status === 404);

  // A page that still exists, for comparison.
  const doctorHome = await fetch(`${FRONTEND}/doctor`, {
    headers: { Cookie: `medsync_token=${dToken}` }, redirect: 'manual',
  });
  rec('N5', 'an existing doctor page still renders (normal functionality)',
      '200', `${doctorHome.status}`, doctorHome.status === 200);

  const home = await call(FRONTEND);
  rec('N4', 'frontend still serves the application (normal functionality)',
      '200', `${home.status}`, home.status === 200);

  console.log('\n--- summary ---');
  console.log(`${results.filter(r => r.pass).length} of ${results.length} checks matched the expected behaviour`);
  require('fs').writeFileSync('runtime-results.json', JSON.stringify(results, null, 2));
})();
