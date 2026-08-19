import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, Upload, FileSpreadsheet, RefreshCw, CheckCircle2, AlertTriangle, 
  ShieldAlert, Search, Filter, Calendar, BarChart3, Database, ArrowUpRight, 
  ChevronRight, Radio, Layers, Server, Download, Sparkles, TrendingUp, Archive,
  Clock, CalendarDays, CalendarRange, Sliders, LayoutGrid, List, Eye, TrendingDown, Info, X,
  FileText, Printer, Copy, MapPin, Check, Share2, Wrench, Map
} from 'lucide-react';
import { 
  fetchAvailabilityStats, fetchAvailabilityRecords, fetchAvailabilityArchives, uploadAvailabilityFile, resetBaseAvailability, exportAvailabilityExcel, fetchNotes 
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

  const modalSisterRecords = React.useMemo(() => {
    if (!selectedSiteModal || !selectedSiteModal.record) return [];
    const curRec = selectedSiteModal.record;
    const rawId = curRec.site_id || '';
    const baseId = rawId.replace(/^[UL345]/i, '').toUpperCase();
    
    if (!records || records.length === 0) return [curRec];
    
    const matches = records.filter(r => {
      if (!r || !r.site_id) return false;
      const rRaw = r.site_id.toUpperCase();
      const rBase = rRaw.replace(/^[UL345]/i, '');
      return rRaw === rawId.toUpperCase() || rBase === baseId;
    });

    if (matches.length === 0) return [curRec];
    
    const techOrder = { '2G': 1, '3G': 2, '4G': 3, 'LTE': 3, '5G': 4 };
    return matches.sort((a, b) => (techOrder[a.tech] || 99) - (techOrder[b.tech] || 99));
  }, [selectedSiteModal, records]);

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

  // LGA Operational Report State
  const [selectedLgaReport, setSelectedLgaReport] = useState(null);
  const handleGenerateLgaReport = (lgaItem) => setSelectedLgaReport(lgaItem);

  // Filter States
  const [selectedTech, setSelectedTech] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
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
  const [dateMode, setDateMode] = useState('month'); // 'day', 'week', 'month', 'custom'
  const [selectedDateInput, setSelectedDateInput] = useState('2026-07-30');
  const [selectedWeek, setSelectedWeek] = useState('week_4'); // 'week_1', 'week_2', 'week_3', 'week_4'
  const [selectedMonth, setSelectedMonth] = useState('2026-07'); // '2026-07'
  const [startDateInput, setStartDateInput] = useState('2026-07-01');
  const [endDateInput, setEndDateInput] = useState('2026-07-30');

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
        { id: 'week', label: 'Latest 7 Days', dates: '7 Days' },
        { id: 'week_1', label: 'Week 1', dates: 'Days 1-7' },
        { id: 'week_2', label: 'Week 2', dates: 'Days 8-14' },
        { id: 'week_3', label: 'Week 3', dates: 'Days 15-21' },
        { id: 'week_4', label: 'Week 4', dates: 'Days 22-28' }
      ];
    }

    const weekList = [
      {
        id: 'week',
        label: 'Latest 7 Days',
        dates: `${dates[Math.max(0, dates.length - 7)]} to ${dates[dates.length - 1]}`
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

  const months = [
    { id: '2026-07', label: 'July 2026' },
    { id: '2026-06', label: 'June 2026' },
    { id: '2026-08', label: 'August 2026' }
  ];

  const handleResetFilters = () => {
    setSelectedTech('All');
    setSelectedState('All');
    setSelectedLga('All');
    setSelectedTowerCo('All');
    setSelectedVendor('All');
    setSelectedStatus('All');
    setSelectedFse('All');
    setSortBy('worst');
    setSearchQuery('');
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
        backendDateMode = 'single_date';
      } else if (dateMode === 'month') {
        backendDateMode = 'month';
      } else if (dateMode === 'all') {
        backendDateMode = 'all';
      }
      
      const data = await fetchAvailabilityStats({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: backendDateMode,
        selected_date: backendSelectedDate,
        start_date: backendStartDate,
        end_date: backendEndDate,
        upload_log_id: selectedArchiveLogId !== 'active' ? selectedArchiveLogId : undefined
      });
      setStats(data);
      if (data?.all_detected_dates && data.all_detected_dates.length > 0) {
        const dates = data.all_detected_dates;
        const latest = dates[dates.length - 1];
        const earliest = dates[0];
        setSelectedDateInput(prev => (!prev || !dates.includes(prev) ? latest : prev));
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
        backendDateMode = 'single_date';
      } else if (dateMode === 'month') {
        backendDateMode = 'month';
      } else if (dateMode === 'all') {
        backendDateMode = 'all';
      }
      
      const res = await fetchAvailabilityRecords({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: backendDateMode,
        selected_date: backendSelectedDate,
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
    selectedState, selectedLga, selectedTech, selectedTowerCo, selectedVendor, selectedStatus, 
    selectedFse, sortBy, searchQuery, slaFilter, minAvailInput, maxAvailInput, 
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
        setUploadMsg(`Daily Availability updated! Processed ${res.records_count.toLocaleString()} elements for date range ${res.date_range}.`);
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
      console.error('Availability upload error:', e);
      setErrorMsg(e.response?.data?.error || 'Failed to upload Daily Availability file to server.');
    } finally {
      setUploading(false);
    }
  };

  const handleResetBase = async () => {
    if (!window.confirm('Reset Daily Availability back to base 2026-07-30 dataset?')) return;

    setUploading(true);
    setUploadMsg('Resetting Daily Availability to base 2026-07-30 dataset...');
    setErrorMsg('');

    try {
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'System Administrator';
      const res = await resetBaseAvailability(uploaderName);
      if (res && res.success) {
        setUploadMsg(`Reset to base Daily Availability 2026-07-30 (${res.records_count.toLocaleString()} elements).`);
        await loadStatsData();
        await loadRecordsData();
      } else {
        setErrorMsg(res?.error || 'Failed to reset Daily Availability.');
      }
    } catch (e) {
      console.error('Reset error:', e);
      setErrorMsg('Error resetting Daily Availability database.');
    } finally {
      setUploading(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const sdmParam = currentUser && !currentUser.is_superuser ? (currentUser.full_name || currentUser.username) : undefined;
      const blob = await exportAvailabilityExcel({
        sdm: sdmParam,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        vendor: selectedVendor,
        status: selectedStatus,
        sort_by: sortBy,
        search: searchQuery,
        sla_filter: slaFilter,
        min_avail: minAvailInput,
        max_avail: maxAvailInput,
        date_mode: dateMode,
        selected_date: selectedDateInput,
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
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-black text-white">Daily Availability Monthly Archive Center</h3>
              {selectedArchiveLogId !== 'active' ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-500/40 flex items-center space-x-1 animate-pulse">
                  <Archive className="w-3 h-3" />
                  <span>Viewing Historical Archive</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Current Active Month</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Every uploaded daily Excel dataset is stored and organized by month boundaries. Select any historical month below to view past SLA scores and element records.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <select
            value={selectedArchiveLogId}
            onChange={(e) => setSelectedArchiveLogId(e.target.value)}
            className="bg-slate-950 border border-cyan-500/50 rounded-2xl px-4 py-2.5 text-xs font-bold text-cyan-300 focus:outline-none focus:border-cyan-400 shadow-inner w-full md:w-72 cursor-pointer"
          >
            <option value="active">🗓️ Active Month (Current Dataset)</option>
            {archives.map(arch => (
              <option key={arch.id} value={arch.id}>
                {arch.is_active ? '🟢 Current: ' : '📁 Archive: '} {arch.month_str || arch.filename} ({arch.records_count?.toLocaleString()} elements)
              </option>
            ))}
          </select>

          {selectedArchiveLogId !== 'active' && (
            <button
              onClick={() => setSelectedArchiveLogId('active')}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl border border-slate-700 whitespace-nowrap transition-all"
            >
              Reset to Current Month
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Overall Availability</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {stats?.overall_avg !== undefined ? `${stats.overall_avg}%` : '---'}
          </div>
          <span className="text-[10px] text-emerald-400 font-semibold block">
            National Network Average ({stats?.total_elements ? stats.total_elements.toLocaleString() : 0} Elements)
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



      {/* ENHANCED: Search & Filter Bar with Date Mode and % Filter */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
        
        {/* Row 1: Search and Basic Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Site ID, LGA, State, Tower Co..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Tech Filter */}
            <select
              value={selectedTech}
              onChange={(e) => { setSelectedTech(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Techs</option>
              <option value="2G">2G Only</option>
              <option value="3G">3G Only</option>
              <option value="4G">4G Only</option>
              <option value="5G">5G Only</option>
            </select>

            {/* State Filter */}
            <select
              value={selectedState}
              onChange={(e) => { setSelectedState(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
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

            {/* SMC FSE Engineer Filter for SDM Manager & Super Admin */}
            {!isFse ? (
              <select
                value={selectedFse}
                onChange={(e) => { setSelectedFse(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-cyan-500/50 focus:outline-none focus:border-cyan-400 font-semibold shadow-inner"
              >
                <option value="All">
                  {currentUser?.is_superuser ? 'All FSE Engineers (540)' : 'All SMC FSE Engineers'}
                </option>
                {stats?.available_fses && stats.available_fses.map((fseName) => (
                  <option key={fseName} value={fseName}>{fseName}</option>
                ))}
              </select>
            ) : (
              <div className="bg-cyan-950/60 text-cyan-300 text-xs px-3 py-2 rounded-xl border border-cyan-500/40 font-semibold font-mono flex items-center gap-1.5 shadow-inner">
                <span>FSE: {userName}</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-200 px-1.5 py-0.5 rounded">My Sites</span>
              </div>
            )}

            {/* Tower Co Filter */}
            <select
              value={selectedTowerCo}
              onChange={(e) => { setSelectedTowerCo(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Tower Cos</option>
              {stats?.available_tower_cos && stats.available_tower_cos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Vendor Filter */}
            <select
              value={selectedVendor}
              onChange={(e) => { setSelectedVendor(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
            >
              <option value="All">All Vendors</option>
              {stats?.available_vendors && stats.available_vendors.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
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

            {/* LGA Filter */}
            {stats?.available_lgas && stats.available_lgas.length > 0 && (
              <select
                value={selectedLga}
                onChange={(e) => { setSelectedLga(e.target.value); setPage(1); }}
                className="bg-slate-950 text-xs text-slate-200 p-2 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-semibold"
              >
                <option value="All">All LGAs ({stats.available_lgas.length})</option>
                {stats.available_lgas.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}

            {/* Sort By Filter */}
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-cyan-400 p-2 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-extrabold"
            >
              <option value="worst">🔽 Worst First</option>
              <option value="best">🔼 Best First</option>
              <option value="site_id">🔤 Site ID</option>
              <option value="state">🏛️ State</option>
              <option value="lga">🗺️ LGA</option>
            </select>

            {/* Reset All Filters */}
            <button
              onClick={handleResetFilters}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all shadow-md"
              title="Reset all filters"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              Reset
            </button>
          </div>
        </div>

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
            <select
              value={selectedDateInput}
              onChange={(e) => { setSelectedDateInput(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono"
            >
              {stats?.all_detected_dates && stats.all_detected_dates.length > 0 ? (
                stats.all_detected_dates.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))
              ) : (
                <option value="2026-07-30">2026-07-30</option>
              )}
            </select>
          )}

          {/* Week Selector */}
          {dateMode === 'week' && (
            <select
              value={selectedWeek}
              onChange={(e) => { setSelectedWeek(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono"
            >
              {weeks.map(week => (
                <option key={week.id} value={week.id}>
                  {week.label} ({week.dates})
                </option>
              ))}
            </select>
          )}

          {/* Month Selector */}
          {dateMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setPage(1); }}
              className="bg-slate-950 text-xs text-cyan-300 p-2 rounded-xl border border-cyan-500/40 focus:outline-none focus:border-cyan-400 font-mono"
            >
              {months.map(month => (
                <option key={month.id} value={month.id}>
                  {month.label}
                </option>
              ))}
            </select>
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
                    <th className="py-2.5 px-3">State / Region</th>
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
                        🏛️ {r.state || 'FCT'} {r.lga ? `• ${r.lga}` : ''}
                      </span>
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
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedSiteModal({ record: r })}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Daily Logs Modal</span>
                    </button>

                    {onSelectSite && (
                      <button
                        onClick={() => onSelectSite(r.site_id)}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1"
                      >
                        <span>Inspect Site</span>
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
                  <th className="py-3 px-3">LGA</th>
                  <th className="py-3 px-3">Tower Co</th>
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
                  return (
                    <tr key={`${r.site_id}_${r.tech}`} className="hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-white">{r.site_id}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-slate-800 rounded font-mono text-[10px] text-cyan-300">{r.tech}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{r.state || 'N/A'}</td>
                      <td className="py-3 px-3 text-slate-400">{r.lga || 'N/A'}</td>
                      <td className="py-3 px-3 text-slate-400">{r.tower_co || 'N/A'}</td>
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
                        >
                          Daily UI
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
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-0.5 font-mono font-black text-sm text-cyan-300 bg-cyan-950/60 rounded-md border border-cyan-500/30">
                      {selectedSiteModal.record.site_id}
                    </span>
                    <span className="px-2.5 py-0.5 bg-purple-500/20 text-purple-300 font-mono font-bold text-xs rounded border border-purple-500/30">
                      {selectedSiteModal.record.tech} Layer
                    </span>
                    <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 font-bold text-xs rounded border border-slate-700">
                      {selectedSiteModal.record.state || 'FCT'}
                    </span>
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

    </div>
  );
}
