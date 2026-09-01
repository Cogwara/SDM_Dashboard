import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Upload, FileSpreadsheet, RefreshCw, CheckCircle2, AlertTriangle, 
  ShieldAlert, Search, Filter, Calendar, BarChart3, Database, ArrowUpRight, 
  ChevronRight, Radio, Layers, Server, Download, Sparkles, TrendingUp, Archive,
  Clock, CalendarDays, CalendarRange, Sliders, LayoutGrid, List, Eye, TrendingDown, Info, X,
  FileText, Printer, Copy, MapPin, Check, Share2, Wrench, Map,
  ClipboardList, CheckCheck, ArrowUpDown, MessageSquare, Plus, ExternalLink, RotateCcw
} from 'lucide-react';
import { 
  fetchAvailabilityStats, fetchAvailabilityRecords, fetchAvailabilityArchives, uploadAvailabilityFile, resetBaseAvailability, exportAvailabilityExcel, fetchNotes, exportNotesExcel 
} from '../api';
import { getSDMStateInfo } from '../utils/userUtils';
import LgaExecutiveReportModal from './LgaExecutiveReportModal';
import { AreaChart, Area, LineChart, Line, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const CandlestickShape = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { avg_availability = 98.5, min_availability, max_availability } = payload;
  const isUp = avg_availability >= 98.5;
  const color = isUp ? '#10b981' : '#ef4444';
  const candleW = Math.max(5, Math.min(22, width * 0.55));
  const cx = x + width / 2;

  const h = Math.max(8, height);
  const topY = y;
  const bottomY = y + h;

  const minVal = min_availability !== undefined ? min_availability : avg_availability - 2;
  const maxVal = max_availability !== undefined ? max_availability : Math.min(100, avg_availability + 1);

  const wickOffsetTop = Math.min(14, Math.max(2, (maxVal - avg_availability) * 3));
  const wickOffsetBottom = Math.min(14, Math.max(2, (avg_availability - minVal) * 3));

  const wickTopY = topY - wickOffsetTop;
  const wickBottomY = bottomY + wickOffsetBottom;

  return (
    <g>
      {/* High - Low Wick Line */}
      <line x1={cx} y1={wickTopY} x2={cx} y2={wickBottomY} stroke={color} strokeWidth={2} />
      {/* Candle Body */}
      <rect
        x={cx - candleW / 2}
        y={topY}
        width={candleW}
        height={h}
        fill={color}
        fillOpacity={0.88}
        stroke={color}
        strokeWidth={1.5}
        rx={3}
      />
    </g>
  );
};

export default function DailyAvailabilityCenter({ currentUser, onSelectSite, initialSearch }) {
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [chartViewMode, setChartViewMode] = useState('area'); // 'area', 'candle', 'bar'
  const [uploadMsg, setUploadMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Monthly Archive Center State
  const [archives, setArchives] = useState([]);
  const [selectedArchiveLogId, setSelectedArchiveLogId] = useState('active');

  const loadArchivesData = async () => {
    try {
      const res = await fetchAvailabilityArchives();
      const archiveLogs = res.archives || [];
      setArchives(archiveLogs);

      if (archiveLogs.length > 0) {
        const activeLog = archiveLogs.find(a => a.is_active) || archiveLogs[0];
        if (activeLog && activeLog.end_date) {
          const activeMonthId = activeLog.end_date.substring(0, 7);
          setSelectedMonth(activeMonthId);
          setStartDateInput(activeLog.start_date || `${activeMonthId}-01`);
          setEndDateInput(activeLog.end_date);
        }
      }
    } catch (err) {
      console.error('Failed to load availability archives:', err);
    }
  };

  useEffect(() => {
    loadArchivesData();
  }, []);

  // Daily UI View Mode & Modal State
  const [viewMode, setViewMode] = useState('cards'); // 'cards' (Daily UI Cards) or 'table' (Matrix Table)
  const [worstViewMode, setWorstViewMode] = useState('cards'); // 'cards' (Daily UI Cards) or 'table' (Matrix Table)
  const [selectedSiteModal, setSelectedSiteModal] = useState(null); // { record, targetDay }
  const [modalBreakdownView, setModalBreakdownView] = useState('table'); // 'table' (Gold Matrix Excel Table) or 'cards' (Grid Cards)
  const [showAllLgas, setShowAllLgas] = useState(false);
  
  // 30-Day Daily Breakdown Selected Day & Notes State
  const [selectedBreakdownDay, setSelectedBreakdownDay] = useState(null);
  const [siteModalNotes, setSiteModalNotes] = useState([]);
  const [loadingSiteModalNotes, setLoadingSiteModalNotes] = useState(false);

  useEffect(() => {
    if (selectedSiteModal && selectedSiteModal.record) {
      const siteId = selectedSiteModal.record.site_id;
      const scoresObj = selectedSiteModal.record.daily_scores || {};
      const sortedDays = Object.keys(scoresObj).sort();
      const initialDay = selectedSiteModal.targetDay || (sortedDays.length > 0 ? sortedDays[sortedDays.length - 1] : null);
      
      setSelectedBreakdownDay(initialDay);
      setLoadingSiteModalNotes(true);

      const loadModalNotes = async () => {
        try {
          const res = await fetchNotes({ search: siteId, page_size: 200 });
          const list = Array.isArray(res) ? res : (res.results || []);
          setSiteModalNotes(list);
        } catch (e) {
          console.error("Error fetching site modal notes:", e);
          setSiteModalNotes([]);
        } finally {
          setLoadingSiteModalNotes(false);
        }
      };

      loadModalNotes();
    } else {
      setSiteModalNotes([]);
      setSelectedBreakdownDay(null);
    }
  }, [selectedSiteModal]);

  const activeDayNotes = React.useMemo(() => {
    if (!selectedBreakdownDay || !siteModalNotes || siteModalNotes.length === 0) return [];
    return siteModalNotes.filter(n => {
      if (!n) return false;
      const dateStr = n.created_at || n.date || n.updated_at || '';
      if (dateStr.includes(selectedBreakdownDay)) return true;
      if (n.title && n.title.includes(selectedBreakdownDay)) return true;
      if (n.description && n.description.includes(selectedBreakdownDay)) return true;
      return false;
    });
  }, [selectedBreakdownDay, siteModalNotes]);

  const formatHeaderDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      return `${month}/${day}/${year}`;
    }
    return dateStr;
  };

  // LGA Operational Report State
  const [selectedLgaReport, setSelectedLgaReport] = useState(null);
  const handleGenerateLgaReport = (lgaItem) => setSelectedLgaReport(lgaItem);

  // Filter States
  const [selectedTech, setSelectedTech] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedTerritory, setSelectedTerritory] = useState('All');
  const [selectedLga, setSelectedLga] = useState('All');
  const [selectedTowerCo, setSelectedTowerCo] = useState('All');
  const [selectedVendor, setSelectedVendor] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedFse, setSelectedFse] = useState('All');
  const [sortBy, setSortBy] = useState('worst');
  const [searchQuery, setSearchQuery] = useState(() => initialSearch || '');
  const [slaFilter, setSlaFilter] = useState('all');
  const [minAvailInput, setMinAvailInput] = useState('');
  const [maxAvailInput, setMaxAvailInput] = useState('');

  useEffect(() => {
    if (initialSearch !== undefined && initialSearch !== null) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);
  
  // Date & Period Filter States - Enhanced
  const [dateMode, setDateMode] = useState('month'); // 'day', 'week', 'month', 'all', 'custom'
  const [selectedDateInput, setSelectedDateInput] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('week'); // 'week' (latest 7 days) or 'week_1', 'week_2', ...
  const [selectedMonth, setSelectedMonth] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const stateInfo = getSDMStateInfo(currentUser);

  // Dynamically compute week options from dates in the uploaded Excel spreadsheet
  const weeks = React.useMemo(() => {
    const dates = stats?.all_detected_dates || [];
    if (dates.length === 0) {
      return [
        { id: 'week', label: '⚡ Latest 7 Days', dates: 'Recent 7 Days' },
        { id: 'week_1', label: 'Week 1', dates: 'Days 1-7' },
        { id: 'week_2', label: 'Week 2', dates: 'Days 8-14' },
        { id: 'week_3', label: 'Week 3', dates: 'Days 15-21' },
        { id: 'week_4', label: 'Week 4', dates: 'Days 22-28' }
      ];
    }

    const latest7 = dates.slice(-7);
    const weekList = [
      {
        id: 'week',
        label: '⚡ Latest 7 Days',
        dates: `${latest7[0]} to ${latest7[latest7.length - 1]}`
      }
    ];

    for (let i = 0; i < dates.length; i += 7) {
      const chunk = dates.slice(i, i + 7);
      const weekNum = Math.floor(i / 7) + 1;
      weekList.push({
        id: `week_${weekNum}`,
        label: `Week ${weekNum}`,
        dates: `${chunk[0]} to ${chunk[chunk.length - 1]}`
      });
    }

    return weekList;
  }, [stats?.all_detected_dates]);

  // Dynamically compute months present in the uploaded database
  const months = React.useMemo(() => {
    const dates = stats?.all_detected_dates || [];
    if (dates.length === 0) {
      return [
        { id: '2026-08', label: 'August 2026' },
        { id: '2026-07', label: 'July 2026' },
        { id: '2026-06', label: 'June 2026' }
      ];
    }
    const uniqueMonths = Array.from(new Set(dates.map(d => d.slice(0, 7)))).sort().reverse();
    const monthNames = {
      '01': 'January', '02': 'February', '03': 'March', '04': 'April',
      '05': 'May', '06': 'June', '07': 'July', '08': 'August',
      '09': 'September', '10': 'October', '11': 'November', '12': 'December'
    };
    return uniqueMonths.map(m => {
      const [year, monthNum] = m.split('-');
      const name = monthNames[monthNum] || monthNum;
      const count = dates.filter(d => d.startsWith(m)).length;
      return {
        id: m,
        label: `${name} ${year} (${count} Days)`
      };
    });
  }, [stats?.all_detected_dates]);

  // Modal Sister Records States & Effect (Multi-Tech Sister Fetching)
  const [modalFetchedRecords, setModalFetchedRecords] = useState([]);
  const [modalLoadingSisters, setModalLoadingSisters] = useState(false);

  useEffect(() => {
    if (!selectedSiteModal || !selectedSiteModal.record) {
      setModalFetchedRecords([]);
      return;
    }
    const curRec = selectedSiteModal.record;
    const sid = curRec.site_id;
    if (!sid) return;

    let isMounted = true;
    setModalLoadingSisters(true);
    fetchAvailabilityRecords({
      site_ids: sid,
      upload_log_id: selectedArchiveLogId,
      date_mode: dateMode,
      date: selectedDateInput,
      week: selectedWeek,
      month: selectedMonth,
      start_date: startDateInput,
      end_date: endDateInput,
      page_size: 50
    }).then((res) => {
      if (isMounted) {
        const results = res?.results || res || [];
        if (results.length > 0) {
          const techOrder = { '2G': 1, '3G': 2, '4G': 3, 'LTE': 3, '5G': 4 };
          results.sort((a, b) => (techOrder[a.tech] || 99) - (techOrder[b.tech] || 99));
          setModalFetchedRecords(results);
        } else {
          setModalFetchedRecords([curRec]);
        }
      }
    }).catch(() => {
      if (isMounted) setModalFetchedRecords([curRec]);
    }).finally(() => {
      if (isMounted) setModalLoadingSisters(false);
    });

    return () => { isMounted = false; };
  }, [selectedSiteModal, selectedArchiveLogId, dateMode, selectedDateInput, selectedWeek, selectedMonth, startDateInput, endDateInput]);

  const modalSisterRecords = React.useMemo(() => {
    if (modalFetchedRecords && modalFetchedRecords.length > 0) {
      return modalFetchedRecords;
    }
    if (!selectedSiteModal || !selectedSiteModal.record) return [];
    return [selectedSiteModal.record];
  }, [modalFetchedRecords, selectedSiteModal]);

  const modalAllDates = React.useMemo(() => {
    if (!modalSisterRecords || modalSisterRecords.length === 0) return [];
    const dateSet = new Set();
    modalSisterRecords.forEach(r => {
      if (r.daily_scores && typeof r.daily_scores === 'object') {
        Object.keys(r.daily_scores).forEach(d => dateSet.add(d));
      }
    });
    return Array.from(dateSet).sort();
  }, [modalSisterRecords]);

  // Multi-Site Bulk List Search States
  const [isMultiSiteModalOpen, setIsMultiSiteModalOpen] = useState(false);
  const [multiSiteRawInput, setMultiSiteRawInput] = useState('');
  const [multiSiteParsedList, setMultiSiteParsedList] = useState([]);
  
  // Multi-Site SDM Notes Modal States
  const [isMultiNotesModalOpen, setIsMultiNotesModalOpen] = useState(false);
  const [multiSiteNotes, setMultiSiteNotes] = useState([]);
  const [loadingMultiNotes, setLoadingMultiNotes] = useState(false);
  const [notesSiteFilter, setNotesSiteFilter] = useState('All');
  const [notesCategoryFilter, setNotesCategoryFilter] = useState('All');
  const [notesPriorityFilter, setNotesPriorityFilter] = useState('All');
  const [notesStatusFilter, setNotesStatusFilter] = useState('All');
  const [notesSearchQuery, setNotesSearchQuery] = useState('');

  // Helper to parse pasted raw text into clean, deduplicated Site IDs
  const parseSiteIdsFromText = (text) => {
    if (!text || typeof text !== 'string') return [];
    const tokens = text
      .split(/[\s,;\n\r\t]+/)
      .map(t => t.trim().replace(/^['"\[\](){}\.,;:\/\\]+|['"\[\](){}\.,;:\/\\]+$/g, '').toUpperCase())
      .filter(t => t.length >= 2 && !['AND', 'OR', 'THE', 'SITE', 'SITES', 'ID', 'IDS', 'NULL', 'UNDEFINED', 'N/A'].includes(t));
    return Array.from(new Set(tokens));
  };

  const handleApplyMultiSiteSearch = (siteListOrText, sortAsWorst = true) => {
    let list = [];
    if (Array.isArray(siteListOrText)) {
      list = siteListOrText;
    } else {
      list = parseSiteIdsFromText(siteListOrText);
    }
    setMultiSiteParsedList(list);
    if (sortAsWorst) {
      setSortBy('worst');
    }
    setPage(1);
    setIsMultiSiteModalOpen(false);
    if (list.length > 0) {
      loadMultiSiteNotes(list);
    }
  };

  const handleClearMultiSiteSearch = () => {
    setMultiSiteParsedList([]);
    setMultiSiteRawInput('');
    setPage(1);
  };

  const loadMultiSiteNotes = async (targetSites = multiSiteParsedList) => {
    const sites = targetSites && targetSites.length > 0 ? targetSites : records.map(r => r.site_id);
    if (!sites || sites.length === 0) {
      setMultiSiteNotes([]);
      return;
    }
    setLoadingMultiNotes(true);
    try {
      const res = await fetchNotes({
        site_ids: sites.join(','),
        page_size: 500
      });
      const list = Array.isArray(res) ? res : (res.results || []);
      setMultiSiteNotes(list);
    } catch (e) {
      console.error('Error loading multi-site notes:', e);
      setMultiSiteNotes([]);
    } finally {
      setLoadingMultiNotes(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedTech('All');
    setSelectedState('All');
    setSelectedTerritory('All');
    setSelectedLga('All');
    setSelectedTowerCo('All');
    setSelectedVendor('All');
    setSelectedStatus('All');
    setSelectedFse('All');
    setSortBy('worst');
    setSearchQuery('');
    setMultiSiteParsedList([]);
    setMultiSiteRawInput('');
    setSlaFilter('all');
    setMinAvailInput('');
    setMaxAvailInput('');
    setDateMode('month');
    if (stats?.all_detected_dates && stats.all_detected_dates.length > 0) {
      const d = stats.all_detected_dates;
      setSelectedDateInput(d[d.length - 1]);
      setStartDateInput(d[0]);
      setEndDateInput(d[d.length - 1]);
    }
    setSelectedWeek('week');
    setPage(1);
  };

  const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer' || currentUser?.role === 'FSE';
  const userName = currentUser?.full_name || currentUser?.username;

  const loadStatsData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const sdmParam = currentUser && !currentUser.is_superuser && !isFse ? userName : undefined;
      const fseParam = isFse ? userName : (selectedFse !== 'All' ? selectedFse : undefined);
      
      let backendDateMode = dateMode;
      let backendSelectedDate = selectedDateInput;
      let backendStartDate = startDateInput;
      let backendEndDate = endDateInput;
      
      if (dateMode === 'week') {
        backendDateMode = selectedWeek || 'week';
      } else if (dateMode === 'day') {
        backendDateMode = 'day';
      } else if (dateMode === 'month') {
        backendDateMode = 'month';
      } else if (dateMode === 'all') {
        backendDateMode = 'all';
      } else if (dateMode === 'custom') {
        backendDateMode = 'custom';
      }
      
      const data = await fetchAvailabilityStats({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        territory: selectedTerritory,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        site_ids: multiSiteParsedList.length > 0 ? multiSiteParsedList.join(',') : undefined,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: backendDateMode,
        selected_date: backendSelectedDate,
        selected_month: selectedMonth,
        start_date: backendStartDate,
        end_date: backendEndDate,
        upload_log_id: selectedArchiveLogId !== 'active' ? selectedArchiveLogId : undefined
      });
      setStats(data);
      if (data?.all_detected_dates && data.all_detected_dates.length > 0) {
        const dates = data.all_detected_dates;
        const latest = dates[dates.length - 1];
        const earliest = dates[0];
        const latestMonth = latest.slice(0, 7);
        setSelectedDateInput(prev => (!prev || !dates.includes(prev) ? latest : prev));
        setSelectedMonth(prev => (!prev ? latestMonth : prev));
        setStartDateInput(prev => (!prev ? earliest : prev));
        setEndDateInput(prev => (!prev ? latest : prev));
      }
    } catch (e) {
      console.error('Failed to load availability stats:', e);
      setErrorMsg('Error connecting to backend server for availability metrics.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecordsData = async () => {
    setRecordsLoading(true);
    try {
      const sdmParam = currentUser && !currentUser.is_superuser && !isFse ? userName : undefined;
      const fseParam = isFse ? userName : (selectedFse !== 'All' ? selectedFse : undefined);
      
      let backendDateMode = dateMode;
      let backendSelectedDate = selectedDateInput;
      let backendStartDate = startDateInput;
      let backendEndDate = endDateInput;
      
      if (dateMode === 'week') {
        backendDateMode = selectedWeek || 'week';
      } else if (dateMode === 'day') {
        backendDateMode = 'day';
      } else if (dateMode === 'month') {
        backendDateMode = 'month';
      } else if (dateMode === 'all') {
        backendDateMode = 'all';
      } else if (dateMode === 'custom') {
        backendDateMode = 'custom';
      }
      
      const res = await fetchAvailabilityRecords({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        territory: selectedTerritory,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        site_ids: multiSiteParsedList.length > 0 ? multiSiteParsedList.join(',') : undefined,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: backendDateMode,
        selected_date: backendSelectedDate,
        selected_month: selectedMonth,
        start_date: backendStartDate,
        end_date: backendEndDate,
        page: page,
        page_size: 25,
        upload_log_id: selectedArchiveLogId !== 'active' ? selectedArchiveLogId : undefined
      });
      if (res && res.results) {
        setRecords(res.results);
        setTotalPages(Math.ceil((res.count || 0) / 25) || 1);
      }
    } catch (e) {
      console.error('Failed to load availability records:', e);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadStatsData();
    loadRecordsData();
  }, [
    selectedState, selectedTerritory, selectedLga, selectedTech, selectedTowerCo, selectedVendor, selectedStatus, 
    selectedFse, sortBy, searchQuery, multiSiteParsedList, slaFilter, minAvailInput, maxAvailInput, 
    dateMode, selectedDateInput, selectedWeek, selectedMonth, startDateInput, endDateInput, page,
    selectedArchiveLogId
  ]);

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadMsg('Uploading and parsing Daily Availability spreadsheet across 2G, 3G, 4G, 5G sheets... This may take up to 20 seconds.');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'State Delivery Manager';
      formData.append('uploaded_by', uploaderName);

      const res = await uploadAvailabilityFile(formData);

      if (res && res.success) {
        setUploadMsg(`Successfully processed ${res.records_count} network elements across 2G/3G/4G/5G.`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSelectedArchiveLogId('active');
        if (res.end_date) {
          const uploadedMonth = res.end_date.substring(0, 7);
          setSelectedMonth(uploadedMonth);
          setStartDateInput(res.start_date || `${uploadedMonth}-01`);
          setEndDateInput(res.end_date);
          if (res.detected_dates && res.detected_dates.length > 0) {
            setSelectedDateInput(res.detected_dates[res.detected_dates.length - 1]);
          }
        }
        await loadArchivesData();
        await loadStatsData();
        await loadRecordsData();
      } else {
        setErrorMsg(res?.error || 'Failed to process Daily Availability spreadsheet.');
      }
    } catch (e) {
      console.error('Upload failed:', e);
      setErrorMsg(e.response?.data?.error || 'Failed to upload spreadsheet.');
    } finally {
      setUploading(false);
    }
  };

  const handleResetBase = async () => {
    if (!window.confirm('Are you sure you want to reset and reload the base Daily Availability database (2026-07-30.xlsb)? This will refresh all sheets.')) return;

    setUploading(true);
    setUploadMsg('Restoring base Daily Availability database from server repository...');
    setErrorMsg('');

    try {
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'System Administrator';
      const res = await resetBaseAvailability(uploaderName);
      if (res && res.success) {
        setUploadMsg('Base availability dataset restored successfully.');
        await loadArchivesData();
        await loadStatsData();
        await loadRecordsData();
      } else {
        setErrorMsg(res?.error || 'Failed to restore base availability database.');
      }
    } catch (e) {
      console.error('Reset base failed:', e);
      setErrorMsg(e.response?.data?.error || 'Server error while resetting base availability.');
    } finally {
      setUploading(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const sdmParam = currentUser && !currentUser.is_superuser ? (currentUser.full_name || currentUser.username) : undefined;
      let backendDateMode = dateMode;
      if (dateMode === 'week') backendDateMode = selectedWeek || 'week';
      else if (dateMode === 'day') backendDateMode = 'day';
      else if (dateMode === 'month') backendDateMode = 'month';
      else if (dateMode === 'all') backendDateMode = 'all';
      else if (dateMode === 'custom') backendDateMode = 'custom';

      const blob = await exportAvailabilityExcel({
        sdm: sdmParam,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        territory: selectedTerritory,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        site_ids: multiSiteParsedList.length > 0 ? multiSiteParsedList.join(',') : undefined,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: backendDateMode,
        selected_date: selectedDateInput,
        selected_month: selectedMonth,
        start_date: startDateInput,
        end_date: endDateInput
      });

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const labelStr = (stats?.date_range || 'Network_Report').replace(/[^a-zA-Z0-9]/g, '_');
      link.setAttribute('download', `Daily_Availability_Report_${labelStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (e) {
      console.error('Failed to export Excel report:', e);
      alert('Error generating Excel export file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-12">
      
      {/* Header Banner */}
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-cyan-500/30 shadow-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Daily Availability & SLA Operations
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {stats?.date_range || 'July 2026'}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                currentUser?.is_superuser
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {currentUser?.is_superuser
                  ? '🌐 SUPER ADMIN: ALL 37 NIGERIA STATES'
                  : (isFse ? `📍 ASSIGNED FSE: ${userName} (MY SITES ONLY)` : `📍 SDM SCOPE: ${stateInfo?.code} TERRITORY`)}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Daily Network Availability Command Center
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              {isFse
                ? `Monitor and inspect daily element availability percentages across your assigned sites. Track 2G, 3G, 4G, 5G SLA compliance and identify degraded sites requiring engineering intervention.`
                : `Upload, monitor, and analyze 2G, 3G, 4G, and 5G element availability percentages. SDMs can upload daily updates below to generate SLA reports, track degradation trends, and identify degraded sites.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadStatsData}
              disabled={loading}
              className="p-3 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-2xl border border-slate-700 transition-all shadow-md"
              title="Refresh Feeds"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-black rounded-2xl border border-emerald-500/40 transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40 hover:scale-105"
              title="Export formatted Excel report with executive summary and color-coded SLA availability matrix"
            >
              <FileSpreadsheet className={`w-4 h-4 text-emerald-400 ${isExporting ? 'animate-bounce' : ''}`} />
              <span>{isExporting ? 'Generating Excel...' : 'Export to Excel'}</span>
            </button>

            {!isFse && (
              <button
                onClick={handleResetBase}
                disabled={uploading}
                className="px-4 py-3 bg-slate-800/80 hover:bg-red-500/10 text-slate-300 hover:text-red-400 text-xs font-bold rounded-2xl border border-slate-700 hover:border-red-500/30 transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Base File</span>
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Daily Availability File Upload Zone (SDM Managers & Admins Only) */}
      {isFse ? (
        <div className="glass-panel p-4 rounded-3xl border border-cyan-500/20 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400 shadow-md">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Daily Availability Upload Portal (Restricted to SDM Managers & Admins)</span>
          </div>
          <span className="text-[10px] bg-cyan-950/80 text-cyan-300 px-2.5 py-1 rounded-xl border border-cyan-500/30 font-mono font-bold">
            FSE Read-Only Access
          </span>
        </div>
      ) : (
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl bg-slate-900/60 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                Daily Availability Upload Portal (Open to All SDMs)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload your daily availability spreadsheet (<span className="text-cyan-300 font-mono">.xlsb</span> / <span className="text-cyan-300 font-mono">.xlsx</span>) containing 2G, 3G, 4G, 5G daily scores.
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-xl border border-cyan-500/20">
              Active: {stats?.active_filename || '2026-07-30.xlsb'}
            </span>
          </div>

          {uploadMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{uploadMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsb,.xlsx,.xls"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-4 py-3 bg-slate-950 hover:bg-slate-900 text-slate-200 text-xs font-bold rounded-2xl border border-slate-700 flex items-center justify-center gap-2 flex-1 text-left truncate"
            >
              <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">{selectedFile ? selectedFile.name : 'Select or Browse Daily Availability File (.xlsb / .xlsx)...'}</span>
            </button>

            <button
              onClick={handleFileUpload}
              disabled={!selectedFile || uploading}
              className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${
                !selectedFile || uploading 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20'
              }`}
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                  <span>Processing Availability...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload & Apply Daily Report</span>
                </>
              )}
            </button>

            {selectedFile && !uploading && (
              <button
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="p-3 text-slate-400 hover:text-white bg-slate-800 rounded-2xl border border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}


      {/* 📁 MONTHLY ARCHIVE SELECTOR & DATASET HISTORY BAR */}
      <div className="glass-panel p-5 rounded-3xl border border-cyan-500/40 bg-slate-900/90 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-cyan-600 to-purple-600 rounded-2xl text-white shadow-lg">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-white">Daily Availability Dataset & Archive Center</h3>
              {stats?.active_filename && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center space-x-1">
                  <FileSpreadsheet className="w-3 h-3 text-cyan-400" />
                  <span>File: {stats.active_filename}</span>
                </span>
              )}
              {selectedArchiveLogId !== 'active' ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40 flex items-center space-x-1 animate-pulse">
                  <Archive className="w-3 h-3" />
                  <span>Viewing Archive File Data</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Latest Active Upload</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Every uploaded Excel dataset is preserved with its original file name and date range. Select any file from the dropdown to load and analyze its data.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <select
            value={selectedArchiveLogId}
            onChange={(e) => {
              setSelectedArchiveLogId(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-cyan-500/50 rounded-2xl px-4 py-2.5 text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-400 shadow-inner w-full md:w-80 cursor-pointer font-mono"
          >
            <option value="active">🟢 Active Upload: {archives.find(a => a.is_active)?.filename || stats?.active_filename || 'Latest File'}</option>
            {archives.map(arch => (
              <option key={arch.id} value={arch.id}>
                {arch.is_active ? '🟢 [Active] ' : '📁 [Archive] '} {arch.filename} ({arch.records_count?.toLocaleString()} elements — {arch.date_range})
              </option>
            ))}
          </select>

          {selectedArchiveLogId !== 'active' && (
            <button
              onClick={() => {
                setSelectedArchiveLogId('active');
                setPage(1);
              }}
              className="px-3.5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-extrabold rounded-2xl border border-cyan-400 whitespace-nowrap transition-all shadow-md flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Back to Active File</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Overall Availability</span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
              🟡 PI WEIGHTED
            </span>
          </div>
          <div className="text-2xl font-black text-white font-mono flex items-baseline gap-2">
            <span>{stats?.overall_avg !== undefined ? `${stats.overall_avg}%` : '---'}</span>
            {stats?.unweighted_overall_avg !== undefined && stats.unweighted_overall_avg !== stats.overall_avg && (
              <span className="text-xs font-normal text-slate-400 font-sans">
                (Raw: {stats.unweighted_overall_avg}%)
              </span>
            )}
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold block">
            MTN PI Weighted Average ({stats?.total_elements ? stats.total_elements.toLocaleString() : 0} Elements)
          </span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">SLA Compliant (≥ 98.5%)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono">
            {stats?.sla_compliant_count !== undefined ? stats.sla_compliant_count.toLocaleString() : '---'}
          </div>
          <span className="text-[10px] text-emerald-400/80 font-medium block">Meeting Target Threshold</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-950/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">SLA Degraded (&lt; 98.5%)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">
            {stats?.sla_breached_count !== undefined ? stats.sla_breached_count.toLocaleString() : '---'}
          </div>
          <span className="text-[10px] text-amber-400/80 font-medium block">Requiring Engineering Action</span>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-red-500/30 bg-red-950/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-300">Critical Breach (&lt; 95%)</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-black text-red-400 font-mono">
            {stats?.critical_breach_count !== undefined ? stats.critical_breach_count.toLocaleString() : '---'}
          </div>
          <span className="text-[10px] text-red-400/80 font-medium block">Severe Outage Impact</span>
        </div>

      </div>


      {/* Technology Breakdown Cards */}
      {stats?.tech_breakdown && (
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Technology Layer Availability Breakdown
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {['2G', '3G', '4G', '5G'].map((techKey) => {
              const info = stats.tech_breakdown[techKey] || { avg: 100.0, count: 0 };
              const isGood = info.avg >= 98.5;
              return (
                <div 
                  key={techKey}
                  onClick={() => setSelectedTech(techKey === selectedTech ? 'All' : techKey)}
                  className={`glass-panel p-4 rounded-2xl border cursor-pointer transition-all ${
                    selectedTech === techKey
                      ? 'border-cyan-400 bg-cyan-500/10 shadow-lg scale-[1.02]'
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-white font-mono">{techKey} Layer</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      isGood ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {info.avg}%
                    </span>
                  </div>
                  <div className="text-xl font-bold text-slate-200 mt-2 font-mono">{info.count.toLocaleString()}</div>
                  <span className="text-[10px] text-slate-400">Total Monitored Elements</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📊 PERIOD & DAILY NETWORK AVAILABILITY TREND GRAPH */}
      {stats?.timeline && stats.timeline.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                Network Availability Trend Graph ({stats?.date_range || 'Selected Period'})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daily and weekly element availability percentage curve across {stats?.total_elements ? stats.total_elements.toLocaleString() : 'all'} monitored site elements.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Chart Mode Toggle */}
              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setChartViewMode('area')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    chartViewMode === 'area'
                      ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Area Curve</span>
                </button>

                <button
                  onClick={() => setChartViewMode('candle')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    chartViewMode === 'candle'
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Candlestick (Candle)</span>
                </button>

                <button
                  onClick={() => setChartViewMode('bar')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    chartViewMode === 'bar'
                      ? 'bg-purple-500 text-white shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Bar Chart</span>
                </button>
              </div>

              <span className="text-[11px] font-mono font-bold bg-cyan-950/80 text-cyan-300 px-3 py-1 rounded-xl border border-cyan-500/30">
                SLA Target: 98.5%
              </span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartViewMode === 'candle' ? (
                <ComposedChart data={stats.timeline} margin={{ top: 15, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={['auto', 100]} stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isSla = (data.avg_availability || 0) >= 98.5;
                        return (
                          <div className="bg-slate-950 border border-cyan-500/50 p-3.5 rounded-2xl shadow-2xl text-xs space-y-1 font-mono">
                            <div className="font-bold text-white border-b border-slate-800 pb-1 flex items-center justify-between gap-3">
                              <span>📅 Date: {data.date}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] ${isSla ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                {isSla ? 'SLA OK' : 'OUTAGE'}
                              </span>
                            </div>
                            <div className="text-emerald-400 font-bold">🟢 High (Max): {data.max_availability}%</div>
                            <div className="text-cyan-300 font-black text-sm">📊 Avg Avail: {data.avg_availability}%</div>
                            <div className="text-amber-300">🟡 Open (25th Pct): {data.open}%</div>
                            <div className="text-purple-300">🟣 Close (75th Pct): {data.close}%</div>
                            <div className="text-red-400 font-bold">🔴 Low (Min): {data.min_availability}%</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={98.5} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'SLA 98.5%', fill: '#10b981', fontSize: 10 }} />
                  <Bar dataKey="avg_availability" shape={<CandlestickShape />} />
                </ComposedChart>
              ) : chartViewMode === 'bar' ? (
                <ComposedChart data={stats.timeline} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={['auto', 100]} stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#8b5cf6', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                    formatter={(value) => [`${value}%`, 'Avg Availability']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <ReferenceLine y={98.5} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'SLA 98.5%', fill: '#10b981', fontSize: 10 }} />
                  <Bar dataKey="avg_availability" name="Network Availability %" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </ComposedChart>
              ) : (
                <AreaChart data={stats.timeline} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="availColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={['auto', 100]} stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#06b6d4', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                    formatter={(value) => [`${value}%`, 'Avg Availability']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <ReferenceLine y={98.5} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'SLA 98.5%', fill: '#10b981', fontSize: 10 }} />
                  <Area type="monotone" dataKey="avg_availability" name="Network Availability %" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#availColor)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}



      {/* ENHANCED & CLEANED: Search & Filter Command Deck with Territory Support */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/70 space-y-3.5 shadow-xl">
        
        {/* Tier 1: Search and Primary Actions */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input Box */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Site ID, LGA, Territory, Vendor, FSE, or paste multiple IDs (e.g. FC0001, FC0002)..."
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                setPage(1);
                const parsed = parseSiteIdsFromText(val);
                if (parsed.length > 1) {
                  setMultiSiteParsedList(parsed);
                } else if (multiSiteParsedList.length > 0 && !val) {
                  setMultiSiteParsedList([]);
                }
              }}
              className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 pl-10 pr-9 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-mono shadow-inner transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setPage(1); }}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white p-0.5 rounded-md hover:bg-slate-800 transition-colors"
                title="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Tool Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Multi-Site Paste List Button */}
            <button
              onClick={() => setIsMultiSiteModalOpen(true)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-md ${
                multiSiteParsedList.length > 0
                  ? 'bg-cyan-500 text-slate-950 font-black border border-cyan-400 shadow-cyan-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700'
              }`}
              title="Paste a list of multiple site IDs from Excel, WhatsApp, or email"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>{multiSiteParsedList.length > 0 ? `📋 Multi-Site (${multiSiteParsedList.length})` : '📋 Paste Site List'}</span>
            </button>

            {/* Quick SDM Notes Button */}
            <button
              onClick={() => {
                loadMultiSiteNotes(multiSiteParsedList.length > 0 ? multiSiteParsedList : records.map(r => r.site_id));
                setIsMultiNotesModalOpen(true);
              }}
              className="px-3.5 py-2.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-md"
              title="View all SDM operational notes for currently displayed sites"
            >
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>SDM Notes {multiSiteNotes.length > 0 ? `(${multiSiteNotes.length})` : ''}</span>
            </button>

            {/* Reset All Filters Button */}
            <button
              onClick={handleResetFilters}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 hover:border-cyan-500/40 flex items-center gap-1.5 transition-all shadow-md shrink-0"
              title="Reset all filters and sorting to defaults"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Grouped Operational & Geographic Dropdown Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 pt-2 border-t border-slate-800/60">
          
          {/* Tech Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tech</label>
            <select
              value={selectedTech}
              onChange={(e) => { setSelectedTech(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Techs (2G, 3G, 4G, 5G)</option>
              <option value="2G">2G Only</option>
              <option value="3G">3G Only</option>
              <option value="4G">4G Only</option>
              <option value="5G">5G Only</option>
            </select>
          </div>

          {/* State Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">State</label>
            <select
              value={selectedState}
              onChange={(e) => { setSelectedState(e.target.value); setSelectedTerritory('All'); setSelectedLga('All'); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">
                {currentUser?.is_superuser ? 'All States' : 'All Managed States'}
              </option>
              {stats?.available_states && stats.available_states.length > 0 ? (
                stats.available_states.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))
              ) : (
                <option value={stateInfo?.code}>{stateInfo?.code}</option>
              )}
            </select>
          </div>

          {/* Territory Filter (New!) */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block flex items-center gap-1">
              <MapPin className="w-3 h-3 text-cyan-400" />
              <span>Territory</span>
            </label>
            <select
              value={selectedTerritory}
              onChange={(e) => { setSelectedTerritory(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-cyan-500/50 focus:outline-none focus:border-cyan-400 font-semibold shadow-inner"
            >
              <option value="All">
                {stats?.available_territories && stats.available_territories.length > 0 
                  ? `All Territories (${stats.available_territories.length})` 
                  : 'All Territories'}
              </option>
              {stats?.available_territories && stats.available_territories.map((terr) => (
                <option key={terr} value={terr}>{terr}</option>
              ))}
            </select>
          </div>

          {/* LGA Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">LGA</label>
            <select
              value={selectedLga}
              onChange={(e) => { setSelectedLga(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">
                {stats?.available_lgas && stats.available_lgas.length > 0 ? `All LGAs (${stats.available_lgas.length})` : 'All LGAs'}
              </option>
              {stats?.available_lgas && stats.available_lgas.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* SMC FSE Engineer Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SMC FSE</label>
            {!isFse ? (
              <select
                value={selectedFse}
                onChange={(e) => { setSelectedFse(e.target.value); setPage(1); }}
                className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
              >
                <option value="All">
                  {currentUser?.is_superuser ? 'All FSEs (540)' : 'All SMC FSE Engineers'}
                </option>
                {stats?.available_fses && stats.available_fses.map((fseName) => (
                  <option key={fseName} value={fseName}>{fseName}</option>
                ))}
              </select>
            ) : (
              <div className="w-full bg-cyan-950/60 text-cyan-300 text-xs p-2 rounded-xl border border-cyan-500/40 font-semibold font-mono truncate shadow-inner">
                {userName}
              </div>
            )}
          </div>

          {/* Tower Co Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tower Co</label>
            <select
              value={selectedTowerCo}
              onChange={(e) => { setSelectedTowerCo(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Tower Cos</option>
              {stats?.available_tower_cos && stats.available_tower_cos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vendor</label>
            <select
              value={selectedVendor}
              onChange={(e) => { setSelectedVendor(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Vendors</option>
              {stats?.available_vendors && stats.available_vendors.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Statuses</option>
              {stats?.available_statuses ? stats.available_statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              )) : (
                <>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Decommissioned">Decommissioned</option>
                </>
              )}
            </select>
          </div>

          {/* Sort By Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Sort Order</label>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="w-full bg-slate-950 text-xs text-amber-400 p-2 rounded-xl border border-amber-500/40 focus:outline-none focus:border-amber-400 font-extrabold"
            >
              <option value="worst">🔽 Worst Availability First</option>
              <option value="pi_worst">⚠️ Worst by PI Outage Impact</option>
              <option value="pi_weight">🎯 Highest PI Weight (Capacity)</option>
              <option value="best">🔼 Best Availability First</option>
              <option value="site_id">🔤 Site ID</option>
              <option value="state">🏛️ State</option>
              <option value="territory">📍 Territory</option>
              <option value="lga">🗺️ LGA</option>
            </select>
          </div>
        </div>

        {/* Tier 3: Active Filters Pills Bar (When any filter is active) */}
        {(selectedTech !== 'All' || selectedState !== 'All' || selectedTerritory !== 'All' || selectedLga !== 'All' || selectedTowerCo !== 'All' || selectedVendor !== 'All' || selectedStatus !== 'All' || selectedFse !== 'All' || slaFilter !== 'all' || minAvailInput !== '' || maxAvailInput !== '' || searchQuery !== '' || multiSiteParsedList.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/60 text-xs">
            <span className="text-[11px] font-bold text-slate-400 font-mono mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-cyan-400" />
              Active Filters:
            </span>
            {selectedState !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold">
                <span>🏛️ State: {selectedState}</span>
                <button onClick={() => { setSelectedState('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedTerritory !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 rounded-lg text-[11px] font-bold shadow-sm">
                <span>📍 Territory: {selectedTerritory}</span>
                <button onClick={() => { setSelectedTerritory('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedLga !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold">
                <span>🗺️ LGA: {selectedLga}</span>
                <button onClick={() => { setSelectedLga('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedTech !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-500/40 rounded-lg text-[11px] font-semibold">
                <span>📶 Tech: {selectedTech}</span>
                <button onClick={() => { setSelectedTech('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedFse !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-cyan-300 border border-cyan-500/30 rounded-lg text-[11px] font-semibold">
                <span>👤 FSE: {selectedFse}</span>
                <button onClick={() => { setSelectedFse('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedTowerCo !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold">
                <span>🗼 Tower: {selectedTowerCo}</span>
                <button onClick={() => { setSelectedTowerCo('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedVendor !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold">
                <span>⚙️ Vendor: {selectedVendor}</span>
                <button onClick={() => { setSelectedVendor('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedStatus !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold">
                <span>Status: {selectedStatus}</span>
                <button onClick={() => { setSelectedStatus('All'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {slaFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-950/80 text-red-300 border border-red-500/40 rounded-lg text-[11px] font-semibold">
                <span>SLA: {slaFilter.replace(/_/g, ' ')}</span>
                <button onClick={() => { setSlaFilter('all'); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {(minAvailInput !== '' || maxAvailInput !== '') && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold font-mono">
                <span>Avail: {minAvailInput || '0'}% - {maxAvailInput || '100'}%</span>
                <button onClick={() => { setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-white border border-slate-600 rounded-lg text-[11px] font-mono">
                <span>Search: "{searchQuery}"</span>
                <button onClick={() => { setSearchQuery(''); setPage(1); }} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}
            {multiSiteParsedList.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-cyan-500 text-slate-950 font-bold rounded-lg text-[11px] font-mono">
                <span>{multiSiteParsedList.length} Sites Pasted</span>
                <button onClick={handleClearMultiSiteSearch} className="hover:text-red-900 ml-0.5"><X className="w-3 h-3" /></button>
              </span>
            )}

            <button
              onClick={handleResetFilters}
              className="ml-auto text-[11px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline py-0.5"
            >
              Clear All Filters
            </button>
          </div>
        )}

        {/* Row 2: Date/Time Period Filter Section - Enhanced */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 font-mono">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            PERIOD:
          </span>

          {/* Date Mode Toggle Buttons */}
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => { setDateMode('day'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1.5 ${
                dateMode === 'day'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3 h-3" />
              Single Day
            </button>
            <button
              onClick={() => { setDateMode('week'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1.5 ${
                dateMode === 'week'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CalendarDays className="w-3 h-3" />
              Week (7 Days)
            </button>
            <button
              onClick={() => { setDateMode('month'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1.5 ${
                dateMode === 'month'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CalendarRange className="w-3 h-3" />
              Month (30 Days)
            </button>
            <button
              onClick={() => { setDateMode('all'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1.5 ${
                dateMode === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Database className="w-3 h-3 text-cyan-400" />
              All Days ({stats?.all_detected_dates?.length || 45} Days)
            </button>
            <button
              onClick={() => { setDateMode('custom'); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all flex items-center gap-1.5 ${
                dateMode === 'custom'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Custom Range
            </button>
          </div>

          {/* Day Selector */}
          {dateMode === 'day' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-cyan-400 font-mono tracking-wider">DAY:</span>
              <select
                value={selectedDateInput}
                onChange={(e) => { setSelectedDateInput(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-cyan-300 px-3 py-1.5 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono font-bold shadow-inner"
              >
                {stats?.all_detected_dates && stats.all_detected_dates.length > 0 ? (
                  [...stats.all_detected_dates].reverse().map(d => (
                    <option key={d} value={d}>📅 {d}</option>
                  ))
                ) : (
                  <option value="2026-08-18">📅 2026-08-18</option>
                )}
              </select>
            </div>
          )}

          {/* Week Selector */}
          {dateMode === 'week' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-cyan-400 font-mono tracking-wider">WEEK:</span>
              <select
                value={selectedWeek}
                onChange={(e) => { setSelectedWeek(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-cyan-300 px-3 py-1.5 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono font-bold shadow-inner"
              >
                {weeks.map(week => (
                  <option key={week.id} value={week.id}>
                    {week.label} ({week.dates})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Month Selector */}
          {dateMode === 'month' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-cyan-400 font-mono tracking-wider">MONTH:</span>
              <select
                value={selectedMonth}
                onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-cyan-300 px-3 py-1.5 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono font-bold shadow-inner"
              >
                {months.map(month => (
                  <option key={month.id} value={month.id}>
                    📅 {month.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Date Range Selector */}
          {dateMode === 'custom' && (
            <div className="flex items-center space-x-1 font-mono text-xs">
              <input
                type="date"
                value={startDateInput}
                onChange={(e) => { setStartDateInput(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-white p-1.5 rounded-lg border border-slate-700 focus:border-cyan-400"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={endDateInput}
                onChange={(e) => { setEndDateInput(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-white p-1.5 rounded-lg border border-slate-700 focus:border-cyan-400"
              />
            </div>
          )}
        </div>

        {/* Row 3: Availability Percentage Filter Section */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 font-mono">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              AVAILABILITY % RANGE:
            </span>
            <div className="flex items-center space-x-1.5 font-mono">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="Min"
                value={minAvailInput}
                onChange={(e) => {
                  setMinAvailInput(e.target.value);
                  setSlaFilter('all');
                  setPage(1);
                }}
                className="w-20 bg-slate-950 text-xs text-white placeholder-slate-600 px-2 py-1 rounded-lg border border-slate-700 focus:border-cyan-400"
              />
              <span className="text-slate-500">-</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="Max"
                value={maxAvailInput}
                onChange={(e) => {
                  setMaxAvailInput(e.target.value);
                  setSlaFilter('all');
                  setPage(1);
                }}
                className="w-20 bg-slate-950 text-xs text-white placeholder-slate-600 px-2 py-1 rounded-lg border border-slate-700 focus:border-cyan-400"
              />
            </div>

            {(minAvailInput !== '' || maxAvailInput !== '' || slaFilter !== 'all') && (
              <button
                onClick={() => {
                  setSlaFilter('all');
                  setMinAvailInput('');
                  setMaxAvailInput('');
                  setPage(1);
                }}
                className="px-2.5 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg text-[10px] font-bold border border-red-500/40"
              >
                Clear
              </button>
            )}
          </div>

          {/* Preset Percentage Quick Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => { setSlaFilter('critical_under_95'); setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all whitespace-nowrap ${
                slaFilter === 'critical_under_95' 
                  ? 'bg-red-500/30 text-red-200 border border-red-500/60' 
                  : 'bg-slate-950 text-red-400/80 border border-red-500/20 hover:bg-slate-800'
              }`}
            >
              <span className="text-red-400">🔴</span> &lt; 95% Critical
            </button>
            <button
              onClick={() => { setSlaFilter('degraded_under_98'); setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all whitespace-nowrap ${
                slaFilter === 'degraded_under_98' 
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-500/60' 
                  : 'bg-slate-950 text-amber-400/80 border border-amber-500/20 hover:bg-slate-800'
              }`}
            >
              <span className="text-amber-400">🟡</span> &lt; 98% Degraded
            </button>
            <button
              onClick={() => { setSlaFilter('warning_95_98'); setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all whitespace-nowrap ${
                slaFilter === 'warning_95_98' 
                  ? 'bg-orange-500/30 text-orange-200 border border-orange-500/60' 
                  : 'bg-slate-950 text-orange-400/80 border border-orange-500/20 hover:bg-slate-800'
              }`}
            >
              <span className="text-orange-400">🟠</span> 95-97.9% Warning
            </button>
            <button
              onClick={() => { setSlaFilter('high_98_100'); setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all whitespace-nowrap ${
                slaFilter === 'high_98_100' 
                  ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/60' 
                  : 'bg-slate-950 text-emerald-400/80 border border-emerald-500/20 hover:bg-slate-800'
              }`}
            >
              <span className="text-emerald-400">🟢</span> 98-99.9% High
            </button>
            <button
              onClick={() => { setSlaFilter('perfect_100'); setMinAvailInput(''); setMaxAvailInput(''); setPage(1); }}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all whitespace-nowrap ${
                slaFilter === 'perfect_100' 
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-500/60' 
                  : 'bg-slate-950 text-cyan-400/80 border border-cyan-500/20 hover:bg-slate-800'
              }`}
            >
              <span className="text-cyan-400">🔵</span> 100% Perfect
            </button>
          </div>
        </div>
      </div>


      {/* 🎯 MULTI-SITE ACTIVE INTELLIGENCE & CONTROL BANNER */}
      {multiSiteParsedList.length > 0 && (
        <div className="glass-panel p-5 rounded-3xl border-2 border-cyan-500/50 bg-gradient-to-r from-cyan-950/70 via-slate-900/90 to-purple-950/70 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-2xl border border-cyan-500/40 shrink-0">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black text-white">
                    Multi-Site Search Active
                  </h4>
                  <span className="px-2.5 py-0.5 bg-cyan-500 text-slate-950 font-black font-mono text-xs rounded-full shadow-sm">
                    {multiSiteParsedList.length} Site IDs Queried
                  </span>
                  <span className="px-2.5 py-0.5 bg-slate-800 text-cyan-300 font-bold font-mono text-xs rounded-full border border-slate-700">
                    {records.length} Matched in Current Filter
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Analyzing daily availability metrics, outage trends, and SDM operational notes for your pasted site portfolio.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              {/* Worst Performing Sort Button */}
              <button
                onClick={() => {
                  setSortBy('worst');
                  setPage(1);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md ${
                  sortBy === 'worst'
                    ? 'bg-amber-500 text-slate-950 shadow-amber-500/20 ring-2 ring-amber-400/50 scale-[1.02]'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
                }`}
                title="Sort pulled sites by worst availability performance first"
              >
                <TrendingDown className="w-4 h-4 text-slate-950" />
                <span>{sortBy === 'worst' ? '✓ Filter: Worst Performing First' : 'Sort Worst Performing'}</span>
              </button>

              {/* View All SDM Notes Button */}
              <button
                onClick={() => {
                  loadMultiSiteNotes(multiSiteParsedList);
                  setIsMultiNotesModalOpen(true);
                }}
                className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-950/40 transition-all flex items-center gap-1.5"
                title="View all SDM operational notes and RCA history for these sites"
              >
                <FileText className="w-4 h-4" />
                <span>View SDM Notes ({multiSiteNotes.length > 0 ? multiSiteNotes.length : '...'})</span>
              </button>

              {/* Edit / Paste New Sites */}
              <button
                onClick={() => setIsMultiSiteModalOpen(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-1"
              >
                <span>Edit Site List</span>
              </button>

              {/* Clear Multi-Site Search */}
              <button
                onClick={handleClearMultiSiteSearch}
                className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-xs font-bold border border-red-500/40 transition-all flex items-center gap-1"
                title="Clear multi-site filter"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Queried Site Tags Row */}
          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 font-mono">Pasted Site IDs:</span>
            {multiSiteParsedList.map((sid) => {
              const isMatched = records.some(r => r.site_id === sid);
              return (
                <span
                  key={sid}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${
                    isMatched 
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50 shadow-sm' 
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <button
                    onClick={() => onSelectSite && onSelectSite(sid)}
                    className="hover:underline"
                    title={`Inspect site ${sid}`}
                  >
                    {sid}
                  </button>
                  <button
                    onClick={() => {
                      const next = multiSiteParsedList.filter(x => x !== sid);
                      handleApplyMultiSiteSearch(next, sortBy === 'worst');
                    }}
                    className="hover:text-red-400 text-slate-500 font-black text-sm leading-none"
                    title={`Remove ${sid} from search`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}


      {/* 🗺️ LGA AVAILABILITY BREAKDOWN GRID (% FOR EACH LGA) - PLACED BELOW FILTER */}
      {stats?.lga_breakdown && stats.lga_breakdown.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-cyan-500/30 bg-slate-900/60 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>Local Government Area (LGA) Availability Performance</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time availability percentage by LGA • Target SLA: <b className="text-emerald-400 font-mono">98.5%</b>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-mono text-cyan-300 bg-cyan-950/60 px-3 py-1.5 rounded-xl border border-cyan-500/30">
                🏛️ {stats.lga_breakdown.length} Monitored LGAs
              </div>

              {stats.lga_breakdown.length > 3 && (
                <button
                  onClick={() => setShowAllLgas(!showAllLgas)}
                  className="px-3.5 py-1.5 bg-cyan-600/20 hover:bg-cyan-500/30 text-cyan-300 hover:text-cyan-200 font-extrabold text-xs rounded-xl border border-cyan-500/40 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <span>{showAllLgas ? 'Show Top 3 LGAs' : `View All (${stats.lga_breakdown.length})`}</span>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAllLgas ? 'rotate-90' : ''}`} />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {(showAllLgas ? stats.lga_breakdown : stats.lga_breakdown.slice(0, 3)).map((lgaItem) => {
              const isGood = lgaItem.avg >= 98.5;
              const isWarning = lgaItem.avg >= 95.0 && lgaItem.avg < 98.5;
              const isSelected = selectedLga === lgaItem.lga;

              return (
                <div
                  key={lgaItem.lga}
                  className={`glass-panel p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                    isSelected 
                      ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50 scale-[1.02]' 
                      : isGood 
                      ? 'border-slate-800 bg-slate-900/70 hover:border-emerald-500/40' 
                      : isWarning 
                      ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-500/70' 
                      : 'border-red-500/50 bg-red-950/20 hover:border-red-500'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => {
                          setSelectedLga(isSelected ? 'All' : lgaItem.lga);
                          setPage(1);
                        }}
                        className="font-mono font-black text-sm text-cyan-300 hover:underline flex items-center gap-1.5 text-left"
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{lgaItem.lga}</span>
                      </button>

                      <span className={`px-2 py-0.5 rounded text-[10px] font-black border font-mono ${
                        isGood 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : isWarning 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                          : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                      }`}>
                        {lgaItem.avg}%
                      </span>
                    </div>

                    {/* Monitored Count & SLA Compliance Progress */}
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 mb-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Monitored Elements:</span>
                        <b className="text-slate-200 font-mono">{lgaItem.count} Sites</b>
                      </div>

                      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div 
                          style={{ width: `${Math.min(100, lgaItem.avg)}%` }} 
                          className={`h-full transition-all ${
                            isGood ? 'bg-emerald-500' : isWarning ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <span className="text-emerald-400">
                          🟢 {lgaItem.sla_compliant_count} Met (≥98.5%)
                        </span>
                        {lgaItem.sla_breached_count > 0 && (
                          <span className="text-amber-400">
                            🟡 {lgaItem.sla_breached_count} Breached
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Worst Site In LGA */}
                    {lgaItem.worst_site_id && (
                      <div className="text-[10px] text-slate-400 mb-3 flex items-center justify-between bg-slate-950/40 px-2 py-1 rounded-lg border border-slate-800/60">
                        <span>Worst Site:</span>
                        <button
                          onClick={() => onSelectSite && onSelectSite(lgaItem.worst_site_id)}
                          className="font-mono font-bold text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <span>{lgaItem.worst_site_id}</span>
                          <span className={lgaItem.worst_site_avail < 98.5 ? 'text-amber-400' : 'text-emerald-400'}>
                            ({lgaItem.worst_site_avail}%)
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* LGA Actions */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1.5">
                    <button
                      onClick={() => {
                        setSelectedLga(isSelected ? 'All' : lgaItem.lga);
                        setPage(1);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold border transition-all flex items-center gap-1 ${
                        isSelected 
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black' 
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      <span>{isSelected ? 'Active Filter' : 'Filter Grid'}</span>
                    </button>

                    <button
                      onClick={() => handleGenerateLgaReport(lgaItem)}
                      className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-[10px] font-extrabold shadow-md transition-all flex items-center gap-1 shrink-0"
                    >
                      <FileText className="w-3 h-3" />
                      <span>LGA Report</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!showAllLgas && stats.lga_breakdown.length > 3 && (
            <div className="text-center pt-2 border-t border-slate-800/80">
              <button
                onClick={() => setShowAllLgas(true)}
                className="px-5 py-2.5 bg-slate-800/90 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 font-bold text-xs rounded-xl border border-slate-700 hover:border-cyan-500/40 transition-all inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <span>View All {stats.lga_breakdown.length} Local Government Areas</span>
                <ChevronRight className="w-4 h-4 text-cyan-400" />
              </button>
            </div>
          )}
        </div>
      )}


      {/* Worst Performing Degraded Sites UI Cards & Table */}
      {stats?.worst_sites && stats.worst_sites.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-amber-500/40 bg-slate-900/80 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Worst Degraded Sites (Priority SLA Outages)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Priority elements requiring field intervention • <b className="text-red-400 font-mono">{stats.worst_sites.length} Sites Impacted</b>
              </p>
            </div>

            <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setWorstViewMode('cards')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  worstViewMode === 'cards'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Site Cards UI</span>
              </button>

              <button
                onClick={() => setWorstViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                  worstViewMode === 'table'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Table View</span>
              </button>
            </div>
          </div>

          {worstViewMode === 'cards' ? (
            /* 🚨 DEGRADED SITES CARDS GRID (4 PER ROW) */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {stats.worst_sites.map((site) => {
                const val = site.period_availability !== undefined ? site.period_availability : site.avg_availability;
                const isCritical = val < 95.0;
                const floatVal = (v) => parseFloat(v) || 0.0;

                return (
                  <div 
                    key={`${site.site_id}_${site.tech}`}
                    className={`glass-panel p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden ${
                      isCritical 
                        ? 'border-red-500/60 bg-red-950/20 shadow-lg shadow-red-950/40 hover:border-red-400' 
                        : 'border-amber-500/50 bg-amber-950/20 hover:border-amber-400'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => onSelectSite && onSelectSite(site.site_id)}
                            className="font-mono font-black text-sm text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30 hover:underline flex items-center gap-1"
                          >
                            <Radio className="w-3 h-3 text-cyan-400" />
                            <span>{site.site_id}</span>
                          </button>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] rounded border border-purple-500/30">
                            {site.tech}
                          </span>
                        </div>

                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-full border ${
                          isCritical 
                            ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse' 
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}>
                          {isCritical ? '🔴 CRITICAL' : '🟡 DEGRADED'}
                        </span>
                      </div>

                      {/* Info Pills */}
                      <div className="text-[11px] text-slate-300 mb-2.5 flex flex-wrap items-center gap-1">
                        <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[10px] font-medium border border-slate-800">
                          🏛️ {site.state || 'FCT'}
                        </span>
                        {site.territory && (
                          <span className="bg-cyan-950/60 px-2 py-0.5 rounded text-cyan-300 text-[10px] font-medium border border-cyan-500/30">
                            📍 {site.territory}
                          </span>
                        )}
                        {site.lga && (
                          <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[10px] font-medium border border-slate-800">
                            🗺️ {site.lga}
                          </span>
                        )}
                        {site.tower_co && (
                          <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[10px] font-medium border border-slate-800">
                            🗼 {site.tower_co}
                          </span>
                        )}
                      </div>

                      {/* Big Availability Metric Badge */}
                      <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 mb-2.5 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Avg Availability</span>
                          <span className={`text-xl font-black font-mono mt-0.5 block ${
                            isCritical ? 'text-red-400 animate-pulse' : 'text-amber-400'
                          }`}>
                            {val}%
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Latest Day</span>
                          <span className="text-xs font-black font-mono text-slate-200 block mt-0.5">
                            {site.latest_availability}%
                          </span>
                        </div>
                      </div>

                      {/* 📅 30-Day Daily Heatmap & Sparkline */}
                      {site.daily_scores && Object.keys(site.daily_scores).length > 0 && (
                        <div className="space-y-1 mb-2.5">
                          <div className="flex items-center justify-between text-[9px] text-slate-400">
                            <span className="font-bold flex items-center gap-1">
                              <CalendarDays className="w-3 h-3 text-cyan-400" />
                              Daily Availability Trend
                            </span>
                            <span className="font-mono text-slate-400 text-[9px]">{Object.keys(site.daily_scores).length} Days</span>
                          </div>

                          <div className="flex items-end gap-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 h-12 w-full overflow-x-auto">
                            {Object.entries(site.daily_scores)
                              .sort(([d1], [d2]) => d1.localeCompare(d2))
                              .map(([dayStr, score]) => {
                                const numScore = floatVal(score);
                                const heightPct = Math.max(15, Math.min(100, numScore));
                                const barColor = numScore >= 98.0 ? 'bg-emerald-500 hover:bg-emerald-400' :
                                                 numScore >= 95.0 ? 'bg-amber-500 hover:bg-amber-400' :
                                                 'bg-red-500 hover:bg-red-400';
                                return (
                                  <div
                                    key={dayStr}
                                    onClick={() => setSelectedSiteModal({ record: site, targetDay: dayStr })}
                                    className="group/bar relative flex-1 min-w-[5px] cursor-pointer flex flex-col justify-end h-full"
                                    title={`${dayStr}: ${numScore}%`}
                                  >
                                    <div 
                                      style={{ height: `${heightPct}%` }}
                                      className={`w-full rounded-t-sm transition-all ${barColor}`}
                                    />
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => setSelectedSiteModal({ record: site })}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-lg text-[10px] font-bold border border-slate-700 transition-all flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span>Daily Logs</span>
                      </button>

                      {onSelectSite && (
                        <button
                          onClick={() => onSelectSite(site.site_id)}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-bold shadow-md transition-all flex items-center gap-1"
                        >
                          <span>Inspect Site</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View Fallback */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-extrabold">
                    <th className="py-2.5 px-3">Site ID</th>
                    <th className="py-2.5 px-3">Tech</th>
                    <th className="py-2.5 px-3">State</th>
                    <th className="py-2.5 px-3">Territory</th>
                    <th className="py-2.5 px-3">LGA</th>
                    <th className="py-2.5 px-3">Tower Co</th>
                    <th className="py-2.5 px-3 text-center">Month Avg %</th>
                    <th className="py-2.5 px-3 text-center">Latest Day %</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {stats.worst_sites.map((site) => (
                    <tr key={`${site.site_id}_${site.tech}`} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-black text-cyan-300">{site.site_id}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-slate-200">{site.tech}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{site.state || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-cyan-300 font-medium">{site.territory || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-slate-400">{site.lga || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-slate-400">{site.tower_co || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold ${
                          site.avg_availability < 95.0 
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {site.avg_availability}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-300">{site.latest_availability}%</td>
                      <td className="py-2.5 px-3 text-right space-x-1">
                        <button
                          onClick={() => setSelectedSiteModal({ record: site })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[10px] font-bold border border-slate-700"
                        >
                          Daily UI
                        </button>

                        {onSelectSite && (
                          <button
                            onClick={() => onSelectSite(site.site_id)}
                            className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-bold"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}


      {/* Full Paginated Daily Availability Records (Daily UI Cards & Matrix Table Views) */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/60 space-y-4">
        {/* Header & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>Daily Network Availability Command Center</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Filtered Sites: <b className="text-cyan-300 font-mono">{records.length} Sites</b> (Page {page} of {totalPages})
            </p>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-700 self-stretch sm:self-auto justify-center">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                viewMode === 'cards'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Daily Site Cards UI</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Matrix Table View</span>
            </button>
          </div>
        </div>

        {/* RECORDS LOADING STATE */}
        {recordsLoading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
            <span className="text-xs font-bold">Loading availability records for filtered sites...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No availability records found matching the active filters.
          </div>
        ) : viewMode === 'cards' ? (
          /* 📅 DAILY UI CARDS VIEW FOR EACH FILTERED SITE */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {records.map((r) => {
              const val = r.period_availability !== undefined ? r.period_availability : r.avg_availability;
              const isGood = val >= 98.0;
              const isWarning = val >= 95.0 && val < 98.0;
              const floatVal = (v) => parseFloat(v) || 0.0;

              return (
                <div 
                  key={`${r.site_id}_${r.tech}`}
                  className={`glass-panel p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    val < 95.0 
                      ? 'border-red-500/50 bg-slate-900/90 shadow-xl shadow-red-950/20 hover:border-red-500' 
                      : val < 98.0 
                      ? 'border-amber-500/40 bg-slate-900/80 hover:border-amber-500/70' 
                      : 'border-slate-800 bg-slate-900/70 hover:border-cyan-500/40 hover:bg-slate-900'
                  }`}
                >
                  <div>
                    {/* Card Top Header */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onSelectSite && onSelectSite(r.site_id)}
                          className="font-mono font-black text-sm text-cyan-300 bg-cyan-950/50 px-2.5 py-1 rounded-lg border border-cyan-500/30 hover:underline flex items-center gap-1"
                        >
                          <Radio className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{r.site_id}</span>
                        </button>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded border border-purple-500/30">
                          {r.tech}
                        </span>
                      </div>

                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full border ${
                        r.status === 'Active' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {r.status || 'Active'}
                      </span>
                    </div>

                    {/* Location & Metadata Badges */}
                    <div className="text-xs text-slate-300 mb-3 flex flex-wrap items-center gap-1.5">
                      <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[11px] font-medium border border-slate-800">
                        🏛️ {r.state || 'FCT'}
                      </span>
                      {r.territory && (
                        <span className="bg-cyan-950/60 px-2 py-0.5 rounded text-cyan-300 text-[11px] font-medium border border-cyan-500/30">
                          📍 {r.territory}
                        </span>
                      )}
                      {r.lga && (
                        <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[11px] font-medium border border-slate-800">
                          🗺️ {r.lga}
                        </span>
                      )}
                      {r.tower_co && (
                        <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[11px] font-medium border border-slate-800">
                          🗼 {r.tower_co}
                        </span>
                      )}
                      {r.vendor && (
                        <span className="bg-slate-950 px-2 py-0.5 rounded text-slate-400 text-[11px] font-medium border border-slate-800">
                          ⚙️ {r.vendor}
                        </span>
                      )}
                    </div>

                    {/* Metric Card Banner */}
                    <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                          {dateMode === 'day' ? `Day ${selectedDateInput}` : 'Period Avg Availability'}
                        </div>
                        <div className={`text-2xl font-black font-mono mt-0.5 ${
                          isGood ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-red-400 animate-pulse'
                        }`}>
                          {val}%
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                          isGood 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                            : isWarning 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                            : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                        }`}>
                          {isGood ? '🟢 SLA MET' : isWarning ? '🟡 DEGRADED' : '🔴 OUTAGE'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          Latest: <b className="text-slate-200">{r.latest_availability}%</b>
                        </div>
                      </div>
                    </div>

                    {/* 📊 30-Day Daily Heatmap & Sparkline Bar Chart */}
                    {r.daily_scores && Object.keys(r.daily_scores).length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="font-bold flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
                            Daily Availability Breakdown
                          </span>
                          <span className="font-mono text-slate-400 text-[10px]">{Object.keys(r.daily_scores).length} Days</span>
                        </div>

                        <div className="flex items-end gap-1 bg-slate-950 p-2 rounded-xl border border-slate-800/80 h-16 w-full overflow-x-auto">
                          {Object.entries(r.daily_scores)
                            .sort(([d1], [d2]) => d1.localeCompare(d2))
                            .map(([dayStr, score]) => {
                              const numScore = floatVal(score);
                              const heightPct = Math.max(15, Math.min(100, numScore));
                              const barColor = numScore >= 98.0 ? 'bg-emerald-500 hover:bg-emerald-400' :
                                               numScore >= 95.0 ? 'bg-amber-500 hover:bg-amber-400' :
                                               'bg-red-500 hover:bg-red-400';
                              return (
                                <div
                                  key={dayStr}
                                  onClick={() => setSelectedSiteModal({ record: r, targetDay: dayStr })}
                                  className="group/bar relative flex-1 min-w-[6px] cursor-pointer flex flex-col justify-end h-full"
                                  title={`${dayStr}: ${numScore}%`}
                                >
                                  <div 
                                    style={{ height: `${heightPct}%` }}
                                    className={`w-full rounded-t-sm transition-all ${barColor}`}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Daily Quick Stats Chips */}
                    {r.daily_scores && (
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-3">
                        <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-center">
                          <span className="text-slate-400 block text-[9px]">Best Day</span>
                          <span className="font-mono font-extrabold text-emerald-400">
                            {Math.max(...Object.values(r.daily_scores).map(floatVal))}%
                          </span>
                        </div>
                        <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-center">
                          <span className="text-slate-400 block text-[9px]">Worst Day</span>
                          <span className="font-mono font-extrabold text-red-400">
                            {Math.min(...Object.values(r.daily_scores).map(floatVal))}%
                          </span>
                        </div>
                        <div className="bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-center">
                          <span className="text-slate-400 block text-[9px]">Below SLA (&lt;98%)</span>
                          <span className="font-mono font-extrabold text-amber-400">
                            {Object.values(r.daily_scores).filter(v => floatVal(v) < 98.0).length} Days
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedSiteModal({ record: r })}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-1"
                        title="View daily breakdown logs"
                      >
                        <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Daily UI</span>
                      </button>

                      <button
                        onClick={() => {
                          loadMultiSiteNotes([r.site_id]);
                          setNotesSiteFilter(r.site_id);
                          setIsMultiNotesModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 hover:text-purple-200 rounded-xl text-xs font-bold border border-purple-500/40 transition-all flex items-center gap-1"
                        title={`View SDM operational notes for ${r.site_id}`}
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-400" />
                        <span>Notes</span>
                      </button>
                    </div>

                    {onSelectSite && (
                      <button
                        onClick={() => onSelectSite(r.site_id)}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          /* 📋 MATRIX TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-extrabold">
                  <th className="py-3 px-3">Site ID</th>
                  <th className="py-3 px-3">Tech</th>
                  <th className="py-3 px-3">State</th>
                  <th className="py-3 px-3">Territory</th>
                  <th className="py-3 px-3">LGA</th>
                  <th className="py-3 px-3">Tower Co</th>
                  <th className="py-3 px-3 text-center text-amber-400">PI Weight</th>
                  <th className="py-3 px-3 text-center text-cyan-300">
                    {dateMode === 'day' ? `📆 ${selectedDateInput} Availability %` :
                     dateMode === 'week' ? `📊 Week Avg %` :
                     dateMode === 'month' ? `📈 Month Avg % (${selectedMonth})` :
                     dateMode === 'custom' ? `⚙️ Custom Period Avg %` :
                     `📊 Period Avg Availability %`}
                  </th>
                  <th className="py-3 px-3 text-center">Latest Day %</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {records.map((r) => {
                  const val = r.period_availability !== undefined ? r.period_availability : r.avg_availability;
                  const isGood = val >= 98.0;
                  const isWarning = val >= 95.0 && val < 98.0;
                  const piWeightDisplay = r.pi_national > 0
                    ? `${(r.pi_national * 100).toFixed(4)}%`
                    : (r.pi_state > 0 ? `${(r.pi_state * 100).toFixed(3)}%` : '---');

                  return (
                    <tr key={`${r.site_id}_${r.tech}`} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-white">{r.site_id}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-cyan-300">{r.tech}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{r.state || 'N/A'}</td>
                      <td className="py-3 px-3 text-cyan-300 font-medium">{r.territory || 'N/A'}</td>
                      <td className="py-3 px-3 text-slate-400">{r.lga || 'N/A'}</td>
                      <td className="py-3 px-3 text-slate-400">{r.tower_co || 'N/A'}</td>
                      <td className="py-3 px-3 text-center font-mono text-[11px] font-bold text-amber-300">
                        {piWeightDisplay}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2.5 py-1 rounded-lg font-mono font-extrabold text-xs ${
                          isGood 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                            : isWarning 
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                              : 'bg-red-500/20 text-red-300 border border-red-500/30 shadow-md animate-pulse'
                        }`}>
                          {val}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-200">{r.latest_availability}%</td>
                      <td className="py-3 px-3 text-right space-x-1.5">
                        <button
                          onClick={() => setSelectedSiteModal({ record: r })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[10px] font-bold border border-slate-700"
                          title="View daily breakdown logs"
                        >
                          Daily UI
                        </button>

                        <button
                          onClick={() => {
                            loadMultiSiteNotes([r.site_id]);
                            setNotesSiteFilter(r.site_id);
                            setIsMultiNotesModalOpen(true);
                          }}
                          className="px-2 py-1 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 rounded-lg text-[10px] font-bold border border-purple-500/40"
                          title={`View SDM operational notes for ${r.site_id}`}
                        >
                          Notes
                        </button>

                        {onSelectSite && (
                          <button
                            onClick={() => onSelectSite(r.site_id)}
                            className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-bold"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
              page <= 1 ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            Previous Page
          </button>

          <span className="text-slate-400 text-xs font-mono">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
              page >= totalPages ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            Next Page
          </button>
        </div>

      </div>


      {/* 📅 FULL 30-DAY DAILY AVAILABILITY BREAKDOWN MODAL */}
      {selectedSiteModal && selectedSiteModal.record && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200 text-slate-100">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 rounded-2xl shrink-0">
                  <CalendarDays className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-0.5 font-mono font-black text-sm text-cyan-300 bg-cyan-950/60 rounded-md border border-cyan-500/30">
                      {selectedSiteModal.record.site_id}
                    </span>
                    <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded border border-purple-500/30">
                      {selectedSiteModal.record.tech} Layer
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 font-bold text-xs rounded border border-slate-700">
                      🏛️ {selectedSiteModal.record.state || 'FCT'}
                    </span>
                    {selectedSiteModal.record.territory && (
                      <span className="px-2.5 py-0.5 bg-cyan-950/80 text-cyan-300 font-bold text-xs rounded border border-cyan-500/40">
                        📍 {selectedSiteModal.record.territory}
                      </span>
                    )}
                    {selectedSiteModal.record.lga && (
                      <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 font-bold text-xs rounded border border-slate-700">
                        🗺️ {selectedSiteModal.record.lga}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-black text-white mt-1">
                    30-Day Daily Availability Breakdown Log
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setSelectedSiteModal(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Period Avg Avail</span>
                <div className="text-xl font-black text-cyan-300 font-mono mt-0.5">
                  {selectedSiteModal.record.period_availability || selectedSiteModal.record.avg_availability}%
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Tower Co / Vendor</span>
                <div className="text-xs font-bold text-slate-200 mt-1 truncate">
                  {selectedSiteModal.record.tower_co || 'N/A'} {selectedSiteModal.record.vendor ? `(${selectedSiteModal.record.vendor})` : ''}
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Best Day</span>
                <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                  {selectedSiteModal.record.daily_scores 
                    ? Math.max(...Object.values(selectedSiteModal.record.daily_scores).map(v => parseFloat(v) || 0))
                    : 100}%
                </div>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Worst Day</span>
                <div className="text-xl font-black text-red-400 font-mono mt-0.5">
                  {selectedSiteModal.record.daily_scores 
                    ? Math.min(...Object.values(selectedSiteModal.record.daily_scores).map(v => parseFloat(v) || 0))
                    : 100}%
                </div>
              </div>
            </div>

            {/* 📊 30-DAY DAILY BREAKDOWN LOG (MATRIX TABLE & GRID CARDS) */}
            {selectedSiteModal.record.daily_scores && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <span>30-Day Daily Score Breakdown (Click any day cell for RCA notes)</span>
                  </h4>

                  <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setModalBreakdownView('table')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                        modalBreakdownView === 'table'
                          ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Matrix Table (Excel)</span>
                    </button>
                    <button
                      onClick={() => setModalBreakdownView('cards')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                        modalBreakdownView === 'cards'
                          ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Interactive Cards</span>
                    </button>
                  </div>
                </div>

                {modalBreakdownView === 'table' ? (
                  /* 📋 EXCEL STYLE GOLD MATRIX TABLE VIEW (Matching Screenshot) */
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {modalSisterRecords.map((rec) => {
                      const techColLabel = rec.tech === '2G' ? '2G' : rec.tech === '3G' ? '3G NODEB' : rec.tech === '4G' || rec.tech === 'LTE' ? '4G LTE' : `${rec.tech} LAYER`;
                      const subSbcColLabel = rec.tech === '2G' ? 'Sub SBC' : 'Status';
                      const towerCoVal = rec.tower_co || rec.status || 'ATC';

                      return (
                        <div key={`${rec.site_id}_${rec.tech}`} className="overflow-x-auto rounded-xl border-2 border-slate-950 shadow-2xl">
                          <table className="w-full text-center border-collapse">
                            <thead>
                              <tr className="bg-amber-500 text-slate-950 font-black text-xs">
                                <th className="py-2.5 px-3 border border-slate-950 min-w-[100px] text-center font-black uppercase bg-amber-500 text-slate-950">
                                  {techColLabel}
                                </th>
                                <th className="py-2.5 px-3 border border-slate-950 min-w-[90px] text-center font-black uppercase bg-amber-500 text-slate-950">
                                  {subSbcColLabel}
                                </th>
                                {modalAllDates.map((dateStr) => {
                                  const formatted = formatHeaderDate(dateStr);
                                  const isSelected = selectedBreakdownDay === dateStr;
                                  return (
                                    <th
                                      key={dateStr}
                                      onClick={() => setSelectedBreakdownDay(dateStr)}
                                      className={`py-2.5 px-3 border border-slate-950 min-w-[85px] text-center font-black text-xs cursor-pointer transition-all whitespace-nowrap bg-amber-500 text-slate-950 ${
                                        isSelected ? 'ring-2 ring-cyan-400 bg-amber-400' : 'hover:bg-amber-400'
                                      }`}
                                    >
                                      {formatted}
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="py-3 px-3 border border-slate-950 font-black text-slate-950 bg-white text-xs font-mono">
                                  {rec.site_id}
                                </td>
                                <td className="py-3 px-3 border border-slate-950 font-bold text-slate-950 bg-white text-xs font-mono">
                                  {towerCoVal}
                                </td>
                                {modalAllDates.map((dateStr) => {
                                  const scoreVal = rec.daily_scores ? rec.daily_scores[dateStr] : null;
                                  const numScore = scoreVal !== null && scoreVal !== undefined ? parseFloat(scoreVal) : null;
                                  const isSelected = selectedBreakdownDay === dateStr;
                                  const isPass = numScore !== null && numScore >= 98.5;

                                  return (
                                    <td
                                      key={dateStr}
                                      onClick={() => setSelectedBreakdownDay(dateStr)}
                                      className={`py-3 px-3 border border-slate-950 font-black text-xs font-mono text-center cursor-pointer transition-all ${
                                        numScore === null
                                          ? 'bg-slate-200 text-slate-500'
                                          : isPass
                                          ? 'bg-emerald-500 text-slate-950 font-black hover:bg-emerald-400'
                                          : 'bg-red-600 text-slate-950 font-black hover:bg-red-500 shadow-inner'
                                      } ${isSelected ? 'ring-4 ring-cyan-400 ring-inset z-20 relative scale-[1.02] shadow-xl' : ''}`}
                                    >
                                      {numScore !== null ? (numScore % 1 === 0 ? numScore.toFixed(1) : numScore.toFixed(2)) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 📊 INTERACTIVE CARDS GRID VIEW */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto p-1">
                    {Object.entries(selectedSiteModal.record.daily_scores)
                      .sort(([d1], [d2]) => d1.localeCompare(d2))
                      .map(([dayStr, score]) => {
                        const numScore = parseFloat(score) || 0.0;
                        const isTarget = selectedBreakdownDay === dayStr;
                        const isPass = numScore >= 98.5;
                        const downMinutes = Math.round((100 - numScore) * 24 * 60 / 100);

                        const dayNotesCount = siteModalNotes.filter(n => {
                          if (!n) return false;
                          const d = n.created_at || n.date || n.updated_at || '';
                          return d.includes(dayStr) || (n.title && n.title.includes(dayStr)) || (n.description && n.description.includes(dayStr));
                        }).length;

                        return (
                          <div
                            key={dayStr}
                            onClick={() => setSelectedBreakdownDay(dayStr)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between hover:scale-[1.02] ${
                              isTarget
                                ? 'ring-2 ring-cyan-400 bg-cyan-950/70 border-cyan-400 scale-[1.03] shadow-lg shadow-cyan-950/50'
                                : isPass
                                ? 'bg-slate-950/80 border-emerald-500/40 hover:border-emerald-400'
                                : 'bg-slate-950/90 border-red-500/60 shadow-md shadow-red-950/20 hover:border-red-400'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-300">
                              <span>{dayStr}</span>
                              {dayNotesCount > 0 && (
                                <span className="px-1.5 py-0.2 bg-purple-500 text-white rounded text-[9px] font-extrabold" title={`${dayNotesCount} SDM Note(s)`}>
                                  📝 {dayNotesCount}
                                </span>
                              )}
                            </div>
                            
                            <div className={`text-base font-black font-mono my-1 ${
                              isPass ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {numScore}%
                            </div>

                            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                              <span>Down:</span>
                              <span className="font-mono font-bold text-slate-200">
                                {downMinutes > 0 ? `${downMinutes}m` : '0m'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* 📝 SDM DAILY OPERATIONAL NOTES & INCIDENT RCA LOG PANEL */}
            {selectedBreakdownDay && (
              <div className="bg-slate-950/90 border border-cyan-500/30 rounded-2xl p-4 space-y-3">
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4.5 h-4.5 text-cyan-400" />
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">
                        SDM Field Operations & Daily RCA Log
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Selected Site: <b className="text-cyan-300">{selectedSiteModal.record.site_id}</b>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-black text-cyan-300 bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-500/40">
                      📅 {selectedBreakdownDay}
                    </span>
                    {selectedSiteModal.record.daily_scores && selectedSiteModal.record.daily_scores[selectedBreakdownDay] !== undefined && (
                      <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-lg border ${
                        parseFloat(selectedSiteModal.record.daily_scores[selectedBreakdownDay]) >= 98.5 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-red-500/20 text-red-300 border-red-500/40'
                      }`}>
                        {selectedSiteModal.record.daily_scores[selectedBreakdownDay]}% Avail
                      </span>
                    )}
                  </div>
                </div>

                {loadingSiteModalNotes ? (
                  <div className="py-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Querying SDM site notes database for {selectedBreakdownDay}...</span>
                  </div>
                ) : activeDayNotes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeDayNotes.map((note) => (
                      <div key={note.id} className="p-3.5 bg-slate-900 rounded-xl border border-purple-500/40 space-y-2 shadow-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-500/30">
                              {note.category || 'General'}
                            </span>
                            <h5 className="font-extrabold text-xs text-white">
                              {note.title || 'SDM Field Operational Log'}
                            </h5>
                          </div>

                          <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded ${
                            note.priority === 'Critical' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          }`}>
                            {note.priority || 'Normal'} Priority
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                          {note.description || 'No detailed description provided.'}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                          <span>SDM / Engineer: <b className="text-cyan-300">{note.created_by || note.smc_fse_name || 'State Delivery Manager'}</b></span>
                          <span>Timestamp: <b className="font-mono text-slate-300">{new Date(note.created_at || note.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-5 px-4 bg-slate-900/50 rounded-xl border border-slate-800 text-center space-y-1">
                    <div className="text-emerald-400 font-extrabold text-xs flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>No issues on this day</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      No operational incidents, outages, or SDM site notes were logged for <b className="text-cyan-300 font-mono">{selectedSiteModal.record.site_id}</b> on {selectedBreakdownDay}. Site operating normally under standard SLA parameters.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              {onSelectSite && (
                <button
                  onClick={() => {
                    const sid = selectedSiteModal.record.site_id;
                    setSelectedSiteModal(null);
                    onSelectSite(sid);
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                >
                  <Radio className="w-4 h-4" />
                  <span>Inspect Full Site Profile</span>
                </button>
              )}

              <button
                onClick={() => setSelectedSiteModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
              >
                Close Logs
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📊 LGA EXECUTIVE OPERATIONAL REPORT MODAL */}
      {selectedLgaReport && (
        <LgaExecutiveReportModal
          lgaItem={selectedLgaReport}
          onClose={() => setSelectedLgaReport(null)}
          onSelectSite={onSelectSite}
        />
      )}


      {/* 📋 MULTI-SITE BULK LIST SEARCH & PASTE MODAL */}
      {isMultiSiteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200 text-slate-100">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 rounded-2xl shrink-0">
                  <ClipboardList className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Multi-Site Bulk List Search
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paste any list of Site IDs from Excel, WhatsApp, or reports to pull daily availability, sort by worst performing, and view all SDM notes.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsMultiSiteModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-bold font-mono text-[11px] text-cyan-300">
                  PASTE SITE IDs (Delimited by commas, spaces, tabs, or newlines):
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {parseSiteIdsFromText(multiSiteRawInput).length} Valid IDs Detected
                </span>
              </div>

              <textarea
                rows={6}
                value={multiSiteRawInput}
                onChange={(e) => setMultiSiteRawInput(e.target.value)}
                placeholder="Example:&#10;FC0001, FC0002, FC0014&#10;FC0022&#10;FC0034; FC0045 FC0098&#10;T1296, T0331"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-2xl p-4 text-xs font-mono text-cyan-200 placeholder-slate-600 focus:outline-none leading-relaxed shadow-inner"
              />

              {/* Sample Quick Load Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Quick Sample:</span>
                  <button
                    onClick={() => setMultiSiteRawInput('FC0001, FC0002, FC0012, FC0014, FC0022, FC0024, FC0034, FC0066, FC0098, FC2123, FC2266, FC2881, T0331, T1296')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold rounded-lg border border-slate-700"
                  >
                    Sample FCT Sites
                  </button>
                  {stats?.worst_sites && stats.worst_sites.length > 0 && (
                    <button
                      onClick={() => setMultiSiteRawInput(stats.worst_sites.map(s => s.site_id).join(', '))}
                      className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/40"
                    >
                      Top Worst Outage Sites ({stats.worst_sites.length})
                    </button>
                  )}
                </div>

                {multiSiteRawInput && (
                  <button
                    onClick={() => setMultiSiteRawInput('')}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold"
                  >
                    Clear Text
                  </button>
                )}
              </div>
            </div>

            {/* Parsed Preview Tags */}
            {parseSiteIdsFromText(multiSiteRawInput).length > 0 && (
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Preview Parsed Unique IDs ({parseSiteIdsFromText(multiSiteRawInput).length}):
                </span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {parseSiteIdsFromText(multiSiteRawInput).map((id) => (
                    <span key={id} className="px-2 py-0.5 bg-cyan-950 text-cyan-300 text-[11px] font-mono font-bold rounded border border-cyan-500/30">
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsMultiSiteModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    const ids = parseSiteIdsFromText(multiSiteRawInput);
                    if (ids.length > 0) {
                      handleApplyMultiSiteSearch(ids, true);
                      loadMultiSiteNotes(ids);
                      setIsMultiNotesModalOpen(true);
                    }
                  }}
                  disabled={parseSiteIdsFromText(multiSiteRawInput).length === 0}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>Pull Sites & View Notes</span>
                </button>

                <button
                  onClick={() => {
                    const ids = parseSiteIdsFromText(multiSiteRawInput);
                    if (ids.length > 0) {
                      handleApplyMultiSiteSearch(ids, true);
                    }
                  }}
                  disabled={parseSiteIdsFromText(multiSiteRawInput).length === 0}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-cyan-500/30 transition-all flex items-center justify-center gap-1.5"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>Search & Filter Worst First</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* 📝 MULTI-SITE SDM OPERATIONAL NOTES & RCA MODAL */}
      {isMultiNotesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-purple-500/50 rounded-3xl max-w-5xl w-full p-6 space-y-5 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200 text-slate-100">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-purple-500/20 border border-purple-500/40 text-purple-400 rounded-2xl shrink-0">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 bg-purple-950 text-purple-300 font-mono font-black text-xs rounded border border-purple-500/30">
                      SDM OPERATIONAL NOTES
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 font-bold text-xs rounded border border-slate-700">
                      {multiSiteParsedList.length > 0 ? `${multiSiteParsedList.length} Filtered Sites` : 'All Filtered Sites'}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-white mt-1">
                    Multi-Site SDM Operational Notes & Incident RCA Log
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const sids = multiSiteParsedList.length > 0 ? multiSiteParsedList.join(',') : undefined;
                    exportNotesExcel({ site_ids: sids });
                  }}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/40 transition-all flex items-center gap-1.5 shadow-sm"
                  title="Export all operational notes for these sites to Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Notes Excel</span>
                </button>

                <button
                  onClick={() => setIsMultiNotesModalOpen(false)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 border border-slate-700 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Summary Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total SDM Notes</span>
                <div className="text-2xl font-black text-purple-300 font-mono mt-0.5">
                  {multiSiteNotes.length}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Critical Priority</span>
                <div className="text-2xl font-black text-red-400 font-mono mt-0.5">
                  {multiSiteNotes.filter(n => n.priority === 'Critical').length}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Active / In Progress</span>
                <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
                  {multiSiteNotes.filter(n => n.status === 'Open' || n.status === 'In Progress').length}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Resolved Tickets</span>
                <div className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                  {multiSiteNotes.filter(n => n.status === 'Resolved').length}
                </div>
              </div>
            </div>

            {/* Filters Row Inside Notes Modal */}
            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                {/* Search within notes */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search within notes, RCA, or author..."
                    value={notesSearchQuery}
                    onChange={(e) => setNotesSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 text-xs text-white placeholder-slate-500 pl-8 pr-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none focus:border-purple-400"
                  />
                </div>

                {/* Filter by Site ID */}
                <select
                  value={notesSiteFilter}
                  onChange={(e) => setNotesSiteFilter(e.target.value)}
                  className="bg-slate-900 text-xs text-cyan-300 px-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none font-bold"
                >
                  <option value="All">All Sites ({multiSiteNotes.length})</option>
                  {Array.from(new Set(multiSiteNotes.map(n => n.site_ihs_id || n.site_id || n.site?.ihs_site_id || n.site_id_str || n.site_id_input || (n.title ? n.title.split(' ')[0] : '')).filter(Boolean))).map((sid) => (
                    <option key={sid} value={sid}>Site: {sid}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter by Category */}
                <select
                  value={notesCategoryFilter}
                  onChange={(e) => setNotesCategoryFilter(e.target.value)}
                  className="bg-slate-900 text-xs text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  <option value="Power">Power</option>
                  <option value="DG">DG / Generator</option>
                  <option value="Grid">PHCN / Grid</option>
                  <option value="Fiber">Fiber</option>
                  <option value="Battery">Battery</option>
                  <option value="Security">Security</option>
                  <option value="Hardware">Hardware</option>
                </select>

                {/* Filter by Status */}
                <select
                  value={notesStatusFilter}
                  onChange={(e) => setNotesStatusFilter(e.target.value)}
                  className="bg-slate-900 text-xs text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Escalated">Escalated</option>
                </select>

                {/* Filter by Priority */}
                <select
                  value={notesPriorityFilter}
                  onChange={(e) => setNotesPriorityFilter(e.target.value)}
                  className="bg-slate-900 text-xs text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 focus:outline-none"
                >
                  <option value="All">All Priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>

                <button
                  onClick={() => {
                    setNotesSiteFilter('All');
                    setNotesCategoryFilter('All');
                    setNotesPriorityFilter('All');
                    setNotesStatusFilter('All');
                    setNotesSearchQuery('');
                  }}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded-xl border border-slate-800"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Notes List */}
            {loadingMultiNotes ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-400" />
                <div className="text-xs font-bold">Loading SDM operational notes for matched sites...</div>
              </div>
            ) : multiSiteNotes.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2 bg-slate-950/60 rounded-2xl border border-slate-800 p-8">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">No SDM Notes Found</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No operational incident logs or trouble tickets have been logged yet for the queried sites.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {multiSiteNotes
                  .filter((n) => {
                    const sid = (n.site_ihs_id || n.site_id || n.site?.ihs_site_id || n.site_id_str || n.site_id_input || (n.title ? n.title.split(' ')[0] : '')).toUpperCase();
                    if (notesSiteFilter !== 'All' && sid !== notesSiteFilter.toUpperCase()) return false;
                    if (notesCategoryFilter !== 'All' && n.category !== notesCategoryFilter) return false;
                    if (notesPriorityFilter !== 'All' && n.priority !== notesPriorityFilter) return false;
                    if (notesStatusFilter !== 'All' && n.status !== notesStatusFilter) return false;
                    if (notesSearchQuery) {
                      const q = notesSearchQuery.toLowerCase();
                      const t = (n.title || '').toLowerCase();
                      const d = (n.description || '').toLowerCase();
                      const author = (n.created_by || '').toLowerCase();
                      if (!t.includes(q) && !d.includes(q) && !author.includes(q) && !sid.toLowerCase().includes(q)) return false;
                    }
                    return true;
                  })
                  .map((note) => {
                    const sid = note.site_ihs_id || note.site_id || note.site?.ihs_site_id || note.site_id_str || note.site_id_input || (note.title ? note.title.split(' ')[0] : 'General');
                    const isCritical = note.priority === 'Critical';
                    const isResolved = note.status === 'Resolved';

                    return (
                      <div
                        key={note.id}
                        className={`p-4 rounded-2xl border transition-all space-y-2.5 ${
                          isCritical
                            ? 'bg-red-950/20 border-red-500/50 shadow-md shadow-red-950/30'
                            : isResolved
                            ? 'bg-emerald-950/10 border-emerald-500/30'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        {/* Note Top Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => {
                                setIsMultiNotesModalOpen(false);
                                if (onSelectSite) onSelectSite(sid);
                              }}
                              className="px-2.5 py-0.5 bg-cyan-950 text-cyan-300 font-mono font-black text-xs rounded border border-cyan-500/40 hover:underline flex items-center gap-1"
                            >
                              <Radio className="w-3 h-3" />
                              <span>{sid}</span>
                            </button>

                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold rounded border border-purple-500/30">
                              {note.category || 'General'}
                            </span>

                            <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                              isCritical ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}>
                              {note.priority || 'Normal'} Priority
                            </span>

                            <span className={`px-2 py-0.5 text-[10px] font-mono font-extrabold rounded border ${
                              isResolved ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                              {note.status || 'Open'}
                            </span>
                          </div>

                          <span className="text-[11px] font-mono text-slate-400">
                            🕒 {note.created_at ? new Date(note.created_at).toLocaleString() : 'N/A'}
                          </span>
                        </div>

                        {/* Note Title & Description */}
                        <div>
                          <h4 className="text-xs font-black text-white mb-1">
                            {note.title}
                          </h4>
                          <p className="text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-line bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                            {note.description}
                          </p>
                        </div>

                        {/* Note Footer */}
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1">
                          <span>
                            Logged By: <b className="text-cyan-300">{note.created_by || 'State Delivery Manager'}</b>
                            {note.smc_fse_name && note.smc_fse_name !== 'Unassigned' && (
                              <span> • FSE: <b className="text-purple-300">{note.smc_fse_name}</b></span>
                            )}
                          </span>

                          <div className="flex items-center gap-2">
                            {note.attachments && note.attachments.length > 0 && (
                              <span className="text-emerald-400 font-bold text-[10px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                                📎 {note.attachments.length} Attachments
                              </span>
                            )}

                            {onSelectSite && (
                              <button
                                onClick={() => {
                                  setIsMultiNotesModalOpen(false);
                                  onSelectSite(sid);
                                }}
                                className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
                              >
                                Inspect Site →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-mono">
                Showing {multiSiteNotes.length} total operational notes across queried sites
              </span>

              <button
                onClick={() => setIsMultiNotesModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
              >
                Close Notes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
