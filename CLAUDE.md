# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Floorplan-3D: Upload a 2D floorplan image, detect walls via OpenCV, and render them as a 3D model in the browser using Three.js. The UI and comments are in Chinese.

## Architecture

- **backend/** — Python/Flask API server (port 5000)
  - `app.py` — Single `/upload` POST endpoint: saves uploaded image to `../uploads/`, runs wall detection, returns wall coordinates as JSON
  - `parse_floorplan.py` — OpenCV-based wall detection: adaptive thresholding → morphological closing → dilation → contour finding → bounding rect classification into horizontal/vertical walls. Writes `debug.png` for visual inspection.
- **frontend/** — Static HTML + vanilla JS (no build step)
  - `index.html` — File upload UI, loads Three.js v0.126 and OrbitControls from CDN
  - `app.js` — Three.js scene with OrbitControls. Uploads image to backend, receives wall coords, creates 3D box geometries (wall pixel coords are divided by 100 for scene units)
- **uploads/** — Stores uploaded floorplan images (referenced by backend via relative path `../uploads`)

## Development Commands

### Backend
```bash
cd backend
pip install -r requirements.txt   # flask, opencv-python, numpy
python app.py                     # runs Flask dev server on port 5000
```

### Frontend
Open `frontend/index.html` directly in a browser, or serve it with any static file server. No build or install step. The frontend calls `http://localhost:5000/upload` — the backend must be running.

### Standalone wall detection
```bash
cd backend
python parse_floorplan.py          # reads floorplan.png, writes walls.json and debug.png
```

## Key Data Flow

1. User uploads image via frontend
2. Frontend POSTs file to `http://localhost:5000/upload`
3. Backend saves file to `uploads/`, calls `detect_walls()` which returns list of `{id, x1, z1, x2, z2}` (pixel coordinates)
4. Frontend divides all coordinates by 100 and creates Three.js BoxGeometry walls (height=3, thickness=0.2)

## Wall Detection Pipeline (parse_floorplan.py)

Adaptive threshold → morphological close (7×7 kernel) → dilate (5×5, 2 iterations) → find external contours → filter small rects (<50px) → classify as horizontal (w>h) or vertical wall → return midline coordinates.
