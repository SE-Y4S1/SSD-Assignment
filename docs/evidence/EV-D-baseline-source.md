# Appendix A evidence: baseline source excerpts

Each item below is the code as it stands in the assignment baseline, commit
`37a6612`, at the location cited in the vulnerability summary. These excerpts are
the white-box evidence for the finding: they show the weakness in the code that
was assessed. They are not proof of exploitation. Runtime evidence, meaning the
request and response captured against a running build before and after the fix,
is recorded separately in Appendix B and is still outstanding.

Reproduce any excerpt with:

```
git show 37a6612:<path>
```

## EV-D01

**Finding:** Any doctor account can read every patient's AI conversations (V-D01)  
**Fixed in:** 4d55000

`backend/services/ai-symptom-checker/src/controllers/symptomController.js` lines 397 to 411 at 37a6612:

```
 397  exports.listConversations = async (req, res) => {
 398    try {
 399      const filter = {};
 400      if (req.user.role === 'patient') filter.patientId = req.user.patientId;
 401      else if (req.params.patientId) filter.patientId = req.params.patientId;
 402  
 403      const items = await Conversation.find(filter)
 404        .sort({ updatedAt: -1 })
 405        .limit(50)
 406        .select('title status updatedAt finalUrgency messages');
 407      res.status(200).json(items);
 408    } catch (error) {
 409      res.status(500).json({ message: error.message });
 410    }
 411  };
```

## EV-D02

**Finding:** Prompt injection; model output drives urgency and emergency alerts (V-D02)  
**Fixed in:** 935865e

`backend/services/ai-symptom-checker/src/controllers/symptomController.js` lines 73 to 82 at 37a6612:

```
  73  const triagePromptText = (symptoms, severity, durationDays, bodyLocation, additionalContext, contextBlock) => `
  74  You are MedSync's clinical triage AI. Triage the following report and respond with STRICT JSON only — no markdown, no commentary.
  75  
  76  PATIENT REPORT:
  77  - Symptoms: "${symptoms}"
  78  - Severity (self-reported): ${severity}
  79  - Duration (days): ${durationDays ?? 'unspecified'}
  80  - Body location: ${bodyLocation || 'unspecified'}
  81  - Additional context: ${additionalContext || 'none'}
  82  ${contextBlock}
```

`backend/services/ai-symptom-checker/src/controllers/symptomController.js` lines 223 to 236 at 37a6612:

```
 223      if (check.overallUrgency === 'emergency') {
 224        check.emergencyAlertSent = true;
 225        await check.save();
 226        await sendEvent('symptom-events', {
 227          type: 'EMERGENCY_TRIAGE_ALERT',
 228          checkId: check._id,
 229          patientId,
 230          patientName: patientCtx?.patient?.name,
 231          emergencyContact: patientCtx?.profile?.emergencyContact,
 232          symptoms: input,
 233          summary: check.aiSummary,
 234          timestamp: new Date(),
 235        });
 236      }
```

## EV-D03

**Finding:** Clinical context sent to AI providers without consent (V-D03)  
**Fixed in:** 935865e

`backend/services/ai-symptom-checker/src/controllers/symptomController.js` lines 44 to 71 at 37a6612:

```
  44    if (!patientCtx) return '';
  45    const lines = ['', 'PATIENT CLINICAL CONTEXT:'];
  46    const p = patientCtx.patient || {};
  47    if (p.dateOfBirth) {
  48      const age = Math.floor((Date.now() - new Date(p.dateOfBirth).getTime()) / 31557600000);
  49      lines.push(`- Age: ${age} (${p.gender || 'unspecified gender'})`);
  50    }
  51    if (p.bloodType) lines.push(`- Blood type: ${p.bloodType}`);
  52    if (patientCtx.criticalAllergies?.length) {
  53      lines.push(`- CRITICAL allergies: ${patientCtx.criticalAllergies.map((a) => `${a.substance} (${a.severity})`).join(', ')}`);
  54    }
  55    if (patientCtx.activeChronicConditions?.length) {
  56      lines.push(`- Active chronic conditions: ${patientCtx.activeChronicConditions.map((c) => c.name).join(', ')}`);
  57    }
  58    if (prescriptions?.length) {
  59      lines.push(`- Active medications: ${prescriptions.map((p) => `${p.medication} ${p.dosage || ''}`.trim()).join(', ')}`);
  60    }
  61    if (patientCtx.lastVitals?.length) {
  62      const v = patientCtx.lastVitals[0];
  63      const vbits = [];
  64      if (v.bloodPressureSystolic) vbits.push(`BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`);
  65      if (v.heartRateBpm) vbits.push(`HR ${v.heartRateBpm}`);
  66      if (v.temperatureC) vbits.push(`Temp ${v.temperatureC}°C`);
  67      if (v.oxygenSaturation) vbits.push(`SpO₂ ${v.oxygenSaturation}%`);
  68      if (vbits.length) lines.push(`- Latest vitals: ${vbits.join(', ')}`);
  69    }
  70    return lines.join('\n');
  71  };
```

## EV-D04

**Finding:** Third-party AI API key compiled into the browser bundle (V-D04)  
**Fixed in:** f9e0991

`frontend/app/components/AIVoiceScribe.tsx` lines 11 to 14 at 37a6612:

```
  11  
  12  const GROQ_KEY = process.env.NEXT_PUBLIC_GROQ_KEY || "";
  13  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  14  const ANALYSIS_DELAY_MS = 5000; // analyse after 5s of silence
```

`docker-compose.yml` lines 197 to 200 at 37a6612:

```
 197          NEXT_PUBLIC_NOTIFICATION_SERVICE_URL: http://localhost:${NOTIFICATION_PORT:-3006}/api/notify
 198          NEXT_PUBLIC_SYMPTOM_CHECKER_URL: http://localhost:${AI_PORT:-3007}/api/symptom-checker
 199          NEXT_PUBLIC_GROQ_KEY: ${NEXT_PUBLIC_GROQ_KEY}
 200      ports:
```

## EV-D05

**Finding:** Consultation rooms are public and named after the appointment id (V-D05)  
**Fixed in:** 7099507

`frontend/app/telemedicine/[appointmentId]/page.tsx` lines 90 to 101 at 37a6612:

```
  90      if (jitsiLoaded && jitsiContainerRef.current && appointment && user) {
  91         console.log('MedSync: Establishing secure global consultation bridge...');
  92         
  93         const options = {
  94            roomName: `MedSync-Consult-${appointmentId}`,
  95            width: '100%',
  96            height: '100%',
  97            parentNode: jitsiContainerRef.current,
  98            userInfo: {
  99               displayName: user.role === 'doctor' ? `Dr. ${user.name}` : user.name,
 100               email: user.email
 101            },
```

## EV-D06

**Finding:** Signalling server accepts unauthenticated connections (V-D06)  
**Fixed in:** 7dec5aa

`backend/services/telemedicine/server.js` lines 24 to 45 at 37a6612:

```
  24  const io = new Server(server, {
  25    cors: {
  26      origin: '*',
  27      methods: ['GET', 'POST', 'PUT']
  28    }
  29  });
  30  
  31  io.on('connection', (socket) => {
  32    console.log(`[Telemedicine] Socket connected: ${socket.id}`);
  33  
  34    socket.on('join_room', (roomId) => {
  35      socket.join(roomId);
  36      
  37      const clients = io.sockets.adapter.rooms.get(roomId);
  38      const numClients = clients ? clients.size : 0;
  39      console.log(`[Telemedicine] ${socket.id} joined ${roomId}. Members: ${numClients}`);
  40      
  41      // Broadcast presence so others know to start the 'Pulse'
  42      socket.to(roomId).emit('user_joined', { socketId: socket.id });
  43    });
  44  
  45    // Aggressive Pulse Relay
```

## EV-D07

**Finding:** Telemedicine session authorization uses request-body identifiers (V-D07)  
**Fixed in:** 5e90d10

`backend/services/telemedicine/src/app.js` lines 47 to 64 at 37a6612:

```
  47  app.post('/api/sessions', auth, async (req, res) => {
  48    const { appointmentId, doctorId, patientId, signalingUrl } = req.body || {};
  49    if (!appointmentId || !doctorId || !patientId) {
  50      return res.status(400).json({ message: 'Missing fields' });
  51    }
  52  
  53    if (req.user.role !== 'admin' && req.user.id !== patientId && req.user.id !== doctorId) {
  54      return res.status(403).json({ message: 'Forbidden: You cannot create a session for this appointment' });
  55    }
  56  
  57    try {
  58      let session = await Session.findOne({ appointmentId });
  59      if (session) {
  60        if (signalingUrl) {
  61          session.signalingUrl = signalingUrl;
  62          await session.save();
  63        }
  64        return res.status(200).json(session);
```

## EV-D08

**Finding:** Any authenticated user can close any AI conversation (V-D08)  
**Fixed in:** 4d55000

`backend/services/ai-symptom-checker/src/controllers/symptomController.js` lines 384 to 395 at 37a6612:

```
 384  exports.closeConversation = async (req, res) => {
 385    try {
 386      const convo = await Conversation.findById(req.params.id);
 387      if (!convo) return res.status(404).json({ message: 'Conversation not found' });
 388      convo.status = 'closed';
 389      convo.closedAt = new Date();
 390      await convo.save();
 391      res.status(200).json({ message: 'Closed' });
 392    } catch (error) {
 393      res.status(500).json({ message: error.message });
 394    }
 395  };
```

## EV-D09

**Finding:** Uploaded symptom images served from an unauthenticated static path (V-D09)  
**Fixed in:** 904e32e

`backend/services/ai-symptom-checker/src/app.js` lines 9 to 13 at 37a6612:

```
   9  app.use(cors());
  10  app.use(express.json({ limit: '2mb' }));
  11  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  12  
  13  app.use('/api/symptom-checker', symptomRoutes);
```

## EV-D10

**Finding:** Image upload filter trusts the client-supplied MIME type (V-D10)  
**Fixed in:** 904e32e

`backend/services/ai-symptom-checker/src/middleware/imageUpload.js` lines 8 to 19 at 37a6612:

```
   8  const storage = multer.diskStorage({
   9    destination: (_req, _file, cb) => cb(null, dir),
  10    filename: (_req, file, cb) => {
  11      const ext = path.extname(file.originalname).toLowerCase();
  12      cb(null, `symptom-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  13    },
  14  });
  15  
  16  const fileFilter = (_req, file, cb) => {
  17    if (/^image\/(jpeg|png|webp|heic)$/.test(file.mimetype)) cb(null, true);
  18    else cb(new Error('Only JPEG/PNG/WEBP/HEIC images are accepted'));
  19  };
```

## EV-D11

**Finding:** Data stores published without authentication (V-D11)  
**Fixed in:** 34c8df0

`docker-compose.yml` lines 3 to 56 at 37a6612:

```
   3    zookeeper:
   4      image: confluentinc/cp-zookeeper:7.4.0
   5      environment:
   6        ZOOKEEPER_CLIENT_PORT: 2181
   7        ZOOKEEPER_TICK_TIME: 2000
   8      ports:
   9        - "2181:2181"
  10      healthcheck:
  11        test: ["CMD-SHELL", "echo srvr | nc -w 2 localhost 2181 | grep -q Zookeeper"]
  12        interval: 10s
  13        timeout: 5s
  14        retries: 10
  15  
  16    kafka:
  17      image: confluentinc/cp-kafka:7.4.0
  18      depends_on:
  19        zookeeper:
  20          condition: service_healthy
  21      environment:
  22        KAFKA_BROKER_ID: 1
  23        KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
  24        KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
  25        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
  26      ports:
  27        - "9092:9092"
  28      healthcheck:
  29        test: ["CMD-SHELL", "kafka-broker-api-versions --bootstrap-server localhost:9092 || exit 1"]
  30        interval: 15s
  31        timeout: 10s
  32        retries: 10
  33  
  34    mongo:
  35      image: mongo:6.0
  36      ports:
  37        - "27017:27017"
  38      volumes:
  39        - mongo-data:/data/db
  40      healthcheck:
  41        test: ["CMD", "mongosh", "--quiet", "--eval", "db.runCommand({ ping: 1 }).ok"]
  42        interval: 10s
  43        timeout: 5s
  44        retries: 10
  45  
  46    redis:
  47      image: redis:7.0-alpine
  48      ports:
  49        - "6379:6379"
  50      volumes:
  51        - redis-data:/data
  52      healthcheck:
  53        test: ["CMD", "redis-cli", "ping"]
  54        interval: 10s
  55        timeout: 5s
  56        retries: 10
```

## EV-D12

**Finding:** No pod security context, network policies, TLS or database authentication (V-D12)  
**Fixed in:** a71cf59, 68c7fc6

`k8s/ingress.yaml` lines 1 to 12 at 37a6612:

```
   1  apiVersion: networking.k8s.io/v1
   2  kind: Ingress
   3  metadata:
   4    name: medsync-ingress
   5    namespace: medsync
   6    annotations:
   7      nginx.ingress.kubernetes.io/rewrite-target: /
   8  spec:
   9    rules:
  10    - host: medsync.local
  11      http:
  12        paths:
```

`k8s/mongo/deployment.yaml` lines 16 to 36 at 37a6612:

```
  16          app: mongo
  17      spec:
  18        containers:
  19        - name: mongo
  20          image: mongo:6.0
  21          ports:
  22          - containerPort: 27017
  23          volumeMounts:
  24          - name: mongo-data
  25            mountPath: /data/db
  26          resources:
  27            requests:
  28              memory: "256Mi"
  29              cpu: "200m"
  30            limits:
  31              memory: "1Gi"
  32              cpu: "500m"
  33        volumes:
  34        - name: mongo-data
  35          emptyDir: {}
  36  
```

## EV-D13

**Finding:** Frontend container image runs as root (V-D13)  
**Fixed in:** 18ffd3c

`frontend/Dockerfile` lines 32 to 44 at 37a6612:

```
  32  FROM node:20-alpine AS runner
  33  
  34  WORKDIR /app
  35  
  36  COPY --from=builder /app/next.config.ts ./
  37  COPY --from=builder /app/package.json ./
  38  COPY --from=builder /app/.next ./.next
  39  COPY --from=builder /app/public ./public
  40  COPY --from=builder /app/node_modules ./node_modules
  41  
  42  EXPOSE 3000
  43  
  44  CMD ["npm", "start"]
```

## EV-D14

**Finding:** Dependencies with published advisories (V-D14)  
**Fixed in:** c346beb

`frontend/package.json` lines 1 to 30 at 37a6612:

```
   1  {
   2    "name": "frontend",
   3    "version": "0.1.0",
   4    "private": true,
   5    "scripts": {
   6      "dev": "next dev",
   7      "build": "next build",
   8      "start": "next start",
   9      "lint": "eslint"
  10    },
  11    "dependencies": {
  12      "@types/js-cookie": "^3.0.6",
  13      "@types/react-signature-canvas": "^1.0.7",
  14      "agora-rtc-react": "^2.5.1",
  15      "agora-rtc-sdk-ng": "^4.24.3",
  16      "js-cookie": "^3.0.5",
  17      "lucide-react": "^1.7.0",
  18      "next": "16.2.1",
  19      "peerjs": "^1.5.5",
  20      "react": "19.2.4",
  21      "react-dom": "19.2.4",
  22      "react-signature-canvas": "^1.1.0-alpha.2",
  23      "recharts": "^3.8.1",
  24      "socket.io-client": "^4.8.3"
  25    },
  26    "devDependencies": {
  27      "@tailwindcss/postcss": "^4",
  28      "@types/node": "^20",
  29      "@types/react": "^19",
  30      "@types/react-dom": "^19",
```

## EV-D15

**Finding:** Signalling URL supplied by the client and served to the peer (V-D15)  
**Fixed in:** 5e90d10

`backend/services/telemedicine/src/app.js` lines 47 to 72 at 37a6612:

```
  47  app.post('/api/sessions', auth, async (req, res) => {
  48    const { appointmentId, doctorId, patientId, signalingUrl } = req.body || {};
  49    if (!appointmentId || !doctorId || !patientId) {
  50      return res.status(400).json({ message: 'Missing fields' });
  51    }
  52  
  53    if (req.user.role !== 'admin' && req.user.id !== patientId && req.user.id !== doctorId) {
  54      return res.status(403).json({ message: 'Forbidden: You cannot create a session for this appointment' });
  55    }
  56  
  57    try {
  58      let session = await Session.findOne({ appointmentId });
  59      if (session) {
  60        if (signalingUrl) {
  61          session.signalingUrl = signalingUrl;
  62          await session.save();
  63        }
  64        return res.status(200).json(session);
  65      }
  66  
  67      session = new Session({
  68        appointmentId,
  69        doctorId,
  70        patientId,
  71        signalingUrl,
  72        channelName: `medsync_${appointmentId}`,
```

## EV-D16

**Finding:** Stored upload extension is attacker-controlled on a public path (V-D16)  
**Fixed in:** 904e32e

`backend/services/ai-symptom-checker/src/middleware/imageUpload.js` lines 1 to 25 at 37a6612:

```
   1  const multer = require('multer');
   2  const path = require('path');
   3  const fs = require('fs');
   4  
   5  const dir = 'uploads/';
   6  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
   7  
   8  const storage = multer.diskStorage({
   9    destination: (_req, _file, cb) => cb(null, dir),
  10    filename: (_req, file, cb) => {
  11      const ext = path.extname(file.originalname).toLowerCase();
  12      cb(null, `symptom-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  13    },
  14  });
  15  
  16  const fileFilter = (_req, file, cb) => {
  17    if (/^image\/(jpeg|png|webp|heic)$/.test(file.mimetype)) cb(null, true);
  18    else cb(new Error('Only JPEG/PNG/WEBP/HEIC images are accepted'));
  19  };
  20  
  21  module.exports = multer({
  22    storage,
  23    fileFilter,
  24    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  25  });
```

## EV-D17

**Finding:** Consultation audio captured with no consent or indicator (V-D17)  
**Fixed in:** 56e41eb

`frontend/app/telemedicine/[appointmentId]/page.tsx` lines 347 to 356 at 37a6612:

```
 347  
 348            {/* Background Scribe for Patients (Relays voice to doctor) */}
 349            {user?.role === 'patient' && (
 350               <AIVoiceScribe 
 351                  hidden 
 352                  onLocalTranscript={broadcastScribe} 
 353                  externalTranscript={externalTranscript} 
 354               />
 355            )}
 356  
```

`frontend/app/components/AIVoiceScribe.tsx` lines 299 to 314 at 37a6612:

```
 299  
 300    // Auto-start if hidden (background mode)
 301    useEffect(() => {
 302      if (hidden && !listening && !recRef.current) {
 303        // Small delay to ensure browser readiness
 304        const timer = setTimeout(() => {
 305          try { toggle(); } catch (e) { console.error("Auto-start failed", e); }
 306        }, 1000);
 307        return () => clearTimeout(timer);
 308      }
 309    }, [hidden, listening, toggle]);
 310  
 311    const clear = () => { setTranscript(""); setAnalysis(null); setError(""); };
 312  
 313    if (hidden && !error) return null;
 314  
```

## EV-D18

**Finding:** Any room participant can inject text into the clinical transcript (V-D18)  
**Fixed in:** 7099507

`frontend/app/telemedicine/[appointmentId]/page.tsx` lines 127 to 137 at 37a6612:

```
 127  
 128         // Real-time Voice Relay via Jitsi Data Channels (Automatic, No IPs needed)
 129         api.on('endpointTextMessageReceived', (event: any) => {
 130            if (event.eventData.name === 'transcript-relay') {
 131               setExternalTranscript({ 
 132                  text: event.eventData.text, 
 133                  sender: event.eventData.senderName || 'Patient' 
 134               });
 135            }
 136         });
 137  
```

## EV-D19

**Finding:** No .dockerignore, so COPY overwrites the clean install (V-D19)  
**Fixed in:** 3acd9f3

`backend/services/ai-symptom-checker/Dockerfile` lines 1 to 8 at 37a6612:

```
   1  FROM node:20-alpine
   2  WORKDIR /app
   3  COPY package*.json ./
   4  RUN npm install --omit=dev
   5  COPY . .
   6  USER node
   7  EXPOSE 3007
   8  CMD ["node", "server.js"]
```

## EV-D20

**Finding:** npm install rather than npm ci; dev dependencies shipped (V-D20)  
**Fixed in:** 54c5392

`frontend/Dockerfile` lines 1 to 10 at 37a6612:

```
   1  FROM node:20 AS builder
   2  
   3  WORKDIR /app
   4  
   5  COPY package*.json ./
   6  RUN npm install
   7  
   8  COPY . .
   9  
  10  # NEXT_PUBLIC_* must exist at build time (browser bundle); runtime env in compose is not enough.
```

## EV-D21

**Finding:** All Kubernetes images pinned to the mutable latest tag (V-D21)  
**Fixed in:** c8f7309

`k8s/kustomization.yaml` lines 28 to 48 at 37a6612:

```
  28  
  29  images:
  30    - name: auth
  31      newTag: latest
  32    - name: notification
  33      newTag: latest
  34    - name: patient-management
  35      newTag: latest
  36    - name: doctor-management
  37      newTag: latest
  38    - name: appointment
  39      newTag: latest
  40    - name: telemedicine
  41      newTag: latest
  42    - name: payment
  43      newTag: latest
  44    - name: ai-symptom-checker
  45      newTag: latest
  46    - name: frontend
  47      newTag: latest
  48  
```

## EV-D22

**Finding:** Frontend Service exposed as NodePort (V-D22)  
**Fixed in:** efdac81

`k8s/frontend/service.yaml` lines 1 to 14 at 37a6612:

```
   1  apiVersion: v1
   2  kind: Service
   3  metadata:
   4    name: frontend
   5    namespace: medsync
   6  spec:
   7    type: NodePort
   8    selector:
   9      app: frontend
  10    ports:
  11      - protocol: TCP
  12        port: 3000
  13        targetPort: 3000
  14        nodePort: 30000
```

## EV-D23

**Finding:** Default ServiceAccount token mounted into every pod (V-D23)  
**Fixed in:** af2bae5

`k8s/auth/deployment.yaml` lines 14 to 24 at 37a6612:

```
  14      metadata:
  15        labels:
  16          app: auth
  17      spec:
  18        containers:
  19        - name: auth
  20          image: auth:latest
  21          ports:
  22          - containerPort: 5000
  23          env:
  24          - name: MONGO_URI
```

## EV-D24

**Finding:** MongoDB stores patient data in an emptyDir volume (V-D24)  
**Fixed in:** 7a31e1e

`k8s/mongo/deployment.yaml` lines 20 to 36 at 37a6612:

```
  20          image: mongo:6.0
  21          ports:
  22          - containerPort: 27017
  23          volumeMounts:
  24          - name: mongo-data
  25            mountPath: /data/db
  26          resources:
  27            requests:
  28              memory: "256Mi"
  29              cpu: "200m"
  30            limits:
  31              memory: "1Gi"
  32              cpu: "500m"
  33        volumes:
  34        - name: mongo-data
  35          emptyDir: {}
  36  
```

## EV-D25

**Finding:** Participant email addresses sent to the public meeting provider (V-D25)  
**Fixed in:** 7099507

`frontend/app/telemedicine/[appointmentId]/page.tsx` lines 96 to 103 at 37a6612:

```
  96            height: '100%',
  97            parentNode: jitsiContainerRef.current,
  98            userInfo: {
  99               displayName: user.role === 'doctor' ? `Dr. ${user.name}` : user.name,
 100               email: user.email
 101            },
 102            configOverwrite: {
 103               startWithAudioMuted: false,
```

## EV-D26

**Finding:** Unguarded diagnostic page ships in the production build (V-D26)  
**Fixed in:** bd1326c

`frontend/app/doctor/scribe-test/page.tsx` lines 1 to 20 at 37a6612:

```
   1  'use client';
   2  
   3  import React from 'react';
   4  import AIVoiceScribe from '../../components/AIVoiceScribe';
   5  import { Bot, Shield, Mic } from 'lucide-react';
   6  
   7  export default function ScribeTestPage() {
   8    return (
   9      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
  10        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
  11          <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '10px', borderRadius: '50%' }}>
  12            <Bot size={28} />
  13          </div>
  14          <div>
  15            <h1 style={{ margin: 0, fontSize: '1.8rem' }}>AI Scribe Diagnostic Tool</h1>
  16            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Test your voice recognition setup here independently.</p>
  17          </div>
  18        </div>
  19  
  20        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
```

## EV-D27

**Finding:** Ingress rewrite-target collapses every API path (V-D27)  
**Fixed in:** c4258ee

`k8s/ingress.yaml` lines 1 to 34 at 37a6612:

```
   1  apiVersion: networking.k8s.io/v1
   2  kind: Ingress
   3  metadata:
   4    name: medsync-ingress
   5    namespace: medsync
   6    annotations:
   7      nginx.ingress.kubernetes.io/rewrite-target: /
   8  spec:
   9    rules:
  10    - host: medsync.local
  11      http:
  12        paths:
  13        - path: /
  14          pathType: Prefix
  15          backend:
  16            service:
  17              name: frontend
  18              port:
  19                number: 3000
  20        - path: /auth
  21          pathType: Prefix
  22          backend:
  23            service:
  24              name: auth
  25              port:
  26                number: 5000
  27        - path: /api/patient
  28          pathType: Prefix
  29          backend:
  30            service:
  31              name: patient-management
  32              port:
  33                number: 3001
  34        - path: /api/doctor
```

## EV-D28

**Finding:** Ad-hoc database dump script at the repository root (V-D28)  
**Fixed in:** bfc478c

`check_mongo.js` lines 1 to 14 at 37a6612:

```
   1  const mongoose = require('mongoose');
   2  const env = require('dotenv').config({ path: '.env' });
   3  
   4  async function run() {
   5    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/medsync');
   6    const Doctor = require('./backend/services/doctor-management/src/models/Doctor');
   7    const docs = await Doctor.find({});
   8    console.log(JSON.stringify(docs, null, 2));
   9    process.exit(0);
  10  }
  11  run();
  12  
```

## EV-D29

**Finding:** Compose forces public DNS resolvers (V-D29)  
**Fixed in:** 2617fac

`docker-compose.yml` lines 59 to 73 at 37a6612:

```
  59    auth:
  60      build: ./backend/services/auth
  61      ports:
  62        - "${AUTH_PORT:-5000}:5000"
  63      depends_on:
  64        mongo:
  65          condition: service_healthy
  66      env_file: ./.env
  67      environment:
  68        - MONGO_URI=${MONGO_BASE:-mongodb://mongo:27017}/auth_db
  69        - PORT=5000
  70      dns:
  71        - 8.8.8.8
  72        - 8.8.4.4
  73  
```
