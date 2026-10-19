# PUB-AttendEye API Documentation

Base URL: `http://localhost:5000/api`

---

## 🟢 System Endpoints

### 1. Health Check
Checks the operational status of the server and database connectivity.

- **URL:** `/api/health`
- **Method:** `GET`
- **Auth Required:** No
- **Success Response:**
  - **Code:** `200 OK`
  - **Content:**
    ```json
    {
      "success": true,
      "message": "PUB-AttendEye Backend API is operational",
      "timestamp": "2026-10-17T03:45:00.000Z",
      "environment": "development",
      "database": {
        "status": "connected"
      }
    }
    ```

---

## 🔒 Planned Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/auth/register` | Register a new user (Student / Teacher) | Public |
| POST | `/api/auth/login` | Login user and issue JWT token | Public |
| GET | `/api/auth/me` | Fetch authenticated user profile | Private |

### Attendance & Face Recognition (`/api/attendance`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/api/attendance/verify` | Verify face frame and mark attendance | Private |
| GET | `/api/attendance/history` | Get attendance history for a student/class | Private |
| POST | `/api/attendance/session/start` | Teacher initiates an attendance session | Teacher |

### Users & Administration (`/api/users`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/api/users` | List all registered users | Admin |
| POST | `/api/users/register-face` | Register facial reference biometric vectors | Student/Admin |
