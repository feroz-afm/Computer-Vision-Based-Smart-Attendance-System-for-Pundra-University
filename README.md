# PUB-AttendEye 👁️🎓 (Version 2.0)

**PUB-AttendEye v2.0** is an AI-powered automated attendance monitoring and management system designed for educational institutions. It utilizes facial recognition technology to streamline student and faculty attendance with real-time verification, role-based dashboards (Student, Teacher, Admin), teacher approval workflows, biometric consent controls, and secure reporting.

---

## 📁 Project Structure

```text
PUB-AttendEye/
├── frontend/                     # React + Vite Client Application
│   ├── public/
│   │   └── assets/               # Static assets & brand logos
│   ├── src/
│   │   ├── components/           # Reusable UI components
│   │   ├── pages/                # View pages
│   │   │   ├── Home.jsx          # Welcome / landing page
│   │   │   ├── Login.jsx         # User authentication
│   │   │   ├── Register.jsx      # New account registration
│   │   │   ├── student/          # Student portal views
│   │   │   ├── teacher/          # Teacher portal views
│   │   │   └── admin/            # Administrator portal views
│   │   ├── services/
│   │   │   └── api.js            # Centralized Axios API client
│   │   ├── context/              # React context providers (Auth, UI)
│   │   ├── App.jsx               # Application route configuration
│   │   └── main.jsx              # Vite entry point
│   └── package.json
├── backend/                      # Node.js + Express REST API
│   ├── src/
│   │   ├── config/               # Database and server configuration
│   │   ├── models/               # Mongoose database schemas
│   │   ├── controllers/          # API route controllers
│   │   ├── routes/               # API route definitions
│   │   ├── middleware/           # Auth and error handling middleware
│   │   ├── services/
│   │   │   └── faceRecognition.js# Face recognition service placeholder
│   │   ├── utils/                # Helper utilities and validators
│   │   ├── app.js                # Express app setup & middleware
│   │   └── server.js             # HTTP server entry point & DB connection
│   ├── .env                      # Local environment configuration (git-ignored)
│   ├── .env.example              # Template environment variables
│   └── package.json
├── docs/
│   └── API.md                    # REST API specifications and endpoints
├── .gitignore                    # Git ignore rules
└── README.md                     # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **MongoDB**: Local MongoDB instance or MongoDB Atlas URI (optional for initial starter health check)

---

### 1. Backend Setup

```bash
cd backend
npm install
```

Configure your environment variables:
```bash
# Copy template to .env
cp .env.example .env
```
*(On Windows PowerShell, use `Copy-Item .env.example .env`)*

Start the backend development server:
```bash
npm run dev
# Or start with node
npm start
```

Backend will be accessible at: `http://localhost:5000`  
Health check endpoint: `http://localhost:5000/api/health`

---

### 2. Frontend Setup

```bash
cd frontend
npm install
```

Start the Vite development server:
```bash
npm run dev
```

Frontend will be accessible at: `http://localhost:5173`

---

## 🛠️ Tech Stack

- **Frontend**: React 18 / 19, Vite, React Router DOM, Axios, Modern Vanilla CSS Design System
- **Backend**: Node.js, Express.js, Mongoose (MongoDB), CORS, Dotenv, Morgan
- **AI/ML (Planned)**: Face recognition service module (`services/faceRecognition.js`)

---

## 📖 API Documentation
Refer to [docs/API.md](docs/API.md) for endpoint details and response formats.
