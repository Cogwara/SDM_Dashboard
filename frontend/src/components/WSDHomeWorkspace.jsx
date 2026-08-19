import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, 
  Database, ShieldCheck, ArrowRight, Activity, Server, LayoutDashboard, 
  Map, FileText, Bot, Radio, Clock, Layers, User, Sparkles
} from 'lucide-react';
import { uploadWSDFile, fetchWSDStatus, resetBaseWSD } from '../api';
import { getSDMStateInfo } from '../utils/userUtils';

export default function WSDHomeWorkspace({ currentUser, onNavigate, onRefreshData }) {
  const [wsdStatus, setWsdStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const isFse = currentUser?.role === 'SMC FSE Engineer' || currentUser?.role === 'FSE Engineer' || currentUser?.role === 'FSE';

  const loadStatus = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchWSDStatus();
      setWsdStatus(data);
    } catch (e) {
      console.error('Failed to load WSD status:', e);
      setErrorMsg('Failed to load active database status from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsb') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setErrorMsg('Invalid file type! Please upload a Microsoft Excel WSD spreadsheet (.xlsb or .xlsx).');
      setSelectedFile(null);
      return;
    }
    setErrorMsg('');
    setUploadSuccessMsg('');
    setSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress('Uploading and parsing WSD spreadsheet... This may take up to 30 seconds for 20k+ site records.');
    setErrorMsg('');
    setUploadSuccessMsg('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'Regional Delivery Manager';
      formData.append('uploaded_by', uploaderName);

      const res = await uploadWSDFile(formData);

      if (res && res.success) {
        setUploadSuccessMsg(`WSD database updated successfully! Imported ${res.site_count.toLocaleString()} sites across ${res.states_count} states from ${res.filename}.`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadStatus();
        if (onRefreshData) onRefreshData();
      } else {
        setErrorMsg(res?.error || 'Failed to process uploaded WSD file.');
      }
    } catch (e) {
      console.error('WSD Upload error:', e);
      setErrorMsg(e.response?.data?.error || 'Error uploading file to server. Ensure server connection is active.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleResetBase = async () => {
    if (!window.confirm('Reset WSD database back to base WSD July 2026 V5.1 dataset?')) return;

    setUploading(true);
    setUploadProgress('Resetting database to base WSD July 2026 V5.1...');
    setErrorMsg('');
    setUploadSuccessMsg('');

    try {
      const uploaderName = currentUser ? (currentUser.full_name || currentUser.username) : 'System Administrator';
      const res = await resetBaseWSD(uploaderName);

      if (res && res.success) {
        setUploadSuccessMsg(`Database reset to base WSD July 2026 V5.1 (${res.site_count.toLocaleString()} sites).`);
        await loadStatus();
        if (onRefreshData) onRefreshData();
      } else {
        setErrorMsg(res?.error || 'Failed to reset base WSD.');
      }
    } catch (e) {
      console.error('Reset base error:', e);
      setErrorMsg('Error resetting database.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const stateInfo = getSDMStateInfo(currentUser);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10">
      
      {/* Top Welcome & RDM Directive Banner */}
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-cyan-500/30 shadow-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/3 -mb-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                V4 WSD Workspace Command Center
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Base DB Loaded
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
              Welcome, <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{currentUser?.full_name || 'Regional Delivery Manager'}</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              The system is initialized with <strong className="text-cyan-300 font-mono">WSD July 2026 V5.1.xlsb</strong> as the base database. 
              Please upload your own updated Regional WSD spreadsheet below to customize the live operational database for your state territory (<span className="text-cyan-400 font-bold">{stateInfo.stateName}</span>). All site tracking, diagnostics, notes, and analytics will dynamically adapt to your uploaded dataset.
            </p>

            <div className="pt-1 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-cyan-400" />
                <span>Role: <strong className="text-slate-200">{currentUser?.role || 'SDM'}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Map className="w-4 h-4 text-cyan-400" />
                <span>Territory: <strong className="text-slate-200">{stateInfo.stateName}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                <span>Active File: <strong className="text-cyan-300 font-mono">{wsdStatus?.active_filename || 'WSD July 2026 V5.1.xlsb'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto shrink-0">
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-2xl shadow-xl hover:shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 group"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Open Dashboard Overview</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => onNavigate('database')}
              className="px-5 py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4 text-cyan-400" />
              <span>Explore Site Database</span>
            </button>
          </div>
        </div>
      </div>


      {/* Upload Zone & Active Database Telemetry Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* WSD File Upload Box / FSE Read-Only View */}
        <div className="lg:col-span-7 space-y-4">
          {isFse ? (
            <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-cyan-500/20 bg-slate-900/60 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-cyan-400" />
                    WSD Database Workspace (FSE Read-Only)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    WSD spreadsheet uploading & reset operations are restricted to State Delivery Managers & System Administrators.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-cyan-950/80 text-cyan-300 text-[11px] font-bold rounded-xl border border-cyan-500/30 font-mono">
                  Assigned Sites Only
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                As an SMC FSE Engineer, you can search and inspect all site specs, transmission topologies, and operational notes for your assigned cell sites below.
              </p>
            </div>
          ) : (
            <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 shadow-xl space-y-5 bg-slate-900/60 backdrop-blur-md">
              
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Upload className="w-5 h-5 text-cyan-400" />
                    Upload Custom Regional WSD File
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select or drag & drop your latest <span className="text-cyan-300 font-semibold">WSD .xlsb</span> or <span className="text-cyan-300 font-semibold">.xlsx</span> spreadsheet.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 text-[11px] font-bold rounded-xl border border-cyan-500/20">
                  XLSB / XLSX
                </span>
              </div>

            {/* Notifications */}
            {uploadSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-emerald-200">Upload Successful</span>
                  <p className="text-[11px]">{uploadSuccessMsg}</p>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-red-200">Upload Error</span>
                  <p className="text-[11px]">{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                isDragOver 
                  ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]' 
                  : selectedFile 
                    ? 'border-emerald-500/60 bg-emerald-500/5' 
                    : 'border-slate-700/80 hover:border-cyan-500/50 bg-slate-950/40 hover:bg-slate-900/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsb,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-3">
                <div className={`p-4 rounded-2xl transition-transform ${selectedFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                  <FileSpreadsheet className="w-10 h-10 animate-bounce-subtle" />
                </div>

                {selectedFile ? (
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 uppercase tracking-wider block font-bold">Selected File Ready</span>
                    <h4 className="text-sm font-extrabold text-emerald-300 font-mono">{selectedFile.name}</h4>
                    <span className="text-[11px] text-slate-400 block font-mono">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; {selectedFile.type || 'Excel Binary Spreadsheet'}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <h4 className="text-sm font-bold text-slate-200">
                      Drag & Drop your WSD file here or <span className="text-cyan-400 underline">Browse</span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      Supports full WSD July 2026 format with all 85+ columns (SiteID, Status, Contacts, Coordinates)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className={`flex-1 py-3 px-5 rounded-2xl font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${
                  !selectedFile || uploading
                    ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20 hover:scale-[1.01]'
                }`}
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                    <span>Processing WSD Database...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload & Process WSD File</span>
                  </>
                )}
              </button>

              {selectedFile && !uploading && (
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-2xl border border-slate-700"
                >
                  Clear
                </button>
              )}
            </div>

            {uploading && (
              <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-3">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-cyan-400" />
                <span className="font-mono text-[11px]">{uploadProgress}</span>
              </div>
            )}

          </div>
        </div>

        {/* Active Database Status & Telemetry Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel p-6 sm:p-7 rounded-3xl border border-slate-800 shadow-xl space-y-5 bg-slate-900/60 backdrop-blur-md h-full flex flex-col justify-between">
            
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-cyan-400" />
                  Active WSD Database Status
                </h3>

                <button
                  onClick={loadStatus}
                  disabled={loading}
                  className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-xl transition-all"
                  title="Refresh Database Status"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Status Pill */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Database Source</span>
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider ${
                    wsdStatus?.is_base 
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {wsdStatus?.is_base ? 'System Base WSD' : 'Custom Regional WSD'}
                  </span>
                </div>

                <div className="text-sm font-black text-white font-mono flex items-center gap-2 truncate">
                  <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">{wsdStatus?.active_filename || 'WSD July 2026 V5.1.xlsb'}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Uploaded By: <strong className="text-slate-200">{wsdStatus?.uploaded_by || 'System Base Seeder'}</strong></span>
                  <span>{wsdStatus?.uploaded_at ? new Date(wsdStatus.uploaded_at).toLocaleDateString() : 'Base Release'}</span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Total Sites</span>
                  <span className="text-xl font-black text-cyan-400 font-mono mt-1 block">
                    {wsdStatus?.site_count ? wsdStatus.site_count.toLocaleString() : '---'}
                  </span>
                  <span className="text-[10px] text-slate-500">Across {wsdStatus?.states_count || 0} States</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Critical (P1) Sites</span>
                  <span className="text-xl font-black text-amber-400 font-mono mt-1 block">
                    {wsdStatus?.critical_count ? wsdStatus.critical_count.toLocaleString() : '---'}
                  </span>
                  <span className="text-[10px] text-amber-500/80 font-medium">Priority 1 Outages</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Down Sites</span>
                  <span className="text-xl font-black text-red-400 font-mono mt-1 block">
                    {wsdStatus?.down_count !== undefined ? wsdStatus.down_count.toLocaleString() : '---'}
                  </span>
                  <span className="text-[10px] text-red-500/80 font-medium">Active Halted Outages</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">State Territories</span>
                  <span className="text-xl font-black text-emerald-400 font-mono mt-1 block">
                    {wsdStatus?.states_count || '---'}
                  </span>
                  <span className="text-[10px] text-emerald-500/80 font-medium">National Footprint</span>
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
              {!isFse ? (
                <button
                  onClick={handleResetBase}
                  disabled={uploading}
                  className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-red-500/10 text-slate-300 hover:text-red-400 text-xs font-bold rounded-xl border border-slate-700 hover:border-red-500/30 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset to Base WSD</span>
                </button>
              ) : <div />}

              <button
                onClick={() => onNavigate('dashboard')}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5"
              >
                <span>Launch Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>

      </div>


      {/* Quick Access Launcher Grid */}
      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          SDM Operations Modules (Using Active WSD)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div 
            onClick={() => onNavigate('dashboard')}
            className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/50 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition-all duration-200 group space-y-3"
          >
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl w-fit group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white group-hover:text-cyan-300 transition-colors">Dashboard Overview</h4>
              <p className="text-xs text-slate-400 mt-1">Live telemetry metrics, operational status, outage counts, and critical site alerts.</p>
            </div>
            <div className="flex items-center text-xs font-bold text-cyan-400 gap-1 pt-1">
              <span>View Overview</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div 
            onClick={() => onNavigate('database')}
            className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-blue-500/50 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition-all duration-200 group space-y-3"
          >
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl w-fit group-hover:scale-110 transition-transform">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white group-hover:text-blue-300 transition-colors">Site Database</h4>
              <p className="text-xs text-slate-400 mt-1">Search, filter, and inspect all {wsdStatus?.site_count ? wsdStatus.site_count.toLocaleString() : '20k+'} sites with full 85+ WSD specs.</p>
            </div>
            <div className="flex items-center text-xs font-bold text-blue-400 gap-1 pt-1">
              <span>Search Database</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div 
            onClick={() => onNavigate('map')}
            className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/50 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition-all duration-200 group space-y-3"
          >
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl w-fit group-hover:scale-110 transition-transform">
              <Map className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white group-hover:text-emerald-300 transition-colors">GeoMap GIS Viewer</h4>
              <p className="text-xs text-slate-400 mt-1">Geospatial map visualization of sites, clusters, and transmission topology.</p>
            </div>
            <div className="flex items-center text-xs font-bold text-emerald-400 gap-1 pt-1">
              <span>Open Map</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          <div 
            onClick={() => onNavigate('ai')}
            className="glass-panel p-5 rounded-2xl border border-slate-800 hover:border-indigo-500/50 bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition-all duration-200 group space-y-3"
          >
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl w-fit group-hover:scale-110 transition-transform">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white group-hover:text-indigo-300 transition-colors">AI Diagnostics Engine</h4>
              <p className="text-xs text-slate-400 mt-1">AI Root Cause Analysis (RCA), outage mitigation strategies, and engineering advice.</p>
            </div>
            <div className="flex items-center text-xs font-bold text-indigo-400 gap-1 pt-1">
              <span>Ask AI Assistant</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
