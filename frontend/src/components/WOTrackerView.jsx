import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, CheckSquare, Navigation, Compass, Radio, Search, Filter, Calendar, 
  CheckCircle2, Clock, ShieldAlert, Award, ArrowRight, RefreshCw, X, ChevronRight,
  FileText, Sparkles, Building2, User, Phone, Check, AlertTriangle, Layers, Plus, Wrench
} from 'lucide-react';
import { fetchSites, createNote, fetchNotes } from '../api';
import { getSDMStateInfo } from '../utils/userUtils';

// Haversine distance calculator in KM
function haversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Custom Leaflet SVG Markers
const createMarkerIcon = (fillColor, strokeColor = '#ffffff', isPulsing = false) => {
  const pulseClass = isPulsing ? 'animate-ping opacity-75' : '';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="30" height="42">
      <filter id="shadow-${fillColor.replace('#', '')}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.6"/>
      </filter>
      <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 36 12 36 C12 36 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.8" filter="url(#shadow-${fillColor.replace('#', '')})"/>
      <circle cx="12" cy="12" r="5.5" fill="#ffffff"/>
      <circle cx="12" cy="12" r="3.5" fill="${fillColor}"/>
    </svg>
  `;
  return L.divIcon({
    className: 'wo-telecom-marker',
    html: svg,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -38]
  });
};

// Pulsing User Location GPS Marker Icon
const userGpsIcon = L.divIcon({
  className: 'user-gps-marker',
  html: `
    <div className="relative flex items-center justify-center w-8 h-8">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-5 w-5 bg-cyan-500 border-2 border-white shadow-lg"></span>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

// Custom Leaflet SVG Marker Icon with glowing WO Tag Badge
const createWoTagIcon = (fillColor = '#a855f7', strokeColor = '#ffffff', tagText = 'WO') => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 44" width="36" height="52">
      <filter id="shadow-wo-${fillColor.replace('#', '')}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.8"/>
      </filter>
      <path d="M14 8 C7.37 8 2 13.37 2 20 C2 29 14 44 14 44 C14 44 26 29 26 20 C26 13.37 20.63 8 14 8 Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" filter="url(#shadow-wo-${fillColor.replace('#', '')})"/>
      <circle cx="14" cy="20" r="6" fill="#ffffff"/>
      <circle cx="14" cy="20" r="3.8" fill="${fillColor}"/>
      
      <!-- WO Badge Tag -->
      <g transform="translate(14, 5)">
        <rect x="-12" y="-5" width="24" height="11" rx="3.5" fill="#ec4899" stroke="#ffffff" stroke-width="1.2"/>
        <text x="0" y="2.5" font-family="Segoe UI, sans-serif" font-size="7.5" font-weight="900" fill="#ffffff" text-anchor="middle">${tagText}</text>
      </g>
    </svg>
  `;
  return L.divIcon({
    className: 'wo-tag-telecom-marker',
    html: svg,
    iconSize: [36, 52],
    iconAnchor: [18, 52],
    popupAnchor: [0, -48]
  });
};

const defaultUnvisitedIcon = createMarkerIcon('#0284c7'); // Cyan/Blue
const completedIcon = createMarkerIcon('#10b981'); // Emerald Green
const activeIcon = createMarkerIcon('#f59e0b', '#ffffff', true); // Amber
const woIcon = createMarkerIcon('#a855f7', '#ffffff', true); // Purple for Created WOs
const woTagIcon = createWoTagIcon('#a855f7', '#ffffff', 'WO');
const woCriticalTagIcon = createWoTagIcon('#ef4444', '#ffffff', 'WO!');

// Map Pan Controller Helper
function MapController({ targetCoords, zoomLevel }) {
  const map = useMap();
  useEffect(() => {
    if (targetCoords && targetCoords[0] && targetCoords[1]) {
      map.flyTo(targetCoords, zoomLevel || 13, { duration: 1.2 });
    }
  }, [targetCoords, zoomLevel, map]);
  return null;
}

export default function WOTrackerView({ currentUser, onSelectSite }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLgaFilter, setSelectedLgaFilter] = useState('All');

  // User Live GPS Coordinates
  const [userGps, setUserGps] = useState(null); // { lat, lng, accuracy }
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Storage Keys
  const VISITS_STORAGE_KEY = 'sdm_wo_tracker_visits_v1';
  const WO_STORAGE_KEY = 'fct_created_work_orders_v2';

  const defaultConfirmedVisits = [
    {
      site_id: 'FC0004',
      wo_number: 'WO-20260807-0004',
      visit_date: '2026-08-07',
      completed_at: '2026-08-07T14:00:00.000Z',
      notes: 'SDM Routine Field Inspection completed.',
      category: 'Routine Inspection',
      lga: 'FCT',
      cluster: 'Central Area',
      fse_name: 'SMC FSE'
    },
    {
      site_id: 'FC2823',
      wo_number: 'WO-20260807-2823',
      visit_date: '2026-08-07',
      completed_at: '2026-08-07T15:30:00.000Z',
      notes: 'SDM Routine Field Inspection completed.',
      category: 'Routine Inspection',
      lga: 'FCT',
      cluster: 'Central Area',
      fse_name: 'SMC FSE'
    },
    {
      site_id: 'FC2688',
      wo_number: 'WO-20260807-2688',
      visit_date: '2026-08-07',
      completed_at: '2026-08-07T17:00:00.000Z',
      notes: 'SDM Routine Field Inspection completed.',
      category: 'Routine Inspection',
      lga: 'FCT',
      cluster: 'Central Area',
      fse_name: 'SMC FSE'
    }
  ];

  // Site Visits History - initialized with confirmed 3 visited sites FC0004, FC2823, FC2688
  const [completedVisits, setCompletedVisits] = useState(() => {
    try {
      const saved = localStorage.getItem(VISITS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const confirmedVisitedSites = ['FC0004', 'FC2823', 'FC2688'];
        const filtered = parsed.filter(v => 
          confirmedVisitedSites.includes(v.site_id) || 
          (v.wo_number && String(v.wo_number).startsWith('WO-')) || 
          (v.notes && String(v.notes).includes('SDM Field Inspection'))
        );
        
        const siteIds = new Set(filtered.map(v => v.site_id));
        defaultConfirmedVisits.forEach(defV => {
          if (!siteIds.has(defV.site_id)) {
            filtered.push(defV);
          }
        });
        localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(filtered));
        return filtered;
      }
      localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(defaultConfirmedVisits));
      return defaultConfirmedVisits;
    } catch (e) {
      return defaultConfirmedVisits;
    }
  });

  // Created Work Orders State
  const [createdWorkOrders, setCreatedWorkOrders] = useState(() => {
    try {
      const saved = localStorage.getItem(WO_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [activeSite, setActiveSite] = useState(null);
  const [activeWO, setActiveWO] = useState(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Routine Inspection');
  const [fseConfirmed, setFseConfirmed] = useState(true);

  // Create WO Modal & Form State
  const [createWoModalOpen, setCreateWoModalOpen] = useState(false);
  const [woSiteSearch, setWoSiteSearch] = useState('');
  const [selectedWoSite, setSelectedWoSite] = useState(null);
  const [woTitle, setWoTitle] = useState('');
  const [woCategory, setWoCategory] = useState('Power & Energy');
  const [woPriority, setWoPriority] = useState('High');
  const [woFseName, setWoFseName] = useState('');
  const [woScope, setWoScope] = useState('');
  const [woTargetDate, setWoTargetDate] = useState(new Date().toISOString().slice(0, 10));

  const [mapCenter, setMapCenter] = useState([9.0765, 7.3986]); // Default FCT Abuja Coordinates
  const [mapZoom, setMapZoom] = useState(11);

  const mapSectionRef = useRef(null);
  const [locatedSiteId, setLocatedSiteId] = useState(null);
  const [siteNotesMap, setSiteNotesMap] = useState({});

  // Save Visits to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(completedVisits));
    } catch (e) {
      console.error('Failed to save completed visits:', e);
    }
  }, [completedVisits]);

  // Save Created WOs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(WO_STORAGE_KEY, JSON.stringify(createdWorkOrders));
    } catch (e) {
      console.error('Failed to save created work orders:', e);
    }
  }, [createdWorkOrders]);

  const stateInfo = getSDMStateInfo(currentUser);

  // Load Sites Data from Database for user scope
  useEffect(() => {
    const loadFctSites = async () => {
      setLoading(true);
      try {
        const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer';
        const isSdm = !currentUser?.is_superuser && !isFse;

        const sdmParam = isSdm ? (currentUser?.full_name || currentUser?.username) : undefined;
        const fseParam = isFse ? (currentUser?.full_name || currentUser?.username) : undefined;

        const res = await fetchSites({
          sdm: sdmParam,
          fse: fseParam,
          is_superuser: currentUser?.is_superuser ? 'true' : 'false',
          user_state: stateInfo?.code,
          page_size: 25000,
          limit: 25000
        });
        const allSites = Array.isArray(res) ? res : (res.results || []);
        const validSites = allSites.filter(s => s.latitude && s.longitude);
        setSites(validSites.length > 0 ? validSites : allSites);

        const firstValidSite = validSites[0] || allSites[0];
        if (firstValidSite && firstValidSite.latitude && firstValidSite.longitude) {
          setMapCenter([parseFloat(firstValidSite.latitude), parseFloat(firstValidSite.longitude)]);
        }
      } catch (err) {
        console.error('Error loading sites for WO Tracker:', err);
      } finally {
        setLoading(false);
      }
    };

    const loadSiteNotesMap = async () => {
      try {
        const notes = await fetchNotes({ page_size: 5000 });
        const notesList = Array.isArray(notes) ? notes : (notes.results || []);
        const nMap = {};
        const backendVisits = [];
        const backendWOs = [];

        notesList.forEach(n => {
          const sid = n.site_ihs_id || n.ihs_site_id || (n.site && typeof n.site === 'object' ? n.site.ihs_site_id : null);
          if (sid) {
            if (!nMap[sid]) nMap[sid] = [];
            nMap[sid].push(n);

            // Sync Completed Visits ONLY for explicit Work Order field visits or confirmed visited sites
            const confirmedVisitedSites = ['FC0004', 'FC2823', 'FC2688'];
            const isExplicitWoVisit = (n.title && (n.title.includes('WO Visit Completed') || n.title.includes('WO-'))) ||
                                      (n.description && n.description.includes('SDM Field Inspection Completed'));

            if (isExplicitWoVisit || confirmedVisitedSites.includes(sid)) {
              let visitDateStr = '2026-08-07';
              if (n.resolved_at) {
                visitDateStr = new Date(n.resolved_at).toISOString().slice(0, 10);
              } else if (n.created_at) {
                visitDateStr = new Date(n.created_at).toISOString().slice(0, 10);
              }

              backendVisits.push({
                site_id: sid,
                wo_number: n.title?.match(/\[(WO-[^\]]+)\]/)?.[1] || null,
                visit_date: visitDateStr,
                completed_at: n.resolved_at || n.created_at,
                notes: n.description || n.title,
                category: n.category || 'Routine Inspection',
                lga: (n.site && n.site.lga) || 'FCT',
                cluster: (n.site && n.site.cluster_name) || 'FCT',
                fse_name: n.smc_fse_name || 'SMC FSE'
              });
            }

            // Sync Work Orders from backend database notes
            if (
              (n.title && (n.title.includes('WO Created') || n.title.includes('[WO-'))) ||
              (n.description && n.description.includes('Work Order Created'))
            ) {
              const woNum = n.title?.match(/\[(WO-[^\]]+)\]/)?.[1] || `WO-${n.id}`;
              const isCompleted = n.status === 'Resolved';
              const cleanTitle = (n.title || '')
                .replace(/^WO Created \[[^\]]+\]:\s*/i, '')
                .replace(/^\[WO-[^\]]+\]:\s*/i, '')
                .trim();

              backendWOs.push({
                id: `backend-${n.id}`,
                wo_number: woNum,
                site_id: sid,
                site_obj: n.site && typeof n.site === 'object' ? n.site : null,
                title: cleanTitle || n.title || 'Work Order',
                category: n.category || 'Power & Energy',
                priority: n.priority || 'High',
                fse_name: n.smc_fse_name || 'Assigned FSE',
                scope: n.description,
                target_date: n.created_at ? new Date(n.created_at).toISOString().slice(0, 10) : todayStr,
                status: isCompleted ? 'COMPLETED' : (n.status === 'In Progress' ? 'IN_PROGRESS' : 'PENDING'),
                created_at: n.created_at,
                completed_at: isCompleted ? (n.resolved_at || n.updated_at || n.created_at) : null,
                created_by: n.created_by || 'State Delivery Manager'
              });
            }
          }
        });

        setSiteNotesMap(nMap);

        // Merge backend loaded visits into state and localStorage
        setCompletedVisits(prev => {
          const existingKeys = new Set(prev.map(v => `${v.site_id}_${v.visit_date}`));
          const newVisits = backendVisits.filter(v => !existingKeys.has(`${v.site_id}_${v.visit_date}`));
          const merged = [...prev, ...newVisits];
          try {
            localStorage.setItem(VISITS_STORAGE_KEY, JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });

        // Merge backend loaded Work Orders into state and localStorage
        setCreatedWorkOrders(prev => {
          const existingWOKeys = new Set(prev.map(w => w.wo_number));
          const newWOs = backendWOs.filter(w => !existingWOKeys.has(w.wo_number));
          const updated = prev.map(localWo => {
            const matchBackend = backendWOs.find(b => b.wo_number === localWo.wo_number);
            if (matchBackend && matchBackend.status === 'COMPLETED') {
              return { ...localWo, status: 'COMPLETED', completed_at: matchBackend.completed_at };
            }
            return localWo;
          });
          const merged = [...updated, ...newWOs];
          try {
            localStorage.setItem(WO_STORAGE_KEY, JSON.stringify(merged));
          } catch (e) {}
          return merged;
        });

      } catch (e) {
        console.error('Error fetching site notes for WO map tags:', e);
      }
    };

    loadFctSites();
    loadSiteNotesMap();
  }, []);

  // Handle "Locate Site" on Map with Smooth FlyTo & Auto-Popup
  const handleLocateSiteOnMap = (targetSite) => {
    if (!targetSite) return;
    const sid = targetSite.ihs_site_id || targetSite.site_id;
    const resolvedSite = sites.find(s => s.ihs_site_id === sid) || targetSite;

    const lat = resolvedSite.latitude || (resolvedSite.site_obj && resolvedSite.site_obj.latitude);
    const lng = resolvedSite.longitude || (resolvedSite.site_obj && resolvedSite.site_obj.longitude);

    if (lat && lng) {
      setMapCenter([lat, lng]);
      setMapZoom(16);
      setLocatedSiteId(sid);

      if (mapSectionRef.current) {
        mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      alert(`No GPS coordinates recorded in database for site ${sid}.`);
    }
  };

  // Live GPS Location Handler
  const handleAcquireGps = () => {
    setGpsLoading(true);
    setGpsError('');

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        };
        setUserGps(coords);
        setMapCenter([coords.lat, coords.lng]);
        setMapZoom(14);
        setGpsLoading(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setGpsError(`Unable to retrieve location (${err.message}). Defaulting to Abuja FCT Center.`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  // Today's Date String Format
  const todayStr = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  // Today's Completed Visits Count (Daily Limit: 3)
  const visitsToday = useMemo(() => {
    return completedVisits.filter(v => v.visit_date === todayStr);
  }, [completedVisits, todayStr]);

  const visitsTodayCount = visitsToday.length;
  const isDailyLimitReached = visitsTodayCount >= 3;

  // Set of Completed Site IDs
  const completedSiteIds = useMemo(() => {
    return new Set(completedVisits.map(v => v.site_id));
  }, [completedVisits]);

  // Filtered Unvisited FCT Sites List
  const filteredSites = useMemo(() => {
    return sites.filter(s => {
      const matchSearch = !searchQuery || 
        s.ihs_site_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.lga && s.lga.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.cluster_name && s.cluster_name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchLga = selectedLgaFilter === 'All' || s.lga === selectedLgaFilter;
      return matchSearch && matchLga;
    });
  }, [sites, searchQuery, selectedLgaFilter]);

  // Unique LGAs list for filter dropdown
  const uniqueLgas = useMemo(() => {
    const setL = new Set(sites.map(s => s.lga).filter(Boolean));
    return Array.from(setL).sort();
  }, [sites]);

  // Sites matching Create WO search
  const woSearchMatchingSites = useMemo(() => {
    if (!woSiteSearch.trim()) return [];
    const q = woSiteSearch.trim().toLowerCase();
    return sites.filter(s => 
      s.ihs_site_id.toLowerCase().includes(q) ||
      (s.cluster_name && s.cluster_name.toLowerCase().includes(q)) ||
      (s.lga && s.lga.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [sites, woSiteSearch]);

  // Calculate Nearest Sites from User's Live GPS
  const nearestSitesFromGps = useMemo(() => {
    if (!userGps || sites.length === 0) return [];
    return sites
      .filter(s => !completedSiteIds.has(s.ihs_site_id))
      .map(s => {
        const dist = haversineKm(userGps.lat, userGps.lng, s.latitude, s.longitude);
        return { ...s, distKm: dist };
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 5);
  }, [userGps, sites, completedSiteIds]);

  // Calculate Smart Neighboring Sites from Last Completed or Active Site
  const smartSuggestedNextSites = useMemo(() => {
    const referenceSite = activeSite || (completedVisits.length > 0 ? sites.find(s => s.ihs_site_id === completedVisits[0].site_id) : null);
    if (!referenceSite || !referenceSite.latitude) return [];

    return sites
      .filter(s => !completedSiteIds.has(s.ihs_site_id) && s.ihs_site_id !== referenceSite.ihs_site_id)
      .map(s => {
        const dist = haversineKm(referenceSite.latitude, referenceSite.longitude, s.latitude, s.longitude);
        return { ...s, distKm: dist };
      })
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 5);
  }, [activeSite, completedVisits, sites, completedSiteIds]);

  // Handle Create Work Order Form Submission
  const handleCreateWorkOrderSubmit = async (e) => {
    e.preventDefault();
    
    let targetSiteObj = selectedWoSite;
    if (!targetSiteObj && woSiteSearch.trim()) {
      const q = woSiteSearch.trim().toLowerCase();
      targetSiteObj = sites.find(s => s.ihs_site_id.toLowerCase() === q) ||
                      sites.find(s => s.ihs_site_id.toLowerCase().includes(q)) ||
                      sites.find(s => (s.mtn_id && s.mtn_id.toLowerCase() === q));
    }

    if (!targetSiteObj) {
      if (woSiteSearch.trim()) {
        const cleanId = woSiteSearch.trim().toUpperCase();
        targetSiteObj = {
          id: cleanId,
          ihs_site_id: cleanId,
          lga: 'FCT',
          cluster_name: 'FCT Territory',
          smc_fse_name: woFseName || 'Assigned FSE',
          latitude: 9.0765,
          longitude: 7.3986
        };
      } else {
        alert("Please enter or select a Target Cell Site ID (e.g., FC2437).");
        return;
      }
    }

    if (!woTitle.trim()) {
      alert("Please enter a Work Order Title / Intervention Description.");
      return;
    }

    const dateTag = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const randomTag = Math.floor(1000 + Math.random() * 9000);
    const woNumber = `WO-${dateTag}-${randomTag}`;

    const newWO = {
      id: Date.now().toString(),
      wo_number: woNumber,
      site_id: targetSiteObj.ihs_site_id,
      site_obj: targetSiteObj,
      title: woTitle.trim(),
      category: woCategory,
      priority: woPriority,
      fse_name: woFseName || targetSiteObj.smc_fse_name || 'Assigned FSE',
      scope: woScope || 'Field site inspection and corrective intervention.',
      target_date: woTargetDate,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      created_by: currentUser?.full_name || currentUser?.username || 'State Delivery Manager'
    };

    setCreatedWorkOrders(prev => [newWO, ...prev]);

    // Create a note in backend as well
    try {
      if (targetSiteObj.id && typeof targetSiteObj.id === 'number') {
        await createNote({
          site: targetSiteObj.id,
          ihs_site_id: targetSiteObj.ihs_site_id,
          category: woCategory.includes('Power') ? 'Power' : woCategory.includes('Fiber') ? 'Fiber' : 'General',
          priority: woPriority,
          status: 'Open',
          title: `WO Created [${woNumber}]: ${woTitle}`,
          description: `Work Order Created: ${newWO.wo_number}\nTitle: ${newWO.title}\nCategory: ${newWO.category}\nPriority: ${newWO.priority}\nAssigned FSE: ${newWO.fse_name}\nTarget Date: ${newWO.target_date}\nScope: ${newWO.scope}`,
          created_by: newWO.created_by
        });
      }
    } catch (err) {
      console.error('Failed to create backend note for WO:', err);
    }

    // Reset Form & Close Modal
    setCreateWoModalOpen(false);
    setSelectedWoSite(null);
    setWoTitle('');
    setWoScope('');
    setWoSiteSearch('');
    setWoFseName('');

    // Pan map to site
    if (targetSiteObj.latitude && targetSiteObj.longitude) {
      setMapCenter([targetSiteObj.latitude, targetSiteObj.longitude]);
      setMapZoom(14);
    }
  };

  // Schedule a Visit for a Site / WO
  const handleScheduleVisit = (site, wo = null) => {
    if (isDailyLimitReached) {
      alert("⚠️ Daily visit quota reached! You have completed 3 visits today. You can still queue visits for tomorrow.");
    }
    setActiveSite(site);
    setActiveWO(wo);
    if (site.latitude && site.longitude) {
      setMapCenter([site.latitude, site.longitude]);
      setMapZoom(15);
    }
  };

  // Complete Active Visit / WO Handler
  const handleCompleteVisitSubmit = async () => {
    if (!activeSite) return;

    const newVisitRecord = {
      site_id: activeSite.ihs_site_id,
      wo_number: activeWO ? activeWO.wo_number : null,
      visit_date: todayStr,
      completed_at: new Date().toISOString(),
      notes: completionNotes || 'Routine SDM field inspection completed successfully.',
      category: activeWO ? activeWO.category : categoryFilter,
      lga: activeSite.lga || 'FCT',
      cluster: activeSite.cluster_name || 'FCT',
      fse_name: activeSite.smc_fse_name || 'SMC FSE'
    };

    // Save to completed visits state
    setCompletedVisits(prev => [newVisitRecord, ...prev]);

    // If completing an active WO, update WO status
    if (activeWO) {
      setCreatedWorkOrders(prev => prev.map(wo => 
        wo.id === activeWO.id ? { ...wo, status: 'COMPLETED', completed_at: new Date().toISOString() } : wo
      ));
    }

    // Create an SDM Site Note in backend as well
    try {
      await createNote({
        site: activeSite.id,
        ihs_site_id: activeSite.ihs_site_id,
        category: categoryFilter,
        priority: 'Normal',
        status: 'Resolved',
        title: `WO Visit Completed: ${activeSite.ihs_site_id} ${activeWO ? `[${activeWO.wo_number}]` : ''}`,
        description: `SDM Field Inspection Completed.\nCategory: ${categoryFilter}\nInspection Findings: ${completionNotes || 'Site inspected cleanly.'}\nFSE Confirmed: ${fseConfirmed ? 'Yes' : 'No'}`,
        created_by: currentUser?.full_name || currentUser?.username || 'State Delivery Manager'
      });
    } catch (e) {
      console.error('Note creation failed during WO visit complete:', e);
    }

    setCompleteModalOpen(false);
    setCompletionNotes('');
    setActiveSite(null);
    setActiveWO(null);
  };

  return (
    <div className="space-y-6 pb-12 text-slate-100">
      
      {/* 🏆 TOP HERO HEADER & DAILY INSPECTION QUOTA BANNER */}
      <div className="glass-panel p-6 rounded-3xl border border-cyan-500/40 bg-gradient-to-r from-slate-900/90 via-slate-900/80 to-cyan-950/40 shadow-2xl relative overflow-hidden space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3.5">
            <div className="p-3.5 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/20 text-white shrink-0">
              <CheckSquare className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-3 py-0.5 font-mono font-black text-xs text-cyan-300 bg-cyan-950/70 rounded-md border border-cyan-500/30">
                  {stateInfo.regionText}
                </span>
                <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded border border-purple-500/30">
                  Max 3 Sites / Day Goal
                </span>
              </div>
              <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                Work Order & Field Inspection Tracker (WO Tracker)
              </h1>
              <p className="text-xs text-slate-300">
                Create & fill field work orders, inspect cell sites with live GPS location & smart neighboring site recommendations.
              </p>
            </div>
          </div>

          {/* Action Buttons: Create WO + GPS Live Locator */}
          <div className="flex flex-wrap items-center gap-2.5 self-stretch lg:self-auto">
            <button
              onClick={() => setCreateWoModalOpen(true)}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl font-extrabold text-xs shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 flex-1 sm:flex-initial justify-center"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Create Work Order (WO)</span>
            </button>

            <button
              onClick={handleAcquireGps}
              disabled={gpsLoading}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-2xl font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 flex-1 sm:flex-initial justify-center"
            >
              <Navigation className={`w-4 h-4 ${gpsLoading ? 'animate-spin' : 'animate-bounce'}`} />
              <span>{gpsLoading ? 'Acquiring GPS...' : userGps ? '📍 Update My Live GPS' : '📍 Locate My Live GPS'}</span>
            </button>
          </div>
        </div>

        {/* 📊 DAILY VISIT QUOTA SCORECARD (MAX 3 SITES PER DAY) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          
          {/* Today's Quota Badge */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isDailyLimitReached 
              ? 'bg-emerald-950/30 border-emerald-500/50' 
              : 'bg-slate-950/80 border-slate-800'
          }`}>
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase text-slate-400">
              <span>Today's Inspection Quota</span>
              <Calendar className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-white flex items-baseline gap-1">
              <span className={visitsTodayCount >= 3 ? 'text-emerald-400' : 'text-cyan-300'}>
                {visitsTodayCount}
              </span>
              <span className="text-slate-500 text-sm">/ 3 Sites Max</span>
            </div>

            {/* Quota Progress Bar */}
            <div className="w-full bg-slate-900 rounded-full h-2 mt-2 overflow-hidden border border-slate-800">
              <div 
                style={{ width: `${Math.min(100, (visitsTodayCount / 3) * 100)}%` }}
                className={`h-full transition-all ${
                  isDailyLimitReached ? 'bg-emerald-500' : 'bg-cyan-500'
                }`}
              />
            </div>
          </div>

          {/* Created Work Orders Count */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase text-slate-400">
              <span>Created Work Orders</span>
              <Wrench className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-purple-300">
              {createdWorkOrders.length} <span className="text-slate-500 text-xs font-normal">Active WOs</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              {createdWorkOrders.filter(w => w.status === 'COMPLETED').length} Completed • {createdWorkOrders.filter(w => w.status !== 'COMPLETED').length} Pending
            </span>
          </div>

          {/* All-Time FCT Coverage */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase text-slate-400">
              <span>FCT Territory Coverage</span>
              <Award className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-emerald-300">
              {completedSiteIds.size} <span className="text-slate-500 text-xs font-normal">/ {sites.length} Sites</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              {Math.round((completedSiteIds.size / (sites.length || 1)) * 100)}% Total FCT Monitored Coverage
            </span>
          </div>

          {/* User Live GPS Status */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-extrabold uppercase text-slate-400">
              <span>Live GPS Geolocation</span>
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-sm font-bold font-mono mt-1 text-slate-200 truncate">
              {userGps ? `${userGps.lat.toFixed(4)}, ${userGps.lng.toFixed(4)}` : 'GPS Not Acquired'}
            </div>
            <span className="text-[10px] text-cyan-400 block mt-1 font-mono">
              {userGps ? `Accuracy: ±${userGps.accuracy}m` : 'Click "Locate My Live GPS" above'}
            </span>
          </div>

        </div>

        {/* Daily Goal Reached Alert Banner */}
        {isDailyLimitReached && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-2xl flex items-center gap-3 text-emerald-300 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>
              🎉 <b>Daily Goal Reached!</b> You have completed your <b>3 site visits</b> for today ({todayStr}). Outstanding site visits can be queued for tomorrow.
            </span>
          </div>
        )}
      </div>


      {/* 📝 CREATED WORK ORDERS QUEUE SECTION */}
      {createdWorkOrders.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-purple-500/40 bg-slate-900/60 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-400" />
              <span>Created Field Work Orders ({createdWorkOrders.length} WOs)</span>
            </h3>
            <button
              onClick={() => setCreateWoModalOpen(true)}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create WO</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {createdWorkOrders.map((wo) => {
              const targetSite = sites.find(s => s.ihs_site_id === wo.site_id) || wo.site_obj || {};
              const isCompleted = wo.status === 'COMPLETED';

              return (
                <div
                  key={wo.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    isCompleted 
                      ? 'border-emerald-500/40 bg-emerald-950/10' 
                      : 'border-purple-500/40 bg-purple-950/20 hover:border-purple-500'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-black text-xs text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/30">
                        {wo.wo_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase font-mono ${
                        isCompleted 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                      }`}>
                        {wo.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white mt-1 flex items-center justify-between">
                      <span className="truncate">{wo.title}</span>
                      <b className="font-mono text-cyan-300 text-xs shrink-0 ml-2">{wo.site_id}</b>
                    </h4>

                    <div className="text-[11px] text-slate-300 space-y-1 mt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Category:</span>
                        <b className="text-slate-200">{wo.category}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Assigned FSE:</span>
                        <b className="text-cyan-300">{wo.fse_name}</b>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Date:</span>
                        <b className="text-slate-200 font-mono">{wo.target_date}</b>
                      </div>
                      <p className="text-slate-400 text-[10px] mt-1 line-clamp-2 bg-slate-950/60 p-2 rounded border border-slate-800">
                        <b>Scope:</b> {wo.scope}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleLocateSiteOnMap(wo)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>Locate on Map</span>
                    </button>

                    {!isCompleted && (
                      <button
                        onClick={() => handleScheduleVisit(targetSite, wo)}
                        className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[10px] font-extrabold rounded-xl shadow transition-all flex items-center gap-1"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>Visit WO Site</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* 🌐 LIVE GEOGRAPHIC MAP & NEAREST SITES SIDEBAR */}
      <div ref={mapSectionRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MAP CONTAINER (2 Columns) */}
        <div className="lg:col-span-2 glass-panel p-4 rounded-3xl border border-slate-800 bg-slate-900/60 space-y-3 relative">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-black uppercase text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Live FCT Telecom Sites Geographic Map</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              Showing {filteredSites.length} Sites ({completedSiteIds.size} Visited)
            </span>
          </div>

          <div className="h-[460px] w-full rounded-2xl overflow-hidden border border-slate-800 relative">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%', background: '#090d16' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController targetCoords={mapCenter} zoomLevel={mapZoom} />

              {/* User Live GPS Marker */}
              {userGps && (
                <Marker position={[userGps.lat, userGps.lng]} icon={userGpsIcon}>
                  <Popup>
                    <div className="text-xs text-slate-900 font-bold p-1">
                      📍 <b>Your Live GPS Location</b><br />
                      Lat: {userGps.lat.toFixed(5)}<br />
                      Lng: {userGps.lng.toFixed(5)}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* FCT Telecom Sites Markers */}
              {filteredSites.map(site => {
                if (!site.latitude || !site.longitude) return null;
                const isCompleted = completedSiteIds.has(site.ihs_site_id);
                const isActive = activeSite?.ihs_site_id === site.ihs_site_id;
                const woInfo = createdWorkOrders.find(w => w.site_id === site.ihs_site_id && w.status !== 'COMPLETED');
                const isWoSite = !!woInfo;
                
                const markerIcon = isActive 
                  ? activeIcon 
                  : isWoSite 
                  ? (woInfo.priority === 'Critical' ? woCriticalTagIcon : woTagIcon) 
                  : isCompleted 
                  ? completedIcon 
                  : defaultUnvisitedIcon;

                const siteNotes = siteNotesMap[site.ihs_site_id] || [];

                return (
                  <Marker
                    key={site.id}
                    position={[site.latitude, site.longitude]}
                    icon={markerIcon}
                    ref={(markerRef) => {
                      if (markerRef && locatedSiteId === site.ihs_site_id) {
                        setTimeout(() => markerRef.openPopup(), 200);
                      }
                    }}
                  >
                    <Popup maxWidth={340}>
                      <div className="p-2 space-y-2 text-xs font-sans text-slate-900">
                        
                        {/* WO Tag Header Banner */}
                        {woInfo ? (
                          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-2.5 rounded-xl space-y-1 shadow-md border border-purple-500/40">
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-black text-[11px] text-purple-200 bg-purple-950 px-2 py-0.5 rounded border border-purple-400/40">
                                📌 {woInfo.wo_number}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono ${
                                woInfo.priority === 'Critical' ? 'bg-red-500 text-white animate-pulse' : 'bg-purple-500 text-white'
                              }`}>
                                {woInfo.priority || 'High'} SLA
                              </span>
                            </div>

                            <h4 className="font-black text-xs text-white mt-1 leading-snug">
                              {woInfo.title}
                            </h4>

                            <div className="flex items-center justify-between text-[10px] text-purple-200 font-mono pt-1 border-t border-purple-800/80">
                              <span>Site: <b>{site.ihs_site_id}</b></span>
                              <span>Target Date: <b>{woInfo.target_date}</b></span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between border-b pb-1">
                            <b className="font-mono text-cyan-800 text-sm">{site.ihs_site_id}</b>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${
                              isCompleted ? 'bg-emerald-600' : 'bg-cyan-600'
                            }`}>
                              {isCompleted ? 'VISITED' : 'UNVISITED'}
                            </span>
                          </div>
                        )}

                        {/* Metadata Details */}
                        <div className="bg-slate-100 p-2 rounded-xl border border-slate-200 space-y-1 text-[11px] text-slate-800">
                          <div className="flex justify-between">
                            <span className="text-slate-500">LGA / Cluster:</span>
                            <b>{site.lga || 'FCT'} • {site.cluster_name || 'N/A'}</b>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Tower Co:</span>
                            <b>{site.tower_co || 'IHS'} ({site.vendor || 'Huawei'})</b>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Assigned FSE:</span>
                            <b className="text-cyan-800">{woInfo?.fse_name || site.smc_fse_name || 'N/A'}</b>
                          </div>

                          {woInfo?.scope && (
                            <div className="pt-1 border-t border-slate-200 text-[10px] text-slate-700">
                              <b>WO Scope:</b> {woInfo.scope}
                            </div>
                          )}
                        </div>

                        {/* Recent SDM Site Notes & Field History Log */}
                        {siteNotes.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl text-[10px] space-y-1">
                            <div className="font-bold text-amber-900 flex items-center gap-1">
                              <span>📝 Active SDM Notes ({siteNotes.length})</span>
                            </div>
                            <div className="max-h-20 overflow-y-auto space-y-1 text-slate-800 font-sans">
                              {siteNotes.slice(0, 2).map((n, idx) => (
                                <div key={idx} className="border-b border-amber-200/70 pb-1">
                                  <b className="text-purple-800">[{n.category || 'General'}]</b> {n.title || n.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Map Popup Action Buttons */}
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          {!isCompleted && (
                            <button
                              onClick={() => handleScheduleVisit(site, woInfo)}
                              className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold shadow flex-1 text-center"
                            >
                              🚀 Inspect WO
                            </button>
                          )}

                          {woInfo && !isCompleted && (
                            <button
                              onClick={() => {
                                setActiveSite(site);
                                setActiveWO(woInfo);
                                setCompleteModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow flex-1 text-center"
                            >
                              ✅ Complete
                            </button>
                          )}

                          {onSelectSite && (
                            <button
                              onClick={() => onSelectSite(site.ihs_site_id)}
                              className="px-2 py-1.5 bg-slate-800 text-white rounded-lg text-[10px] font-bold"
                            >
                              Profile
                            </button>
                          )}
                        </div>

                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </div>


        {/* RIGHT SIDEBAR: NEAREST SITES FROM LIVE GPS & PROXIMITY RECOMMENDATIONS */}
        <div className="space-y-4">
          
          {/* NEAREST SITES TO YOUR LIVE GPS */}
          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/30 bg-slate-900/60 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-black uppercase text-cyan-300 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-cyan-400" />
                <span>Nearest Sites to Your GPS</span>
              </h3>
              <span className="text-[10px] font-mono text-slate-400">Proximity Ranking</span>
            </div>

            {userGps ? (
              nearestSitesFromGps.length > 0 ? (
                <div className="space-y-2">
                  {nearestSitesFromGps.map((s, idx) => (
                    <div
                      key={s.id}
                      className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="w-5 h-5 bg-cyan-950 text-cyan-400 font-mono font-bold text-[10px] rounded-full flex items-center justify-center border border-cyan-500/30">
                            #{idx + 1}
                          </span>
                          <span className="font-mono font-extrabold text-sm text-white">{s.ihs_site_id}</span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            {s.lga || 'FCT'}
                          </span>
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono mt-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span><b>{s.distKm < 1 ? `${Math.round(s.distKm * 1000)} m` : `${s.distKm.toFixed(2)} km`}</b> away</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleScheduleVisit(s)}
                        className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[10px] rounded-xl shadow transition-all shrink-0"
                      >
                        Visit Next
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-slate-400 text-xs">
                  All nearby sites in your immediate vicinity have been visited!
                </div>
              )
            ) : (
              <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  Click below to enable your browser GPS and discover the closest unvisited FCT cell sites to your live physical position!
                </p>
                <button
                  onClick={handleAcquireGps}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  📍 Locate My GPS Position
                </button>
              </div>
            )}
          </div>

          {/* SMART NEIGHBORING SITE RECOMMENDATIONS (From Active/Last Site) */}
          {smartSuggestedNextSites.length > 0 && (
            <div className="glass-panel p-5 rounded-3xl border border-purple-500/30 bg-slate-900/60 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-black uppercase text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Neighboring Sites to Visit Next</span>
                </h3>
                <span className="text-[10px] font-mono text-purple-300 font-bold">Route Optimization</span>
              </div>

              <div className="space-y-2">
                {smartSuggestedNextSites.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 hover:border-purple-500/40 transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-extrabold text-sm text-cyan-300">{s.ihs_site_id}</span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono border border-purple-500/30">
                          {s.cluster_name || 'FCT'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        📍 <b>{s.distKm.toFixed(2)} km</b> from current site
                      </div>
                    </div>

                    <button
                      onClick={() => handleScheduleVisit(s)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-purple-600 text-purple-200 hover:text-white font-bold text-[10px] rounded-xl border border-slate-700 transition-all shrink-0"
                    >
                      Queue Visit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>


      {/* 🚀 ACTIVE VISIT CARD & FULL SITE SELECTOR */}
      {activeSite && (
        <div className="glass-panel p-6 rounded-3xl border border-amber-500/50 bg-amber-950/20 space-y-4 shadow-2xl animate-in fade-in">
          <div className="flex items-start justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-2xl shrink-0">
                <Clock className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Active Site Inspection In-Progress</span>
                <h2 className="text-xl font-black text-white font-mono flex items-center gap-2 mt-0.5">
                  {activeSite.ihs_site_id}
                  {activeWO && (
                    <span className="px-2 py-0.5 bg-purple-950 text-purple-300 text-xs rounded border border-purple-500/40 font-mono">
                      {activeWO.wo_number}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveSite(null);
                setActiveWO(null);
              }}
              className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-sans">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Cluster Name</span>
              <div className="font-bold text-slate-200 mt-0.5">{activeSite.cluster_name || 'N/A'}</div>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Tower Co</span>
              <div className="font-bold text-slate-200 mt-0.5">{activeSite.tower_co || 'IHS'}</div>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">SMC FSE Assigned</span>
              <div className="font-bold text-cyan-300 mt-0.5">{activeWO?.fse_name || activeSite.smc_fse_name || 'N/A'}</div>
            </div>
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold">FSE Contact</span>
              <div className="font-bold text-slate-200 mt-0.5">{activeSite.smc_fse_phone || 'N/A'}</div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              onClick={() => setCompleteModalOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark Inspection Completed</span>
            </button>
          </div>
        </div>
      )}


      {/* 📋 UNVISITED FCT SITES DIRECTORY */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/60 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <span>FCT Telecom Sites Visit Directory</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Select any site to schedule your next field inspection • Monitored FCT Sites: <b className="text-cyan-300 font-mono">{filteredSites.length}</b>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search Site ID, LGA, Cluster..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 pl-8 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <select
              value={selectedLgaFilter}
              onChange={(e) => setSelectedLgaFilter(e.target.value)}
              className="bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All LGAs ({uniqueLgas.length})</option>
              {uniqueLgas.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
            <span className="text-xs font-bold">Loading FCT sites directory...</span>
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No FCT cell sites found matching active search criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSites.slice(0, 32).map((site) => {
              const isCompleted = completedSiteIds.has(site.ihs_site_id);
              const isActive = activeSite?.ihs_site_id === site.ihs_site_id;

              return (
                <div
                  key={site.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                    isActive 
                      ? 'border-amber-500/60 bg-amber-950/20 ring-2 ring-amber-500/40' 
                      : isCompleted 
                      ? 'border-emerald-500/40 bg-emerald-950/10' 
                      : 'border-slate-800 bg-slate-950/70 hover:border-cyan-500/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => onSelectSite && onSelectSite(site.ihs_site_id)}
                        className="font-mono font-black text-sm text-cyan-300 hover:underline flex items-center gap-1"
                      >
                        <Radio className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{site.ihs_site_id}</span>
                      </button>

                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${
                        isCompleted 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : isActive 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {isCompleted ? '✓ VISITED' : isActive ? 'IN PROGRESS' : 'UNVISITED'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1 mb-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">LGA / Cluster:</span>
                        <b className="text-slate-200">{site.lga || 'FCT'}</b>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">FSE:</span>
                        <b className="text-cyan-300 truncate max-w-[120px]">{site.smc_fse_name || 'N/A'}</b>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1.5">
                    <button
                      onClick={() => handleLocateSiteOnMap(site)}
                      className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3 text-cyan-400" />
                      <span>Locate</span>
                    </button>

                    {isCompleted ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Inspected
                      </span>
                    ) : (
                      <button
                        onClick={() => handleScheduleVisit(site)}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Visit
                      </button>
                    )}

                    {onSelectSite && (
                      <button
                        onClick={() => onSelectSite(site.ihs_site_id)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold border border-slate-700"
                      >
                        Profile
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>


      {/* 📜 COMPLETED SITE VISITS LOG TABLE */}
      {completedVisits.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-emerald-500/30 bg-slate-900/60 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Completed Site Inspections Log ({completedVisits.length} Visits All-Time)</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Today: {visitsTodayCount}/3 Completed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-extrabold">
                  <th className="py-3 px-3">Site ID</th>
                  <th className="py-3 px-3">WO Ref</th>
                  <th className="py-3 px-3">Visit Date</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">LGA</th>
                  <th className="py-3 px-3">FSE On-Site</th>
                  <th className="py-3 px-3">Inspection Notes & Findings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {completedVisits.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-bold text-cyan-300">{v.site_id}</td>
                    <td className="py-3 px-3 text-purple-300 font-bold">{v.wo_number || '---'}</td>
                    <td className="py-3 px-3 text-slate-300">{v.visit_date}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-purple-300 font-sans font-bold">
                        {v.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 font-sans">{v.lga}</td>
                    <td className="py-3 px-3 text-slate-300 font-sans">{v.fse_name}</td>
                    <td className="py-3 px-3 text-slate-300 font-sans text-xs max-w-sm truncate">
                      {v.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* 🛠️ CREATE WORK ORDER MODAL */}
      {createWoModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-purple-500/50 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative my-8 text-slate-100 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-purple-500/20 text-purple-400 rounded-2xl border border-purple-500/40 shrink-0">
                  <Wrench className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Create New Field Work Order</h3>
                  <p className="text-xs text-slate-400">Generate a new Work Order for site intervention and field inspection.</p>
                </div>
              </div>

              <button onClick={() => setCreateWoModalOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWorkOrderSubmit} className="space-y-4 text-xs font-sans">
              
              {/* Target Cell Site Search */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">Target Cell Site ID <span className="text-red-400">*</span>:</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Site ID (e.g., FC2437, FC1090)..."
                    value={woSiteSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setWoSiteSearch(val);
                      const cleanVal = val.trim().toLowerCase();
                      const found = sites.find(s => s.ihs_site_id.toLowerCase() === cleanVal || (s.mtn_id && s.mtn_id.toLowerCase() === cleanVal));
                      if (found) {
                        setSelectedWoSite(found);
                        if (found.smc_fse_name && !woFseName) setWoFseName(found.smc_fse_name);
                      } else {
                        setSelectedWoSite(null);
                      }
                    }}
                    className="w-full bg-slate-950 text-white placeholder-slate-500 pl-9 pr-3 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400 font-mono"
                  />
                </div>

                {/* Selected Site Badge */}
                {selectedWoSite && (
                  <div className="mt-2 p-2.5 bg-purple-950/40 border border-purple-500/40 rounded-xl flex items-center justify-between font-mono">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-white text-sm">{selectedWoSite.ihs_site_id}</span>
                      <span className="text-slate-400 text-xs font-sans">({selectedWoSite.lga || 'FCT'}, {selectedWoSite.cluster_name})</span>
                    </div>
                    <span className="text-purple-300 text-xs font-sans">FSE: {selectedWoSite.smc_fse_name || 'N/A'}</span>
                  </div>
                )}

                {/* Auto-complete Dropdown */}
                {!selectedWoSite && woSearchMatchingSites.length > 0 && (
                  <div className="mt-1 bg-slate-950 border border-slate-800 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-800">
                    {woSearchMatchingSites.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSelectedWoSite(s);
                          setWoSiteSearch(s.ihs_site_id);
                          if (s.smc_fse_name) setWoFseName(s.smc_fse_name);
                        }}
                        className="p-2.5 hover:bg-purple-950/50 cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-mono font-bold text-cyan-300">{s.ihs_site_id}</span>
                        <span className="text-slate-400 text-[11px]">{s.lga || 'FCT'} • {s.cluster_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Work Order Title */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">Work Order Title / Intervention <span className="text-red-400">*</span>:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Generator AC Overhaul & Fuel Audit"
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Category & Priority Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Category:</label>
                  <select
                    value={woCategory}
                    onChange={(e) => setWoCategory(e.target.value)}
                    className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400 font-semibold"
                  >
                    <option value="Power & Energy">Power & Energy (DisCo/Gen)</option>
                    <option value="Fiber Optic Repair">Fiber Optic Repair / TNL</option>
                    <option value="Rigger & Antenna">Rigger & Antenna Alignment</option>
                    <option value="Generator AC Overhaul">Generator AC Overhaul</option>
                    <option value="Preventative Maintenance">Preventative Maintenance</option>
                    <option value="Security & Site Access">Security & Site Access</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Priority SLA:</label>
                  <select
                    value={woPriority}
                    onChange={(e) => setWoPriority(e.target.value)}
                    className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400 font-semibold"
                  >
                    <option value="Critical">🔴 Critical (Immediate SLA Outage)</option>
                    <option value="High">🟠 High Priority</option>
                    <option value="Medium">🟡 Medium Priority</option>
                    <option value="Low">🟢 Low / Routine</option>
                  </select>
                </div>
              </div>

              {/* Assigned FSE & Target Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Assigned FSE / Technician:</label>
                  <input
                    type="text"
                    placeholder="FSE Name (e.g. Solomon Odubu Odafe)"
                    value={woFseName}
                    onChange={(e) => setWoFseName(e.target.value)}
                    className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Target Completion Date:</label>
                  <input
                    type="date"
                    value={woTargetDate}
                    onChange={(e) => setWoTargetDate(e.target.value)}
                    className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400 font-mono"
                  />
                </div>
              </div>

              {/* Detailed Scope of Work */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">Scope of Work & Instructions:</label>
                <textarea
                  rows="3"
                  placeholder="Detail specific tasks, required spare parts, or field instructions..."
                  value={woScope}
                  onChange={(e) => setWoScope(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400 text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setCreateWoModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center gap-1.5"
                >
                  <Wrench className="w-4 h-4" />
                  <span>Create Work Order</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}


      {/* 📝 COMPLETE INSPECTION MODAL */}
      {completeModalOpen && activeSite && (
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-slate-100 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/40">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Complete Field Inspection</h3>
                  <span className="text-xs font-mono text-cyan-300">{activeSite.ihs_site_id} • {activeSite.lga || 'FCT'}</span>
                </div>
              </div>
              <button onClick={() => setCompleteModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-sans">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Inspection Category:</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 text-white p-2.5 rounded-xl border border-slate-700 focus:border-emerald-400 font-semibold"
                >
                  <option value="Routine Inspection">Routine Inspection</option>
                  <option value="Power Audit">Power Audit (DisCo / Gen)</option>
                  <option value="Fiber Audit">Fiber / TNL Audit</option>
                  <option value="Security Audit">Security & Rigger Check</option>
                  <option value="Emergency RCA">Emergency RCA Investigation</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Inspection Notes & Findings:</label>
                <textarea
                  rows="3"
                  placeholder="Enter site findings, generator status, fuel level, or field engineer remarks..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full bg-slate-950 text-white p-3 rounded-xl border border-slate-700 focus:border-emerald-400 text-xs"
                />
              </div>

              <div className="flex items-center space-x-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="fseConf"
                  checked={fseConfirmed}
                  onChange={(e) => setFseConfirmed(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
                />
                <label htmlFor="fseConf" className="text-slate-300 text-xs cursor-pointer">
                  Confirmed field engineer <b>({activeWO?.fse_name || activeSite.smc_fse_name || 'FSE'})</b> was engaged on site
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-3">
              <button
                onClick={() => setCompleteModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700"
              >
                Cancel
              </button>

              <button
                onClick={handleCompleteVisitSubmit}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save Completed Inspection</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
