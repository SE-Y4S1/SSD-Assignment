/**
 * Consultation-scribe analysis.
 *
 * The browser used to call the Groq API directly with a key built into the
 * page bundle, which handed that credential to every visitor. The key now
 * lives only here, and the browser calls this endpoint with its own session
 * token instead (V-D04).
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TRANSCRIPT_CHARS = 12000;

const SYSTEM_PROMPT = `You are a clinical AI assistant in a live telemedicine consultation.
Analyse the transcript and return ONLY a JSON object — no markdown, no explanation:
{
  "doctor_said": "brief summary of doctor speech",
  "patient_said": "brief summary of patient speech",
  "symptoms": ["symptom 1", "symptom 2"],
  "possible_conditions": [
    { "name": "Condition", "confidence": "High|Medium|Low", "reason": "one sentence" }
  ],
  "red_flags": ["urgent warning signs — empty array if none"],
  "suggested_questions": ["what doctor should ask next"],
  "recommended_tests": ["tests to consider"],
  "summary": "2-sentence clinical summary"
}`;

const EMPTY_ANALYSIS = {
  doctor_said: '',
  patient_said: '',
  symptoms: [],
  possible_conditions: [],
  red_flags: [],
  suggested_questions: [],
  recommended_tests: [],
  summary: '',
};

exports.analyzeScribe = async (req, res) => {
  if (!['doctor', 'patient', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: 'Scribe analysis is not configured' });
  }

  const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim() : '';
  if (!transcript) {
    return res.status(400).json({ message: 'transcript is required' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          // The transcript is data, never instructions, and is capped so a long
          // consultation cannot be used to push the system prompt out.
          { role: 'user', content: `Transcript:\n${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}` },
        ],
      }),
    });

    if (!response.ok) {
      // The provider's message can carry request detail, so it is logged here
      // rather than returned to the browser.
      const detail = await response.text();
      console.warn('[ai] scribe provider error:', response.status, detail.slice(0, 300));
      return res.status(502).json({ message: 'Scribe analysis is unavailable' });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.warn('[ai] scribe response was not valid JSON');
      return res.status(200).json({ ...EMPTY_ANALYSIS, summary: 'The assistant returned no usable analysis.' });
    }

    // Return a known shape so the page cannot be steered into rendering
    // whatever the model happened to produce.
    return res.status(200).json({
      doctor_said: String(parsed.doctor_said || ''),
      patient_said: String(parsed.patient_said || ''),
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms.map(String).slice(0, 25) : [],
      possible_conditions: Array.isArray(parsed.possible_conditions)
        ? parsed.possible_conditions.slice(0, 10).map((c) => ({
            name: String(c?.name || ''),
            confidence: ['High', 'Medium', 'Low'].includes(c?.confidence) ? c.confidence : 'Low',
            reason: String(c?.reason || ''),
          }))
        : [],
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.map(String).slice(0, 25) : [],
      suggested_questions: Array.isArray(parsed.suggested_questions)
        ? parsed.suggested_questions.map(String).slice(0, 25)
        : [],
      recommended_tests: Array.isArray(parsed.recommended_tests)
        ? parsed.recommended_tests.map(String).slice(0, 25)
        : [],
      summary: String(parsed.summary || ''),
    });
  } catch (err) {
    console.error('[ai] scribe analysis failed:', err.message);
    return res.status(502).json({ message: 'Scribe analysis is unavailable' });
  }
};
