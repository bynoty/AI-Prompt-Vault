import React, { useState, useEffect } from 'react';
import { DashboardStats, Prompt, MarkdownDoc } from '../types';
import { Terminal, Star, BookOpen, Layers, Sparkles, Tag, Check, ArrowRight, Zap, Search, X, FileText, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  stats: DashboardStats;
  prompts: Prompt[];
  markdowns: MarkdownDoc[];
  onSelectPrompt: (prompt: Prompt) => void;
  onSelectDoc: (doc: MarkdownDoc) => void;
  isDark: boolean;
  onIndexRag: () => void;
  indexing: boolean;
}

export default function Dashboard({ stats, prompts, markdowns, onSelectPrompt, onSelectDoc, isDark, onIndexRag, indexing }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dbActive, setDbActive] = useState<boolean | null>(null);
  const [dbChecking, setDbChecking] = useState(false);

  useEffect(() => {
    const checkDbStatus = async () => {
      setDbChecking(true);
      try {
        const res = await fetch('/api/db/status');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          setDbActive(!!data.active);
          setDbChecking(false);
          return;
        }
      } catch {
        // Backend API unreachable or HTML fallback returned (Vercel mode)
      }

      // Fallback for Vercel / Static mode: Test Supabase client directly
      try {
        const { error } = await supabase.from('prompts').select('id').limit(1);
        if (error) {
          if (error.message && (
            error.message.toLowerCase().includes('failed to fetch') ||
            error.message.toLowerCase().includes('networkerror') ||
            error.message.toLowerCase().includes('fetch failed')
          )) {
            setDbActive(false);
          } else {
            // Table response or authorization response received from Supabase
            setDbActive(true);
          }
        } else {
          setDbActive(true);
        }
      } catch {
        setDbActive(false);
      } finally {
        setDbChecking(false);
      }
    };

    checkDbStatus();
    const interval = setInterval(checkDbStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('dashboard_recent_searches') || '[]');
    } catch {
      return [];
    }
  });

  const saveSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 6);
      localStorage.setItem('dashboard_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const filteredPrompts = searchQuery.trim()
    ? prompts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  const filteredDocs = searchQuery.trim()
    ? markdowns.filter(d =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'gemini': return 'bg-blue-500 text-white dark:bg-blue-650';
      case 'claude': return 'bg-amber-600 text-white dark:bg-amber-700';
      case 'chatgpt': return 'bg-emerald-600 text-white dark:bg-emerald-700';
      case 'cursor': return 'bg-neutral-800 text-white dark:bg-neutral-700';
      default: return 'bg-zinc-500 text-white';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'create_prompt':
      case 'create_doc':
        return <Check className="w-4 h-4 text-emerald-500" />;
      case 'update_prompt':
      case 'update_doc':
        return <Zap className="w-4 h-4 text-violet-500" />;
      case 'git_sync':
        return <Layers className="w-4 h-4 text-blue-500" />;
      case 'rag_index':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      default:
        return <Terminal className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Dashboard</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Real-time status of your prompts, markdown documents, and vector search index.
          </p>

          {/* Database Status Widget */}
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
              <Database className="w-3 h-3" />
              Database Engine:
            </span>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono border ${
              dbActive === null
                ? 'bg-zinc-500/10 border-zinc-500/20 text-zinc-500'
                : dbActive
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                dbActive === null
                  ? 'bg-zinc-400 animate-pulse'
                  : dbActive
                    ? 'bg-emerald-500'
                    : 'bg-rose-500'
              }`} />
              <span className="text-[11px] font-semibold">
                {dbActive === null
                  ? 'Verifying Connection...'
                  : dbActive
                    ? 'Supabase Active & Connected'
                    : 'Supabase Offline / Unreachable'}
              </span>
            </div>
            {dbChecking && <span className="text-[10px] text-zinc-500 animate-pulse">(checking...)</span>}
          </div>
        </div>
        <button
          onClick={onIndexRag}
          disabled={indexing}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-md cursor-pointer ${
            indexing 
              ? 'bg-zinc-700 text-zinc-300' 
              : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${indexing ? 'animate-spin' : ''}`} />
          {indexing ? 'Indexing Corpus...' : 'Re-index RAG Database'}
        </button>
      </div>

      {/* Search Vault & Recent Searches */}
      <div className={`p-5 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search active prompts, tags, categories, or documents in your vault..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveSearch(searchQuery);
                }
              }}
              className={`w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                isDark 
                  ? 'bg-zinc-950 border-zinc-850 text-zinc-100 focus:border-violet-500' 
                  : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-250 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => saveSearch(searchQuery)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shrink-0"
          >
            Search & Save
          </button>
        </div>

        {/* Recent Searches Row */}
        {recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Recent searches:</span>
            {recentSearches.map((term, idx) => (
              <div
                key={idx}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                  isDark
                    ? 'bg-zinc-950 border-zinc-850 text-zinc-300 hover:border-violet-500'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-violet-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(term);
                    saveSearch(term);
                  }}
                  className="cursor-pointer hover:text-violet-500 font-medium"
                >
                  {term}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const updated = recentSearches.filter((_, i) => i !== idx);
                    setRecentSearches(updated);
                    localStorage.setItem('dashboard_recent_searches', JSON.stringify(updated));
                  }}
                  className="text-zinc-500 hover:text-red-500 font-bold ml-1 cursor-pointer text-[10px]"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setRecentSearches([]);
                localStorage.removeItem('dashboard_recent_searches');
              }}
              className="text-zinc-500 hover:text-red-500 text-[11px] font-semibold ml-auto cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Dynamic Search Results Panel */}
      {searchQuery.trim() !== '' && (
        <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/40 border-violet-950/50' : 'bg-white border-violet-100'} shadow-md animate-fade-in space-y-4`}>
          <div className="flex items-center justify-between border-b pb-2 dark:border-zinc-850">
            <h3 className="font-bold text-sm flex items-center gap-1.5 text-violet-500">
              <Search className="w-4 h-4" />
              Search Results for "{searchQuery}"
              <span className="text-xs font-mono font-medium text-zinc-450">
                ({filteredPrompts.length + filteredDocs.length} found)
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-semibold cursor-pointer"
            >
              Clear Results
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Matching Prompts Column */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                Matching Prompts ({filteredPrompts.length})
              </h4>
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                {filteredPrompts.length === 0 ? (
                  <p className="text-xs text-zinc-550 italic py-2">No matching prompts found.</p>
                ) : (
                  filteredPrompts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => onSelectPrompt(p)}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer hover:translate-x-1 ${
                        isDark 
                          ? 'bg-zinc-950/60 border-zinc-850 hover:bg-zinc-900/60 hover:border-violet-500/40' 
                          : 'bg-zinc-50/60 border-zinc-150 hover:bg-zinc-100/60 hover:border-violet-400/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">{p.title}</p>
                        <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{p.category} | {p.platform}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Matching Markdown Docs Column */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                Matching Documents ({filteredDocs.length})
              </h4>
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                {filteredDocs.length === 0 ? (
                  <p className="text-xs text-zinc-550 italic py-2">No matching documents found.</p>
                ) : (
                  filteredDocs.map(d => (
                    <div
                      key={d.id}
                      onClick={() => onSelectDoc(d)}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer hover:translate-x-1 ${
                        isDark 
                          ? 'bg-zinc-950/60 border-zinc-850 hover:bg-zinc-900/60 hover:border-violet-500/40' 
                          : 'bg-zinc-50/60 border-zinc-150 hover:bg-zinc-100/60 hover:border-violet-400/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-xs truncate">{d.title}</p>
                        <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{d.path}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className={`p-6 rounded-2xl border transition-all ${isDark ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex items-center justify-between`}>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              AI Prompts
            </span>
            <h3 className="text-3xl font-extrabold mt-1 tracking-tight">{stats.promptCount}</h3>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-violet-950/40 text-violet-400 border border-violet-900/50' : 'bg-violet-50 text-violet-600 border border-violet-100'}`}>
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2 */}
        <div className={`p-6 rounded-2xl border transition-all ${isDark ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex items-center justify-between`}>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Markdown Docs
            </span>
            <h3 className="text-3xl font-extrabold mt-1 tracking-tight">{stats.docCount}</h3>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-950/40 text-blue-400 border border-blue-900/50' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3 */}
        <div className={`p-6 rounded-2xl border transition-all ${isDark ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex items-center justify-between`}>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Starred Favorites
            </span>
            <h3 className="text-3xl font-extrabold mt-1 tracking-tight">{stats.favoriteCount}</h3>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-amber-950/40 text-amber-400 border border-amber-900/50' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
            <Star className="w-6 h-6 fill-amber-500 text-amber-500" />
          </div>
        </div>

        {/* Card 4 */}
        <div className={`p-6 rounded-2xl border transition-all ${isDark ? 'bg-zinc-900/40 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex items-center justify-between`}>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              RAG Vector Index
            </span>
            <h3 className="text-3xl font-extrabold mt-1 tracking-tight">Active</h3>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/50' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
            <Zap className="w-6 h-6 text-emerald-500 fill-emerald-500/20" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Items Panel */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-500" />
              Recently Modified Vault Items
            </h3>
            
            <div className="space-y-3">
              {stats.recentUpdated.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No items in library yet. Add some prompts or Markdown docs!
                </div>
              ) : (
                stats.recentUpdated.map((item) => {
                  const isPrompt = 'platform' in item;
                  return (
                    <div
                      key={item.id}
                      onClick={() => isPrompt ? onSelectPrompt(item as Prompt) : onSelectDoc(item as MarkdownDoc)}
                      className={`p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer hover:translate-x-1 ${
                        isDark 
                          ? 'bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900/50 hover:border-zinc-700' 
                          : 'bg-zinc-50/50 border-zinc-100 hover:bg-zinc-100/50 hover:border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${isPrompt ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400' : 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'}`}>
                          {isPrompt ? <Sparkles className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-sm truncate">{item.title}</h4>
                          <span className="text-[11px] text-zinc-500 block font-mono mt-0.5">
                            {isPrompt ? (item as Prompt).category : (item as MarkdownDoc).path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPrompt && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono ${getPlatformColor((item as Prompt).platform)}`}>
                            {(item as Prompt).platform}
                          </span>
                        )}
                        <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Platform stats Custom Chart */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              Target AI Model Platforms
            </h3>

            <div className="space-y-4">
              {stats.platformStats.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-sm">No platform statistics yet.</div>
              ) : (
                stats.platformStats.map(({ platform, count }) => {
                  const max = Math.max(...stats.platformStats.map(s => s.count)) || 1;
                  const percent = (count / max) * 100;
                  return (
                    <div key={platform} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="font-mono">{platform}</span>
                        <span className="text-zinc-500">{count} prompt{count > 1 ? 's' : ''}</span>
                      </div>
                      <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                        <div
                          className="h-full rounded-full bg-violet-600 transition-all duration-1000"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Column */}
        <div className="space-y-6">
          {/* Tags Cloud */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-500" />
              Active Tag Cloud
            </h3>
            
            {stats.mostUsedTags.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">No tags added yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.mostUsedTags.map(({ tag, count }) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <span className="text-violet-500">#</span>
                    <span className="font-medium">{tag}</span>
                    <span className={`text-[10px] font-mono font-semibold px-1 py-0.2 rounded ${isDark ? 'bg-zinc-850 text-zinc-400' : 'bg-zinc-200/50 text-zinc-600'}`}>
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Activity Logs Feed */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-emerald-500" />
              Recent Activity Audit
            </h3>

            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {stats.recentActivity.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">No activity recorded yet.</div>
              ) : (
                stats.recentActivity.map((log) => (
                  <div key={log.id} className="flex gap-3 text-xs leading-relaxed">
                    <div className={`mt-0.5 p-1.5 rounded-lg border ${isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-100 border-zinc-200'}`}>
                      {getLogIcon(log.type)}
                    </div>
                    <div>
                      <p className={`font-medium ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        {log.description}
                      </p>
                      <span className="text-[10px] text-zinc-500 block font-mono mt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString()} - {new Date(log.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
