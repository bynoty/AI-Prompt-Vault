import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  FileCode, 
  Settings, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Eye, 
  RefreshCw, 
  Plus, 
  Database, 
  Check 
} from 'lucide-react';
import { MarkdownDoc } from '../types';

interface MarkdownUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDoc: (d: Partial<MarkdownDoc>) => Promise<MarkdownDoc>;
  onIndexRag: () => Promise<any>;
  isDark: boolean;
}

interface UploadingFile {
  id: string;
  name: string;
  size: number;
  content: string;
  extension: string;
  targetPath: string;
}

export default function MarkdownUploadModal({ 
  isOpen, 
  onClose, 
  onAddDoc, 
  onIndexRag, 
  isDark 
}: MarkdownUploadModalProps) {
  const [pendingFiles, setPendingFiles] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'uploading' | 'indexing' | 'success'>('setup');
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewFile, setPreviewFile] = useState<UploadingFile | null>(null);
  const [previewContent, setPreviewContent] = useState('');

  if (!isOpen) return null;

  // Drag & Drop Handlers
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
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    setErrorMsg('');
    Array.from(files).forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const allowedExtensions = ['md', 'xml', 'yaml', 'yml', 'txt', 'json'];
      
      if (!allowedExtensions.includes(ext)) {
        setErrorMsg(`Unsupported file type: .${ext}. Only .md, .xml, .yaml, .yml, .txt, .json are supported.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || '';
        
        // Generate a default path inside the library directory
        const cleanName = file.name.replace(/\s+/g, '_');
        const defaultPath = `uploaded/${cleanName}`;

        const newFile: UploadingFile = {
          id: `uf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          size: file.size,
          content: text,
          extension: ext,
          targetPath: defaultPath
        };

        setPendingFiles(prev => [...prev, newFile]);
      };
      reader.readAsText(file);
    });
  };

  const handleRemoveFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdatePath = (id: string, newPath: string) => {
    setPendingFiles(prev => prev.map(f => f.id === id ? { ...f, targetPath: newPath } : f));
  };

  const handleOpenPreview = (file: UploadingFile) => {
    setPreviewFile(file);
    setPreviewContent(file.content);
  };

  const handleSavePreview = () => {
    if (previewFile) {
      setPendingFiles(prev => prev.map(f => f.id === previewFile.id ? { ...f, content: previewContent } : f));
      setPreviewFile(null);
    }
  };

  const handleUploadAndIndex = async () => {
    if (pendingFiles.length === 0) return;
    setLoading(true);
    setErrorMsg('');
    setStep('uploading');
    setProgressMsg('Uploading your files to the system catalog...');

    try {
      // 1. Upload files sequentially
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        setProgressMsg(`Uploading [${i + 1}/${pendingFiles.length}] ${file.name}...`);
        
        // Clean target path formatting
        let cleanPath = file.targetPath.trim();
        if (cleanPath.startsWith('/')) {
          cleanPath = cleanPath.substring(1);
        }
        if (!cleanPath) {
          cleanPath = file.name;
        }

        // Title derived from path or name
        const filename = cleanPath.split('/').pop() || file.name;
        const title = filename
          .replace(/\.[^/.]+$/, "")
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');

        // Call the parent add handler which makes the POST api/markdowns call
        await onAddDoc({
          path: cleanPath,
          title: title,
          content: file.content
        });
      }

      // 2. Re-indexing RAG on backend
      setStep('indexing');
      setProgressMsg('Executing backend RAG indexing. Generating vector embeddings for search optimization...');
      await onIndexRag();

      // 3. Complete
      setStep('success');
      setProgressMsg(`Successfully imported and indexed ${pendingFiles.length} document(s).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'File upload or indexing failed. Please verify configurations and try again.');
      setStep('setup');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPendingFiles([]);
    setStep('setup');
    setProgressMsg('');
    setErrorMsg('');
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (ext: string) => {
    switch (ext) {
      case 'md':
        return <FileText className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'xml':
        return <FileCode className="w-5 h-5 text-blue-500 shrink-0" />;
      case 'yaml':
      case 'yml':
        return <Settings className="w-5 h-5 text-amber-500 shrink-0" />;
      default:
        return <FileText className="w-5 h-5 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden ${
        isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
      }`}>
        
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="font-bold text-sm">Direct Importer & RAG Indexer</h3>
              <p className="text-[10px] text-zinc-500">Upload documents and synchronize AI Knowledge instantly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className={`p-1.5 rounded-lg border transition-colors ${
              isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-400' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Steps Renderer */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {step === 'setup' && (
            <div className="space-y-4">
              {/* Drag & Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col justify-center items-center ${
                  dragActive 
                    ? 'border-emerald-500 bg-emerald-500/5' 
                    : isDark ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/20' : 'border-zinc-200 hover:border-zinc-350 bg-zinc-50/50'
                }`}
              >
                <input
                  id="modal-file-upload-input"
                  type="file"
                  className="hidden"
                  accept=".md,.xml,.yaml,.yml,.txt,.json"
                  multiple
                  onChange={handleFileChange}
                />
                <label htmlFor="modal-file-upload-input" className="cursor-pointer space-y-3 w-full">
                  <div className={`mx-auto p-3 rounded-full inline-flex ${isDark ? 'bg-zinc-900 text-zinc-400' : 'bg-white text-zinc-500'} border dark:border-zinc-800 shadow-sm`}>
                    <Upload className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-emerald-500 hover:underline">Click to select files</span> or drag & drop documents here
                  </div>
                  <p className="text-[10px] text-zinc-400 max-w-md mx-auto leading-relaxed">
                    Supports <code className="font-mono bg-emerald-500/10 px-1 py-0.5 rounded text-[9px] text-emerald-500 font-bold">.md</code>,{' '}
                    <code className="font-mono bg-blue-500/10 px-1 py-0.5 rounded text-[9px] text-blue-500 font-bold">.xml</code>,{' '}
                    <code className="font-mono bg-amber-500/10 px-1 py-0.5 rounded text-[9px] text-amber-500 font-bold">.yaml</code>, yml, txt, or json.
                  </p>
                </label>
              </div>

              {/* Error Warning */}
              {errorMsg && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <p className="font-semibold">{errorMsg}</p>
                </div>
              )}

              {/* Pending Queue List */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    <span>Selected Files ({pendingFiles.length})</span>
                    <span>Virtual Library Path</span>
                  </div>

                  <div className={`divide-y rounded-xl border ${isDark ? 'divide-zinc-800 border-zinc-800 bg-zinc-950/20' : 'divide-zinc-150 border-zinc-200 bg-zinc-50/20'} max-h-[300px] overflow-y-auto`}>
                    {pendingFiles.map((file) => (
                      <div key={file.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                        {/* Title and Icon */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {getFileIcon(file.extension)}
                          <div className="min-w-0">
                            <p className="font-semibold truncate" title={file.name}>{file.name}</p>
                            <span className="text-[9px] text-zinc-400 font-mono">({formatSize(file.size)})</span>
                          </div>
                        </div>

                        {/* Editable Target Path */}
                        <div className="w-44 sm:w-64">
                          <input
                            type="text"
                            value={file.targetPath}
                            onChange={(e) => handleUpdatePath(file.id, e.target.value)}
                            className={`w-full px-2 py-1 rounded border text-[11px] font-mono outline-hidden focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 ${
                              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-800'
                            }`}
                            placeholder="uploaded/path.md"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleOpenPreview(file)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800'
                            }`}
                            title="Edit file content"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveFile(file.id)}
                            className={`p-1.5 rounded-lg border text-red-500 transition-all ${
                              isDark ? 'border-zinc-800 hover:bg-red-500/10' : 'border-zinc-200 hover:bg-red-500/5'
                            }`}
                            title="Remove file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading steps processing screen */}
          {(step === 'uploading' || step === 'indexing') && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database className="w-6 h-6 text-emerald-500 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm">
                  {step === 'uploading' ? 'Publishing documents...' : 'Optimizing RAG Intelligence...'}
                </h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed font-medium">
                  {progressMsg}
                </p>
              </div>

              {/* Progress Flow visualization */}
              <div className="flex items-center gap-3 text-xs font-semibold text-zinc-500">
                <span className={step === 'uploading' ? 'text-emerald-500 font-bold' : 'text-zinc-400'}>
                  1. Multi-file upload
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">➔</span>
                <span className={step === 'indexing' ? 'text-emerald-500 font-bold' : 'text-zinc-400'}>
                  2. Vector RAG Re-indexing
                </span>
              </div>
            </div>
          )}

          {/* Success Step Screen */}
          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6 animate-fade-in">
              <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-lg">System Synchronized Successfully!</h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                  {progressMsg} The AI Assistant now has access to the updated context and system handbooks.
                </p>
              </div>

              <button
                onClick={handleReset}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-white text-xs cursor-pointer shadow-sm active:scale-98 transition-all"
              >
                Upload more files
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        {step === 'setup' && (
          <div className={`p-4 border-t flex items-center justify-end gap-2 shrink-0 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border ${
                isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleUploadAndIndex}
              disabled={pendingFiles.length === 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold text-white text-xs cursor-pointer shadow-sm active:scale-98 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              Upload & Re-index
            </button>
          </div>
        )}

      </div>

      {/* Embedded File Editor/Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-xl border flex flex-col max-h-[80vh] shadow-2xl ${
            isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
          }`}>
            <div className="p-4 border-b flex items-center justify-between dark:border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                {getFileIcon(previewFile.extension)}
                <div>
                  <h4 className="font-bold text-xs truncate max-w-sm">{previewFile.name}</h4>
                  <p className="text-[10px] text-zinc-500">Edit or review file content before committing</p>
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

            <div className="p-4 overflow-y-auto flex-1">
              <textarea
                value={previewContent}
                onChange={(e) => setPreviewContent(e.target.value)}
                className={`w-full h-80 p-4 rounded-xl border font-mono text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-hidden resize-none ${
                  isDark 
                    ? 'bg-zinc-900/50 border-zinc-800 text-zinc-100 font-medium' 
                    : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}
                placeholder="Content is empty..."
              />
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2 dark:border-zinc-800 shrink-0">
              <button
                onClick={() => setPreviewFile(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border ${
                  isDark ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreview}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 cursor-pointer active:scale-98 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
