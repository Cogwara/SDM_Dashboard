
# 🛰️ SDM Dashboard — Telecom Operations & Intelligent Availability Platform

[![React](https://img.shields.io/badge/Frontend-React_19_%2B_Vite_8-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Django](https://img.shields.io/badge/Backend-Django_6.0_%2B_DRF-092E20?logo=django&logoColor=white)](https://www.djangoproject.com/)
[![Tailwind CSS](https://img.shields.io/badge/Styles-Tailwind_CSS_v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Leaflet](https://img.shields.io/badge/GIS_Map-Leaflet-199900?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Docker](https://img.shields.io/badge/Container-Docker_Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Platforms](https://img.shields.io/badge/Platforms-Web_|_Desktop_(Win)_|_Mobile_(Android)-brightgreen)]()

An enterprise-grade, multi-platform **State Delivery Manager (SDM) Telecom Operations & Network Intelligence Platform**. Designed for telecom tower operations (IHS, MTN, Airtel, Huawei), the platform centralizes cell site portfolio management, real-time hourly & daily availability analytics, GIS geospatial mapping, fiber & transmission outage tracking, WhatsApp field intelligence extraction, trouble ticketing, and AI-driven root cause analysis (RCA).

---

## 📑 Table of Contents

- [Key Capabilities & Modules](#-key-capabilities--modules)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
- [Quick Start with Docker](#-quick-start-with-docker)
- [Manual Installation & Local Setup](#-manual-installation--local-setup)
  - [Backend Setup (Django API)](#1-backend-setup-django-api)
  - [Frontend Setup (React + Vite)](#2-frontend-setup-react--vite)
- [Desktop Application (Windows)](#-desktop-application-windows)
- [Mobile Application (Android APK)](#-mobile-application-android-apk)
- [Data Importers & Management Commands](#-data-importers--management-commands)
- [API Reference](#-api-reference)
- [Environment Configuration](#-environment-configuration)
- [License](#-license)

---

## 🌟 Key Capabilities & Modules

### 1. 📊 Daily & Hourly Availability Centers
- **Real-Time Hourly SLA Monitoring**: Ingests and visualizes 24-hour network availability curves across states, clusters, and assigned field engineer portfolios.
- **Aggregated Daily Availability**: Automated percentage calculations with SLA thresholds (99.5%+, 98.0%–99.5%, Sub-98% Critical).
- **Interactive Trend Analytics**: Interactive Recharts time-series graphs for MTTR, uptime trends, and generator vs commercial grid run-time ratios.
- **Spreadsheet Ingestion Engine**: Seamlessly parses `.xlsb`, `.xlsx`, and `.csv` hourly/daily availability report sheets with automatic column normalization and conflict resolution.

### 2. 🗺️ Geospatial GIS Interactive Map
- **Live Cell Site Mapping**: Dynamic interactive Leaflet GIS map with custom telecom pin icons, high-density cluster grouping, and state/territory polygon boundary overlays.
- **Visual Status Triage**: Color-coded markers for Operational (Green), Down/Outage (Red), Critical Priority P1/VIP (Purple), and Maintenance/Degraded (Amber).
- **Quick-Spec Popups & Direct Dispatch**: Click any site to view live power status, battery backup levels, assigned SMC FSE / MTN FME contact numbers with one-click direct phone dial and WhatsApp dispatch.

### 3. 📁 WSD Workspace & Cell Site Database
- **Comprehensive Site Directory**: Full lifecycle registry of over 20,000+ national cell sites with detailed technical specifications (DG Capacity, Power Solutions, Rectifier Status, Battery Health, OEM, HVC Category, SBCs).
- **Advanced Multi-Dimensional Filtering**: Filter by State, LGA, Cluster, State Delivery Manager (SDM), SMC FSE Engineer, Tower Operator (IHS/Huawei), and Operational Mode.
- **WSD Importer**: Batch import and synchronize master Weekly Site Database spreadsheets (`.xlsb`/`.xlsx`).

### 4. 🧵 Fiber & Transmission Outage Tracker
- **Huawei & IHS Fiber Links Directory**: Database of transmission fiber links, spans, splice points, and optical route paths.
- **TNL Link Segments & Cascades**: Tracks site cascade dependencies to identify single points of failure (Hub sites vs Terminal sites).
- **Downstream Impact Visualizer**: Calculates total downstream cell sites impacted when a major fiber link or transmission hub goes down.

### 5. 🤖 AI Telecom Diagnostic & RCA Assistant
- **Automated Root Cause Analysis (RCA)**: Correlates power alarms, generator fuel burn rates, battery discharge curves, and grid outages to pinpoint root causes.
- **Smart Recommendations**: Drafts actionable dispatch recommendations, ETA targets, and escalation directives for field maintenance teams.
- **Automated Executive Summaries**: Summarizes daily regional operational performance for management briefings.

### 6. 📱 WhatsApp Field Intelligence Operations
- **Field Group Parser**: Ingests operational messages from field WhatsApp groups and extracts Site IDs, engineer names, outage reasons, fuel levels, ETAs, and restoration timestamps.
- **Incident Chronology**: Automatically feeds updates into individual site timelines for auditing and post-mortem reviews.

### 7. 🎫 Work Order (WO) & Trouble Ticket Tracker
- **End-to-End Ticketing**: Log, assign, escalate, and resolve operational work orders.
- **Milestone Audits & Photo Evidence**: Supports field engineers uploading photographic proof of resolution (rectifier repairs, fuel replenishment, generator servicing).

---

## 🏗️ System Architecture

```mermaid
graph TD
    ClientWeb["Web Browser (React 19 + Vite)"] --> |REST / JSON| Gateway["Nginx Reverse Proxy / Port 80"]
    ClientDesktop["Desktop App (Electron)"] --> |REST / JSON| Gateway
    ClientMobile["Android App (Capacitor APK)"] --> |REST / JSON| Gateway

    Gateway --> |Reverse Proxy| DjangoApp["Django REST Backend (:8001)"]

    subgraph Backend Core
        DjangoApp --> AuthModule["JWT / Session RBAC Auth"]
        DjangoApp --> SitesModule["Sites & WSD Importer"]
        DjangoApp --> AvailModule["Daily & Hourly Availability Engine"]
        DjangoApp --> FiberModule["Fiber & TNL Cascade Manager"]
        DjangoApp --> AIEngine["AI Root Cause Analysis Engine"]
        DjangoApp --> WAParser["WhatsApp Field Intelligence"]
    end

    DjangoApp --> DB[("SQLite3 / PostgreSQL Database")]
    DjangoApp --> MediaStore["Media Storage (Attachments & Photos)"]
```

---

## 💻 Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, Vite 8, Tailwind CSS v4 | High-performance responsive single-page application |
| **Icons & Visuals** | Lucide React, Recharts, Leaflet | Dynamic charting, mapping, and modern telecom icon sets |
| **Desktop Shell** | Electron 34, Electron-Builder | Native Windows desktop installer & offline caching |
| **Mobile Runtime**| Capacitor 8 | Native Android container for the dashboard client |
| **Backend API** | Python 3.12, Django 6.0, DRF | Robust RESTful backend API with SimpleJWT authentication |
| **Data Processing**| Pandas, Openpyxl, Pyxlsb, NumPy | High-speed processing of large `.xlsb` and `.xlsx` telecom sheets |
| **Database** | SQLite3 / PostgreSQL | Relational database with indexed JSON field attributes |
| **Server / Proxy** | Gunicorn, Nginx, Docker | Containerized production deployment |

---

## 🔐 Role-Based Access Control (RBAC)

The system enforces strict multi-tiered portfolio scoping across all views, statistics, and reports:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SUPER ADMINISTRATOR                           │
│  - National visibility (All 36 States + FCT, 20,000+ Sites)             │
│  - User management, FSE auto-provisioning, system configuration         │
│  - Master WSD, Availability, and Fiber dataset upload permissions       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     STATE DELIVERY MANAGER      │     │        SMC FSE ENGINEER         │
│  - Scoped to State Territory    │     │  - Scoped strictly to assigned  │
│    (e.g., FCT, Lagos, Kano)     │     │    cell sites (e.g. 40–80 sites)│
│  - Performance analytics & RT   │     │  - Mobile field interface       │
│  - Field note creation & RCA    │     │  - Live photo upload & updates  │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

---

## 🐳 Quick Start with Docker

The fastest way to spin up the full production stack:

```bash
# 1. Clone repository
git clone https://github.com/Cogwara/SDM_Dashboard.git
cd SDM_Dashboard

# 2. Build and start containers
docker-compose up --build -d

# 3. Verify running containers
docker-compose ps
```

- **Frontend Dashboard**: `http://localhost` (or `http://localhost:5173`)
- **Backend API**: `http://localhost:8001`
- **Django Admin**: `http://localhost:8001/admin/`

---

## 🛠️ Manual Installation & Local Setup

### Prerequisites
- **Python**: `3.11+` (3.12 recommended)
- **Node.js**: `v20.x` or `v22.x LTS`
- **Git**: `2.x+`

---

### 1. Backend Setup (Django API)

```bash
# Navigate to backend directory
cd backend

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# (Optional) Seed initial users and intelligence data
python manage.py seed_initial_intel

# Start the Django development server
python manage.py runserver 0.0.0.0:8001
```

---

### 2. Frontend Setup (React + Vite)

```bash
# Navigate to frontend directory
cd ../frontend

# Install npm dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will be live at `http://localhost:5173`.

---

## 🖥️ Desktop Application (Windows)

The application can be compiled as a standalone native Windows executable (`.exe`) with offline caching capabilities:

```bash
# Build frontend distribution
cd frontend
npm run build

# Package Windows Electron application
cd ../desktop
npm install
npm run build:win
```

The installer will be generated in `dist_desktop/FCT SDM Dashboard Desktop Setup.exe`.

---

## 📱 Mobile Application (Android APK)

To build the native Android application package:

```bash
cd frontend

# Build frontend and sync Capacitor Android assets
npm run build
npx cap sync android

# Open in Android Studio or compile with Gradle
cd android
./gradlew assembleDebug
```

The compiled APK will be output at `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 📦 Data Importers & Management Commands

The platform includes built-in CLI commands to batch import datasets from the command line:

```bash
cd backend
source venv/bin/activate

# 1. Import Master Weekly Site Database (WSD)
python manage.py import_sites --file="data/WSD July 2026 V5.1.xlsb"

# 2. Import TNL Microwave & Transmission Links
python manage.py import_tnl_links --file="data/TNL June Distribution 2026.xlsx"

# 3. Import Huawei Fiber Optical Links
python manage.py import_huawei_fiber_links --file="data/FCT Links.xlsx"

# 4. Import IHS Fiber Optical Links
python manage.py import_ihs_fiber_links --file="data/FCT Links.xlsx"

# 5. Automatically provision all SMC FSE user accounts from WSD
# (Available via backend API endpoint: POST /api/sites/sync-fse-accounts/)
```

---

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/token/` | Obtain JWT token pair (login) |
| `GET` | `/api/sites/dashboard-stats/` | Aggregated site statistics scoped by user role |
| `GET` | `/api/sites/` | Paginated site list with multi-column filtering |
| `GET` | `/api/sites/<id>/` | Detailed site profile with hardware specs & history |
| `POST` | `/api/sites/upload-wsd/` | Upload and process master WSD `.xlsb`/`.xlsx` |
| `GET` | `/api/sites/daily-availability/` | Daily availability records & SLA compliance |
| `POST` | `/api/sites/upload-daily-availability/` | Upload daily availability report spreadsheet |
| `GET` | `/api/sites/hourly-availability/` | 24-hour hourly site availability curves |
| `POST` | `/api/sites/upload-hourly-availability/` | Upload hourly availability report spreadsheet |
| `GET` | `/api/sites/huawei-fiber-links/` | List Huawei fiber link routes |
| `GET` | `/api/sites/ihs-fiber-links/` | List IHS fiber link routes |
| `GET` | `/api/sites/tnl-links/` | Transmission links & cascade hierarchy |
| `GET` | `/api/notes/` | Site operational notes and trouble log |
| `POST` | `/api/notes/` | Create new site incident note with image upload |
| `GET` | `/api/whatsapp/messages/` | WhatsApp field group extracted intelligence |
| `POST` | `/api/ai/diagnose/` | AI root cause analysis and diagnosis for site |

---

## ⚙️ Environment Configuration

Create a `.env` file in `backend/` to override default configuration parameters:

```ini
# Django Settings
DEBUG=False
SECRET_KEY=your-secure-django-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

# Database (Optional - defaults to SQLite3)
DATABASE_URL=postgres://sdm_user:password@localhost:5432/sdm_db

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:80,http://localhost
```

---

## 👥 Contributors & Maintainers

- **Project Lead & Architecture**: Christian Ogwara ([@Cogwara](https://github.com/Cogwara))
- **Organization**: Cogwara Telecom Solutions

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
