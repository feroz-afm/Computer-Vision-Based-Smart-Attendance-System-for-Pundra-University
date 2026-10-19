# Legacy MongoDB & TypeScript / Express Archive Manifest
**Project:** PUB AttendEye — Automated Smart Attendance System  
**Archive Date:** 2026-10-18  
**Archive Location:** `F:\Hackathon\PUB-AttendEye\legacy-mongodb-typescript`  

---

## 1. Overview & Purpose
This directory archives the previous Node.js/Express + Mongoose (MongoDB Atlas) backend and legacy REST API service code. It was safely extracted and categorized so that the primary repository (`F:\Hackathon\PUB-AttendEye`) can proceed with the Next.js 15 App Router + Supabase PostgreSQL architecture without data loss, while preserving full recoverability of the previous implementation.

---

## 2. Categorized Archive Manifest

| Archived Path | Original Location | Category | Description |
| :--- | :--- | :--- | :--- |
| `config/db.js` | `backend/src/config/db.js` | Database Config | Mongoose connection, retry logic, and Atlas credential troubleshooting hints. |
| `controllers/healthController.js` | `backend/src/controllers/healthController.js` | Controller | Health check controller verifying Express server and MongoDB connection status. |
| `routes/healthRoutes.js` | `backend/src/routes/healthRoutes.js` | Routes | Express router mounting `/api/health`. |
| `middleware/errorHandler.js` | `backend/src/middleware/errorHandler.js` | Middleware | Express centralized error handler and JSON response formatter. |
| `services/faceRecognition.js` | `backend/src/services/faceRecognition.js` | Services | Legacy singleton face recognition service architecture placeholder. |
| `services/axiosApiClient.js` | `frontend/src/services/api.js` | API Client | Centralized Axios HTTP client configured for Express port 5000 REST endpoints. |
| `docs/API.md` | `docs/API.md` | Documentation | Original REST API specifications for port 5000 (`/api/auth`, `/api/attendance`). |
| `backend/` | `backend/` | Project Root | Complete standalone Express server directory (including `server.js`, `app.js`, `package.json`, `package-lock.json`, and `.env.example`). |

*Note: Environment configuration templates are preserved without sensitive credentials or secrets.*

---

## 3. Shared Files Retained in Active Project
The following shared assets and configurations were retained in the active project (`F:\Hackathon\PUB-AttendEye`) as they are required by the current Next.js + Supabase system:

1. **Brand & Media Assets (`public/assets/`):**
   - `Logo.png` — Official PUB AttendEye emblem
   - `Hackaathon group photo.png` — PUB CSE Fest 2026 team photo
   - `Pundra University.jpeg` — Campus photograph
   - `Team logo.png` — Hackathon team badge
   - `ref photo for home page.png` — Biometric vision interface showcase

2. **Project Identity & Documentation:**
   - `README.md` — Core repository mission and Pundra University context.
   - `docs/FACE_RECOGNITION.md` — Active vision pipeline and anti-spoofing specifications.

---

## 4. How to Recover or Run the Legacy Express Backend
If you ever wish to spin up the legacy Express + MongoDB server independently:
```powershell
cd F:\Hackathon\PUB-AttendEye\legacy-mongodb-typescript\backend
npm install
# Ensure valid MONGO_URI in .env
npm run dev
# Server will listen on http://localhost:5000/api/health
```
