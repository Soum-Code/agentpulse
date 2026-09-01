import React, { useState } from 'react';
import { Settings, ShieldCheck, Key, Bell, Sliders, CheckCircle2, Copy, Check } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [apiKey, setApiKey] = useState('ap_live_948f10283c79a8e0192df');
  const [copied, setCopied] = useState(false);
  const [groundingThreshold, setGroundingThreshold] = useState(0.85);
  const [driftSensitivity, setDriftSensitivity] = useState(0.45);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/T00/B00/XXXXX');
  const [saved, setSaved] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 pb-28 font-mono text-xs max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-white uppercase tracking-wider flex items-center space-x-2">
          <Settings className="w-5 h-5 text-neutral-400" />
          <span>System Settings & Evaluator Calibration</span>
        </h2>
        <p className="text-neutral-400 mt-1">
          Configure ingestion keys, online evaluator thresholds, and automated notification webhooks
        </p>
      </div>

      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>Ingestion API Credentials</span>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Production Collector Key
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={apiKey}
              className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 focus:outline-none"
            />
            <button
              onClick={handleCopyKey}
              className="px-3 py-2 bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.14] text-neutral-200 rounded-lg flex items-center space-x-1 shrink-0 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <span>Online Evaluator Sensitivity</span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Schema Grounding Minimum Threshold:</span>
              <span className="text-white font-bold">{groundingThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={groundingThreshold}
              onChange={(e) => setGroundingThreshold(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 bg-black/50 rounded cursor-pointer"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Traces scoring below this threshold will automatically raise a schema discrepancy warning.
            </p>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-neutral-300">Behavioral Drift Alarm Level:</span>
              <span className="text-white font-bold">{driftSensitivity.toFixed(2)} Δ</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={driftSensitivity}
              onChange={(e) => setDriftSensitivity(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 bg-black/50 rounded cursor-pointer"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Cluster divergence delta exceeding this value will trigger an incident alert.
            </p>
          </div>
        </div>
      </div>

      <div className="ios-liquid-card border-glow-subtle rounded-2xl p-6 space-y-4 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] apple-liquid-specular pointer-events-none" />
        <div className="flex items-center space-x-2 text-white font-semibold text-xs uppercase">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span>Incident Webhooks</span>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-neutral-400 mb-1 font-semibold">
            Slack / PagerDuty Alert URL
          </label>
          <input
            type="text"
            value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.12] rounded-lg px-3 py-2 text-neutral-200 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3 pt-2">
        {saved && <span className="text-emerald-400">Settings saved successfully!</span>}
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-neutral-100 hover:bg-white text-neutral-950 text-xs font-semibold rounded-lg transition-colors"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};
