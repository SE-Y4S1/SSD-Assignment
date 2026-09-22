# Work allocation

The work is split by component. Each member finds and fixes the vulnerabilities in their own component. Each member also owns a separate set of services and files, which keeps merge conflicts low and makes each person's work easy to see in the commit history. The marking rubric grades both identifying and fixing vulnerabilities, as well as individual contribution.

| Member | Component |
| :--- | :--- |
| 1. Dhushanthini | Authentication, shared security settings and OAuth/OIDC |
| 2. Kaveen | Patient and doctor records |
| 3. Chenuli | Appointments, payments and notifications |
| 4. Nivakaran | AI, telemedicine and infrastructure |

The components are sized to give everyone a similar amount of work. Each one covers code its owner built in the original MedSync.

**Where the line is:**

- **Authentication belongs to Dhushanthini in every service.** That means who the user is: logging in, registering, passwords, and issuing and checking tokens.
- **Authorization belongs to the feature owner.** That means what a logged-in user is allowed to do with a record: for example, which patients a doctor can see, or who can change an appointment.

## Components

### 1. Dhushanthini: Authentication, shared security settings and OAuth/OIDC

- **Owns:**
  - `backend/services/auth`
  - Frontend login and register pages
  - `frontend/app/context/AuthContext.tsx`
  - `frontend/app/services/authService.ts`
  - `frontend/app/services/api.ts`
  - `frontend/proxy.ts`
  - `frontend/next.config.ts`
  - `.env.example` and the setup/start/run scripts
- **In every service:**
  - The login and registration endpoints
  - Password handling
  - The auth middleware that checks tokens
- **Scope:**
  - Login and registration for every role, and admin seeding
  - How tokens are created, stored, sent, checked and ended
  - Frontend route protection
  - How configuration and secrets are handled
  - Settings every service shares: CORS, security headers and what error responses reveal
- **Also builds the OAuth/OIDC feature**, which is marked as a separate criterion. For example, "Sign in with Google" through the auth service.

### 2. Kaveen: Patient and doctor records

- **Owns:**
  - `backend/services/patient-management`
  - `backend/services/doctor-management`
  - `frontend/app/patient`, `frontend/app/doctor`, `frontend/app/verify`
  - The matching admin pages

  Login, registration and auth middleware in these services belong to Dhushanthini.
- **Scope:**
  - Patient profiles and health records
  - Document uploads
  - Prescriptions: issuing, editing, deleting and public verification
  - Doctor profiles and verification
  - Doctor search, including the admin search pages
  - Doctor and admin access to patient data
  - Audit logging
  - The events these services receive from Kafka
  - How these services connect to and share the database

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
  - Pricing
  - Stripe checkout and webhook, receipts and refunds
  - Email and SMS sending
  - Calls and events between these services
  - What these services write to their logs

### 4. Nivakaran: AI, telemedicine and infrastructure

- **Owns:**
  - `backend/services/ai-symptom-checker`
  - `backend/services/telemedicine`
  - `frontend/app/symptom-checker`, `frontend/app/telemedicine`
  - `frontend/app/components/AIVoiceScribe.tsx`
  - `docker-compose.yml`, `k8s/` and the Dockerfiles
  - Third-party dependencies across the project
- **Scope:**
  - The AI symptom checker and voice scribe: conversations, image uploads and what is sent to AI providers
  - Video consultations, sessions and signalling
  - Container and Kubernetes configuration
  - Kafka, MongoDB, Redis and Zookeeper setup
  - Dependencies

### Work that crosses services

- **Dhushanthini's changes in other services.** Tell the owner before merging. Merge the shared CORS and security-header change early so everyone builds on it. Make the error-response change last, after the other fixes are in, because it touches many files.
- **Anything else that repeats across services.** Tell the group first. One person takes it, fixes it everywhere in one PR, and it counts once.

## Finding vulnerabilities

1. **Run the app locally.** See [ORIGINAL_README.md](ORIGINAL_README.md).
2. **Review your code manually.** Go through every route, middleware and controller in your scope, and ask for each endpoint:
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

- **Branches.** Each member works only on the branch with their name: `Dhushanthini`, `Kaveen`, `Chenuli` or `Nivakaran`. Only you can push to your branch.
- **Pull requests.** Nobody can push to `main` directly. When a fix is ready, open a pull request from your branch into `main`. Nivakaran reviews and merges all pull requests.
- **Stay up to date.** Merge `main` into your branch instead of rebasing, because force-pushes are blocked.
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

- **Stay in your own scope.** If you need to change something another member owns, agree on it first.
- **No secrets in git.** Never commit `.env` files, API keys or real credentials.
