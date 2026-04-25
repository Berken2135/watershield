# WaterShield — Quick Start Guide

Water pollution monitoring platform powered by Sentinel-2 satellite data (Copernicus / openEO).

---

## Prerequisites

Make sure you have installed:

| Tool | Minimum version | Check |
|------|----------------|-------|
| [Docker](https://docs.docker.com/get-docker/) | 24+ | `docker --version` |
| [Docker Compose](https://docs.docker.com/compose/) | v2 (bundled with Docker Desktop) | `docker compose version` |
| [Node.js](https://nodejs.org/) | 18+ | `node --version` |
| [npm](https://www.npmjs.com/) | 9+ | `npm --version` |

---

## 1. Clone the repository

```bash
git clone <your-repo-url>
cd watershield
```

---

## 2. Configure environment variables (Backend)

The backend requires Copernicus Data Space Ecosystem (CDSE) credentials to connect to openEO.

Create the env file that Docker Compose expects:

```bash
cp backend/routers/.env.example backend/routers/.env
```

> If `.env.example` doesn't exist yet, create `backend/routers/.env` manually:

```bash
# backend/routers/.env
CDSE_CLIENT_ID=your_client_id_here
CDSE_CLIENT_SECRET=your_client_secret_here

# Optional — defaults to Copernicus openEO endpoint
OPENEO_URL=https://openeo.dataspace.copernicus.eu
```

Get your credentials at **https://dataspace.copernicus.eu** → My Account → OAuth Clients.

---

## 3. Start the backend (Docker)

From the **project root**:

```bash
cd backend
docker compose up --build
```

- First run downloads the Python base image and installs dependencies (~1–2 min).
- The API will be available at **http://localhost:8000**
- Interactive API docs: **http://localhost:8000/docs**
- Health check: **http://localhost:8000/health**

To run in the background:

```bash
docker compose up --build -d
```

To stop:

```bash
docker compose down
```

---

## 4. Start the frontend (Next.js)

In a **new terminal**, from the project root:

```bash
cd frontend
npm install
npm run dev
```

- First run installs all Node dependencies (~30 sec).
- The app will be available at **http://localhost:3000**

---

## 5. Full stack at a glance

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js map interface |
| Backend API | http://localhost:8000 | FastAPI (Python) |
| API Docs | http://localhost:8000/docs | Swagger UI |

---

## Project structure

```
watershield/
├── backend/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── main.py              # FastAPI app entry point
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py          # CDSE / openEO authentication
│       ├── search.py        # Satellite scene search
│       └── analysis.py      # Water quality analysis
└── frontend/
    ├── app/                 # Next.js App Router pages
    ├── components/          # UI components (Map, shadcn/ui)
    └── lib/                 # Shared data & utilities
```

---

## Common issues

**Backend container exits immediately**
- Check that `backend/routers/.env` exists and contains valid credentials.
- Run `docker compose logs backend` to see the error.

**Frontend can't reach the API**
- Make sure the backend container is running (`docker compose ps`).
- The frontend expects the API at `http://localhost:8000`. CORS is already configured for `localhost:3000`.

**Port already in use**
- Change the host port in `docker-compose.yml`: `"8001:8000"` then update the frontend API URL accordingly.
