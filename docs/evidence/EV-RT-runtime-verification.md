# EV-RT: runtime verification of the V-D fixes

Everything below is captured output from a run of the stack, not a description
of what should happen.

- **Fixed build:** branch `Nivakaran` at `c3000eb`, started with `docker compose up -d`.
- **Baseline build:** the AI symptom-checker service built from `37a6612` and run
  alongside on port 3107, sharing the same MongoDB, so the same request can be
  sent to both.
- **Date:** 2026-09-24.
- **Environment:** Docker Engine 29.6.2 on Windows, Node 20 images, MongoDB 6.0,
  Kafka and Zookeeper 7.4.0, Redis 7.0. Synthetic accounts only; no real data.

The baseline service had to be started with `--user 0`. Its own image cannot
create the `uploads/` directory as the `node` user and exits with EACCES, which
is itself worth noting: the baseline container never started cleanly.

## 1. Before and after, same request to both builds

```
V-D01  doctor lists conversations with no patient named and no appointment
   baseline 37a6612 : 200, returned 4 conversation(s) belonging to other patients
   fixed branch     : 400 {"message":"patientId is required"}

V-D16  HTML uploaded with an image content type and an .html filename
   baseline 37a6612 : 500 {"message":"[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.goo (file written to disk)
   fixed branch     : 400 {"message":"The uploaded file is not a JPEG, PNG or WEBP image"}
```

The baseline returned two conversations belonging to another patient. It also
accepted an HTML file uploaded with `Content-Type: image/png` and the name
`payload.html`: the request reached the AI provider call, which means the type
filter passed it. The fixed build refuses both.

Uploaded files are deleted after analysis, so to show the serving half of
V-D09 a file was placed in the upload directory directly and requested from
both builds:

```
=== published ports ===
ai-symptom-checker | 0.0.0.0:3007->3007/tcp, [::]:3007->3007/tcp
appointment | 0.0.0.0:3003->3003/tcp, [::]:3003->3003/tcp
auth | 0.0.0.0:5000->5000/tcp, [::]:5000->5000/tcp
doctor-management | 0.0.0.0:3002->3002/tcp, [::]:3002->3002/tcp
frontend | 0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
kafka | 9092/tcp
mongo | 127.0.0.1:27017->27017/tcp
notification | 0.0.0.0:3006->3006/tcp, [::]:3006->3006/tcp
patient-management | 0.0.0.0:3001->3001/tcp, [::]:3001->3001/tcp
payment | 0.0.0.0:3005->3005/tcp, [::]:3005->3005/tcp
redis | 127.0.0.1:6379->6379/tcp
telemedicine | 0.0.0.0:3004->3004/tcp, [::]:3004->3004/tcp
zookeeper | 2181/tcp, 2888/tcp, 3888/tcp

=== baseline vs fixed: static uploads ===
baseline:
HTTP/1.1 200 OK
X-Powered-By: Express
Access-Control-Allow-Origin: *
fixed:
status 404
```

## 2. Security retests against the fixed build

```
patient register: 201 {"user":{"id":"6ab44d2f7a72a9a8dfe5867e","email":"patient.uyw24ycs@test.local","name":"Test Patient","role":"patient"},"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpX
doctor register: 201 {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2YWI0NGQyZjA0YjE5OTk4YTlmYzBlM2IiLCJkb2N0b3JJZCI6IjZhYjQ0ZDJmMDRiMTk5OThhOWZjMGUzYiIsImVtYWlsIjoiZ
patient token: obtained
doctor token: obtained
PASS  N1  patient can run a symptom check (normal functionality)
      expected: 200 with results
      observed: 200 {"results":[{"specialty":"General Physician","suggestions":"Rest, hydrate, monitor temperature. See a doctor if fever exceeds 39°C or sympto
PASS  N2  patient can open a conversation (normal functionality)
      expected: 200 or 201
      observed: 201 id=6ab44d30a67186ea6b867b98
PASS  N3  patient sees their own conversations (normal functionality)
      expected: 200 with a list
      observed: 200 count=1
PASS  T-D01a  doctor listing conversations without naming a patient
      expected: 400, filter is never left empty
      observed: 400 {"message":"patientId is required"}
PASS  T-D01b  doctor reading another patient's conversations with no appointment
      expected: 403 forbidden
      observed: 403 {"message":"Forbidden: no appointment with this patient"}
PASS  T-D01c  doctor reading another patient's history with no appointment
      expected: 403 forbidden
      observed: 403 {"message":"Forbidden: no appointment with this patient"}
PASS  T-D08  doctor closing another patient's conversation
      expected: 403 forbidden
      observed: 403 {"message":"Forbidden: no appointment with this patient"}
PASS  T-D09  static uploads path on the AI service
      expected: 404, the mount is gone
      observed: 404
PASS  T-D16  HTML uploaded with an image content type
      expected: 400, rejected on file signature
      observed: 400 {"message":"The uploaded file is not a JPEG, PNG or WEBP image"}
PASS  T-D07  creating a session for an appointment the caller is not part of
      expected: 403 forbidden
      observed: 403 {"message":"Forbidden: You are not a participant in this appointment"}
PASS  T-D26  diagnostic scribe page in the production build
      expected: 404 with a session; unauthenticated requests redirect to login
      observed: authenticated=404, anonymous=307 -> /login?next=%2Fdoctor%2Fscribe-test
PASS  N5  an existing doctor page still renders (normal functionality)
      expected: 200
      observed: 200
PASS  N4  frontend still serves the application (normal functionality)
      expected: 200
      observed: 200

--- summary ---
13 of 13 checks matched the expected behaviour
```

## 3. Signalling server (V-D06)

```
T-D06a  no token -> refused: Authorization token required
T-D06b  valid token, foreign room -> join_denied for medsync-ffffffffffffffffffffffffffffffffffff
```

## 4. Container and image checks

```
PASS  V-D11 mongo is bound to loopback only
      expected: 127.0.0.1:27017
      observed: 127.0.0.1:27017
PASS  V-D11 redis is bound to loopback only
      expected: 127.0.0.1:6379
      observed: 127.0.0.1:6379
FAIL  V-D11 kafka publishes no host port
      expected: not published
      observed: invalid IP:0
FAIL  V-D11 zookeeper publishes no host port
      expected: not published
      observed: invalid IP:0
PASS  V-D13 frontend container runs as non-root
      expected: uid=1000(node)
      observed: uid=1000(node) gid=1000(node) groups=1000(node)
PASS  V-D29 no container uses a public DNS override
      expected: 0 references to 8.8.8.8
      observed: 0 references
PASS  V-D04 no provider key variable in the built bundle
      expected: 0 files
      observed: 0 files
PASS  V-D04 the browser no longer calls the provider directly
      expected: 0 files referencing api.groq.com
      observed: 0 files
PASS  V-D17 consent control ships in the built frontend
      expected: at least 1 file
      observed: 4 files
PASS  V-D20 dev dependencies absent from the runtime image
      expected: 0 (nodemon not installed)
      observed: 0

container checks: 8 passed, 2 failed
```

The two lines reported as failures are an artefact of the check script: with no
published port, `docker compose port` prints `invalid IP:0` rather than an empty
string. The port listing in section 1 shows kafka and zookeeper publishing
nothing to the host, which is the intended result.

## 5. Kubernetes manifests (V-D12, V-D21 to V-D24, V-D27)

Rendered with `kubectl kustomize k8s/` and asserted against. No cluster was
used, so this verifies the manifests, not cluster behaviour.

```
kubectl kustomize rendered 33 objects
objects: {'Namespace': 1, 'Secret': 1, 'Service': 13, 'PersistentVolumeClaim': 1, 'Deployment': 13, 'Ingress': 1, 'NetworkPolicy': 3}

PASS  V-D21 no app image uses :latest
       tags: v1.0.0
PASS  V-D22 no Service is type NodePort
       found: []
PASS  V-D23 every pod disables the ServiceAccount token
       missing on: []
PASS  V-D24 mongo uses a PersistentVolumeClaim, not emptyDir
       [{'name': 'mongo-data', 'persistentVolumeClaim': {'claimName': 'mongo-data'}}]
PASS  V-D24 the claim exists
PASS  V-D12 app pods set runAsNonRoot
       missing on: []
PASS  V-D12 app containers drop capabilities and block privilege escalation
       missing on: []
PASS  V-D12 network policies present
       policies: ['allow-ingress-controller-to-apps', 'allow-within-namespace', 'default-deny-ingress']
PASS  V-D12 ingress terminates TLS
       [{'hosts': ['medsync.local'], 'secretName': 'medsync-tls'}]
PASS  V-D12 every MONGO_URI authenticates
       unauthenticated in: []
PASS  V-D27 no rewrite-target annotation
       {}
PASS  V-D27 ingress paths match the service mounts
       /api/auth, /api/patients, /api/doctors, /api/appointments, /api/sessions, /api/payments, /api/notify, /api/symptom-checker, /

passed 12 of 12
```

## How to reproduce

```
cp .env.example .env          # then set JWT_SECRET and ADMIN_PASSWORD
docker compose build
docker compose up -d
node runtime_tests.js         # scripts held with the report working files
bash container_checks.sh
kubectl kustomize k8s/
```

## What this does not cover

- The payment, notification and appointment flows, which belong to other
  components.
- OAuth, which is not implemented yet.
- Cluster behaviour for the Kubernetes findings: TLS termination, the network
  policies and the database credentials are verified as manifests only.
- V-D02, V-D03, V-D05, V-D14, V-D18, V-D25: verified by build, by unit test or
  by inspection of the built bundle rather than by an end-to-end exploit.
