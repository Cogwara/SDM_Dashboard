import React, { useState } from 'react';
import { Radio, Lock, User, Key, ArrowRight, ShieldCheck, CheckCircle, Server, Eye, EyeOff, Smartphone, Download, RefreshCw, Zap, Wifi } from 'lucide-react';
import { loginSDM, setCustomServerIp, checkServerHealth } from '../api';

export default function SDMLoginModal({ onLoginSuccess }) {
  const isMobileNative = typeof window !== 'undefined' && Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );

  const defaultIp = 'https://ice-powerseller-clerk-where.trycloudflare.com';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverIp, setServerIp] = useState(() => {
    const saved = localStorage.getItem('fct_sdm_server_ip');
    if (saved && (saved.includes('warm-tennis-touch-kansas.trycloudflare.com') || saved.includes('graduate-summaries-joy-tenant.trycloudflare.com'))) {
      localStorage.removeItem('fct_sdm_server_ip');
      return defaultIp;
    }
    return saved || defaultIp;
  });
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [savedNotice, setSavedNotice] = useState('');

  const handleApplyPreset = (url) => {
    setServerIp(url);
    const activeUrl = setCustomServerIp(url);
    setSavedNotice(`Saved endpoint: ${activeUrl}`);
  };

  const handleSaveServerAddress = () => {
    const activeUrl = setCustomServerIp(serverIp.trim());
    setSavedNotice(`Saved endpoint: ${activeUrl}`);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your SDM username and password.');
      return;
    }

    setLoading(true);
    setError('');

    const activeUrl = setCustomServerIp(serverIp.trim());

    try {
      const res = await loginSDM(username.trim(), password.trim());
      onLoginSuccess(res.user, res.token);
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      if (status === 401 || status === 400 || status === 429) {
        setError(err.response?.data?.error || err.response?.data?.detail || 'Invalid username or password. Please check your credentials.');
      } else {
        setError(`Authentication failed. Unable to reach server at ${activeUrl}. Check your Server IP / Web Address configuration.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] p-3 sm:p-6 flex items-center justify-center overflow-y-auto">
      
      <div className="bg-slate-900/90 backdrop-blur-2xl max-w-5xl w-full rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.12)] overflow-hidden grid grid-cols-1 md:grid-cols-12 my-2 sm:my-6 transition-all duration-300">

        {/* Left Column: Brand & Security Overview (Order 2 on mobile so Sign In form is immediately accessible) */}
        <div className="order-2 md:order-1 md:col-span-5 bg-gradient-to-b from-slate-900 via-slate-950 to-cyan-950/80 p-5 sm:p-8 flex flex-col justify-between border-t md:border-t-0 md:border-r border-slate-800/80 relative overflow-hidden">
          
          {/* Subtle Ambient Glow Effect */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="space-y-6 relative z-10">
            {/* Header Brand */}
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-tr from-cyan-600 via-teal-500 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/30 ring-1 ring-cyan-400/40">
                <Radio className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-teal-200 to-white">
                  SDM PORTAL
                </h1>
                <p className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">FCT Telecom Control Center</p>
              </div>
            </div>

            {/* Cloudflare Active Status Pill */}
            <div className="p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-slate-200 font-semibold text-[11px]">Cloudflare Tunnel Ready</span>
              </div>
              <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/30">v3.0 Live</span>
            </div>

            <div className="space-y-2.5 pt-2">
              <h2 className="text-base font-bold text-white leading-snug">
                State Delivery Manager & Admin Workspace
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log in to monitor live FCT site telemetry, run AI-powered RCA diagnostics, track fiber outage tickets, and sync field notes across desktop & mobile.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              {[
                'Full 20,174 FCT Telecom Site Inventory Telemetry',
                'Super User SDM Profile Creation & Management',
                'AI Root Cause Diagnostics Engine',
                'Seamless Mobile App & Desktop Synchronization',
              ].map((feat, i) => (
                <div key={i} className="flex items-center space-x-2.5 text-xs text-slate-300">
                  <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            {/* Android APK Download Card (Hidden inside native mobile app) */}
            {!isMobileNative && (
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                  <span className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-cyan-400" /> Android APK App
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">Mobile Build</span>
                </div>
                <a
                  href="https://ice-powerseller-clerk-where.trycloudflare.com/media/downloads/FCT_SDM_Mobile_v3.apk"
                  download="FCT_SDM_Mobile_v3.apk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-200" />
                  <span>Download Mobile App (.APK)</span>
                </a>
              </div>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between relative z-10">
            <span>SDM Operations Platform</span>
            <span className="text-cyan-400 font-mono flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> 256-bit Encrypted</span>
          </div>
        </div>

        {/* Right Column: Credentials & Server Form (Order 1 on mobile) */}
        <div className="order-1 md:order-2 md:col-span-7 p-5 sm:p-8 space-y-5 bg-slate-900/40 flex flex-col justify-center">
          {/* Compact Mobile Brand Bar */}
          <div className="flex md:hidden items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FFCC00] text-black font-black text-xs flex items-center justify-center">
                MTN
              </div>
              <div>
                <h2 className="text-sm font-black text-white leading-tight">SDM Mobile Portal</h2>
                <p className="text-[10px] text-cyan-400 font-semibold">Field Operations & SLA</p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
              Online
            </span>
          </div>
          
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-cyan-400" /> Sign In
              </h3>
              <button
                type="button"
                onClick={() => setShowServerConfig(!showServerConfig)}
                className="text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-mono transition-all"
              >
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>{showServerConfig ? 'Close Server Config' : 'Server IP Config'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Enter your registered username and password to authenticate.</p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded-xl font-medium flex items-start gap-2">
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" /> Username
              </label>
              <input
                type="text"
                required
                placeholder="SDM Manager username or Admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 p-3.5 rounded-xl border border-slate-700/80 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5 text-cyan-400" /> Password</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 text-xs text-white p-3.5 pr-10 rounded-xl border border-slate-700/80 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Server Config Collapsible Section */}
            {showServerConfig && (
              <div className="p-4 bg-slate-950/90 rounded-2xl border border-cyan-500/40 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-cyan-300 flex items-center gap-1 font-mono">
                    <Server className="w-3.5 h-3.5 text-cyan-400" /> BACKEND SERVER ENDPOINT
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Cloudflare / Direct IP</span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(defaultIp)}
                    className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border flex items-center gap-1 transition-all ${
                      serverIp.includes('trycloudflare.com')
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Wifi className="w-3 h-3 text-cyan-400" /> Cloudflare Tunnel (Global)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('http://localhost:8001')}
                    className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border flex items-center gap-1 transition-all ${
                      serverIp.includes('localhost')
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-bold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Zap className="w-3 h-3 text-amber-400" /> Local Port 8001
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Enter IP or Web Address (e.g. https://... or 192.168.1.100:8001)"
                    value={serverIp}
                    onChange={(e) => {
                      setServerIp(e.target.value);
                      setCustomServerIp(e.target.value);
                      setSavedNotice('');
                    }}
                    className="flex-1 bg-slate-900 text-xs text-white p-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveServerAddress}
                    className="px-3.5 py-2.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                  >
                    Apply Address
                  </button>
                </div>

                {savedNotice && (
                  <div className="p-2.5 rounded-xl text-[11px] font-mono border bg-emerald-950/40 text-emerald-300 border-emerald-500/30">
                    {savedNotice}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:via-teal-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-95 mt-4"
            >
              <span>{loading ? 'Authenticating Profile...' : 'Sign In to Workspace'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

        </div>

      </div>

    </div>
  );
}
