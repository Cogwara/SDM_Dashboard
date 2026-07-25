import React, { useState } from 'react';
import { Bot, Send, Sparkles, AlertCircle, FileText, Activity, ShieldAlert, Cpu } from 'lucide-react';
import { queryAIAssistant } from '../api';

export default function AIAssistantModal({ initialSiteId = '', onSelectSite }) {
  const [prompt, setPrompt] = useState('');
  const [siteIdInput, setSiteIdInput] = useState(initialSiteId);
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const sampleQuestions = [
    "Search SDM notes for generator failures and write a report on FC2700",
    "Search notes for power outage and write a site report",
    "Why is FC2700 down?",
    "Show everything that happened at FC2437.",
    "Who worked on FC2700?",
    "Show all generator failures this month.",
    "Which sites have repeated power failures?",
    "Generate executive operational briefing for FCT."
  ];

  const aiFunctions = [
    { label: '🔍 Search Notes & Write Site Report', fn: 'search_and_report' },
    { label: 'Summarize Site History', fn: 'summarize' },
    { label: 'Generate RCA', fn: 'rca' },
    { label: 'Summarize WhatsApp', fn: 'whatsapp_summary' },
    { label: 'Generate Timeline', fn: 'timeline' },
    { label: 'Highlight Recurring Faults', fn: 'recurring_faults' },
    { label: 'Predict Future Faults', fn: 'predict' },
    { label: 'Identify Repeat Outages', fn: 'repeat_outages' },
    { label: 'Generate Executive Report', fn: 'executive_report' }
  ];

  const handleAskAI = async (queryText, fnName = 'chat') => {
    const textToSubmit = queryText || prompt;

    // Extract site ID from prompt text if explicitly typed by user
    const siteMatch = textToSubmit ? textToSubmit.match(/\b(FC\d{3,5}|ABJ\d{3,5}|FCT\d{3,5})\b/i) : null;
    const targetSiteId = siteMatch ? siteMatch[1].toUpperCase() : siteIdInput;

    if (siteMatch) {
      setSiteIdInput(targetSiteId);
    }

    if (!textToSubmit && !targetSiteId) return;

    setLoading(true);
    setResponse(null);
    try {
      const res = await queryAIAssistant(textToSubmit, targetSiteId, fnName);
      setResponse(res);
    } catch (e) {
      setResponse({ answer: 'Error executing AI analysis: ' + e.message, source: 'System Error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* AI Header */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-wide flex items-center gap-2">
            <Bot className="w-6 h-6 text-cyan-400 animate-bounce" />
            FCT SDM AI Operations Specialist
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Ask natural language operational queries, generate Root Cause Analysis (RCA), and analyze site history.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Focus Site ID (e.g. FC2700)..."
            value={siteIdInput}
            onChange={(e) => setSiteIdInput(e.target.value.toUpperCase())}
            className="bg-slate-900 text-xs text-cyan-300 font-mono p-2 rounded-xl border border-slate-700 w-44 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* AI Functions Chips */}
      <div className="glass-panel p-4 rounded-xl space-y-2">
        <span className="text-xs font-semibold text-slate-400 block mb-2">Automated AI Functions:</span>
        <div className="flex flex-wrap gap-2">
          {aiFunctions.map((af) => (
            <button
              key={af.fn}
              onClick={() => handleAskAI('', af.fn)}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-900 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 rounded-lg text-xs font-medium transition-all"
            >
              ⚡ {af.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input Box */}
      <div className="glass-panel p-4 rounded-2xl">
        <form onSubmit={(e) => { e.preventDefault(); handleAskAI(prompt); }} className="space-y-3">
          <div className="relative">
            <textarea
              rows={3}
              placeholder="Ask anything about FCT sites (e.g. 'Why is FC2700 down?', 'Show generator failures', 'Who worked on FC2700?')..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-slate-900/90 text-sm text-white placeholder-slate-500 p-3.5 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={loading || (!prompt && !siteIdInput)}
              className="absolute right-3 bottom-3 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg flex items-center space-x-1"
            >
              <span>{loading ? 'Analyzing...' : 'Ask AI'}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="font-medium text-slate-500">Sample Prompts:</span>
            {sampleQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setPrompt(q); handleAskAI(q); }}
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] rounded border border-slate-800 transition-all"
              >
                "{q}"
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* AI Response Output Card */}
      {loading && (
        <div className="glass-panel p-12 rounded-2xl text-center space-y-3 text-cyan-400">
          <Cpu className="w-10 h-10 animate-spin mx-auto text-cyan-400" />
          <p className="text-xs font-semibold">Scanning DB tables, WhatsApp chats, and SDM operational memory...</p>
        </div>
      )}

      {response && (
        <div className="glass-panel p-6 rounded-2xl border border-cyan-500/40 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">AI Operational Synthesis</h3>
              {response.site_id && (
                <button
                  onClick={() => onSelectSite(response.site_id)}
                  className="px-2 py-0.5 bg-cyan-950 text-cyan-300 text-xs font-mono font-bold rounded border border-cyan-800"
                >
                  {response.site_id}
                </button>
              )}
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded">
              Engine: {response.source}
            </span>
          </div>

          <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line font-sans">
            {response.answer}
          </div>
        </div>
      )}

    </div>
  );
}
