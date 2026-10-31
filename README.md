# PUB AttendEye 👁️🎓 (Version 2.0.0)

**PUB AttendEye** is an AI-powered automated smart attendance monitoring and academic management platform engineered for **Pundra University of Science & Technology (PUB)**, Bogra, Bangladesh .

Version 2.0.0 represents a complete architectural overhaul from the legacy v1 starter prototype to an enterprise-grade, secure, multi-tier biometric system featuring **Next.js 15 App Router**, **Supabase PostgreSQL & SSR Auth**, and an optimized **Python FastAPI Computer Vision Engine** powered by OpenCV DNN with **YuNet** face detection and **SFace** 128-dimensional biometric feature representation.

---

## 🏛️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT TIER (Browser)                            │
│  - Modern Glassmorphism UI (Tailwind CSS, Lucide Icons, Responsive HUD)     │
│  - HTML5 Camera Capture (Webcam stream, manual frame snap, auto-scan)       │
│  - Role-Isolated Portals: Student, Faculty/Teacher, Academic Administrator  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WSS
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WEB & APPLICATION TIER (Next.js 15)                    │
│  - App Router (React 19, Server Components, Route Handlers, Middleware)     │
│  - Session-aware navigation & database-verified role guards                 │
│  - Secure Biometric Gateway API (/api/faces/enroll, /api/faces/match)       │
│  - Server-side access token injection & privacy vector redaction            │
└──────────────────┬───────────────────────────────────────┬──────────────────┘
                   │                                       │
      Internal API │ HTTP/JSON                             │ Supabase REST & Auth
                   ▼                                       ▼
┌─────────────────────────────────────┐  ┌────────────────────────────────────┐
│      CV ENGINE TIER (FastAPI)       │  │       DATA & AUTH TIER (Supabase)  │
│  - OpenCV DNN Hardware Execution    │  │  - PostgreSQL with Row-Level       │
│  - YuNet Real-Time Face Detection   │  │    Security (RLS) policies         │
│  - SFace 112x112 Alignment & 128D   │  │  - SSR Cookie Session Management   │
│    Biometric Unit Embeddings        │  │  - Asymmetric ES256 / JWKS Auth    │
│  - Cosine Distance Roster Matcher   │  │  - Biometric Consent Audit Trail   │
│  - Multi-Face Collision Protection  │  │  - Avatars & Document Storage      │
│  - Rate Limiting & Health Probes    │  │  - Database Migration Scripts      │
└─────────────────────────────────────┘  └────────────────────────────────────┘
```

---

## 🌟 Key Features in Version 2.0.0

1. **Role Isolation & Protected Portals:**
   - Dedicated login and registration gateways for **Students**, **Teachers**, and **Administrators**.
   - Server-side Next.js middleware cross-checks session tokens directly against `public.profiles` in PostgreSQL.
   - Dynamic navbar detects active sessions, preserving state and preventing accidental sign-outs.
   - Accessible modal confirmations (`LogoutConfirmModal`) for intentional session termination.

2. **Open Faculty Registration & Admin Approval:**
   - Transparent faculty self-registration supporting institutional and academic emails.
   - Default `pending_approval` state strictly blocks attendance session initiation until vetted.
   - Interactive Academic Admin dashboard review queue with approval, rejection, and course assignment controls.

3. **Ethical Biometric Privacy & Consent:**
   - **Privacy First:** Raw photographic samples are **never** stored permanently in the database.
   - Only unit-normalized 128-dimensional floating-point embeddings are stored in `public.face_enrollments`.
   - Embeddings are **never** returned to client browser JavaScript.
   - Mandatory voluntary consent agreement tracked in `public.student_consent` with revocation timestamps.

4. **Live Optical Classroom Attendance:**
   - Real-time webcam integration with hands-free **Auto-Scan** mode (4-second interval).
   - Multi-face detection with simultaneous multi-candidate identification.
   - **Roster-Scoped Matching:** Recognition candidate search is strictly constrained to students enrolled in that course and section.
   - **Tiered Decision Boundaries:**
     - `Similarity >= 0.85`: High-confidence automated match (**Present**).
     - `0.65 <= Similarity < 0.85` or Ambiguity Margin `< 0.05`: Dispatched to teacher **Review Queue**.
     - `Similarity < 0.65`: Classified as **Unknown**.
   - Multi-face collision protection prevents double-claiming the same student ID in a single frame.

5. **Manual Adjustments & Audit Trail:**
   - Attendance correction dialog requires mandatory documented justification (minimum 8 characters) logged to database audit trails.

6. **Student Performance & Warning Indicators:**
   - Accurate, real-time attendance percentage calculated from recorded class sessions.
   - Automatic banner alerts for low attendance (< 75% notice, < 60% critical exam debarment warning).

7. **Autonomous Windows 1-Click Launchers:**
   - `start-attendeye.bat`: Self-validates environment, models, and port availability, then launches both backend and frontend.
   - `stop-attendeye.bat`: Cleanly terminates background processes on ports 8000 and 3000.

---

## 📋 Prerequisites

- **Node.js**: v18.17.0 or v20+ (LTS recommended)
- **Python**: v3.10 or v3.11 (64-bit recommended for OpenCV DNN)
- **Supabase**: Active project (cloud hosted or local CLI)
- **Webcam / Camera**: Integrated or USB camera for optical recognition

---

## ⚙️ Environment Variables Setup

Create a `.env.local` file in the project root by copying `.env.example`:

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# Linux / macOS
cp .env.example .env.local
```

### Environment Variable Reference

| Variable Name | Required | Default / Description |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL (e.g. `https://xyzcompany.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase public anon key (safe for browser client) |
| `SUPABASE_SERVICE_ROLE_KEY` | *Optional* | Backend-only administrative key (never expose to browser) |
| `NEXT_PUBLIC_APP_NAME` | No | `"PUB AttendEye"` |
| `NEXT_PUBLIC_UNIVERSITY_NAME` | No | `"Pundra University of Science & Technology"` |
| `PYTHON_CV_API_URL` | **Yes** | URL of Python CV backend (`http://127.0.0.1:8000`) |
| `SUPABASE_JWT_SECRET` | *Optional* | Project JWT secret for legacy HS256 verification |
| `SUPABASE_JWT_JWKS_URL` | *Optional* | Custom JWKS endpoint for asymmetric ES256/RS256 JWT checks |
| `PYTHON_API_ENV` | No | `"development"` (allows local dev token) or `"production"` |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin (`http://localhost:3000`) |

> [!CAUTION]
> Never commit `.env.local`, `.env`, service role keys, or production JWT secrets to version control.

---

## 🗄️ Database & Supabase Schema Setup

1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Run the baseline schema file:
   - [`supabase/schema.sql`](supabase/schema.sql)
3. Sequentially apply the Version 2 migrations:
   - [`supabase/migrations/20261020_secure_face_enrollment_rls.sql`](supabase/migrations/20261020_secure_face_enrollment_rls.sql)
   - [`supabase/migrations/20261021_teacher_approval_and_workflow.sql`](supabase/migrations/20261021_teacher_approval_and_workflow.sql)
   - [`supabase/migrations/20261022_student_profile_and_course_access.sql`](supabase/migrations/20261022_student_profile_and_course_access.sql)

### Initializing the First Administrator

To promote an initial user account to the `admin` role, execute the following SQL in your Supabase SQL Editor:

```sql
SELECT public.promote_to_admin('admin@pundra.edu.bd');
```

---

## 🚀 Running the Application

### Option A: Autonomous 1-Click Launcher (Windows Recommended)

Simply double-click:
```text
start-attendeye.bat
```
To shut down all running services cleanly:
```text
stop-attendeye.bat
```

---

### Option B: Manual Command Line Startup

#### 1. Python Computer Vision Service (Port 8000)

```bash
# 1. Activate or create virtual environment
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# 2. Install CV dependencies
pip install -r requirements-cv.txt

# 3. Ensure ONNX models exist in models/
#    - models/face_detection_yunet_2023mar.onnx
#    - models/face_recognition_sface_2021dec.onnx

# 4. Launch FastAPI service
uvicorn backend.api:app --host 127.0.0.1 --port 8000
```
Verify backend health: `http://127.0.0.1:8000/health`

#### 2. Next.js Web Application (Port 3000)

In a separate terminal:
```bash
# 1. Install Node dependencies
npm install

# 2. Launch development server
npm run dev

# Or build and launch production bundle:
npm run build
npm run start
```
Access the application: `http://localhost:3000`

---

## 🧪 Verification & Testing Suite

PUB AttendEye includes automated test suites covering TypeScript compilation, production bundling, Python computer vision algorithms, and end-to-end integration contracts:

### 1. Static Type & Production Build Checks
```bash
# TypeScript type validity check
npx tsc --noEmit

# Next.js optimized production build
npm run build
```

### 2. Python Unit & Biometric Pipeline Tests
```bash
# Run all Python unit tests (135 tests)
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

### 3. End-to-End System & Regression Tests
```bash
# Session awareness, modal confirmation, and portal isolation
node tests/test_session_and_teacher_isolation.mjs

# Biometric enrollment contract, consent, and JWKS security
node tests/test_face_enrollment_regression.mjs

# Classroom launch readiness and multi-face matching audit
node tests/test_classroom_attendance_readiness.mjs

# Teacher registration and non-institutional email support
node tests/test_teacher_open_registration.mjs

# Faculty approval workflow and administrative actions
node tests/test_teacher_approval_workflow.mjs

# Student dashboard real data synchronization
node tests/test_student_dashboard_real_data.mjs
```

---

## 🔒 Security & Privacy Invariants

- **No Raw Biometric Storage:** The system never writes raw photographic face samples to disk or database tables.
- **Client Vector Redaction:** 128D mathematical embeddings are never transmitted to client-side browser code; all matching occurs within the trusted server-side CV bridge.
- **Token-Scoped Isolation:** User identity is established strictly via server-validated Supabase JWT tokens.
- **Anti-Collusion Controls:** Faculty cannot self-approve applications or assign unassigned courses without administrative authorization.

---

## ⚠️ Known Limitations & Operational Guidelines

1. **Browser Camera Permissions (HTTPS):** Modern web browsers enforce strict `navigator.mediaDevices.getUserMedia` restrictions. While `localhost` operates under development exemptions, production deployments require valid SSL/TLS (HTTPS).
2. **Classroom Illumination & Angles:** Face recognition performance depends on adequate ambient classroom lighting. Extreme side profiles (> 45° yaw) or severe backlighting may route faces to the **Review Queue** for faculty confirmation.
3. **Anti-Spoofing Roadmap:** The current release implements geometry, landmark checks, and sharpness gating. Active 3D challenge-response (head turn / blink prompt) is scheduled for Version 2.1.
4. **Resolution Recommendations:** For large lecture halls (> 40 students per frame), 1080p Full HD resolution or segmented sector scanning is recommended for optimal YuNet detection accuracy.

Demo video link :  https://drive.google.com/drive/folders/1TOS8X7bpe_ZyqevYWtywlwA9Nd8N2Xt4

---

## 📄 License & Credits

Developed by **Team AttendEye** for **Pundra University of Science & Technology (PUB)**.  
Open-source models used:
- **YuNet Face Detector:** OpenCV Zoo (Apache License 2.0)
- **SFace Face Recognizer:** OpenCV Zoo (Apache License 2.0)
