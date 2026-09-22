# Work allocation

The work is split by component. Each member owns a separate set of services and files, which keeps merge conflicts low and makes each person's work easy to see in the commit history. The marking rubric grades individual contribution, so this matters.

| Member | Component | Owns |
| :--- | :--- | :--- |
| 1. Dhushanthini | Identity, sessions and OAuth/OIDC | `backend/services/auth`, frontend login/register/session code |
| 2. Kaveen | Patient and doctor records | `backend/services/patient-management`, `backend/services/doctor-management` |
| 3. Chenuli | Appointments, payments and notifications | `backend/services/appointment`, `backend/services/payment`, `backend/services/notification` |
| 4. Nivakaran | AI, telemedicine and infrastructure | `backend/services/ai-symptom-checker`, `backend/services/telemedicine`, `docker-compose.yml`, `k8s/`, Dockerfiles, dependencies |

Components follow who built each part of the original MedSync, so everyone starts in code they already know. Dhushanthini built the auth service, Kaveen built patient and doctor management, Chenuli built appointments and payments, and Nivakaran built the AI symptom checker and Kubernetes setup.

Dhushanthini has fewer vulnerabilities because this component also includes the OAuth/OIDC feature, which is marked as a separate criterion.

## Initial findings per component

These come from a first white-box review of the baseline commit. They are starting points, not final results. Before fixing one:

1. Reproduce it and keep the evidence (request/response, screenshot, ZAP alert) for the report and video.
2. Confirm the OWASP category and severity.
3. Add anything new you find with scanning tools.

The group needs **at least 7 distinct** vulnerabilities in total. Aim for at least 3 fixes each. Line numbers refer to the baseline commit.

### 1. Dhushanthini: Identity, sessions and OAuth/OIDC

Files: `backend/services/auth/**`, `frontend/app/login`, `frontend/app/register`, `frontend/app/context/AuthContext.tsx`, `frontend/app/services/authService.ts`, `frontend/app/services/api.ts`, `frontend/proxy.ts`

| Finding | OWASP | Severity | Where |
| :--- | :--- | :--- | :--- |
| Startup scripts copy `.env.example`, so the stack runs with a publicly known JWT secret and admin password | A07 | High | `.env.example:8,13`, `setup.sh`, `start-medsync.*`, `backend/services/auth/server.js:7` |
| No rate limiting or lockout on login | A07 | Medium | `backend/services/auth/src/routes/authRoutes.js:6` (patient and doctor login routes too: agree with Kaveen, who owns those files) |
| JWT stored in a JavaScript-readable cookie and localStorage; 7-day tokens that can't be revoked | A07 | Medium | `frontend/app/services/authService.ts:52-58`, `frontend/app/services/api.ts:16-19` |
| Credentials leaked in the original repository's git history | A07 | Critical | Original repo history: document it and rotate the credentials (can't be fixed in code) |

**OAuth/OIDC feature:** for example, "Sign in with Google" through the auth service using the OpenID Connect authorization code flow with PKCE, `state` and `nonce`, then issuing a normal MedSync session.

### 2. Kaveen: Patient and doctor records

Files: `backend/services/patient-management/**`, `backend/services/doctor-management/**`, `frontend/app/patient/**`, `frontend/app/verify/**`

| Finding | OWASP | Severity | Where |
| :--- | :--- | :--- | :--- |
| Any logged-in user can edit or delete any prescription (no ownership check, whole request body saved) | A01 | Critical | `patient-management/src/controllers/patientController.js:589-608` |
| A doctor can mark their own account as verified (whole request body saved) | A01 / A08 | Critical | `doctor-management/src/controllers/doctorController.js:155-166` |
| Anyone can register as a doctor and read every patient's full health record; `isVerified` is never enforced | A01 | Critical | `patientController.js:16-20`, `doctorController.js:115-143` |
| Uploaded medical documents are served publicly; upload type check is weak | A01 / A04 | High | `patient-management/src/app.js:12`, `patient-management/src/middleware/uploadMiddleware.js:21-31` |
| Regex injection in doctor search; NoSQL operator injection in doctor login | A03 | Medium | `doctorController.js:171`, `doctorController.js:117-123` |
| Public prescription verification returns the whole record | A01 | Medium | `doctorController.js:477-496` |
| User enumeration and weak password rules at registration and login | A07 | Low | `patientController.js:49-54, 97-99`, `doctorController.js:52, 72` |

### 3. Chenuli: Appointments, payments and notifications

Files: `backend/services/appointment/**`, `backend/services/payment/**`, `backend/services/notification/**`, `frontend/app/appointment/**`, `frontend/app/payment/**`

| Finding | OWASP | Severity | Where |
| :--- | :--- | :--- | :--- |
| Anyone can mark an appointment as paid (route has no authentication) | A01 | Critical | `appointment/src/routes/appointmentRoutes.js:47`, `appointment/src/controllers/appointmentController.js:236-261` |
| Payment amount and currency come from the browser | A04 | High | `payment/src/controllers/paymentController.js:89-117` |
| Checkout doesn't check that the appointment belongs to the payer | A01 | High | `paymentController.js:95-145` |
| Doctors can confirm, complete or cancel other doctors' appointments | A01 | High | `appointmentController.js:208-217, 336` |
| Email and SMS endpoints need no authentication (open relay) | A01 | High | `notification/src/routes/notificationRoutes.js:6-25` |
| Consultation fee is chosen by the browser at booking | A04 | Medium | `appointment/src/middleware/validate.js:29-30` |
| NoSQL operator injection through query-string filters | A03 | Low | `appointmentController.js:167-169, 184-187, 375-380` |
| Receipt signature is a plain hash with a hard-coded fallback key | A02 | Low | `payment/src/utils/receipt.js:5, 21-24` |

### 4. Nivakaran: AI, telemedicine and infrastructure

Files: `backend/services/ai-symptom-checker/**`, `backend/services/telemedicine/**`, `frontend/app/telemedicine/**`, `frontend/app/symptom-checker/**`, `frontend/app/components/AIVoiceScribe.tsx`, `frontend/next.config.ts`, `docker-compose.yml`, `k8s/**`, Dockerfiles, `package.json` files

| Finding | OWASP | Severity | Where |
| :--- | :--- | :--- | :--- |
| Any doctor can read every patient's AI symptom-checker conversations | A01 | High | `ai-symptom-checker/src/controllers/symptomController.js:397-411, 433-471` |
| Groq API key is built into the browser bundle | A05 | High | `docker-compose.yml:199`, `frontend/app/components/AIVoiceScribe.tsx:12, 36` |
| Video consultations use public Jitsi rooms named after the appointment ID | A01 | High | `frontend/app/telemedicine/[appointmentId]/page.tsx:94` |
| Vulnerable dependencies (`npm audit`: 1 critical in `next`, many high) | A06 | High | All `package.json` files |
| Prompt injection in the symptom checker; model output decides emergency alerts | A03 (LLM01) | Medium | `symptomController.js:73-82, 223-236, 419-422` |
| Socket.IO signalling server has no authentication | A01 | Medium | `telemedicine/server.js:24-67` |
| Wildcard CORS and no security headers in every service | A05 | Medium | Every service's `src/app.js`, `frontend/next.config.ts` |
| MongoDB, Redis, Kafka and Zookeeper exposed without authentication; Kafka events trusted blindly | A05 / A08 | Medium | `docker-compose.yml`, `patient-management/src/prescriptionConsumer.js:24-44` |
| Internal error messages returned to clients; patient data in logs | A09 | Low | Most controllers |

The CORS and security-header fix touches every service's `app.js`. Nivakaran should merge it early as one small PR so the others build on top of it.

## How we work

- **Branches.** One branch per member: `m1-auth-oauth`, `m2-records`, `m3-appointments-payments`, `m4-ai-infra`. Open a pull request into `main` and get one other member to review it.
- **Commit as yourself.** Set `git config user.name` and `user.email` to your own GitHub account. The commit history is how individual contribution is judged.
- **One fix per commit**, with a detailed message:

  ```
  fix(<service>): <short summary>

  Vulnerability: <what was wrong> (OWASP <category>, <severity>)
  Impact: <what an attacker could do>
  Fix: <what changed and why>
  Tested: <how you confirmed the fix>
  ```

- **Stay in your own files.** If you need to change a file another member owns, agree on it first.
- **No secrets in git.** Never commit `.env` files, API keys or real credentials.
- **Keep before-and-after evidence** for each fix; the report and video need it.
