#!/bin/bash
echo "=== Building FCT SDM Dashboard Windows Desktop App ==="

# 1. Build Vite web bundle
cd /home/mrchrys/projects/SDM_Dashboard/frontend
npm run build

# 2. Package Electron App
cd /home/mrchrys/projects/SDM_Dashboard/desktop
npm install
npm run build:win

echo "=== Windows Desktop App Built Successfully! Output in dist_desktop/ ==="
