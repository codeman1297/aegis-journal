import React, { useState } from 'react';
import {
  Send,
  Sparkles,
  AlertCircle,
  Download,
  Trash2,
  RefreshCw,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Cpu,
  Bookmark,
  Database,
  Search,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';
import { JournalEntry, JournalMessage, MemoryVaultReference } from '../types.ts';

interface JournalWorkspaceProps {
  entry: JournalEntry | null;
  onSaveEntry: (entry: JournalEntry) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onExportEntry: (entry: JournalEntry) => void;
  getIdToken: () => Promise<string | null>;
  onSelectEntryById?: (id: string) => void;
}

export const JournalWorkspace: React.FC<JournalWorkspaceProps> = ({
  entry,
  onSaveEntry,
  onDeleteEntry,
  onExportEntry,
  getIdToken,
  onSelectEntryById,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [entryTitle, setEntryTitle] = useState(entry?.title || '');
  const [mode, setMode] = useState<'reflect' | 'summarize' | 'brainstorm' | 'prompt' | 'vault'>('reflect');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [vaultReferences, setVaultReferences] = useState<MemoryVaultReference[]>([]);
  
  // Memory Vault Search Modal State
  const [vaultSearchModalOpen, setVaultSearchModalOpen] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [vaultSearchResults, setVaultSearchResults] = useState<any[]>([]);
  const [isVaultSearching, setIsVaultSearching] = useState(false);

  // Injection Firewall Details Drawer State
  const [activeDrawerAudit, setActiveDrawerAudit] = useState<{
    score: number;
    matchedRules: { ruleId: string; category: string; description: string; severity: number }[];
    matchedReasons: string[];
    userSnippet?: string;
  } | null>(null);

  // Sync title when active entry changes
  React.useEffect(() => {
    if (entry) {
      setEntryTitle(entry.title);
      setErrorBanner(null);
      setVaultReferences([]);
    }
  }, [entry?.id]);

  if (!entry) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
        <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 mb-4 shadow-xs">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 font-serif mb-2">No Reflection Selected</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          Select an existing journal entry from the left or begin a new private reflection space. All your thoughts are encrypted and isolated to your Google credentials.
        </p>
      </main>
    );
  }

  const handleTitleChange = async (newTitle: string) => {
    setEntryTitle(newTitle);
    const updated = { ...entry, title: newTitle || 'Untitled Reflection', updatedAt: Date.now() };
    await onSaveEntry(updated);
  };

  const handleVaultDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultSearchQuery.trim()) return;
    setIsVaultSearching(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/vault/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: vaultSearchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setVaultSearchResults(data.results || []);
      }
    } catch (err) {
      console.error('Vault search error:', err);
    } finally {
      setIsVaultSearching(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isSubmitting) return;

    const content = inputMessage.trim();
    setErrorBanner(null);
    setIsSubmitting(true);

    const userMessage: JournalMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const updatedMessages = [...(entry.messages || []), userMessage];
    const interimEntry: JournalEntry = {
      ...entry,
      title: entryTitle || entry.title,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    try {
      // Persist user turn to Firestore immediately
      await onSaveEntry(interimEntry);

      // Fetch Firebase ID token for authenticated server backend call
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication session expired. Please sign in again.');
      }

      // Call server backend route with verified Firebase ID token (Directive 3 & 8)
      const res = await fetch('/api/journal/reflect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryId: entry.id,
          title: entryTitle || entry.title,
          mode,
          message: content,
          history: entry.messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Request failed with HTTP status ${res.status}`);
      }

      const data = await res.json();

      // Attach injection audit info to user turn if flagged or scored
      if (data.flagged || (data.matchedRules && data.matchedRules.length > 0)) {
        userMessage.injectionAudit = {
          flagged: data.flagged,
          score: data.injectionScore || 0,
          matchedRules: data.matchedRules || [],
          matchedReasons: data.matchedReasons || [],
        };
      }

      if (data.memoryVaultReferences && data.memoryVaultReferences.length > 0) {
        setVaultReferences(data.memoryVaultReferences);
      } else {
        setVaultReferences([]);
      }

      setLastModelUsed(data.modelUsed);

      const modelMessage: JournalMessage = {
        id: `msg-${Date.now()}-model`,
        role: 'model',
        content: data.reply,
        timestamp: Date.now(),
      };

      const finalEntry: JournalEntry = {
        ...interimEntry,
        messages: [...updatedMessages, modelMessage],
        updatedAt: Date.now(),
      };

      // Persist model response turn
      await onSaveEntry(finalEntry);
      setInputMessage('');
    } catch (err: any) {
      console.error('Failed in journal turn:', err);
      setErrorBanner(err.message || 'Failed to complete AI reflection. Please click Retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-65px)] bg-white overflow-hidden relative">
      {/* Workspace Header */}
      <header className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-xs">
        <div className="flex-1 min-w-[240px]">
          <input
            id="entry-title-input"
            type="text"
            value={entryTitle}
            onChange={(e) => setEntryTitle(e.target.value)}
            onBlur={() => handleTitleChange(entryTitle)}
            placeholder="Reflection Title..."
            className="text-lg font-semibold text-slate-900 border-none outline-none focus:ring-0 w-full bg-transparent font-serif"
          />
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              Isolated to your Google ID
            </span>
            <button
              onClick={() => setVaultSearchModalOpen(true)}
              className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium"
            >
              <Database className="w-3 h-3 text-indigo-500" />
              Memory Vault
            </button>
            {lastModelUsed && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                <Cpu className="w-3 h-3" />
                {lastModelUsed}
              </span>
            )}
          </div>
        </div>

        {/* Quick Mode Switcher & Entry Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-100 rounded-xl text-xs">
            <button
              onClick={() => setMode('reflect')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'reflect' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Philosophical reflective inquiry"
            >
              Reflect
            </button>
            <button
              onClick={() => setMode('vault')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 cursor-pointer ${
                mode === 'vault' ? 'bg-indigo-600 text-white shadow-xs' : 'text-indigo-700 hover:text-indigo-900'
              }`}
              title="Memory Vault semantic retrieval over past entries"
            >
              <Database className="w-3 h-3" />
              Memory Vault
            </button>
            <button
              onClick={() => setMode('summarize')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'summarize' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Executive summary and takeaways"
            >
              Summarize
            </button>
            <button
              onClick={() => setMode('brainstorm')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'brainstorm' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Brainstorm angles and perspectives"
            >
              Brainstorm
            </button>
            <button
              onClick={() => setMode('prompt')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'prompt' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Follow-up journaling prompts"
            >
              Prompts
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={() => onExportEntry(entry)}
            title="Export as Markdown"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteEntry(entry.id)}
            title="Delete entry"
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Error Banners */}
      {errorBanner && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => handleSend()}
            className="text-xs bg-red-600 text-white px-3 py-1 rounded-md font-medium hover:bg-red-700 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* Memory Vault Retrieved References Bar */}
      {vaultReferences.length > 0 && (
        <div className="bg-indigo-50/70 border-b border-indigo-100 px-6 py-2 flex flex-wrap items-center gap-2 text-xs text-indigo-900">
          <span className="flex items-center gap-1 font-semibold text-indigo-700">
            <Database className="w-3.5 h-3.5" />
            Memory Vault Grounding:
          </span>
          {vaultReferences.map((ref, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-indigo-200 rounded-md text-[11px] text-slate-700 shadow-2xs cursor-pointer hover:border-indigo-400"
              onClick={() => onSelectEntryById && onSelectEntryById(ref.entryId)}
              title={`Similarity: ${Math.round(ref.similarity * 100)}%`}
            >
              <Bookmark className="w-3 h-3 text-indigo-500" />
              <span className="font-medium truncate max-w-[140px]">{ref.title}</span>
              <span className="text-slate-400 font-mono text-[10px]">({Math.round(ref.similarity * 100)}%)</span>
            </span>
          ))}
          <span className="text-[11px] text-slate-500 ml-auto hidden md:inline">
            Directive 8 Tenancy Verified
          </span>
        </div>
      )}

      {/* Conversation / Turns Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {entry.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 font-serif mb-1">Begin Your Reflection</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Write down your emotions, daily observations, or queries. Switch to <strong>Memory Vault</strong> mode to ask questions grounded in your historical journals (e.g. &ldquo;What made me anxious last month?&rdquo;).
            </p>
          </div>
        ) : (
          entry.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white rounded-tr-xs shadow-xs'
                    : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-xs shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1.5 text-[11px] opacity-75">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {msg.role === 'user' ? 'You' : 'AegisJournal AI'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Directive 9: Untrusted content neutralized badge */}
                  {msg.role === 'user' && msg.injectionAudit?.flagged && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDrawerAudit({
                          score: msg.injectionAudit!.score,
                          matchedRules: msg.injectionAudit!.matchedRules,
                          matchedReasons: msg.injectionAudit!.matchedReasons,
                          userSnippet: msg.content.slice(0, 140),
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-full text-[10px] font-medium hover:bg-amber-500/30 transition-colors cursor-pointer"
                    >
                      <ShieldAlert className="w-3 h-3 text-amber-400" />
                      <span>Untrusted content neutralized</span>
                      <span className="font-mono bg-amber-400/20 px-1 rounded text-[9px]">
                        {msg.injectionAudit.score}/100
                      </span>
                      <ChevronRight className="w-2.5 h-2.5 opacity-70" />
                    </button>
                  )}
                </div>

                <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.content}
                </div>
              </div>
            </div>
          ))
        )}

        {isSubmitting && (
          <div className="flex flex-col items-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-xs px-5 py-4 text-slate-500 text-xs flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>
                {mode === 'vault'
                  ? 'Retrieving isolated Memory Vault context & synthesizing history...'
                  : 'Scanning injection firewall & synthesizing reflection with Gemini...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input Composer */}
      <footer className="p-4 border-t border-slate-200 bg-white/95">
        <form onSubmit={handleSend} className="relative flex items-center">
          <textarea
            id="journal-composer-input"
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              mode === 'vault'
                ? 'Ask Memory Vault across your past journals (e.g. "What was I anxious about last month?")...'
                : 'Write your thoughts or test adversarial injection firewall inputs (Press Enter to submit)...'
            }
            className="w-full pl-4 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-all"
            disabled={isSubmitting}
          />
          <div className="absolute right-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={!inputMessage.trim() || isSubmitting}
              className={`p-2.5 rounded-lg transition-all cursor-pointer ${
                inputMessage.trim() && !isSubmitting
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </footer>

      {/* Directive 9 Details Drawer: Injection Firewall Inspector */}
      {activeDrawerAudit && (
        <div className="absolute inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Injection Firewall Details</h3>
                <p className="text-[11px] text-slate-500 font-mono">Directive 9 Protection Active</p>
              </div>
            </div>
            <button
              onClick={() => setActiveDrawerAudit(null)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-amber-900">Threat Score:</span>
                <span className="font-mono font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded">
                  {activeDrawerAudit.score} / 100
                </span>
              </div>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                This prompt triggered heuristic pattern matching. Input was <strong>never dropped</strong>; instead, it was safely enclosed within an <code>&lt;UNTRUSTED_CONTEXT&gt;</code> envelope with a standing data-not-instructions rule.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500" />
                Matched Firewall Rules ({activeDrawerAudit.matchedRules.length})
              </h4>
              <div className="space-y-2.5">
                {activeDrawerAudit.matchedRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-indigo-600">{rule.ruleId}</span>
                      <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                        +{rule.severity} pts
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs font-medium">{rule.description}</p>
                    <span className="inline-block text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                      Category: {rule.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
              <div className="font-semibold text-slate-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Directive 11 Privacy Guarantee
              </div>
              <p className="text-slate-500 leading-relaxed">
                The audit event <code>injection_flagged</code> was dispatched to Cloud Logging with the caller's UID hashed (SHA-256 + salt) and rule IDs included. Raw user prompt content is strictly excluded.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Memory Vault Search Modal */}
      {vaultSearchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 font-serif text-base">Memory Vault Explorer</h3>
              </div>
              <button
                onClick={() => setVaultSearchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-medium"
              >
                Close
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Perform semantic search over your past journal entries. Vector embeddings are strictly owner-isolated (Directive 8) and post-query tenancy checked.
              </p>

              <form onSubmit={handleVaultDirectSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={vaultSearchQuery}
                    onChange={(e) => setVaultSearchQuery(e.target.value)}
                    placeholder="Search past memories (e.g. anxiety, gratitude, goals)..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isVaultSearching || !vaultSearchQuery.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {isVaultSearching ? 'Searching...' : 'Search'}
                </button>
              </form>

              <div className="space-y-3 pt-2">
                {vaultSearchResults.length === 0 && !isVaultSearching && (
                  <p className="text-xs text-slate-400 italic text-center py-6">
                    Enter a query above to semantically query your memory vault.
                  </p>
                )}
                {vaultSearchResults.map((res, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (onSelectEntryById) onSelectEntryById(res.entryId);
                      setVaultSearchModalOpen(false);
                    }}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{res.title}</span>
                      <span className="font-mono text-[10px] text-indigo-600">
                        {Math.round(res.similarity * 100)}% match
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{res.snippet}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
