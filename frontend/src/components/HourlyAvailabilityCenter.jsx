import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity, Upload, RefreshCw, Filter, Search, ShieldCheck, AlertTriangle, CheckCircle2,
  Clock, Layers, Database, ChevronRight, X, ArrowUpRight, TrendingUp, TrendingDown,
  BarChart3, Sparkles, MapPin, Zap, AlertOctagon, FileSpreadsheet, Eye
} from 'lucide-react';
import {
  fetchHourlyAvailabilityStats,
  fetchHourlyAvailabilityRecords,
  uploadHourlyAvailabilityFile,
  resetHourlyBaseAvailability,
  fetchNotes
} from '../api';
import { getSDMStateInfo } from '../utils/userUtils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export default function HourlyAvailabilityCenter({ currentUser, onNavigateToSite }) {
  const stateInfo = getSDMStateInfo(currentUser);
  const [stats, setStats] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Filter States
  const [selectedState, setSelectedState] = useState(() => stateInfo?.code || 'FCT');
  const [selectedLga, setSelectedLga] = useState('All');
  const [selectedTech, setSelectedTech] = useState('All');
  const [selectedTowerCo, setSelectedTowerCo] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedFse, setSelectedFse] = useState('All');
  const [selectedHour, setSelectedHour] = useState('Latest');

  useEffect(() => {
    if (stateInfo?.code) {
      setSelectedState(stateInfo.code);
    }
  }, [currentUser]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minAvailFilter, setMinAvailFilter] = useState('');
  const [maxAvailFilter, setMaxAvailFilter] = useState('');

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortBy, setSortBy] = useState('avg_availability'); // ascending to show worst first

  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Degraded Site Inspector Modal State
  const [selectedSiteRecord, setSelectedSiteRecord] = useState(null);
  const [siteNotes, setSiteNotes] = useState([]);
  const [loadingSiteNotes, setLoadingSiteNotes] = useState(false);

  useEffect(() => {
    if (!selectedSiteRecord) {
      setSiteNotes([]);
      return;
    }
    const loadNotesForSite = async () => {
      setLoadingSiteNotes(true);
      try {
        const res = await fetchNotes({ site_id: selectedSiteRecord.site_id, page_size: 10 });
        const list = Array.isArray(res) ? res : (res.results || []);
        setSiteNotes(list);
      } catch (err) {
        console.error('Error loading notes for site:', err);
      } finally {
        setLoadingSiteNotes(false);
      }
    };
    loadNotesForSite();
  }, [selectedSiteRecord]);

  const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer' || currentUser?.role === 'FSE';
  const userName = currentUser?.full_name || currentUser?.username;

  // Fetch Stats
  const loadStats = async () => {
    setLoading(true);
    try {
      const sdmParam = currentUser && !currentUser.is_superuser && !isFse ? userName : undefined;
      const fseParam = isFse ? userName : (selectedFse !== 'All' ? selectedFse : undefined);

      const data = await fetchHourlyAvailabilityStats({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        state: selectedState,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        status: selectedStatus,
        selected_hour: selectedHour
      });
      setStats(data);
    } catch (err) {
      console.error('Error fetching hourly availability stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Paginated Table Records
  const loadRecords = async (page = 1) => {
    setTableLoading(true);
    try {
      const sdmParam = currentUser && !currentUser.is_superuser && !isFse ? userName : undefined;
      const fseParam = isFse ? userName : (selectedFse !== 'All' ? selectedFse : undefined);

      const data = await fetchHourlyAvailabilityRecords({
        sdm: sdmParam,
        fse: fseParam,
        user_role: currentUser?.role,
        is_superuser: currentUser?.is_superuser ? 'true' : 'false',
        user_state: stateInfo?.code,
        page,
        page_size: 50,
        search: searchQuery,
        state: selectedState,
        lga: selectedLga,
        tech: selectedTech,
        tower_co: selectedTowerCo,
        status: selectedStatus,
        min_avail: minAvailFilter,
        max_avail: maxAvailFilter,
        sort: sortBy
      });

      if (data && data.results) {
        setRecords(data.results);
        setTotalRecords(data.count || 0);
        setTotalPages(Math.ceil((data.count || 0) / 50));
      } else if (Array.isArray(data)) {
        setRecords(data);
        setTotalRecords(data.length);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Error fetching hourly records:', err);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [selectedState, selectedLga, selectedTech, selectedTowerCo, selectedStatus, selectedHour, selectedFse]);

  useEffect(() => {
    loadRecords(currentPage);
  }, [currentPage, searchQuery, selectedState, selectedLga, selectedTech, selectedTowerCo, selectedStatus, selectedFse, minAvailFilter, maxAvailFilter, sortBy]);

  // Handle Hourly File Upload
  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadMessage({ type: 'info', text: 'Processing and parsing 24-hour availability Excel spreadsheet... Please wait.' });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('uploaded_by', currentUser ? (currentUser.full_name || currentUser.username) : 'System Administrator');

      const res = await uploadHourlyAvailabilityFile(formData);
      if (res && res.success) {
        setUploadMessage({
          type: 'success',
          text: `File uploaded successfully! Loaded ${res.records_count?.toLocaleString()} element availability records across 24 hours.`
        });
        setSelectedFile(null);
        await loadStats();
        await loadRecords(1);
        setTimeout(() => {
          setUploadModalOpen(false);
          setUploadMessage(null);
        }, 2000);
      } else {
        setUploadMessage({ type: 'error', text: res?.error || 'Failed to parse hourly availability spreadsheet.' });
      }
    } catch (err) {
      console.error('Hourly upload error:', err);
      setUploadMessage({ type: 'error', text: err.response?.data?.error || 'Server error occurred during file upload.' });
    } finally {
      setUploading(false);
    }
  };

  // Reset Base Dataset
  const handleResetBase = async () => {
    if (!window.confirm('Are you sure you want to reset Hourly Availability to base dataset 12AM.xlsb?')) return;
    setResetting(true);
    try {
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'System Administrator';
      const res = await resetHourlyBaseAvailability(uploaderName);
      if (res && res.message) {
        await loadStats();
        await loadRecords(1);
        alert(res.message);
      } else {
        alert(res.error || 'Failed to reset hourly base file.');
      }
    } catch (err) {
      console.error('Error resetting base file:', err);
      alert('Failed to reset hourly base dataset.');
    } finally {
      setResetting(false);
    }
  };

  const hoursList = stats?.hours_list || ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"];

  const getScoreBadge = (val) => {
    if (val === undefined || val === null) return <span className="text-slate-500 font-mono text-xs">N/A</span>;
    let bg = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40';
    if (val < 95.0) bg = 'bg-red-950/80 text-red-300 border-red-500/40 animate-pulse';
    else if (val < 98.5) bg = 'bg-amber-950/80 text-amber-300 border-amber-500/40';
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${bg}`}>
        {val.toFixed(1)}%
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* 🚀 TOP HERO BANNER & ACTION BAR */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-cyan-950/80 text-cyan-300 font-mono text-xs font-bold rounded-lg border border-cyan-500/30 flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>24-HOUR AVAILABILITY ANALYTICS</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {currentUser?.role === 'SMC FSE Engineer' ? `📍 ASSIGNED FSE: ${currentUser.full_name || currentUser.username}` : `📍 STATE SCOPE: ${stateInfo?.code || 'FCT'}`}
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-2">
              24-Hour Network Availability Tracker & Analytics
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
              Track 24-hour hourly element availability percentages (00:00 to 23:00) across 2G, 3G, 4G, and 5G network layers. Upload hourly spreadsheets, monitor SLA breaches, and inspect degraded sites.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => { loadStats(); loadRecords(1); }}
              disabled={loading}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center space-x-2 transition-all"
            >
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {!isFse && (
              <>
                <button
                  onClick={handleResetBase}
                  disabled={resetting}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 flex items-center space-x-2 transition-all"
                >
                  <Database className="w-4 h-4 text-amber-400" />
                  <span>Reset Base File</span>
                </button>

                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center space-x-2 transition-all transform hover:scale-105"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Hourly File</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* File Metadata Info Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 pt-1">
          <div className="flex items-center space-x-4">
            <span>File: <strong className="text-cyan-300">{stats?.active_filename || '12AM.xlsb'}</strong></span>
            <span>Date: <strong className="text-slate-200">{stats?.date_str || 'Aug 07, 2026'}</strong></span>
            <span>Uploaded by: <strong className="text-slate-200">{stats?.uploaded_by || 'System Administrator'}</strong></span>
          </div>

          <div>
            Total Tracked Elements: <strong className="text-cyan-300">{totalRecords.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* 🎛️ FILTERS & HOUR SELECTOR BAR */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          
          {/* Dropdown Filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 w-full lg:w-auto">
            {/* State Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">State</label>
              <select
                value={selectedState}
                onChange={(e) => { setSelectedState(e.target.value); setSelectedLga('All'); }}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              >
                {currentUser?.is_superuser && <option value="All">All States</option>}
                {stateInfo?.code && <option value={stateInfo.code}>{stateInfo.code} ({stateInfo.name || stateInfo.code})</option>}
                {stats?.available_states?.filter(s => s !== stateInfo?.code).map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* LGA Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">LGA</label>
              <select
                value={selectedLga}
                onChange={(e) => setSelectedLga(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="All">All LGAs ({stats?.available_lgas?.length || 0})</option>
                {stats?.available_lgas?.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* SMC FSE Engineer Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">SMC FSE Engineer</label>
              <select
                value={selectedFse}
                onChange={(e) => setSelectedFse(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-cyan-300 border-cyan-500/30 focus:outline-none focus:border-cyan-500 font-bold"
              >
                <option value="All">All FSEs ({stats?.available_fses?.length || 0})</option>
                {stats?.available_fses?.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {/* Tech Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Technology</label>
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="All">All Techs (2G, 3G, 4G, 5G)</option>
                <option value="2G">2G BTS</option>
                <option value="3G">3G NODEB</option>
                <option value="4G">4G eNodeB</option>
                <option value="5G">5G gNodeB</option>
              </select>
            </div>

            {/* Tower Co Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Tower Co</label>
              <select
                value={selectedTowerCo}
                onChange={(e) => setSelectedTowerCo(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="All">All TowerCos</option>
                {stats?.available_tower_cos?.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Element Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* ⏰ HOURLY TIMELINE SELECTOR PILLS */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Select Hour to Inspect Matrix & Averages:</span>
            </span>
            <span className="text-[11px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-500/30">
              Viewing: {selectedHour === 'Latest' ? `Latest Tracked Hour (${hoursList[hoursList.length - 1] || '12:00'})` : `${selectedHour} Hour`}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
            <button
              onClick={() => setSelectedHour('Latest')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 border ${
                selectedHour === 'Latest'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
              }`}
            >
              Latest Hour
            </button>

            {hoursList.map(h => (
              <button
                key={h}
                onClick={() => setSelectedHour(h)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 border ${
                  selectedHour === h
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 📊 KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Overall Hourly Avg */}
        <div className="glass-panel p-5 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/90 to-cyan-950/30 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Overall Availability</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black font-mono text-cyan-300">
              {stats?.overall_avg ? stats.overall_avg.toFixed(2) : '100.00'}%
            </span>
            <span className="text-xs font-bold text-slate-400 font-mono">Target: 98.5%</span>
          </div>
          <div className="w-full bg-slate-950/80 rounded-full h-2 mt-3 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats?.overall_avg || 100)}%` }}
            ></div>
          </div>
        </div>

        {/* SLA Compliant */}
        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 to-emerald-950/30 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>SLA Compliant (≥ 98.5%)</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black font-mono text-emerald-300">
              {stats?.sla_compliant_count?.toLocaleString() || 0}
            </span>
            <span className="text-xs font-bold text-emerald-400 font-mono">
              ({stats?.total_elements ? ((stats.sla_compliant_count / stats.total_elements) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Meeting target performance standards</p>
        </div>

        {/* SLA Breached */}
        <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900/90 to-amber-950/30 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>SLA Breached (&lt; 98.5%)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black font-mono text-amber-300">
              {stats?.sla_breached_count?.toLocaleString() || 0}
            </span>
            <span className="text-xs font-bold text-amber-400 font-mono">
              ({stats?.total_elements ? ((stats.sla_breached_count / stats.total_elements) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Degraded performance requiring SDM check</p>
        </div>

        {/* Critical Outage */}
        <div className="glass-panel p-5 rounded-2xl border border-red-500/40 bg-gradient-to-br from-slate-900/90 to-red-950/40 shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Critical Outage (&lt; 95.0%)</span>
            <AlertOctagon className="w-4 h-4 text-red-400 animate-bounce" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black font-mono text-red-400">
              {stats?.critical_breach_count?.toLocaleString() || 0}
            </span>
            <span className="text-xs font-bold text-red-400 font-mono">
              ({stats?.total_elements ? ((stats.critical_breach_count / stats.total_elements) * 100).toFixed(1) : 0}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Severe downtime or outage reported</p>
        </div>

      </div>

      {/* 📈 NATIONAL & REGIONAL HOURLY AVAILABILITY TREND CURVES */}
      {stats?.national_regional_data && stats.national_regional_data.length > 0 && (
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <span>National & Regional Hourly Availability Curve (00:00 to 23:00)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Hourly availability trends across 2G, 3G, 4G, 5G and Abuja Middle Belt Region
              </p>
            </div>
            <span className="px-3 py-1 bg-cyan-950/80 text-cyan-300 font-mono text-xs font-bold rounded-lg border border-cyan-500/30">
              Target Line: 98.6%
            </span>
          </div>

          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.national_regional_data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis domain={[95, 100]} stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="2G" name="2G National" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="3G" name="3G National" stroke="#a855f7" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="4G" name="4G National" stroke="#34d399" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="5G" name="5G National" stroke="#f43f5e" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="Middle_Belt_ABJ" name="Middle Belt (ABJ)" stroke="#fbbf24" strokeWidth={3} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Target" name="SLA Target (98.6%)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="2 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 📱 TECHNOLOGY LAYER BREAKDOWN & LGA PERFORMANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Tech Layer Breakdown */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4">
          <h3 className="text-sm font-black text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Technology Layer Scores</span>
          </h3>

          <div className="space-y-3">
            {['2G', '3G', '4G', '5G'].map(techKey => {
              const techData = stats?.tech_breakdown?.[techKey] || { avg: 100.0, count: 0 };
              return (
                <div key={techKey} className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-9 h-9 rounded-xl bg-purple-950/80 text-purple-300 font-mono font-black text-xs flex items-center justify-center border border-purple-500/30">
                      {techKey}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">{techKey} Layer</div>
                      <div className="text-[11px] text-slate-400 font-mono">{techData.count?.toLocaleString() || 0} elements</div>
                    </div>
                  </div>
                  {getScoreBadge(techData.avg)}
                </div>
              );
            })}
          </div>
        </div>

        {/* LGA Breakdown List */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-white flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span>LGA Availability Performance (Local Government Areas)</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">{stats?.lga_breakdown?.length || 0} LGAs Tracked</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats?.lga_breakdown?.slice(0, 8).map(lgaObj => (
              <div key={lgaObj.lga} className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">{lgaObj.lga}</span>
                  {getScoreBadge(lgaObj.avg)}
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${lgaObj.avg >= 98.5 ? 'bg-emerald-400' : (lgaObj.avg >= 95 ? 'bg-amber-400' : 'bg-red-500')}`}
                    style={{ width: `${Math.min(100, lgaObj.avg)}%` }}
                  ></div>
                </div>
                {lgaObj.worst_site && (
                  <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-900">
                    <span>Lowest: <strong className="text-amber-300">{lgaObj.worst_site}</strong></span>
                    <span>{lgaObj.worst_score?.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 📋 DETAILED HOURLY ELEMENTS HEAT MATRIX TABLE */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl space-y-4">
        
        {/* Table Search & Sort Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search Site ID, LGA, Element..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-medium"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="avg_availability">Sort: Worst Score First</option>
              <option value="-avg_availability">Sort: Best Score First</option>
              <option value="site_id">Sort: Site ID (A-Z)</option>
              <option value="tech">Sort: Tech Layer</option>
            </select>
          </div>

          <div className="text-xs font-mono text-slate-400">
            Showing <strong className="text-cyan-300">{records.length}</strong> of <strong className="text-slate-200">{totalRecords.toLocaleString()}</strong> elements
          </div>
        </div>

        {/* Table Render */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans text-slate-200">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
                <th className="p-3">Site ID / Element</th>
                <th className="p-3">Tech</th>
                <th className="p-3">LGA & State</th>
                <th className="p-3">Tower Co</th>
                <th className="p-3 text-center">Avg Availability</th>
                <th className="p-3 text-center">Latest Hour</th>
                <th className="p-3 text-center">24-Hour Matrix (00:00 to 23:00)</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {tableLoading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400 font-mono text-xs">
                    <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto mb-2" />
                    Loading hourly element availability records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400 font-mono text-xs">
                    No hourly availability records found matching search filters.
                  </td>
                </tr>
              ) : (
                records.map(rec => (
                  <tr
                    key={rec.id}
                    onClick={() => setSelectedSiteRecord(rec)}
                    className="hover:bg-slate-800/80 transition-colors cursor-pointer group"
                  >
                    
                    {/* Site ID */}
                    <td className="p-3 font-mono font-bold text-cyan-300 group-hover:text-cyan-200">
                      <div className="flex items-center space-x-2">
                        <span>{rec.site_id}</span>
                        {rec.element_name !== rec.site_id && (
                          <span className="text-[10px] text-slate-500 font-normal">({rec.element_name})</span>
                        )}
                      </div>
                    </td>

                    {/* Tech */}
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-500/30">
                        {rec.tech}
                      </span>
                    </td>

                    {/* LGA & State */}
                    <td className="p-3 text-slate-300">
                      <div className="font-medium">{rec.lga || 'FCT'}</div>
                      <div className="text-[10px] text-slate-500">{rec.state}</div>
                    </td>

                    {/* Tower Co */}
                    <td className="p-3 text-slate-300 font-mono text-xs">
                      {rec.tower_co || 'IHS'}
                    </td>

                    {/* Avg Score */}
                    <td className="p-3 text-center">
                      {getScoreBadge(rec.avg_availability)}
                    </td>

                    {/* Latest Hour Score */}
                    <td className="p-3 text-center">
                      {getScoreBadge(rec.latest_availability)}
                    </td>

                    {/* 24-Hour Scores Heat Strip */}
                    <td className="p-3">
                      <div className="flex items-center space-x-1 justify-center max-w-xs overflow-x-auto py-1">
                        {hoursList.slice(0, 14).map(h => {
                          const val = rec.hourly_scores?.[h];
                          let color = 'bg-emerald-500';
                          if (val === undefined || val === null) color = 'bg-slate-800';
                          else if (val < 95.0) color = 'bg-red-500';
                          else if (val < 98.5) color = 'bg-amber-400';

                          return (
                            <div
                              key={h}
                              title={`${h}: ${val !== undefined && val !== null ? `${val}%` : 'N/A'}`}
                              className={`w-2.5 h-6 rounded-sm ${color} transition-all hover:scale-125`}
                            ></div>
                          );
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSiteRecord(rec);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700/80 flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Details</span>
                        </button>
                        {onNavigateToSite && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToSite(rec.site_id);
                            }}
                            className="px-2.5 py-1 bg-cyan-950/80 hover:bg-cyan-900/80 text-cyan-300 text-[11px] font-bold rounded-lg border border-cyan-500/30 flex items-center space-x-1"
                          >
                            <span>Profile</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="text-xs font-mono text-slate-400">
            Page <strong className="text-slate-200">{currentPage}</strong> of <strong className="text-slate-200">{totalPages}</strong>
          </div>

          <div className="flex items-center space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold rounded-lg transition-all"
            >
              Previous
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold rounded-lg transition-all"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 📥 UPLOAD HOURLY AVAILABILITY MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel p-6 rounded-3xl border border-cyan-500/40 bg-slate-900 max-w-lg w-full shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-black text-white">Upload Hourly Availability File</h3>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4">
              
              {/* Dropzone Area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setSelectedFile(e.dataTransfer.files[0]);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                  dragActive
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : selectedFile
                    ? 'border-emerald-500/60 bg-emerald-950/20'
                    : 'border-slate-700/80 bg-slate-950/60 hover:border-slate-600'
                }`}
                onClick={() => document.getElementById('hourly-file-input').click()}
              >
                <input
                  id="hourly-file-input"
                  type="file"
                  accept=".xlsb,.xlsx,.xls"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  className="hidden"
                />
                
                <Upload className="w-10 h-10 text-cyan-400 mx-auto mb-3 animate-pulse" />
                
                {selectedFile ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-emerald-300 font-mono">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-200">Drag & Drop Hourly Spreadsheet File here</p>
                    <p className="text-[11px] text-slate-400">or click to browse (.xlsb, .xlsx files e.g. 12AM.xlsb, 1AM.xlsb)</p>
                  </div>
                )}
              </div>

              {/* Upload Status Feedback */}
              {uploadMessage && (
                <div className={`p-3 rounded-xl text-xs font-medium border ${
                  uploadMessage.type === 'success'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                    : uploadMessage.type === 'error'
                    ? 'bg-red-950/80 text-red-300 border-red-500/40'
                    : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/40'
                }`}>
                  {uploadMessage.text}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center space-x-2"
                >
                  {uploading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{uploading ? 'Processing & Importing...' : 'Upload & Process Hourly File'}</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* 🔍 DEGRADED SITE DETAILS INSPECTOR MODAL */}
      {selectedSiteRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="glass-panel p-6 rounded-3xl border border-cyan-500/40 bg-slate-900 max-w-2xl w-full shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-gradient-to-tr from-cyan-600 to-purple-600 rounded-2xl text-white shadow-lg">
                  <Activity className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-black text-white font-mono">{selectedSiteRecord.site_id}</h2>
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-purple-950 text-purple-300 border border-purple-500/40">
                      {selectedSiteRecord.tech}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${
                      (selectedSiteRecord.avg_availability < 95)
                        ? 'bg-red-950 text-red-300 border-red-500/50'
                        : (selectedSiteRecord.avg_availability < 98.5)
                        ? 'bg-amber-950 text-amber-300 border-amber-500/50'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-500/50'
                    }`}>
                      {selectedSiteRecord.status || 'Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedSiteRecord.site_name || 'Telecom Cell Tower'} • {selectedSiteRecord.lga || 'FCT'}, {selectedSiteRecord.state || 'FCT'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedSiteRecord(null)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Performance Overview KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">24-Hour Avg Score</div>
                <div className="text-2xl font-black font-mono text-cyan-300">
                  {selectedSiteRecord.avg_availability?.toFixed(2) || '0.00'}%
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Latest Hour Score</div>
                <div className="text-2xl font-black font-mono text-amber-300">
                  {selectedSiteRecord.latest_availability?.toFixed(2) || '0.00'}%
                </div>
                <div className="text-[10px] text-slate-500 font-mono">Hour: {selectedSiteRecord.latest_hour || '12:00'}</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Tower Co & Region</div>
                <div className="text-sm font-bold text-slate-200">
                  {selectedSiteRecord.tower_co || 'IHS'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {selectedSiteRecord.territory || selectedSiteRecord.region || 'Central Area'}
                </div>
              </div>
            </div>

            {/* SLA Status Warning Callout */}
            {selectedSiteRecord.avg_availability < 98.5 && (
              <div className={`p-4 rounded-2xl border flex items-start space-x-3 ${
                selectedSiteRecord.avg_availability < 95
                  ? 'bg-red-950/40 border-red-500/40 text-red-300'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              }`}>
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold">
                    {selectedSiteRecord.avg_availability < 95
                      ? '🚨 CRITICAL AVAILABILITY SLA BREACH (< 95.0%)'
                      : '⚠️ MODERATE NETWORK DEGRADATION (< 98.5%)'}
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    This element failed the minimum 98.6% network availability threshold over the 24-hour monitoring window. Review hourly breakdown below for power, generator, or transmission root cause details.
                  </p>
                </div>
              </div>
            )}

            {/* 24-Hour Hourly Breakdown Matrix Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Complete 24-Hour Hourly Breakdown (00:00 - 23:00)</span>
                <span className="text-slate-500 text-[11px] font-mono">{hoursList.length} Hours Tracked</span>
              </h3>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 bg-slate-950/90 p-3.5 rounded-2xl border border-slate-800">
                {hoursList.map(h => {
                  const val = selectedSiteRecord.hourly_scores?.[h];
                  let border = 'border-slate-800 text-slate-400 bg-slate-900';
                  if (val !== undefined && val !== null) {
                    if (val < 95.0) border = 'border-red-500/60 text-red-300 bg-red-950/40';
                    else if (val < 98.5) border = 'border-amber-500/60 text-amber-300 bg-amber-950/40';
                    else border = 'border-emerald-500/40 text-emerald-300 bg-emerald-950/30';
                  }

                  return (
                    <div key={h} className={`p-2 rounded-xl border text-center font-mono ${border}`}>
                      <div className="text-[10px] text-slate-400">{h}</div>
                      <div className="text-xs font-black mt-0.5">
                        {val !== undefined && val !== null ? `${val}%` : 'N/A'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent SDM Operational Notes & Tickets for Site */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Recent Operational Field Notes & Incident Tickets</span>
                <span className="text-slate-500 text-[11px] font-mono">{siteNotes.length} Logged</span>
              </h3>

              {loadingSiteNotes ? (
                <div className="p-4 text-center text-xs text-slate-400 font-mono">
                  Loading site notes...
                </div>
              ) : siteNotes.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800/80 font-mono">
                  No active operational notes logged for site {selectedSiteRecord.site_id}.
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {siteNotes.map(n => (
                    <div key={n.id} className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-cyan-300">{n.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                          {n.category || 'General'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{n.description}</p>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between pt-1">
                        <span>Logged by: {n.created_by || 'SDM'}</span>
                        <span>{new Date(n.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Bar Footer */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-4">
              <div className="text-[11px] text-slate-400 font-mono">
                Element ID: <strong className="text-cyan-300">{selectedSiteRecord.element_name}</strong>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setSelectedSiteRecord(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all"
                >
                  Close
                </button>

                {onNavigateToSite && (
                  <button
                    onClick={() => {
                      const sid = selectedSiteRecord.site_id;
                      setSelectedSiteRecord(null);
                      onNavigateToSite(sid);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center space-x-2"
                  >
                    <span>Open Site Profile</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
