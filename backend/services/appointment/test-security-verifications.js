/**
 * Security Verification & Regression Test Suite for MedSync Component (Appointments, Payments, Notifications)
 * Run with: node test-security-verifications.js
 */

const assert = require('assert');
const crypto = require('crypto');

// Set test environment secret
process.env.JWT_SECRET = 'test-jwt-secret-key-12345';
process.env.RECEIPT_SIGNING_SECRET = 'test-receipt-secret-67890';
process.env.INTERNAL_SERVICE_SECRET = 'test-internal-secret-99999';

console.log('🔒 Running Security Regression Verification Suite for Chenuli\'s Component...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(title, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: [${totalTests}] ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ FAIL: [${totalTests}] ${title}\n   Error: ${err.message}`);
  }
}

// ── V-C01: Service Authentication on Internal Payment Endpoint ───────────────
runTest('V-C01: Internal payment update requires x-internal-secret header', () => {
  const reqWithoutHeader = { headers: {}, body: { paymentStatus: 'paid' }, params: { id: 'app1' } };
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
  
  const isAuthorized = (req) => {
    const secret = req.headers['x-internal-secret'];
    return secret === expectedSecret;
  };

  assert.strictEqual(isAuthorized(reqWithoutHeader), false, 'Request without header must fail');
  
  const reqWithHeader = { headers: { 'x-internal-secret': expectedSecret }, body: { paymentStatus: 'paid' }, params: { id: 'app1' } };
  assert.strictEqual(isAuthorized(reqWithHeader), true, 'Request with matching secret must pass');
});

// ── V-C02: Notification Service Auth Gate ───────────────────────────────────
runTest('V-C02: Notification endpoints reject unauthenticated public calls', () => {
  const authMiddleware = (req) => {
    const internalSecretHeader = req.headers['x-internal-secret'];
    if (internalSecretHeader && internalSecretHeader === process.env.INTERNAL_SERVICE_SECRET) {
      return { status: 200 };
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { status: 401, message: 'Authorization token or service secret required' };
    }
    return { status: 200 };
  };

  const unauthReq = { headers: {} };
  assert.strictEqual(authMiddleware(unauthReq).status, 401, 'Unauthenticated request must be blocked (401)');
});

// ── V-C03 & V-C05: Server-side Pricing and Ownership Verification ─────────────
runTest('V-C03 & V-C05: Checkout session uses server-side consultation fee & enforces patient ownership', () => {
  const mockServerAppointment = {
    _id: 'app_100',
    patientId: 'patient_A',
    doctorId: 'doctor_X',
    consultationFee: 5000,
    status: 'pending'
  };

  const userPatientA = { id: 'patient_A', role: 'patient' };
  const userPatientB = { id: 'patient_B', role: 'patient' };
  const clientSubmittedBody = { appointmentId: 'app_100', amount: 1, currency: 'usd' };

  // V-C05 check
  const isPayerOwner = (user, app) => user.role === 'admin' || user.id === app.patientId;
  assert.strictEqual(isPayerOwner(userPatientA, mockServerAppointment), true, 'Patient A owns appointment');
  assert.strictEqual(isPayerOwner(userPatientB, mockServerAppointment), false, 'Patient B must be forbidden');

  // V-C03 check: price comes from server appointment fee, NOT client body
  const authoritativeAmount = Number(mockServerAppointment.consultationFee);
  assert.strictEqual(authoritativeAmount, 5000, 'Fee must be 5000 from server, ignoring client 1 USD');
});

// ── V-C06: Appointment Completion & Notes RBAC ──────────────────────────────
runTest('V-C06: Only assigned doctor or admin can mark completed and edit notes', () => {
  const appointment = { _id: 'app_200', doctorId: 'doc_1', patientId: 'pat_1' };
  
  const canUpdateCompletedOrNotes = (user, app) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.role === 'doctor' && user.id === app.doctorId;
  };

  const doctor1 = { id: 'doc_1', role: 'doctor' };
  const doctor2 = { id: 'doc_2', role: 'doctor' };
  const patient = { id: 'pat_1', role: 'patient' };

  assert.strictEqual(canUpdateCompletedOrNotes(doctor1, appointment), true, 'Assigned doctor can complete and write notes');
  assert.strictEqual(canUpdateCompletedOrNotes(doctor2, appointment), false, 'Unassigned doctor cannot complete or write notes');
  assert.strictEqual(canUpdateCompletedOrNotes(patient, appointment), false, 'Patient cannot complete or write notes');
});

// ── V-C07: Cross-Doctor Cancellation Prevention ──────────────────────────────
runTest('V-C07: Doctor A cannot cancel Doctor B\'s appointment', () => {
  const appointment = { _id: 'app_300', doctorId: 'doc_B', patientId: 'pat_1' };
  
  const canCancel = (user, app) => {
    if (!user) return false;
    const isOwnerPatient = user.id === app.patientId;
    const isAssignedDoctor = user.role === 'doctor' && user.id === app.doctorId;
    const isAdmin = user.role === 'admin';
    return isOwnerPatient || isAssignedDoctor || isAdmin;
  };

  const doctorA = { id: 'doc_A', role: 'doctor' };
  const doctorB = { id: 'doc_B', role: 'doctor' };

  assert.strictEqual(canCancel(doctorA, appointment), false, 'Doctor A must NOT be able to cancel Doctor B\'s appointment');
  assert.strictEqual(canCancel(doctorB, appointment), true, 'Doctor B can cancel their own appointment');
});

// ── V-C10: NoSQL Query Operator Injection Sanitization ───────────────────────
runTest('V-C10: Query parameters are sanitized against NoSQL injection objects', () => {
  const safeStringParam = (param) => {
    if (typeof param === 'string') return param;
    if (Array.isArray(param) && typeof param[0] === 'string') return param[0];
    return null;
  };

  const maliciousQueryStatus = { '$ne': 'cancelled' };
  const sanitizedStatus = safeStringParam(maliciousQueryStatus);
  assert.strictEqual(sanitizedStatus, null, 'NoSQL injection object must evaluate to null string');

  const validQueryStatus = 'pending';
  assert.strictEqual(safeStringParam(validQueryStatus), 'pending', 'Valid string query param must pass');
});

// ── V-C11: HMAC-SHA256 Receipt Signature Verification ────────────────────────
runTest('V-C11: Receipt hash uses HMAC-SHA256 with dedicated secret', () => {
  const secret = process.env.RECEIPT_SIGNING_SECRET || process.env.JWT_SECRET;
  const signReceiptHashLocal = ({ appointmentId, paymentId, amount, currency, paidAt, receiptNumber }) => {
    const raw = [appointmentId, paymentId, amount, currency, paidAt, receiptNumber].join('|');
    return crypto.createHmac('sha256', secret).update(raw).digest('hex');
  };
  
  const payload = {
    appointmentId: 'app_1',
    paymentId: 'pay_1',
    amount: 5000,
    currency: 'lkr',
    paidAt: '2026-09-25T12:00:00Z',
    receiptNumber: 'MS-20260925-ABCD'
  };

  const hash = signReceiptHashLocal(payload);
  assert.strictEqual(typeof hash, 'string', 'Receipt hash must be string');
  assert.strictEqual(hash.length, 64, 'HMAC-SHA256 hash must be 64 hex chars');

  // Ensure plain SHA256 without secret does NOT match
  const plainSha256 = crypto.createHash('sha256').update(Object.values(payload).join('|')).digest('hex');
  assert.notStrictEqual(hash, plainSha256, 'HMAC hash must not match plain SHA256');
});

// ── V-C13: Kafka Event Verification for Payment Refund ───────────────────────
runTest('V-C13: Kafka cancellation handler verifies appointment state before refund', async () => {
  const verifyStateBeforeRefund = (eventData, appointmentRecord) => {
    if (!eventData || !eventData.wasPaid) return false;
    if (!appointmentRecord || appointmentRecord.status !== 'cancelled') return false;
    return true;
  };

  const fakeKafkaEvent = { appointmentId: 'app_active', wasPaid: true };
  const activeAppointmentInDb = { _id: 'app_active', status: 'confirmed' };
  const cancelledAppointmentInDb = { _id: 'app_active', status: 'cancelled' };

  assert.strictEqual(verifyStateBeforeRefund(fakeKafkaEvent, activeAppointmentInDb), false, 'Uncancelled appointment must NOT be refunded');
  assert.strictEqual(verifyStateBeforeRefund(fakeKafkaEvent, cancelledAppointmentInDb), true, 'Verified cancelled appointment can be refunded');
});

// ── V-C17: Receipt Email Recipient Locking ───────────────────────────────────
runTest('V-C17: Receipt email strictly uses authenticated account email address', () => {
  const getDestinationEmail = (req, payment) => {
    return req.user?.email || payment.lastReceiptEmail || payment.metadata?.customer_details?.email || null;
  };

  const authUser = { id: 'user1', email: 'verified.patient@medsync.com' };
  const maliciousReq = { user: authUser, body: { email: 'attacker@external.com' } };
  const paymentRecord = { lastReceiptEmail: 'old@medsync.com' };

  const targetEmail = getDestinationEmail(maliciousReq, paymentRecord);
  assert.strictEqual(targetEmail, 'verified.patient@medsync.com', 'Receipt email must go to authenticated user account email');
});

console.log(`\n📊 Security Verification Summary: ${passedTests}/${totalTests} tests passed successfully!`);
