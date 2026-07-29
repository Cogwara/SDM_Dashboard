# FCT SDM Dashboard & IHS Matrix - Windows Desktop Application Setup

The FCT SDM Dashboard is packaged as a native **Windows Desktop Application** (`.exe` installer & portable binary) with **Offline Mode** and **Automatic Online Server Sync**.

---

## Key Features

1. **Native Desktop Window**:
   - High-performance 1440x900 native desktop interface with dark theme and hardware acceleration.
   - Independent window frame, desktop shortcuts, and start menu integration.

2. **Full Offline Capabilities**:
   - Work seamlessly without an internet connection or backend server access.
   - Create, edit, and log operational notes, WhatsApp intel, and site updates while offline.
   - Offline actions are queued locally in persistent storage with an active pending counter `(Pending Offline Actions)`.

3. **Automatic Online Server Sync**:
   - When your Windows PC connects to the network / server (port 8001), the app automatically detects connectivity.
   - Automatically pushes all queued offline notes, incident logs, and field updates to the Django backend server.
   - Refreshes local site data and matrix directory seamlessly.

---

## How to Build & Install on Windows

### Method 1: Pre-configured Desktop Setup
1. Double-click **`build_desktop.bat`** in the project root directory.
2. The setup script will build the web distribution and package the native Windows installer.
3. Open the **`dist_desktop`** folder and double-click **`FCT SDM Dashboard Desktop Setup.exe`** to install.

### Method 2: Manual Command Line Build
```cmd
cd frontend
npm run build

cd ..\desktop
npm install
npm run build:win
```

The compiled Windows installer will be saved to `dist_desktop/FCT SDM Dashboard Desktop Setup.exe`.

---

## Server Connection Settings
- Default Backend Server: `http://localhost:8001` (or your network server IP).
- If your server runs on a remote IP (e.g. `192.168.x.x`), enter the IP address in the **Server Settings** modal inside the desktop app.
