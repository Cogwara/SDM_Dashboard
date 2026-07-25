import React, { useState } from 'react';
import { Radio, Lock, User, Key, ArrowRight, ShieldCheck, CheckCircle, Server } from 'lucide-react';
import { loginSDM, setCustomServerIp, checkServerHealth } from '../api';

export default function SDMLoginModal({ onLoginSuccess }) {
  const isMobileNative = typeof window !== 'undefined' && Boolean(
    (window.Capacitor?.isNativePlatform?.() && window.Capacitor?.getPlatform?.() !== 'web') ||
    (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.getPlatform?.() === 'ios') ||
    window.location.protocol === 'capacitor:' || 
    window.location.protocol === 'file:'
  );

  const defaultIp = isMobileNative 
    ? '192.168.1.120' 
    : (typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('fct_sdm_server_ip') || defaultIp);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [testingServer, setTestingServer] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const handleTestConnection = async () => {
    setTestingServer(true);
    setTestResult(null);
    const activeUrl = setCustomServerIp(serverIp.trim());
    try {
      const res = await checkServerHealth();
      if (res) {
        setTestResult({ success: true, message: `🟢 Connected successfully to ${activeUrl}` });
      } else {
        setTestResult({ success: false, message: `🔴 Server network unreachable at ${activeUrl}. Ensure PC & phone are on the same Wi-Fi network.` });
      }
    } catch (err) {
      setTestResult({ success: false, message: `🔴 Connection error: ${err.message || 'Network unreachable'}` });
    } finally {
      setTestingServer(false);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your SDM username and password.');
      return;
    }

    setLoading(true);
    setError('');

    // Ensure server IP is configured and returns clean formatted URL
    const activeUrl = setCustomServerIp(serverIp.trim());

    try {
      const res = await loginSDM(username.trim(), password.trim());
      onLoginSuccess(res.user, res.token);
    } catch (err) {
      console.error(err);
      if (err.response) {
        setError(err.response.data?.error || err.response.data?.detail || 'Invalid username or password. Please check your credentials.');
      } else {
        setError(`Authentication failed. Unable to reach server at ${activeUrl}. Please verify your PC IP address and ensure Django backend is running.`);
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 p-4 flex items-center justify-center overflow-y-auto">
      
      <div className="bg-slate-900/95 max-w-4xl w-full rounded-3xl border border-cyan-500/30 shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 my-8">

        
        {/* Left Column: Brand & Security Overview */}
        <div className="md:col-span-5 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/20">
                <Radio className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="font-extrabold text-xl tracking-wider text-white">SDM PORTAL</h1>
                <p className="text-xs text-cyan-400 font-semibold">FCT Telecom Operations Control</p>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <h2 className="text-lg font-bold text-white leading-snug">State Delivery Manager & Admin Authentication</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log in with your assigned SDM manager profile or System Admin credentials to access real-time FCT telecom site telemetry, AI RCA engine, incident logs, and user management.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              {[
                'Full 20,174 FCT Telecom Site Inventory Access',
                'Super User SDM Profile Creation & Management',
                'AI-Powered Root Cause Analysis & Operations',
                'Cascading Multi-State & Parameter Filters',
              ].map((feat, i) => (
                <div key={i} className="flex items-center space-x-2 text-xs text-slate-300">
                  <CheckCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span>State Delivery Manager Portal</span>
            <span className="text-cyan-400 font-mono flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Encrypted Session</span>
          </div>
        </div>

        {/* Right Column: Credentials Form */}
        <div className="md:col-span-7 p-8 space-y-6 bg-slate-900/60 flex flex-col justify-center">
          
          <div>
            <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-cyan-400" /> Sign In to Your Profile
            </h3>
            <p className="text-xs text-slate-400 mt-1">Enter your registered username and password to start using the app.</p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" /> Username
              </label>
              <input
                type="text"
                required
                placeholder="Enter SDM username or Admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white placeholder-slate-500 p-3.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5 text-cyan-400" /> Password</span>
                <button
                  type="button"
                  onClick={() => setShowServerConfig(!showServerConfig)}
                  className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                >
                  <Server className="w-3 h-3" /> {showServerConfig ? 'Hide Server IP' : 'Server IP Config'}
                </button>
              </label>
              <input
                type="password"
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 text-xs text-white p-3.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500 transition-all font-mono"
              />
            </div>

            {showServerConfig && (
              <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/30 space-y-1.5">
                <label className="block text-[11px] font-bold text-cyan-300 flex items-center gap-1 font-mono">
                  <Server className="w-3 h-3 text-cyan-400" /> BACKEND SERVER HOST / IP ADDRESS
                </label>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.120 or 10.0.2.2"
                    value={serverIp}
                    onChange={(e) => {
                      setServerIp(e.target.value);
                      setCustomServerIp(e.target.value);
                    }}
                    className="flex-1 bg-slate-900 text-xs text-white p-2.5 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingServer}
                    className="px-3 py-2.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-bold rounded-lg transition-all whitespace-nowrap"
                  >
                    {testingServer ? 'Pinging...' : 'Test Connection'}
                  </button>
                </div>

                {testResult && (
                  <div className={`p-2 rounded-lg text-[11px] font-mono border ${
                    testResult.success ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30' : 'bg-red-950/40 text-red-300 border-red-500/30'
                  }`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 transition-all mt-2"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to SDM Workspace'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </form>

          {/* Quick Demo Login Credentials Helper */}
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">Quick Select Credentials:</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setUsername('admin');
                  setPassword('admin123');
                }}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 rounded-xl border border-cyan-500/30 text-left space-y-0.5 transition-all group"
              >
                <div className="font-extrabold text-cyan-300 text-[11px] flex items-center justify-between">
                  <span>👑 System Admin</span>
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-mono">Fill &rarr;</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">User: <b>admin</b> &bull; Pass: <b>admin123</b></div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUsername('mrchrys');
                  setPassword('sdm123456');
                }}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-700 text-left space-y-0.5 transition-all group"
              >
                <div className="font-extrabold text-slate-200 text-[11px] flex items-center justify-between">
                  <span>💼 SDM Manager</span>
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-mono">Fill &rarr;</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">User: <b>mrchrys</b> &bull; Pass: <b>sdm123456</b></div>
              </button>
            </div>
          </div>

        </div>


      </div>

    </div>
  );
}
