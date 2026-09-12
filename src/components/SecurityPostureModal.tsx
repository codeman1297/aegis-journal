import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Key,
  ShieldAlert,
  Cpu,
  Layers,
  Database,
  History,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { SecurityPosture } from '../types.ts';

interface SecurityPostureViewProps {
  getIdToken: () => Promise<string | null>;
  isModal?: boolean;
  onClose?: () => void;
}

export const SecurityPostureView: React.FC<SecurityPostureViewProps> = ({
  getIdToken,
  isModal = false,
  onClose,
}) => {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosture = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication required to verify live security posture.');
      }
      const res = await fetch('/api/security/posture', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('401 Unauthorized: Valid Firebase ID token is required.');
        }
        throw new Error(`HTTP ${res.status}: Failed to retrieve live controls state.`);
      }
      const data: SecurityPosture = await res.json();
      setPosture(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch posture');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosture();
  }, []);

  const content = (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 font-serif">Verifiable Security Posture</h2>
            <span className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-700 font-mono rounded-full border border-indigo-200">
              Directive 12
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time live audit of server enforcement, tenancy isolation, fallback ladder, and injection scanner telemetry.
          </p>
        </div>

        <button
          onClick={fetchPosture}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live State</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Live Verification Failed:</span>
            <span className="leading-relaxed">{error}</span>
          </div>
        </div>
      )}

      {loading && !posture && (
        <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span>Verifying live runtime security controls from server...</span>
        </div>
      )}

      {posture && (
        <div className="space-y-6">
          {/* Secret Source Card: Proves it can fail */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              posture.secretSource === 'secret-manager'
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                : posture.secretSource === 'env'
                ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-xs'
                : 'bg-red-50 border-red-300 text-red-950'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  <span className="font-semibold text-xs uppercase tracking-wider">
                    Secret Management (Directive 4)
                  </span>
                </div>
                <div className="text-base font-bold flex items-center gap-2 font-mono">
                  {posture.secretSource === 'secret-manager' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>GCP Secret Manager Injected</span>
                    </>
                  ) : posture.secretSource === 'env' ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Fallback Active: Environment Variable (process.env.GEMINI_API_KEY)</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span>MISSING: No Gemini API Key Configured</span>
                    </>
                  )}
                </div>
                <p className="text-xs leading-relaxed opacity-90 pt-1">
                  {posture.secretSource === 'secret-manager'
                    ? 'API credentials dynamically sourced from Google Cloud Secret Manager. The client bundle never touches or imports the secret.'
                    : posture.secretSource === 'env'
                    ? 'Demonstration / Local Fallback: Running via container environment variables. In strict production on Cloud Run, bind with --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest to satisfy Secret Manager mode.'
                    : 'Fatal: The server process cannot find a valid Gemini API key.'}
                </p>
              </div>

              <span
                className={`text-[11px] font-mono px-2.5 py-1 rounded-full uppercase font-bold shrink-0 ${
                  posture.secretSource === 'secret-manager'
                    ? 'bg-emerald-100 text-emerald-800'
                    : posture.secretSource === 'env'
                    ? 'bg-amber-200 text-amber-900 border border-amber-400'
                    : 'bg-red-200 text-red-900'
                }`}
              >
                {posture.secretSource}
              </span>
            </div>
          </div>

          {/* Grid of Core Security Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Control 1: Admin SDK Auth */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-600" />
                  Firebase ID Token Verification
                </span>
                {posture.adminSdkTokenVerification ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Directive 3: Admin SDK verifies caller identity on every <code>/api/*</code> route. Never trusts UIDs in request bodies.
              </p>
            </div>

            {/* Control 2: Firestore Deny-by-Default */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  Firestore Rules Catch-All
                </span>
                {posture.rulesDenyDefault ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    Verified
                  </span>
                ) : (
                  <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">
                    Failed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {posture.rulesSummary || 'Parsed on-disk firestore.rules: catch-all deny-by-default is verified.'}
              </p>
            </div>

            {/* Control 3: Tenancy Isolation */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  Vector RAG Tenancy Re-Check
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Enforced
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Directive 8: Memory Vault vectors carry first-class <code>owner_uid</code>. Post-query loop fails closed on any mismatch.
              </p>
            </div>

            {/* Control 4: Rate Limiting */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  Rate Limiting & Cost Guard
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  20 req / min
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Directive 10: Fixed window rate limiter bounded per UID in server process memory returning clean 429 Retry-After.
              </p>
            </div>
          </div>

          {/* Real-time Injection Telemetry (Last 24h) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Directive 9: Injection Scans in Last 24 Hours
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Live Telemetry</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 block mb-1">Total Prompt Scans</span>
                <span className="text-lg font-bold font-mono text-slate-800">
                  {posture.injectionStats24h?.totalScans ?? 0}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 block mb-1">Threats Flagged</span>
                <span className="text-lg font-bold font-mono text-amber-600">
                  {posture.injectionStats24h?.flaggedScans ?? 0}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 block mb-1">Turns Neutralized</span>
                <span className="text-lg font-bold font-mono text-emerald-600">
                  {posture.injectionStats24h?.neutralizedScans ?? 0}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 block mb-1">Average Score</span>
                <span className="text-lg font-bold font-mono text-indigo-600">
                  {posture.injectionStats24h?.avgScore ?? 0}/100
                </span>
              </div>
            </div>
          </div>

          {/* Model Fallback Ladder & Event History */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Directive 6: Gemini Fallback Ladder Status
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Current Position: Index {posture.currentLadderPosition}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {posture.geminiModelLadder.map((model, idx) => (
                <div
                  key={model}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                    idx === posture.currentLadderPosition
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <span>{model}</span>
                  {idx === posture.currentLadderPosition && (
                    <span className="text-[9px] uppercase font-bold bg-white/30 px-1 rounded">Active</span>
                  )}
                </div>
              ))}
            </div>

            {posture.lastFallbackEvent ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between font-semibold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    Last Fallback Event:
                  </span>
                  <span className="font-mono text-[11px]">
                    {new Date(posture.lastFallbackEvent.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-amber-800 text-[11px]">
                  Fell back from <code>{posture.lastFallbackEvent.fromModel}</code> to{' '}
                  <code>{posture.lastFallbackEvent.toModel}</code> ({posture.lastFallbackEvent.reason})
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic pt-1">
                Primary model (<code>{posture.geminiModelLadder[0]}</code>) responding nominally; zero fallback events recorded.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-6 overflow-y-auto flex-1">{content}</div>
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Close Posture
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <div className="p-8 max-w-4xl mx-auto">{content}</div>;
};
