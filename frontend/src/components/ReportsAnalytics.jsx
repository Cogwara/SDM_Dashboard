import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, User, Calendar, Lock, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchReportsAnalytics } from '../api';

export default function ReportsAnalytics({ onSelectSite, currentUser }) {
  const isSuperuser = currentUser?.is_superuser;
  const userSdmName = currentUser?.full_name || '';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('Daily'); // Daily, Weekly, Monthly

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const sdmParam = !isSuperuser ? userSdmName : undefined;
      const res = await fetchReportsAnalytics({ sdm: sdmParam });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [userSdmName, isSuperuser]);

  if (loading) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center text-slate-400 text-xs border border-slate-800">
        Generating FCT operational intelligence reports for your portfolio...
      </div>
    );
  }

  const faultBreakdownData = data?.fault_breakdown ? [
    { name: 'Power Outages', count: data.fault_breakdown.power_outages },
    { name: 'Generator Failures', count: data.fault_breakdown.generator_failures },
    { name: 'Battery Failures', count: data.fault_breakdown.battery_failures },
    { name: 'Transmission Link', count: data.fault_breakdown.transmission_failures },
    { name: 'Customer Escalations', count: data.fault_breakdown.customer_escalations },
  ] : [];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            FCT Telecom Executive Reports & Operational Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {!isSuperuser ? (
              <span className="text-cyan-300 font-semibold flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3 text-cyan-400" /> Scoped to SDM Portfolio: <b>{userSdmName}</b> Analytics
              </span>
            ) : (
              'Super Administrator Access &bull; Downtime Trends, Top Problematic Sites, Cluster SLA Compliance, and Fault Metrics'
            )}
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          {['Daily', 'Weekly', 'Monthly'].map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                timeframe === t ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t} Report
            </button>
          ))}
        </div>
      </div>

      {/* Grid: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Problematic Sites Line Graph */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Top Problematic Sites Incident Trend</span>
            <span className="text-xs text-slate-400">{timeframe}</span>
          </h3>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.top_problematic_sites || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="site__ihs_site_id" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }} />
                <Line type="monotone" dataKey="incident_count" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444', r: 5 }} activeDot={{ r: 8 }} name="Incident Count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fault Breakdown Line Graph */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" /> Fault Category Trend & Distribution</span>
            <span className="text-xs text-slate-400">{timeframe}</span>
          </h3>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={faultBreakdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} angle={-10} textAnchor="end" height={45} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }} />
                <Line type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={3} dot={{ fill: '#06b6d4', r: 5 }} activeDot={{ r: 8 }} name="Fault Count" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>


      {/* Cluster Performance Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white">Cluster Operational SLA Performance</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Cluster Name</th>
                <th className="p-3">Total Managed Sites</th>
                <th className="p-3">Active Down Sites</th>
                <th className="p-3">Critical Priority Sites</th>
                <th className="p-3">SLA Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data?.cluster_performance && data.cluster_performance.length > 0 ? (
                data.cluster_performance.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-900/40">
                    <td className="p-3 font-semibold text-white">{c.cluster_name || 'FCT General'}</td>
                    <td className="p-3 font-mono">{c.total_sites}</td>
                    <td className="p-3 font-mono font-bold text-red-400">{c.down_sites}</td>
                    <td className="p-3 font-mono text-amber-400">{c.critical_sites}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.down_sites > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-300'
                      }`}>
                        {c.down_sites > 0 ? 'ATTENTION REQUIRED' : 'OPTIMAL'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">No cluster metrics recorded yet for this portfolio.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
