import React, { useState } from 'react';
import { GitBranch, GitPullRequest, Layers, RefreshCw, Terminal, CheckCircle2, AlertTriangle, Play, HelpCircle, Code } from 'lucide-react';
import { MarkdownDoc } from '../types';

interface GitIntegrationProps {
  markdowns: MarkdownDoc[];
  onGitSync: (repoUrl: string, folderToSync?: string) => Promise<{ success: boolean; addedCount: number; updatedCount: number; filesCount: number }>;
  isDark: boolean;
}

export default function GitIntegration({ markdowns, onGitSync, isDark }: GitIntegrationProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [folderToSync, setFolderToSync] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'System git console ready.',
    'Enter a repository URL above and press "Sync Repository" to clone.'
  ]);
  const [syncResult, setSyncResult] = useState<{ success: boolean; added: number; updated: number; total: number } | null>(null);

  const pushLog = (msg: string) => {
    setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl || syncing) return;

    setSyncing(true);
    setSyncResult(null);
    setTerminalLogs([]);
    
    pushLog(`Initiating repository connection to: "${repoUrl}"...`);
    pushLog(`Folder constraint: ${folderToSync ? `"${folderToSync}"` : 'Root recursive sync'}`);
    pushLog('Executing command on backend: git clone --depth 1 <url> <temp_dir>');

    try {
      const data = await onGitSync(repoUrl, folderToSync || undefined);
      
      if (data.success) {
        pushLog('Git clone successful.');
        pushLog(`Scanning imported directory structure recursively for .md files...`);
        pushLog(`Scanning complete. Detected ${data.filesCount} markdown files.`);
        pushLog(`Sync results written to database.`);
        pushLog(`Database indexed. Added: ${data.addedCount} new files, Updated: ${data.updatedCount} existing files.`);
        
        setSyncResult({
          success: true,
          added: data.addedCount,
          updated: data.updatedCount,
          total: data.filesCount
        });
      } else {
        pushLog('Command failed. Check repository accessibility.');
      }
    } catch (err: any) {
      pushLog(`Error executing git sync: ${err.message || err}`);
      setSyncResult({
        success: false,
        added: 0,
        updated: 0,
        total: 0
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleClonePreset = (url: string, folder?: string) => {
    setRepoUrl(url);
    if (folder) setFolderToSync(folder);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Git Workspace Sync</h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Directly import or sync prompt templates, Skill.md context rules, and technical instructions from active public Git repositories.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sync Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm text-left`}>
            <div className="flex items-center gap-2 mb-4 text-violet-500">
              <GitPullRequest className="w-5 h-5" />
              <h3 className="font-bold text-lg">Git Repository Config</h3>
            </div>

            <form onSubmit={handleSyncSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Public Git Repository URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://github.com/prompting-guide/prompts.git"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Folder to sync (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., docs or prompts (leave blank for root repo sync)"
                  value={folderToSync}
                  onChange={(e) => setFolderToSync(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
              </div>

              <button
                type="submit"
                disabled={syncing || !repoUrl}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-600/10 cursor-pointer disabled:opacity-55 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing Git Repository...' : 'Clone and Sync Vault'}
              </button>
            </form>
          </div>

          {/* Terminal Console */}
          <div className={`p-6 rounded-2xl border flex flex-col h-[280px] ${
            isDark ? 'bg-zinc-950 border-zinc-900' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
          }`}>
            <div className="flex items-center justify-between mb-3 border-b pb-2 border-zinc-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-mono">
                <Terminal className="w-4 h-4 text-emerald-500" />
                Git Clone command console
              </span>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-[11px] text-left text-zinc-300 space-y-1 pr-1 select-text">
              {terminalLogs.map((log, index) => (
                <div key={index} className="leading-5">
                  <span className="text-emerald-500">$</span> {log}
                </div>
              ))}
              {syncing && (
                <div className="text-violet-400 animate-pulse font-bold mt-1">Cloning remote repository... Please stand by.</div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info & Preset Quickstart */}
        <div className="space-y-6 text-left">
          {/* Quick presets */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
            <h4 className="font-bold text-sm mb-3 text-zinc-500">Quick-sync presets</h4>
            <p className="text-xs text-zinc-500 mb-4">
              Select one of the public repositories below to pre-populate configurations for standard technical rules:
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleClonePreset('https://github.com/vinta/awesome-python.git', 'docs')}
                className={`w-full p-3 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-3 hover:-translate-y-0.5 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-150 hover:bg-zinc-100'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-violet-500/15 text-violet-500 shrink-0 mt-0.5">
                  <Code className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h5 className="font-bold">Awesome Python Docs</h5>
                  <span className="text-[10px] text-zinc-400 font-mono block mt-1">github.com/vinta/awesome-python</span>
                </div>
              </button>

              <button
                onClick={() => handleClonePreset('https://github.com/charlax/professional-programming.git', 'guidelines')}
                className={`w-full p-3 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-3 hover:-translate-y-0.5 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-150 hover:bg-zinc-100'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-violet-500/15 text-violet-500 shrink-0 mt-0.5">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h5 className="font-bold">Professional Coding</h5>
                  <span className="text-[10px] text-zinc-400 font-mono block mt-1">github.com/charlax/professional-programming</span>
                </div>
              </button>
            </div>
          </div>

          {/* Fallback Backup ZIP Card */}
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-blue-950/10 border-blue-900/30' : 'bg-blue-50/50 border-blue-150'} shadow-sm text-left`}>
            <div className="flex items-center gap-2 mb-3 text-blue-500">
              <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />
              <h4 className="font-bold text-sm">GitHub Sync Problem?</h4>
            </div>
            <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
              หากมีปัญหาเรื่องสิทธิ์หรือการ Sync ขึ้น GitHub ไม่ทำงาน คุณสามารถดาวน์โหลดซอร์สโค้ดทั้งหมดเป็นไฟล์ .ZIP เพื่อนำไปอัปโหลดขึ้น GitHub หรือเป็นไฟล์สำรองข้อมูล (Backup) ด้วยตนเองได้อย่างง่ายดาย
            </p>
            <button
              type="button"
              onClick={() => { window.location.href = '/api/download-zip'; }}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/10 cursor-pointer flex items-center justify-center gap-2 transition-all"
            >
              <GitBranch className="w-4 h-4" />
              Download Project ZIP
            </button>
          </div>

          {/* Sync Result summary */}
          {syncResult && (
            <div className={`p-6 rounded-2xl border ${
              syncResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {syncResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                <h4 className="font-bold text-sm">
                  {syncResult.success ? 'Sync operation complete!' : 'Sync failed'}
                </h4>
              </div>
              {syncResult.success ? (
                <div className="text-xs space-y-1.5">
                  <p>Repository cloned and scanned successfully.</p>
                  <ul className="list-disc ml-4 space-y-1">
                    <li>Total Markdowns cloned: <strong>{syncResult.total}</strong></li>
                    <li>Added as new documents: <strong>{syncResult.added}</strong></li>
                    <li>Updated content versions: <strong>{syncResult.updated}</strong></li>
                  </ul>
                </div>
              ) : (
                <p className="text-xs">
                  We encountered an error cloning this repository. Verify that it is a valid, publicly accessible Git link.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
