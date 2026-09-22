# SE4030 Secure Software Development: Securing MedSync

This repository holds our group assignment for SE4030. We take **MedSync**, an AI-enabled healthcare platform (8 Node.js/Express microservices and a Next.js frontend), find and fix its security vulnerabilities, and add a feature that uses OAuth 2.0 / OpenID Connect.

## Group members

| Name | Index number | Component |
| :--- | :--- | :--- |
| Dhushanthini Rajendran | _TBD_ | Authentication, shared security settings and OAuth/OIDC |
| Kaveen Chamara | _TBD_ | Patient and doctor records |
| Chenuli Abeysekara | IT23225442 | Appointments, payments and notifications |
| Nivakaran Shanmugabavan | IT23259416 | AI, telemedicine and infrastructure |

We are the same team that built the original MedSync. The components are sized to give everyone a similar amount of work.

## Links

| | |
| :--- | :--- |
| **Original project** | https://github.com/SE-Y4S1/MedSync (baseline: commit `5a6cd21`, 17 April 2026) |
| **Modified project** | https://github.com/SE-Y4S1/SSD-Assignment |
| **Video** (max 20 minutes) | _TBD_ |

The first commit in this repository is an unmodified snapshot of the original project at commit `5a6cd21`, without its accidentally committed `node_modules` folder. Every later commit is assignment work, so the commit history shows each vulnerability and its fix.

## About the application

MedSync connects patients and doctors: patient health records, doctor profiles and verification, appointment booking, video consultations, Stripe payments, email/SMS notifications and an AI symptom checker (Google Gemini).

| Service | Port | Folder |
| :--- | :--- | :--- |
| Auth | 5000 | `backend/services/auth` |
| Patient management | 3001 | `backend/services/patient-management` |
| Doctor management | 3002 | `backend/services/doctor-management` |
| Appointment | 3003 | `backend/services/appointment` |
| Telemedicine | 3004 | `backend/services/telemedicine` |
| Payment | 3005 | `backend/services/payment` |
| Notification | 3006 | `backend/services/notification` |
| AI symptom checker | 3007 | `backend/services/ai-symptom-checker` |
| Frontend | 3000 | `frontend` |

Shared infrastructure: MongoDB, Redis, Kafka and Zookeeper, run with Docker Compose or Kubernetes.

### Running it

1. `cp .env.example .env` and fill in the keys. **Never commit `.env`.**
2. Start the stack with `start-medsync.bat` (Windows) or `./start-medsync.sh` (Linux/Mac).

Full setup instructions from the original project are in [docs/ORIGINAL_README.md](docs/ORIGINAL_README.md).

## Vulnerabilities found and fixed

_Fill this in as fixes are merged. The assignment needs at least 7 distinct vulnerabilities._

| # | Vulnerability | OWASP Top 10 (2021) | Severity | Fixed by | Commit / PR |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | _TBD_ | | | | |

## Vulnerabilities not fixed

| Vulnerability | Why it was not fixed |
| :--- | :--- |
| _TBD_ | |

## OAuth / OpenID Connect feature

_TBD: provider, grant type, which feature it adds or updates, a flow diagram, and how to configure and run it._

## Tools used

_TBD: black-box tools (e.g. OWASP ZAP) and white-box tools (e.g. npm audit / OWASP Dependency-Check, Semgrep) with what each one found._

## Work allocation

Each member finds and fixes the vulnerabilities in one component. [docs/WORK_ALLOCATION.md](docs/WORK_ALLOCATION.md) covers the scope and files each member owns, the tools we use, how findings are logged, and the branch and commit rules.

## Submission checklist

- [ ] Member names and index numbers filled in
- [ ] Vulnerability tables and OAuth section completed
- [ ] Video uploaded to YouTube and link added
- [ ] Report exported as PDF
- [ ] README (as a text file) and report zipped and uploaded to courseweb
