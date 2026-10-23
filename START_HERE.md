# PUB AttendEye (Version 2.0) — Quick Start Guide

Welcome to **PUB AttendEye v2.0**, the facial recognition attendance verification platform for **Pundra University of Science & Technology (PUB)**, Bogra, Bangladesh. Version 2.0 introduces full role-based approval gates (Teacher self-registration & Admin approval), live student course access, biometric consent validation, and automated attendance logging.

---

## 🚀 One-Command Launch (Windows)

To start both the Python Computer Vision backend and Next.js frontend automatically:

1. Double-click or run:
   ```cmd
   start-attendeye.bat
   ```
2. The launcher will:
   - Verify Node.js and the Python virtual environment (`.venv`).
   - Verify YuNet face detection and SFace 128D recognition models.
   - Start the FastAPI Computer Vision service on `http://127.0.0.1:8000`.
   - Start the Next.js web application on `http://localhost:3000`.
   - Automatically open your default web browser to the homepage once ready.

### To Stop the Application:
Run or double-click:
```cmd
stop-attendeye.bat
```

---

## 🏛️ Portal Access Points

| Portal | URL | Purpose |
| :--- | :--- | :--- |
| **Landing Page** | `http://localhost:3000` | System overview, architecture, portals, university policies |
| **Student Portal** | `http://localhost:3000/login?role=student` | Consent management, face enrollment validation, attendance logs |
| **Teacher Portal** | `http://localhost:3000/login?role=teacher` | Session launcher, classroom photo attendance, review queue, CSV export |
| **Admin Console** | `http://localhost:3000/login?role=admin` | Teacher application approval, course offering assignments, system settings |
| **Computer Vision API** | `http://127.0.0.1:8000/health` | Live OpenCV YuNet/SFace health check & model status |

---

## 🗄️ One-Time Prerequisite: Remote Database Initialization

The local application is fully operational in demonstration mode with guaranteed UI transparency (explicit badges distinguish demo/local cache records from remote database records).

To activate **live remote Supabase persistence**:

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard/project/gakkoyuskfgkryuyoang/sql).
2. Open the **SQL Editor** -> **New Query**.
3. Copy and paste the entire idempotent script from:
   `supabase/schema.sql` (874 lines)
4. Click **Run**.
5. To activate the Administrator account:
   - Register `pub.admin@pundra.edu.bd` at `http://localhost:3000/register?role=admin`.
   - Run in the Supabase SQL Editor:
     ```sql
     SELECT public.promote_to_admin('pub.admin@pundra.edu.bd');
     ```

Once executed, live database writes and reads will automatically take precedence across all portals.

---

## 🧪 Automated Testing Verification

To run the complete test suite at any time:
```cmd
:: Run Bridge & API integration tests
node tests/test_nextjs_integration.mjs

:: Run Teacher approval & attendance workflow tests
node tests/test_teacher_approval_workflow.mjs

:: Run Portal navigation tests
node tests/test_portal_navigation.mjs

:: Run Python computer vision unit tests
.venv\Scripts\python.exe -m unittest discover -s tests
```
*Current test suite status: 229 passed, 0 failed.*
