import React, { useState, useRef } from 'react';
import { 
  Upload, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ChevronDown, 
  Play 
} from 'lucide-react';
import { MarkdownDoc } from '../../types';

interface FileUploaderProps {
  onAddDoc: (d: Partial<MarkdownDoc>) => Promise<MarkdownDoc>;
  onIndexRag: () => Promise<any>;
  isDark: boolean;
  className?: string;
  compact?: boolean;
}

interface FileProgress {
  name: string;
  status: 'idle' | 'uploading' | 'indexing' | 'success' | 'error';
  error?: string;
}

export default function FileUploader({ onAddDoc, onIndexRag, isDark, className = '', compact = false }: FileUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressList, setProgressList] = useState<FileProgress[]>([]);
  const [generalStatus, setGeneralStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allowed text extensions
  const ALLOWED_EXTENSIONS = ['md', 'xml', 'yaml', 'yml', 'txt', 'json'];

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const processFiles = async (files: FileList) => {
    setLoading(true);
    setGeneralStatus('Processing and uploading files...');
    const filesToUpload = Array.from(files);
    
    // Initialize progress tracking
    const initialProgress: FileProgress[] = filesToUpload.map(f => ({
      name: f.name,
      status: 'idle'
    }));
    setProgressList(initialProgress);

    let successCount = 0;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      // Update progress status to uploading
      updateProgress(file.name, 'uploading');

      // Validation
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        updateProgress(file.name, 'error', `Unsupported file type: .${ext}`);
        continue;
      }

      try {
        const text = await readFileAsText(file);
        
        // Construct paths for cataloging
        const cleanName = file.name.replace(/\s+/g, '_');
        const cleanPath = `uploaded/${cleanName}`;

        // Generate Human-friendly title
        const title = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Save to Database
        await onAddDoc({
          path: cleanPath,
          title: title,
          content: text
        });

        updateProgress(file.name, 'indexing');
        successCount++;
      } catch (err: any) {
        updateProgress(file.name, 'error', err.message || 'Failed to save document');
      }
    }

    if (successCount > 0) {
      try {
        setGeneralStatus('Invoking system RAG indexing pipeline...');
        await onIndexRag();
        
        // Mark all non-errored files as fully synchronized
        setProgressList(prev => prev.map(p => 
          p.status === 'indexing' ? { ...p, status: 'success' } : p
        ));
        setGeneralStatus(`Successfully synchronized ${successCount} files!`);
      } catch (err: any) {
        setGeneralStatus('Files uploaded but RAG indexing failed.');
        setProgressList(prev => prev.map(p => 
          p.status === 'indexing' ? { ...p, status: 'error', error: 'RAG Re-indexing failed' } : p
        ));
      }
    } else {
      setGeneralStatus('No files were successfully uploaded.');
    }

    setLoading(false);
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve((event.target?.result as string) || '');
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  const updateProgress = (name: string, status: FileProgress['status'], error?: string) => {
    setProgressList(prev => prev.map(p => 
      p.name === name ? { ...p, status, error } : p
    ));
  };

  const clearQueue = () => {
    setProgressList([]);
    setGeneralStatus('');
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      {compact ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
            isOpen 
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500 dark:text-emerald-400' 
              : isDark 
                ? 'bg-transparent border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/40' 
                : 'bg-white border-zinc-200 text-zinc-500 hover:text-emerald-600 hover:border-emerald-500/40'
          }`}
          title="Direct RAG Uploader"
        >
          <Upload className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
            isOpen 
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400' 
              : isDark 
                ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 text-zinc-300' 
                : 'bg-white border-zinc-200 hover:border-zinc-300 text-zinc-700'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Direct Uploader</span>
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Expandable Dropdown Uploader Panel */}
      {isOpen && (
        <div className={`absolute ${compact ? 'right-[-120px] md:right-[-140px]' : 'right-0'} mt-2 w-80 rounded-2xl border shadow-xl z-50 p-4 transition-all ${
          isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
        }`}>
          
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b dark:border-zinc-800">
            <span className="text-xs font-bold tracking-tight">Rapid RAG Importer</span>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-zinc-500 hover:bg-zinc-500/10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[110px] ${
              dragActive 
                ? 'border-emerald-500 bg-emerald-500/5' 
                : isDark ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/10' : 'border-zinc-200 hover:border-zinc-350 bg-zinc-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".md,.xml,.yaml,.yml,.txt,.json"
              multiple
              onChange={handleFileChange}
            />
            <Upload className="w-5 h-5 text-emerald-500 mb-1.5" />
            <p className="text-[11px] font-bold">Drag files here or Browse</p>
            <p className="text-[9px] text-zinc-400 mt-1">.md, .xml, .yaml, .txt, .json</p>
          </div>

          {/* Progress / Feedback Overlay List */}
          {progressList.length > 0 && (
            <div className="mt-4 space-y-3">
              {/* General Status message */}
              {generalStatus && (
                <div className={`p-2 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 ${
                  generalStatus.includes('Successfully') 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                    : isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-50 text-zinc-600'
                }`}>
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className="truncate">{generalStatus}</span>
                </div>
              )}

              {/* Individual files status */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y dark:divide-zinc-900">
                {progressList.map((prog, idx) => (
                  <div key={idx} className="pt-1.5 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate font-medium text-zinc-500 dark:text-zinc-400" title={prog.name}>
                        {prog.name}
                      </span>
                    </div>

                    <div className="shrink-0 font-bold">
                      {prog.status === 'idle' && (
                        <span className="text-zinc-400">Pending</span>
                      )}
                      {prog.status === 'uploading' && (
                        <span className="text-blue-500 flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Uploading
                        </span>
                      )}
                      {prog.status === 'indexing' && (
                        <span className="text-amber-500 flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Indexing
                        </span>
                      )}
                      {prog.status === 'success' && (
                        <span className="text-emerald-500 flex items-center gap-0.5">
                          Synced
                        </span>
                      )}
                      {prog.status === 'error' && (
                        <span className="text-red-500" title={prog.error}>Error</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!loading && (
                <button
                  onClick={clearQueue}
                  className="w-full py-1 text-[10px] text-zinc-500 hover:text-zinc-300 font-bold transition-all"
                >
                  Clear Queue History
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
