# Work allocation

The work is split by component. Each member finds and fixes vulnerabilities in their own component. Each member also owns a separate set of services and files, which keeps merge conflicts low and makes each person's work easy to see in the commit history. The marking rubric grades both identifying and fixing vulnerabilities, as well as individual contribution.

| Member | Component |
| :--- | :--- |
| 1. Dhushanthini | Identity, sessions and OAuth/OIDC |
| 2. Kaveen | Patient and doctor records |
| 3. Chenuli | Appointments, payments and notifications |
| 4. Nivakaran | AI, telemedicine and infrastructure |

Components follow who built each part of the original MedSync, so everyone starts in code they already know.

## Components

### 1. Dhushanthini: Identity, sessions and OAuth/OIDC

- **Owns:**
  - `backend/services/auth`
  - Frontend login and register pages
  - `frontend/app/context/AuthContext.tsx`
  - `frontend/app/services/authService.ts`
  - `frontend/app/services/api.ts`
  - `frontend/proxy.ts`
  - `.env.example` and the setup/start scripts
- **Scope:**
  - Login and registration for every role, and admin seeding
  - How tokens are created, stored, sent and checked
  - Frontend route protection
  - How configuration and secrets are handled
- **Also builds the OAuth/OIDC feature**, which is marked as a separate criterion. For example, "Sign in with Google" through the auth service.

The patient and doctor services have their own login and registration endpoints, and Kaveen owns those files. Agree with Kaveen before changing them.

### 2. Kaveen: Patient and doctor records

- **Owns:**
  - `backend/services/patient-management`
  - `backend/services/doctor-management`
  - `frontend/app/patient`, `frontend/app/doctor`, `frontend/app/verify`
  - The matching admin pages
- **Scope:**
  - Patient profiles and health records
  - Document uploads
  - Prescriptions: issuing, editing and public verification
  - Doctor profiles, registration and verification
  - Doctor search
  - Doctor and admin access to patient data

### 3. Chenuli: Appointments, payments and notifications

- **Owns:**
  - `backend/services/appointment`
  - `backend/services/payment`
  - `backend/services/notification`
  - `frontend/app/appointment`, `frontend/app/payment`
  - The matching admin pages
- **Scope:**
  - Searching for doctors and booking
  - Rescheduling, cancelling and appointment status changes
  - Stripe checkout and webhook, receipts and refunds
  - Email and SMS sending
  - Calls between these services

### 4. Nivakaran: AI, telemedicine and infrastructure

- **Owns:**
  - `backend/services/ai-symptom-checker`
  - `backend/services/telemedicine`
  - `frontend/app/symptom-checker`, `frontend/app/telemedicine`
  - `frontend/app/components/AIVoiceScribe.tsx`
  - `frontend/next.config.ts`
  - `docker-compose.yml`, `k8s/` and the Dockerfiles
  - Third-party dependencies
- **Scope:**
  - The AI symptom checker and voice scribe, including what is sent to AI providers
  - Video consultations and signalling
  - Container and Kubernetes configuration
  - Kafka, MongoDB and Redis setup
  - Dependencies

### Issues that affect every service

If you find a problem that repeats across all services, tell the group before fixing it. One person takes it and fixes it everywhere in one PR, and it counts once.

## Finding vulnerabilities

1. **Run the app locally.** See [ORIGINAL_README.md](ORIGINAL_README.md).
2. **Review your code manually.** Go through every route, middleware and controller in your services, and ask for each endpoint:
   - Who can call it?
   - What does the caller control?
   - What does the code trust without checking?

   Use the [OWASP Top 10 (2021)](https://owasp.org/Top10/) as a checklist.
3. **Use tools.** The report should say which tool found what.

| Tool | Type | Use it for |
| :--- | :--- | :--- |
| [OWASP ZAP](https://www.zaproxy.org/) | Black box | Scanning the running app and APIs |
| Burp Suite Community or Postman | Black box | Manual requests: changing IDs, roles, fields, tokens |
| [Semgrep](https://semgrep.dev/) (`semgrep --config p/owasp-top-ten`) | White box | Static analysis of the source |
| `npm audit` or [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/) | White box | Vulnerable dependencies |
| [Gitleaks](https://github.com/gitleaks/gitleaks) or TruffleHog | White box | Secrets in code and git history |
| [Trivy](https://trivy.dev/) | White box | Docker images, Dockerfiles and Kubernetes manifests |

## Logging and fixing

1. **Open a GitHub issue for each finding before fixing it.** Include:
   - Title and component label
   - OWASP category and severity
   - How you found it (tool or manual review)
   - Steps to reproduce
   - Evidence: a screenshot or request/response
2. **Fix it on your branch** and reference the issue in the commit.
3. **Take before-and-after evidence.** The report and video need it.
4. **If you can't fix something,** leave the issue open with the reason. It goes into "Vulnerabilities not fixed" in the README. Reasons might be a third-party service, infrastructure outside our control, or the fix is out of scope.

## How we work

- **Branches.** Each member works on their own branch: `m1-auth-oauth`, `m2-records`, `m3-appointments-payments` or `m4-ai-infra`. Open a pull request into `main` and get one other member to review it.
- **Commit as yourself.** Set `git config user.name` and `user.email` to your own GitHub account. The commit history is how individual contribution is judged.
- **One fix per commit**, with a detailed message:

  ```
  fix(<service>): <short summary>

  Vulnerability: <what was wrong> (OWASP <category>, <severity>)
  Found with: <tool or manual review>
  Impact: <what an attacker could do>
  Fix: <what changed and why>
  Tested: <how you confirmed the fix>

  Closes #<issue number>
  ```

- **Stay in your own files.** If you need to change a file another member owns, agree on it first.
- **No secrets in git.** Never commit `.env` files, API keys or real credentials.
