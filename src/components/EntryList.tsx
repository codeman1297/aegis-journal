import React from 'react';
import { Plus, Trash2, Download, BookOpen, Clock, Tag, MessageSquare } from 'lucide-react';
import { JournalEntry } from '../types.ts';

interface EntryListProps {
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (id: string) => void;
  onNewEntry: () => void;
  onDeleteEntry: (id: string, e: React.MouseEvent) => void;
  onExportEntry: (entry: JournalEntry, e: React.MouseEvent) => void;
  isLoading: boolean;
}

export const EntryList: React.FC<EntryListProps> = ({
  entries,
  selectedEntryId,
  onSelectEntry,
  onNewEntry,
  onDeleteEntry,
  onExportEntry,
  isLoading,
}) => {
  return (
    <aside className="w-full md:w-80 lg:w-96 border-r border-slate-200 bg-slate-50/70 flex flex-col h-[calc(100vh-65px)]">
      {/* Action Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span>Journal Entries</span>
          <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full font-mono">
            {entries.length}
          </span>
        </h2>
        <button
          id="btn-new-entry"
          onClick={onNewEntry}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Entry</span>
        </button>
      </div>

      {/* Entries Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading your private entries...</div>
        ) : entries.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-600">No reflections yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;New Entry&quot; to write your first reflection with Gemini assistance.
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const isSelected = entry.id === selectedEntryId;
            const turnCount = entry.messages?.length || 0;
            const snippet = entry.messages?.[0]?.content || 'Empty entry';

            return (
              <div
                key={entry.id}
                id={`entry-item-${entry.id}`}
                onClick={() => onSelectEntry(entry.id)}
                className={`group p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-white border-indigo-200 shadow-xs ring-1 ring-indigo-500/10'
                    : 'bg-white/80 hover:bg-white border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 truncate flex-1">
                    {entry.title || 'Untitled Reflection'}
                  </h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title="Export entry to Markdown"
                      onClick={(e) => onExportEntry(entry, e)}
                      className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title="Delete entry"
                      onClick={(e) => onDeleteEntry(entry.id, e)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                  {snippet}
                </p>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.updatedAt || entry.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <MessageSquare className="w-3 h-3" />
                    {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
