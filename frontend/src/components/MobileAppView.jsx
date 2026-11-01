import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Smartphone, Wifi, WifiOff, RefreshCw, PlusCircle, MessageSquare,
  MapPin, Search, CheckCircle, AlertTriangle, Send, Trash2, UploadCloud, Upload,
  Radio, Phone, ShieldAlert, Bot, Layers, Camera, X,
  LogOut, Navigation, ExternalLink, Calendar, Clock, SlidersHorizontal,
  ChevronRight, ChevronLeft, UserCheck, Zap, Activity, ArrowUpRight, Monitor,
  Check, Edit3, Filter, Database, Building2, Download, FileSpreadsheet, Eye
} from 'lucide-react';
import {
  createNote,
  updateNote,
  resolveNote,
  deleteNote,
  exportNotesExcel,
  createWhatsAppMessage,
  checkServerHealth,
  fetchSites,
  lookupSite,
  fetchFilterOptions,
  fetchNotes,
  fetchWhatsAppMessages,
  fetchDashboardStats,
  queryAIAssistant,
  setCustomServerIp,
  getMediaUrl,
  DEFAULT_MOBILE_SERVER_URL,
  fetchAvailabilityStats,
  fetchAvailabilityRecords,
  fetchAvailabilityArchives,
  uploadAvailabilityFile,
  fetchHourlyAvailabilityStats,
  fetchHourlyAvailabilityRecords,
  uploadHourlyAvailabilityFile,
  fetchWSDStatus,
  fetchTNLLinks
} from '../api';
import {
  getPendingNotes,
  getPendingWhatsApp,
  getPendingFseAudits,
  saveOfflineNote,
  saveOfflineWhatsApp,
  saveOfflineFseAudit,
  removePendingNote,
  removePendingWhatsApp,
  removePendingFseAudit,
  getCachedSites,
  saveCachedSites,
  getPendingTotalCount
} from '../mobileOfflineStorage';
import GeoMap from './GeoMap';
import { getSDMStateInfo } from '../utils/userUtils';

// Helper to format Nigerian phone numbers for WhatsApp links
const formatWhatsAppPhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 11) {
    return '234' + digits.slice(1);
  }
  if (digits.length === 10) {
    return '234' + digits;
  }
  return digits;
};

// Compress & Watermark Photo with Site ID, GPS Coordinates, and Timestamp
const watermarkPhoto = (file, siteId, gpsCoords, authorName) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const stripHeight = Math.max(76, Math.round(canvas.height * 0.11));
        ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
        ctx.fillRect(0, canvas.height - stripHeight, canvas.width, stripHeight);

        ctx.fillStyle = '#22d3ee';
        const fontSize = Math.max(13, Math.round(canvas.width * 0.024));
        ctx.font = `bold ${fontSize}px monospace`;

        const timestamp = new Date().toLocaleString();
        const gpsText = gpsCoords
          ? `GPS: ${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}`
          : 'GPS: Unverified';

        ctx.fillText(`MTN / IHS FIELD VERIFICATION | SITE: ${siteId || 'GENERAL'}`, 14, canvas.height - stripHeight + fontSize + 8);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${gpsText} | ${timestamp}`, 14, canvas.height - stripHeight + fontSize * 2 + 14);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`LOGGED BY: ${authorName || 'SDM Engineer'}`, 14, canvas.height - stripHeight + fontSize * 3 + 18);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        canvas.toBlob((blob) => {
          const watermarkedFile = blob
            ? new File([blob], file.name || `site_${Date.now()}.jpg`, { type: 'image/jpeg' })
            : file;
          resolve({ file: watermarkedFile, dataUrl });
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve({ file, dataUrl: e.target.result });
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

export default function MobileAppView({
  sites = [],
  onDataChanged,
  onSelectSite,
  currentTheme = 'mtn-dark',
  onThemeChange,
  currentUser,
  onLogout,
  onSwitchToDesktop
}) {
  const isMobileNative = typeof window !== 'undefined' && Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'file:'
  );

  const isSuperuser = Boolean(currentUser?.is_superuser);
  const isRdm =
    currentUser?.role === 'MTN RDM' ||
    currentUser?.role === 'Regional Delivery Manager' ||
    Boolean(currentUser?.groups?.some((g) => g.name?.includes('RDM')));
  const isFse =
    currentUser?.role === 'SMC FSE Engineer' ||
    currentUser?.role === 'FSE Engineer';
  const isSdm = !isSuperuser && !isRdm && !isFse;
  const userName = currentUser?.full_name || currentUser?.username || '';
  const userRole = currentUser?.role || '';
  const userStateProp = currentUser?.state || '';
  const stateInfo = useMemo(
    () => getSDMStateInfo(currentUser),
    [userName, userRole, userStateProp, isSuperuser]
  );
  const stateCode = stateInfo?.code || userStateProp || undefined;

  // Core Navigation: 'overview' | 'sites' | 'availability' | 'field_log' | 'map_ai'
  const [activeTab, setActiveTab] = useState('overview');
  const [sitesMode, setSitesMode] = useState('inventory'); // 'inventory' | 'ihs_matrix'
  const [fieldLogMode, setFieldLogMode] = useState('notes'); // 'notes' | 'whatsapp' | 'fse'
  const [mapAiMode, setMapAiMode] = useState('map'); // 'map' | 'ai' | 'links'
  const [availMode, setAvailMode] = useState('daily'); // 'daily' | 'hourly'

  // Connectivity & Settings Drawer
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverReachable, setServerReachable] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showNoteComposer, setShowNoteComposer] = useState(false);

  // Server IP Configuration
  const [serverIp, setServerIp] = useState(() => {
    const saved = localStorage.getItem('fct_sdm_server_ip');
    if (
      saved &&
      (saved.includes('warm-tennis-touch-kansas.trycloudflare.com') ||
       saved.includes('graduate-summaries-joy-tenant.trycloudflare.com'))
    ) {
      localStorage.removeItem('fct_sdm_server_ip');
      return DEFAULT_MOBILE_SERVER_URL;
    }
    return saved || DEFAULT_MOBILE_SERVER_URL;
  });

  // Scoped Data States
  const [localSites, setLocalSites] = useState(() => {
    if (Array.isArray(sites) && sites.length > 0) return sites;
    const cached = getCachedSites();
    return Array.isArray(cached) ? cached : [];
  });
  const [serverStats, setServerStats] = useState(null);
  const [liveNotes, setLiveNotes] = useState([]);
  const [notesTotalCount, setNotesTotalCount] = useState(0);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [liveWhatsApp, setLiveWhatsApp] = useState([]);
  const [loadingFeeds, setLoadingFeeds] = useState(false);

  // Offline Queues
  const [pendingNotes, setPendingNotes] = useState(() => getPendingNotes());
  const [pendingWhatsApp, setPendingWhatsApp] = useState(() => getPendingWhatsApp());
  const [pendingFseAudits, setPendingFseAudits] = useState(() => getPendingFseAudits());

  // =========================================================================
  // SITE INVENTORY & IHS MATRIX DATABASE STATE
  // =========================================================================
  const [dbSites, setDbSites] = useState([]);
  const [dbTotalCount, setDbTotalCount] = useState(0);
  const [dbPage, setDbPage] = useState(1);
  const dbPageSize = 25;
  const [dbLoading, setDbLoading] = useState(false);
  const [showSiteFilters, setShowSiteFilters] = useState(false);

  const [siteSearch, setSiteSearch] = useState('');
  const [siteStatus, setSiteStatus] = useState('All'); // 'All' | 'Operational' | 'Down'
  const [sitePriority, setSitePriority] = useState('All'); // 'All' | 'P1' | 'P2' | 'P3' | 'P4'
  const [siteStateFilter, setSiteStateFilter] = useState('All');
  const [siteLgaFilter, setSiteLgaFilter] = useState('All');
  const [siteSdmFilter, setSiteSdmFilter] = useState(isSdm && userName ? userName : 'All');
  const [siteFseFilter, setSiteFseFilter] = useState(isFse && userName ? userName : 'All');
  const [siteRdmFilter, setSiteRdmFilter] = useState(isRdm && userName ? userName : 'All');
  const [siteSmcFilter, setSiteSmcFilter] = useState('All');

  const [filterOptions, setFilterOptions] = useState({
    states: [],
    lgas: [],
    sdm_names: [],
    fse_names: [],
    rdm_names: []
  });

  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedSiteDetails, setSelectedSiteDetails] = useState(null);
  const [showRawMatrixSpecs, setShowRawMatrixSpecs] = useState(false);

  // =========================================================================
  // SDM OPERATIONAL NOTES STATE (ALL EXISTING NOTES)
  // =========================================================================
  const [notesSearch, setNotesSearch] = useState('');
  const [notesFilter, setNotesFilter] = useState('All'); // 'All' | 'Open' | 'In Progress' | 'Resolved' | 'Escalated'
  const [notesCategoryFilter, setNotesCategoryFilter] = useState('All');
  const [notesPriorityFilter, setNotesPriorityFilter] = useState('All');
  const [notesDateFilter, setNotesDateFilter] = useState('All'); // 'All' | 'yesterday' | 'today' | '7days' | '30days' | 'custom'
  const [notesStartDate, setNotesStartDate] = useState('');
  const [notesEndDate, setNotesEndDate] = useState('');
  const [notesSdmFilter, setNotesSdmFilter] = useState('All');
  const [notesWithPhotosOnly, setNotesWithPhotosOnly] = useState(false);
  const [showPhotosGallery, setShowPhotosGallery] = useState(false);
  const [notesPage, setNotesPage] = useState(1);
  const notesPageSize = 20;
  const [exportingNotes, setExportingNotes] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const noteCategories = [
    'All', 'General', 'Power', 'Transmission', 'Generator', 'Battery', 'Fuel',
    'Microwave', 'RAN', 'Fiber', 'Security', 'SA Alarms', 'Customer',
    'Preventive Maintenance', 'Corrective Maintenance'
  ];

  const toLocalISOString = (dateObj = new Date()) => {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return '';
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  };

  // Field Note Composer State
  const defaultAuthor = useMemo(() => {
    if (userName) {
      return isRdm ? `${userName} (MTN RDM)` : userName;
    }
    return 'State Delivery Manager';
  }, [userName, isRdm]);

  const [noteForm, setNoteForm] = useState({
    site: '',
    title: '',
    category: 'Power',
    priority: 'High',
    status: 'Open',
    tower_co: 'IHS',
    author: defaultAuthor,
    comment: ''
  });
  const [noteIncidentTime, setNoteIncidentTime] = useState(() => toLocalISOString());
  const [notePhotos, setNotePhotos] = useState([]);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gettingGps, setGettingGps] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [editIncidentTime, setEditIncidentTime] = useState('');
  const [editPhotos, setEditPhotos] = useState([]);
  const [appendUpdateText, setAppendUpdateText] = useState('');

  useEffect(() => {
    setNoteForm((prev) => ({
      ...prev,
      author: defaultAuthor
    }));
  }, [defaultAuthor]);

  const isCreatorOfNote = useCallback(
    (note) => {
      if (isSuperuser) return true;
      if (!userName || !note?.created_by) return false;
      const author = note.created_by.toLowerCase();
      const current = userName.toLowerCase();
      return author === current || author.startsWith(`${current} (`);
    },
    [isSuperuser, userName]
  );

  // Availability & Uploaded Files State
  const [availStats, setAvailStats] = useState(null);
  const [availRecords, setAvailRecords] = useState([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [availSearch, setAvailSearch] = useState('');
  const [availBand, setAvailBand] = useState(''); // '' | 'critical_under_95' | 'degraded_under_98_5' | 'perfect_100'
  const [availTech, setAvailTech] = useState(''); // '' | '2G' | '3G' | '4G'
  const [availArchives, setAvailArchives] = useState([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState('');
  const [uploadingAvailFile, setUploadingAvailFile] = useState(false);
  const [wsdStatus, setWsdStatus] = useState(null);

  // WhatsApp Form State
  const [waForm, setWaForm] = useState({
    site_id: '',
    sender_name: userName || 'Field FSE Report',
    issue_category: 'Power / Fuel',
    status_update: 'Investigating',
    raw_message: ''
  });
  const [waFilter, setWaFilter] = useState('ALL');

  // FSE Quick Check State
  const [fseQuery, setFseQuery] = useState('');

  // AI Assistant State
  const [aiMessages, setAiMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am your Mobile Field AI Assistant. Tap a quick diagnostic below or ask about any Site ID, power alarm, or SLA issue.'
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Fiber & TNL Links State
  const [tnlLinks, setTnlLinks] = useState([]);
  const [tnlSearch, setTnlSearch] = useState('');
  const [tnlLoading, setTnlLoading] = useState(false);

  // =========================================================================
  // ROLE-BASED SCOPE PARAMETERS (MATCHING DESKTOP APP.JSX & NOTESCENTER.JSX)
  // =========================================================================
  const getScopeParams = useCallback(() => {
    return {
      is_superuser: isSuperuser ? 'true' : 'false',
      user_role: userRole || undefined,
      role: userRole || undefined,
      user_state: isRdm || isSuperuser ? undefined : stateCode,
      user_name: userName || undefined,
      rdm: isRdm ? userName : undefined,
      sdm: isSdm ? userName : undefined,
      fse: isFse ? userName : undefined
    };
  }, [isSuperuser, isRdm, isSdm, isFse, userName, userRole, stateCode]);

  const refreshQueues = useCallback(() => {
    setPendingNotes(getPendingNotes());
    setPendingWhatsApp(getPendingWhatsApp());
    setPendingFseAudits(getPendingFseAudits());
  }, []);

  // =========================================================================
  // LOAD ALL SDM OPERATIONAL NOTES (MATCHING NOTESCENTER.JSX)
  // =========================================================================
  const hasLoadedNotesRef = useRef(false);

  const loadAllNotes = useCallback(async (forceSpinner = false) => {
    if (!hasLoadedNotesRef.current || forceSpinner) {
      setLoadingNotes(true);
    }
    try {
      const sdmParam = isSdm
        ? userName
        : notesSdmFilter !== 'All'
          ? notesSdmFilter
          : undefined;
      const rdmParam = isRdm ? userName : undefined;
      const fseParam = isFse ? userName : undefined;

      const data = await fetchNotes({
        rdm: rdmParam,
        sdm: sdmParam,
        fse: fseParam,
        is_superuser: isSuperuser ? 'true' : 'false',
        role: userRole || undefined,
        user_role: userRole || undefined,
        user_state: isRdm || isSuperuser ? undefined : stateCode,
        search: notesSearch.trim() || undefined,
        category: notesCategoryFilter !== 'All' ? notesCategoryFilter : undefined,
        priority: notesPriorityFilter !== 'All' ? notesPriorityFilter : undefined,
        status: notesFilter !== 'All' && notesFilter !== 'ALL' ? notesFilter : undefined,
        date_filter: notesDateFilter !== 'All' ? notesDateFilter : undefined,
        start_date: notesDateFilter === 'custom' && notesStartDate ? notesStartDate : undefined,
        end_date: notesDateFilter === 'custom' && notesEndDate ? notesEndDate : undefined,
        page_size: 1500
      });

      const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];
      setLiveNotes(list);
      setNotesTotalCount(data?.count !== undefined ? data.count : list.length);
      hasLoadedNotesRef.current = true;
    } catch (err) {
      console.warn('Error loading SDM notes in mobile view:', err);
    } finally {
      setLoadingNotes(false);
    }
  }, [
    isSdm,
    isRdm,
    isFse,
    isSuperuser,
    userName,
    userRole,
    stateCode,
    notesSdmFilter,
    notesSearch,
    notesCategoryFilter,
    notesPriorityFilter,
    notesFilter,
    notesDateFilter,
    notesStartDate,
    notesEndDate
  ]);

  useEffect(() => {
    setNotesPage(1);
    const timer = setTimeout(() => {
      loadAllNotes();
    }, notesSearch ? 200 : 0);
    return () => clearTimeout(timer);
  }, [loadAllNotes]);

  // =========================================================================
  // LOAD SITE INVENTORY & IHS MATRIX DATABASE (MATCHING SITEDATABASE.JSX)
  // =========================================================================
  useEffect(() => {
    fetchFilterOptions({
      status: siteStatus !== 'All' ? siteStatus : undefined,
      priority: sitePriority !== 'All' ? sitePriority : undefined,
      state: siteStateFilter !== 'All' ? siteStateFilter : undefined,
      lga: siteLgaFilter !== 'All' ? siteLgaFilter : undefined,
      sdm: siteSdmFilter !== 'All' ? siteSdmFilter : undefined,
      fse: siteFseFilter !== 'All' ? siteFseFilter : undefined,
      rdm: siteRdmFilter !== 'All' ? siteRdmFilter : undefined
    })
      .then((res) => {
        if (res && typeof res === 'object') {
          setFilterOptions({
            states: res.states || [],
            lgas: res.lgas || [],
            sdm_names: res.sdm_names || [],
            fse_names: res.fse_names || [],
            rdm_names: res.rdm_names || []
          });
        }
      })
      .catch(() => {});
  }, [siteStatus, sitePriority, siteStateFilter, siteLgaFilter, siteSdmFilter, siteFseFilter, siteRdmFilter]);

  const loadSitesInventory = useCallback(async () => {
    setDbLoading(true);
    try {
      const params = {
        search: siteSearch.trim() || undefined,
        status: siteStatus !== 'All' ? siteStatus : undefined,
        priority: sitePriority !== 'All' ? sitePriority : undefined,
        state: siteStateFilter !== 'All' ? siteStateFilter : undefined,
        lga: siteLgaFilter !== 'All' ? siteLgaFilter : undefined,
        sdm: siteSdmFilter !== 'All' ? siteSdmFilter : undefined,
        fse: siteFseFilter !== 'All' ? siteFseFilter : undefined,
        rdm: siteRdmFilter !== 'All' ? siteRdmFilter : undefined,
        ihs_matrix: sitesMode === 'ihs_matrix' ? 'true' : undefined,
        page: dbPage,
        page_size: dbPageSize
      };
      const data = await fetchSites(params);
      const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
          ? data
          : [];
      setDbSites(list);
      setDbTotalCount(data?.count !== undefined ? data.count : list.length);
    } catch (err) {
      console.warn('Error fetching site inventory:', err);
    } finally {
      setDbLoading(false);
    }
  }, [
    siteSearch,
    siteStatus,
    sitePriority,
    siteStateFilter,
    siteLgaFilter,
    siteSdmFilter,
    siteFseFilter,
    siteRdmFilter,
    sitesMode,
    dbPage,
    dbPageSize
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSitesInventory();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadSitesInventory]);

  const handleResetSiteFilters = () => {
    setSiteSearch('');
    setSiteStatus('All');
    setSitePriority('All');
    setSiteStateFilter('All');
    setSiteLgaFilter('All');
    setSiteSdmFilter(isSuperuser ? 'All' : isSdm ? userName : 'All');
    setSiteFseFilter(isFse ? userName : 'All');
    setSiteRdmFilter(isRdm ? userName : 'All');
    setSiteSmcFilter('All');
    setDbPage(1);
  };

  // =========================================================================
  // LOAD LIVE FEEDS (STATS, WHATSAPP, INITIAL SITES CACHE, AVAILABILITY, ARCHIVES)
  // =========================================================================
  const loadLiveFeeds = useCallback(async (includeSites = false) => {
    setLoadingFeeds(true);
    try {
      const healthy = await checkServerHealth();
      setServerReachable(healthy);
      if (!healthy) return;

      const scope = getScopeParams();
      const promises = [
        fetchDashboardStats(scope).catch(() => null),
        fetchWhatsAppMessages({ ...scope, page_size: 100 }).catch(() => []),
        fetchAvailabilityStats(scope).catch(() => null),
        fetchAvailabilityArchives().catch(() => null),
        fetchWSDStatus().catch(() => null)
      ];

      if (includeSites) {
        promises.push(fetchSites({ ...scope, page_size: 100 }).catch(() => null));
      }

      const [statsData, waData, availStatsData, archivesData, wsdData, sitesData] = await Promise.all(promises);

      if (statsData && typeof statsData === 'object') {
        setServerStats(statsData);
      }
      if (waData) {
        const list = Array.isArray(waData?.results)
          ? waData.results
          : Array.isArray(waData)
            ? waData
            : [];
        setLiveWhatsApp(list);
      }
      if (availStatsData && typeof availStatsData === 'object') {
        setAvailStats(availStatsData);
      }
      if (archivesData && Array.isArray(archivesData.archives)) {
        setAvailArchives(archivesData.archives);
      }
      if (wsdData && typeof wsdData === 'object') {
        setWsdStatus(wsdData);
      }
      if (sitesData) {
        const list = Array.isArray(sitesData?.results)
          ? sitesData.results
          : Array.isArray(sitesData)
            ? sitesData
            : [];
        if (list.length > 0) {
          setLocalSites(list);
          saveCachedSites(list);
        }
      }
    } catch (err) {
      console.warn('Mobile live feed sync error:', err);
    } finally {
      setLoadingFeeds(false);
    }
  }, [getScopeParams]);

  useEffect(() => {
    loadLiveFeeds(true);
    const interval = setInterval(() => {
      if (navigator.onLine) {
        loadLiveFeeds(false);
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [loadLiveFeeds]);

  // Online / Offline listeners
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      loadLiveFeeds(false);
      loadAllNotes();
      loadSitesInventory();
    };
    const onOffline = () => {
      setIsOnline(false);
      setServerReachable(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadLiveFeeds, loadAllNotes, loadSitesInventory]);

  // =========================================================================
  // LOAD DAILY & HOURLY AVAILABILITY RECORDS & UPLOADED ARCHIVES
  // =========================================================================
  useEffect(() => {
    if (activeTab !== 'availability') return;
    let cancelled = false;

    const fetchAvail = async () => {
      setAvailLoading(true);
      try {
        const scope = getScopeParams();
        const params = {
          ...scope,
          page_size: 50
        };
        if (availSearch.trim()) params.search = availSearch.trim();
        if (availBand) params.sla_filter = availBand;
        if (availTech) params.tech = availTech;
        if (availMode === 'daily' && selectedArchiveId) {
          params.upload_log_id = selectedArchiveId;
        }

        if (availMode === 'daily') {
          const [statsRes, recRes, archRes] = await Promise.all([
            fetchAvailabilityStats(params).catch(() => null),
            fetchAvailabilityRecords(params).catch(() => null),
            fetchAvailabilityArchives().catch(() => null)
          ]);
          if (!cancelled) {
            if (statsRes) setAvailStats(statsRes);
            if (archRes && Array.isArray(archRes.archives)) {
              setAvailArchives(archRes.archives);
            }
            const list = Array.isArray(recRes?.results)
              ? recRes.results
              : Array.isArray(recRes)
                ? recRes
                : [];
            setAvailRecords(list);
          }
        } else {
          const [statsRes, recRes] = await Promise.all([
            fetchHourlyAvailabilityStats(params).catch(() => null),
            fetchHourlyAvailabilityRecords(params).catch(() => null)
          ]);
          if (!cancelled) {
            if (statsRes) setAvailStats(statsRes);
            const list = Array.isArray(recRes?.results)
              ? recRes.results
              : Array.isArray(recRes)
                ? recRes
                : [];
            setAvailRecords(list);
          }
        }
      } catch (err) {
        console.warn('Failed to load availability records:', err);
      } finally {
        if (!cancelled) setAvailLoading(false);
      }
    };

    const timer = setTimeout(fetchAvail, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, availMode, availSearch, availBand, availTech, selectedArchiveId, getScopeParams]);

  // Upload Daily or Hourly Availability .xlsb / .xlsx File from Mobile
  const handleAvailFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvailFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('uploaded_by', userName || 'SDM Engineer');
      if (availMode === 'daily') {
        await uploadAvailabilityFile(fd);
        setSelectedArchiveId('');
      } else {
        await uploadHourlyAvailabilityFile(fd);
      }
      setSyncMessage({ type: 'success', text: `Uploaded ${file.name} successfully!` });
      loadLiveFeeds(false);
    } catch (err) {
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.error || `Failed to upload ${file.name}`
      });
    } finally {
      setUploadingAvailFile(false);
      try {
        e.target.value = '';
      } catch {}
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  // Load full Site Details (including attached photos & notes) when selectedSite opens
  useEffect(() => {
    if (!selectedSite) {
      setSelectedSiteDetails(null);
      return;
    }
    const primaryId = selectedSite.ihs_site_id || selectedSite.mtn_id;
    if (!primaryId) return;
    let cancelled = false;
    lookupSite(primaryId)
      .then((res) => {
        if (!cancelled && res && typeof res === 'object') {
          setSelectedSiteDetails(res);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  // Load TNL Links when user selects Links mode in Map & AI tab
  useEffect(() => {
    if (activeTab !== 'map_ai' || mapAiMode !== 'links') return;
    let cancelled = false;
    const loadLinks = async () => {
      setTnlLoading(true);
      try {
        const params = { page_size: 50 };
        if (tnlSearch.trim()) params.search = tnlSearch.trim();
        const res = await fetchTNLLinks(params);
        if (!cancelled) {
          const list = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
          setTnlLinks(list);
        }
      } catch (e) {
        console.warn('Failed to fetch TNL links:', e);
      } finally {
        if (!cancelled) setTnlLoading(false);
      }
    };
    const timer = setTimeout(loadLinks, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, mapAiMode, tnlSearch]);

  // =========================================================================
  // COMPUTED SUMMARIES & LISTS
  // =========================================================================
  const summaryStats = useMemo(() => {
    const safeSites = Array.isArray(localSites) ? localSites : [];
    const safeNotes = Array.isArray(liveNotes) ? liveNotes : [];
    const total = serverStats?.total_sites ?? (dbTotalCount || safeSites.length);
    const down =
      serverStats?.down_sites ??
      safeSites.filter((s) => s.is_down || s.operational_status === 'Down').length;
    const p1 =
      serverStats?.critical_p1_sites ??
      serverStats?.critical_sites ??
      safeSites.filter((s) => s.is_critical || (s.priority || '').includes('P1')).length;
    const openNotes =
      serverStats?.open_notes ??
      safeNotes.filter((n) => n.status !== 'Resolved').length;
    return { total, down, p1, openNotes, allNotesCount: notesTotalCount || safeNotes.length };
  }, [serverStats, dbTotalCount, localSites, liveNotes, notesTotalCount]);

  // Priority / Down sites for Home Overview quick dispatch
  const urgentSites = useMemo(() => {
    const source = dbSites.length > 0 ? dbSites : localSites;
    const safeSites = Array.isArray(source) ? source : [];
    const down = safeSites.filter((s) => s.is_down || s.operational_status === 'Down');
    if (down.length > 0) return down.slice(0, 6);
    const p1 = safeSites.filter((s) => s.is_critical || (s.priority || '').includes('P1'));
    return p1.slice(0, 6);
  }, [dbSites, localSites]);

  // Notes with Photos & All Uploaded Evidence Photos
  const notesWithPhotosList = useMemo(() => {
    return (Array.isArray(liveNotes) ? liveNotes : []).filter(
      (n) => Array.isArray(n.attachments) && n.attachments.length > 0
    );
  }, [liveNotes]);

  const allUploadedPhotos = useMemo(() => {
    const list = [];
    notesWithPhotosList.forEach((n) => {
      const siteCode = n.site_ihs_id || n.site_id_str || n.site || 'GENERAL';
      (n.attachments || []).forEach((att) => {
        const url = getMediaUrl(att.file || att.image || att.photo_url);
        if (url) {
          list.push({
            id: att.id || `${n.id}-${url}`,
            url,
            fileName: att.file_name || 'Site Photo',
            siteCode,
            noteTitle: n.title || n.category || 'Site Evidence',
            createdBy: n.created_by || n.author || 'SDM',
            createdAt: att.uploaded_at || n.created_at
          });
        }
      });
    });
    return list;
  }, [notesWithPhotosList]);

  const filteredLiveNotes = useMemo(() => {
    if (!notesWithPhotosOnly) return liveNotes;
    return notesWithPhotosList;
  }, [liveNotes, notesWithPhotosOnly, notesWithPhotosList]);

  // Paginated Notes (20 per page, matching NotesCenter.jsx)
  const totalNotesPages = Math.ceil(filteredLiveNotes.length / notesPageSize) || 1;
  const paginatedNotes = useMemo(() => {
    const start = (notesPage - 1) * notesPageSize;
    return filteredLiveNotes.slice(start, start + notesPageSize);
  }, [filteredLiveNotes, notesPage, notesPageSize]);

  const totalDbPages = Math.ceil(dbTotalCount / dbPageSize) || 1;

  // Filtered WhatsApp Intel
  const filteredWhatsApp = useMemo(() => {
    const safeWa = Array.isArray(liveWhatsApp) ? liveWhatsApp : [];
    if (waFilter === 'ALL') return safeWa;
    return safeWa.filter((w) => (w.issue_category || '').toLowerCase().includes(waFilter.toLowerCase()));
  }, [liveWhatsApp, waFilter]);

  // FSE Quick Check Directory (using real backend fields smc_fse_name & smc_fse_phone)
  const fseDirectory = useMemo(() => {
    const source = localSites.length > 0 ? localSites : dbSites;
    const safeSites = Array.isArray(source) ? source : [];
    const map = new Map();
    safeSites.forEach((s) => {
      const raw = s.raw_data || {};
      const name = (s.smc_fse_name || s.fse || raw['FSE NAME'] || '').trim();
      if (!name || name.toUpperCase() === 'NAN' || name.toUpperCase() === 'UNASSIGNED') return;
      if (!map.has(name)) {
        map.set(name, {
          name,
          phone: s.smc_fse_phone || s.fse_phone || raw['FSE CONTACT NO.'] || '',
          sdm: s.sdm_name || s.sdm || raw['SDM NAME'] || '',
          efs: s.efs_name || '',
          efs_phone: s.efs_phone || '',
          cluster: s.cluster_name || s.lga || '',
          totalSites: 0,
          downSites: 0,
          p1Sites: 0,
          sampleSites: []
        });
      }
      const entry = map.get(name);
      entry.totalSites += 1;
      if (s.is_down || s.operational_status === 'Down') entry.downSites += 1;
      if (s.is_critical || (s.priority || '').includes('P1')) entry.p1Sites += 1;
      if (!entry.phone && (s.smc_fse_phone || raw['FSE CONTACT NO.'])) {
        entry.phone = s.smc_fse_phone || raw['FSE CONTACT NO.'];
      }
      const sid = s.ihs_site_id || s.mtn_id;
      if (sid && entry.sampleSites.length < 6) entry.sampleSites.push(sid);
    });
    const list = Array.from(map.values()).sort((a, b) => b.downSites - a.downSites || b.totalSites - a.totalSites);
    if (!fseQuery.trim()) return list.slice(0, 40);
    const q = fseQuery.toLowerCase();
    return list.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.cluster.toLowerCase().includes(q) ||
        f.sdm.toLowerCase().includes(q) ||
        f.sampleSites.some((sid) => sid.toLowerCase().includes(q))
    );
  }, [localSites, dbSites, fseQuery]);

  // =========================================================================
  // FIELD ACTIONS: GPS, PHOTO WATERMARKING, NOTE SUBMIT/EDIT/RESOLVE/EXPORT
  // =========================================================================
  const captureGpsLocation = () => {
    if (!navigator.geolocation) return;
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGettingGps(false);
      },
      () => setGettingGps(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const processed = [];
    for (const file of files) {
      const wm = await watermarkPhoto(file, noteForm.site, gpsCoords, noteForm.author || defaultAuthor);
      processed.push(wm);
    }
    setNotePhotos((prev) => [...prev, ...processed]);
    e.target.value = '';
  };

  const handleEditPhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const processed = [];
    for (const file of files) {
      const wm = await watermarkPhoto(
        file,
        editingNote?.site_ihs_id || editingNote?.site || 'SITE',
        gpsCoords,
        userName || defaultAuthor
      );
      processed.push(wm);
    }
    setEditPhotos((prev) => [...prev, ...processed]);
    e.target.value = '';
  };

  // Submit Field Note (Using FormData matching NotesCenter.jsx & NoteViewSet)
  const handleNoteSubmit = async (e) => {
    e.preventDefault();
    if (!noteForm.comment.trim()) return;

    const cleanSiteId = (noteForm.site || 'GENERAL').trim().toUpperCase();
    const cleanTitle = (noteForm.title || `${noteForm.category} Field Report - ${cleanSiteId}`).trim();
    const finalAuthor = (noteForm.author || defaultAuthor).trim();
    let finalDescription = noteForm.comment.trim();
    if (gpsCoords) {
      finalDescription += `\n[GPS: ${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}]`;
    }

    if (isOnline && serverReachable) {
      try {
        const formData = new FormData();
        formData.append('site_id_input', cleanSiteId);
        formData.append('title', cleanTitle);
        formData.append('description', finalDescription);
        formData.append('category', noteForm.category || 'General');
        formData.append('priority', noteForm.priority || 'Medium');
        formData.append('status', noteForm.status || 'Open');
        formData.append('tower_co', noteForm.tower_co || 'IHS');
        formData.append('created_by', finalAuthor);
        if (noteIncidentTime) {
          formData.append('created_at', noteIncidentTime);
        }
        if (isRdm && userName) {
          formData.append('rdm', userName);
        }
        if (currentUser?.role) {
          formData.append('role', currentUser.role);
        }

        notePhotos.forEach((p) => {
          formData.append('photos', p.file || p);
        });

        await createNote(formData);
        setSyncMessage({ type: 'success', text: `SDM Note logged for ${cleanSiteId}` });
        setNoteForm({
          site: '',
          title: '',
          category: 'Power',
          priority: 'High',
          status: 'Open',
          tower_co: 'IHS',
          author: defaultAuthor,
          comment: ''
        });
        setNoteIncidentTime(toLocalISOString());
        setNotePhotos([]);
        setShowNoteComposer(false);
        loadAllNotes();
        loadLiveFeeds(false);
        if (onDataChanged) onDataChanged();
        setTimeout(() => setSyncMessage(null), 3500);
        return;
      } catch (err) {
        console.warn('Online note creation failed, queuing offline:', err);
      }
    }

    saveOfflineNote({
      site_id_input: cleanSiteId,
      title: cleanTitle,
      description: finalDescription,
      category: noteForm.category || 'General',
      priority: noteForm.priority || 'Medium',
      status: noteForm.status || 'Open',
      tower_co: noteForm.tower_co || 'IHS',
      created_at: noteIncidentTime || new Date().toISOString(),
      created_by: finalAuthor
    });
    refreshQueues();
    setNoteForm({
      site: '',
      title: '',
      category: 'Power',
      priority: 'High',
      status: 'Open',
      tower_co: 'IHS',
      author: defaultAuthor,
      comment: ''
    });
    setNoteIncidentTime(toLocalISOString());
    setNotePhotos([]);
    setShowNoteComposer(false);
    setSyncMessage({ type: 'warning', text: 'Saved to Offline Queue. Will auto-sync when online.' });
    setTimeout(() => setSyncMessage(null), 3500);
  };

  // Resolve Note (Exact payload matching NotesCenter.jsx)
  const handleQuickResolveNote = async (note) => {
    try {
      await resolveNote(note.id, {
        updated_by: userName,
        sdm: userName,
        rdm: isRdm ? userName : undefined,
        role: currentUser?.role,
        is_superuser: isSuperuser
      });
      setLiveNotes((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, status: 'Resolved', resolved_at: new Date().toISOString() } : n))
      );
      setSyncMessage({ type: 'success', text: `Note for ${note.site_ihs_id || 'Site'} marked Resolved!` });
      if (onDataChanged) onDataChanged();
      setTimeout(() => setSyncMessage(null), 2500);
    } catch (err) {
      console.error('Failed to resolve note:', err);
      setSyncMessage({
        type: 'warning',
        text: err?.response?.data?.error || 'Failed to resolve note.'
      });
      setTimeout(() => setSyncMessage(null), 3500);
    }
  };

  // Delete Note (Exact payload matching NotesCenter.jsx)
  const handleDeleteNote = async (note) => {
    try {
      await deleteNote(note.id, {
        user: userName,
        sdm: userName,
        rdm: isRdm ? userName : undefined,
        role: currentUser?.role,
        is_superuser: isSuperuser
      });
      setLiveNotes((prev) => prev.filter((n) => n.id !== note.id));
      setNotesTotalCount((c) => Math.max(0, c - 1));
      setSyncMessage({ type: 'success', text: 'Note deleted.' });
      if (onDataChanged) onDataChanged();
      setTimeout(() => setSyncMessage(null), 2500);
    } catch (err) {
      console.error('Failed to delete note:', err);
      setSyncMessage({
        type: 'warning',
        text: err?.response?.data?.error || 'Failed to delete note.'
      });
      setTimeout(() => setSyncMessage(null), 3500);
    }
  };

  // Save Edited Note (Matching NotesCenter.jsx FormData structure 100%)
  const handleSaveEditNote = async (e) => {
    e.preventDefault();
    if (!editingNote) return;
    try {
      const fd = new FormData();
      fd.append('site_id_input', (editingNote.site_ihs_id || editingNote.site || 'GENERAL').trim().toUpperCase());
      fd.append('title', editingNote.title || 'SDM Operational Note');
      fd.append('description', editingNote.description || editingNote.comment || '');
      if (appendUpdateText.trim()) {
        fd.append('append_update', appendUpdateText.trim());
      }
      fd.append('category', editingNote.category || 'General');
      fd.append('priority', editingNote.priority || 'Medium');
      fd.append('status', editingNote.status || 'Open');
      fd.append('tower_co', editingNote.tower_co || 'IHS');
      if (editIncidentTime) {
        fd.append('created_at', editIncidentTime);
      }
      fd.append('updated_by', userName || defaultAuthor);
      if (userName) fd.append('sdm', userName);
      if (isRdm && userName) fd.append('rdm', userName);
      if (currentUser?.role) fd.append('role', currentUser.role);
      fd.append('is_superuser', isSuperuser ? 'true' : 'false');

      editPhotos.forEach((p) => {
        fd.append('photos', p.file || p);
      });

      await updateNote(editingNote.id, fd);
      setEditingNote(null);
      setEditPhotos([]);
      setAppendUpdateText('');
      loadAllNotes();
      if (onDataChanged) onDataChanged();
      setSyncMessage({ type: 'success', text: 'SDM Note updated!' });
      setTimeout(() => setSyncMessage(null), 2500);
    } catch (err) {
      console.error('Failed to update note:', err);
      setSyncMessage({
        type: 'warning',
        text: err?.response?.data?.error || 'Failed to update note.'
      });
      setTimeout(() => setSyncMessage(null), 3500);
    }
  };

  // Export SDM Notes to Excel (Supports both Filtered Export & Yesterday's Notes Export)
  const handleExportNotes = async (overrideDateFilter = null) => {
    setExportingNotes(true);
    try {
      const activeDateFilter =
        typeof overrideDateFilter === 'string' ? overrideDateFilter : notesDateFilter;
      await exportNotesExcel({
        sdm: isSdm ? userName : notesSdmFilter !== 'All' ? notesSdmFilter : undefined,
        rdm: isRdm ? userName : undefined,
        fse: isFse ? userName : undefined,
        role: currentUser?.role,
        user_role: currentUser?.role,
        user_state: isRdm || isSuperuser ? undefined : stateInfo?.code,
        is_superuser: isSuperuser ? 'true' : 'false',
        search: notesSearch.trim() || undefined,
        category: notesCategoryFilter !== 'All' ? notesCategoryFilter : undefined,
        priority: notesPriorityFilter !== 'All' ? notesPriorityFilter : undefined,
        status: notesFilter !== 'All' ? notesFilter : undefined,
        date_filter: activeDateFilter !== 'All' ? activeDateFilter : undefined,
        start_date: activeDateFilter === 'custom' && notesStartDate ? notesStartDate : undefined,
        end_date: activeDateFilter === 'custom' && notesEndDate ? notesEndDate : undefined
      });
    } catch (err) {
      console.error('Failed to export notes:', err);
    } finally {
      setExportingNotes(false);
    }
  };

  // Submit WhatsApp Field Intel
  const handleWhatsAppSubmit = async (e) => {
    e.preventDefault();
    if (!waForm.raw_message.trim()) return;
    const payload = {
      ...waForm,
      site_id: (waForm.site_id || 'UNKNOWN').trim().toUpperCase()
    };

    if (isOnline && serverReachable) {
      try {
        await createWhatsAppMessage(payload);
        setWaForm({ ...waForm, site_id: '', raw_message: '' });
        setSyncMessage({ type: 'success', text: 'WhatsApp field report logged!' });
        loadLiveFeeds(false);
        setTimeout(() => setSyncMessage(null), 3000);
        return;
      } catch (err) {
        console.warn('Failed online WA log, saving offline:', err);
      }
    }

    saveOfflineWhatsApp(payload);
    refreshQueues();
    setWaForm({ ...waForm, site_id: '', raw_message: '' });
    setSyncMessage({ type: 'warning', text: 'Queued offline for sync.' });
    setTimeout(() => setSyncMessage(null), 3000);
  };

  // Sync Offline Queue
  const handleSyncOfflineQueue = async () => {
    setIsSyncing(true);
    try {
      const healthy = await checkServerHealth();
      setServerReachable(healthy);
      if (!healthy) {
        setSyncMessage({ type: 'error', text: 'Server unreachable. Check connection.' });
        return;
      }

      let syncedCount = 0;
      for (const n of getPendingNotes()) {
        try {
          const fd = new FormData();
          fd.append('site_id_input', n.site_id_input || n.site || 'GENERAL');
          fd.append('title', n.title || 'Offline Field Note');
          fd.append('description', n.description || n.comment || '');
          fd.append('category', n.category || 'General');
          fd.append('priority', n.priority || 'Medium');
          fd.append('status', n.status || 'Open');
          fd.append('tower_co', n.tower_co || 'IHS');
          if (n.created_at) fd.append('created_at', n.created_at);
          fd.append('created_by', n.created_by || defaultAuthor);
          if (isRdm && userName) fd.append('rdm', userName);
          if (currentUser?.role) fd.append('role', currentUser.role);
          await createNote(fd);
          removePendingNote(n.local_id);
          syncedCount++;
        } catch (e) {
          console.error(e);
        }
      }
      for (const w of getPendingWhatsApp()) {
        try {
          const { local_id, status_sync, ...clean } = w;
          await createWhatsAppMessage(clean);
          removePendingWhatsApp(local_id);
          syncedCount++;
        } catch (e) {
          console.error(e);
        }
      }
      for (const a of getPendingFseAudits()) {
        try {
          const fd = new FormData();
          fd.append('site_id_input', a.site_id || 'GENERAL');
          fd.append('title', `FSE Performance Audit - ${a.fse_name}`);
          fd.append('description', `[FSE AUDIT: ${a.fse_name}] Rating: ${a.rating} — ${a.observation}`);
          fd.append('category', 'General');
          fd.append('priority', 'Medium');
          fd.append('status', 'Open');
          fd.append('created_by', defaultAuthor);
          await createNote(fd);
          removePendingFseAudit(a.local_id);
          syncedCount++;
        } catch (e) {
          console.error(e);
        }
      }

      refreshQueues();
      await Promise.all([loadLiveFeeds(false), loadAllNotes(), loadSitesInventory()]);
      setSyncMessage({
        type: 'success',
        text: syncedCount > 0 ? `Synced ${syncedCount} offline items!` : 'All data up to date.'
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 3500);
    }
  };

  // AI Assistant Query
  const handleSendAiPrompt = async (customText = null) => {
    const prompt = (customText || aiInput).trim();
    if (!prompt) return;
    setAiMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    if (!customText) setAiInput('');
    setAiLoading(true);
    try {
      const match = prompt.match(/(IHS_[A-Z0-9_]+|T\d{3,6}|FC\d{3,6})/i);
      const siteId = match ? match[0].toUpperCase() : (selectedSite?.ihs_site_id || selectedSite?.mtn_id || '');
      const res = await queryAIAssistant(prompt, siteId, 'chat');
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.response || res.answer || 'Diagnostic completed.' }
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Unable to reach AI Engine right now. Check connection or try again.' }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Open Quick Note for a specific site
  const openQuickNoteForSite = (siteId) => {
    setNoteForm((prev) => ({
      ...prev,
      site: siteId || '',
      title: `Field Update - ${siteId || ''}`,
      author: defaultAuthor
    }));
    setNoteIncidentTime(toLocalISOString());
    setSelectedSite(null);
    setActiveTab('field_log');
    setFieldLogMode('notes');
    setShowNoteComposer(true);
    captureGpsLocation();
  };

  // Open AI RCA for a specific site
  const openAiForSite = (siteId) => {
    setSelectedSite(null);
    setActiveTab('map_ai');
    setMapAiMode('ai');
    handleSendAiPrompt(`Give me full status, power setup, FSE/EFS contact, and RCA for site ${siteId}`);
  };

  const pendingTotal = getPendingTotalCount();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 select-none">
      {/* STICKY MOBILE APP BAR */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/80 px-3.5 py-2.5">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          {/* Left: Brand / User Avatar & Territory Status */}
          <div className="flex items-center gap-2.5 min-w-0">
            {currentUser?.avatar_url ? (
              <img
                src={getMediaUrl(currentUser.avatar_url)}
                alt={userName || 'SDM'}
                onClick={() => setShowSettingsSheet(true)}
                className="w-9 h-9 rounded-xl object-cover shadow-md shrink-0 border-2 border-[#FFCC00] cursor-pointer"
              />
            ) : (
              <div
                onClick={() => setShowSettingsSheet(true)}
                className="w-9 h-9 rounded-xl bg-[#FFCC00] text-black font-black text-xs flex items-center justify-center shadow-md shrink-0 border border-amber-300 cursor-pointer"
              >
                MTN
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-sm text-white truncate tracking-tight">
                  {stateInfo.shortName || 'SDM'} Field Ops
                </h1>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline && serverReachable
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                  title={isOnline && serverReachable ? 'Connected to Live Server' : 'Offline Mode'}
                />
              </div>
              <p className="text-[10px] text-slate-400 truncate font-medium">
                {userName || 'SDM Engineer'} • {currentUser?.role || 'Operations'}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {pendingTotal > 0 && (
              <button
                onClick={handleSyncOfflineQueue}
                disabled={isSyncing}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-black flex items-center gap-1 animate-pulse"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{pendingTotal}</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('sites')}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 active:scale-95"
              title="Search Site Inventory & IHS Matrix"
            >
              <Search className="w-4 h-4 text-cyan-400" />
            </button>

            <button
              onClick={() => {
                loadLiveFeeds(true);
                loadAllNotes();
                loadSitesInventory();
              }}
              disabled={loadingFeeds || dbLoading || loadingNotes}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 active:scale-95"
              title="Refresh Live Telemetry"
            >
              <RefreshCw
                className={`w-4 h-4 text-cyan-400 ${
                  loadingFeeds || dbLoading || loadingNotes ? 'animate-spin' : ''
                }`}
              />
            </button>

            <button
              onClick={() => setShowSettingsSheet(true)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 active:scale-95 relative"
              title="Settings & Account"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#FFCC00]" />
            </button>
          </div>
        </div>

        {/* Toast Notification Banner */}
        {syncMessage && (
          <div
            className={`max-w-lg mx-auto mt-2 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between border ${
              syncMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
                : syncMessage.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-300'
                  : 'bg-rose-950/90 border-rose-500/40 text-rose-300'
            }`}
          >
            <span className="truncate">{syncMessage.text}</span>
            <button onClick={() => setSyncMessage(null)} className="ml-2 text-slate-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* MAIN MOBILE CONTENT AREA */}
      <main className="flex-1 w-full max-w-lg mx-auto px-3.5 pt-3 pb-6 space-y-4">
        {/* ============================================================
            TAB 1: HOME OVERVIEW
        ============================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* 2x2 Touch KPI Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => {
                  setSitesMode('inventory');
                  setSiteStatus('All');
                  setActiveTab('sites');
                }}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Site Inventory
                  </span>
                  <Database className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-black text-white mt-1 font-mono">
                  {summaryStats.total.toLocaleString()}
                </div>
                <div className="text-[10px] text-cyan-400 font-semibold mt-0.5 flex items-center gap-0.5">
                  <span>Sites & IHS Matrix</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              <button
                onClick={() => {
                  setSiteStatus('Down');
                  setDbPage(1);
                  setActiveTab('sites');
                }}
                className="p-3.5 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Down Sites</span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-black text-rose-400 mt-1 font-mono">
                  {summaryStats.down.toLocaleString()}
                </div>
                <div className="text-[10px] text-rose-300/80 font-semibold mt-0.5 flex items-center gap-0.5">
                  <span>Dispatch FSE / EFS</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              <button
                onClick={() => {
                  setSitePriority('P1');
                  setDbPage(1);
                  setActiveTab('sites');
                }}
                className="p-3.5 rounded-2xl bg-amber-950/25 border border-amber-500/30 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Critical P1</span>
                  <Zap className="w-4 h-4 text-[#FFCC00]" />
                </div>
                <div className="text-2xl font-black text-[#FFCC00] mt-1 font-mono">
                  {summaryStats.p1.toLocaleString()}
                </div>
                <div className="text-[10px] text-amber-300/80 font-semibold mt-0.5 flex items-center gap-0.5">
                  <span>Priority hubs</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              <button
                onClick={() => {
                  setFieldLogMode('notes');
                  setActiveTab('field_log');
                }}
                className="p-3.5 rounded-2xl bg-cyan-950/25 border border-cyan-500/30 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">SDM Notes</span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-black text-cyan-300 mt-1 font-mono">
                  {summaryStats.allNotesCount.toLocaleString()}
                </div>
                <div className="text-[10px] text-cyan-300/80 font-semibold mt-0.5 flex items-center gap-0.5">
                  <span>{summaryStats.openNotes} Open • View all</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </button>
            </div>

            {/* Daily Availability SLA Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 shadow-lg">
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#FFCC00] block">
                    Network Availability SLA
                  </span>
                  <h2 className="text-xs text-slate-400 font-medium truncate">
                    {availStats?.date_range || availStats?.active_filename || 'Active Daily Availability'}
                  </h2>
                </div>
                <button
                  onClick={() => setActiveTab('availability')}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center gap-1 active:scale-95 shrink-0"
                >
                  <span>Full SLA</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">OVERALL</div>
                  <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">
                    {availStats?.overall_avg != null
                      ? `${Number(availStats.overall_avg).toFixed(2)}%`
                      : '98.4%'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">2G</div>
                  <div className="text-sm font-black text-cyan-300 font-mono mt-0.5">
                    {availStats?.tech_breakdown?.['2G']?.avg != null
                      ? `${Number(availStats.tech_breakdown['2G'].avg).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">3G</div>
                  <div className="text-sm font-black text-indigo-300 font-mono mt-0.5">
                    {availStats?.tech_breakdown?.['3G']?.avg != null
                      ? `${Number(availStats.tech_breakdown['3G'].avg).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 font-bold">4G LTE</div>
                  <div className="text-sm font-black text-[#FFCC00] font-mono mt-0.5">
                    {availStats?.tech_breakdown?.['4G']?.avg != null
                      ? `${Number(availStats.tech_breakdown['4G'].avg).toFixed(1)}%`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Quick Field Action Buttons */}
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => {
                  setActiveTab('field_log');
                  setFieldLogMode('notes');
                  setShowNoteComposer(true);
                  captureGpsLocation();
                }}
                className="p-3 rounded-2xl bg-cyan-600/20 border border-cyan-500/40 flex flex-col items-center justify-center gap-1.5 active:scale-95"
              >
                <PlusCircle className="w-5 h-5 text-cyan-400" />
                <span className="text-[10px] font-bold text-cyan-200 text-center leading-tight">Log Note</span>
              </button>

              <button
                onClick={() => {
                  setSitesMode('ihs_matrix');
                  setDbPage(1);
                  setActiveTab('sites');
                }}
                className="p-3 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex flex-col items-center justify-center gap-1.5 active:scale-95"
              >
                <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                <span className="text-[10px] font-bold text-purple-200 text-center leading-tight">IHS Matrix</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('field_log');
                  setFieldLogMode('fse');
                }}
                className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col items-center justify-center gap-1.5 active:scale-95"
              >
                <UserCheck className="w-5 h-5 text-[#FFCC00]" />
                <span className="text-[10px] font-bold text-amber-200 text-center leading-tight">FSE Directory</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('map_ai');
                  setMapAiMode('ai');
                }}
                className="p-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex flex-col items-center justify-center gap-1.5 active:scale-95"
              >
                <Bot className="w-5 h-5 text-indigo-400" />
                <span className="text-[10px] font-bold text-indigo-200 text-center leading-tight">Ask AI</span>
              </button>
            </div>

            {/* Priority / Down Sites Quick Dispatch */}
            {urgentSites.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Priority Site Dispatch</span>
                  </h3>
                  <button
                    onClick={() => setActiveTab('sites')}
                    className="text-[11px] font-bold text-cyan-400"
                  >
                    All Sites ({summaryStats.total.toLocaleString()})
                  </button>
                </div>

                <div className="space-y-2">
                  {urgentSites.map((s) => {
                    const raw = s.raw_data || {};
                    const siteId = s.ihs_site_id || s.mtn_id || 'SITE';
                    const fseName = s.smc_fse_name || raw['FSE NAME'] || 'Unassigned';
                    const fsePhone = s.smc_fse_phone || raw['FSE CONTACT NO.'] || s.efs_phone || s.sdm_phone;
                    const waPhone = formatWhatsAppPhone(fsePhone);
                    const isDown = s.is_down || s.operational_status === 'Down';

                    return (
                      <div
                        key={s.id || siteId}
                        className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div
                          onClick={() => setSelectedSite(s)}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-white">{siteId}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                                isDown
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {s.operational_status || 'Operational'}
                            </span>
                            {s.priority && (
                              <span className="text-[9px] font-mono text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                                {s.priority}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {s.cluster_name || s.site_address || s.lga || 'FCT'}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            FSE: <span className="text-slate-300 font-semibold">{fseName}</span>
                            {s.efs_name ? ` • EFS: ${s.efs_name}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {fsePhone && (
                            <a
                              href={`tel:${fsePhone}`}
                              className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 active:scale-95"
                              title="Call FSE / EFS"
                            >
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                          {waPhone && (
                            <a
                              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                `Hello ${fseName}, requesting urgent field status update on Site ${siteId} (${s.cluster_name || s.site_address || ''}).`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 active:scale-95"
                              title="WhatsApp FSE"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedSite(s)}
                            className="p-2.5 rounded-xl bg-slate-800 text-slate-300 active:scale-95"
                            title="Inspect Site"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Uploaded Files & Site Photo Evidence Strip */}
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#FFCC00]" />
                  <span>Uploaded Files &amp; Site Evidence Photos</span>
                </span>
                <button
                  onClick={() => {
                    setFieldLogMode('notes');
                    setNotesWithPhotosOnly(true);
                    setShowPhotosGallery(true);
                    setActiveTab('field_log');
                  }}
                  className="text-[11px] font-bold text-[#FFCC00] flex items-center gap-0.5"
                >
                  <span>All {allUploadedPhotos.length} Photos</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Uploaded Datasets Summary Pills */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <button
                  onClick={() => setActiveTab('availability')}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-left flex items-center gap-2 active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block font-bold">SLA Uploaded Files ({availArchives.length || 50})</span>
                    <span className="text-emerald-300 font-mono font-bold truncate block">
                      {availStats?.active_filename || availArchives[0]?.filename || '2026-10-24.xlsb'}
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => setActiveTab('sites')}
                  className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-left flex items-center gap-2 active:scale-95"
                >
                  <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-slate-400 block font-bold">Active WSD Master File</span>
                    <span className="text-cyan-300 font-mono font-bold truncate block">
                      {wsdStatus?.active_filename || 'WSD October 2026 v1.0.xlsx'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Uploaded Site Evidence Photos Horizontal Carousel */}
              {allUploadedPhotos.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                  {allUploadedPhotos.slice(0, 14).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLightboxImage(item.url)}
                      className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-700 shrink-0 group active:scale-95"
                    >
                      <img
                        src={item.url}
                        alt={item.siteCode}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-[9px] font-mono font-bold text-cyan-300 truncate">
                        {item.siteCode}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent SDM Operational Notes Stream */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Recent SDM Notes ({summaryStats.allNotesCount.toLocaleString()})
                </h3>
                <button
                  onClick={() => {
                    setFieldLogMode('notes');
                    setActiveTab('field_log');
                  }}
                  className="text-[11px] font-bold text-cyan-400"
                >
                  View All ({summaryStats.allNotesCount.toLocaleString()})
                </button>
              </div>

              {liveNotes.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center text-xs text-slate-500">
                  {loadingNotes ? 'Loading SDM operational notes...' : 'No SDM notes found for this filter.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {liveNotes.slice(0, 5).map((n) => {
                    const siteCode = n.site_ihs_id || n.site_id_str || n.site || 'GENERAL';
                    const bodyText = n.description || n.comment || '';
                    const creator = n.created_by || n.author || 'SDM';
                    const photos = n.attachments || n.photos || [];
                    return (
                      <div
                        key={n.id}
                        className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-black text-xs text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-500/30 shrink-0">
                              {siteCode}
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {n.title || n.category}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                              n.status === 'Resolved'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {n.status || 'Open'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">{bodyText}</p>
                        {Array.isArray(photos) && photos.length > 0 && (
                          <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                            {photos.map((ph, i) => {
                              const imgUrl = getMediaUrl(ph.file || ph.image || ph.photo_url);
                              return (
                                <button
                                  key={ph.id || i}
                                  type="button"
                                  onClick={() => setLightboxImage(imgUrl)}
                                  className="w-14 h-14 rounded-lg overflow-hidden border border-slate-700 shrink-0"
                                >
                                  <img src={imgUrl} alt="Evidence" loading="lazy" className="w-full h-full object-cover" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400">
                          <span className="truncate">
                            By <b className="text-slate-200">{creator}</b> •{' '}
                            {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                          </span>
                          {n.status !== 'Resolved' && (
                            <button
                              onClick={() => handleQuickResolveNote(n)}
                              className="text-emerald-400 font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 shrink-0"
                            >
                              <Check className="w-3 h-3" /> Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 2: SITE INVENTORY & IHS MATRIX DATABASE
        ============================================================ */}
        {activeTab === 'sites' && (
          <div className="space-y-3">
            {/* Segmented Mode Switcher: Site Inventory vs IHS Matrix Directory */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => {
                  setSitesMode('inventory');
                  setDbPage(1);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  sitesMode === 'inventory'
                    ? 'bg-[#FFCC00] text-black shadow'
                    : 'text-slate-400'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Site Inventory</span>
              </button>
              <button
                onClick={() => {
                  setSitesMode('ihs_matrix');
                  setDbPage(1);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  sitesMode === 'ihs_matrix'
                    ? 'bg-[#FFCC00] text-black shadow'
                    : 'text-slate-400'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>IHS Matrix DB</span>
              </button>
            </div>

            {/* Header Counter & Filter Toggle */}
            <div className="flex items-center justify-between px-1">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono text-[11px]">
                  {dbTotalCount.toLocaleString()} Sites
                </span>
                <span className="text-slate-400 text-[11px]">
                  {sitesMode === 'ihs_matrix' ? 'IHS Matrix Records' : 'Unified Site Database'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowSiteFilters(!showSiteFilters)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 border ${
                    showSiteFilters
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-900 text-slate-300 border-slate-800'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>Filters</span>
                </button>
                <button
                  onClick={handleResetSiteFilters}
                  className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={siteSearch}
                onChange={(e) => {
                  setSiteSearch(e.target.value);
                  setDbPage(1);
                }}
                placeholder="Search IHS ID (IHS_ABJ_0001A), MTN ID (FC2063), EFS, FSE, Cluster..."
                className="w-full bg-slate-900 text-xs text-white pl-10 pr-9 py-2.5 rounded-2xl border border-slate-700/80 focus:outline-none focus:border-cyan-400 font-mono"
              />
              {siteSearch && (
                <button
                  onClick={() => {
                    setSiteSearch('');
                    setDbPage(1);
                  }}
                  className="absolute right-3 top-2.5 text-slate-400 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Status & Priority Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { id: 'All', label: 'All Status' },
                { id: 'Down', label: '🔴 Down' },
                { id: 'Operational', label: '🟢 Operational' }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setSiteStatus(st.id);
                    setDbPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                    siteStatus === st.id
                      ? 'bg-[#FFCC00] text-black font-black'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              {['P1', 'P2', 'P3'].map((pr) => (
                <button
                  key={pr}
                  onClick={() => {
                    setSitePriority(sitePriority === pr ? 'All' : pr);
                    setDbPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold whitespace-nowrap ${
                    sitePriority === pr
                      ? 'bg-cyan-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>

            {/* Collapsible Advanced Filter Dropdowns (State, LGA, SDM, FSE, RDM) */}
            {showSiteFilters && (
              <div className="p-3.5 rounded-2xl bg-slate-900/95 border border-cyan-500/30 grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">State</label>
                  <select
                    value={siteStateFilter}
                    onChange={(e) => {
                      setSiteStateFilter(e.target.value);
                      setDbPage(1);
                    }}
                    className="w-full bg-slate-950 text-white text-xs p-2 rounded-xl border border-slate-700"
                  >
                    <option value="All">All States ({filterOptions.states.length})</option>
                    {filterOptions.states.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">LGA</label>
                  <select
                    value={siteLgaFilter}
                    onChange={(e) => {
                      setSiteLgaFilter(e.target.value);
                      setDbPage(1);
                    }}
                    className="w-full bg-slate-950 text-white text-xs p-2 rounded-xl border border-slate-700"
                  >
                    <option value="All">All LGAs ({filterOptions.lgas.length})</option>
                    {filterOptions.lgas.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">SDM Manager</label>
                  <select
                    value={siteSdmFilter}
                    disabled={isSdm}
                    onChange={(e) => {
                      setSiteSdmFilter(e.target.value);
                      setDbPage(1);
                    }}
                    className="w-full bg-slate-950 text-white text-xs p-2 rounded-xl border border-slate-700"
                  >
                    {isSdm ? (
                      <option value={userName}>{userName}</option>
                    ) : (
                      <>
                        <option value="All">All SDMs ({filterOptions.sdm_names.length})</option>
                        {filterOptions.sdm_names.map((sdm) => (
                          <option key={sdm} value={sdm}>{sdm}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">SMC FSE Engineer</label>
                  <select
                    value={siteFseFilter}
                    disabled={isFse}
                    onChange={(e) => {
                      setSiteFseFilter(e.target.value);
                      setDbPage(1);
                    }}
                    className="w-full bg-slate-950 text-white text-xs p-2 rounded-xl border border-slate-700"
                  >
                    {isFse ? (
                      <option value={userName}>{userName}</option>
                    ) : (
                      <>
                        <option value="All">All FSEs ({filterOptions.fse_names.length})</option>
                        {filterOptions.fse_names.map((fse) => (
                          <option key={fse} value={fse}>{fse}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Loading State */}
            {dbLoading ? (
              <div className="p-10 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-300">
                  Loading {sitesMode === 'ihs_matrix' ? 'IHS Matrix Directory' : 'Site Inventory'}...
                </p>
              </div>
            ) : dbSites.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
                <Radio className="w-7 h-7 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-300">No matching sites found</p>
                <p className="text-[11px] text-slate-500">Tap Reset to clear active filters.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {dbSites.map((s) => {
                  const raw = s.raw_data || {};
                  const primaryId = s.ihs_site_id || s.mtn_id || 'UNKNOWN';
                  const altId =
                    s.mtn_id && s.mtn_id !== primaryId
                      ? s.mtn_id
                      : s.ihs_site_id && s.ihs_site_id !== primaryId
                        ? s.ihs_site_id
                        : '';
                  const towerCo = s.tower_co || raw['Tower Co'] || 'IHS';
                  const smcVendor = s.smc || raw['SMC'] || 'IHS';
                  const clusterName = s.cluster_name || raw['Cluster Name(SMC)'] || s.hvc_cluster || 'N/A';
                  const isDown = Boolean(s.is_down || s.operational_status === 'Down');
                  const statusLabel = s.operational_status || (isDown ? 'Down' : 'Operational');
                  const priorityLabel = s.priority || 'P2';
                  const sdmName = s.sdm_name || raw['SDM NAME'] || 'State Delivery Manager';
                  const efsName = s.efs_name || raw['EFS Name'] || '';
                  const efsPhone = s.efs_phone || raw['EFS Number'] || '';
                  const rtoName = s.rto_name || raw['RTO Name'] || '';
                  const rtoPhone = s.rto_phone || raw['RTO Number'] || '';
                  const fseName = s.smc_fse_name || raw['FSE NAME'] || 'Unassigned';
                  const fsePhone = s.smc_fse_phone || raw['FSE CONTACT NO.'] || '';
                  const powerSol = s.power_solution || raw['Power Solution'] || '-';
                  const dgCap = s.dg_capacity || s.dg_1_kva || raw['DG CAP'] || '';

                  const dialPhone = fsePhone || efsPhone || rtoPhone || s.sdm_phone;
                  const waPhone = formatWhatsAppPhone(dialPhone);

                  return (
                    <div
                      key={s.id || primaryId}
                      className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                        isDown
                          ? 'bg-rose-950/20 border-rose-500/40'
                          : 'bg-slate-900/90 border-slate-800/90'
                      }`}
                    >
                      {/* Top Header: Site ID + MTN ID + TowerCo/SMC + Status/Priority */}
                      <div
                        onClick={() => {
                          setSelectedSite(s);
                          setShowRawMatrixSpecs(false);
                        }}
                        className="flex items-start justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-sm text-cyan-300">{primaryId}</span>
                            {altId && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {altId}
                              </span>
                            )}
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-bold rounded border border-purple-500/30">
                              {towerCo} ({smcVendor})
                            </span>
                          </div>
                          <div className="text-xs font-bold text-emerald-300 truncate mt-1">
                            Cluster: {clusterName}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {s.site_address || s.lga || 'FCT'} • {s.state || 'FCT'} ({s.region || 'Abuja'})
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              isDown
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {statusLabel}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                              priorityLabel === 'P1'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-[#FFCC00] border border-amber-500/30'
                            }`}
                          >
                            {priorityLabel}
                          </span>
                        </div>
                      </div>

                      {/* Middle Grid: SDM, EFS (IHS Matrix), SMC FSE, Power/DG */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                        <div className="truncate">
                          <span className="text-slate-500 block text-[9px] uppercase font-bold">SMC FSE Engineer</span>
                          <span className="text-purple-200 font-bold truncate block">{fseName}</span>
                          {fsePhone && <span className="text-[10px] font-mono text-emerald-400">{fsePhone}</span>}
                        </div>

                        <div className="truncate">
                          <span className="text-slate-500 block text-[9px] uppercase font-bold">
                            EFS Contact (IHS Matrix)
                          </span>
                          <span className="text-white font-bold truncate block">{efsName || rtoName || '-'}</span>
                          {(efsPhone || rtoPhone) && (
                            <span className="text-[10px] font-mono text-cyan-300">{efsPhone || rtoPhone}</span>
                          )}
                        </div>

                        <div className="truncate">
                          <span className="text-slate-500 block text-[9px] uppercase font-bold">SDM Manager</span>
                          <span className="text-cyan-300 font-semibold truncate block">{sdmName}</span>
                        </div>

                        <div className="truncate">
                          <span className="text-slate-500 block text-[9px] uppercase font-bold">Power & DG Cap</span>
                          <span className="text-slate-200 font-semibold truncate block">
                            {powerSol} {dgCap ? `(${dgCap})` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: 1-Tap Call FSE / Call EFS / WhatsApp / Specs & Note */}
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        {fsePhone && (
                          <a
                            href={`tel:${fsePhone}`}
                            className="flex-1 min-w-[85px] py-2 px-2 rounded-xl bg-purple-600/25 border border-purple-500/40 text-purple-200 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call FSE</span>
                          </a>
                        )}
                        {efsPhone && (
                          <a
                            href={`tel:${efsPhone}`}
                            className="flex-1 min-w-[85px] py-2 px-2 rounded-xl bg-emerald-600/25 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call EFS</span>
                          </a>
                        )}
                        {waPhone && (
                          <a
                            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                              `Hi, checking status on Site ${primaryId} (${clusterName}).`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 px-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WA</span>
                          </a>
                        )}
                        <button
                          onClick={() => openQuickNoteForSite(primaryId)}
                          className="py-2 px-2.5 rounded-xl bg-slate-800 text-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-[#FFCC00]" />
                          <span>Note</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSite(s);
                            setShowRawMatrixSpecs(false);
                          }}
                          className="py-2 px-2.5 rounded-xl bg-slate-800 text-cyan-300 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
                        >
                          <Database className="w-3.5 h-3.5" />
                          <span>Specs</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Server-Side Pagination Controls */}
            {totalDbPages > 1 && (
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <button
                  onClick={() => setDbPage((p) => Math.max(1, p - 1))}
                  disabled={dbPage === 1}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 font-bold disabled:opacity-40 flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <span className="font-mono text-cyan-300 font-bold">
                  Page {dbPage} of {totalDbPages.toLocaleString()}
                </span>
                <button
                  onClick={() => setDbPage((p) => Math.min(totalDbPages, p + 1))}
                  disabled={dbPage === totalDbPages}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 font-bold disabled:opacity-40 flex items-center gap-1"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 3: MOBILE DAILY & HOURLY AVAILABILITY SLA
        ============================================================ */}
        {activeTab === 'availability' && (
          <div className="space-y-3">
            {/* Segmented Mode Switcher: Daily vs 24H Hourly */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setAvailMode('daily')}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  availMode === 'daily'
                    ? 'bg-[#FFCC00] text-black shadow'
                    : 'text-slate-400'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Daily Availability</span>
              </button>
              <button
                onClick={() => setAvailMode('hourly')}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                  availMode === 'hourly'
                    ? 'bg-[#FFCC00] text-black shadow'
                    : 'text-slate-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>24H Hourly SLA</span>
              </button>
            </div>

            {/* Uploaded SLA Files Selector & Uploader Bar */}
            <div className="p-3 rounded-2xl bg-slate-900/95 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-black text-slate-200 truncate">
                    {availMode === 'daily'
                      ? `Uploaded Daily SLA Files (${availArchives.length || 1})`
                      : `Active Hourly SLA: ${availStats?.active_filename || '2pm.xlsb'}`}
                  </span>
                </div>

                <label className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black flex items-center gap-1 cursor-pointer shrink-0 active:scale-95">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>{uploadingAvailFile ? 'Uploading...' : 'Upload .xlsb'}</span>
                  <input
                    type="file"
                    accept=".xlsb,.xlsx,.xls,.csv"
                    onChange={handleAvailFileUpload}
                    disabled={uploadingAvailFile}
                    className="hidden"
                  />
                </label>
              </div>

              {availMode === 'daily' && availArchives.length > 0 && (
                <select
                  value={selectedArchiveId}
                  onChange={(e) => setSelectedArchiveId(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-cyan-300 font-mono p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400"
                >
                  <option value="">
                    📂 Active: {availStats?.active_filename || availArchives[0]?.filename} ({availStats?.date_range || availArchives[0]?.date_range || 'Latest'})
                  </option>
                  {availArchives.map((arch) => (
                    <option key={arch.id} value={arch.id}>
                      📄 {arch.filename} • {arch.date_range || arch.month_str} ({arch.records_count?.toLocaleString() || 0} rows)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Compact SLA Summary Strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Network Avg</span>
                <span className="text-base font-black text-emerald-400 font-mono">
                  {availStats?.overall_avg != null
                    ? `${Number(availStats.overall_avg).toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-950/25 border border-rose-500/30 text-center">
                <span className="text-[9px] text-rose-300 font-bold uppercase block">&lt;95% Critical</span>
                <span className="text-base font-black text-rose-400 font-mono">
                  {availStats?.critical_breach_count ?? 0}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-950/25 border border-amber-500/30 text-center">
                <span className="text-[9px] text-amber-300 font-bold uppercase block">&lt;98.5% Breached</span>
                <span className="text-base font-black text-[#FFCC00] font-mono">
                  {availStats?.sla_breached_count ?? 0}
                </span>
              </div>
            </div>

            {/* Search & SLA Filter Pills */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={availSearch}
                  onChange={(e) => setAvailSearch(e.target.value)}
                  placeholder="Search Site ID, Element Name, LGA, Territory..."
                  className="w-full bg-slate-900 text-xs text-white pl-10 pr-8 py-2.5 rounded-2xl border border-slate-700/80 focus:outline-none focus:border-cyan-400 font-mono"
                />
                {availSearch && (
                  <button
                    onClick={() => setAvailSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: '', label: 'All SLA' },
                  { id: 'critical_under_95', label: '< 95% Critical' },
                  { id: 'degraded_under_98_5', label: '< 98.5% Degraded' },
                  { id: 'perfect_100', label: '100% Compliant' }
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setAvailBand(b.id)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                      availBand === b.id
                        ? 'bg-cyan-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}

                {['2G', '3G', '4G'].map((tech) => (
                  <button
                    key={tech}
                    onClick={() => setAvailTech(availTech === tech ? '' : tech)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-bold whitespace-nowrap ${
                      availTech === tech
                        ? 'bg-[#FFCC00] text-black font-black'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {tech}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability Mobile Cards */}
            {availLoading ? (
              <div className="p-8 text-center text-xs text-cyan-400 font-mono flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading SLA records...
              </div>
            ) : availRecords.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                No availability records match this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {availRecords.slice(0, 50).map((rec, idx) => {
                  const pct = Number(
                    rec.period_availability ?? rec.avg_availability ?? rec.latest_availability ?? 0
                  );
                  const isCrit = pct < 95;
                  const isWarn = pct >= 95 && pct < 98.5;
                  const dailyDict = rec.daily_scores && typeof rec.daily_scores === 'object' ? rec.daily_scores : {};
                  const dayKeys = Object.keys(dailyDict).sort().slice(-7);
                  const days = dayKeys.map((k) => ({ date: k, val: Number(dailyDict[k] ?? 0) }));

                  return (
                    <div
                      key={rec.id || `${rec.site_id}-${rec.tech}-${idx}`}
                      className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-sm text-white">
                              {rec.site_id}
                            </span>
                            {(rec.tech || rec.technology) && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300">
                                {rec.tech || rec.technology}
                              </span>
                            )}
                            {rec.tower_co && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/15 text-purple-300">
                                {rec.tower_co}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {rec.element_name || rec.lga || rec.territory || 'FCT'} • {rec.lga || rec.state || ''}
                          </p>
                        </div>

                        <div
                          className={`px-3 py-1 rounded-xl font-mono font-black text-sm shrink-0 border ${
                            isCrit
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : isWarn
                                ? 'bg-amber-500/20 text-[#FFCC00] border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {pct.toFixed(2)}%
                        </div>
                      </div>

                      {/* 7-Day Mini Trend Sparkbar */}
                      {days.length > 0 && (
                        <div className="flex items-end gap-1 h-6 pt-1">
                          {days.map((d, i) => {
                            const val = Math.max(8, Math.min(100, d.val));
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.val}%`}>
                                <div className="w-full bg-slate-800 rounded-sm h-4 flex items-end overflow-hidden">
                                  <div
                                    style={{ height: `${val}%` }}
                                    className={`w-full ${
                                      d.val < 95 ? 'bg-rose-500' : d.val < 98.5 ? 'bg-amber-400' : 'bg-emerald-400'
                                    }`}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/70">
                        <span>
                          Latest: <strong className="text-slate-200">{Number(rec.latest_availability ?? pct).toFixed(2)}%</strong>
                        </span>
                        <button
                          onClick={() => openQuickNoteForSite(rec.site_id)}
                          className="text-cyan-400 font-bold flex items-center gap-1"
                        >
                          <PlusCircle className="w-3 h-3" /> Log SLA Note
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 4: UNIFIED FIELD LOG (ALL SDM NOTES + WHATSAPP + FSE)
        ============================================================ */}
        {activeTab === 'field_log' && (
          <div className="space-y-3">
            {/* Segmented Mode Selector */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800">
              {[
                { id: 'notes', label: `SDM Notes (${notesTotalCount || liveNotes.length})` },
                { id: 'whatsapp', label: 'WA Intel' },
                { id: 'fse', label: 'FSE Check' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFieldLogMode(m.id)}
                  className={`py-2 rounded-xl text-xs font-extrabold transition-all ${
                    fieldLogMode === m.id
                      ? 'bg-[#FFCC00] text-black shadow'
                      : 'text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* SUB-MODE A: ALL SDM OPERATIONAL NOTES */}
            {fieldLogMode === 'notes' && (
              <div className="space-y-3">
                {/* Action Row: Record Note + Export Yesterday + Export Filtered Excel */}
                <div className="flex flex-wrap items-center gap-2">
                  {!showNoteComposer && (
                    <button
                      onClick={() => {
                        setNoteIncidentTime(toLocalISOString());
                        setShowNoteComposer(true);
                        captureGpsLocation();
                      }}
                      className="flex-1 min-w-[180px] py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-[0.99]"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>New SDM Note</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleExportNotes('yesterday')}
                    disabled={exportingNotes}
                    className="py-3 px-3 rounded-2xl bg-amber-950/80 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center gap-1.5 shrink-0"
                    title="Export Yesterday's Notes to Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingNotes ? '...' : "Yesterday's Excel"}</span>
                  </button>

                  <button
                    onClick={() => handleExportNotes()}
                    disabled={exportingNotes}
                    className="py-3 px-3 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 shrink-0"
                    title="Export Filtered Notes to Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingNotes ? '...' : 'Export Filtered'}</span>
                  </button>
                </div>

                {/* New SDM Note Composer (Exact Fields as Web NotesCenter.jsx) */}
                {showNoteComposer && (
                  <form
                    onSubmit={handleNoteSubmit}
                    className="p-4 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-3 shadow-xl"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                        <Camera className="w-4 h-4" /> Record New SDM Operational Note
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowNoteComposer(false)}
                        className="text-slate-400 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">
                          Site ID (IHS / MTN Code) <span className="text-cyan-400">(Auto-FSE)</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={noteForm.site}
                          onChange={(e) => setNoteForm({ ...noteForm, site: e.target.value.toUpperCase() })}
                          placeholder="e.g. IHS_ABJ_0001A"
                          className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Category</label>
                        <select
                          value={noteForm.category}
                          onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                        >
                          {noteCategories.filter((c) => c !== 'All').map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Note Title</label>
                      <input
                        type="text"
                        required
                        value={noteForm.title}
                        onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                        placeholder="e.g. Generator Overhaul Required / Fiber Cut"
                        className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-amber-400 block mb-1">
                        Incident / Occurrence Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={noteIncidentTime}
                        onChange={(e) => setNoteIncidentTime(e.target.value)}
                        className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-amber-500/40"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Priority</label>
                        <select
                          value={noteForm.priority}
                          onChange={(e) => setNoteForm({ ...noteForm, priority: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Status</label>
                        <select
                          value={noteForm.status}
                          onChange={(e) => setNoteForm({ ...noteForm, status: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                        >
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                          <option value="Escalated">Escalated</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Tower Co</label>
                        <select
                          value={noteForm.tower_co}
                          onChange={(e) => setNoteForm({ ...noteForm, tower_co: e.target.value })}
                          className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                        >
                          <option value="IHS">IHS Towers</option>
                          <option value="ATC">ATC</option>
                          <option value="PAT">PAT</option>
                          <option value="MTN">MTN Direct</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Logged By (Author)</label>
                      <input
                        type="text"
                        required
                        value={noteForm.author}
                        onChange={(e) => setNoteForm({ ...noteForm, author: e.target.value })}
                        placeholder="SDM / RDM Name"
                        className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">
                        Description & Operational Context
                      </label>
                      <textarea
                        rows={4}
                        required
                        value={noteForm.comment}
                        onChange={(e) => setNoteForm({ ...noteForm, comment: e.target.value })}
                        placeholder="Provide full details of the site issue, root cause, action required, and FSE assigned..."
                        className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                      />
                    </div>

                    {/* Camera, Gallery & GPS Strip */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <label className="py-2 px-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-[11px] font-bold text-cyan-300 flex items-center justify-center gap-1 cursor-pointer">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Camera</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>

                      <label className="py-2 px-2 rounded-xl bg-slate-950 border border-purple-500/40 text-[11px] font-bold text-purple-300 flex items-center justify-center gap-1 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Gallery ({notePhotos.length})</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={captureGpsLocation}
                        className="py-2 px-2 rounded-xl bg-slate-950 border border-slate-700 text-[11px] font-mono text-emerald-300 flex items-center justify-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{gettingGps ? 'GPS...' : gpsCoords ? 'GPS OK' : 'Tag GPS'}</span>
                      </button>
                    </div>

                    {notePhotos.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1">
                        {notePhotos.map((p, idx) => (
                          <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-cyan-500/40 shrink-0">
                            <img src={p.dataUrl} alt="Preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setNotePhotos((prev) => prev.filter((_, i) => i !== idx))}
                              className="absolute top-0.5 right-0.5 bg-black/80 text-white rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNoteComposer(false)}
                        className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-3 rounded-xl bg-[#FFCC00] text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Save SDM Note</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Search & Filters for SDM Notes */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={notesSearch}
                      onChange={(e) => setNotesSearch(e.target.value)}
                      placeholder="Search by Site ID, Title, FSE, Author, or Description..."
                      className="w-full bg-slate-900 text-xs text-white pl-10 pr-8 py-2.5 rounded-2xl border border-slate-700/80"
                    />
                    {notesSearch && (
                      <button
                        onClick={() => setNotesSearch('')}
                        className="absolute right-3 top-2.5 text-slate-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Status, With Photos & Gallery Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {['All', 'Open', 'In Progress', 'Resolved', 'Escalated'].map((st) => (
                      <button
                        key={st}
                        onClick={() => {
                          setNotesFilter(st);
                          setNotesPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap ${
                          notesFilter === st && !notesWithPhotosOnly
                            ? 'bg-cyan-500 text-slate-950 font-black'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {st === 'All' ? `All (${liveNotes.length})` : st}
                      </button>
                    ))}

                    <button
                      onClick={() => {
                        setNotesWithPhotosOnly(!notesWithPhotosOnly);
                        setNotesPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1 ${
                        notesWithPhotosOnly
                          ? 'bg-[#FFCC00] text-black font-black shadow'
                          : 'bg-slate-900 text-cyan-300 border border-cyan-500/40'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>With Photos ({notesWithPhotosList.length})</span>
                    </button>

                    <button
                      onClick={() => setShowPhotosGallery(!showPhotosGallery)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1 ${
                        showPhotosGallery
                          ? 'bg-purple-500 text-white font-black shadow'
                          : 'bg-slate-900 text-purple-300 border border-purple-500/40'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Photo Grid ({allUploadedPhotos.length})</span>
                    </button>
                  </div>

                  {/* Secondary Dropdowns: Date, Category, Priority, and SDM Manager */}
                  <div className={`grid ${(isSuperuser || isRdm) ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 text-[11px]`}>
                    <select
                      value={notesDateFilter}
                      onChange={(e) => {
                        setNotesDateFilter(e.target.value);
                        if (e.target.value !== 'custom') {
                          setNotesStartDate('');
                          setNotesEndDate('');
                        }
                      }}
                      className="bg-slate-900 text-amber-200 px-2 py-1.5 rounded-xl border border-amber-500/30 font-semibold"
                    >
                      <option value="All">📅 All Dates</option>
                      <option value="yesterday">📅 Yesterday's Notes</option>
                      <option value="today">📅 Today's Notes</option>
                      <option value="7days">📅 Last 7 Days</option>
                      <option value="30days">📅 Last 30 Days</option>
                      <option value="custom">🗓️ Custom Date Range</option>
                    </select>

                    <select
                      value={notesCategoryFilter}
                      onChange={(e) => setNotesCategoryFilter(e.target.value)}
                      className="bg-slate-900 text-slate-200 px-2 py-1.5 rounded-xl border border-slate-800 font-semibold"
                    >
                      {noteCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'All' ? 'All Categories' : cat}
                        </option>
                      ))}
                    </select>

                    <select
                      value={notesPriorityFilter}
                      onChange={(e) => setNotesPriorityFilter(e.target.value)}
                      className="bg-slate-900 text-slate-200 px-2 py-1.5 rounded-xl border border-slate-800 font-semibold"
                    >
                      <option value="All">All Priorities</option>
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>

                    {(isSuperuser || isRdm) && (
                      <select
                        value={notesSdmFilter}
                        onChange={(e) => setNotesSdmFilter(e.target.value)}
                        className="bg-slate-900 text-indigo-200 px-2 py-1.5 rounded-xl border border-indigo-500/30 font-semibold"
                      >
                        <option value="All">All SDM Managers</option>
                        {filterOptions.sdm_names.map((sdm) => (
                          <option key={sdm} value={sdm}>{sdm}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Custom Date Range Pickers (Matching Web NotesCenter.jsx) */}
                  {notesDateFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-2xl bg-slate-900 border border-amber-500/30">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">From Date</label>
                        <input
                          type="date"
                          value={notesStartDate}
                          onChange={(e) => setNotesStartDate(e.target.value)}
                          className="w-full bg-slate-950 text-xs text-white px-2.5 py-1.5 rounded-xl border border-slate-700"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">To Date</label>
                        <input
                          type="date"
                          value={notesEndDate}
                          onChange={(e) => setNotesEndDate(e.target.value)}
                          className="w-full bg-slate-950 text-xs text-white px-2.5 py-1.5 rounded-xl border border-slate-700"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Collapsible 3-Column Site Evidence Photo Gallery */}
                {showPhotosGallery && allUploadedPhotos.length > 0 && (
                  <div className="p-3 rounded-2xl bg-slate-900/95 border border-purple-500/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-purple-200 flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-[#FFCC00]" />
                        <span>All Uploaded Site Evidence Photos ({allUploadedPhotos.length})</span>
                      </span>
                      <button
                        onClick={() => setShowPhotosGallery(false)}
                        className="text-[11px] font-bold text-slate-400"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-0.5">
                      {allUploadedPhotos.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setLightboxImage(item.url)}
                          className="relative aspect-square rounded-xl overflow-hidden border border-slate-700 group active:scale-95"
                        >
                          <img
                            src={item.url}
                            alt={item.siteCode}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1.5 py-1 text-left">
                            <span className="font-mono font-black text-[10px] text-cyan-300 block truncate">
                              {item.siteCode}
                            </span>
                            <span className="text-[8px] text-slate-300 block truncate">
                              {item.noteTitle}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Live SDM Notes Cards (Exact Fields & Badges as Web NotesCenter.jsx) */}
                {loadingNotes ? (
                  <div className="p-8 text-center text-xs text-cyan-400 font-mono flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading SDM operational notes...
                  </div>
                ) : paginatedNotes.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                    No SDM notes found matching your current filter.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {paginatedNotes.map((n) => {
                      const siteCode = n.site_ihs_id || n.site_id_str || n.site || 'GENERAL';
                      const noteTitle = n.title || n.category || 'SDM Operational Note';
                      const noteDesc = n.description || n.comment || '';
                      const creator = n.created_by || n.author || 'State Delivery Manager';
                      const photos = n.attachments || n.photos || [];
                      const isResolved = n.status === 'Resolved';
                      const canModify = isCreatorOfNote(n);

                      // Duration / Resolution Time Calculation matching Web NotesCenter.jsx
                      let durationBadge = null;
                      if (n.created_at) {
                        const startMs = new Date(n.created_at).getTime();
                        const endMs =
                          isResolved && n.resolved_at
                            ? new Date(n.resolved_at).getTime()
                            : Date.now();
                        const diffMins = Math.max(0, Math.floor((endMs - startMs) / 60000));
                        const days = Math.floor(diffMins / 1440);
                        const hrs = Math.floor((diffMins % 1440) / 60);
                        const mins = diffMins % 60;
                        const durationStr =
                          days > 0
                            ? `${days}d ${hrs}h ${mins}m`
                            : hrs > 0
                              ? `${hrs}h ${mins}m`
                              : `${mins}m`;
                        durationBadge = (
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                              isResolved
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            ⏱️ {isResolved ? 'Resolution Time:' : 'Duration:'} {durationStr}
                          </span>
                        );
                      }

                      const d = n.created_at ? new Date(n.created_at) : null;
                      const dateStr = d
                        ? d.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })
                        : '';
                      const timeStr = d
                        ? d.toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '';

                      return (
                        <div
                          key={n.id}
                          className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5"
                        >
                          {/* Top Row: Site ID + Availability Shortcut + Title */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSiteSearch(siteCode);
                                    setActiveTab('sites');
                                  }}
                                  className="font-mono font-black text-xs text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-500/30"
                                  title="Open Site in Site Matrix"
                                >
                                  {siteCode}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAvailSearch(siteCode);
                                    setActiveTab('availability');
                                  }}
                                  className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
                                  title="View Site Daily Availability"
                                >
                                  <span>📊 Daily Availability</span>
                                </button>
                              </div>
                              <h4 className="font-bold text-xs text-white mt-1.5">{noteTitle}</h4>
                            </div>
                          </div>

                          {/* Badges Row matching Web NotesCenter.jsx */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Tower Co: {n.tower_co || 'IHS'}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                              FSE: {n.smc_fse_name || 'Unassigned'}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                              {n.category || 'General'}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                n.priority === 'Critical'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : n.priority === 'High'
                                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                    : n.priority === 'Medium'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              Priority: {n.priority || 'Medium'}
                            </span>
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                n.status === 'Resolved'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : n.status === 'Escalated'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : n.status === 'In Progress'
                                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              Status: {n.status || 'Open'}
                            </span>
                            {durationBadge}
                          </div>

                          {/* Note Description */}
                          <p className="text-xs text-slate-200 whitespace-pre-line leading-relaxed bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80">
                            {noteDesc}
                          </p>

                          {/* Attached Evidence Photos */}
                          {Array.isArray(photos) && photos.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pt-1">
                              {photos.map((ph, i) => {
                                const imgUrl = getMediaUrl(ph.file || ph.image || ph.photo_url);
                                return (
                                  <button
                                    key={ph.id || i}
                                    type="button"
                                    onClick={() => setLightboxImage(imgUrl)}
                                    className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 shrink-0"
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={ph.caption || 'Evidence'}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Footer Metadata & Role-Aware Action Buttons */}
                          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>
                                  Logged By: <strong className="text-slate-200">{creator}</strong>
                                </span>
                                {n.site_cluster && (
                                  <span>
                                    • Cluster: <strong className="text-slate-300">{n.site_cluster}</strong>
                                  </span>
                                )}
                              </div>
                              {d && (
                                <div className="flex flex-wrap items-center gap-2 text-[9px] text-slate-400">
                                  <span>
                                    📅 Created Date: <strong className="text-slate-300">{dateStr}</strong>
                                  </span>
                                  <span>
                                    ⏰ Created Time: <strong className="text-amber-300">{timeStr}</strong>
                                  </span>
                                </div>
                              )}
                            </div>

                            {canModify ? (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!isResolved && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickResolveNote(n)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center gap-1"
                                  >
                                    <Check className="w-3 h-3" /> Quick Resolve
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNote({
                                      ...n,
                                      site_ihs_id: n.site_ihs_id || n.site || ''
                                    });
                                    setEditIncidentTime(
                                      n.created_at ? toLocalISOString(n.created_at) : toLocalISOString()
                                    );
                                    setEditPhotos([]);
                                    setAppendUpdateText('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold flex items-center gap-1"
                                  title="Edit / Append Note"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(n)}
                                  className="p-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-400"
                                  title="Delete Note"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span
                                className="text-[10px] text-slate-500 italic px-2 py-1 rounded bg-slate-950/60 border border-slate-800"
                                title="Only the note creator can edit or delete this note"
                              >
                                🔒 Read Only
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Notes Pagination Controls */}
                {totalNotesPages > 1 && (
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setNotesPage((p) => Math.max(1, p - 1))}
                      disabled={notesPage === 1}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 font-bold disabled:opacity-40 flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Prev
                    </button>
                    <span className="font-mono text-cyan-300 font-bold">
                      Page {notesPage} of {totalNotesPages} ({liveNotes.length} Notes)
                    </span>
                    <button
                      onClick={() => setNotesPage((p) => Math.min(totalNotesPages, p + 1))}
                      disabled={notesPage === totalNotesPages}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 font-bold disabled:opacity-40 flex items-center gap-1"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SUB-MODE B: WHATSAPP FIELD INTEL */}
            {fieldLogMode === 'whatsapp' && (
              <div className="space-y-3">
                <form
                  onSubmit={handleWhatsAppSubmit}
                  className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/30 space-y-2.5"
                >
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" /> Log WhatsApp Field Report
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={waForm.site_id}
                      onChange={(e) => setWaForm({ ...waForm, site_id: e.target.value.toUpperCase() })}
                      placeholder="Site ID (e.g. IHS_ABJ_0001A)"
                      className="bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 font-mono"
                    />
                    <select
                      value={waForm.issue_category}
                      onChange={(e) => setWaForm({ ...waForm, issue_category: e.target.value })}
                      className="bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                    >
                      <option value="Power / Fuel">Power / Fuel</option>
                      <option value="Fiber Cut">Fiber Cut</option>
                      <option value="Generator Fault">Generator Fault</option>
                      <option value="Access / Security">Access / Security</option>
                      <option value="Restored">Site Restored</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={waForm.raw_message}
                    onChange={(e) => setWaForm({ ...waForm, raw_message: e.target.value })}
                    placeholder="Paste WhatsApp update from FSE or NOC group..."
                    className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> Save to Intel Feed
                    </button>
                    {waForm.raw_message.trim() && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `*[MTN SDM FIELD REPORT - ${waForm.site_id || 'SITE'}]*\nCategory: ${waForm.issue_category}\n${waForm.raw_message}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2.5 px-3 rounded-xl bg-slate-800 text-emerald-300 text-xs font-bold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Share WA
                      </a>
                    )}
                  </div>
                </form>

                <div className="space-y-2">
                  {filteredWhatsApp.slice(0, 30).map((w, idx) => (
                    <div
                      key={w.id || idx}
                      className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-xs text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                          {w.site_id || w.site_ihs_id || 'FIELD'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">{w.issue_category}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{w.raw_message}</p>
                      <div className="text-[10px] text-slate-500 flex justify-between pt-1">
                        <span>{w.sender_name}</span>
                        <span>{w.status_update}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-MODE C: FSE QUICK CHECK & DIRECTORY */}
            {fieldLogMode === 'fse' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={fseQuery}
                    onChange={(e) => setFseQuery(e.target.value)}
                    placeholder="Search FSE name, cluster, SDM, or Site ID..."
                    className="w-full bg-slate-900 text-xs text-white pl-10 pr-4 py-2.5 rounded-2xl border border-slate-700/80"
                  />
                </div>

                <div className="space-y-2">
                  {fseDirectory.map((f) => {
                    const wa = formatWhatsAppPhone(f.phone);
                    return (
                      <div
                        key={f.name}
                        className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-white truncate">{f.name}</h4>
                            <p className="text-[10px] text-slate-400 truncate">
                              Cluster: {f.cluster || 'FCT'} • SDM: {f.sdm || 'N/A'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-cyan-300 font-bold">
                              {f.totalSites} sites
                            </span>
                            {f.downSites > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 font-bold">
                                {f.downSites} down
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          {f.phone && (
                            <a
                              href={`tel:${f.phone}`}
                              className="flex-1 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <Phone className="w-3.5 h-3.5" /> Call FSE
                            </a>
                          )}
                          {wa && (
                            <a
                              href={`https://wa.me/${wa}?text=${encodeURIComponent(
                                `Hello ${f.name}, checking in on your cluster sites.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 py-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setSiteFseFilter(f.name);
                              setDbPage(1);
                              setActiveTab('sites');
                            }}
                            className="py-2 px-3 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold"
                          >
                            View Sites
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 5: LIVE GEO MAP, AI ASSISTANT & FIBER LINKS
        ============================================================ */}
        {activeTab === 'map_ai' && (
          <div className="space-y-3">
            {/* Segmented Mode Bar */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-900 border border-slate-800">
              {[
                { id: 'map', label: 'Geo Map' },
                { id: 'ai', label: 'Field AI' },
                { id: 'links', label: 'TNL / Fiber' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMapAiMode(m.id)}
                  className={`py-2 rounded-xl text-xs font-extrabold transition-all ${
                    mapAiMode === m.id
                      ? 'bg-[#FFCC00] text-black shadow'
                      : 'text-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mapAiMode === 'map' && (
              <div className="w-full">
                <GeoMap
                  sites={localSites}
                  selectedSite={selectedSite}
                  onSelectSite={(siteOrId) => {
                    if (!siteOrId) return;
                    if (typeof siteOrId === 'string') {
                      const found =
                        localSites.find(
                          (s) => s.ihs_site_id === siteOrId || s.mtn_id === siteOrId
                        ) ||
                        dbSites.find(
                          (s) => s.ihs_site_id === siteOrId || s.mtn_id === siteOrId
                        ) || { ihs_site_id: siteOrId };
                      setSelectedSite(found);
                    } else {
                      setSelectedSite(siteOrId);
                    }
                  }}
                  currentUser={currentUser}
                />
              </div>
            )}

            {mapAiMode === 'ai' && (
              <div className="flex flex-col h-[68vh] rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                <div className="p-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {[
                    'List down sites',
                    'Critical P1 summary',
                    'Fiber cut checklist',
                    'DG PM procedure'
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleSendAiPrompt(chip)}
                      className="px-2.5 py-1 rounded-xl bg-slate-900 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold whitespace-nowrap"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {aiMessages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[90%] ${
                        m.role === 'user'
                          ? 'ml-auto bg-cyan-600 text-white font-medium'
                          : 'bg-slate-950 border border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="whitespace-pre-line">{m.content}</div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="text-xs text-cyan-400 font-mono p-2 animate-pulse">
                      AI analyzing telemetry...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAiPrompt();
                  }}
                  className="p-2.5 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Ask about any Site ID or fault..."
                    className="flex-1 bg-slate-900 text-xs text-white px-3.5 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading}
                    className="p-2.5 rounded-xl bg-[#FFCC00] text-black font-black"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {mapAiMode === 'links' && (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={tnlSearch}
                    onChange={(e) => setTnlSearch(e.target.value)}
                    placeholder="Search Segment Name, Site A, Site B..."
                    className="w-full bg-slate-900 text-xs text-white pl-10 pr-4 py-2.5 rounded-2xl border border-slate-700/80 font-mono"
                  />
                </div>

                {tnlLoading ? (
                  <div className="p-6 text-center text-xs text-cyan-400 font-mono">Loading TNL links...</div>
                ) : tnlLinks.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                    No TNL links found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tnlLinks.slice(0, 30).map((lnk, i) => (
                      <div
                        key={lnk.id || i}
                        className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-xs text-cyan-300">
                            {lnk.segment_name || lnk.link_id || 'TNL LINK'}
                          </span>
                          <span className="text-[10px] font-mono text-[#FFCC00]">
                            {lnk.network_type || lnk.maintenance_fmp || 'Fiber/MW'}
                          </span>
                        </div>
                        <div className="text-xs text-white font-semibold">
                          {lnk.site_a || 'Site A'} ↔ {lnk.site_b || 'Site B'}
                        </div>
                        {lnk.distance_km != null && (
                          <div className="text-[10px] text-slate-400">
                            Distance: {lnk.distance_km} km • State: {lnk.state || 'FCT'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ============================================================
          SITE INSPECTOR & FULL IHS MATRIX SPECS BOTTOM SHEET
      ============================================================ */}
      {selectedSite && (() => {
        const raw = selectedSite.raw_data || {};
        const primaryId = selectedSite.ihs_site_id || selectedSite.mtn_id || 'SITE';
        const fseName = selectedSite.smc_fse_name || raw['FSE NAME'] || 'Unassigned';
        const fsePhone = selectedSite.smc_fse_phone || raw['FSE CONTACT NO.'] || '';
        const efsName = selectedSite.efs_name || raw['EFS Name'] || '';
        const efsPhone = selectedSite.efs_phone || raw['EFS Number'] || '';
        const rtoName = selectedSite.rto_name || raw['RTO Name'] || '';
        const rtoPhone = selectedSite.rto_phone || raw['RTO Number'] || '';
        const sdmName = selectedSite.sdm_name || raw['SDM NAME'] || 'State Delivery Manager';
        const isDown = Boolean(selectedSite.is_down || selectedSite.operational_status === 'Down');
        const rawEntries = Object.entries(raw).filter(
          ([, v]) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0'
        );

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4">
            <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black font-mono text-cyan-300">{primaryId}</h2>
                    {selectedSite.mtn_id && selectedSite.mtn_id !== primaryId && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                        MTN: {selectedSite.mtn_id}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                        isDown
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {selectedSite.operational_status || 'Operational'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {selectedSite.cluster_name || 'Cluster'} • {selectedSite.site_address || selectedSite.lga || 'FCT'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSite(null)}
                  className="p-2 rounded-full bg-slate-800 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Key IHS Matrix & Site Inventory Specs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">Tower Co & SMC</span>
                  <span className="font-bold text-purple-300">
                    {selectedSite.tower_co || raw['Tower Co'] || 'IHS'} ({selectedSite.smc || raw['SMC'] || 'IHS'})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">Priority & Power</span>
                  <span className="font-bold text-[#FFCC00]">
                    {selectedSite.priority || 'P2'} • {selectedSite.power_solution || raw['Power Solution'] || 'Grid/DG'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">SMC FSE Engineer</span>
                  <span className="font-bold text-white block truncate">{fseName}</span>
                  <span className="font-mono text-[11px] text-emerald-400">{fsePhone || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">EFS (IHS Matrix)</span>
                  <span className="font-bold text-white block truncate">{efsName || 'N/A'}</span>
                  <span className="font-mono text-[11px] text-cyan-300">{efsPhone || 'N/A'}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">RTO Contact</span>
                  <span className="font-bold text-slate-200 block truncate">{rtoName || 'N/A'}</span>
                  <span className="font-mono text-[11px] text-slate-400">{rtoPhone || ''}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block font-bold uppercase">SDM Manager</span>
                  <span className="font-bold text-cyan-300 block truncate">{sdmName}</span>
                  <span className="font-mono text-[11px] text-slate-400">{selectedSite.sdm_phone || ''}</span>
                </div>
              </div>

              {/* Direct Call / WhatsApp / Navigate Buttons */}
              <div className="grid grid-cols-2 gap-2">
                {fsePhone && (
                  <a
                    href={`tel:${fsePhone}`}
                    className="py-2.5 px-3 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-4 h-4" /> Call FSE
                  </a>
                )}
                {efsPhone && (
                  <a
                    href={`tel:${efsPhone}`}
                    className="py-2.5 px-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-4 h-4" /> Call EFS
                  </a>
                )}
                {(fsePhone || efsPhone) && (
                  <a
                    href={`https://wa.me/${formatWhatsAppPhone(fsePhone || efsPhone)}?text=${encodeURIComponent(
                      `Hello, requesting update on Site ${primaryId}.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4" /> WhatsApp
                  </a>
                )}
                {selectedSite.latitude && selectedSite.longitude && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.latitude},${selectedSite.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Navigation className="w-4 h-4" /> Navigate GPS
                  </a>
                )}
              </div>

              {/* Site Attached Photos & Notes (from lookupSite or liveNotes) */}
              {(() => {
                const siteAtts = Array.isArray(selectedSiteDetails?.attachments)
                  ? selectedSiteDetails.attachments
                  : [];
                const siteNotes = Array.isArray(selectedSiteDetails?.notes)
                  ? selectedSiteDetails.notes
                  : liveNotes.filter(
                      (n) =>
                        n.site_ihs_id === primaryId ||
                        n.site_ihs_id === selectedSite.mtn_id ||
                        n.site === primaryId
                    );
                return (
                  <>
                    {siteAtts.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#FFCC00] flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Site Evidence Photos ({siteAtts.length})</span>
                        </span>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                          {siteAtts.map((att, idx) => {
                            const url = getMediaUrl(att.file || att.image);
                            return (
                              <button
                                key={att.id || idx}
                                type="button"
                                onClick={() => setLightboxImage(url)}
                                className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 shrink-0"
                              >
                                <img src={url} alt="Site Evidence" loading="lazy" className="w-full h-full object-cover" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {siteNotes.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 block">
                          Site Operational Notes ({siteNotes.length})
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1.5">
                          {siteNotes.slice(0, 5).map((sn) => (
                            <div
                              key={sn.id}
                              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] space-y-1"
                            >
                              <div className="flex items-center justify-between font-bold text-white">
                                <span className="truncate">{sn.title || sn.category}</span>
                                <span className="text-[9px] text-amber-300">{sn.status}</span>
                              </div>
                              <p className="text-slate-300 line-clamp-2">{sn.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Toggle All 87-Column IHS Matrix Raw Parameters */}
              {rawEntries.length > 0 && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowRawMatrixSpecs(!showRawMatrixSpecs)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-cyan-300 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      <span>All IHS Matrix Parameters ({rawEntries.length} Fields)</span>
                    </span>
                    <span>{showRawMatrixSpecs ? '▲ Hide' : '▼ Expand'}</span>
                  </button>

                  {showRawMatrixSpecs && (
                    <div className="max-h-56 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-2.5 grid grid-cols-1 gap-1.5 text-[11px]">
                      {rawEntries.map(([k, v]) => (
                        <div key={k} className="flex items-start justify-between gap-2 border-b border-slate-900 pb-1">
                          <span className="text-slate-400 font-semibold">{k}:</span>
                          <span className="text-slate-200 font-mono text-right break-all">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => openQuickNoteForSite(primaryId)}
                  className="py-2.5 px-3 rounded-xl bg-[#FFCC00] text-black text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" /> Log SDM Note
                </button>
                <button
                  onClick={() => openAiForSite(primaryId)}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Bot className="w-4 h-4" /> AI Diagnostic
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================
          EDIT / APPEND SDM NOTE MODAL (MATCHING WEB NOTESCENTER.JSX)
      ============================================================ */}
      {editingNote && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditNote}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-slate-900 border border-cyan-500/40 rounded-3xl p-5 space-y-3 my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-cyan-300">
                Edit SDM Operational Note ({editingNote.site_ihs_id || editingNote.site || 'Site'})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingNote(null);
                  setEditPhotos([]);
                  setAppendUpdateText('');
                }}
                className="text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">
                  Site ID (IHS / MTN Code)
                </label>
                <input
                  type="text"
                  required
                  value={editingNote.site_ihs_id || editingNote.site || ''}
                  onChange={(e) =>
                    setEditingNote({
                      ...editingNote,
                      site_ihs_id: e.target.value.toUpperCase()
                    })
                  }
                  className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Category</label>
                <select
                  value={editingNote.category || 'General'}
                  onChange={(e) => setEditingNote({ ...editingNote, category: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                >
                  {noteCategories.filter((c) => c !== 'All').map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Note Title</label>
              <input
                type="text"
                required
                value={editingNote.title || ''}
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-amber-400 block mb-1">
                Incident / Occurrence Date & Time
              </label>
              <input
                type="datetime-local"
                value={editIncidentTime}
                onChange={(e) => setEditIncidentTime(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-amber-500/40"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Priority</label>
                <select
                  value={editingNote.priority || 'Medium'}
                  onChange={(e) => setEditingNote({ ...editingNote, priority: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Status</label>
                <select
                  value={editingNote.status || 'Open'}
                  onChange={(e) => setEditingNote({ ...editingNote, status: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Escalated">Escalated</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Tower Co</label>
                <select
                  value={editingNote.tower_co || 'IHS'}
                  onChange={(e) => setEditingNote({ ...editingNote, tower_co: e.target.value })}
                  className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
                >
                  <option value="IHS">IHS Towers</option>
                  <option value="ATC">ATC</option>
                  <option value="PAT">PAT</option>
                  <option value="MTN">MTN Direct</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">
                Logged By (Author)
              </label>
              <input
                type="text"
                readOnly
                value={editingNote.created_by || editingNote.author || defaultAuthor}
                className="w-full bg-slate-950/60 text-xs text-slate-400 p-2.5 rounded-xl border border-slate-800 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">
                Description & Operational Context History
              </label>
              <textarea
                rows={3}
                required
                value={editingNote.description || editingNote.comment || ''}
                onChange={(e) => setEditingNote({ ...editingNote, description: e.target.value })}
                className="w-full bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700"
              />
            </div>

            <div className="p-2.5 rounded-2xl bg-cyan-950/30 border border-cyan-500/30">
              <label className="text-[10px] font-bold text-cyan-300 block mb-1">
                ➕ Append New Progress Update / Field Data
              </label>
              <textarea
                rows={2}
                value={appendUpdateText}
                onChange={(e) => setAppendUpdateText(e.target.value)}
                placeholder="Type a new progress update, diesel delivery quantity, or FSE feedback to append with a timestamp..."
                className="w-full bg-slate-950 text-xs text-white p-2 rounded-xl border border-cyan-500/40"
              />
            </div>

            {/* Existing Attached Photos */}
            {Array.isArray(editingNote.attachments) && editingNote.attachments.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">
                  Existing Attached Photos ({editingNote.attachments.length})
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {editingNote.attachments.map((att, i) => (
                    <img
                      key={att.id || i}
                      src={getMediaUrl(att.file || att.image)}
                      alt="Attached"
                      onClick={() => setLightboxImage(getMediaUrl(att.file || att.image))}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-700 shrink-0 cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add More Site Inspection Photos on Edit */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 block">
                Attach Site Inspection Photos (Evidence)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="py-2 px-2.5 rounded-xl bg-slate-950 border border-cyan-500/40 text-[11px] font-bold text-cyan-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleEditPhotoSelect}
                    className="hidden"
                  />
                </label>
                <label className="py-2 px-2.5 rounded-xl bg-slate-950 border border-purple-500/40 text-[11px] font-bold text-purple-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Gallery ({editPhotos.length})</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleEditPhotoSelect}
                    className="hidden"
                  />
                </label>
              </div>

              {editPhotos.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {editPhotos.map((p, idx) => (
                    <div
                      key={idx}
                      className="relative w-14 h-14 rounded-xl overflow-hidden border border-cyan-500/40 shrink-0"
                    >
                      <img src={p.dataUrl} alt="New Evidence" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEditPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-0.5 right-0.5 bg-black/80 text-white rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setEditingNote(null);
                  setEditPhotos([]);
                  setAppendUpdateText('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#FFCC00] text-black font-black text-xs"
              >
                Update SDM Note
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================
          PHOTO LIGHTBOX MODAL
      ============================================================ */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <img src={getMediaUrl(lightboxImage)} alt="Evidence Full" className="max-w-full max-h-[85vh] rounded-2xl" />
        </div>
      )}

      {/* ============================================================
          SETTINGS, SERVER & PROFILE BOTTOM SHEET
      ============================================================ */}
      {showSettingsSheet && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {currentUser?.avatar_url ? (
                  <img
                    src={getMediaUrl(currentUser.avatar_url)}
                    alt={userName || 'SDM'}
                    className="w-10 h-10 rounded-xl object-cover border-2 border-[#FFCC00]"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#FFCC00] text-black font-black flex items-center justify-center text-sm">
                    {userName ? userName.charAt(0).toUpperCase() : 'S'}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-black text-white">{userName || 'SDM Engineer'}</h3>
                  <p className="text-[11px] text-cyan-400 font-semibold">{currentUser?.role || 'Operations'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowSettingsSheet(false)}
                className="p-2 rounded-full bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {onThemeChange && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-400">Display Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'mtn-dark', label: 'MTN Dark' },
                    { id: 'mtn', label: 'MTN Gold' },
                    { id: 'sky', label: 'Cyber Sky' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onThemeChange(t.id)}
                      className={`py-2 rounded-xl text-xs font-bold border ${
                        currentTheme === t.id
                          ? 'bg-[#FFCC00] text-black border-amber-300 font-black'
                          : 'bg-slate-950 text-slate-300 border-slate-800'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-slate-400">Cloudflare / Server Endpoint</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serverIp}
                  onChange={(e) => setServerIp(e.target.value)}
                  className="flex-1 bg-slate-950 text-xs text-white p-2.5 rounded-xl border border-slate-700 font-mono"
                />
                <button
                  onClick={() => {
                    setCustomServerIp(serverIp);
                    loadLiveFeeds(true);
                    loadAllNotes();
                    loadSitesInventory();
                    setShowSettingsSheet(false);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs"
                >
                  Apply
                </button>
              </div>
            </div>

            {!isMobileNative && onSwitchToDesktop && (
              <button
                onClick={() => {
                  setShowSettingsSheet(false);
                  onSwitchToDesktop();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2"
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>Switch to Full Desktop Workspace</span>
              </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-extrabold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          FIXED BOTTOM MOBILE NAVIGATION BAR
      ============================================================ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-2 py-1.5">
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1">
          {[
            { id: 'overview', label: 'Home', icon: Layers },
            { id: 'sites', label: 'Sites/IHS', icon: Database },
            { id: 'availability', label: 'SLA', icon: Calendar },
            { id: 'field_log', label: 'SDM Notes', icon: PlusCircle, badge: pendingTotal },
            { id: 'map_ai', label: 'Map & AI', icon: MapPin }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-1.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 relative transition-all ${
                  active ? 'text-[#FFCC00] bg-amber-500/10 font-black' : 'text-slate-400 font-semibold'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#FFCC00]' : 'text-slate-400'}`} />
                <span className="text-[10px] tracking-tight">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
