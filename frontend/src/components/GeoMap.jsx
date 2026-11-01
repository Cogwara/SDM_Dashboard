import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polygon, Circle, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, Radio, Eye, ExternalLink, Lock, Database,
  Search, Filter, X, RefreshCw, CheckCircle, AlertTriangle, Building2, Navigation,
  FileText, Clock, Crosshair, Locate, Target, Activity,
  ChevronDown, ChevronUp, Copy, Check,
  Ruler, Route, Milestone, ArrowUpDown, ArrowRight, CornerDownRight, Plus, Trash2, GitFork, ArrowLeftRight, Layers,
  Users, Globe, Shield
} from 'lucide-react';
import { fetchMapSites, fetchNotes, fetchSiteCellSectors, fetchCellSectors, fetchKmlStats, geocodeLocation } from '../api';
import { haversineKm, formatDistance, calculateBearing, parseCoordinates } from '../utils/geoUtils';
import { getSDMStateInfo } from '../utils/userUtils';

// Cache map icons to avoid re-instantiating L.divIcon on every render
const markerIconCache = new Map();

const getSiteMarkerIcon = (fillColor, strokeColor = '#ffffff', hasBadge = false, siteId = '', isFocused = false, showSiteLabel = true) => {
  const cacheKey = `${fillColor}_${strokeColor}_${hasBadge}_${siteId}_${isFocused}_${showSiteLabel}`;
  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const badgeSvg = hasBadge ? `
    <circle cx="19" cy="5" r="4.5" fill="#f43f5e" stroke="#ffffff" stroke-width="1.4"/>
    <path d="M19 3.2 V 5.2 M 19 6.5 V 6.7" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
  ` : '';

  const pinSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="26" height="36" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
      <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 36 12 36 C12 36 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.8"/>
      <circle cx="12" cy="12" r="5.5" fill="#ffffff"/>
      <circle cx="12" cy="12" r="3.5" fill="${fillColor}"/>
      ${badgeSvg}
    </svg>
  `;

  let html;
  let iconSize;
  let iconAnchor;
  let popupAnchor;

  if (showSiteLabel && siteId) {
    const textColor = isFocused
      ? '#38bdf8'
      : fillColor === '#ef4444'
      ? '#fca5a5'
      : fillColor === '#f59e0b'
      ? '#fde047'
      : '#a7f3d0';

    const borderColor = isFocused
      ? '#06b6d4'
      : fillColor === '#ef4444'
      ? '#f87171'
      : fillColor === '#f59e0b'
      ? '#fbbf24'
      : '#34d399';

    const glowColor = isFocused
      ? 'rgba(6, 182, 212, 0.6)'
      : fillColor === '#ef4444'
      ? 'rgba(239, 68, 68, 0.4)'
      : fillColor === '#f59e0b'
      ? 'rgba(245, 158, 11, 0.4)'
      : 'rgba(16, 185, 129, 0.3)';

    html = `
      <div class="telecom-marker-with-label" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        width: 120px;
        height: 58px;
        pointer-events: auto;
        user-select: none;
      ">
        <div style="
          background: rgba(15, 23, 42, 0.95);
          color: ${textColor};
          border: 1.5px solid ${borderColor};
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 10px;
          font-weight: 800;
          line-height: 12px;
          padding: 1.5px 5px;
          border-radius: 4px;
          white-space: nowrap;
          box-shadow: 0 3px 8px rgba(0,0,0,0.8), 0 0 6px ${glowColor};
          margin-bottom: 2px;
          letter-spacing: 0.3px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.9);
          max-width: 110px;
          overflow: hidden;
          text-overflow: ellipsis;
        ">
          ${siteId}
        </div>
        ${pinSvg}
      </div>
    `;
    iconSize = [120, 58];
    iconAnchor = [60, 58];
    popupAnchor = [0, -56];
  } else {
    html = pinSvg;
    iconSize = [26, 36];
    iconAnchor = [13, 36];
    popupAnchor = [0, -34];
  }

  const icon = L.divIcon({
    className: 'custom-telecom-marker',
    html,
    iconSize,
    iconAnchor,
    popupAnchor
  });

  markerIconCache.set(cacheKey, icon);
  return icon;
};

const getSearchedLocationIcon = (title = 'Searched Location') => {
  const cleanTitle = title.length > 20 ? title.substring(0, 18) + '...' : title;
  const cacheKey = `searched_loc_${cleanTitle}`;
  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const html = `
    <div class="searched-location-marker-container" style="
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      width: 150px;
      height: 80px;
      pointer-events: auto;
      user-select: none;
    ">
      <!-- Pulsing Radar Waves -->
      <div style="
        position: absolute;
        bottom: 2px;
        left: 50%;
        transform: translateX(-50%);
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(6, 182, 212, 0.4);
        border: 2px solid #22d3ee;
        animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        pointer-events: none;
      "></div>

      <!-- Target Pin Banner Label -->
      <div style="
        background: linear-gradient(135deg, #0f172a 0%, #0369a1 100%);
        color: #ffffff;
        border: 1.5px solid #38bdf8;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 10px;
        font-weight: 800;
        line-height: 12px;
        padding: 2px 7px;
        border-radius: 6px;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.9), 0 0 10px rgba(14,165,233,0.7);
        margin-bottom: 3px;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 4px;
        z-index: 10;
      ">
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #22d3ee; box-shadow: 0 0 6px #22d3ee;"></span>
        ${cleanTitle}
      </div>

      <!-- Target Beacon SVG Pin -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="32" height="44" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.8)); z-index: 10;">
        <defs>
          <linearGradient id="searchTargetPinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38bdf8" />
            <stop offset="100%" stop-color="#0284c7" />
          </linearGradient>
        </defs>
        <path d="M16 0 C7.16 0 0 7.16 0 16 C0 28 16 44 16 44 C16 44 32 28 32 16 C32 7.16 24.84 0 16 0 Z" fill="url(#searchTargetPinGrad)" stroke="#ffffff" stroke-width="2"/>
        <circle cx="16" cy="16" r="8" fill="#0f172a" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="4.5" fill="#22d3ee"/>
        <!-- Crosshairs -->
        <line x1="16" y1="9" x2="16" y2="12" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="16" y1="20" x2="16" y2="23" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="9" y1="16" x2="12" y2="16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="20" y1="16" x2="23" y2="16" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
  `;

  const icon = L.divIcon({
    className: 'custom-telecom-marker',
    html,
    iconSize: [150, 80],
    iconAnchor: [75, 80],
    popupAnchor: [0, -78]
  });

  markerIconCache.set(cacheKey, icon);
  return icon;
};

// Waypoint Letter generator (0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA...)
export const getWaypointLetter = (index) => {
  if (index < 26) return String.fromCharCode(65 + index);
  const first = String.fromCharCode(65 + Math.floor(index / 26) - 1);
  const second = String.fromCharCode(65 + (index % 26));
  return `${first}${second}`;
};

// High-contrast vibrant path color palette for telecom path comparison
export const PATH_COLORS = [
  { id: 'cyan', hex: '#06b6d4', name: 'Cyan (Route 1)', bgClass: 'bg-cyan-500', textClass: 'text-cyan-400', borderClass: 'border-cyan-500' },
  { id: 'amber', hex: '#f59e0b', name: 'Amber (Route 2)', bgClass: 'bg-amber-500', textClass: 'text-amber-400', borderClass: 'border-amber-500' },
  { id: 'purple', hex: '#a855f7', name: 'Purple (Route 3)', bgClass: 'bg-purple-500', textClass: 'text-purple-400', borderClass: 'border-purple-500' },
  { id: 'emerald', hex: '#10b981', name: 'Emerald (Route 4)', bgClass: 'bg-emerald-500', textClass: 'text-emerald-400', borderClass: 'border-emerald-500' },
  { id: 'rose', hex: '#f43f5e', name: 'Rose (Route 5)', bgClass: 'bg-rose-500', textClass: 'text-rose-400', borderClass: 'border-rose-500' },
  { id: 'blue', hex: '#3b82f6', name: 'Blue (Route 6)', bgClass: 'bg-blue-500', textClass: 'text-blue-400', borderClass: 'border-blue-500' },
];

// Custom Waypoint Marker Icon with Letter badge and path color
const getWaypointMarkerIcon = (letter, color = '#06b6d4', siteId = '', isStart = false, isEnd = false) => {
  const cacheKey = `wp_icon_${letter}_${color}_${siteId}_${isStart}_${isEnd}`;
  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const roleBadge = isStart ? 'ORIGIN' : isEnd ? 'TERM' : null;
  const roleBadgeHtml = roleBadge ? `
    <span style="
      background: ${isStart ? '#10b981' : '#ef4444'};
      color: #ffffff;
      font-size: 8px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 3px;
      letter-spacing: 0.5px;
      margin-left: 3px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    ">${roleBadge}</span>
  ` : '';

  const html = `
    <div class="custom-waypoint-marker" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      width: 110px;
      height: 62px;
      pointer-events: auto;
      user-select: none;
    ">
      <!-- Site & Letter Label Pill -->
      <div style="
        background: rgba(15, 23, 42, 0.96);
        color: #ffffff;
        border: 1.8px solid ${color};
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        font-weight: 800;
        line-height: 12px;
        padding: 2px 6px;
        border-radius: 6px;
        white-space: nowrap;
        box-shadow: 0 4px 10px rgba(0,0,0,0.85), 0 0 8px ${color}88;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 3px;
        max-width: 105px;
        overflow: hidden;
      ">
        <span style="
          background: ${color};
          color: #0f172a;
          font-weight: 900;
          font-size: 10px;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">${letter}</span>
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${siteId || `Point ${letter}`}</span>
        ${roleBadgeHtml}
      </div>

      <!-- Waypoint Pin SVG -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36" style="display: block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.7));">
        <path d="M14 0 C6.27 0 0 6.27 0 14 C0 24.5 14 36 14 36 C14 36 28 24.5 28 14 C28 6.27 21.73 0 14 0 Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="14" cy="14" r="8.5" fill="#0f172a"/>
        <text x="14" y="18" text-anchor="middle" fill="${color}" font-family="system-ui, sans-serif" font-weight="900" font-size="11px">${letter}</text>
      </svg>
    </div>
  `;

  const icon = L.divIcon({
    className: 'custom-telecom-waypoint-icon',
    html,
    iconSize: [110, 62],
    iconAnchor: [55, 62],
    popupAnchor: [0, -60]
  });

  markerIconCache.set(cacheKey, icon);
  return icon;
};

// Midpoint Leg Distance Pill Marker Icon
const getMidpointDistanceIcon = (distText, bearingText, color = '#06b6d4') => {
  const cacheKey = `mid_icon_${distText}_${bearingText}_${color}`;
  if (markerIconCache.has(cacheKey)) {
    return markerIconCache.get(cacheKey);
  }

  const html = `
    <div style="
      background: rgba(15, 23, 42, 0.96);
      color: #ffffff;
      border: 1.5px solid ${color};
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 9999px;
      white-space: nowrap;
      box-shadow: 0 3px 8px rgba(0,0,0,0.85), 0 0 8px ${color}66;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      transform: translate(-50%, -50%);
      pointer-events: auto;
    ">
      <span style="color: ${color}; font-weight: 900;">${distText}</span>
      <span style="color: #94a3b8; font-size: 9px; font-weight: 700;">${bearingText}</span>
    </div>
  `;

  const icon = L.divIcon({
    className: 'custom-midpoint-distance-icon',
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });

  markerIconCache.set(cacheKey, icon);
  return icon;
};

// Helper component to fit map bounds to route
function MapBoundsFitter({ boundsToFit, onFitted }) {
  const map = useMap();
  useEffect(() => {
    if (boundsToFit && boundsToFit.length >= 2) {
      try {
        map.fitBounds(boundsToFit, { padding: [60, 60], maxZoom: 16 });
        if (onFitted) onFitted();
      } catch (e) {}
    }
  }, [boundsToFit, map, onFitted]);
  return null;
}

// Leaflet map click listener for Measure Mode
function MapMeasureClickHandler({ isMeasuringMode, onMapClick }) {
  useMapEvents({
    click(e) {
      if (!isMeasuringMode) return;
      onMapClick(e.latlng);
    }
  });
  return null;
}

// Helper component to programmatically pan/zoom Leaflet map
function MapController({ targetCoords, zoomLevel }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && targetCoords[0] && targetCoords[1]) {
      map.flyTo(targetCoords, zoomLevel || 14, { duration: 1.2 });
    }
  }, [targetCoords, zoomLevel, map]);
  return null;
}

// Helper component to automatically fix Leaflet container sizing on tab switch or fullscreen toggle
function MapResizeInvalidator({ isFullscreen }) {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 100);
    const t2 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {}
    }, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [map, isFullscreen]);
  return null;
}

// Dynamic Viewport Bounds & 4G LTE Sector Loader
function MapViewportSectorLoader({ showRfSectors, onBoundsChange, onViewportChange }) {
  const map = useMap();

  useEffect(() => {
    let timeoutId = null;
    const triggerBounds = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          const b = map.getBounds();
          const south = b.getSouth();
          const west = b.getWest();
          const north = b.getNorth();
          const east = b.getEast();
          const zoom = map.getZoom();
          if (onViewportChange) {
            onViewportChange({ south, west, north, east, zoom });
          }
          if (showRfSectors && onBoundsChange) {
            const bbox = `${south},${west},${north},${east}`;
            onBoundsChange(bbox);
          }
        } catch (e) {}
      }, 150);
    };

    triggerBounds();
    map.on('moveend', triggerBounds);
    map.on('zoomend', triggerBounds);

    return () => {
      clearTimeout(timeoutId);
      map.off('moveend', triggerBounds);
      map.off('zoomend', triggerBounds);
    };
  }, [map, showRfSectors, onBoundsChange, onViewportChange]);

  return null;
}

export default function GeoMap({ onSelectSite, currentUser }) {
  const isSuperuser = Boolean(currentUser?.is_superuser);
  const userSdmName = currentUser?.full_name || currentUser?.username || '';
  const userRole = currentUser?.role || '';
  const userStateProp = currentUser?.state || '';
  const stateInfo = useMemo(
    () => getSDMStateInfo(currentUser),
    [userSdmName, userRole, userStateProp, isSuperuser]
  );

  const [sites, setSites] = useState([]);
  const [openNotesBySite, setOpenNotesBySite] = useState({});
  const [loading, setLoading] = useState(true);
  const [showSiteLabels, setShowSiteLabels] = useState(true);
  const [viewportBounds, setViewportBounds] = useState(null);
  const [mapTileStyle, setMapTileStyle] = useState('street'); // 'street' | 'dark' | 'satellite'
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  // 4G LTE KML RF Sector States (default off for instant map load; user can toggle on)
  const [showRfSectors, setShowRfSectors] = useState(false);
  const [kmlStats, setKmlStats] = useState(null);
  const [mapSectors, setMapSectors] = useState([]);
  const [focusedSectors, setFocusedSectors] = useState([]);
  const [loadingMapSectors, setLoadingMapSectors] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState('All');
  const [pciFilter, setPciFilter] = useState('All');
  const [sectorSearchQuery, setSectorSearchQuery] = useState('');
  const [sectorSearchResults, setSectorSearchResults] = useState([]);
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [activeFocusedSector, setActiveFocusedSector] = useState(null);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLga, setSelectedLga] = useState('All');
  const [selectedFse, setSelectedFse] = useState('All');
  const [selectedCluster, setSelectedCluster] = useState('All');
  const [selectedTowerCo, setSelectedTowerCo] = useState('All');
  const [selectedTerritory, setSelectedTerritory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  
  // Searched Location & Proximity States
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [proximityRadiusKm, setProximityRadiusKm] = useState(5);
  const [showOnlyWithinRadius, setShowOnlyWithinRadius] = useState(true);
  const [showProximityDrawer, setShowProximityDrawer] = useState(true);
  const [isSearchingGeocode, setIsSearchingGeocode] = useState(false);
  const [geocodeSuggestions, setGeocodeSuggestions] = useState([]);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  // 📐 Multi-Path Distance Measurement States
  const [paths, setPaths] = useState([
    {
      id: 'path-1',
      name: 'Path 1',
      color: PATH_COLORS[0].hex,
      colorId: PATH_COLORS[0].id,
      waypoints: []
    }
  ]);
  const [activePathId, setActivePathId] = useState('path-1');
  const [isMeasuringMode, setIsMeasuringMode] = useState(false);
  const [showMeasureDrawer, setShowMeasureDrawer] = useState(false);
  const [measureSearchQuery, setMeasureSearchQuery] = useState('');
  const [measureDrawerTab, setMeasureDrawerTab] = useState('active'); // 'active' | 'compare'
  const [copiedPathReport, setCopiedPathReport] = useState(false);
  const [boundsToFit, setBoundsToFit] = useState(null);

  // Active map focus site
  const [activeFocusedSiteId, setActiveFocusedSiteId] = useState(null);
  const [mapTargetCoords, setMapTargetCoords] = useState(null);
  const [mapZoom, setMapZoom] = useState(11);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Default Abuja FCT Center (9.0765° N, 7.3986° E)
  const defaultCenter = [9.0765, 7.3986];

  useEffect(() => {
    fetchKmlStats().then(data => setKmlStats(data)).catch(() => {});
  }, []);

  // Viewport bounds change handler for dynamic sector wedge streaming
  const handleBoundsChange = useCallback(async (bbox) => {
    if (!showRfSectors) return;
    setLoadingMapSectors(true);
    try {
      const res = await fetchCellSectors({ bbox, limit: 1200 });
      if (res && res.results) {
        setMapSectors(res.results);
      }
    } catch (err) {
      console.error('Failed to load viewport sectors:', err);
    } finally {
      setLoadingMapSectors(false);
    }
  }, [showRfSectors]);

  // Initial load of default sectors when map loads or toggle enabled
  useEffect(() => {
    if (showRfSectors && mapSectors.length === 0) {
      setLoadingMapSectors(true);
      fetchCellSectors({ limit: 1000 }).then(res => {
        if (res && res.results) setMapSectors(res.results);
      }).catch(() => {}).finally(() => setLoadingMapSectors(false));
    }
  }, [showRfSectors]);

  // Live Sector Search with autocomplete
  useEffect(() => {
    if (!sectorSearchQuery.trim()) {
      setSectorSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetchCellSectors({ search: sectorSearchQuery.trim(), limit: 40 });
        if (res && res.results) {
          setSectorSearchResults(res.results);
        }
      } catch (e) {}
    }, 250);
    return () => clearTimeout(timer);
  }, [sectorSearchQuery]);

  // Load focused site's complete sectors
  useEffect(() => {
    if (!activeFocusedSiteId) {
      setFocusedSectors([]);
      return;
    }
    const loadSiteSectors = async () => {
      try {
        const res = await fetchSiteCellSectors(activeFocusedSiteId);
        if (res && res.sectors) {
          setFocusedSectors(res.sectors);
        }
      } catch (err) {
        console.error('Failed to load site sectors:', err);
      }
    };
    loadSiteSectors();
  }, [activeFocusedSiteId]);

  // Combine and deduplicate active sectors to render
  const renderedSectors = useMemo(() => {
    if (!showRfSectors) return [];
    const secMap = new Map();
    mapSectors.forEach(s => secMap.set(s.id, s));
    focusedSectors.forEach(s => secMap.set(s.id, s));
    if (activeFocusedSector) secMap.set(activeFocusedSector.id, activeFocusedSector);

    let list = Array.from(secMap.values());

    if (selectedLayer !== 'All') {
      list = list.filter(s => s.layer === selectedLayer);
    }

    if (pciFilter !== 'All') {
      const numPci = parseInt(pciFilter, 10);
      list = list.filter(s => s.pci === numPci);
    }

    return list;
  }, [showRfSectors, mapSectors, focusedSectors, activeFocusedSector, selectedLayer, pciFilter]);

  const loadMapData = async () => {
    setLoading(true);
    try {
      const isFse =
        currentUser?.role === 'SMC FSE Engineer' ||
        currentUser?.role === 'FSE Engineer';
      const isRdm =
        currentUser?.role === 'MTN RDM' ||
        currentUser?.role === 'Regional Delivery Manager' ||
        Boolean(currentUser?.groups?.some((g) => g.name?.includes('RDM')));
      const isSdm = !isSuperuser && !isRdm && !isFse;

      const sdmParam = isSdm ? (currentUser?.full_name || currentUser?.username) : undefined;
      const rdmParam = isRdm ? (currentUser?.full_name || currentUser?.username) : undefined;
      const fseParam = isFse ? (currentUser?.full_name || currentUser?.username) : undefined;
      const stateParam = isRdm || isSuperuser ? undefined : stateInfo?.code;
      
      const [sitesData, notesData] = await Promise.all([
        fetchMapSites({
          rdm: rdmParam,
          sdm: sdmParam,
          fse: fseParam,
          role: currentUser?.role,
          user_role: currentUser?.role,
          is_superuser: isSuperuser ? 'true' : 'false',
          user_state: stateParam,
          page_size: 25000
        }),
        fetchNotes({
          rdm: rdmParam,
          sdm: sdmParam,
          fse: fseParam,
          role: currentUser?.role,
          user_role: currentUser?.role,
          is_superuser: isSuperuser ? 'true' : 'false',
          user_state: stateParam,
          page_size: 1500
        })
      ]);

      const sitesList = Array.isArray(sitesData) ? sitesData : (sitesData?.results || sitesData || []);
      const notesList = Array.isArray(notesData) ? notesData : (notesData?.results || notesData || []);

      setSites(sitesList);

      // Auto-center map on first valid site if available
      const firstValidSite = sitesList.find(s => {
        const c = getSiteCoordinates(s);
        return c && c.lat && c.lng;
      });
      if (firstValidSite) {
        const c = getSiteCoordinates(firstValidSite);
        setMapTargetCoords([c.lat, c.lng]);
      }

      // Index open/active notes by site ihs_site_id and numeric site ID
      const notesMap = {};
      notesList.forEach((note) => {
        const noteStatus = (note.status || '').toLowerCase();
        if (noteStatus === 'open' || noteStatus === 'in progress' || noteStatus === 'escalated') {
          const keyIhs = note.site_ihs_id;
          const keyNumeric = note.site;

          [keyIhs, keyNumeric].forEach((k) => {
            if (k) {
              if (!notesMap[k]) notesMap[k] = [];
              notesMap[k].push(note);
            }
          });
        }
      });

      setOpenNotesBySite(notesMap);

    } catch (e) {
      console.error('Failed to load map sites and notes data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMapData();
  }, [currentUser]);

  // Helper to resolve open notes for a specific site
  const getSiteOpenNotes = (site) => {
    const byIhsId = openNotesBySite[site.ihs_site_id] || [];
    const byNumericId = openNotesBySite[site.id] || [];
    
    // Combine & deduplicate by note.id
    const combined = [...byIhsId, ...byNumericId];
    const uniqueNotesMap = {};
    combined.forEach(n => {
      if (n.id) uniqueNotesMap[n.id] = n;
    });
    return Object.values(uniqueNotesMap);
  };

  // Helper to resolve LGA from site data
  const getSiteLga = (site) => {
    if (site.lga && site.lga.trim()) return site.lga.trim();
    const raw = site.raw_data || {};
    const lgaVal = raw['LGA'] || raw['lga'] || raw['Lga'] || raw['Local Government Area'] || raw['LOCAL GOVERNMENT AREA'];
    if (lgaVal && String(lgaVal).trim()) return String(lgaVal).trim();
    return site.state ? site.state.trim() : null;
  };

  // Helper to resolve SMC FSE Engineer from site data
  const getSiteFse = (site) => {
    if (site.smc_fse_name && site.smc_fse_name.trim()) return site.smc_fse_name.trim();
    const raw = site.raw_data || {};
    const val = raw['SMC FSE'] || raw['SMC_FSE'] || raw['FSE Engineer'] || raw['FSE'] || raw['smc_fse_name'];
    if (val && String(val).trim()) return String(val).trim();
    return null;
  };

  // Helper to resolve Cluster Name from site data
  const getSiteCluster = (site) => {
    if (site.cluster_name && site.cluster_name.trim()) return site.cluster_name.trim();
    const raw = site.raw_data || {};
    const val = raw['Site Cluster'] || raw['Cluster Name'] || raw['Cluster'] || raw['cluster_name'];
    if (val && String(val).trim()) return String(val).trim();
    return null;
  };

  // Helper to resolve Tower Co from site data
  const getSiteTowerCo = (site) => {
    if (!site) return null;
    if (site.tower_co && String(site.tower_co).trim()) return String(site.tower_co).trim();
    const raw = site.raw_data || {};
    const val = raw['Tower Co'] || raw['TowerCo'] || raw['TOWER CO'] || raw['OEM'] || raw['tower_co'] || raw['Tower Co.'];
    if (val && String(val).trim()) return String(val).trim();
    if (site.smc && String(site.smc).trim()) return String(site.smc).trim();
    return null;
  };

  // Helper to resolve Territory from site data
  const getSiteTerritory = (site) => {
    if (!site) return null;
    let t = null;
    if (site.territory && String(site.territory).trim()) {
      t = String(site.territory).trim();
    } else {
      const raw = site.raw_data || {};
      const val = raw['TERRITORY'] || raw['Territory'] || raw['territory'] || raw['AREA NAME'] || raw['Area Name'] || raw['area_name'];
      if (val && String(val).trim()) t = String(val).trim();
    }
    if (t && !['0', 'none', 'null', '-', 'nan'].includes(t.toLowerCase())) {
      return t;
    }
    return null;
  };

  // Deterministic coordinate generator for sites missing lat/long
  const getSiteCoordinates = (site) => {
    const raw = site.raw_data || {};
    let lat = site.latitude || parseFloat(raw['Lat']) || parseFloat(raw['LATITUDE']);
    let lng = site.longitude || parseFloat(raw['Long']) || parseFloat(raw['LONGITUDE']);

    if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat >= 3.5 && lat <= 14.5 && lng >= 2.0 && lng <= 15.0) {
      return { lat, lng };
    }

    // Fallback hashing around regional center
    let hash = 0;
    const str = site.ihs_site_id || 'FC0001';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const offsetLat = ((hash % 1000) / 10000) * (hash % 2 === 0 ? 1 : -1);
    const offsetLng = (((hash >> 3) % 1000) / 10000) * (hash % 3 === 0 ? 1 : -1);

    return {
      lat: Number((9.0765 + offsetLat).toFixed(6)),
      lng: Number((7.3986 + offsetLng).toFixed(6))
    };
  };

  // Extract unique LGAs dynamically ONLY from the user's assigned/scoped dataset
  const lgaOptions = useMemo(() => {
    const extracted = sites.map(s => getSiteLga(s)).filter(Boolean);
    return Array.from(new Set(extracted)).sort();
  }, [sites]);

  // Extract unique SMC FSE Engineers dynamically
  const fseOptions = useMemo(() => {
    const extracted = sites.map(s => getSiteFse(s)).filter(Boolean);
    return Array.from(new Set(extracted)).sort();
  }, [sites]);

  // Extract unique Cluster Names dynamically
  const clusterOptions = useMemo(() => {
    const extracted = sites.map(s => getSiteCluster(s)).filter(Boolean);
    return Array.from(new Set(extracted)).sort();
  }, [sites]);

  // Extract unique Tower Cos dynamically
  const towerCoOptions = useMemo(() => {
    const extracted = sites.map(s => getSiteTowerCo(s)).filter(Boolean);
    return Array.from(new Set(extracted)).sort();
  }, [sites]);

  // Extract unique Territories dynamically
  const territoryOptions = useMemo(() => {
    const extracted = sites
      .map(s => getSiteTerritory(s))
      .filter(Boolean)
      .map(t => String(t).trim());
    return Array.from(new Set(extracted)).sort();
  }, [sites]);

  // Live coordinate check
  const coordinateMatch = useMemo(() => parseCoordinates(searchTerm), [searchTerm]);

  // Live Geocoding / Street / Area Search with debounce
  useEffect(() => {
    const q = searchTerm.trim();
    if (!q || q.length < 2) {
      setGeocodeSuggestions([]);
      setIsSearchingGeocode(false);
      return;
    }

    if (coordinateMatch) {
      setGeocodeSuggestions([]);
      setIsSearchingGeocode(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingGeocode(true);
      try {
        const results = await geocodeLocation(q, stateInfo?.code);
        setGeocodeSuggestions(results || []);
      } catch (e) {
        console.error('Geocode search failed:', e);
      } finally {
        setIsSearchingGeocode(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, coordinateMatch, stateInfo?.code]);

  // Proximity from searchedLocation to every loaded site
  const nearbySitesRanked = useMemo(() => {
    if (!searchedLocation || sites.length === 0) return [];
    return sites
      .map((site) => {
        const coords = getSiteCoordinates(site);
        const distKm = haversineKm(searchedLocation.lat, searchedLocation.lng, coords.lat, coords.lng);
        const bearing = calculateBearing(searchedLocation.lat, searchedLocation.lng, coords.lat, coords.lng);
        return {
          ...site,
          distKm,
          coords,
          bearing
        };
      })
      .sort((a, b) => a.distKm - b.distKm);
  }, [searchedLocation, sites]);

  // Subset of nearby sites matching radius
  const nearbySitesWithinRadius = useMemo(() => {
    if (!searchedLocation) return [];
    if (proximityRadiusKm === 'All') return nearbySitesRanked;
    return nearbySitesRanked.filter(s => s.distKm <= proximityRadiusKm);
  }, [searchedLocation, nearbySitesRanked, proximityRadiusKm]);

  // Area health and stats around searched location
  const nearbyStats = useMemo(() => {
    if (!searchedLocation || nearbySitesWithinRadius.length === 0) return null;
    const total = nearbySitesWithinRadius.length;
    const operational = nearbySitesWithinRadius.filter(s => !(s.is_down || s.operational_status?.toLowerCase().includes('down'))).length;
    const outages = nearbySitesWithinRadius.filter(s => s.is_down || s.operational_status?.toLowerCase().includes('down')).length;
    const openNotes = nearbySitesWithinRadius.filter(s => getSiteOpenNotes(s).length > 0).length;
    const closestSite = nearbySitesWithinRadius[0];
    return {
      total,
      operational,
      outages,
      openNotes,
      closestSite
    };
  }, [searchedLocation, nearbySitesWithinRadius, openNotesBySite]);

  // Filtered sites array based on Search term, LGA, Status, and Searched Location Proximity
  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      // 1. Proximity Filtering when a searched location is active
      if (searchedLocation && showOnlyWithinRadius && proximityRadiusKm !== 'All') {
        const coords = getSiteCoordinates(site);
        const dist = haversineKm(searchedLocation.lat, searchedLocation.lng, coords.lat, coords.lng);
        if (dist > proximityRadiusKm) return false;
      }

      // 2. Search term match (applies only when NO searched location is active)
      if (!searchedLocation && searchTerm.trim() && !coordinateMatch) {
        const q = searchTerm.toLowerCase().trim();
        const siteId = (site.ihs_site_id || '').toLowerCase();
        const rawName = (site.raw_data?.['Site Name'] || site.cluster_name || '').toLowerCase();
        const address = (site.site_address || '').toLowerCase();
        const fse = (site.smc_fse_name || '').toLowerCase();
        const mtnId = (site.mtn_id || '').toLowerCase();
        const lga = getSiteLga(site).toLowerCase();

        const matches = siteId.includes(q) || rawName.includes(q) || address.includes(q) || fse.includes(q) || mtnId.includes(q) || lga.includes(q);
        if (!matches) return false;
      }

      // 3. LGA filter match
      if (selectedLga !== 'All') {
        const siteLga = getSiteLga(site);
        if (!siteLga || siteLga.trim().toLowerCase() !== selectedLga.trim().toLowerCase()) return false;
      }

      // 4. Territory filter match
      if (selectedTerritory !== 'All') {
        const siteTerr = getSiteTerritory(site);
        if (!siteTerr || siteTerr.trim().toLowerCase() !== selectedTerritory.trim().toLowerCase()) return false;
      }

      // 5. Cluster Name filter match
      if (selectedCluster !== 'All') {
        const siteCluster = getSiteCluster(site);
        if (!siteCluster || siteCluster.trim().toLowerCase() !== selectedCluster.trim().toLowerCase()) return false;
      }

      // 6. SMC FSE Engineer filter match
      if (selectedFse !== 'All') {
        const siteFse = getSiteFse(site);
        if (!siteFse || siteFse.trim().toLowerCase() !== selectedFse.trim().toLowerCase()) return false;
      }

      // 7. Tower Co filter match
      if (selectedTowerCo !== 'All') {
        const siteTowerCo = getSiteTowerCo(site);
        if (!siteTowerCo || siteTowerCo.trim().toLowerCase() !== selectedTowerCo.trim().toLowerCase()) return false;
      }

      // 8. Status filter match
      const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
      const siteOpenNotes = getSiteOpenNotes(site);
      const hasOpenNotes = siteOpenNotes.length > 0;

      if (selectedStatus === 'Operational' && isDown) return false;
      if (selectedStatus === 'Down' && !isDown) return false;
      if (selectedStatus === 'OpenNotes' && !hasOpenNotes) return false;

      return true;
    });
  }, [sites, openNotesBySite, searchTerm, selectedLga, selectedTerritory, selectedCluster, selectedFse, selectedTowerCo, selectedStatus, searchedLocation, showOnlyWithinRadius, proximityRadiusKm, coordinateMatch]);

  // Operational & Outage & Open Notes statistics for current view
  const operationalCount = useMemo(() => {
    return filteredSites.filter(s => !(s.is_down || s.operational_status?.toLowerCase().includes('down'))).length;
  }, [filteredSites]);

  const outageCount = useMemo(() => {
    return filteredSites.filter(s => s.is_down || s.operational_status?.toLowerCase().includes('down')).length;
  }, [filteredSites]);

  const openNotesCount = useMemo(() => {
    return filteredSites.filter(s => getSiteOpenNotes(s).length > 0).length;
  }, [filteredSites, openNotesBySite]);

  // Viewport-culled & capped markers so React-Leaflet never mounts 21,000+ DOM nodes at once
  const visibleMapSites = useMemo(() => {
    const MAX_MARKERS = 450;
    let pool = filteredSites;

    if (viewportBounds && !searchedLocation && !searchTerm.trim()) {
      const latPad = Math.max(0.08, (viewportBounds.north - viewportBounds.south) * 0.2);
      const lngPad = Math.max(0.08, (viewportBounds.east - viewportBounds.west) * 0.2);
      const minLat = viewportBounds.south - latPad;
      const maxLat = viewportBounds.north + latPad;
      const minLng = viewportBounds.west - lngPad;
      const maxLng = viewportBounds.east + lngPad;

      const inBounds = filteredSites.filter((site) => {
        if (site.ihs_site_id === activeFocusedSiteId) return true;
        const { lat, lng } = getSiteCoordinates(site);
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });
      if (inBounds.length > 0) {
        pool = inBounds;
      }
    }

    if (pool.length <= MAX_MARKERS) {
      return pool;
    }

    // Prioritize focused site, down sites, and sites with open notes, then sample evenly
    const prioritySites = [];
    const regularSites = [];
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      const isDown = s.is_down || s.operational_status?.toLowerCase().includes('down');
      const hasNotes = getSiteOpenNotes(s).length > 0;
      if (s.ihs_site_id === activeFocusedSiteId || isDown || hasNotes) {
        prioritySites.push(s);
      } else {
        regularSites.push(s);
      }
    }

    if (prioritySites.length >= MAX_MARKERS) {
      return prioritySites.slice(0, MAX_MARKERS);
    }

    const remainingSlots = MAX_MARKERS - prioritySites.length;
    const step = Math.max(1, Math.floor(regularSites.length / remainingSlots));
    const sampled = [];
    for (let i = 0; i < regularSites.length && sampled.length < remainingSlots; i += step) {
      sampled.push(regularSites[i]);
    }
    return [...prioritySites, ...sampled];
  }, [filteredSites, viewportBounds, searchedLocation, searchTerm, activeFocusedSiteId, openNotesBySite]);

  // Direct Site Selection / Focus from Search or Dropdown
  const handleFocusSite = (site) => {
    const { lat, lng } = getSiteCoordinates(site);
    setActiveFocusedSiteId(site.ihs_site_id);
    setMapTargetCoords([lat, lng]);
    setMapZoom(16);
    setShowSearchResults(false);
  };

  // Handle setting a searched location (coordinate, street, area, landmark, or GPS)
  const handleSelectSearchedLocation = (loc) => {
    setSearchedLocation(loc);
    setMapTargetCoords([loc.lat, loc.lng]);
    setMapZoom(14);
    setShowSearchResults(false);
    setShowProximityDrawer(true);
  };

  // Clear active searched location
  const handleClearSearchedLocation = () => {
    setSearchedLocation(null);
    setSearchTerm('');
    setGeocodeSuggestions([]);
    setShowSearchResults(false);
    setMapTargetCoords(defaultCenter);
    setMapZoom(11);
  };

  // Execute Search on Enter key or Search button click
  const handleExecuteSearch = async () => {
    const q = searchTerm.trim();
    if (!q) return;

    // 1. Direct coordinate match
    if (coordinateMatch) {
      handleSelectSearchedLocation({
        lat: coordinateMatch.lat,
        lng: coordinateMatch.lng,
        title: `Coordinate (${coordinateMatch.lat.toFixed(4)}, ${coordinateMatch.lng.toFixed(4)})`,
        type: 'coordinate'
      });
      return;
    }

    // 2. If geocode suggestions already loaded, pick the first
    if (geocodeSuggestions.length > 0) {
      handleSelectSearchedLocation(geocodeSuggestions[0]);
      return;
    }

    // 3. Check if exact or partial site match exists
    const matchingSite = sites.find(s => 
      s.ihs_site_id?.toLowerCase() === q.toLowerCase() ||
      s.mtn_id?.toLowerCase() === q.toLowerCase()
    );
    if (matchingSite) {
      handleFocusSite(matchingSite);
      return;
    }

    // 4. Trigger on-demand geocode lookup
    setIsSearchingGeocode(true);
    try {
      const results = await geocodeLocation(q, stateInfo?.code);
      if (results && results.length > 0) {
        handleSelectSearchedLocation(results[0]);
      }
    } catch (e) {
      console.error('On-demand geocode failed:', e);
    } finally {
      setIsSearchingGeocode(false);
    }
  };

  // Locate User via Browser GPS
  const handleAcquireGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        handleSelectSearchedLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          title: 'Your Live GPS Location',
          subtitle: `Accuracy: within ${Math.round(pos.coords.accuracy)}m`,
          type: 'gps'
        });
      },
      (err) => {
        setLocatingGps(false);
        console.warn('GPS location error:', err);
        alert('Could not acquire your GPS position: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Copy coordinates helper
  const handleCopyCoordinates = (lat, lng) => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  // Reset all filters and search
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedTerritory('All');
    setSelectedLga('All');
    setSelectedCluster('All');
    setSelectedFse('All');
    setSelectedTowerCo('All');
    setSelectedStatus('All');
    setActiveFocusedSiteId(null);
    setSearchedLocation(null);
    setGeocodeSuggestions([]);
    setShowSearchResults(false);
    setMapTargetCoords(defaultCenter);
    setMapZoom(11);
  };

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedTerritory !== 'All') count++;
    if (selectedLga !== 'All') count++;
    if (selectedCluster !== 'All') count++;
    if (selectedFse !== 'All') count++;
    if (selectedTowerCo !== 'All') count++;
    if (selectedStatus !== 'All') count++;
    if (searchTerm.trim()) count++;
    return count;
  }, [selectedTerritory, selectedLga, selectedCluster, selectedFse, selectedTowerCo, selectedStatus, searchTerm]);

  // 📐 Calculate hop-by-hop metrics for any path
  const calculatePathMetrics = useCallback((waypoints = []) => {
    if (!waypoints || waypoints.length === 0) {
      return {
        legs: [],
        totalDistanceKm: 0,
        totalHops: 0,
        straightLineDisplacementKm: 0,
        latencyMicros: 0,
        routeRatio: 1
      };
    }

    const legs = [];
    let totalDistanceKm = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const distKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
      const bearing = calculateBearing(from.lat, from.lng, to.lat, to.lng);
      const midLat = (from.lat + to.lat) / 2;
      const midLng = (from.lng + to.lng) / 2;

      totalDistanceKm += distKm;
      legs.push({
        legIndex: i,
        from,
        to,
        fromLetter: getWaypointLetter(i),
        toLetter: getWaypointLetter(i + 1),
        distKm,
        bearing,
        midpoint: [midLat, midLng]
      });
    }

    const straightLineDisplacementKm = waypoints.length > 1
      ? haversineKm(waypoints[0].lat, waypoints[0].lng, waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng)
      : 0;

    // Optical fiber delay ~ 4.9 microseconds per km (c / 1.47 in silica core)
    const latencyMicros = totalDistanceKm * 4.9;
    const routeRatio = straightLineDisplacementKm > 0.001 ? (totalDistanceKm / straightLineDisplacementKm) : 1;

    return {
      legs,
      totalDistanceKm,
      totalHops: Math.max(0, waypoints.length - 1),
      straightLineDisplacementKm,
      latencyMicros,
      routeRatio
    };
  }, []);

  const activePath = useMemo(() => {
    return paths.find(p => p.id === activePathId) || paths[0] || { id: 'path-1', name: 'Path 1', color: '#06b6d4', waypoints: [] };
  }, [paths, activePathId]);

  const activePathMetrics = useMemo(() => {
    return calculatePathMetrics(activePath?.waypoints || []);
  }, [activePath, calculatePathMetrics]);

  // All paths with computed metrics for multi-route comparison
  const allPathsComparison = useMemo(() => {
    const list = paths.map(p => {
      const metrics = calculatePathMetrics(p.waypoints);
      return {
        ...p,
        metrics
      };
    });

    const completed = list.filter(p => p.metrics.totalDistanceKm > 0);
    const minDistance = completed.length > 0 ? Math.min(...completed.map(p => p.metrics.totalDistanceKm)) : 0;

    return list.map(p => ({
      ...p,
      isShortest: p.metrics.totalDistanceKm > 0 && p.metrics.totalDistanceKm === minDistance,
      diffFromShortestKm: p.metrics.totalDistanceKm > 0 && minDistance > 0 ? p.metrics.totalDistanceKm - minDistance : 0
    }));
  }, [paths, calculatePathMetrics]);

  // Next-hop recommendations for the last waypoint of the active path
  const nextHopRecommendations = useMemo(() => {
    if (!activePath || !activePath.waypoints || activePath.waypoints.length === 0 || sites.length === 0) return [];
    const lastWp = activePath.waypoints[activePath.waypoints.length - 1];
    const existingSiteIds = new Set(activePath.waypoints.map(w => w.siteId).filter(Boolean));

    return sites
      .map(site => {
        if (existingSiteIds.has(site.ihs_site_id)) return null;
        const coords = getSiteCoordinates(site);
        const distKm = haversineKm(lastWp.lat, lastWp.lng, coords.lat, coords.lng);
        if (distKm < 0.05) return null;
        const bearing = calculateBearing(lastWp.lat, lastWp.lng, coords.lat, coords.lng);
        return {
          site,
          coords,
          distKm,
          bearing
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 4);
  }, [activePath, sites]);

  // Search filter for Measure Autocomplete
  const measureSearchSuggestions = useMemo(() => {
    if (!measureSearchQuery.trim()) return [];
    const q = measureSearchQuery.toLowerCase().trim();
    const existingSiteIds = new Set(activePath?.waypoints?.map(w => w.siteId).filter(Boolean) || []);

    return sites
      .filter(s => {
        if (existingSiteIds.has(s.ihs_site_id)) return false;
        const siteId = (s.ihs_site_id || '').toLowerCase();
        const rawName = (s.raw_data?.['Site Name'] || s.cluster_name || '').toLowerCase();
        const mtnId = (s.mtn_id || '').toLowerCase();
        return siteId.includes(q) || rawName.includes(q) || mtnId.includes(q);
      })
      .slice(0, 6)
      .map(site => {
        const coords = getSiteCoordinates(site);
        const lastWp = activePath?.waypoints?.[activePath.waypoints.length - 1];
        const distKm = lastWp ? haversineKm(lastWp.lat, lastWp.lng, coords.lat, coords.lng) : null;
        const bearing = lastWp ? calculateBearing(lastWp.lat, lastWp.lng, coords.lat, coords.lng) : null;
        return {
          site,
          coords,
          distKm,
          bearing
        };
      });
  }, [measureSearchQuery, sites, activePath]);

  // Append a waypoint to the currently active path
  const handleAddWaypointToActivePath = useCallback((point) => {
    if (!point || point.lat == null || point.lng == null) return;
    
    setShowMeasureDrawer(true);

    setPaths(prevPaths => prevPaths.map(path => {
      if (path.id !== activePathId) return path;

      const last = path.waypoints[path.waypoints.length - 1];
      if (last && ((point.siteId && last.siteId === point.siteId) || 
          (Math.abs(last.lat - point.lat) < 0.00001 && Math.abs(last.lng - point.lng) < 0.00001))) {
        return path;
      }

      const newWaypoint = {
        id: point.siteId ? `site_${point.siteId}_${Date.now()}` : `coord_${point.lat}_${point.lng}_${Date.now()}`,
        siteId: point.siteId || null,
        name: point.name || point.siteId || `Point (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
        lga: point.lga || '',
        tech: point.tech || '',
        status: point.status || 'Operational',
        lat: Number(point.lat),
        lng: Number(point.lng)
      };

      return {
        ...path,
        waypoints: [...path.waypoints, newWaypoint]
      };
    }));
  }, [activePathId]);

  // Remove waypoint from path
  const handleRemoveWaypoint = useCallback((pathId, waypointIdx) => {
    setPaths(prev => prev.map(path => {
      if (path.id !== pathId) return path;
      return {
        ...path,
        waypoints: path.waypoints.filter((_, idx) => idx !== waypointIdx)
      };
    }));
  }, []);

  // Reorder waypoints
  const handleMoveWaypoint = useCallback((pathId, fromIdx, toIdx) => {
    setPaths(prev => prev.map(path => {
      if (path.id !== pathId) return path;
      if (toIdx < 0 || toIdx >= path.waypoints.length) return path;
      const nextWps = [...path.waypoints];
      const [moved] = nextWps.splice(fromIdx, 1);
      nextWps.splice(toIdx, 0, moved);
      return {
        ...path,
        waypoints: nextWps
      };
    }));
  }, []);

  // Reverse path direction (e.g. C -> B -> A)
  const handleReversePath = useCallback((pathId) => {
    setPaths(prev => prev.map(path => {
      if (path.id !== pathId) return path;
      return {
        ...path,
        waypoints: [...path.waypoints].reverse()
      };
    }));
  }, []);

  // Clear all waypoints in a path
  const handleClearPath = useCallback((pathId) => {
    setPaths(prev => prev.map(path => {
      if (path.id !== pathId) return path;
      return {
        ...path,
        waypoints: []
      };
    }));
  }, []);

  // Add a new comparison path
  const handleAddNewPath = useCallback(() => {
    const nextIdx = paths.length;
    const colorObj = PATH_COLORS[nextIdx % PATH_COLORS.length];
    const newPath = {
      id: `path-${Date.now()}`,
      name: `Path ${nextIdx + 1}`,
      color: colorObj.hex,
      colorId: colorObj.id,
      waypoints: []
    };
    setPaths(prev => [...prev, newPath]);
    setActivePathId(newPath.id);
    setMeasureDrawerTab('active');
    setShowMeasureDrawer(true);
  }, [paths.length]);

  // Delete a path
  const handleDeletePath = useCallback((pathId) => {
    if (paths.length <= 1) {
      setPaths(prev => prev.map(p => p.id === pathId ? { ...p, waypoints: [] } : p));
      return;
    }
    const remaining = paths.filter(p => p.id !== pathId);
    setPaths(remaining);
    if (activePathId === pathId) {
      setActivePathId(remaining[0].id);
    }
  }, [paths, activePathId]);

  // Update path color
  const handleUpdatePathColor = useCallback((pathId, colorHex, colorId) => {
    setPaths(prev => prev.map(p => p.id === pathId ? { ...p, color: colorHex, colorId } : p));
  }, []);

  // Update path name
  const handleUpdatePathName = useCallback((pathId, name) => {
    setPaths(prev => prev.map(p => p.id === pathId ? { ...p, name } : p));
  }, []);

  // Fit path bounds on map
  const handleFitPathOnMap = useCallback((path) => {
    const p = path || activePath;
    if (!p || !p.waypoints || p.waypoints.length === 0) return;
    if (p.waypoints.length === 1) {
      setMapTargetCoords([p.waypoints[0].lat, p.waypoints[0].lng]);
      setMapZoom(16);
      return;
    }
    const coords = p.waypoints.map(w => [w.lat, w.lng]);
    setBoundsToFit(coords);
  }, [activePath]);

  // Copy structured transmission route distance report
  const handleCopyPathReport = useCallback((path) => {
    const p = path || activePath;
    const metrics = calculatePathMetrics(p.waypoints);
    
    let text = `=================================================\n`;
    text += `SDM TELECOM DASHBOARD - TRANSMISSION ROUTE REPORT\n`;
    text += `Route Name: ${p.name}\n`;
    text += `Total Hops: ${metrics.totalHops}\n`;
    text += `Total Path Distance: ${metrics.totalDistanceKm.toFixed(3)} km (${formatDistance(metrics.totalDistanceKm)})\n`;
    text += `Straight-line Displacement: ${metrics.straightLineDisplacementKm.toFixed(3)} km\n`;
    text += `Route Detour Ratio: ${metrics.routeRatio.toFixed(2)}x\n`;
    text += `Estimated Fiber Delay (c/1.47): ~${metrics.latencyMicros.toFixed(1)} µs\n`;
    text += `=================================================\n`;
    text += `HOP-BY-HOP ROUTE BREAKDOWN:\n`;
    
    if (metrics.legs.length === 0) {
      text += `No legs established yet (minimum 2 sites required).\n`;
    } else {
      metrics.legs.forEach((leg, idx) => {
        text += `\n[Hop ${idx + 1}] [${leg.fromLetter}] ${leg.from.siteId || 'Point'} (${leg.from.name}) ➔ [${leg.toLetter}] ${leg.to.siteId || 'Point'} (${leg.to.name})\n`;
        text += `  • Distance: ${leg.distKm.toFixed(3)} km (${Math.round(leg.distKm * 1000)} meters)\n`;
        text += `  • Bearing: ${leg.bearing.degrees}° (${leg.bearing.cardinal} ${leg.bearing.arrow})\n`;
        text += `  • Coordinates: (${leg.from.lat.toFixed(5)}, ${leg.from.lng.toFixed(5)}) ➔ (${leg.to.lat.toFixed(5)}, ${leg.to.lng.toFixed(5)})\n`;
      });
    }
    text += `\nReport Exported on: ${new Date().toLocaleString()}\n`;
    text += `=================================================\n`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedPathReport(true);
      setTimeout(() => setCopiedPathReport(false), 2500);
    }
  }, [activePath, calculatePathMetrics]);

  // Map terrain click in Measure Mode
  const handleMapMeasureClick = useCallback((latlng) => {
    if (!isMeasuringMode) return;
    const closest = sites.find(s => {
      const c = getSiteCoordinates(s);
      return haversineKm(latlng.lat, latlng.lng, c.lat, c.lng) < 0.03;
    });

    if (closest) {
      const coords = getSiteCoordinates(closest);
      const raw = closest.raw_data || {};
      handleAddWaypointToActivePath({
        siteId: closest.ihs_site_id,
        name: raw['Site Name'] || closest.cluster_name || closest.ihs_site_id,
        lat: coords.lat,
        lng: coords.lng,
        lga: getSiteLga(closest),
        tech: raw['Tech'] || '2G/3G/4G',
        status: closest.operational_status || (closest.is_down ? 'Down' : 'Operational')
      });
    } else {
      handleAddWaypointToActivePath({
        lat: latlng.lat,
        lng: latlng.lng,
        name: `Map Point (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`
      });
    }
  }, [isMeasuringMode, sites, handleAddWaypointToActivePath]);

  return (
    <div className="space-y-3">
      
      {/* Top Banner & Control Toolbar */}
      <div className="glass-panel p-3 sm:p-4 rounded-xl border border-slate-800 space-y-3 shadow-xl">
        
        {/* Header Title Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-2.5">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-white tracking-wide flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              {stateInfo.mapTitle || 'Live Geographic Map of Telecom Sites'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              <span className="text-cyan-300 font-semibold flex items-center gap-1">
                <Lock className="w-3 h-3 text-cyan-400" /> Portfolio Scope: <b>{stateInfo.regionText}</b> ({filteredSites.length} of {sites.length} Towers Shown)
              </span>
            </p>
          </div>

          {/* Quick Interactive Metrics Filter Badges & Layer Toggles */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap text-[11px] pb-0.5 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedStatus('All')}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'All'
                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/40 shadow'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Show all plotted sites"
            >
              <Database className="w-3 h-3 text-cyan-400" />
              <span>Plotted:</span>
              <span className="font-extrabold text-white font-mono">{filteredSites.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus(selectedStatus === 'Operational' ? 'All' : 'Operational')}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'Operational'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400/40 shadow'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              }`}
              title="Click to filter Operational sites only"
            >
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="font-bold">Operational:</span>
              <span className="font-mono font-extrabold text-white">{operationalCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus(selectedStatus === 'OpenNotes' ? 'All' : 'OpenNotes')}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'OpenNotes'
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-1 ring-amber-400/40 shadow'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
              }`}
              title="Click to filter Sites with Open Incident Notes"
            >
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
              <span className="font-bold">Open Notes:</span>
              <span className="font-mono font-extrabold text-white">{openNotesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus(selectedStatus === 'Down' ? 'All' : 'Down')}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'Down'
                  ? 'bg-red-500/25 border-red-400 text-red-200 ring-1 ring-red-400/40 shadow'
                  : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
              title="Click to filter Outage / Down sites only"
            >
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
              <span className="font-bold">Outages:</span>
              <span className="font-mono font-extrabold text-white">{outageCount}</span>
            </button>

            {/* 4G LTE KML RF Sector Layer Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextVal = !showRfSectors;
                setShowRfSectors(nextVal);
                if (nextVal && mapSectors.length === 0) {
                  setLoadingMapSectors(true);
                  fetchCellSectors({ limit: 1200 }).then(res => {
                    if (res && res.results) setMapSectors(res.results);
                  }).catch(() => {}).finally(() => setLoadingMapSectors(false));
                }
              }}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer ${
                showRfSectors
                  ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border-cyan-400/60 shadow-cyan-500/20 ring-1 ring-cyan-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Click to toggle 4G LTE RF Sector Coverage Polygons on Map"
            >
              <Radio className={`w-3 h-3 ${showRfSectors ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
              <span>4G Sectors:</span>
              <span className="font-mono font-extrabold text-white">
                {kmlStats?.total_sectors ? `${(kmlStats.total_sectors / 1000).toFixed(1)}k` : '40.9k'}
              </span>
              <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${
                showRfSectors ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {showRfSectors ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Site ID Label Overlay Toggle */}
            <button
              type="button"
              onClick={() => setShowSiteLabels(!showSiteLabels)}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer ${
                showSiteLabels
                  ? 'bg-gradient-to-r from-emerald-600/30 to-teal-600/30 text-emerald-200 border-emerald-400/60 shadow-emerald-500/20 ring-1 ring-emerald-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Click to toggle Site ID labels on map markers"
            >
              <MapPin className={`w-3 h-3 ${showSiteLabels ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>Labels:</span>
              <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${
                showSiteLabels ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {showSiteLabels ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* 📐 Multi-Path Distance Measurement Tool Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextVal = !isMeasuringMode;
                setIsMeasuringMode(nextVal);
                setShowMeasureDrawer(true);
              }}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap transition-all shadow-sm cursor-pointer ${
                isMeasuringMode || showMeasureDrawer
                  ? 'bg-gradient-to-r from-amber-600/30 to-orange-600/30 text-amber-200 border-amber-400/60 shadow-amber-500/20 ring-1 ring-amber-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Measure distances between telecom sites in chained multi-hop paths"
            >
              <Ruler className={`w-3 h-3 ${isMeasuringMode ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
              <span>Measure:</span>
              <span className="font-mono font-extrabold text-white">
                {activePathMetrics.totalDistanceKm > 0 ? formatDistance(activePathMetrics.totalDistanceKm) : `${paths.length} Route${paths.length > 1 ? 's' : ''}`}
              </span>
              <span className={`px-1 py-0.2 rounded text-[8px] font-black uppercase ${
                isMeasuringMode ? 'bg-amber-400 text-slate-950' : showMeasureDrawer ? 'bg-slate-700 text-amber-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {isMeasuringMode ? 'ACTIVE' : showMeasureDrawer ? 'PANEL' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* 📐 Active Measure Mode Banner */}
        {isMeasuringMode && (
          <div className="p-2.5 rounded-lg bg-amber-950/70 border border-amber-500/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-200 animate-in fade-in duration-200 shadow-md">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                <Ruler className="w-3 h-3 text-amber-400 animate-pulse" />
              </div>
              <div>
                <span className="font-black text-amber-300 mr-1 uppercase tracking-wide text-[10px]">Measure Mode Active:</span>
                <span>Click any tower marker on the map to chain sites into </span>
                <b className="font-bold underline text-white" style={{ color: activePath.color }}>{activePath.name}</b>
                <span className="text-amber-300/80 text-[10px] ml-1">({activePath.waypoints.length} sites linked)</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMeasureDrawer(true)}
                className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
              >
                Open Drawer
              </button>
              <button
                type="button"
                onClick={() => setIsMeasuringMode(false)}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
              >
                Done Measuring
              </button>
            </div>
          </div>
        )}

        {/* Filter & Search Bar - Streamlined Two-Row Dense Layout */}
        <div className="space-y-2">
          
          {/* Row 1: Search Box & Geographic Hierarchy Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            
            {/* Search Box with Autocomplete Dropdown */}
            <div className="sm:col-span-12 lg:col-span-6 relative">
              <div className="relative flex items-center gap-1.5">
                <div className="relative flex-1 flex items-center">
                  <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search coordinate (lat, lng), street, area or Site ID..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleExecuteSearch();
                      }
                    }}
                    className="w-full pl-8 pr-12 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all shadow-inner"
                  />

                  <div className="absolute right-2 flex items-center space-x-1">
                    {isSearchingGeocode && (
                      <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin mr-1" />
                    )}
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setShowSearchResults(false);
                        }}
                        className="p-0.5 text-slate-400 hover:text-white rounded cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live GPS Acquire Button */}
                <button
                  type="button"
                  onClick={handleAcquireGps}
                  title="Locate my position via GPS & show nearby towers"
                  className="p-1.5 bg-slate-900 hover:bg-cyan-950 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/50 rounded-lg transition-all shadow shrink-0 cursor-pointer"
                >
                  <Locate className={`w-3.5 h-3.5 ${locatingGps ? 'animate-spin text-cyan-300' : ''}`} />
                </button>

                {/* Search Execute Button */}
                <button
                  type="button"
                  onClick={handleExecuteSearch}
                  title="Execute search"
                  className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-[11px] rounded-lg transition-all shadow-md flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Search className="w-3 h-3" />
                  <span className="hidden sm:inline">Find</span>
                </button>

                {/* Mobile Filters Toggle Button (Visible on phones so filters don't push map off-screen) */}
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  title="Toggle geographic & engineering filters"
                  className={`sm:hidden px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                    showMobileFilters || activeFilterCount > 0
                      ? 'bg-cyan-950/90 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-700/80 text-slate-300'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-400 text-slate-950">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Live Autocomplete Results Dropdown */}
              {showSearchResults && searchTerm.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-72 overflow-y-auto glass-panel border border-slate-700 rounded-xl shadow-2xl p-1 bg-slate-950/98 space-y-1 backdrop-blur-xl">
                  
                  {/* 1. Coordinate Pinpoint Option */}
                  {coordinateMatch && (
                    <div
                      onClick={() => handleSelectSearchedLocation({
                        lat: coordinateMatch.lat,
                        lng: coordinateMatch.lng,
                        title: `Coordinates (${coordinateMatch.lat.toFixed(4)}, ${coordinateMatch.lng.toFixed(4)})`,
                        type: 'coordinate'
                      })}
                      className="p-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900/90 border border-cyan-500/50 cursor-pointer flex items-center justify-between transition-all"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Crosshair className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-cyan-200 text-[11px] flex items-center gap-1.5 truncate">
                            <span>Pinpoint Coordinates:</span>
                            <b className="font-mono text-white bg-slate-900 px-1 py-0.2 rounded border border-cyan-500/40">
                              {coordinateMatch.lat.toFixed(5)}, {coordinateMatch.lng.toFixed(5)}
                            </b>
                          </div>
                          <div className="text-[9px] text-cyan-300/80 mt-0.5">
                            Click to mark target beacon &amp; show all surrounding cell sites
                          </div>
                        </div>
                      </div>
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-cyan-400 text-slate-950 shrink-0 ml-2">
                        Pinpoint
                      </span>
                    </div>
                  )}

                  {/* 2. Streets, Areas & Landmarks from Geocoding */}
                  {geocodeSuggestions.length > 0 && (
                    <div>
                      <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-cyan-400" /> Streets, Areas &amp; Landmarks ({geocodeSuggestions.length})
                      </div>
                      <div className="space-y-0.5">
                        {geocodeSuggestions.map((place, idx) => (
                          <div
                            key={`geo_sugg_${idx}_${place.lat}_${place.lng}`}
                            onClick={() => handleSelectSearchedLocation({
                              lat: place.lat,
                              lng: place.lng,
                              title: place.title,
                              subtitle: place.display_name,
                              type: place.category || 'street'
                            })}
                            className="p-1.5 rounded-md hover:bg-cyan-950/70 border border-transparent hover:border-cyan-800/50 cursor-pointer flex items-center justify-between text-[11px] transition-all"
                          >
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <Target className="w-3 h-3 text-cyan-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate">{place.title}</div>
                                <div className="text-[9px] text-slate-400 truncate max-w-xs sm:max-w-md">{place.display_name}</div>
                              </div>
                            </div>
                            <span className="px-1 py-0.2 rounded text-[8px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700 shrink-0 ml-2">
                              {place.category || 'Area'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Matching Telecom Sites */}
                  {filteredSites.length > 0 && (
                    <div>
                      <div className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1 border-t border-slate-800/80 pt-1">
                        <Radio className="w-3 h-3 text-emerald-400" /> Telecom Towers ({Math.min(filteredSites.length, 6)})
                      </div>
                      <div className="space-y-0.5">
                        {filteredSites.slice(0, 6).map((site) => {
                          const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
                          const siteNotes = getSiteOpenNotes(site);
                          const hasOpenNote = siteNotes.length > 0;

                          return (
                            <div
                              key={site.id}
                              onClick={() => handleFocusSite(site)}
                              className="p-1.5 rounded-md hover:bg-cyan-950/60 border border-transparent hover:border-cyan-800/50 cursor-pointer flex items-center justify-between text-[11px] transition-all"
                            >
                              <div className="flex items-center space-x-1.5 min-w-0">
                                <Radio className={`w-3 h-3 shrink-0 ${
                                  isDown ? 'text-red-400' : hasOpenNote ? 'text-amber-400' : 'text-emerald-400'
                                }`} />
                                <div className="min-w-0">
                                  <div className="font-extrabold text-cyan-300 font-mono flex items-center gap-1">
                                    {site.ihs_site_id}
                                    {hasOpenNote && (
                                      <span className="px-1 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                        Open Note
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] text-slate-400 truncate max-w-xs sm:max-w-md">
                                    {site.raw_data?.['Site Name'] || site.cluster_name} {site.site_address ? `• ${site.site_address}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right text-[9px] shrink-0 ml-2">
                                <span className="text-slate-400 block">{getSiteLga(site)}</span>
                                <span className={`font-bold ${
                                  isDown ? 'text-red-400' : hasOpenNote ? 'text-amber-400' : 'text-emerald-400'
                                }`}>
                                  {isDown ? 'OUTAGE' : hasOpenNote ? 'INCIDENT' : 'ONLINE'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {!coordinateMatch && geocodeSuggestions.length === 0 && filteredSites.length === 0 && !isSearchingGeocode && (
                    <div className="p-2.5 text-center text-[11px] text-slate-500 space-y-1">
                      <div>No exact places or sites found for "{searchTerm}"</div>
                      <button
                        type="button"
                        onClick={handleExecuteSearch}
                        className="text-cyan-400 underline hover:text-cyan-300 text-[10px] cursor-pointer"
                      >
                        Click here to search OpenStreetMap for this street/area &rarr;
                      </button>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Territory Filter Dropdown */}
            <div className={`${showMobileFilters ? 'block' : 'hidden'} sm:block sm:col-span-4 lg:col-span-2 relative`}>
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">Territory</span>
                  <select
                    value={selectedTerritory}
                    onChange={(e) => setSelectedTerritory(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All Territories</option>
                    {territoryOptions.map((terr) => (
                      <option key={terr} value={terr} className="bg-slate-900 text-white">
                        {terr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* LGA Filter Dropdown */}
            <div className={`${showMobileFilters ? 'block' : 'hidden'} sm:block sm:col-span-4 lg:col-span-2 relative`}>
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">Filter by LGA</span>
                  <select
                    value={selectedLga}
                    onChange={(e) => setSelectedLga(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All LGAs</option>
                    {lgaOptions.map((lga) => (
                      <option key={lga} value={lga} className="bg-slate-900 text-white">
                        {lga}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Cluster Name Filter Dropdown */}
            <div className={`${showMobileFilters ? 'block' : 'hidden'} sm:block sm:col-span-4 lg:col-span-2 relative`}>
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">Cluster Name</span>
                  <select
                    value={selectedCluster}
                    onChange={(e) => setSelectedCluster(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All Clusters</option>
                    {clusterOptions.map((cluster) => (
                      <option key={cluster} value={cluster} className="bg-slate-900 text-white">
                        {cluster}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* Row 2: Operational & Engineering Filters + Reset Button */}
          <div className={`${showMobileFilters ? 'grid' : 'hidden'} sm:grid grid-cols-1 sm:grid-cols-12 gap-2 items-center`}>
            
            {/* SMC FSE Engineer Filter Dropdown */}
            <div className="sm:col-span-4 lg:col-span-4 relative">
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">SMC FSE Engineer</span>
                  <select
                    value={selectedFse}
                    onChange={(e) => setSelectedFse(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All SMC FSE Engineers</option>
                    {fseOptions.map((fse) => (
                      <option key={fse} value={fse} className="bg-slate-900 text-white">
                        {fse}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Tower Co Filter Dropdown */}
            <div className="sm:col-span-3 lg:col-span-3 relative">
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">Tower Co</span>
                  <select
                    value={selectedTowerCo}
                    onChange={(e) => setSelectedTowerCo(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All Tower Cos</option>
                    {towerCoOptions.map((towerCo) => (
                      <option key={towerCo} value={towerCo} className="bg-slate-900 text-white">
                        {towerCo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Operational & Incident Status Filter Dropdown */}
            <div className="sm:col-span-3 lg:col-span-3 relative">
              <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
                <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-400 block leading-none">Operational Status</span>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full bg-transparent text-[11px] text-white font-semibold focus:outline-none cursor-pointer py-0.5 truncate"
                  >
                    <option value="All" className="bg-slate-900 text-white">All Operational Statuses</option>
                    <option value="Operational" className="bg-slate-900 text-emerald-400">Operational Only</option>
                    <option value="OpenNotes" className="bg-slate-900 text-amber-300">Sites with Open Notes / Incidents</option>
                    <option value="Down" className="bg-slate-900 text-red-400">Site Outages / Down Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Reset Filters Button */}
            <div className="sm:col-span-2 lg:col-span-2 flex items-center">
              <button
                onClick={handleResetFilters}
                title="Reset search & all filters"
                className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all shadow-sm cursor-pointer ${
                  activeFilterCount > 0
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300 hover:text-amber-200'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-400 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset</span>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-amber-400 text-slate-950">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

          </div>

        </div>

        {/* 🎯 ACTIVE SEARCHED LOCATION STATUS BANNER */}
        {searchedLocation && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/90 via-slate-900/95 to-blue-950/90 border border-cyan-500/50 text-xs shadow-xl animate-in fade-in duration-200 space-y-2.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4 text-cyan-400 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase text-cyan-400 tracking-wider">Searched Location Target:</span>
                    <span className="font-extrabold text-white text-sm truncate">{searchedLocation.title}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCoordinates(searchedLocation.lat, searchedLocation.lng)}
                      title="Copy coordinates"
                      className="p-1 text-slate-400 hover:text-cyan-300 rounded transition-colors cursor-pointer"
                    >
                      {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-300 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono text-cyan-300 font-semibold">{searchedLocation.lat.toFixed(5)}° N, {searchedLocation.lng.toFixed(5)}° E</span>
                    {searchedLocation.subtitle && (
                      <span className="text-slate-400 truncate max-w-sm lg:max-w-md hidden sm:inline">• {searchedLocation.subtitle}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons & Radius Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Proximity Radius Pills */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[11px]">
                  <span className="text-[10px] text-slate-400 font-bold px-1.5 uppercase">Radius:</span>
                  {[1, 2, 3, 5, 10, 'All'].map((r) => (
                    <button
                      key={`rad_${r}`}
                      type="button"
                      onClick={() => setProximityRadiusKm(r)}
                      className={`px-2 py-0.5 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                        proximityRadiusKm === r
                          ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {r === 'All' ? 'All' : `${r} km`}
                    </button>
                  ))}
                </div>

                {/* Toggle Show Only Radius */}
                <button
                  type="button"
                  onClick={() => setShowOnlyWithinRadius(!showOnlyWithinRadius)}
                  className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                    showOnlyWithinRadius
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                  title="Toggle filtering map sites to selected radius"
                >
                  {showOnlyWithinRadius ? `Within ${proximityRadiusKm !== 'All' ? `${proximityRadiusKm}km` : 'All'} Only` : 'Showing All Sites'}
                </button>

                {/* Drawer Toggle */}
                <button
                  type="button"
                  onClick={() => setShowProximityDrawer(!showProximityDrawer)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer"
                >
                  <Navigation className="w-3 h-3 text-cyan-400" />
                  <span>Nearby Towers ({nearbySitesWithinRadius.length})</span>
                  {showProximityDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {/* Clear Location Button */}
                <button
                  type="button"
                  onClick={handleClearSearchedLocation}
                  className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/30 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                  title="Clear searched location"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Target</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar for Immediate Area */}
            {nearbyStats && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400">Towers in zone:</span>
                  <span className="font-extrabold text-white font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {nearbyStats.total} Towers Found
                  </span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {nearbyStats.operational} Operational
                  </span>
                  {nearbyStats.outages > 0 && (
                    <span className="text-red-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {nearbyStats.outages} Outages
                    </span>
                  )}
                  {nearbyStats.openNotes > 0 && (
                    <span className="text-amber-300 font-semibold flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {nearbyStats.openNotes} Incidents
                    </span>
                  )}
                </div>

                {nearbyStats.closestSite && (
                  <div className="flex items-center gap-1.5 text-cyan-300">
                    <span className="text-slate-400">Closest Tower:</span>
                    <button
                      type="button"
                      onClick={() => handleFocusSite(nearbyStats.closestSite)}
                      className="font-mono font-black text-white hover:text-cyan-300 underline cursor-pointer"
                    >
                      {nearbyStats.closestSite.ihs_site_id}
                    </button>
                    <span className="font-bold text-emerald-400 font-mono">
                      ({formatDistance(nearbyStats.closestSite.distKm)} {nearbyStats.closestSite.bearing?.cardinal})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 📡 4G LTE RF SECTOR LIVE CONTROL STRIP (When 4G Layer is ACTIVE) */}
        {showRfSectors && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-[11px] shadow-inner animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 font-black text-cyan-300 font-mono text-[11px]">
                <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>4G LTE RF Sectors:</span>
                <b className="text-white bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">
                  {renderedSectors.length.toLocaleString()} Plotted
                </b>
              </span>

              {/* Carrier Layer Filter */}
              {kmlStats?.layers && kmlStats.layers.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                  <span className="text-[9px] text-slate-400 font-bold uppercase">Layer:</span>
                  <select
                    value={selectedLayer}
                    onChange={(e) => setSelectedLayer(e.target.value)}
                    className="bg-slate-800 text-cyan-300 text-[10px] font-bold rounded px-1.5 py-0.5 border border-slate-700 outline-none cursor-pointer"
                  >
                    <option value="All">All Layers ({kmlStats.total_sectors?.toLocaleString()})</option>
                    {kmlStats.layers.map((l) => (
                      <option key={l.layer} value={l.layer}>
                        {l.layer} ({l.count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Average PRB Utilization pill if available */}
              {kmlStats?.avg_prb_utilization != null && (
                <span className="text-[10px] text-amber-300 font-bold flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-500/30">
                  <Activity className="w-3 h-3 text-amber-400" />
                  <span>Avg PRB: <b>{kmlStats.avg_prb_utilization}%</b></span>
                </span>
              )}

              {loadingMapSectors && (
                <span className="text-[10px] text-cyan-400 font-medium flex items-center gap-1 bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-500/20">
                  <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                  Streaming...
                </span>
              )}
            </div>

            {/* Live Sector Inspector Search */}
            <div className="relative min-w-[240px]">
              <Search className="w-3 h-3 text-cyan-400 absolute left-2 top-2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search Cell Name (e.g. L0108A), Site, Layer..."
                value={sectorSearchQuery}
                onChange={(e) => {
                  setSectorSearchQuery(e.target.value);
                  setShowSectorDropdown(true);
                }}
                onFocus={() => setShowSectorDropdown(true)}
                className="w-full pl-7 pr-6 py-1 bg-slate-900 border border-slate-700 text-[11px] text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-cyan-400 font-mono shadow-inner"
              />
              {sectorSearchQuery && (
                <button
                  onClick={() => {
                    setSectorSearchQuery('');
                    setSectorSearchResults([]);
                    setShowSectorDropdown(false);
                  }}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Sector Search Dropdown Menu */}
              {showSectorDropdown && sectorSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-56 overflow-y-auto bg-slate-950 border border-cyan-500/50 rounded-xl shadow-2xl p-1 space-y-1">
                  {sectorSearchResults.map((sec) => (
                    <div
                      key={`srch_${sec.id}`}
                      onClick={() => {
                        setActiveFocusedSector(sec);
                        setActiveFocusedSiteId(sec.site_id);
                        if (sec.latitude && sec.longitude) {
                          setMapTargetCoords([sec.latitude, sec.longitude]);
                          setMapZoom(16);
                        }
                        setShowSectorDropdown(false);
                      }}
                      className="p-1.5 rounded-lg hover:bg-cyan-950/80 border border-transparent hover:border-cyan-500/40 cursor-pointer flex items-center justify-between text-[11px] transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-black text-cyan-300 font-mono">{sec.cell_name}</span>
                          {sec.layer && (
                            <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30">
                              {sec.layer}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono">Site: {sec.site_id}</span>
                      </div>
                      <div className="text-[9px] flex items-center gap-1 shrink-0">
                        {sec.prb_utilization != null && (
                          <span className={`font-mono font-bold px-1 py-0.2 rounded border ${
                            sec.prb_utilization >= 85 ? 'bg-red-950/80 text-red-300 border-red-500/40' :
                            sec.prb_utilization >= 70 ? 'bg-amber-950/80 text-amber-300 border-amber-500/40' :
                            'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                          }`}>
                            PRB: {sec.prb_utilization.toFixed(0)}%
                          </span>
                        )}
                        <span className="text-emerald-400 font-mono">Az: {sec.azimuth}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Antenna Radiation Beam Color Legend */}
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-[9px] text-slate-500 uppercase font-bold mr-0.5">Beams:</span>
              <span className="flex items-center gap-1 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-500"></span> Alpha (0°-120°)
              </span>
              <span className="flex items-center gap-1 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400 shadow-sm shadow-purple-500"></span> Beta (120°-240°)
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-500"></span> Gamma (240°-360°)
              </span>
            </div>
          </div>
        )}

      </div>

      {/* Map Workspace Container */}
      <div
        className={
          isMapFullscreen
            ? 'fixed inset-0 z-[2000] bg-slate-950 overflow-hidden'
            : 'glass-panel rounded-2xl overflow-hidden border border-slate-800 h-[540px] sm:h-[650px] relative z-0 shadow-2xl'
        }
      >
        {/* Floating Map Layer & Fullscreen Controls Overlay (Top-Right) */}
        <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-xl">
          {[
            { id: 'street', label: 'Street' },
            { id: 'dark', label: 'Dark NOC' },
            { id: 'satellite', label: 'Satellite' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMapTileStyle(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                mapTileStyle === t.id
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setIsMapFullscreen(!isMapFullscreen)}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold border border-slate-700 cursor-pointer"
            title={isMapFullscreen ? 'Exit Fullscreen Map' : 'Expand Fullscreen Map'}
          >
            {isMapFullscreen ? 'Exit Full' : 'Fullscreen'}
          </button>
        </div>

        {/* Floating Map Legend Pill (Top-Left, offset from zoom controls) */}
        <div className="absolute top-3 left-12 z-[1000] hidden sm:flex items-center gap-2.5 bg-slate-950/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[10px] font-bold text-slate-300 shadow-lg pointer-events-none">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Online
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Open Note
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> Outage / Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span> Focused
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
            <Radio className="w-8 h-8 text-cyan-400 animate-spin" />
            <span className="text-xs font-semibold">Plotting live telecom tower coordinates & active incident notes...</span>
          </div>
        ) : (
          <MapContainer center={defaultCenter} zoom={11} scrollWheelZoom={true} className="h-full w-full">
            <MapResizeInvalidator isFullscreen={isMapFullscreen} />

            {/* Map Controller for Smooth Flying */}
            <MapController targetCoords={mapTargetCoords} zoomLevel={mapZoom} />

            {/* Map Bounds Fitter for Path Framing */}
            <MapBoundsFitter boundsToFit={boundsToFit} onFitted={() => setBoundsToFit(null)} />

            {/* Map Measure Click Handler for adding waypoints */}
            <MapMeasureClickHandler isMeasuringMode={isMeasuringMode} onMapClick={handleMapMeasureClick} />

            {mapTileStyle === 'dark' ? (
              <TileLayer
                key="tile-dark"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
            ) : mapTileStyle === 'satellite' ? (
              <TileLayer
                key="tile-sat"
                attribution='&copy; Esri World Imagery'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            ) : (
              <TileLayer
                key="tile-street"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            )}

            {/* 🎯 Searched Location Proximity Circle */}
            {searchedLocation && (
              <Circle
                center={[searchedLocation.lat, searchedLocation.lng]}
                radius={proximityRadiusKm !== 'All' ? proximityRadiusKm * 1000 : 5000}
                pathOptions={{
                  color: '#06b6d4',
                  weight: 2,
                  dashArray: '6, 6',
                  fillColor: '#06b6d4',
                  fillOpacity: 0.08
                }}
              />
            )}

            {/* 🎯 Searched Location Target Marker */}
            {searchedLocation && (
              <Marker
                position={[searchedLocation.lat, searchedLocation.lng]}
                icon={getSearchedLocationIcon(searchedLocation.title)}
                zIndexOffset={1000}
              >
                <Tooltip direction="top" offset={[0, -80]} opacity={0.98} sticky>
                  <div className="p-2.5 text-xs text-white space-y-1 font-sans">
                    <div className="font-extrabold text-cyan-300 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                      <span>{searchedLocation.title}</span>
                    </div>
                    {searchedLocation.subtitle && (
                      <div className="text-[10px] text-slate-300 line-clamp-2 max-w-xs">{searchedLocation.subtitle}</div>
                    )}
                    <div className="text-[10px] text-cyan-200 font-mono pt-0.5">
                      Lat: {searchedLocation.lat.toFixed(5)}, Lng: {searchedLocation.lng.toFixed(5)}
                    </div>
                    <div className="text-[10px] text-emerald-300 font-bold flex items-center gap-1">
                      <Radio className="w-3 h-3 text-emerald-400" />
                      <span>{nearbySitesWithinRadius.length} Tower{nearbySitesWithinRadius.length !== 1 ? 's' : ''} in {proximityRadiusKm !== 'All' ? `${proximityRadiusKm} km` : 'Scope'}</span>
                    </div>
                  </div>
                </Tooltip>
                <Popup className="custom-leaflet-popup">
                  <div className="p-2.5 space-y-2 max-w-xs text-xs font-sans text-slate-900">
                    <div className="flex items-center justify-between border-b pb-1.5 gap-2">
                      <div className="flex items-center space-x-1.5">
                        <Target className="w-4 h-4 text-cyan-600" />
                        <span className="font-extrabold text-cyan-950 text-sm truncate">{searchedLocation.title}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-cyan-100 text-cyan-800 border border-cyan-300 shrink-0">
                        TARGET
                      </span>
                    </div>

                    {searchedLocation.subtitle && (
                      <p className="text-[11px] text-slate-600 leading-snug">{searchedLocation.subtitle}</p>
                    )}

                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200 space-y-1 text-[11px] text-slate-800 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Latitude:</span>
                        <b>{searchedLocation.lat.toFixed(6)}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Longitude:</span>
                        <b>{searchedLocation.lng.toFixed(6)}</b>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-200">
                        <span className="text-slate-500 font-sans">Nearby Towers:</span>
                        <b className="text-cyan-800">{nearbySitesWithinRadius.length} Towers ({proximityRadiusKm !== 'All' ? `${proximityRadiusKm}km` : 'Scope'})</b>
                      </div>
                      {nearbyStats?.closestSite && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Closest Tower:</span>
                          <b className="text-emerald-700 font-sans font-bold">
                            {nearbyStats.closestSite.ihs_site_id} ({formatDistance(nearbyStats.closestSite.distKm)})
                          </b>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyCoordinates(searchedLocation.lat, searchedLocation.lng)}
                        className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                      >
                        {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                        <span>{copiedCoords ? 'Coordinates Copied!' : 'Copy Exact Coordinates'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => window.open(`https://www.google.com/maps?q=${searchedLocation.lat},${searchedLocation.lng}`, '_blank')}
                        className="w-full py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in Google Maps / Satellite</span>
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {visibleMapSites.map((site) => {
              const { lat, lng } = getSiteCoordinates(site);
              const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
              const siteOpenNotes = getSiteOpenNotes(site);
              const hasOpenNotes = siteOpenNotes.length > 0;
              const hasCriticalOpenNote = siteOpenNotes.some(n => (n.priority || '').toLowerCase() === 'critical');

              const isFocused = site.ihs_site_id === activeFocusedSiteId;

              const distFromSearch = searchedLocation
                ? haversineKm(searchedLocation.lat, searchedLocation.lng, lat, lng)
                : null;
              const bearingFromSearch = searchedLocation
                ? calculateBearing(searchedLocation.lat, searchedLocation.lng, lat, lng)
                : null;
              
              // Marker Color & Label Logic
              let fillColor = '#10b981';
              let strokeColor = '#ffffff';
              let hasBadge = false;

              if (isFocused) {
                fillColor = '#06b6d4';
                strokeColor = '#ffffff';
              } else if (isDown || hasCriticalOpenNote) {
                fillColor = '#ef4444';
                strokeColor = '#ffffff';
                hasBadge = hasCriticalOpenNote;
              } else if (hasOpenNotes) {
                fillColor = '#f59e0b';
                strokeColor = '#ffffff';
                hasBadge = true;
              }

              const shouldShowThisSiteLabel =
                showSiteLabels &&
                (isFocused ||
                  isDown ||
                  hasCriticalOpenNote ||
                  hasOpenNotes ||
                  (viewportBounds?.zoom ?? 11) >= 13 ||
                  visibleMapSites.length <= 80);

              const siteMarkerIcon = getSiteMarkerIcon(
                fillColor,
                strokeColor,
                hasBadge,
                site.ihs_site_id || site.site_id || '',
                isFocused,
                shouldShowThisSiteLabel
              );

              const raw = site.raw_data || {};
              const tech = raw['Tech'] || '2G/3G/4G';
              const towerCo = raw['Tower Co'] || raw['OEM'] || 'IHS Tower';
              const lgaName = getSiteLga(site);

              return (
                <Marker
                  key={site.id}
                  position={[lat, lng]}
                  icon={siteMarkerIcon}
                  eventHandlers={{
                    click: () => {
                      setActiveFocusedSiteId(site.ihs_site_id);
                      if (isMeasuringMode) {
                        handleAddWaypointToActivePath({
                          siteId: site.ihs_site_id,
                          name: raw['Site Name'] || site.cluster_name || site.ihs_site_id,
                          lat,
                          lng,
                          lga: lgaName,
                          tech,
                          status: site.operational_status || (isDown ? 'Down' : 'Operational')
                        });
                      }
                    }
                  }}
                >
                  {/* On Mouse Hover Details Tooltip */}
                  <Tooltip
                    direction="top"
                    offset={[0, showSiteLabels ? -58 : -36]}
                    opacity={0.98}
                    sticky={true}
                    className="custom-hover-tooltip"
                  >
                    <div className="p-3 w-72 space-y-2 text-xs font-sans text-white">
                      
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 gap-2">
                        <div className="flex items-center space-x-1.5">
                          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                          <span className="font-extrabold text-cyan-300 font-mono text-xs">{site.ihs_site_id}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {site.priority || 'P2'}
                          </span>
                        </div>
                        
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          isDown ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                          hasOpenNotes ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {isDown ? 'OUTAGE' : hasOpenNotes ? 'OPEN NOTE' : 'ONLINE'}
                        </span>
                      </div>

                      {/* Name & LGA */}
                      <div>
                        <div className="font-bold text-white leading-snug line-clamp-1">
                          {raw['Site Name'] || site.cluster_name || 'Abuja Telecom Tower'}
                        </div>
                        <div className="text-[10px] text-cyan-300 font-medium flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span>LGA: <b>{lgaName}</b></span>
                        </div>
                        {site.site_address && (
                          <div className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">{site.site_address}</div>
                        )}
                      </div>

                      {/* Distance to Searched Target (if active) */}
                      {distFromSearch != null && (
                        <div className="flex items-center justify-between bg-cyan-950/80 border border-cyan-500/40 px-2 py-1 rounded-lg text-[10px] text-cyan-300 font-mono">
                          <span className="flex items-center gap-1 font-sans font-semibold">
                            <Target className="w-3 h-3 text-cyan-400" /> Distance to Target:
                          </span>
                          <span className="font-bold text-white">
                            {formatDistance(distFromSearch)} ({bearingFromSearch?.arrow} {bearingFromSearch?.cardinal})
                          </span>
                        </div>
                      )}

                      {/* Active Open Incident Note (If present) */}
                      {hasOpenNotes && (
                        <div className="p-2 bg-amber-500/15 border border-amber-500/40 rounded-lg space-y-1 text-[11px] text-amber-200">
                          <div className="flex items-center justify-between font-bold text-[10px] text-amber-300">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" /> Active Open Note
                            </span>
                            <span className="px-1 py-0.2 rounded text-[8px] bg-amber-400/20 text-amber-200 border border-amber-400/30">
                              {siteOpenNotes[0].priority}
                            </span>
                          </div>
                          <div className="font-semibold text-white text-[11px] line-clamp-1">{siteOpenNotes[0].title}</div>
                          <p className="text-[10px] text-slate-300 line-clamp-2 italic">"{siteOpenNotes[0].description}"</p>
                        </div>
                      )}

                      {/* Telemetry Grid */}
                      <div className="grid grid-cols-2 gap-1 text-[10px] bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[9px]">TECH</span>
                          <span className="font-bold text-cyan-300">{tech}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">TOWER OEM</span>
                          <span className="font-semibold text-slate-200 line-clamp-1">{towerCo}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">FSE ENGINEER</span>
                          <span className="font-semibold text-slate-200 line-clamp-1">{site.smc_fse_name || 'FSE Engineer'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">SDM MANAGER</span>
                          <span className="font-semibold text-slate-200 line-clamp-1">{site.sdm_name || 'SDM Manager'}</span>
                        </div>
                      </div>

                      <div className="text-[9px] font-mono text-cyan-400 text-right pt-0.5 font-semibold">
                        Click marker to open full satellite popup &amp; profile &rarr;
                      </div>

                    </div>
                  </Tooltip>

                  <Popup className="custom-leaflet-popup">
                    <div className="p-2 space-y-2.5 max-w-sm text-xs font-sans">
                      
                      {/* Popup Header */}
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <div className="flex items-center space-x-1.5">
                          <Radio className="w-4 h-4 text-cyan-600" />
                          <span className="font-extrabold text-cyan-900 font-mono text-sm">{site.ihs_site_id}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {hasOpenNotes && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> Open Note
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDown ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {site.operational_status || (isDown ? 'Down' : 'Operational')}
                          </span>
                        </div>
                      </div>

                      {/* Site Name & LGA */}
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-800 leading-snug">{raw['Site Name'] || site.cluster_name || 'Abuja Telecom Tower'}</div>
                        <div className="text-[11px] text-cyan-800 font-semibold flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-cyan-600" /> LGA: {lgaName}
                        </div>
                        {site.site_address && (
                          <div className="text-[10px] text-slate-600 line-clamp-2">{site.site_address}</div>
                        )}
                      </div>

                      {/* Active Open Incident Notes Section */}
                      {hasOpenNotes && (
                        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-300 space-y-1.5 text-xs text-amber-950">
                          <div className="flex items-center justify-between font-extrabold text-[11px] text-amber-900 border-b border-amber-200 pb-1">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-amber-700" /> ACTIVE OPEN NOTE ({siteOpenNotes.length})
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              siteOpenNotes[0].priority === 'Critical' ? 'bg-red-200 text-red-900 border border-red-300' :
                              siteOpenNotes[0].priority === 'High' ? 'bg-amber-200 text-amber-900 border border-amber-400' :
                              'bg-yellow-100 text-yellow-900 border border-yellow-300'
                            }`}>
                              {siteOpenNotes[0].priority} Priority
                            </span>
                          </div>

                          <div className="font-bold text-amber-950 text-xs">{siteOpenNotes[0].title}</div>

                          <div className="text-[10px] text-amber-800 flex items-center justify-between font-medium">
                            <span>Category: <b>{siteOpenNotes[0].category}</b></span>
                            <span>Logged by: <b>{siteOpenNotes[0].created_by}</b></span>
                          </div>

                          <p className="text-[11px] text-slate-800 line-clamp-3 italic bg-white p-2 rounded-lg border border-amber-200 shadow-inner">
                            "{siteOpenNotes[0].description}"
                          </p>

                          <div className="text-[9px] text-slate-500 font-mono flex items-center justify-between pt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              {new Date(siteOpenNotes[0].created_at).toLocaleString()}
                            </span>
                            <span className="font-bold text-amber-800 uppercase text-[9px]">Status: {siteOpenNotes[0].status}</span>
                          </div>
                        </div>
                      )}

                      {/* Telecom Metadata Grid */}
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-slate-100 p-2 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-slate-500 block">TECHNOLOGY</span>
                          <span className="font-bold text-cyan-800">{tech}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">TOWER INFRA</span>
                          <span className="font-bold text-slate-700">{towerCo}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">SDM MANAGER</span>
                          <span className="font-semibold text-slate-800">{site.sdm_name || 'SDM Manager'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">FIELD ENGINEER</span>
                          <span className="font-semibold text-slate-800">{site.smc_fse_name || 'FSE Engineer'}</span>
                        </div>
                      </div>

                      {/* Coordinates */}
                      <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between">
                        <span>Lat: {lat}</span>
                        <span>Long: {lng}</span>
                      </div>

                      {/* Distance to Searched Target (if active) */}
                      {distFromSearch != null && (
                        <div className="p-2 bg-cyan-50 rounded-xl border border-cyan-200 text-xs text-cyan-950 flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <Target className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
                            <span className="font-semibold truncate max-w-[150px]">From {searchedLocation.title}:</span>
                          </div>
                          <b className="font-mono text-cyan-900 font-extrabold text-xs shrink-0">
                            {formatDistance(distFromSearch)} {bearingFromSearch?.cardinal} ({bearingFromSearch?.degrees}°)
                          </b>
                        </div>
                      )}

                      {/* Interactive Action Buttons */}
                      <div className="flex flex-col gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleAddWaypointToActivePath({
                              siteId: site.ihs_site_id,
                              name: raw['Site Name'] || site.cluster_name || site.ihs_site_id,
                              lat,
                              lng,
                              lga: lgaName,
                              tech,
                              status: site.operational_status || (isDown ? 'Down' : 'Operational')
                            });
                          }}
                          className="w-full py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow cursor-pointer transition-all"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-200" />
                          <span>Add to Path ({activePath?.name || 'Path 1'})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectSearchedLocation({
                            lat,
                            lng,
                            title: site.ihs_site_id,
                            subtitle: raw['Site Name'] || site.cluster_name || site.site_address,
                            type: 'site'
                          })}
                          className="w-full py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow cursor-pointer transition-all"
                        >
                          <Target className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Show All Sites Around This Tower</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')}
                          className="w-full py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open in Satellite Map (Google Maps)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectSite(site.ihs_site_id)}
                          className="w-full py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1 shadow cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open Full Site Profile</span>
                        </button>
                      </div>

                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* 📡 Dynamic Viewport 4G LTE Sector Polygons Streamer */}
            <MapViewportSectorLoader showRfSectors={showRfSectors} onBoundsChange={handleBoundsChange} onViewportChange={setViewportBounds} />

            {/* 📡 4G LTE RF SECTOR COVERAGE POLYGONS (KML) */}
            {showRfSectors && renderedSectors.map((sec) => {
              if (!sec.polygon_coords || sec.polygon_coords.length < 3) return null;
              const az = sec.azimuth || 0;
              const isSelected = activeFocusedSector && activeFocusedSector.id === sec.id;
              const isSiteFocused = activeFocusedSiteId && (sec.site_id === activeFocusedSiteId);
              const color = az < 120 ? '#06b6d4' : az < 240 ? '#8b5cf6' : '#f59e0b';

              return (
                <Polygon
                  key={`sec_poly_${sec.id || sec.cell_name}`}
                  positions={sec.polygon_coords}
                  pathOptions={{
                    color: isSelected ? '#ffffff' : isSiteFocused ? '#38bdf8' : color,
                    weight: isSelected ? 3.5 : isSiteFocused ? 2.5 : 1.5,
                    fillColor: color,
                    fillOpacity: isSelected ? 0.65 : isSiteFocused ? 0.5 : 0.35,
                    dashArray: isSelected ? '4, 4' : null
                  }}
                  eventHandlers={{
                    click: () => {
                      setActiveFocusedSector(sec);
                      setActiveFocusedSiteId(sec.site_id);
                    }
                  }}
                >
                  <Popup className="custom-leaflet-popup">
                    <div className="p-2.5 space-y-2 text-xs font-sans">
                      <div className="flex items-center justify-between border-b pb-1.5 gap-2">
                        <div className="flex items-center space-x-1.5">
                          <Radio className="w-4 h-4 text-cyan-600 animate-pulse" />
                          <span className="font-black text-cyan-900 font-mono text-sm">{sec.cell_name}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-800 border border-indigo-300">
                          {sec.layer ? `${sec.layer} Carrier` : '4G LTE Carrier'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">SITE ID</span>
                          <b className="font-mono text-cyan-800 text-xs">{sec.site_id}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">CARRIER LAYER</span>
                          <b className="font-mono text-indigo-700 text-xs">{sec.layer || '4G LTE'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">ANTENNA AZIMUTH</span>
                          <b className="font-mono text-emerald-700 text-xs">{sec.azimuth != null ? `${sec.azimuth}°` : 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">PRB UTILIZATION</span>
                          <b className={`font-mono text-xs ${
                            sec.prb_utilization >= 85 ? 'text-red-700' :
                            sec.prb_utilization >= 70 ? 'text-amber-700' : 'text-emerald-700'
                          }`}>
                            {sec.prb_utilization != null ? `${sec.prb_utilization.toFixed(1)}%` : (sec.pci != null ? `PCI: ${sec.pci}` : 'N/A')}
                          </b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">eNodeB / CELL ID</span>
                          <b className="font-mono text-slate-700">{sec.enodeb || sec.cell_id || 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">STATE / REGION</span>
                          <b className="text-slate-700 truncate">{sec.state || sec.region || 'Abuja Region'}</b>
                        </div>
                      </div>

                      {sec.prb_range && (
                        <div className="text-[10px] bg-amber-50 text-amber-900 px-2 py-1 rounded-lg border border-amber-200 flex items-center justify-between">
                          <span className="font-bold">PRB Band Range:</span>
                          <span className="font-mono font-extrabold">{sec.prb_range}</span>
                        </div>
                      )}

                      <div className="text-[10px] font-mono text-slate-500 flex items-center justify-between pt-0.5">
                        <span>Lat: {sec.latitude?.toFixed(4)}</span>
                        <span>Lng: {sec.longitude?.toFixed(4)}</span>
                      </div>

                      <div className="flex flex-col gap-1 pt-1">
                        <button
                          onClick={() => {
                            if (sec.site_id) {
                              onSelectSite(sec.site_id);
                            }
                          }}
                          className="w-full py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1 shadow cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Open Site Profile ({sec.site_id})</span>
                        </button>
                      </div>
                    </div>
                  </Popup>
                  <Tooltip sticky direction="top">
                    <div className="p-1.5 text-xs text-white space-y-0.5 font-sans">
                      <div className="font-bold text-cyan-300 font-mono flex items-center gap-1.5">
                        <Radio className="w-3 h-3 text-cyan-400" />
                        <span>{sec.cell_name} {sec.layer ? `(${sec.layer})` : ''}</span>
                        {sec.prb_utilization != null && (
                          <span className={`ml-auto px-1.5 py-0.2 text-[9px] rounded font-bold ${
                            sec.prb_utilization >= 85 ? 'bg-red-950 text-red-300 border border-red-500/40' :
                            sec.prb_utilization >= 70 ? 'bg-amber-950 text-amber-300 border border-amber-500/40' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          }`}>
                            PRB: {sec.prb_utilization.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Site: <b className="text-white font-mono">{sec.site_id}</b> • Azimuth: <b className="text-emerald-400 font-mono">{sec.azimuth}°</b> {sec.state ? `• ${sec.state}` : ''}
                      </div>
                    </div>
                  </Tooltip>
                </Polygon>
              );
            })}

            {/* 📐 MULTI-PATH MEASUREMENT VISUALIZATIONS */}
            {/* 1. Render Polylines for each path with >= 2 waypoints */}
            {paths.map((p) => {
              if (!p.waypoints || p.waypoints.length < 2) return null;
              const positions = p.waypoints.map(w => [w.lat, w.lng]);
              const isActive = p.id === activePathId;

              return (
                <React.Fragment key={`route_poly_${p.id}`}>
                  {/* Subtle dark halo for maximum contrast across street & satellite maps */}
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: '#020617',
                      weight: isActive ? 7 : 5,
                      opacity: 0.85
                    }}
                  />
                  {/* Primary route color line */}
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: p.color,
                      weight: isActive ? 4.5 : 3,
                      opacity: isActive ? 1 : 0.65,
                      dashArray: isActive ? null : '6, 6'
                    }}
                    eventHandlers={{
                      click: () => {
                        setActivePathId(p.id);
                        setShowMeasureDrawer(true);
                      }
                    }}
                  />
                </React.Fragment>
              );
            })}

            {/* 2. Render Midpoint Distance Badges for Legs */}
            {paths.map((p) => {
              const isActive = p.id === activePathId;
              const metrics = calculatePathMetrics(p.waypoints);
              return metrics.legs.map((leg) => (
                <Marker
                  key={`leg_mid_${p.id}_${leg.legIndex}`}
                  position={leg.midpoint}
                  icon={getMidpointDistanceIcon(
                    formatDistance(leg.distKm),
                    `${leg.bearing.arrow} ${leg.bearing.cardinal}`,
                    p.color
                  )}
                  zIndexOffset={isActive ? 1100 : 800}
                  eventHandlers={{
                    click: () => {
                      setActivePathId(p.id);
                      setShowMeasureDrawer(true);
                    }
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.98}>
                    <div className="p-2 text-xs text-white space-y-1 font-sans">
                      <div className="font-extrabold flex items-center justify-between gap-2" style={{ color: p.color }}>
                        <span>Leg {leg.legIndex + 1}: {leg.fromLetter} ➔ {leg.toLetter}</span>
                        <span className="font-mono text-white">{formatDistance(leg.distKm)}</span>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        From: <b className="text-white font-mono">{leg.from.siteId || 'Point'}</b> ➔ To: <b className="text-white font-mono">{leg.to.siteId || 'Point'}</b>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Bearing: <b className="text-white font-mono">{leg.bearing.degrees}° ({leg.bearing.cardinal} {leg.bearing.arrow})</b>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Est. Fiber Delay: <b className="text-cyan-300 font-mono">~{(leg.distKm * 4.9).toFixed(1)} µs</b>
                      </div>
                    </div>
                  </Tooltip>
                </Marker>
              ));
            })}

            {/* 3. Render Waypoint Markers with Letter Badges */}
            {paths.map((p) => {
              const isActive = p.id === activePathId;
              return p.waypoints.map((wp, idx) => {
                const isStart = idx === 0;
                const isEnd = idx === p.waypoints.length - 1 && p.waypoints.length > 1;
                const letter = getWaypointLetter(idx);
                const icon = getWaypointMarkerIcon(letter, p.color, wp.siteId, isStart, isEnd);

                return (
                  <Marker
                    key={`wp_marker_${p.id}_${wp.id || idx}`}
                    position={[wp.lat, wp.lng]}
                    icon={icon}
                    zIndexOffset={isActive ? 1200 + idx : 900 + idx}
                    eventHandlers={{
                      click: () => {
                        setActivePathId(p.id);
                        setShowMeasureDrawer(true);
                      }
                    }}
                  >
                    <Tooltip direction="top" offset={[0, -60]} opacity={0.98} sticky>
                      <div className="p-2 text-xs text-white space-y-1 font-sans">
                        <div className="font-extrabold flex items-center gap-1.5" style={{ color: p.color }}>
                          <span className="px-1 py-0.2 rounded text-[10px] bg-slate-900 border border-current font-mono font-black">
                            [{letter}]
                          </span>
                          <span>{wp.siteId || 'Waypoint'}</span>
                          <span className="text-[10px] text-slate-400 font-normal">({p.name})</span>
                        </div>
                        {wp.name && <div className="text-[11px] text-slate-200">{wp.name}</div>}
                        <div className="text-[10px] font-mono text-slate-400">
                          Lat: {wp.lat.toFixed(5)}, Lng: {wp.lng.toFixed(5)}
                        </div>
                        {isStart && <div className="text-[9px] font-black text-emerald-400 uppercase">● Route Origin Point</div>}
                        {isEnd && <div className="text-[9px] font-black text-red-400 uppercase">● Route Destination Point</div>}
                      </div>
                    </Tooltip>
                  </Marker>
                );
              });
            })}
          </MapContainer>
        )}

        {/* 📋 SITES AROUND SEARCHED LOCATION FLOATING DRAWER */}
        {searchedLocation && showProximityDrawer && (
          <div className="absolute bottom-3 right-3 z-[1000] w-96 max-w-[calc(100%-1.5rem)] max-h-[500px] flex flex-col glass-panel bg-slate-950/95 border border-cyan-500/50 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in slide-in-from-bottom-3 duration-200">
            
            {/* Drawer Header */}
            <div className="p-3 bg-gradient-to-r from-slate-900 via-cyan-950/80 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Target className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <h4 className="font-black text-xs text-white truncate">
                    Towers Around {searchedLocation.title}
                  </h4>
                  <span className="text-[10px] text-cyan-300 font-mono">
                    {nearbySitesWithinRadius.length} sites ranked by proximity
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowProximityDrawer(false)}
                  title="Minimize drawer"
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleClearSearchedLocation}
                  title="Clear searched location"
                  className="p-1 text-slate-400 hover:text-red-300 rounded-lg hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Radius Selector inside Drawer */}
            <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Search Range:</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 10, 'All'].map((r) => (
                  <button
                    key={`drawer_rad_${r}`}
                    type="button"
                    onClick={() => setProximityRadiusKm(r)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                      proximityRadiusKm === r
                        ? 'bg-cyan-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {r === 'All' ? 'All' : `${r}k`}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Ranked Sites List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[360px]">
              {nearbySitesWithinRadius.length > 0 ? (
                nearbySitesWithinRadius.map((site, idx) => {
                  const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
                  const siteNotes = getSiteOpenNotes(site);
                  const hasOpenNote = siteNotes.length > 0;
                  const isFocused = site.ihs_site_id === activeFocusedSiteId;

                  return (
                    <div
                      key={`nearby_card_${site.id}`}
                      className={`p-2.5 rounded-xl border transition-all space-y-1.5 ${
                        isFocused
                          ? 'bg-cyan-950/90 border-cyan-400 shadow-md shadow-cyan-500/20'
                          : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-slate-950 border border-slate-700 text-[10px] font-black text-slate-300 flex items-center justify-center font-mono shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-extrabold text-xs text-white truncate">
                            {site.ihs_site_id}
                          </span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            isDown ? 'bg-red-500 shadow-sm shadow-red-500' : hasOpenNote ? 'bg-amber-400 shadow-sm shadow-amber-400' : 'bg-emerald-400 shadow-sm shadow-emerald-400'
                          }`} />
                        </div>

                        {/* Distance Badge */}
                        <div className="flex items-center gap-1 font-mono text-xs font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-lg border border-cyan-500/30 shrink-0">
                          <span>{formatDistance(site.distKm)}</span>
                          <span className="text-[10px] text-cyan-400 font-bold">{site.bearing?.arrow} {site.bearing?.cardinal}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="truncate max-w-[190px]">{site.raw_data?.['Site Name'] || site.cluster_name || 'Abuja Tower'}</span>
                        <span className="font-medium text-slate-300 shrink-0">{getSiteLga(site)}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px]">
                        <span className="text-slate-500 truncate max-w-[150px]">
                          FSE: <b className="text-slate-300 font-normal">{site.smc_fse_name || 'Assigned FSE'}</b>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleFocusSite(site)}
                            className="px-2 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 rounded font-bold transition-all cursor-pointer"
                          >
                            Focus
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectSite(site.ihs_site_id)}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-bold transition-all cursor-pointer"
                          >
                            Profile
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 space-y-2">
                  <p>No telecom sites found within {proximityRadiusKm} km of this position.</p>
                  <button
                    type="button"
                    onClick={() => setProximityRadiusKm(10)}
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Expand Radius to 10 km
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Minimized Floating Drawer Toggle Pill */}
        {searchedLocation && !showProximityDrawer && (
          <button
            type="button"
            onClick={() => setShowProximityDrawer(true)}
            className="absolute bottom-3 right-3 z-[1000] px-3.5 py-2 bg-slate-900/95 hover:bg-slate-800 text-white border border-cyan-500/50 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer"
          >
            <Target className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>Sites Near Target ({nearbySitesWithinRadius.length})</span>
            <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        )}

        {/* 📐 MULTI-PATH MEASUREMENT FLOATING DRAWER */}
        {showMeasureDrawer && (
          <div className="absolute bottom-3 left-3 z-[1000] w-[440px] max-w-[calc(100%-1.5rem)] max-h-[520px] flex flex-col glass-panel bg-slate-950/95 border border-amber-500/50 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in slide-in-from-bottom-3 duration-200">
            
            {/* Drawer Header */}
            <div className="p-3 bg-gradient-to-r from-slate-900 via-amber-950/80 to-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 min-w-0">
                <Ruler className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <h4 className="font-black text-xs text-white truncate flex items-center gap-1.5">
                    <span>Multi-Path Distance Measurement</span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      {paths.length} {paths.length === 1 ? 'Route' : 'Routes'}
                    </span>
                  </h4>
                  <span className="text-[10px] text-slate-300 font-mono flex items-center gap-1">
                    Mode: <b className={isMeasuringMode ? 'text-amber-400 font-bold' : 'text-slate-400'}>{isMeasuringMode ? 'Click Map / Towers' : 'Inspection'}</b>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMeasuringMode(!isMeasuringMode)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                    isMeasuringMode
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Toggle map-click measurement mode"
                >
                  <Crosshair className="w-3 h-3" />
                  <span>{isMeasuringMode ? 'Adding Pts' : 'Add Mode'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMeasureDrawer(false)}
                  title="Minimize drawer"
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMeasureDrawer(false);
                    setIsMeasuringMode(false);
                  }}
                  title="Close measurement tool"
                  className="p-1 text-slate-400 hover:text-red-300 rounded-lg hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Path Tabs & Mode Switcher */}
            <div className="px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                {paths.map((p) => {
                  const isActive = p.id === activePathId && measureDrawerTab === 'active';
                  const pMetrics = calculatePathMetrics(p.waypoints);
                  return (
                    <button
                      key={`path_tab_${p.id}`}
                      type="button"
                      onClick={() => {
                        setActivePathId(p.id);
                        setMeasureDrawerTab('active');
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                        isActive
                          ? 'bg-slate-800 text-white shadow-md'
                          : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-900 border-slate-800'
                      }`}
                      style={{
                        borderColor: isActive ? p.color : undefined
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span>{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({p.waypoints.length > 0 ? formatDistance(pMetrics.totalDistanceKm) : 'Empty'})
                      </span>
                    </button>
                  );
                })}

                {/* Add New Path Button */}
                {paths.length < 6 && (
                  <button
                    type="button"
                    onClick={handleAddNewPath}
                    title="Create another path for route comparison"
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 rounded-xl text-xs font-bold border border-dashed border-cyan-500/40 flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Path</span>
                  </button>
                )}
              </div>

              {/* Compare Routes Button (If >= 2 paths) */}
              {paths.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMeasureDrawerTab(measureDrawerTab === 'compare' ? 'active' : 'compare')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 border cursor-pointer ${
                    measureDrawerTab === 'compare'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400 shadow-md'
                      : 'bg-slate-800 text-purple-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span>Compare ({paths.length})</span>
                </button>
              )}
            </div>

            {/* TAB CONTENT: ACTIVE PATH VIEW */}
            {measureDrawerTab === 'active' && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                
                {/* Path Configuration & Metrics Bar */}
                <div className="p-3 bg-slate-900/60 border-b border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        value={activePath.name}
                        onChange={(e) => handleUpdatePathName(activePath.id, e.target.value)}
                        placeholder="Path Name..."
                        className="bg-slate-950 border border-slate-700 text-xs text-white font-black px-2 py-1 rounded-lg focus:outline-none focus:border-amber-400 w-32 shrink-0"
                      />
                      
                      {/* Color Palette Selector */}
                      <div className="flex items-center gap-1">
                        {PATH_COLORS.map(c => (
                          <button
                            key={`color_${c.id}`}
                            type="button"
                            onClick={() => handleUpdatePathColor(activePath.id, c.hex, c.id)}
                            className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                              activePath.color === c.hex ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleFitPathOnMap(activePath)}
                        disabled={activePath.waypoints.length === 0}
                        title="Fit route on map view"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-cyan-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Target className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReversePath(activePath.id)}
                        disabled={activePath.waypoints.length < 2}
                        title="Reverse route direction"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyPathReport(activePath)}
                        disabled={activePath.waypoints.length === 0}
                        title="Copy route distance report to clipboard"
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        {copiedPathReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearPath(activePath.id)}
                        disabled={activePath.waypoints.length === 0}
                        title="Clear all waypoints in this path"
                        className="p-1.5 bg-slate-800 hover:bg-amber-950/60 disabled:opacity-40 text-amber-400 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      {paths.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeletePath(activePath.id)}
                          title="Delete this comparison path"
                          className="p-1.5 bg-slate-800 hover:bg-red-950/60 text-red-400 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Metric Stats Badges */}
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
                    <div className="bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 font-sans block uppercase font-bold">Total Dist</span>
                      <b className="text-xs font-extrabold" style={{ color: activePath.color }}>
                        {formatDistance(activePathMetrics.totalDistanceKm)}
                      </b>
                    </div>
                    <div className="bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 font-sans block uppercase font-bold">Hops</span>
                      <b className="text-xs font-extrabold text-white">
                        {activePathMetrics.totalHops} {activePathMetrics.totalHops === 1 ? 'Hop' : 'Hops'}
                      </b>
                    </div>
                    <div className="bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 font-sans block uppercase font-bold">Displacement</span>
                      <b className="text-xs font-extrabold text-slate-300">
                        {formatDistance(activePathMetrics.straightLineDisplacementKm)}
                      </b>
                    </div>
                    <div className="bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                      <span className="text-[9px] text-slate-400 font-sans block uppercase font-bold">Fiber Latency</span>
                      <b className="text-xs font-extrabold text-cyan-300">
                        {activePathMetrics.latencyMicros > 0 ? `~${activePathMetrics.latencyMicros.toFixed(1)}µs` : '0µs'}
                      </b>
                    </div>
                  </div>
                </div>

                {/* Quick Add Autocomplete & Next-Hop Recommendation Section */}
                <div className="p-2.5 bg-slate-950/90 border-b border-slate-800 space-y-2">
                  
                  {/* Site Search Autocomplete */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Add tower to path by ID (e.g. FC0021) or Name..."
                      value={measureSearchQuery}
                      onChange={(e) => setMeasureSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 rounded-xl focus:outline-none focus:border-amber-400 font-mono shadow-inner"
                    />
                    {measureSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setMeasureSearchQuery('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Suggestions Dropdown */}
                    {measureSearchSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-slate-900 border border-amber-500/50 rounded-xl shadow-2xl p-1 max-h-48 overflow-y-auto space-y-1">
                        {measureSearchSuggestions.map(({ site, coords, distKm, bearing }) => (
                          <div
                            key={`sugg_msr_${site.id}`}
                            onClick={() => {
                              handleAddWaypointToActivePath({
                                siteId: site.ihs_site_id,
                                name: site.raw_data?.['Site Name'] || site.cluster_name || site.ihs_site_id,
                                lat: coords.lat,
                                lng: coords.lng,
                                lga: getSiteLga(site),
                                tech: site.raw_data?.['Tech'] || '2G/3G/4G',
                                status: site.operational_status || (site.is_down ? 'Down' : 'Operational')
                              });
                              setMeasureSearchQuery('');
                            }}
                            className="p-2 rounded-lg hover:bg-amber-950/80 cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-extrabold text-white">{site.ihs_site_id}</span>
                              <span className="text-[10px] text-slate-400 truncate ml-1.5">
                                {site.raw_data?.['Site Name'] || site.cluster_name}
                              </span>
                            </div>
                            {distKm != null && (
                              <span className="text-[10px] font-mono text-amber-300 font-bold shrink-0">
                                +{formatDistance(distKm)} {bearing?.arrow}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 1-Click Next-Hop Recommendations Chips */}
                  {nextHopRecommendations.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        <CornerDownRight className="w-3 h-3 text-amber-400" />
                        <span>Recommended Next Hop from [{getWaypointLetter(activePath.waypoints.length - 1)}] {activePath.waypoints[activePath.waypoints.length - 1].siteId}:</span>
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {nextHopRecommendations.map(({ site, coords, distKm, bearing }) => (
                          <button
                            key={`rec_hop_${site.id}`}
                            type="button"
                            onClick={() => {
                              handleAddWaypointToActivePath({
                                siteId: site.ihs_site_id,
                                name: site.raw_data?.['Site Name'] || site.cluster_name || site.ihs_site_id,
                                lat: coords.lat,
                                lng: coords.lng,
                                lga: getSiteLga(site),
                                tech: site.raw_data?.['Tech'] || '2G/3G/4G',
                                status: site.operational_status || (site.is_down ? 'Down' : 'Operational')
                              });
                            }}
                            className="px-2 py-1 bg-slate-900 hover:bg-amber-950/80 border border-slate-700 hover:border-amber-400 text-slate-200 hover:text-white rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                          >
                            <Plus className="w-3 h-3 text-amber-400" />
                            <span>{site.ihs_site_id}</span>
                            <span className="text-amber-300">({formatDistance(distKm)} {bearing?.arrow})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Waypoints & Legs List */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[260px]">
                  {activePath.waypoints.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                        <Route className="w-6 h-6" />
                      </div>
                      <div className="font-bold text-white">No Sites Added to {activePath.name} Yet</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                        Click any telecom tower marker on the map, use the search box above, or click <b className="text-amber-300">"Add to Path"</b> inside any site's popup to measure distance.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsMeasuringMode(true)}
                        className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer"
                      >
                        Enable Map Click Mode
                      </button>
                    </div>
                  ) : (
                    activePath.waypoints.map((wp, idx) => {
                      const letter = getWaypointLetter(idx);
                      const isFirst = idx === 0;
                      const isLast = idx === activePath.waypoints.length - 1;
                      const legFromPrev = idx > 0 ? activePathMetrics.legs[idx - 1] : null;

                      return (
                        <React.Fragment key={`wp_card_${activePath.id}_${wp.id || idx}`}>
                          
                          {/* Inter-Hop Leg Distance Pill (between waypoints) */}
                          {legFromPrev && (
                            <div className="flex items-center justify-center my-0.5">
                              <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-900 border border-slate-700/80 font-mono text-[10px] text-slate-300 shadow-sm">
                                <span className="text-amber-400 font-extrabold">{formatDistance(legFromPrev.distKm)}</span>
                                <span className="text-slate-500">•</span>
                                <span>{legFromPrev.bearing.degrees}° ({legFromPrev.bearing.cardinal} {legFromPrev.bearing.arrow})</span>
                                <span className="text-slate-500">•</span>
                                <span className="text-cyan-400">~{(legFromPrev.distKm * 4.9).toFixed(1)}µs</span>
                              </div>
                            </div>
                          )}

                          {/* Waypoint Card */}
                          <div className="p-2 bg-slate-900/90 rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-2 shadow-sm">
                            
                            <div className="flex items-center space-x-2 min-w-0">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs font-mono shrink-0 shadow"
                                style={{
                                  backgroundColor: activePath.color,
                                  color: '#0f172a'
                                }}
                              >
                                {letter}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-black text-xs text-white truncate">
                                    {wp.siteId || `Point ${letter}`}
                                  </span>
                                  {isFirst && (
                                    <span className="px-1 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                                      ORIGIN
                                    </span>
                                  )}
                                  {isLast && activePath.waypoints.length > 1 && (
                                    <span className="px-1 py-0.2 rounded text-[8px] font-black uppercase bg-red-950 text-red-300 border border-red-500/40">
                                      TERM
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                  {wp.name || `${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}`}
                                </div>
                              </div>
                            </div>

                            {/* Waypoint Operations Toolbar */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setMapTargetCoords([wp.lat, wp.lng]);
                                  setMapZoom(16);
                                }}
                                title="Center map on this waypoint"
                                className="p-1 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <Target className="w-3.5 h-3.5" />
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => handleMoveWaypoint(activePath.id, idx, idx - 1)}
                                disabled={isFirst}
                                title="Move waypoint earlier"
                                className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleMoveWaypoint(activePath.id, idx, idx + 1)}
                                disabled={isLast}
                                title="Move waypoint later"
                                className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveWaypoint(activePath.id, idx)}
                                title="Remove waypoint from path"
                                className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-red-950/40 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

              </div>
            )}

            {/* TAB CONTENT: COMPARE ALL PATHS */}
            {measureDrawerTab === 'compare' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[380px]">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
                  <span className="font-bold uppercase text-[10px]">Alternative Routes Comparison</span>
                  <span>{allPathsComparison.length} Routes Configured</span>
                </div>

                {allPathsComparison.map((p) => (
                  <div
                    key={`comp_card_${p.id}`}
                    className={`p-3 rounded-xl border transition-all space-y-2 ${
                      p.id === activePathId
                        ? 'bg-slate-900 border-amber-400 shadow-md'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-extrabold text-xs text-white">{p.name}</span>
                        {p.isShortest && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                            SHORTEST ROUTE
                          </span>
                        )}
                        {p.diffFromShortestKm > 0.05 && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40">
                            +{formatDistance(p.diffFromShortestKm)} longer
                          </span>
                        )}
                      </div>

                      <span className="font-mono font-extrabold text-sm" style={{ color: p.color }}>
                        {formatDistance(p.metrics.totalDistanceKm)}
                      </span>
                    </div>

                    {/* Route Details Grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px] bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Hops</span>
                        <b className="text-white">{p.metrics.totalHops} hops ({p.waypoints.length} sites)</b>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Displacement</span>
                        <b className="text-slate-300">{formatDistance(p.metrics.straightLineDisplacementKm)}</b>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase font-sans font-bold">Detour Ratio</span>
                        <b className={p.metrics.routeRatio > 1.5 ? 'text-amber-400' : 'text-emerald-400'}>
                          {p.metrics.routeRatio.toFixed(2)}x
                        </b>
                      </div>
                    </div>

                    {/* Hop Sequence Breadcrumbs */}
                    <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 flex-wrap">
                      <span className="font-bold text-slate-500 uppercase font-sans text-[9px]">Sequence:</span>
                      {p.waypoints.length > 0 ? (
                        p.waypoints.map((w, wIdx) => (
                          <span key={`w_seq_${p.id}_${wIdx}`} className="flex items-center gap-1">
                            <b className="text-white">[{getWaypointLetter(wIdx)}] {w.siteId || 'Pt'}</b>
                            {wIdx < p.waypoints.length - 1 && <span className="text-slate-600">➔</span>}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-600 italic">No waypoints added yet</span>
                      )}
                    </div>

                    {/* Switch / Copy buttons */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => handleCopyPathReport(p)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePathId(p.id);
                          setMeasureDrawerTab('active');
                          handleFitPathOnMap(p);
                        }}
                        className="px-2.5 py-0.5 bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 rounded text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        Activate &amp; Edit
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* 📐 Minimized Floating Measure Mode Pill */}
        {!showMeasureDrawer && (paths.some(p => p.waypoints.length > 0) || isMeasuringMode) && (
          <button
            type="button"
            onClick={() => setShowMeasureDrawer(true)}
            className="absolute bottom-3 left-3 z-[1000] px-3.5 py-2 bg-slate-900/95 hover:bg-slate-800 text-white border border-amber-500/50 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer"
          >
            <Ruler className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>Path Measurement:</span>
            <b className="font-mono text-amber-300">
              {activePathMetrics.totalDistanceKm > 0 ? formatDistance(activePathMetrics.totalDistanceKm) : `${activePath.waypoints.length} sites`}
            </b>
            <span className="text-slate-400 font-normal">({paths.length} {paths.length === 1 ? 'Route' : 'Routes'})</span>
            <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
          </button>
        )}

    </div>
    </div>
  );
}
