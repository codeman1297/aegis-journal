import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { auth, googleProvider, db } from './lib/firebase.ts';
import { JournalEntry } from './types.ts';
import { AuthLanding } from './components/AuthLanding.tsx';
import { EntryList } from './components/EntryList.tsx';
import { JournalWorkspace } from './components/JournalWorkspace.tsx';
import { SecurityPostureView } from './components/SecurityPostureModal.tsx';
import { ShieldCheck, LogOut, Sparkles, Shield, BookOpen, User as UserIcon } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState<boolean>(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'journal' | 'security'>('journal');
  const [showPostureModal, setShowPostureModal] = useState<boolean>(false);

  // Monitor Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setAuthError(null);
    });
    return () => unsubscribe();
  }, []);

  // Listen to user's journal entries in Firestore in real-time
  useEffect(() => {
    if (!user) {
      setEntries([]);
      setSelectedEntryId(null);
      return;
    }

    setEntriesLoading(true);
    // User-isolated collection path: /users/{userId}/entries
    const entriesRef = collection(db, 'users', user.uid, 'entries');
    const q = query(entriesRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedEntries: JournalEntry[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loadedEntries.push({
            id: docSnap.id,
            title: data.title || 'Untitled Reflection',
            category: data.category || 'reflection',
            summary: data.summary || '',
            tags: data.tags || [],
            messages: data.messages || [],
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            userId: user.uid,
          });
        });

        setEntries(loadedEntries);
        setEntriesLoading(false);

        // Auto-select first entry if none selected
        if (loadedEntries.length > 0) {
          setSelectedEntryId((prev) => {
            if (prev && loadedEntries.some((e) => e.id === prev)) {
              return prev;
            }
            return loadedEntries[0].id;
          });
        } else {
          setSelectedEntryId(null);
        }
      },
      (error) => {
        console.error('Firestore snapshot subscription error:', error);
        setEntriesLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Google Sign-In with Firebase Auth popup
  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setAuthError(err.message || 'Failed to sign in with Google');
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Create new journal entry
  const handleNewEntry = async () => {
    if (!user) return;

    const newId = `entry-${Date.now()}`;
    const newEntry: JournalEntry = {
      id: newId,
      title: 'New Reflection',
      category: 'reflection',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      userId: user.uid,
    };

    try {
      // Save directly to user-isolated Firestore collection
      const docRef = doc(db, 'users', user.uid, 'entries', newId);
      await setDoc(docRef, newEntry);
      setSelectedEntryId(newId);
    } catch (err) {
      console.error('Failed to create new entry:', err);
    }
  };

  // Save updated entry
  const handleSaveEntry = async (updated: JournalEntry) => {
    if (!user) return;
    try {
      // Undefined-stripping safety before setDoc (Directive 6)
      const cleanData = JSON.parse(JSON.stringify(updated));
      const docRef = doc(db, 'users', user.uid, 'entries', updated.id);
      await setDoc(docRef, cleanData, { merge: true });

      // Sync entry to Memory Vault on write (Directive 8)
      const token = await user.getIdToken();
      if (token && updated.messages && updated.messages.length > 0) {
        const fullContent = updated.messages.map((m) => `${m.role === 'user' ? 'Me' : 'AI'}: ${m.content}`).join('\n\n');
        fetch('/api/vault/index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            entryId: updated.id,
            title: updated.title,
            content: fullContent,
          }),
        }).catch((e) => console.warn('Memory vault background sync notice:', e));
      }
    } catch (err) {
      console.error('Failed to save entry to Firestore:', err);
      throw err;
    }
  };

  // Delete entry and associated vectors atomically (Directive 8 & 11)
  const handleDeleteEntry = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;

    const confirmed = window.confirm('Are you sure you want to permanently delete this journal reflection?');
    if (!confirmed) return;

    try {
      // Call server backend to atomically delete entry and all associated vector embeddings (Directive 8)
      const token = await user.getIdToken();
      if (token) {
        await fetch(`/api/journal/entry/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Also clean up local client Firestore reference if needed
      const docRef = doc(db, 'users', user.uid, 'entries', id);
      await deleteDoc(docRef).catch(() => {});

      if (selectedEntryId === id) {
        setSelectedEntryId(null);
      }
    } catch (err) {
      console.error('Failed to delete entry and vectors:', err);
    }
  };

  // Export entry to Markdown file
  const handleExportEntry = (entryToExport: JournalEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    let md = `# ${entryToExport.title}\n`;
    md += `Date: ${new Date(entryToExport.createdAt).toLocaleString()}\n`;
    md += `Updated: ${new Date(entryToExport.updatedAt).toLocaleString()}\n\n`;
    md += `---\n\n`;

    entryToExport.messages?.forEach((msg) => {
      const speaker = msg.role === 'user' ? 'Me' : 'AegisJournal AI';
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `### ${speaker} (${time})\n\n${msg.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entryToExport.title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'journal-entry'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper to obtain fresh ID token
  const getIdToken = async (): Promise<string | null> => {
    if (!user) return null;
    return await user.getIdToken();
  };

  const selectedEntry = entries.find((e) => e.id === selectedEntryId) || null;

  // Render Auth Landing if not authenticated
  if (!user && !authLoading) {
    return <AuthLanding onSignIn={handleGoogleSignIn} isLoading={authLoading} error={authError} />;
  }

  return (
    <div id="aegis-app-root" className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-800">
      {/* Top Navigation Bar */}
      <nav className="h-[65px] bg-white border-b border-slate-200 px-6 flex items-center justify-between z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight font-serif text-base">AegisJournal</span>
              <span className="hidden lg:inline-block ml-2 text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-medium">
                Protected by Firestore Rules
              </span>
            </div>
          </div>

          {/* Direct Navigation Tabs: Journal vs Security (Directive 12) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              id="tab-journal"
              onClick={() => setActiveTab('journal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'journal'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>My Journal</span>
            </button>
            <button
              id="tab-security"
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Security</span>
            </button>
          </div>
        </div>

        {/* User Account & Security Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <div className="flex items-center gap-3 pl-2">
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-7 h-7 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-700 hidden md:inline">
                  {user.displayName || user.email}
                </span>
              </div>

              <button
                id="btn-sign-out"
                onClick={handleSignOut}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Body: Switch between Journal Workspace and Security Tab */}
      {activeTab === 'journal' ? (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <EntryList
            entries={entries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
            onNewEntry={handleNewEntry}
            onDeleteEntry={handleDeleteEntry}
            onExportEntry={handleExportEntry}
            isLoading={entriesLoading}
          />

          <JournalWorkspace
            entry={selectedEntry}
            onSaveEntry={handleSaveEntry}
            onDeleteEntry={handleDeleteEntry}
            onExportEntry={handleExportEntry}
            getIdToken={getIdToken}
            onSelectEntryById={(id) => setSelectedEntryId(id)}
          />
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto bg-slate-50/50">
          <SecurityPostureView getIdToken={getIdToken} />
        </main>
      )}
    </div>
  );
}
