const APPOINTMENT_SERVICE_URL = process.env.APPOINTMENT_SERVICE_URL || 'http://appointment:3003';

/**
 * Answers whether a doctor may read a given patient's symptom data.
 *
 * Holding the doctor role is not enough: there must be an appointment between
 * the two. The check is made against the appointment service using the
 * doctor's own token, so that service applies its own authorization as well,
 * and a failure to answer is treated as "no" (V-D01).
 */
async function doctorTreatsPatient({ doctorId, patientId, authHeader }) {
  if (!doctorId || !patientId || !authHeader) return false;
  try {
    const response = await fetch(
      `${APPOINTMENT_SERVICE_URL}/api/appointments/doctor/${encodeURIComponent(doctorId)}`,
      { headers: { Authorization: authHeader } }
    );
    if (!response.ok) return false;
    const appointments = await response.json();
    if (!Array.isArray(appointments)) return false;
    return appointments.some((appointment) => String(appointment.patientId) === String(patientId));
  } catch (err) {
    console.warn('[ai] care-relationship lookup failed:', err.message);
    return false;
  }
}

module.exports = { doctorTreatsPatient };
