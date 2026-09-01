import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, Radio, Eye, ShieldAlert, ExternalLink, Lock, User, Layers, Database,
  Search, Filter, X, RefreshCw, CheckCircle, AlertTriangle, Building2, Navigation,
  FileText, Clock, Compass, Activity, Zap
} from 'lucide-react';
import { fetchSites, fetchNotes, fetchSiteCellSectors, fetchCellSectors, fetchKmlStats } from '../api';

// Create high quality SVG markers with optional alert badges for open incident notes
const createSvgMarkerIcon = (fillColor, strokeColor = '#ffffff', hasBadge = false) => {
  const badgeSvg = hasBadge ? `
    <circle cx="19" cy="5" r="4.5" fill="#f43f5e" stroke="#ffffff" stroke-width="1.4"/>
    <path d="M19 3.2 V 5.2 M 19 6.5 V 6.7" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>
  ` : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="32" height="44">
      <filter id="shadow-${fillColor.replace('#', '')}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
      <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 36 12 36 C12 36 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.8" filter="url(#shadow-${fillColor.replace('#', '')})"/>
      <circle cx="12" cy="12" r="5.5" fill="#ffffff"/>
      <circle cx="12" cy="12" r="3.5" fill="${fillColor}"/>
      ${badgeSvg}
    </svg>
  `;
  return L.divIcon({
    className: 'custom-telecom-marker',
    html: svg,
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -40]
  });
};

const greenTowerIcon = createSvgMarkerIcon('#10b981');
const amberTowerIcon = createSvgMarkerIcon('#f59e0b', '#ffffff', true); // Open Note / Active Incident
const redTowerIcon = createSvgMarkerIcon('#ef4444', '#ffffff', true); // Down or Critical Note
const blueTowerIcon = createSvgMarkerIcon('#06b6d4', '#38bdf8');

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

// Dynamic Viewport 4G LTE Sector Loader
function MapViewportSectorLoader({ showRfSectors, onBoundsChange }) {
  const map = useMap();

  useEffect(() => {
    if (!showRfSectors) return;

    let timeoutId = null;
    const triggerBounds = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          const b = map.getBounds();
          const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
          onBoundsChange(bbox);
        } catch (e) {}
      }, 200);
    };

    triggerBounds();
    map.on('moveend', triggerBounds);
    map.on('zoomend', triggerBounds);

    return () => {
      clearTimeout(timeoutId);
      map.off('moveend', triggerBounds);
      map.off('zoomend', triggerBounds);
    };
  }, [map, showRfSectors, onBoundsChange]);

  return null;
}

import { getSDMStateInfo } from '../utils/userUtils';

export default function GeoMap({ onSelectSite, currentUser }) {
  const isSuperuser = currentUser?.is_superuser;
  const stateInfo = getSDMStateInfo(currentUser);
  const userSdmName = currentUser?.full_name || currentUser?.username || '';

  const [sites, setSites] = useState([]);
  const [openNotesBySite, setOpenNotesBySite] = useState({});
  const [loading, setLoading] = useState(true);

  // 4G LTE KML RF Sector States
  const [showRfSectors, setShowRfSectors] = useState(true);
  const [kmlStats, setKmlStats] = useState(null);
  const [mapSectors, setMapSectors] = useState([]);
  const [focusedSectors, setFocusedSectors] = useState([]);
  const [loadingMapSectors, setLoadingMapSectors] = useState(false);
  const [pciFilter, setPciFilter] = useState('All');
  const [sectorSearchQuery, setSectorSearchQuery] = useState('');
  const [sectorSearchResults, setSectorSearchResults] = useState([]);
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);
  const [activeFocusedSector, setActiveFocusedSector] = useState(null);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLga, setSelectedLga] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  
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

    if (pciFilter !== 'All') {
      const numPci = parseInt(pciFilter, 10);
      list = list.filter(s => s.pci === numPci);
    }

    return list;
  }, [showRfSectors, mapSectors, focusedSectors, activeFocusedSector, pciFilter]);

  const loadMapData = async () => {
    setLoading(true);
    try {
      const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer';
      const isSdm = !isSuperuser && !isFse;

      const sdmParam = isSdm ? (currentUser?.full_name || currentUser?.username) : undefined;
      const fseParam = isFse ? (currentUser?.full_name || currentUser?.username) : undefined;
      
      const [sitesData, notesData] = await Promise.all([
        fetchSites({
          sdm: sdmParam,
          fse: fseParam,
          is_superuser: isSuperuser ? 'true' : 'false',
          user_state: stateInfo?.code,
          page_size: 25000
        }),
        fetchNotes({ page_size: 10000 })
      ]);

      const sitesList = sitesData.results || sitesData || [];
      const notesList = notesData.results || notesData || [];

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

  // Filtered sites array based on Search term, LGA, and Status
  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      // 1. Search term match
      if (searchTerm.trim()) {
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

      // 2. LGA filter match
      if (selectedLga !== 'All') {
        const siteLga = getSiteLga(site);
        if (siteLga.toLowerCase() !== selectedLga.toLowerCase()) return false;
      }

      // 3. Status filter match
      const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
      const siteOpenNotes = getSiteOpenNotes(site);
      const hasOpenNotes = siteOpenNotes.length > 0;

      if (selectedStatus === 'Operational' && isDown) return false;
      if (selectedStatus === 'Down' && !isDown) return false;
      if (selectedStatus === 'OpenNotes' && !hasOpenNotes) return false;

      return true;
    });
  }, [sites, openNotesBySite, searchTerm, selectedLga, selectedStatus]);

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

  // Direct Site Selection / Focus from Search or Dropdown
  const handleFocusSite = (site) => {
    const { lat, lng } = getSiteCoordinates(site);
    setActiveFocusedSiteId(site.ihs_site_id);
    setMapTargetCoords([lat, lng]);
    setMapZoom(15);
    setShowSearchResults(false);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedLga('All');
    setSelectedStatus('All');
    setActiveFocusedSiteId(null);
    setMapTargetCoords(defaultCenter);
    setMapZoom(11);
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner & Control Toolbar */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
        
        {/* Header Title Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-400" />
              {stateInfo.mapTitle || 'Live Geographic Map of Telecom Sites'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-cyan-300 font-semibold flex items-center gap-1 mt-0.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" /> Portfolio Scope: <b>{stateInfo.regionText}</b> ({filteredSites.length} of {sites.length} Towers Shown)
              </span>
            </p>
          </div>

          {/* Quick Metrics Badges & Marker Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Total Plotted:</span>
              <span className="font-extrabold text-white font-mono">{filteredSites.length}</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-400">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="font-bold">Operational:</span>
              <span className="font-mono font-extrabold text-white">{operationalCount}</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-amber-300">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></span>
              <span className="font-bold">Open Incident Notes:</span>
              <span className="font-mono font-extrabold text-white">{openNotesCount}</span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400">
              <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
              <span className="font-bold">Outages:</span>
              <span className="font-mono font-extrabold text-white">{outageCount}</span>
            </div>

            {/* 4G LTE KML RF Sector Layer Toggle */}
            <button
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
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all shadow-md cursor-pointer ${
                showRfSectors
                  ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border-cyan-400/60 shadow-cyan-500/20 ring-1 ring-cyan-400/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Click to toggle 4G LTE RF Sector Coverage Polygons on Map"
            >
              <Radio className={`w-3.5 h-3.5 ${showRfSectors ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
              <span>4G LTE RF Sectors:</span>
              <span className="font-mono font-extrabold text-white">
                {kmlStats?.total_sectors ? `${(kmlStats.total_sectors / 1000).toFixed(1)}k` : '40.9k'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                showRfSectors ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {showRfSectors ? 'ACTIVE' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* Filter & Search Bar Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          
          {/* Search Box with Autocomplete Dropdown */}
          <div className="sm:col-span-5 relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Search Site ID (e.g. FC0001), Name, Address, FSE..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                className="w-full pl-9 pr-8 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all shadow-inner"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setShowSearchResults(false);
                  }}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-white rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Live Autocomplete Results Dropdown */}
            {showSearchResults && searchTerm.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-50 max-h-60 overflow-y-auto glass-panel border border-slate-700 rounded-xl shadow-2xl space-y-1 p-1 bg-slate-950/95">
                {filteredSites.slice(0, 8).map((site) => {
                  const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
                  const siteNotes = getSiteOpenNotes(site);
                  const hasOpenNote = siteNotes.length > 0;

                  return (
                    <div
                      key={site.id}
                      onClick={() => handleFocusSite(site)}
                      className="p-2 rounded-lg hover:bg-cyan-950/60 border border-transparent hover:border-cyan-800/50 cursor-pointer flex items-center justify-between text-xs transition-all"
                    >
                      <div className="flex items-center space-x-2">
                        <Radio className={`w-3.5 h-3.5 ${
                          isDown ? 'text-red-400' : hasOpenNote ? 'text-amber-400' : 'text-emerald-400'
                        }`} />
                        <div>
                          <div className="font-extrabold text-cyan-300 font-mono flex items-center gap-1.5">
                            {site.ihs_site_id}
                            {hasOpenNote && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Open Note
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 line-clamp-1">{site.raw_data?.['Site Name'] || site.cluster_name}</div>
                        </div>
                      </div>

                      <div className="text-right text-[10px]">
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

                {filteredSites.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-500">No sites matching "{searchTerm}"</div>
                )}
              </div>
            )}
          </div>

          {/* LGA Filter Dropdown */}
          <div className="sm:col-span-3 relative">
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5">
              <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block leading-none">Filter by LGA</span>
                <select
                  value={selectedLga}
                  onChange={(e) => setSelectedLga(e.target.value)}
                  className="w-full bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer py-0.5"
                >
                  <option value="All" className="bg-slate-900 text-white">All FCT LGAs</option>
                  {lgaOptions.map((lga) => (
                    <option key={lga} value={lga} className="bg-slate-900 text-white">
                      {lga}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Operational & Incident Status Filter Dropdown */}
          <div className="sm:col-span-3 relative">
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5">
              <Filter className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 block leading-none">Operational Status</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer py-0.5"
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
          <div className="sm:col-span-1 flex justify-end">
            <button
              onClick={handleResetFilters}
              title="Reset search & filters"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl transition-all shadow cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* 📡 4G LTE RF SECTOR LIVE CONTROL STRIP (When 4G Layer is ACTIVE) */}
        {showRfSectors && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-950/90 border border-cyan-500/40 text-xs shadow-inner animate-in fade-in duration-200">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 font-black text-cyan-300 font-mono text-xs">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                <span>4G LTE RF Sectors:</span>
                <b className="text-white bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                  {renderedSectors.length.toLocaleString()} Wedges Plotted
                </b>
              </span>

              {loadingMapSectors && (
                <span className="text-[11px] text-cyan-400 font-medium flex items-center gap-1.5 bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-500/20">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  Streaming sectors in viewport...
                </span>
              )}
            </div>

            {/* Live PCI / Sector Inspector Search */}
            <div className="relative min-w-[280px]">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Find Sector by PCI (e.g. 96), Cell Name, TAC..."
                value={sectorSearchQuery}
                onChange={(e) => {
                  setSectorSearchQuery(e.target.value);
                  setShowSectorDropdown(true);
                }}
                onFocus={() => setShowSectorDropdown(true)}
                className="w-full pl-8 pr-7 py-2 bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 rounded-xl focus:outline-none focus:border-cyan-400 font-mono shadow-inner"
              />
              {sectorSearchQuery && (
                <button
                  onClick={() => {
                    setSectorSearchQuery('');
                    setSectorSearchResults([]);
                    setShowSectorDropdown(false);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Sector Search Dropdown Menu */}
              {showSectorDropdown && sectorSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-50 max-h-60 overflow-y-auto bg-slate-950 border border-cyan-500/50 rounded-xl shadow-2xl p-1.5 space-y-1">
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
                      className="p-2 rounded-lg hover:bg-cyan-950/80 border border-transparent hover:border-cyan-500/40 cursor-pointer flex items-center justify-between text-xs transition-all"
                    >
                      <div>
                        <span className="font-black text-cyan-300 font-mono">{sec.cell_name}</span>
                        <span className="text-[10px] text-slate-400 ml-2 font-mono">Site: {sec.site_id}</span>
                      </div>
                      <div className="text-[10px] flex items-center gap-2">
                        <span className="text-amber-300 font-mono font-bold bg-amber-950/50 px-1.5 py-0.2 rounded border border-amber-500/30">PCI: {sec.pci}</span>
                        <span className="text-emerald-400 font-mono">Azimuth: {sec.azimuth}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Antenna Radiation Beam Color Legend */}
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-300 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">Beams:</span>
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-500"></span> Alpha (0°-120°)
              </span>
              <span className="flex items-center gap-1.5 text-purple-300">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-sm shadow-purple-500"></span> Beta (120°-240°)
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-500"></span> Gamma (240°-360°)
              </span>
            </div>
          </div>
        )}

      </div>

      {/* Map Workspace Container */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 h-[650px] relative z-0 shadow-2xl">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
            <Radio className="w-8 h-8 text-cyan-400 animate-spin" />
            <span className="text-xs font-semibold">Plotting live telecom tower coordinates & active incident notes...</span>
          </div>
        ) : (
          <MapContainer center={defaultCenter} zoom={11} scrollWheelZoom={true} className="h-full w-full">
            
            {/* Map Controller for Smooth Flying */}
            <MapController targetCoords={mapTargetCoords} zoomLevel={mapZoom} />

            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredSites.map((site) => {
              const { lat, lng } = getSiteCoordinates(site);
              const isDown = site.is_down || site.operational_status?.toLowerCase().includes('down');
              const siteOpenNotes = getSiteOpenNotes(site);
              const hasOpenNotes = siteOpenNotes.length > 0;
              const hasCriticalOpenNote = siteOpenNotes.some(n => (n.priority || '').toLowerCase() === 'critical');

              const isFocused = site.ihs_site_id === activeFocusedSiteId;
              
              // Marker Color Logic
              let iconToUse = greenTowerIcon;
              if (isFocused) {
                iconToUse = blueTowerIcon;
              } else if (isDown || hasCriticalOpenNote) {
                iconToUse = redTowerIcon;
              } else if (hasOpenNotes) {
                iconToUse = amberTowerIcon;
              }

              const raw = site.raw_data || {};
              const tech = raw['Tech'] || '2G/3G/4G';
              const towerCo = raw['Tower Co'] || raw['OEM'] || 'IHS Tower';
              const lgaName = getSiteLga(site);

              return (
                <Marker
                  key={site.id}
                  position={[lat, lng]}
                  icon={iconToUse}
                  eventHandlers={{
                    click: () => {
                      setActiveFocusedSiteId(site.ihs_site_id);
                    }
                  }}
                >
                  {/* On Mouse Hover Details Tooltip */}
                  <Tooltip
                    direction="top"
                    offset={[0, -36]}
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

                      {/* Interactive Action Buttons */}
                      <div className="flex flex-col gap-1.5 pt-1">
                        <button
                          onClick={() => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')}
                          className="w-full py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1.5 shadow"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open in Satellite Map (Google Maps)</span>
                        </button>

                        <button
                          onClick={() => onSelectSite(site.ihs_site_id)}
                          className="w-full py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg text-[11px] flex items-center justify-center space-x-1 shadow"
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
            <MapViewportSectorLoader showRfSectors={showRfSectors} onBoundsChange={handleBoundsChange} />

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
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-cyan-100 text-cyan-800 border border-cyan-300">
                          4G LTE Carrier
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">SITE ID</span>
                          <b className="font-mono text-cyan-800 text-xs">{sec.site_id}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">PHYSICAL CELL ID (PCI)</span>
                          <b className="font-mono text-amber-700 text-xs">{sec.pci ?? 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">ANTENNA AZIMUTH</span>
                          <b className="font-mono text-emerald-700 text-xs">{sec.azimuth != null ? `${sec.azimuth}°` : 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">TRACKING AREA (TAC)</span>
                          <b className="font-mono text-slate-700 text-xs">{sec.tac ?? 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">CELL ID</span>
                          <b className="font-mono text-slate-700">{sec.cell_id ?? 'N/A'}</b>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px] font-bold">REGION</span>
                          <b className="text-slate-700 truncate">{sec.region || 'Abuja'}</b>
                        </div>
                      </div>

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
                      <div className="font-bold text-cyan-300 font-mono flex items-center gap-1">
                        <Radio className="w-3 h-3 text-cyan-400" />
                        <span>{sec.cell_name} (PCI: {sec.pci})</span>
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Azimuth: <b className="text-emerald-400 font-mono">{sec.azimuth}°</b> • TAC: {sec.tac} • CellID: {sec.cell_id}
                      </div>
                    </div>
                  </Tooltip>
                </Polygon>
              );
            })}
          </MapContainer>
        )}
      </div>

    </div>
  );
}
