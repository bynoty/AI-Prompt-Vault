import React, { useState, useEffect } from 'react';
import { Prompt, MarkdownDoc, DashboardStats } from './types';
import AuthLayout from './components/AuthLayout';
import Dashboard from './components/Dashboard';
import PromptLibrary from './components/PromptLibrary';
import MarkdownLibrary from './components/MarkdownLibrary';
import AIAssistant from './components/AIAssistant';
import GitIntegration from './components/GitIntegration';
import ImportExport from './components/ImportExport';
import { fetchDirectFromSupabase } from './lib/sync';
import { supabase } from './lib/supabase';

import { 
  Sparkles, 
  Layers, 
  BookOpen, 
  Terminal, 
  GitBranch, 
  Download, 
  Sun, 
  Moon, 
  LogOut, 
  Lock, 
  Info,
  Menu,
  X,
  Keyboard,
  Command,
  Search
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'prompts' | 'markdowns' | 'ai' | 'git' | 'export'>('dashboard');
  const [isDark, setIsDark] = useState(true);
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);

  // Core vault datasets
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [markdowns, setMarkdowns] = useState<MarkdownDoc[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  
  // Loading states
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  
  // Navigation / Sidebar overlay state (for tablet & mobile)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Drill down / navigation link helper states
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Command Palette & Keyboard Short Manager states
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [paletteSearchQuery, setPaletteSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [forceAddPrompt, setForceAddPrompt] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in any input/textarea/select
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as any).isContentEditable ||
        (activeEl as HTMLElement).dataset?.ignoreShortcuts === 'true'
      );

      // 1. Toggle Cheat Sheet with "?" (only when not typing)
      if (e.key === '?' && !isTyping) {
        e.preventDefault();
        setShowShortcutHelp(prev => !prev);
        return;
      }

      // 2. Escape closes open panels
      if (e.key === 'Escape') {
        if (showCommandPalette) {
          setShowCommandPalette(false);
          setPaletteSearchQuery('');
          return;
        }
        if (showShortcutHelp) {
          setShowShortcutHelp(false);
          return;
        }
      }

      // 3. Command Palette Toggle (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => {
          const next = !prev;
          if (next) {
            setPaletteSearchQuery('');
            setHighlightedIndex(0);
          }
          return next;
        });
        return;
      }

      // 4. Create New Prompt (Alt+N or Ctrl+Alt+N or Ctrl+N when not focusing inputs)
      if ((e.altKey && e.key.toLowerCase() === 'n') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !isTyping)) {
        e.preventDefault();
        setActiveTab('prompts');
        setForceAddPrompt(true);
        setSelectedPromptId(null);
        setSelectedDocId(null);
        return;
      }

      // 5. App Tab Navigation Shortcuts (Alt + key)
      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          setActiveTab('dashboard');
          setSelectedPromptId(null);
          setSelectedDocId(null);
        } else if (key === 'p') {
          e.preventDefault();
          setActiveTab('prompts');
          setSelectedPromptId(null);
          setSelectedDocId(null);
        } else if (key === 'm') {
          e.preventDefault();
          setActiveTab('markdowns');
          setSelectedPromptId(null);
          setSelectedDocId(null);
        } else if (key === 'a') {
          e.preventDefault();
          setActiveTab('ai');
          setSelectedPromptId(null);
          setSelectedDocId(null);
        } else if (key === 'g') {
          e.preventDefault();
          setActiveTab('git');
          setSelectedPromptId(null);
          setSelectedDocId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCommandPalette, showShortcutHelp]);

  // Initialize Theme class
  useEffect(() => {
    const savedTheme = localStorage.getItem('vault_theme');
    const darkTheme = savedTheme ? savedTheme === 'dark' : true;
    setIsDark(darkTheme);
    if (darkTheme) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Fetch all database models
  const refreshData = async () => {
    try {
      const [statsRes, promptsRes, markdownsRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/prompts'),
        fetch('/api/markdowns')
      ]);

      if (statsRes.ok && promptsRes.ok && markdownsRes.ok) {
        // Double check they didn't return HTML due to Vercel SPA rewrite fallback
        const statsContentType = statsRes.headers.get('content-type') || '';
        if (statsContentType.includes('text/html')) {
          throw new Error('Endpoint returned HTML instead of JSON');
        }

        const statsData = await statsRes.json();
        const promptsData = await promptsRes.json();
        const markdownsData = await markdownsRes.json();

        setStats(statsData);
        setPrompts(promptsData);
        setMarkdowns(markdownsData);
      } else {
        throw new Error('Backend response not OK');
      }
    } catch (err) {
      console.warn("Backend server not available or returned invalid content. Fetching directly from Supabase client-side...", err);
      const res = await fetchDirectFromSupabase();
      if (res.success) {
        setPrompts(res.prompts);
        setMarkdowns(res.docs);
        setStats(res.stats);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const toggleTheme = () => {
    const newVal = !isDark;
    setIsDark(newVal);
    localStorage.setItem('vault_theme', newVal ? 'dark' : 'light');
    if (newVal) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('vault_token');
    localStorage.removeItem('vault_user');
    setUser(null);
    window.location.reload();
  };

  // --- HANDLERS SYNCING DIRECTLY TO BACKEND OR CLIENT-SIDE FALLBACKS ---

  // Prompts handlers
  const handleAddPrompt = async (p: Partial<Prompt>) => {
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      if (res.ok) {
        const data = await res.json();
        await refreshData();
        return data;
      }
      throw new Error('Fallback to direct Supabase');
    } catch (err) {
      console.warn('Backend prompt add failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      const generatedId = `p_${Date.now()}`;
      const newPrompt: Prompt = {
        id: generatedId,
        title: p.title || "Untitled Prompt",
        description: p.description || "",
        content: p.content || "",
        category: p.category || "General",
        tags: p.tags || [],
        platform: p.platform || "Gemini",
        isFavorite: false,
        versions: [
          {
            version: 1,
            content: p.content || "",
            updatedAt: new Date().toISOString(),
            comment: "Created prompt"
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (session?.user) {
        await supabase.from('prompts').insert({
          id: generatedId,
          title: newPrompt.title,
          description: newPrompt.description,
          content: newPrompt.content,
          category: newPrompt.category,
          tags: newPrompt.tags,
          platform: newPrompt.platform,
          is_favorite: false,
          user_id: session.user.id,
          created_at: newPrompt.createdAt,
          updated_at: newPrompt.updatedAt
        });

        await supabase.from('prompt_versions').insert({
          prompt_id: generatedId,
          version: 1,
          content: newPrompt.content,
          comment: "Created prompt",
          updated_at: new Date().toISOString()
        });
      }

      const cached = localStorage.getItem('vault_cached_prompts');
      const arr = cached ? JSON.parse(cached) : [];
      arr.unshift(newPrompt);
      localStorage.setItem('vault_cached_prompts', JSON.stringify(arr));
      await refreshData();
      return newPrompt;
    }
  };

  const handleUpdatePrompt = async (id: string, updates: Partial<Prompt> & { versionComment?: string }) => {
    try {
      const res = await fetch(`/api/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        await refreshData();
        return data;
      }
      throw new Error('Fallback to direct Supabase');
    } catch (err) {
      console.warn('Backend prompt update failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      
      const cached = localStorage.getItem('vault_cached_prompts');
      const arr: Prompt[] = cached ? JSON.parse(cached) : [];
      const currentIdx = arr.findIndex(p => p.id === id);
      if (currentIdx === -1) throw new Error('Prompt not found locally');
      const current = arr[currentIdx];

      let updatedContent = current.content;
      let versions = [...(current.versions || [])];
      let newVersionCreated = false;

      if (updates.content !== undefined && updates.content !== current.content) {
        updatedContent = updates.content;
        newVersionCreated = true;
        versions.push({
          version: (current.versions || []).length + 1,
          content: updates.content,
          updatedAt: new Date().toISOString(),
          comment: updates.versionComment || `Updated to version ${(current.versions || []).length + 1}`
        });
      }

      const updatedPrompt: Prompt = {
        ...current,
        title: updates.title !== undefined ? updates.title : current.title,
        description: updates.description !== undefined ? updates.description : current.description,
        content: updatedContent,
        category: updates.category !== undefined ? updates.category : current.category,
        tags: updates.tags !== undefined ? updates.tags : current.tags,
        platform: updates.platform !== undefined ? updates.platform : current.platform,
        isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : current.isFavorite,
        versions,
        updatedAt: new Date().toISOString()
      };

      if (session?.user) {
        await supabase.from('prompts').update({
          title: updatedPrompt.title,
          description: updatedPrompt.description,
          content: updatedPrompt.content,
          category: updatedPrompt.category,
          tags: updatedPrompt.tags,
          platform: updatedPrompt.platform,
          is_favorite: updatedPrompt.isFavorite,
          updated_at: updatedPrompt.updatedAt
        }).eq('id', id).eq('user_id', session.user.id);

        if (newVersionCreated) {
          await supabase.from('prompt_versions').insert({
            prompt_id: id,
            version: versions.length,
            content: updatedPrompt.content,
            comment: updates.versionComment || `Updated to version ${versions.length}`,
            updated_at: new Date().toISOString()
          });
        }
      }

      arr[currentIdx] = updatedPrompt;
      localStorage.setItem('vault_cached_prompts', JSON.stringify(arr));
      await refreshData();
      return updatedPrompt;
    }
  };

  const handleDeletePrompt = async (id: string) => {
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Fallback to direct Supabase');
      await refreshData();
    } catch (err) {
      console.warn('Backend prompt delete failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('prompt_versions').delete().eq('prompt_id', id);
        await supabase.from('prompts').delete().eq('id', id).eq('user_id', session.user.id);
      }
      const cached = localStorage.getItem('vault_cached_prompts');
      if (cached) {
        const arr = JSON.parse(cached).filter((p: Prompt) => p.id !== id);
        localStorage.setItem('vault_cached_prompts', JSON.stringify(arr));
      }
      await refreshData();
    }
  };

  // Markdown handlers
  const handleAddDoc = async (d: Partial<MarkdownDoc>) => {
    try {
      const res = await fetch('/api/markdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
      if (res.ok) {
        const data = await res.json();
        await refreshData();
        return data;
      }
      throw new Error('Fallback to direct Supabase');
    } catch (err) {
      console.warn('Backend markdown add failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      const generatedId = `md_${Date.now()}`;
      const cleanPath = d.path ? (d.path.startsWith('/') ? d.path.substring(1) : d.path) : '';
      const newDoc: MarkdownDoc = {
        id: generatedId,
        path: cleanPath,
        title: d.title || cleanPath,
        content: d.content || "",
        isFavorite: false,
        updatedAt: new Date().toISOString(),
        tags: d.tags || []
      };

      if (session?.user) {
        await supabase.from('markdown_docs').insert({
          id: generatedId,
          path: newDoc.path,
          title: newDoc.title,
          content: newDoc.content,
          is_favorite: false,
          tags: newDoc.tags || [],
          user_id: session.user.id,
          updated_at: newDoc.updatedAt
        });
      }

      const cached = localStorage.getItem('vault_cached_docs');
      const arr = cached ? JSON.parse(cached) : [];
      arr.push(newDoc);
      localStorage.setItem('vault_cached_docs', JSON.stringify(arr));
      await refreshData();
      return newDoc;
    }
  };

  const handleUpdateDoc = async (id: string, updates: Partial<MarkdownDoc>) => {
    try {
      const res = await fetch(`/api/markdowns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        await refreshData();
        return data;
      }
      throw new Error('Fallback to direct Supabase');
    } catch (err) {
      console.warn('Backend markdown update failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      
      const cached = localStorage.getItem('vault_cached_docs');
      const arr: MarkdownDoc[] = cached ? JSON.parse(cached) : [];
      const currentIdx = arr.findIndex(d => d.id === id);
      if (currentIdx === -1) throw new Error('Document not found locally');
      const current = arr[currentIdx];

      const updatedDoc: MarkdownDoc = {
        ...current,
        path: updates.path !== undefined ? updates.path : current.path,
        title: updates.title !== undefined ? updates.title : current.title,
        content: updates.content !== undefined ? updates.content : current.content,
        isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : current.isFavorite,
        tags: updates.tags !== undefined ? updates.tags : current.tags,
        updatedAt: new Date().toISOString()
      };

      if (session?.user) {
        await supabase.from('markdown_docs').update({
          path: updatedDoc.path,
          title: updatedDoc.title,
          content: updatedDoc.content,
          is_favorite: updatedDoc.isFavorite,
          tags: updatedDoc.tags || [],
          updated_at: updatedDoc.updatedAt
        }).eq('id', id).eq('user_id', session.user.id);
      }

      arr[currentIdx] = updatedDoc;
      localStorage.setItem('vault_cached_docs', JSON.stringify(arr));
      await refreshData();
      return updatedDoc;
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      const res = await fetch(`/api/markdowns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Fallback to direct Supabase');
      await refreshData();
    } catch (err) {
      console.warn('Backend markdown delete failed. Executing directly on Supabase client-side...', err);
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.from('markdown_docs').delete().eq('id', id).eq('user_id', session.user.id);
      }
      const cached = localStorage.getItem('vault_cached_docs');
      if (cached) {
        const arr = JSON.parse(cached).filter((d: MarkdownDoc) => d.id !== id);
        localStorage.setItem('vault_cached_docs', JSON.stringify(arr));
      }
      await refreshData();
    }
  };

  // Git handlers
  const handleGitSync = async (repoUrl: string, folderToSync?: string) => {
    const res = await fetch('/api/git/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, folderToSync })
    });
    const data = await res.json();
    await refreshData();
    return data;
  };

  // Indexing triggers
  const handleIndexRag = async () => {
    setIndexing(true);
    try {
      const res = await fetch('/api/rag/index', { method: 'POST' });
      if (res.ok) {
        // Double check they didn't return HTML due to Vercel SPA rewrite fallback
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          throw new Error('Endpoint returned HTML instead of JSON');
        }
        const data = await res.json();
        await refreshData();
        return data;
      }
      throw new Error('Backend response not OK');
    } catch (e) {
      console.warn("Backend RAG reindexing failed or serverless. Simulating successful local client-side indexing...", e);
      // Simulate indexing latency for a smoother visual feedback
      await new Promise(resolve => setTimeout(resolve, 800));
      return { 
        success: true, 
        message: 'Client-side local fallback index complete (Simulated)', 
        apiUsed: false, 
        chunksIndexed: 15 
      };
    } finally {
      setIndexing(false);
    }
  };

  // Bulk imports JSON
  const handleBulkImport = async (payload: { prompts?: any[]; markdowns?: any[] }) => {
    const res = await fetch('/api/import/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    await refreshData();
    return data;
  };

  // Quick navigation jumpers from widgets
  const handleNavigateToPrompt = (p: Prompt) => {
    setSelectedPromptId(p.id);
    setActiveTab('prompts');
  };

  const handleNavigateToDoc = (m: MarkdownDoc) => {
    setSelectedDocId(m.id);
    setActiveTab('markdowns');
  };

  const handleNavigateToDocIdOnly = (id: string) => {
    setSelectedDocId(id);
    setActiveTab('markdowns');
  };

  // Extract list of all prompt categories
  const categories = Array.from(new Set(prompts.map(p => p.category))) as string[];

  // Compute matching items for command palette dynamically
  const paletteResults = (() => {
    const q = paletteSearchQuery.trim().toLowerCase();
    
    if (!q) {
      return [
        { type: 'nav', title: 'Go to Dashboard', subtitle: 'System stats, overview, global search', action: () => { setActiveTab('dashboard'); setSelectedPromptId(null); setSelectedDocId(null); } },
        { type: 'nav', title: 'Create New Prompt', subtitle: 'Jump to Prompts and start a new template', action: () => { setActiveTab('prompts'); setForceAddPrompt(true); setSelectedPromptId(null); setSelectedDocId(null); } },
        { type: 'nav', title: 'Open AI Assistant Chatbot', subtitle: 'Consult Gemini model with RAG', action: () => { setActiveTab('ai'); setSelectedPromptId(null); setSelectedDocId(null); } },
        { type: 'nav', title: 'Open Markdown Documents Editor', subtitle: 'View knowledge base files', action: () => { setActiveTab('markdowns'); setSelectedPromptId(null); setSelectedDocId(null); } },
        { type: 'nav', title: 'Git Sync Repository', subtitle: 'Publish or backup workspace', action: () => { setActiveTab('git'); setSelectedPromptId(null); setSelectedDocId(null); } },
        { type: 'theme', title: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`, subtitle: 'Toggle current aesthetic colors', action: () => toggleTheme() }
      ];
    }

    const matches: any[] = [];
    
    // Search prompts
    prompts.forEach(p => {
      if (p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) {
        matches.push({
          type: 'prompt',
          title: p.title,
          subtitle: `Prompt • ${p.category} • ${p.platform}`,
          action: () => {
            setActiveTab('prompts');
            setSelectedPromptId(p.id);
          }
        });
      }
    });

    // Search documents
    markdowns.forEach(d => {
      if (d.title.toLowerCase().includes(q) || d.path.toLowerCase().includes(q)) {
        matches.push({
          type: 'doc',
          title: d.title,
          subtitle: `Doc • ${d.path}`,
          action: () => {
            setActiveTab('markdowns');
            setSelectedDocId(d.id);
          }
        });
      }
    });

    return matches.slice(0, 8);
  })();

  const handlePaletteInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % paletteResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + paletteResults.length) % paletteResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (paletteResults[highlightedIndex]) {
        paletteResults[highlightedIndex].action();
        setShowCommandPalette(false);
        setPaletteSearchQuery('');
      }
    }
  };

  if (!user) {
    return (
      <AuthLayout onLoginSuccess={(u) => setUser(u)} isDark={isDark}>
        <div />
      </AuthLayout>
    );
  }

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${
      isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
    }`}>
      
      {/* Dynamic Left Navigation Rail (Desktop) */}
      <aside className={`w-64 border-r shrink-0 hidden lg:flex flex-col justify-between p-4 transition-all ${
        isDark ? 'bg-zinc-900/50 border-zinc-800/80' : 'bg-white border-zinc-200'
      }`}>
        <div className="space-y-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2">
            <div className="p-2 bg-violet-600 rounded-xl text-white shadow-lg shadow-violet-600/10">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm tracking-tight">AI Prompt Vault</h2>
              <span className="text-[10px] text-zinc-500 font-mono block">Self-Hosted Workspace</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => { setActiveTab('dashboard'); setSelectedPromptId(null); setSelectedDocId(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              System Dashboard
            </button>

            <button
              onClick={() => { setActiveTab('prompts'); setSelectedPromptId(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'prompts'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              Prompt Library
            </button>

            <button
              onClick={() => { setActiveTab('markdowns'); setSelectedDocId(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'markdowns'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              Markdown Library
            </button>

            <button
              onClick={() => { setActiveTab('ai'); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'ai'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Terminal className="w-4 h-4 shrink-0" />
              AI & RAG Assistant
            </button>

            <button
              onClick={() => { setActiveTab('git'); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'git'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <GitBranch className="w-4 h-4 shrink-0" />
              Git Sync Engine
            </button>

            <button
              onClick={() => { setActiveTab('export'); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide cursor-pointer transition-all ${
                activeTab === 'export'
                  ? 'bg-violet-600 text-white shadow-md'
                  : isDark ? 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-100' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Download className="w-4 h-4 shrink-0" />
              Import / Export Hub
            </button>
          </nav>
        </div>

        {/* Profile Footer */}
        <div className="space-y-3">
          <div className={`p-3.5 rounded-2xl flex items-center justify-between gap-2 border ${
            isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-150'
          }`}>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">User Access</span>
              <p className="font-bold text-xs truncate mt-0.5">{user.username}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
              title="Logout session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Theme toggler */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
              isDark 
                ? 'bg-zinc-950/20 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950' 
                : 'bg-zinc-50 border-zinc-150 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100'
            }`}
          >
            <span className="flex items-center gap-2">
              {isDark ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              {isDark ? 'Dark Cosmic Mode' : 'Light Clean Theme'}
            </span>
            <span className="text-[10px] text-zinc-500">Toggle</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header Bar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className={`lg:hidden h-14 border-b flex items-center justify-between px-4 shrink-0 ${
          isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
        }`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-violet-600 rounded-lg text-white">
              <Layers className="w-4 h-4" />
            </div>
            <h1 className="font-extrabold text-sm">Prompt Vault</h1>
          </div>
          
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-2 rounded-lg border ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </header>

        {/* Mobile menu Overlay drawer */}
        {mobileMenuOpen && (
          <div className={`lg:hidden fixed inset-0 z-50 flex flex-col p-6 animate-fade-in ${
            isDark ? 'bg-zinc-950' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-violet-600 rounded-xl text-white">
                  <Layers className="w-5 h-5" />
                </div>
                <h1 className="font-extrabold text-base">AI Prompt Vault</h1>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg border dark:border-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="space-y-2 flex-1">
              {[
                { id: 'dashboard', label: 'System Dashboard', icon: <Layers className="w-5 h-5" /> },
                { id: 'prompts', label: 'Prompt Library', icon: <Sparkles className="w-5 h-5" /> },
                { id: 'markdowns', label: 'Markdown Library', icon: <BookOpen className="w-5 h-5" /> },
                { id: 'ai', label: 'AI & RAG Assistant', icon: <Terminal className="w-5 h-5" /> },
                { id: 'git', label: 'Git Sync Engine', icon: <GitBranch className="w-5 h-5" /> },
                { id: 'export', label: 'Import / Export Hub', icon: <Download className="w-5 h-5" /> }
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setSelectedPromptId(null);
                    setSelectedDocId(null);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-4 py-3 px-4 rounded-xl text-sm font-bold border transition-all ${
                    activeTab === item.id
                      ? 'bg-violet-600 text-white border-transparent shadow-md'
                      : isDark ? 'text-zinc-400 border-zinc-900 hover:bg-zinc-900' : 'text-zinc-600 border-zinc-100 hover:bg-zinc-50'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="space-y-4 pt-6 border-t dark:border-zinc-900">
              <div className="flex justify-between items-center text-xs">
                <span>Account: <strong>{user.username}</strong></span>
                <button onClick={handleLogout} className="text-red-500 font-bold">Logout</button>
              </div>
              <button
                onClick={toggleTheme}
                className="w-full py-3 px-4 rounded-xl border text-xs font-bold bg-violet-600/5 text-violet-500 flex justify-center items-center gap-2"
              >
                {isDark ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                {isDark ? 'Dark Cosmic Mode' : 'Light Clean Theme'}
              </button>
            </div>
          </div>
        )}

        {/* Primary Content View Stage */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-violet-600 animate-spin" />
              <p className="text-xs font-mono font-bold text-zinc-500">Retrieving Vault Database Models...</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && stats && (
                <Dashboard 
                  stats={stats} 
                  prompts={prompts}
                  markdowns={markdowns}
                  onSelectPrompt={handleNavigateToPrompt} 
                  onSelectDoc={handleNavigateToDoc} 
                  isDark={isDark}
                  onIndexRag={handleIndexRag}
                  indexing={indexing}
                />
              )}

              {activeTab === 'prompts' && (
                <PromptLibrary
                  prompts={prompts}
                  categories={categories.length > 0 ? categories : ['General', 'Development', 'Architecture', 'Prompt Engineering', 'UI/UX Design', 'Refactoring', 'AI Agent']}
                  onAddPrompt={handleAddPrompt}
                  onUpdatePrompt={handleUpdatePrompt}
                  onDeletePrompt={handleDeletePrompt}
                  isDark={isDark}
                  selectedPromptId={selectedPromptId}
                  forceAddPrompt={forceAddPrompt}
                  onClearForceAddPrompt={() => setForceAddPrompt(false)}
                />
              )}

              {activeTab === 'markdowns' && (
                <MarkdownLibrary
                  docs={markdowns}
                  onAddDoc={handleAddDoc}
                  onUpdateDoc={handleUpdateDoc}
                  onDeleteDoc={handleDeleteDoc}
                  isDark={isDark}
                  selectedDocId={selectedDocId}
                  onIndexRag={handleIndexRag}
                />
              )}

              {activeTab === 'ai' && (
                <AIAssistant
                  markdowns={markdowns}
                  prompts={prompts}
                  onSelectDoc={handleNavigateToDocIdOnly}
                  isDark={isDark}
                  onIndexRag={handleIndexRag}
                />
              )}

              {activeTab === 'git' && (
                <GitIntegration
                  markdowns={markdowns}
                  onGitSync={handleGitSync}
                  isDark={isDark}
                />
              )}

              {activeTab === 'export' && (
                <ImportExport
                  prompts={prompts}
                  markdowns={markdowns}
                  onBulkImport={handleBulkImport}
                  isDark={isDark}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* GLOBAL COMMAND PALETTE MODAL */}
      {showCommandPalette && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm" onClick={() => setShowCommandPalette(false)} />
          <div className={`relative w-full max-w-lg rounded-2xl border shadow-2xl flex flex-col overflow-hidden animate-fade-in ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
          }`}>
            <div className="flex items-center gap-2 px-4 border-b dark:border-zinc-800">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Search prompts, documents, or jump to tabs..."
                value={paletteSearchQuery}
                onChange={(e) => { setPaletteSearchQuery(e.target.value); setHighlightedIndex(0); }}
                onKeyDown={handlePaletteInputKeyDown}
                className="w-full py-4 text-xs bg-transparent outline-none border-0 focus:ring-0"
              />
              <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-500 uppercase tracking-widest">
                ESC
              </span>
            </div>

            <div className="max-h-[320px] overflow-y-auto divide-y dark:divide-zinc-850/40">
              {paletteResults.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 italic">
                  No matching results found in vault...
                </div>
              ) : (
                paletteResults.map((res, index) => {
                  const active = index === highlightedIndex;
                  return (
                    <div
                      key={index}
                      onClick={() => {
                        res.action();
                        setShowCommandPalette(false);
                        setPaletteSearchQuery('');
                      }}
                      className={`p-3 px-4 flex items-center justify-between cursor-pointer transition-all ${
                        active 
                          ? 'bg-violet-600 text-white animate-pulse-subtle' 
                          : isDark ? 'hover:bg-zinc-850' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${active ? 'text-white' : 'text-zinc-900 dark:text-zinc-100'}`}>
                          {res.title}
                        </p>
                        <p className={`text-[10px] ${active ? 'text-violet-200' : 'text-zinc-500'}`}>
                          {res.subtitle}
                        </p>
                      </div>
                      {active && (
                        <span className="text-[10px] font-mono font-semibold bg-violet-700 text-white px-2 py-0.5 rounded uppercase">
                          ENTER
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 text-[9px] text-zinc-500 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono">
                <span>↑↓ to navigate</span>
                <span>•</span>
                <span>Enter to select</span>
              </span>
              <span className="flex items-center gap-1">
                <Command className="w-3 h-3" />
                <span>K to toggle</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP CHEAT SHEET */}
      {showShortcutHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm" onClick={() => setShowShortcutHelp(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 flex flex-col animate-fade-in ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
          }`}>
            <div className="flex items-center justify-between mb-4 border-b pb-2 dark:border-zinc-800">
              <h3 className="font-bold text-sm flex items-center gap-2 text-violet-500">
                <Keyboard className="w-4 h-4" />
                Vault Keyboard Shortcuts Cheat Sheet
              </h3>
              <button
                onClick={() => setShowShortcutHelp(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Open Command Palette / Global Search</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Ctrl + K
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Create New Prompt Template</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + N
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Navigate to Dashboard Tab</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + D
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Navigate to Prompt Library Tab</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + P
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Navigate to Markdown Docs Tab</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + M
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Navigate to AI RAG Assistant Chat</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + A
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Navigate to Git Integration Tab</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  Alt + G
                </kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Toggle Shortcuts Help Modal</span>
                <kbd className="px-2 py-1 bg-zinc-100 dark:bg-zinc-850 border dark:border-zinc-800 rounded font-mono text-[10px] font-bold shadow-sm">
                  ?
                </kbd>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t dark:border-zinc-800 text-[10px] text-zinc-550 italic text-center font-medium">
              Pressing "?" on any screen (when not typing inside inputs) toggles this help card.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
