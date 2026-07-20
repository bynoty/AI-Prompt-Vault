import React, { useState } from 'react';
import { Prompt, MarkdownDoc } from '../types';
import { 
  Download, 
  Upload, 
  FileJson, 
  FileSpreadsheet, 
  Archive, 
  CheckCircle2, 
  AlertTriangle, 
  CloudUpload, 
  Info,
  FileText, 
  Trash2, 
  Eye, 
  FileCode, 
  Check, 
  Settings, 
  X, 
  Plus, 
  AlertCircle,
  RefreshCw,
  CloudDownload,
  CloudLightning,
  ShieldAlert,
  ListTodo
} from 'lucide-react';
import JSZip from 'jszip';
import { 
  getPendingRecords, 
  getSyncStatus, 
  syncLocalToSupabase, 
  syncSupabaseToLocal, 
  clearPendingRecords, 
  queuePendingRecord,
  SyncQueueItem,
  SyncStatus,
  SyncSummary
} from '../lib/sync';

interface ImportExportProps {
  prompts: Prompt[];
  markdowns: MarkdownDoc[];
  onBulkImport: (data: { prompts?: any[]; markdowns?: any[] }) => Promise<{ success: boolean; addedPrompts: number; addedDocs: number }>;
  isDark: boolean;
}

interface PendingFile {
  id: string;
  name: string;
  size: number;
  content: string;
  extension: string;
  importAs: 'markdown' | 'prompt';
  targetPath: string;
  promptCategory: string;
  promptPlatform: string;
}

export default function ImportExport({ prompts, markdowns, onBulkImport, isDark }: ImportExportProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Migration states
  const [migrating, setMigrating] = useState(false);
  const [migrationSuccess, setMigrationSuccess] = useState('');
  const [migrationError, setMigrationError] = useState('');

  // Client Offline Synchronization States
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => getPendingRecords());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncPercent, setSyncPercent] = useState(0);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<'latest_wins' | 'local_wins' | 'cloud_wins'>('latest_wins');

  const refreshSyncState = () => {
    setSyncQueue(getPendingRecords());
    setSyncStatus(getSyncStatus());
  };

  const handleRefreshSync = () => {
    refreshSyncState();
    setSyncMsg('Synchronization queue and status updated.');
  };

  const handlePushToCloud = async () => {
    setSyncingCloud(true);
    setSyncPercent(0);
    setSyncMsg('Initializing cloud synchronization...');
    setSyncSummary(null);
    try {
      const summary = await syncLocalToSupabase(conflictStrategy, (percent, message) => {
        setSyncPercent(percent);
        setSyncMsg(message);
      });
      setSyncSummary(summary);
      refreshSyncState();
    } catch (err: any) {
      console.error('Push to cloud sync failed:', err);
      setSyncMsg(`Sync failed: ${err.message || 'Unknown network error'}`);
    } finally {
      setSyncingCloud(false);
    }
  };

  const handlePullFromCloud = async () => {
    setSyncingCloud(true);
    setSyncPercent(20);
    setSyncMsg('Fetching cloud vault data from Supabase...');
    setSyncSummary(null);
    try {
      const res = await syncSupabaseToLocal();
      setSyncPercent(100);
      if (res.success) {
        setSyncMsg(`Successfully downloaded ${res.promptsCount} prompts and ${res.docsCount} documents to local cache.`);
        // We can reload or trigger a message
        alert(`Successfully pulled ${res.promptsCount} prompts and ${res.docsCount} markdown documents from Supabase to local client cache!`);
      } else {
        setSyncMsg(`Pull failed: ${res.error || 'Failed to authenticate or download'}`);
      }
      refreshSyncState();
    } catch (err: any) {
      setSyncPercent(100);
      setSyncMsg(`Pull error: ${err.message || 'Failed'}`);
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleClearSyncQueue = () => {
    clearPendingRecords();
    refreshSyncState();
    setSyncSummary(null);
    setSyncMsg('Cleared local offline sync queue.');
  };

  const handleSimulateOfflinePrompt = () => {
    const mockId = 'p_off_' + Math.random().toString(36).substr(2, 5);
    queuePendingRecord('prompt', 'insert', mockId, {
      id: mockId,
      title: `Offline Prompt ${Math.floor(Math.random() * 1000)}`,
      description: 'An offline-first template queued in local queue',
      content: 'Analyze the system constraints and output a highly performant execution log...',
      category: 'General',
      tags: ['offline', 'simulation'],
      platform: 'Gemini',
      isFavorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    refreshSyncState();
    setSyncMsg('Successfully queued an offline-created prompt into the local sync engine!');
  };

  const handleSimulateOfflineDoc = () => {
    const mockId = 'doc_off_' + Math.random().toString(36).substr(2, 5);
    queuePendingRecord('markdown', 'insert', mockId, {
      id: mockId,
      path: `rules/offline-spec-${Math.floor(Math.random() * 1000)}.md`,
      title: `Offline Spec Guidelines`,
      content: `# Offline Mode Spec\n\nGenerated when browser was simulated offline. Supports conflict check.`,
      isFavorite: false,
      tags: ['offline', 'specification'],
      updatedAt: new Date().toISOString()
    });
    refreshSyncState();
    setSyncMsg('Successfully queued an offline-created markdown document into the local sync engine!');
  };

  const handleMigrateLocalData = async () => {
    setMigrating(true);
    setMigrationSuccess('');
    setMigrationError('');
    try {
      const res = await fetch('/api/db/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok) {
        if (data.success) {
          setMigrationSuccess(data.message || 'Local data migrated successfully!');
        } else {
          setMigrationError(data.error || 'Failed to migrate local data.');
        }
      } else {
        setMigrationError(data.error || 'Failed to migrate local data. Make sure you are signed in via Supabase.');
      }
    } catch (err: any) {
      setMigrationError(err.message || 'Network error executing database migration.');
    } finally {
      setMigrating(false);
    }
  };

  // Direct individual file upload states
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [directDragActive, setDirectDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<PendingFile | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [directSuccess, setDirectSuccess] = useState('');
  const [directError, setDirectError] = useState('');

  // Export entire vault as JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ prompts, markdowns }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `ai_prompt_vault_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export prompts as CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Title', 'Description', 'Category', 'Platform', 'Tags', 'Content', 'CreatedAt'];
    const rows = prompts.map(p => [
      p.id,
      p.title,
      p.description,
      p.category,
      p.platform,
      p.tags.join('; '),
      p.content.replace(/"/g, '""'), // escape quotes
      p.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", encodedUri);
    downloadAnchor.setAttribute("download", `prompt_library_${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export entire vault as a formatted ZIP
  const handleExportZIP = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const zip = new JSZip();

      // Folder 1: Prompts
      const promptsFolder = zip.folder("prompts");
      prompts.forEach(p => {
        promptsFolder?.file(`${p.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`, JSON.stringify(p, null, 2));
      });

      // Folder 2: Markdown Docs
      const mdFolder = zip.folder("markdowns");
      markdowns.forEach(m => {
        mdFolder?.file(m.path, m.content);
      });

      // Generate Zip blob
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", url);
      downloadAnchor.setAttribute("download", `ai_prompt_vault_${Date.now()}.zip`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
      setSuccessMsg('Successfully generated and downloaded ZIP vault.');
    } catch (err) {
      setErrorMsg('Failed to compile ZIP file.');
    } finally {
      setLoading(false);
    }
  };

  // Export entire workspace source code project folder as a ZIP backup
  const handleExportSourceCodeZIP = () => {
    setSuccessMsg('Packaging project source code... Your download will begin shortly.');
    window.location.href = '/api/download-zip';
  };

  // Process imported JSON file
  const processJSONImport = async (jsonText: string) => {
    try {
      const data = JSON.parse(jsonText);
      if (!data.prompts && !data.markdowns) {
        throw new Error('Invalid schema. Must contain prompts or markdowns key.');
      }
      const res = await onBulkImport(data);
      if (res.success) {
        setSuccessMsg(`JSON Imported: Added ${res.addedPrompts} prompts, ${res.addedDocs} Markdown files.`);
      }
    } catch (err: any) {
      setErrorMsg(`JSON Import failed: ${err.message || 'Invalid format.'}`);
    }
  };

  // Process imported ZIP file using JSZip
  const processZIPImport = async (file: File) => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const zip = await JSZip.loadAsync(file);
      const importedPrompts: any[] = [];
      const importedMarkdowns: any[] = [];

      // Loop through zip contents
      const promises: Promise<void>[] = [];

      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return; // skip dirs

        if (relativePath.endsWith('.md')) {
          const promise = zipEntry.async("string").then((content) => {
            // strip leading folders like "markdowns/" if zip was exported from our app
            let cleanPath = relativePath;
            if (cleanPath.startsWith('markdowns/')) {
              cleanPath = cleanPath.replace('markdowns/', '');
            }
            importedMarkdowns.push({
              path: cleanPath,
              title: cleanPath.split('/').pop()?.replace('.md', '') || 'Imported File',
              content,
              isFavorite: false
            });
          });
          promises.push(promise);
        } else if (relativePath.endsWith('.json')) {
          const promise = zipEntry.async("string").then((content) => {
            try {
              const parsed = JSON.parse(content);
              // Check if single prompt structure
              if (parsed.title && parsed.content) {
                importedPrompts.push(parsed);
              } else if (parsed.prompts || parsed.markdowns) {
                // If nested database export
                if (parsed.prompts) importedPrompts.push(...parsed.prompts);
                if (parsed.markdowns) importedMarkdowns.push(...parsed.markdowns);
              }
            } catch (e) {}
          });
          promises.push(promise);
        }
      });

      await Promise.all(promises);

      if (importedPrompts.length === 0 && importedMarkdowns.length === 0) {
        throw new Error('No .md or prompt .json files detected in the ZIP archive.');
      }

      const res = await onBulkImport({ prompts: importedPrompts, markdowns: importedMarkdowns });
      if (res.success) {
        setSuccessMsg(`ZIP Imported successfully! Extracted and stored ${res.addedPrompts} prompts and ${res.addedDocs} Markdown files nested structures.`);
      }

    } catch (err: any) {
      setErrorMsg(`ZIP Extraction failed: ${err.message || 'Invalid zip archive.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Drag / Drop events for Full Backups
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setSuccessMsg('');
    setErrorMsg('');
    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          processJSONImport(event.target.result as string);
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.zip')) {
      processZIPImport(file);
    } else {
      setErrorMsg('Unsupported archive type. Only upload .json backup or .zip archives in this section.');
    }
  };

  // --- Direct File Importer Core Logic ---
  const handleDirectDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDirectDragActive(true);
    } else if (e.type === "dragleave") {
      setDirectDragActive(false);
    }
  };

  const handleDirectDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDirectDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleDirectFiles(e.dataTransfer.files);
    }
  };

  const handleDirectFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleDirectFiles(e.target.files);
    }
  };

  const handleDirectFiles = (files: FileList) => {
    setDirectSuccess('');
    setDirectError('');
    
    Array.from(files).forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        
        // Default category & platform configuration
        const isMd = ext === 'md';
        const defaultImportAs: 'markdown' | 'prompt' = isMd ? 'markdown' : 'prompt';
        const defaultPath = isMd ? file.name : `${nameWithoutExt}.md`;

        const newFile: PendingFile = {
          id: `pf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          size: file.size,
          content: text,
          extension: ext,
          importAs: defaultImportAs,
          targetPath: defaultPath,
          promptCategory: 'Imported',
          promptPlatform: 'Gemini'
        };

        setPendingFiles(prev => [...prev, newFile]);
      };
      reader.readAsText(file);
    });
  };

  const handleUpdatePendingType = (id: string, type: 'markdown' | 'prompt') => {
    setPendingFiles(prev => prev.map(f => {
      if (f.id === id) {
        const nameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
        const targetPath = type === 'markdown' ? (f.extension === 'md' ? f.name : `${nameWithoutExt}.md`) : f.targetPath;
        return { ...f, importAs: type, targetPath };
      }
      return f;
    }));
  };

  const handleUpdatePendingPath = (id: string, path: string) => {
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, targetPath: path } : f));
  };

  const handleUpdatePendingCategory = (id: string, cat: string) => {
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, promptCategory: cat } : f));
  };

  const handleUpdatePendingPlatform = (id: string, plat: string) => {
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, promptPlatform: plat } : f));
  };

  const handleRemovePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAllPending = () => {
    setPendingFiles([]);
    setDirectSuccess('');
    setDirectError('');
  };

  const handleOpenPreview = (file: PendingFile) => {
    setPreviewFile(file);
    setPreviewContent(file.content);
  };

  const handleSavePreview = () => {
    if (previewFile) {
      setPendingFiles(prev => prev.map(f => f.id === previewFile.id ? { ...f, content: previewContent } : f));
      setPreviewFile(null);
    }
  };

  const handleImportPendingFiles = async () => {
    if (pendingFiles.length === 0) return;
    setLoading(true);
    setDirectSuccess('');
    setDirectError('');

    try {
      const importedPrompts: any[] = [];
      const importedMarkdowns: any[] = [];

      pendingFiles.forEach(pf => {
        if (pf.importAs === 'prompt') {
          // Format name into a polished Title
          const title = pf.name
            .replace(/\.[^/.]+$/, "")
            .replace(/[-_]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          importedPrompts.push({
            title: title || 'Untitled Imported Prompt',
            description: `Imported from file "${pf.name}"`,
            content: pf.content,
            category: pf.promptCategory || 'Imported',
            tags: ['Imported', pf.extension],
            platform: pf.promptPlatform || 'Gemini',
            isFavorite: false,
            versions: [
              {
                version: 1,
                content: pf.content,
                updatedAt: new Date().toISOString(),
                comment: 'Initial import from external file'
              }
            ]
          });
        } else {
          // Format Markdown file path
          let cleanPath = pf.targetPath.trim();
          if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1);
          }
          if (!cleanPath) {
            cleanPath = pf.name;
          }
          // Ensure file extension
          if (!cleanPath.endsWith('.md')) {
            cleanPath = `${cleanPath}.md`;
          }

          // Generate title from file path name
          const fileName = cleanPath.split('/').pop() || 'Untitled Document';
          const title = fileName
            .replace('.md', '')
            .replace(/[-_]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          importedMarkdowns.push({
            path: cleanPath,
            title: title,
            content: pf.content,
            isFavorite: false
          });
        }
      });

      const res = await onBulkImport({ prompts: importedPrompts, markdowns: importedMarkdowns });
      if (res.success) {
        setDirectSuccess(`Successfully imported ${res.addedPrompts} Prompt templates and ${res.addedDocs} Markdown documents into your system!`);
        setPendingFiles([]);
      } else {
        setDirectError('Import process completed but no records were added.');
      }
    } catch (err: any) {
      setDirectError(`Bulk import of files failed: ${err.message || 'Unknown error occurred.'}`);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (ext: string) => {
    switch(ext) {
      case 'md':
        return <FileText className="w-5 h-5 text-emerald-500" />;
      case 'xml':
        return <FileCode className="w-5 h-5 text-blue-500" />;
      case 'yaml':
      case 'yml':
        return <Settings className="w-5 h-5 text-amber-500" />;
      case 'json':
        return <FileJson className="w-5 h-5 text-violet-500" />;
      default:
        return <FileText className="w-5 h-5 text-zinc-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-left pb-16">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import / Export Hub</h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Seamlessly backup, migrate, download, and batch-upload documents and prompt guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Export Card */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-2 mb-3 text-violet-500">
              <Download className="w-5 h-5" />
              <h3 className="font-bold text-lg">Backup & Export Vault</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
              Compile your entire self-hosted vault, preserving your nested virtual directory tree and customized prompts, into universal formats.
            </p>

            <div className="space-y-3">
              {/* ZIP export */}
              <button
                onClick={handleExportZIP}
                disabled={loading}
                className={`w-full p-4 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-4 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-150 hover:bg-zinc-100'
                }`}
              >
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0 mt-0.5">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Export complete database as ZIP</h4>
                  <span className="text-[10px] text-zinc-400 block mt-1 leading-relaxed">
                    Packages markdowns into virtual directories and prompts as raw JSON. Perfect for server migrations.
                  </span>
                </div>
              </button>

              {/* JSON export */}
              <button
                onClick={handleExportJSON}
                disabled={loading}
                className={`w-full p-4 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-4 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-150 hover:bg-zinc-100'
                }`}
              >
                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500 shrink-0 mt-0.5">
                  <FileJson className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Backup as raw JSON file</h4>
                  <span className="text-[10px] text-zinc-400 block mt-1 leading-relaxed">
                    Exports active state models directly into a unified JSON database payload.
                  </span>
                </div>
              </button>

              {/* CSV export */}
              <button
                onClick={handleExportCSV}
                disabled={loading}
                className={`w-full p-4 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-4 ${
                  isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900' : 'bg-zinc-50 border-zinc-150 hover:bg-zinc-100'
                }`}
              >
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Download Prompts as CSV Sheet</h4>
                  <span className="text-[10px] text-zinc-400 block mt-1 leading-relaxed">
                    Export prompt templates to a standard tabular format compatible with Microsoft Excel or Google Sheets.
                  </span>
                </div>
              </button>

              {/* Codebase ZIP export */}
              <button
                onClick={handleExportSourceCodeZIP}
                className="w-full p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-left text-xs font-semibold cursor-pointer transition-all flex items-start gap-4"
              >
                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500 shrink-0 mt-0.5 animate-pulse">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-blue-400">Download Project Source Code (.ZIP)</h4>
                  <span className="text-[10px] text-zinc-400 block mt-1 leading-relaxed">
                    ดาวน์โหลดซอร์สโค้ดของโปรเจกต์ทั้งหมดเป็นไฟล์ .ZIP เพื่อใช้สำหรับอัปโหลดขึ้น GitHub ด้วยตนเอง หรือเป็นไฟล์สำรองข้อมูล (Backup)
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Import Database Archive Card */}
        <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm flex flex-col justify-between`}>
          <div>
            <div className="flex items-center gap-2 mb-3 text-violet-500">
              <Upload className="w-5 h-5" />
              <h3 className="font-bold text-lg">Load & Restore database</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
              Restore the full prompt-vault database structure from a previous JSON export or zip archive. This restores complete histories.
            </p>

            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all min-h-[180px] flex flex-col justify-center items-center relative ${
                dragActive 
                  ? 'border-violet-500 bg-violet-500/5' 
                  : isDark ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/40' : 'border-zinc-200 hover:border-zinc-350 bg-zinc-50/50'
              }`}
            >
              <input
                id="file-upload-input"
                type="file"
                className="hidden"
                accept=".zip,.json"
                onChange={handleFileChange}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer space-y-3">
                <div className={`mx-auto p-3.5 rounded-full inline-flex ${isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-500'} border dark:border-zinc-800 shadow-sm`}>
                  <CloudUpload className="w-6 h-6 text-violet-500" />
                </div>
                <div className="text-xs">
                  <span className="font-bold text-violet-500 hover:underline">Click to upload backups</span> or drag and drop
                </div>
                <p className="text-[10px] text-zinc-400">
                  Accepts Database backups (<code className="font-mono text-[9px]">.json</code>) or Markdowns ZIP archive (<code className="font-mono text-[9px]">.zip</code>)
                </p>
              </label>
            </div>
          </div>

          {/* Feedback Messages */}
          <div className="mt-4">
            {successMsg && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <p className="font-semibold">{successMsg}</p>
              </div>
            )}
            {errorMsg && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <p className="font-semibold">{errorMsg}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-Way Cloud Synchronization Engine */}
      <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm space-y-6`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4 dark:border-zinc-850">
          <div>
            <div className="flex items-center gap-2 text-violet-500 mb-1">
              <CloudLightning className="w-5 h-5" />
              <h3 className="font-bold text-lg">Two-Way Cloud & Offline Synchronization</h3>
            </div>
            <p className="text-xs text-zinc-500 max-w-3xl leading-relaxed">
              Maintain a seamless, two-way bridge between client state and cloud database. When offline, edits are stored in your secure queue. Select a conflict strategy and push to update the cloud, or pull down cloud changes to refresh your offline vault.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={handleRefreshSync}
              className={`p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
              }`}
              title="Refresh queue status"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              onClick={handleClearSyncQueue}
              className={`p-2 px-3 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/5 text-xs font-semibold cursor-pointer transition-all`}
            >
              Clear Queue
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sync Controls Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">Conflict Strategy</label>
              <select
                value={conflictStrategy}
                onChange={(e: any) => setConflictStrategy(e.target.value)}
                className={`w-full p-2.5 rounded-xl border text-xs focus:ring-1 focus:ring-violet-500 focus:border-violet-500 outline-none ${
                  isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-200' : 'bg-zinc-50 border-zinc-200 text-zinc-850'
                }`}
              >
                <option value="latest_wins">⚡ Latest Write Wins (Timestamp Comparison)</option>
                <option value="local_wins">💻 Local Wins (Override Cloud)</option>
                <option value="cloud_wins">☁️ Cloud Wins (Preserve Cloud)</option>
              </select>
              <p className="text-[10px] text-zinc-400">
                In case of parallel edits, the selected policy dictates which record is chosen.
              </p>
            </div>

            <div className="pt-2 grid grid-cols-2 gap-3">
              <button
                onClick={handlePushToCloud}
                disabled={syncingCloud}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 active:scale-98 cursor-pointer disabled:opacity-50 transition-all flex justify-center items-center gap-2"
              >
                <CloudUpload className="w-4 h-4" />
                Push to Cloud
              </button>
              <button
                onClick={handlePullFromCloud}
                disabled={syncingCloud}
                className={`w-full py-3 px-4 rounded-xl text-xs font-bold border cursor-pointer disabled:opacity-50 transition-all flex justify-center items-center gap-2 ${
                  isDark ? 'border-zinc-800 hover:bg-zinc-850 text-zinc-200' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                }`}
              >
                <CloudDownload className="w-4 h-4 text-emerald-500" />
                Pull from Cloud
              </button>
            </div>

            {/* Simulated Offline Workload Creator */}
            <div className={`p-4 rounded-xl border space-y-2.5 ${isDark ? 'bg-zinc-950/40 border-zinc-850' : 'bg-zinc-50/50 border-zinc-200'}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400">
                <ListTodo className="w-4 h-4 text-violet-400" />
                <span>Simulate Offline Operations</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Add mock records to the pending queue to verify batched synchronization and conflict detection processes:
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleSimulateOfflinePrompt}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                    isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                  }`}
                >
                  + Mock Prompt
                </button>
                <button
                  onClick={handleSimulateOfflineDoc}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border ${
                    isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                  }`}
                >
                  + Mock Document
                </button>
              </div>
            </div>
          </div>

          {/* Sync Logs and Queue Items List */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            <div className={`border rounded-xl p-4 flex-1 flex flex-col min-h-[190px] ${isDark ? 'bg-zinc-950/20 border-zinc-850' : 'bg-zinc-50/20 border-zinc-200'}`}>
              <div className="flex items-center justify-between pb-2 border-b dark:border-zinc-850 mb-3">
                <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                  Queue Length: 
                  <span className="px-1.5 py-0.5 rounded-full text-[11px] font-mono bg-violet-600/10 text-violet-500">
                    {syncQueue.length}
                  </span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Last Synced: {syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime).toLocaleTimeString() : 'Never'}
                </span>
              </div>

              {syncQueue.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <Check className="w-8 h-8 text-emerald-500 p-1.5 rounded-full bg-emerald-500/10 mb-2" />
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">All Changes Fully Synced</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Your browser is 100% in-sync with Supabase Cloud.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[160px] space-y-2 pr-1 custom-scrollbar">
                  {syncQueue.map((item, index) => (
                    <div 
                      key={index}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        isDark ? 'bg-zinc-900/40 border-zinc-850 hover:bg-zinc-900/60' : 'bg-white border-zinc-150 hover:bg-zinc-50/50'
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-bold shrink-0 ${
                          item.action === 'insert' 
                            ? 'bg-emerald-500/10 text-emerald-500' 
                            : item.action === 'update' 
                              ? 'bg-amber-500/10 text-amber-500' 
                              : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {item.action}
                        </span>
                        <div className="truncate">
                          <p className="font-bold truncate text-zinc-800 dark:text-zinc-200">
                            {item.type === 'prompt' ? item.data.title : item.data.path}
                          </p>
                          <p className="text-[9px] text-zinc-400 font-mono mt-0.5">
                            ID: {item.id} • {new Date(item.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      {item.retryCount > 0 && (
                        <div className="flex items-center gap-1.5 text-rose-500 shrink-0">
                          <ShieldAlert className="w-3.5 h-3.5" title={item.lastError} />
                          <span className="text-[9px] font-mono font-bold">Failed (x{item.retryCount})</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Progress Bar */}
            {(syncingCloud || syncMsg) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400 font-semibold">{syncMsg}</span>
                  {syncingCloud && <span className="text-violet-500 font-bold">{syncPercent}%</span>}
                </div>
                {syncingCloud && (
                  <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-300"
                      style={{ width: `${syncPercent}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sync Summary Details expander */}
        {syncSummary && (
          <div className={`p-4 rounded-xl border text-xs space-y-2 ${
            syncSummary.success 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
              : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
          }`}>
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <Check className="w-4.5 h-4.5" />
                Synchronization Summary Log ({syncSummary.success ? 'Success' : 'Warning/Error'})
              </span>
              <button 
                onClick={() => setSyncSummary(null)}
                className="text-[10px] font-bold text-zinc-400 hover:text-zinc-500 uppercase tracking-widest cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-2 border-y dark:border-zinc-800 text-zinc-500 dark:text-zinc-300">
              <div>Prompts Synced: <strong className="text-zinc-800 dark:text-zinc-100">{syncSummary.syncedPrompts}</strong></div>
              <div>Documents Synced: <strong className="text-zinc-800 dark:text-zinc-100">{syncSummary.syncedDocs}</strong></div>
              <div>Failed Attempts: <strong className={syncSummary.failedCount > 0 ? "text-rose-500" : "text-zinc-800 dark:text-zinc-100"}>{syncSummary.failedCount}</strong></div>
              <div>Conflicts Skipped: <strong className="text-zinc-800 dark:text-zinc-100">{syncSummary.skippedCount}</strong></div>
            </div>
            <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1 text-[11px] font-mono leading-relaxed text-zinc-600 dark:text-zinc-300">
              {syncSummary.details.map((detail, idx) => (
                <div key={idx} className="flex items-start gap-1">
                  <span className="text-zinc-400 shrink-0">•</span>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cloud Sync & Migration Hub */}
      <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-violet-500 mb-1">
              <CloudUpload className="w-5 h-5" />
              <h3 className="font-bold text-lg">Migrate Local Database to Supabase</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-2xl">
              Are you logged in with your Supabase account but still have offline/local mock-up records? 
              This utility scans your server's local file database (<code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[10px]">vault_db.json</code>) 
              and pushes any missing prompt templates and markdown documents to your secure Supabase cloud storage. 
              Duplicate titles or file paths are automatically filtered out to avoid cloud clutter.
            </p>
          </div>
          <button
            onClick={handleMigrateLocalData}
            disabled={migrating}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-95 active:scale-98 transition-all shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-2`}
          >
            {migrating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Migrating Vault...
              </>
            ) : (
              <>
                <CloudUpload className="w-4.5 h-4.5" />
                Migrate Local Data
              </>
            )}
          </button>
        </div>

        {/* Feedback indicators */}
        <div className="mt-4">
          {migrationSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Migration Succeeded!</p>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{migrationSuccess}</p>
              </div>
            </div>
          )}
          {migrationError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Migration Warning / Failure</p>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-300">{migrationError}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW SECTION: Direct Multi-Format File Importer */}
      <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'} shadow-sm`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-500 mb-1">
              <Upload className="w-5 h-5" />
              <h3 className="font-bold text-lg">Direct Multi-Format File Importer</h3>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Upload individual code files, technical summaries, handbooks or guidelines. Supports Markdown, XML, YAML, JSON, TXT, CSV, and more.
            </p>
          </div>
          {pendingFiles.length > 0 && (
            <button
              onClick={handleClearAllPending}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${
                isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
              }`}
            >
              Clear List
            </button>
          )}
        </div>

        {/* Drag & Drop Zone for Direct files */}
        <div
          onDragEnter={handleDirectDrag}
          onDragOver={handleDirectDrag}
          onDragLeave={handleDirectDrag}
          onDrop={handleDirectDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col justify-center items-center relative ${
            directDragActive 
              ? 'border-emerald-500 bg-emerald-500/5' 
              : isDark ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/20' : 'border-zinc-200 hover:border-zinc-350 bg-zinc-50/30'
          }`}
        >
          <input
            id="direct-file-upload-input"
            type="file"
            className="hidden"
            accept=".md,.xml,.yaml,.yml,.txt,.json,.csv"
            multiple
            onChange={handleDirectFileChange}
          />
          <label htmlFor="direct-file-upload-input" className="cursor-pointer space-y-3 w-full">
            <div className={`mx-auto p-3.5 rounded-full inline-flex ${isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-500'} border dark:border-zinc-800 shadow-sm`}>
              <Plus className="w-6 h-6 text-emerald-500" />
            </div>
            <div className="text-xs">
              <span className="font-bold text-emerald-500 hover:underline">Click to select files</span> or drag and drop multiple items
            </div>
            <p className="text-[10px] text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Accepts documents like <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px] text-emerald-500 font-bold">.md</code>,{' '}
              <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px] text-blue-500 font-bold">.xml</code>,{' '}
              <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px] text-amber-500 font-bold">.yaml</code> / <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px] text-amber-500 font-bold">.yml</code>,{' '}
              <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px]">.txt</code>,{' '}
              <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px]">.json</code>, or <code className="font-mono bg-zinc-500/10 px-1 py-0.5 rounded text-[9px]">.csv</code>.
            </p>
          </label>
        </div>

        {/* List of Pending Files to configure and Import */}
        {pendingFiles.length > 0 && (
          <div className="mt-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Files Queue ({pendingFiles.length})
              </span>
              <span className="text-xs text-zinc-500">Configure parameters before processing</span>
            </div>

            <div className={`divide-y ${isDark ? 'divide-zinc-800 border-zinc-800 bg-zinc-950/20' : 'divide-zinc-100 border-zinc-100 bg-zinc-50/20'} border rounded-xl overflow-hidden`}>
              {pendingFiles.map((file) => (
                <div key={file.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Info and file type selector */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="mt-1 shrink-0">{getFileIcon(file.extension)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-xs truncate" title={file.name}>
                          {file.name}
                        </h4>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                          ({formatSize(file.size)})
                        </span>
                      </div>
                      
                      {/* Configuration Controls */}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 items-center text-xs">
                        {/* Import category selector */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-500 text-[10px]">Import as:</span>
                          <select
                            value={file.importAs}
                            onChange={(e) => handleUpdatePendingType(file.id, e.target.value as 'markdown' | 'prompt')}
                            className={`text-xs px-2 py-1 rounded border font-semibold ${
                              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                            }`}
                          >
                            <option value="markdown">Markdown Doc</option>
                            <option value="prompt">Prompt Template</option>
                          </select>
                        </div>

                        {/* Conditional Configuration based on Import Type */}
                        {file.importAs === 'markdown' ? (
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-zinc-500 text-[10px] shrink-0">Path in library:</span>
                            <input
                              type="text"
                              value={file.targetPath}
                              onChange={(e) => handleUpdatePendingPath(file.id, e.target.value)}
                              className={`text-xs px-2 py-1 rounded border w-full max-w-[240px] font-mono ${
                                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                              }`}
                              placeholder="e.g. guides/context.md"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500 text-[10px]">Category:</span>
                              <input
                                type="text"
                                value={file.promptCategory}
                                onChange={(e) => handleUpdatePendingCategory(file.id, e.target.value)}
                                className={`text-xs px-2 py-1 rounded border w-24 ${
                                  isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                                }`}
                                placeholder="Category"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500 text-[10px]">Platform:</span>
                              <select
                                value={file.promptPlatform}
                                onChange={(e) => handleUpdatePendingPlatform(file.id, e.target.value)}
                                className={`text-xs px-2 py-1 rounded border ${
                                  isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'
                                }`}
                              >
                                <option value="Gemini">Gemini</option>
                                <option value="Claude">Claude</option>
                                <option value="ChatGPT">ChatGPT</option>
                                <option value="Cursor">Cursor</option>
                                <option value="Windsurf">Windsurf</option>
                                <option value="Copilot">Copilot</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => handleOpenPreview(file)}
                      title="Preview content"
                      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center ${
                        isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRemovePendingFile(file.id)}
                      title="Remove file"
                      className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-center text-red-500 ${
                        isDark ? 'border-zinc-800 hover:bg-red-500/10' : 'border-zinc-200 hover:bg-red-500/5'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Submit block */}
            <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-2">
              <button
                onClick={handleImportPendingFiles}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 transition-all text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <Check className="w-4.5 h-4.5" />
                )}
                Process & Import {pendingFiles.length} File{pendingFiles.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Feedback for File Importer */}
        <div className="mt-4">
          {directSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <p className="font-semibold">{directSuccess}</p>
            </div>
          )}
          {directError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <p className="font-semibold">{directError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Code / Content Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all">
          <div className={`w-full max-w-3xl rounded-2xl border flex flex-col max-h-[85vh] ${
            isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
          } shadow-2xl`}>
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between shrink-0 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                {getFileIcon(previewFile.extension)}
                <div>
                  <h3 className="font-bold text-sm truncate max-w-sm sm:max-w-md">{previewFile.name}</h3>
                  <p className="text-[10px] text-zinc-500">Edit content before executing the import action</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className={`p-1.5 rounded-lg border ${
                  isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-400' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Editor */}
            <div className="p-4 overflow-y-auto flex-1">
              <textarea
                value={previewContent}
                onChange={(e) => setPreviewContent(e.target.value)}
                className={`w-full h-96 p-4 rounded-xl border font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-hidden resize-y ${
                  isDark 
                    ? 'bg-zinc-900/50 border-zinc-800 text-zinc-100' 
                    : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}
                placeholder="File contents..."
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex items-center justify-end gap-2 shrink-0 dark:border-zinc-800">
              <button
                onClick={() => setPreviewFile(null)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer border ${
                  isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                }`}
              >
                Discard
              </button>
              <button
                onClick={handleSavePreview}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 cursor-pointer active:scale-98 transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
