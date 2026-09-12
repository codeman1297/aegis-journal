import React from 'react';
import { ShieldCheck, LogIn, Lock, Sparkles, BookOpen, KeyRound } from 'lucide-react';

interface AuthLandingProps {
  onSignIn: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const AuthLanding: React.FC<AuthLandingProps> = ({ onSignIn, isLoading, error }) => {
  return (
    <div id="aegis-landing-container" className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm">
        
        {/* App Branding & Icon */}
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 id="app-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl font-serif">
            AegisJournal
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            A private sanctuary for your thoughts, fortified with user-isolated Firestore rules and thoughtful Gemini AI reflections.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-3 py-2 border-y border-slate-100">
          <div className="flex items-start gap-3 text-left">
            <div className="mt-0.5 p-1 bg-emerald-50 text-emerald-600 rounded-md">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Zero Insecure Defaults</p>
              <p className="text-xs text-slate-500">Every journal turn is owner-isolated and token-verified server-side.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-left">
            <div className="mt-0.5 p-1 bg-indigo-50 text-indigo-600 rounded-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Resilient Gemini 3.6 Flash</p>
              <p className="text-xs text-slate-500">Multi-turn reflections, executive summaries, and thoughtful prompts.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-left">
            <div className="mt-0.5 p-1 bg-amber-50 text-amber-600 rounded-md">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">Federated Google Authentication</p>
              <p className="text-xs text-slate-500">No passwords stored. Firebase verifyIdToken authentication on every route.</p>
            </div>
          </div>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div id="auth-error-alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        {/* Sign In Action Button */}
        <div>
          <button
            id="btn-google-sign-in"
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-6 border border-slate-300 rounded-xl shadow-xs bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          Encrypted client-to-cloud channel. Passwords and keys are never collected.
        </p>
      </div>
    </div>
  );
};
