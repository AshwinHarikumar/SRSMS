# SRSMS (Smart Road Safety Mapping System)

SRSMS is an AI-powered Geographic Information System (GIS) designed to proactively identify, analyze, and prioritize road safety risks across vast regional road networks. By fusing open-source geospatial data with algorithmic risk modeling, it acts as a cutting-edge command center for transport planners and district officers.

![SRSMS Dashboard](https://img.shields.io/badge/Status-Active-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🚀 Key Features

* **Massive-Scale Geographic Ingestion:** Leverages the OpenStreetMap Overpass API to dynamically pull hundreds of thousands of road segments (from National Highways to deep residential streets).
* **AI Risk Engine:** Calculates a localized **Composite Priority Index (PI)** for every road segment by processing:
  * Crash History & Fatalities (Accident Score)
  * Speeding Deviations (Speed Score)
  * Infrastructure Deficits (Lighting, Sidewalks, Guardrails)
* **Real-time Spatial Dashboard:** A blazing-fast, professional-grade React/Leaflet frontend rendering thousands of vectorized high-risk zones, color-coded by urgency (Red, Orange, Yellow, Green).
* **Predictive Machine Learning (AI):** A Random Forest Regressor analyzes 85,000+ data points (speed limits, infrastructure deficits, traffic flow) to generate a **Future Risk Probability** for every road segment.
* **Contextual POI Layers:** Dynamically pull and overlay local Points of Interest (Schools, Hospitals, Police Stations) to cross-reference vulnerable zones with critical infrastructure.
* **Command Center Architecture:** Built-in Data Upload portals for proprietary CSV datasets, automated PDF/CSV report generation, and AI-driven infrastructure recommendations.
* **Dynamic AI Safety Corrections (Groq API):** Dynamically analyzes a selected road segment's risk profile (accident counts, speed limit, road class, sub-scores) and generates 3 customized safety interventions powered by Groq Llama 3.3, with a rules-based fallback engine.

---

## 🏗️ System Architecture

The platform is fully containerized using Docker and is split into four highly specialized microservices:

### 1. The Database (`srsms_db`)
* **Core Tech:** PostgreSQL 15 + PostGIS 3 + pgRouting
* **Role:** The spatial heart of the system. Stores geospatial LineStrings (roads), Points (accidents/POIs), and runs complex geographical bounding box queries.

### 2. The Analytics Engine (`srsms_analytics`)
* **Core Tech:** Python 3.10, Pandas, SQLAlchemy, Shapely
* **Role:** A heavy-lifting background worker.
* **Pipeline:**
  1. `fetch_osm.py`: Connects to OSM, scrapes raw XML/JSON road networks, formats the geometries, and securely inserts them into PostGIS.
  2. `process_all.py`: The Risk Engine. It sweeps the database, calculates the four independent risk scores, computes the Composite PI, assigns color codes, and generates text-based AI safety recommendations.

### 3. The Backend API (`srsms_backend`)
* **Core Tech:** Node.js, Express, TypeScript, node-postgres (pg)
* **Role:** The intermediary REST API. It handles querying the PostGIS database, converting database rows into perfectly formatted `GeoJSON` FeatureCollections, and handling the data-upload routes.

### 4. The Frontend Dashboard (`srsms_frontend`)
* **Core Tech:** React, Vite, Tailwind CSS, React-Leaflet, Recharts, Framer Motion
* **Role:** A lightweight, glassmorphic UI utilizing CartoDB Positron basemaps to render high-density vector data flawlessly. 

---

## ⚙️ How It Works (The Data Flow)

1. **Ingestion Phase:** The administrator triggers the Python ingestion scripts. The system reaches out to OpenStreetMap, downloads the raw geometry of a state (like Kerala), and builds the spatial tables.
2. **Analysis Phase:** The Risk Engine calculates the standard deviation of historical accidents against traffic volume to identify genuine blackspots (rather than just high-traffic corridors). It updates the `priority_indices` table.
3. **Serving Phase:** When a user logs in, the React frontend requests `/api/data/segments`. The Node.js backend runs a highly optimized `ST_AsGeoJSON` query, sorting the results to only return the **Top 2,500 most dangerous roads** to ensure the browser never crashes, regardless of how large the backend dataset grows.
4. **Interactive Phase:** Clicking a road segment triggers a React state update, opening the Segment Profile drawer to display the exact scores, speed limits, and AI recommendations for that specific geographic slice.

---

## 💻 Getting Started (Local Development)

### Prerequisites
* Docker & Docker Compose
* Node.js (for local frontend dev)
* Python (for local analytics dev)

### 1. Boot the Cluster
From the root directory, spin up the entire microservice architecture:
```bash
docker compose up -d --build
```
*Wait ~15 seconds for the PostgreSQL container to initialize the schemas.*

### 2. Ingest the Road Network
Once the database is live, run the analytics scripts to populate the system with live data:
```bash
# Pull the road network from OpenStreetMap
docker exec -i srsms_analytics python /app/fetch_osm.py

# Pull Points of Interest (Hospitals/Schools)
docker exec -i srsms_analytics python /app/fetch_pois.py

# Run the AI Risk Engine on the newly downloaded data
docker exec -i srsms_analytics python /app/process_all.py
```

### 3. Access the Dashboard
Navigate to `http://localhost:5173` in your browser. 
Use the default credentials to access the system:
* **Email:** `admin@srsms.gov`
* **Password:** `password`

---

## ⚡ Serverless Hybrid Deployment (Firebase)

The platform supports a high-performance **Serverless Hybrid Deployment** that runs the dashboard statically on **Firebase Hosting** and reads data directly from **Cloud Firestore** and static CDN assets, requiring **zero backend servers or Cloud Functions** to run!

### Architecture Concept:
* **Statically Cached CDN Assets**: Heavy read-only tables—such as the full database of **all 37,982 accidents**, 2,500 road segments, POIs, VRU indicators, star ratings, and pre-calculated statistics—are compiled into static JSON files, bypassing Firestore document write limits and socket hangs.
* **Cloud Firestore**: Reserved for light, interactive client-side operations (e.g. saving and activating custom AHP priority profiles).
* **Vite Fetch Interceptor**: A global `window.fetch` interceptor hooks into standard React pages client-side when `VITE_USE_FIRESTORE=true` is enabled, routing queries transparently to the CDNs or Firestore database.

### Deployment Walkthrough:

#### Step 1: Export PostgreSQL Data to Static JSON Chunks
While your local Docker containers are running and populated, compile the PostGIS database tables into static JSON files in the frontend repository:
```bash
cd backend
npm run export:static
```
*This queries PostgreSQL, formats the structures as GeoJSON Features, pre-calculates the district and dashboard summaries, and saves the formatted files into `frontend/public/data/` in under 3 seconds.*

#### Step 2: Build the Production Assets
Compile the React bundle. Vite automatically bundles the interceptor logic and moves the static JSON data files into `frontend/dist/data/`:
```bash
cd ../frontend
npm run build
```

#### Step 3: Configure Firebase CLI & Project
Configure the CLI to link to your Firebase project `srsms-2026` (ensure your credentials/serviceAccountKey.json is configured):
```bash
firebase login
firebase use srsms-2026
```

#### Step 4: Deploy to Firebase Hosting & Firestore
Deploy the compiled static app and the security rules (which allow public reads while blocking writes to unauthorized clients):
```bash
firebase deploy
```
*Firebase will deploy:*
1. **Firestore Security Rules**: Configured via `firestore.rules` to secure your Firestore database.
2. **Static Web App**: Configured via `firebase.json` with customized HTTP headers (`Cache-Control: no-cache, no-store, must-revalidate` for `index.html` to prevent browser caching of old JS bundles).

Your deployment is now live!
👉 Deployed Demo URL: **[https://srsms-2026.web.app](https://srsms-2026.web.app)**

---

## 🤖 LLM Safety Interventions (Groq API)

The system includes a dynamic safety advisor that processes the safety attributes of any selected road segment (speed violations, star ratings, blackspot conditions, and individual risk factors) and generates three highly specific, prioritized safety engineering recommendations.

### Key Details:
- **Groq Integration**: Powered by Groq's completions API using the ultra-fast `llama-3.3-70b-versatile` model.
- **Dual API Key Support**:
  - **Backend Configuration**: Set the `GROQ_API_KEY` environment variable in the backend's `.env` file for local development and Docker containers.
  - **Frontend Browser Configuration**: In serverless hosted mode (Firebase Hosting), users can click the settings gear inside the segment drawer to paste their Groq API key, which is saved locally to `localStorage` to authorize client-side chat completions directly.
- **Fail-safe Rules Fallback**: If no API key is configured in either environment, the application uses an internal rules engine to immediately generate data-driven recommendation fallbacks, ensuring there are no UI gaps.

---

## 🛠️ Tech Stack Details

* **Frontend:** Vite + React (TypeScript), Tailwind CSS, React-Leaflet (Vector Mapping), Recharts (Data Viz)
* **Backend:** Node.js + Express (TypeScript), `pg` (node-postgres), Firebase Admin SDK
* **Analytics:** Python, Requests (API Scraper), Pandas, SQLAlchemy
* **Database:** PostgreSQL + PostGIS (Dockerized)
* **Hosting / Cloud:** Firebase Hosting + Cloud Firestore (Serverless)

---
*Built for smarter, safer road networks.*
