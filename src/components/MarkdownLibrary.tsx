import React, { useState, useEffect } from 'react';
import { MarkdownDoc, FolderNode } from '../types';
import { Folder, File, Plus, Star, Copy, Check, Eye, Edit, ChevronDown, ChevronRight, FileText, ArrowLeft, Trash2, Layout, BookOpen, Save, Upload, Table, Grid, FolderPlus, Search, ArrowUpDown, X, CheckSquare, Square, Download, Archive, Sparkles, Clock } from 'lucide-react';
import mermaid from 'mermaid';
import MarkdownUploadModal from './MarkdownUploadModal';
import FileUploader from './ui/FileUploader';
import { saveDraft, getDraft, deleteDraft } from '../draftDb';

interface MarkdownLibraryProps {
  docs: MarkdownDoc[];
  onAddDoc: (d: Partial<MarkdownDoc>) => Promise<MarkdownDoc>;
  onUpdateDoc: (id: string, updates: Partial<MarkdownDoc>) => Promise<MarkdownDoc>;
  onDeleteDoc: (id: string) => Promise<void>;
  isDark: boolean;
  selectedDocId?: string | null;
  onIndexRag?: () => Promise<any>;
}

// Sub-component to render Mermaid diagrams
const MermaidDiagram = ({ code, id, isDark }: { code: string; id: string; isDark: boolean; key?: string }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    });
  }, [isDark]);

  useEffect(() => {
    let active = true;
    const renderDiagram = async () => {
      try {
        setError('');
        const cleanCode = code.trim();
        // Remove markdown tags if any
        const lines = cleanCode.split('\n').filter(line => !line.trim().startsWith('```'));
        const finalCode = lines.join('\n');

        // Render diagram
        const uniqueId = `mermaid-${id}-${Math.floor(Math.random() * 100000)}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, finalCode);
        
        if (active) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        // Clear global error cache of mermaid to prevent freeze
        const badElement = document.getElementById(`d${id}`);
        if (badElement) badElement.remove();
        
        if (active) {
          setError(err.message || "Failed to render Mermaid diagram.");
        }
      }
    };
    
    renderDiagram();
    return () => {
      active = false;
    };
  }, [code, id, isDark]);

  if (error) {
    return (
      <div className="p-3.5 my-3 rounded-xl border border-red-500/25 bg-red-500/5 text-red-500 font-mono text-xs">
        <p className="font-semibold mb-1">Mermaid Render Error:</p>
        <pre className="whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto">{error}</pre>
      </div>
    );
  }
  if (!svg) {
    return <div className="text-xs text-zinc-500 font-mono py-4 text-center animate-pulse">Rendering diagram...</div>;
  }
  return (
    <div 
      dangerouslySetInnerHTML={{ __html: svg }} 
      className="my-5 overflow-x-auto flex justify-center bg-zinc-50/50 dark:bg-zinc-900/40 p-5 rounded-2xl border" 
    />
  );
};

// Simple Markdown Parser to avoid bulky external dependencies that crash in iFrames
const CustomMarkdownRenderer = ({ markdown, isDark }: { markdown: string; isDark: boolean }) => {
  const renderInline = (text: string) => {
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    const splitParts = text.split(regex);

    return splitParts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-extrabold text-zinc-900 dark:text-zinc-50">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index} className="italic text-zinc-800 dark:text-zinc-200">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={index} className="px-1.5 py-0.5 mx-0.5 rounded font-mono text-xs bg-zinc-100 dark:bg-zinc-800 text-violet-600 dark:text-violet-400 font-bold">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    let inCodeBlock = false;
    let codeBlockLanguage = '';
    let codeBlockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code Block Toggles
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const blockContent = codeBlockContent.join('\n');
          
          if (codeBlockLanguage.toLowerCase() === 'mermaid') {
            elements.push(<MermaidDiagram key={`m_${key++}`} code={blockContent} id={`m_${i}`} isDark={isDark} />);
          } else {
            elements.push(
              <pre key={`c_${key++}`} className="p-4 my-3 text-xs font-mono rounded-xl border overflow-x-auto bg-zinc-950 text-zinc-100 border-zinc-850">
                <code>{blockContent}</code>
              </pre>
            );
          }
          codeBlockContent = [];
        } else {
          inCodeBlock = true;
          codeBlockLanguage = line.replace('```', '').trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(<h1 key={key++} className="text-2xl font-extrabold tracking-tight mt-6 mb-3 text-zinc-900 dark:text-white border-b pb-1 dark:border-zinc-800">{renderInline(line.replace('# ', ''))}</h1>);
        continue;
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={key++} className="text-xl font-bold tracking-tight mt-5 mb-2.5 text-zinc-900 dark:text-zinc-100">{renderInline(line.replace('## ', ''))}</h2>);
        continue;
      }
      if (line.startsWith('### ')) {
        elements.push(<h3 key={key++} className="text-base font-semibold tracking-tight mt-4 mb-2 text-zinc-800 dark:text-zinc-200">{renderInline(line.replace('### ', ''))}</h3>);
        continue;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={key++} className="pl-4 border-l-4 border-violet-500 italic my-3 text-zinc-500 dark:text-zinc-400 text-sm">
            {renderInline(line.substring(2))}
          </blockquote>
        );
        continue;
      }

      // Lists (Unordered)
      if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={key++} className="ml-5 list-disc text-sm leading-relaxed my-1.5 text-zinc-700 dark:text-zinc-300">
            {renderInline(line.substring(2))}
          </li>
        );
        continue;
      }

      // Ordered Lists
      const olMatch = line.match(/^(\d+)\.\s(.*)/);
      if (olMatch) {
        const content = olMatch[2];
        elements.push(
          <li key={key++} className="ml-5 list-decimal text-sm leading-relaxed my-1.5 text-zinc-700 dark:text-zinc-300">
            {renderInline(content)}
          </li>
        );
        continue;
      }

      // Empty Lines
      if (!line.trim()) {
        elements.push(<div key={key++} className="h-2" />);
        continue;
      }

      // Tables Parsing (Simple)
      if (line.startsWith('|') && lines[i + 1]?.startsWith('| ---')) {
        const headers = line.split('|').map(h => h.trim()).filter(h => h.length > 0);
        const rows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].startsWith('|') && !lines[j].startsWith('| ---')) {
          rows.push(lines[j].split('|').map(r => r.trim()).filter(r => r.length > 0));
          j++;
        }
        i = j - 1; // skip processed table rows

        elements.push(
          <div key={key++} className="overflow-x-auto my-4 border rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-950 font-semibold border-b dark:border-zinc-800">
                  {headers.map((h, hIdx) => <th key={hIdx} className="p-3 border-r last:border-0 dark:border-zinc-850">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b last:border-0 dark:border-zinc-850 dark:hover:bg-zinc-900/40">
                    {row.map((cell, cIdx) => <td key={cIdx} className="p-3 border-r last:border-0 dark:border-zinc-850 font-medium text-zinc-600 dark:text-zinc-300">{renderInline(cell)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Default Paragraph
      elements.push(
        <p key={key++} className="text-sm leading-relaxed my-2 text-zinc-700 dark:text-zinc-300">
          {renderInline(line)}
        </p>
      );
    }

    return elements;
  };

  return <div className="space-y-1">{parseMarkdown(markdown)}</div>;
};

export default function MarkdownLibrary({
  docs,
  onAddDoc,
  onUpdateDoc,
  onDeleteDoc,
  isDark,
  selectedDocId,
  onIndexRag
}: MarkdownLibraryProps) {
  
  // Master Explorer State
  const [selectedDoc, setSelectedDoc] = useState<MarkdownDoc | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({ 'root': true });
  const [explorerSortBy, setExplorerSortBy] = useState<'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc' | 'favorites'>('name_asc');
  const [explorerSearchTerm, setExplorerSearchTerm] = useState('');

  // Drag & Drop State
  const [draggedItem, setDraggedItem] = useState<{ type: 'file' | 'directory'; idOrPath: string; name: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Manual Move State
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingDoc, setMovingDoc] = useState<MarkdownDoc | null>(null);
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [movingFolder, setMovingFolder] = useState<{ path: string; name: string } | null>(null);
  const [targetFolder, setTargetFolder] = useState('root');
  const [customTargetFolder, setCustomTargetFolder] = useState('');
  const [isCustomFolder, setIsCustomFolder] = useState(false);

  // Creation panel
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [newFileTagsString, setNewFileTagsString] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Editor Workspace state
  const [editorContent, setEditorContent] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [editorTagsString, setEditorTagsString] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Drafts & Autosave States
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const [detectedDraft, setDetectedDraft] = useState<any | null>(null);

  // Content Analysis Suggestion State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<{
    category: string;
    tags: string[];
    summary: string;
    keywords: string[];
    source: 'llm' | 'heuristic';
  } | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);

  // Tag filters state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Multi-select / Bulk Operations States
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [bulkActionType, setBulkActionType] = useState<'tag_add' | 'tag_remove' | 'move_folder' | 'none'>('none');
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkFolderSelect, setBulkFolderSelect] = useState('root');

  const handleBulkDelete = async () => {
    if (selectedDocIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedDocIds.length} selected markdown files?`)) {
      for (const id of selectedDocIds) {
        await onDeleteDoc(id);
      }
      setSelectedDocIds([]);
      setSelectedDoc(null);
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedDocIds.length === 0) return;
    for (const id of selectedDocIds) {
      const d = docs.find(item => item.id === id);
      if (d) {
        // Extract original folder and file name
        const lastSlash = d.path.lastIndexOf('/');
        const folder = lastSlash === -1 ? '' : d.path.substring(0, lastSlash + 1);
        const fileName = lastSlash === -1 ? d.path : d.path.substring(lastSlash + 1);
        
        // Remove .md extension for duplicate suffix if any
        const extIndex = fileName.lastIndexOf('.');
        const namePart = extIndex === -1 ? fileName : fileName.substring(0, extIndex);
        const extPart = extIndex === -1 ? '.md' : fileName.substring(extIndex);
        
        const newPath = `${folder}Copy_${namePart}${extPart}`;
        
        await onAddDoc({
          path: newPath,
          title: `${d.title} Copy`,
          content: d.content,
          isFavorite: d.isFavorite,
          tags: d.tags
        });
      }
    }
    setSelectedDocIds([]);
  };

  const handleBulkArchive = async () => {
    if (selectedDocIds.length === 0) return;
    if (confirm(`Archive ${selectedDocIds.length} selected files? (This will move them to an "archive/" folder and add #archived tag)`)) {
      for (const id of selectedDocIds) {
        const d = docs.find(item => item.id === id);
        if (d) {
          const lastSlash = d.path.lastIndexOf('/');
          const fileName = lastSlash === -1 ? d.path : d.path.substring(lastSlash + 1);
          const newPath = `archive/${fileName}`;
          
          const currentTags = d.tags || [];
          const updatedTags = currentTags.includes('archived') ? currentTags : [...currentTags, 'archived'];
          
          await onUpdateDoc(id, {
            path: newPath,
            tags: updatedTags
          });
        }
      }
      setSelectedDocIds([]);
    }
  };

  const handleBulkExport = () => {
    if (selectedDocIds.length === 0) return;
    const selectedList = docs.filter(d => selectedDocIds.includes(d.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedList, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `markdowns_bulk_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setSelectedDocIds([]);
  };

  const handleBulkActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDocIds.length === 0) return;

    try {
      if (bulkActionType === 'tag_add') {
        const tagsToAdd = bulkInputText.split(',').map(t => t.trim()).filter(t => t.length > 0);
        for (const id of selectedDocIds) {
          const d = docs.find(item => item.id === id);
          if (d) {
            const currentTags = d.tags || [];
            const newTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
            await onUpdateDoc(id, { tags: newTags });
          }
        }
      } else if (bulkActionType === 'tag_remove') {
        const tagsToRemove = bulkInputText.split(',').map(t => t.trim()).filter(t => t.length > 0);
        for (const id of selectedDocIds) {
          const d = docs.find(item => item.id === id);
          if (d) {
            const currentTags = d.tags || [];
            const newTags = currentTags.filter(t => !tagsToRemove.includes(t));
            await onUpdateDoc(id, { tags: newTags });
          }
        }
      } else if (bulkActionType === 'move_folder') {
        const dest = bulkFolderSelect.trim();
        for (const id of selectedDocIds) {
          const d = docs.find(item => item.id === id);
          if (d) {
            const lastSlash = d.path.lastIndexOf('/');
            const fileName = lastSlash === -1 ? d.path : d.path.substring(lastSlash + 1);
            const newPath = dest === 'root' ? fileName : `${dest}/${fileName}`;
            await onUpdateDoc(id, { path: newPath });
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSelectedDocIds([]);
      setBulkActionType('none');
      setBulkInputText('');
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Table Generator states
  const [showTableGenerator, setShowTableGenerator] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  // Folder creation states
  const [showCreateFolderForm, setShowCreateFolderForm] = useState(false);
  const [folderParent, setFolderParent] = useState('root');
  const [newFolderName, setNewFolderName] = useState('');
  const [folderErrorMsg, setFolderErrorMsg] = useState('');

  const getExistingFolders = (documents: MarkdownDoc[]): string[] => {
    const foldersSet = new Set<string>();
    documents.forEach(doc => {
      const parts = doc.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        foldersSet.add(parts.slice(0, i).join('/'));
      }
    });
    return Array.from(foldersSet).sort();
  };

  const calculateReadingTime = (content: string): string => {
    if (!content) return '1 min read';
    const cleanContent = content.trim();
    if (!cleanContent) return '1 min read';
    const wordCount = cleanContent.split(/\s+/).filter(w => w.length > 0).length;
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min read`;
  };

  const handleBreadcrumbFolderClick = (folderPath: string) => {
    const pathsToExpand = { ...expandedFolders };
    const parts = folderPath.split('/');
    for (let i = 1; i <= parts.length; i++) {
      pathsToExpand[parts.slice(0, i).join('/')] = true;
    }
    setExpandedFolders(pathsToExpand);
    
    const readme = docs.find(d => d.path === `${folderPath}/README.md` || d.path === `${folderPath}/index.md`);
    if (readme) {
      selectDocument(readme);
      return;
    }
    
    const directChild = docs.find(d => d.path.startsWith(`${folderPath}/`));
    if (directChild) {
      selectDocument(directChild);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFolderErrorMsg('');
    const trimmedFolder = newFolderName.trim();
    if (!trimmedFolder) return;

    if (trimmedFolder.includes('/') || trimmedFolder.includes('\\')) {
      setFolderErrorMsg('Folder name cannot contain slashes.');
      return;
    }

    let folderPath = '';
    if (folderParent === 'root') {
      folderPath = `${trimmedFolder}/README.md`;
    } else {
      folderPath = `${folderParent}/${trimmedFolder}/README.md`;
    }

    const folderTitle = trimmedFolder.charAt(0).toUpperCase() + trimmedFolder.slice(1);

    try {
      const added = await onAddDoc({
        path: folderPath,
        title: `${folderTitle} README`,
        content: `# ${folderTitle}\n\nWelcome to the ${folderTitle} sub-folder. Start cataloging documents here!`
      });
      selectDocument(added);
      setNewFolderName('');
      setFolderParent('root');
      setShowCreateFolderForm(false);
      
      // Auto-expand parent folders in file explorer
      const pathsToExpand: Record<string, boolean> = { ...expandedFolders };
      if (folderParent !== 'root') {
        const parts = folderParent.split('/');
        for (let i = 1; i <= parts.length; i++) {
          pathsToExpand[parts.slice(0, i).join('/')] = true;
        }
      }
      pathsToExpand[folderParent === 'root' ? trimmedFolder : `${folderParent}/${trimmedFolder}`] = true;
      setExpandedFolders(pathsToExpand);
    } catch (err: any) {
      setFolderErrorMsg(err.message || 'Folder or README already exists.');
    }
  };

  const insertText = (before: string, after: string) => {
    const textarea = document.getElementById('markdown-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const selText = textarea.value.substring(startPos, endPos);

    const replacement = before + selText + after;
    const newVal = textarea.value.substring(0, startPos) + replacement + textarea.value.substring(endPos);
    setEditorContent(newVal);

    // Re-focus and set selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos + before.length, startPos + before.length + selText.length);
    }, 0);
  };

  const handleInsertTable = () => {
    // Generate Markdown table representation
    let md = '\n';
    // Headers Row
    md += '|';
    for (let c = 0; c < tableCols; c++) {
      md += ` Header ${c + 1} |`;
    }
    md += '\n|';
    // Separators Row
    for (let c = 0; c < tableCols; c++) {
      md += ' --- |';
    }
    md += '\n';
    // Data Rows
    for (let r = 0; r < tableRows; r++) {
      md += '|';
      for (let c = 0; c < tableCols; c++) {
        md += ` Cell R${r + 1}C${c + 1} |`;
      }
      md += '\n';
    }
    md += '\n';

    insertText(md, '');
    setShowTableGenerator(false);
  };

  // Sync selection
  useEffect(() => {
    if (selectedDocId) {
      const d = docs.find(dc => dc.id === selectedDocId);
      if (d) {
        setSelectedDoc(d);
        setEditorContent(d.content);
        setEditorTitle(d.title);
        setEditorTagsString(d.tags ? d.tags.join(', ') : '');
        setShowCreateForm(false);
        setShowCreateFolderForm(false);
        setAnalysisResults(null);
        setShowAnalysisPanel(false);
      }
    } else if (docs.length > 0 && !selectedDoc) {
      setSelectedDoc(docs[0]);
      setEditorContent(docs[0].content);
      setEditorTitle(docs[0].title);
      setEditorTagsString(docs[0].tags ? docs[0].tags.join(', ') : '');
      setAnalysisResults(null);
      setShowAnalysisPanel(false);
    }
  }, [selectedDocId, docs]);

  // Handle doc clicks
  const selectDocument = (doc: MarkdownDoc) => {
    setSelectedDoc(doc);
    setEditorContent(doc.content);
    setEditorTitle(doc.title);
    setEditorTagsString(doc.tags ? doc.tags.join(', ') : '');
    setShowCreateForm(false);
    setShowCreateFolderForm(false);
    setAnalysisResults(null);
    setShowAnalysisPanel(false);
  };

  // Load draft if exists
  useEffect(() => {
    let active = true;
    const checkDraft = async () => {
      setDetectedDraft(null);
      setDraftSavedAt('');
      
      if (showCreateForm) {
        const draft = await getDraft('markdown_new');
        if (active && draft && (draft.content || draft.title || draft.tagsString)) {
          setDetectedDraft(draft);
        }
      } else if (selectedDoc) {
        const draft = await getDraft('markdown_' + selectedDoc.id);
        if (active && draft) {
          // Only show restore option if draft has different content/title/tags than current saved doc
          const isDifferent = 
            draft.content !== selectedDoc.content || 
            draft.title !== selectedDoc.title || 
            (draft.tagsString || '') !== (selectedDoc.tags ? selectedDoc.tags.join(', ') : '');
          if (isDifferent) {
            setDetectedDraft(draft);
          }
        }
      }
    };
    checkDraft();
    return () => {
      active = false;
    };
  }, [selectedDoc, showCreateForm]);

  // Periodic / Debounced Autosave
  useEffect(() => {
    let timeoutId: any;
    
    if (showCreateForm) {
      const hasUnsavedChanges = newFileContent || newFilePath || newFileTagsString;
      if (hasUnsavedChanges) {
        timeoutId = setTimeout(async () => {
          await saveDraft('markdown_new', {
            type: 'markdown',
            targetId: 'new',
            title: newFilePath,
            content: newFileContent,
            tagsString: newFileTagsString
          });
          setDraftSavedAt(new Date().toLocaleTimeString());
        }, 3000); // Autosave after 3 seconds of inactivity
      }
    } else if (selectedDoc) {
      const isDifferent = 
        editorContent !== selectedDoc.content || 
        editorTitle !== selectedDoc.title || 
        editorTagsString !== (selectedDoc.tags ? selectedDoc.tags.join(', ') : '');
        
      if (isDifferent) {
        timeoutId = setTimeout(async () => {
          await saveDraft('markdown_' + selectedDoc.id, {
            type: 'markdown',
            targetId: selectedDoc.id,
            title: editorTitle,
            content: editorContent,
            tagsString: editorTagsString
          });
          setDraftSavedAt(new Date().toLocaleTimeString());
        }, 3000); // Autosave after 3 seconds of inactivity
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    showCreateForm, 
    newFileContent, 
    newFilePath, 
    newFileTagsString, 
    selectedDoc, 
    editorContent, 
    editorTitle, 
    editorTagsString
  ]);

  // Build recursive directory tree
  const buildDirectoryTree = (documents: MarkdownDoc[]): FolderNode => {
    const root: FolderNode = { name: 'root', path: 'root', type: 'directory', children: [] };

    documents.forEach(doc => {
      const parts = doc.path.split('/');
      let current = root;

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const currentPath = parts.slice(0, index + 1).join('/');

        if (isLast) {
          // File node
          current.children?.push({
            name: part,
            path: doc.id, // we store docId in path to quickly identify
            type: 'file'
          });
        } else {
          // Directory node
          let dir = current.children?.find(c => c.type === 'directory' && c.name === part);
          if (!dir) {
            dir = { name: part, path: currentPath, type: 'directory', children: [] };
            current.children?.push(dir);
          }
          current = dir;
        }
      });
    });

    return root;
  };

  // Recursively sort directories and files in tree nodes
  const sortTreeNodes = (node: FolderNode): FolderNode => {
    if (!node.children || node.children.length === 0) return node;

    // First, recursively sort all children nodes
    const sortedChildren = node.children.map(child => sortTreeNodes(child));

    // Then, sort the current level children
    sortedChildren.sort((a, b) => {
      // 1. Separate directories and files: directories always come first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }

      // 2. If both are directories, we sort them by name (A-Z or Z-A)
      if (a.type === 'directory') {
        const comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return explorerSortBy === 'name_desc' ? -comparison : comparison;
      }

      // 3. Both are files: we sort them based on the selected explorerSortBy option
      const fileA = docs.find(d => d.id === a.path);
      const fileB = docs.find(d => d.id === b.path);

      if (!fileA || !fileB) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }

      switch (explorerSortBy) {
        case 'name_desc':
          return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
        case 'updated_desc': {
          const timeA = new Date(fileA.updatedAt || 0).getTime();
          const timeB = new Date(fileB.updatedAt || 0).getTime();
          return timeB - timeA;
        }
        case 'updated_asc': {
          const timeA = new Date(fileA.updatedAt || 0).getTime();
          const timeB = new Date(fileB.updatedAt || 0).getTime();
          return timeA - timeB;
        }
        case 'favorites': {
          // Favorites first
          if (fileA.isFavorite !== fileB.isFavorite) {
            return fileA.isFavorite ? -1 : 1;
          }
          // If both have same favorite status, sort by name ascending
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        case 'name_asc':
        default:
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
    });

    return {
      ...node,
      children: sortedChildren
    };
  };

  // Build the tree with filtered documents and sorted nodes
  const filteredDocs = docs.filter(doc => {
    const matchesSearch = !explorerSearchTerm.trim() || (() => {
      const term = explorerSearchTerm.toLowerCase();
      return (
        doc.path.toLowerCase().includes(term) ||
        doc.title.toLowerCase().includes(term) ||
        doc.content.toLowerCase().includes(term) ||
        (doc.tags && doc.tags.some(t => t.toLowerCase().includes(term)))
      );
    })();

    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => doc.tags && doc.tags.includes(tag));

    return matchesSearch && matchesTags;
  });

  const allDocTags = Array.from(
    new Set(docs.flatMap(d => d.tags || []).map(t => t.trim()).filter(t => t.length > 0))
  ).sort();

  const rawTree = buildDirectoryTree(filteredDocs);
  const tree = sortTreeNodes(rawTree);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newFilePath) return;

    // Must end with .md
    let finalPath = newFilePath.trim();
    if (!finalPath.endsWith('.md')) {
      finalPath += '.md';
    }

    const tags = newFileTagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    try {
      const added = await onAddDoc({
        path: finalPath,
        title: pathTitle(finalPath),
        content: newFileContent || `# ${pathTitle(finalPath)}\n\nStart writing here...`,
        tags
      });
      await deleteDraft('markdown_new');
      setDraftSavedAt('');
      setDetectedDraft(null);
      selectDocument(added);
      setNewFilePath('');
      setNewFileContent('');
      setNewFileTagsString('');
      setShowCreateForm(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'File path already exists or invalid.');
    }
  };

  const pathTitle = (p: string) => {
    const parts = p.split('/');
    const last = parts[parts.length - 1];
    return last.replace('.md', '');
  };

  const handleSaveDoc = async () => {
    if (!selectedDoc) return;
    setSaving(true);
    const tags = editorTagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
    try {
      const updated = await onUpdateDoc(selectedDoc.id, {
        content: editorContent,
        title: editorTitle,
        tags
      });
      await deleteDraft('markdown_' + selectedDoc.id);
      setDraftSavedAt('');
      setDetectedDraft(null);
      setSelectedDoc(updated);
    } catch (err) {
      alert('Failed to save file.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDoc = () => {
    if (!selectedDoc) return;
    setShowDeleteConfirm(true);
  };

  const handleMoveNode = async (
    item: { type: 'file' | 'directory'; idOrPath: string; name: string },
    targetFolderPath: string
  ) => {
    // If target is same as source, do nothing
    if (item.idOrPath === targetFolderPath) return;

    // Prevent dropping parent folder into its child folders
    if (item.type === 'directory' && (
      targetFolderPath === item.idOrPath || 
      targetFolderPath.startsWith(item.idOrPath + '/')
    )) {
      return;
    }

    setIsMoving(true);
    try {
      if (item.type === 'file') {
        // Move file
        const fileDoc = docs.find(d => d.id === item.idOrPath);
        if (fileDoc) {
          const newPath = targetFolderPath === 'root'
            ? item.name
            : `${targetFolderPath}/${item.name}`;

          // Avoid duplicate path conflicts
          const pathExists = docs.some(d => d.id !== fileDoc.id && d.path.toLowerCase() === newPath.toLowerCase());
          if (pathExists) {
            alert(`A document already exists at the target path: ${newPath}`);
            setIsMoving(false);
            return;
          }

          const updated = await onUpdateDoc(fileDoc.id, { path: newPath });
          if (selectedDoc?.id === fileDoc.id) {
            setSelectedDoc(updated);
          }
        }
      } else if (item.type === 'directory') {
        // Move directory (all files with prefix "item.idOrPath/")
        const prefix = item.idOrPath + '/';
        const docsInFolder = docs.filter(d => d.path === item.idOrPath || d.path.startsWith(prefix));

        if (docsInFolder.length > 0) {
          // Prepare new paths for each doc and check for conflicts
          const updates = docsInFolder.map(doc => {
            let relativePath = '';
            if (doc.path.startsWith(prefix)) {
              relativePath = doc.path.substring(prefix.length - 1); // keep leading slash, e.g. "/README.md"
            }
            
            const newPath = targetFolderPath === 'root'
              ? `${item.name}${relativePath}`
              : `${targetFolderPath}/${item.name}${relativePath}`;
            
            return { doc, newPath };
          });

          // Check for conflicts across all docs
          const conflicts = updates.filter(({ doc, newPath }) => 
            docs.some(d => d.id !== doc.id && d.path.toLowerCase() === newPath.toLowerCase())
          );

          if (conflicts.length > 0) {
            alert(`Could not move folder. Some files inside would conflict with existing files (e.g. ${conflicts[0].newPath}).`);
            setIsMoving(false);
            return;
          }

          // Execute updates in parallel
          await Promise.all(updates.map(({ doc, newPath }) => onUpdateDoc(doc.id, { path: newPath })));
          
          // Update selected doc ref if it was moved
          const currentSelectedMoved = updates.find(({ doc }) => doc.id === selectedDoc?.id);
          if (currentSelectedMoved) {
            const latestSelected = docs.find(d => d.id === selectedDoc?.id);
            if (latestSelected) {
              setSelectedDoc({
                ...latestSelected,
                path: currentSelectedMoved.newPath
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to move document/folder.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleManualMoveDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDoc) return;

    let finalFolder = isCustomFolder ? customTargetFolder.trim() : targetFolder;
    if (finalFolder === '/' || finalFolder.toLowerCase() === 'root') {
      finalFolder = 'root';
    }

    if (finalFolder !== 'root') {
      finalFolder = finalFolder.replace(/^\/+|\/+$/g, '');
    }

    if (!finalFolder) {
      alert('Please specify a valid folder path.');
      return;
    }

    const fileName = movingDoc.path.split('/').pop() || 'untitled.md';
    const newPath = finalFolder === 'root' ? fileName : `${finalFolder}/${fileName}`;

    if (newPath === movingDoc.path) {
      setShowMoveModal(false);
      return;
    }

    const conflictExists = docs.some(d => d.id !== movingDoc.id && d.path.toLowerCase() === newPath.toLowerCase());
    if (conflictExists) {
      alert(`A document already exists at the destination path: "${newPath}"`);
      return;
    }

    setIsMoving(true);
    try {
      const updated = await onUpdateDoc(movingDoc.id, { path: newPath });
      if (selectedDoc?.id === movingDoc.id) {
        setSelectedDoc(updated);
      }
      setShowMoveModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to move document.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleManualMoveFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingFolder) return;

    let finalFolder = isCustomFolder ? customTargetFolder.trim() : targetFolder;
    if (finalFolder === '/' || finalFolder.toLowerCase() === 'root') {
      finalFolder = 'root';
    }

    if (finalFolder !== 'root') {
      finalFolder = finalFolder.replace(/^\/+|\/+$/g, '');
    }

    if (!finalFolder) {
      alert('Please specify a valid folder path.');
      return;
    }

    if (finalFolder === movingFolder.path || finalFolder.startsWith(movingFolder.path + '/')) {
      alert('Cannot move a folder inside itself or its sub-folders.');
      return;
    }

    const folderName = movingFolder.name;
    const prefix = movingFolder.path + '/';
    const docsInFolder = docs.filter(d => d.path === movingFolder.path || d.path.startsWith(prefix));

    if (docsInFolder.length === 0) {
      setShowMoveFolderModal(false);
      return;
    }

    setIsMoving(true);
    try {
      const updates = docsInFolder.map(doc => {
        let relativePath = '';
        if (doc.path.startsWith(prefix)) {
          relativePath = doc.path.substring(prefix.length - 1);
        }
        
        const newPath = finalFolder === 'root'
          ? `${folderName}${relativePath}`
          : `${finalFolder}/${folderName}${relativePath}`;
        
        return { doc, newPath };
      });

      const conflicts = updates.filter(({ doc, newPath }) => 
        docs.some(d => d.id !== doc.id && d.path.toLowerCase() === newPath.toLowerCase())
      );

      if (conflicts.length > 0) {
        alert(`Could not move folder. Some files inside would conflict with existing files (e.g. ${conflicts[0].newPath}).`);
        setIsMoving(false);
        return;
      }

      await Promise.all(updates.map(({ doc, newPath }) => onUpdateDoc(doc.id, { path: newPath })));
      
      const currentSelectedMoved = updates.find(({ doc }) => doc.id === selectedDoc?.id);
      if (currentSelectedMoved) {
        const latestSelected = docs.find(d => d.id === selectedDoc?.id);
        if (latestSelected) {
          setSelectedDoc({
            ...latestSelected,
            path: currentSelectedMoved.newPath
          });
        }
      }

      setShowMoveFolderModal(false);
    } catch (err: any) {
      alert(err.message || 'Failed to move folder.');
    } finally {
      setIsMoving(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!selectedDoc) return;
    const updated = await onUpdateDoc(selectedDoc.id, {
      isFavorite: !selectedDoc.isFavorite
    });
    setSelectedDoc(updated);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(editorContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAnalyzeContent = async () => {
    if (!selectedDoc) return;
    setIsAnalyzing(true);
    setAnalysisResults(null);
    setShowAnalysisPanel(true);
    try {
      const response = await fetch('/api/markdowns/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: editorContent,
          title: editorTitle,
          path: selectedDoc.path,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch content suggestions');
      }

      const data = await response.json();
      setAnalysisResults(data);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error running content analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applySuggestedCategory = async () => {
    if (!selectedDoc || !analysisResults) return;
    const category = analysisResults.category.trim();
    if (!category) return;

    // Remove leading/trailing slashes and make standard name
    const cleanCategory = category.replace(/^\/+|\/+$/g, '');
    const fileName = selectedDoc.path.split('/').pop() || 'untitled.md';
    const newPath = cleanCategory === '' || cleanCategory.toLowerCase() === 'root' || cleanCategory.toLowerCase() === 'general'
      ? fileName
      : `${cleanCategory}/${fileName}`;

    if (newPath === selectedDoc.path) {
      alert('Document is already in this category.');
      return;
    }

    const conflictExists = docs.some(d => d.id !== selectedDoc.id && d.path.toLowerCase() === newPath.toLowerCase());
    if (conflictExists) {
      alert(`A document already exists at the suggested path: "${newPath}"`);
      return;
    }

    try {
      const updated = await onUpdateDoc(selectedDoc.id, { path: newPath });
      setSelectedDoc(updated);
      alert(`Document moved to category "${category}"!`);
    } catch (err: any) {
      alert(err.message || 'Failed to apply suggested category.');
    }
  };

  const applySuggestedTags = () => {
    if (!analysisResults) return;
    const currentTags = editorTagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const newTags = Array.from(new Set([...currentTags, ...analysisResults.tags]));
    setEditorTagsString(newTags.join(', '));
  };

  const insertSummaryAtTop = () => {
    if (!analysisResults) return;
    const summaryText = `> **Summary:** ${analysisResults.summary}\n\n`;
    
    // Insert after the first header line or at the very top
    const lines = editorContent.split('\n');
    let insertIndex = 0;
    if (lines[0] && lines[0].trim().startsWith('#')) {
      insertIndex = 1;
    }
    
    lines.splice(insertIndex, 0, summaryText);
    setEditorContent(lines.join('\n'));
  };

  const insertKeywordsAtBottom = () => {
    if (!analysisResults) return;
    const keywordsText = `\n\n---\n**Keywords:** *${analysisResults.keywords.join(', ')}*\n`;
    setEditorContent(prev => prev + keywordsText);
  };

  // Recursively render folder tree
  const renderTree = (node: FolderNode, depth: number = 0) => {
    return (
      <div key={node.path} style={{ paddingLeft: depth > 0 ? '12px' : '0px' }}>
        {node.children?.map(child => {
          if (child.type === 'directory') {
            const isExpanded = !!expandedFolders[child.path];
            return (
              <div key={child.path} className="space-y-0.5">
                <div 
                  draggable={true}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedItem({
                      type: 'directory',
                      idOrPath: child.path,
                      name: child.name
                    });
                  }}
                  onDragEnd={() => {
                    setDraggedItem(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedItem && (
                      draggedItem.idOrPath === child.path ||
                      child.path.startsWith(draggedItem.idOrPath + '/')
                    )) {
                      return;
                    }
                    setDragOverFolder(child.path);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOverFolder(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverFolder(null);
                    if (!draggedItem) return;
                    await handleMoveNode(draggedItem, child.path);
                  }}
                  className={`group flex items-center justify-between w-full rounded-lg transition-all ${
                    dragOverFolder === child.path
                      ? 'bg-violet-500/10 border border-dashed border-violet-500/50'
                      : 'hover:bg-zinc-800/20 dark:hover:bg-zinc-850/30'
                  }`}
                >
                  <button
                    onClick={() => toggleFolder(child.path)}
                    className={`flex-1 flex items-center gap-2 py-1.5 px-2 text-xs font-semibold cursor-pointer text-left transition-colors ${
                      isDark ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-violet-500" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-400" />}
                    <Folder className="w-3.5 h-3.5 text-violet-500 shrink-0 fill-violet-500/10" />
                    <span className="truncate">{child.name}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center gap-1 pr-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFolderParent(child.path);
                        setShowCreateFolderForm(true);
                        setSelectedDoc(null);
                        setShowCreateForm(false);
                      }}
                      className="p-1 rounded hover:bg-violet-600 hover:text-white transition-all text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      title={`Create sub-folder inside ${child.name}`}
                    >
                      <FolderPlus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewFilePath(`${child.path}/`);
                        setShowCreateForm(true);
                        setSelectedDoc(null);
                        setShowCreateFolderForm(false);
                      }}
                      className="p-1 rounded hover:bg-violet-600 hover:text-white transition-all text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      title={`Create document inside ${child.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingFolder({ path: child.path, name: child.name });
                        setTargetFolder('root');
                        setCustomTargetFolder('');
                        setIsCustomFolder(false);
                        setShowMoveFolderModal(true);
                      }}
                      className="p-1 rounded hover:bg-violet-600 hover:text-white transition-all text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      title={`Move folder "${child.name}" to another folder`}
                    >
                      <Folder className="w-3 h-3 text-violet-500" />
                    </button>
                  </div>
                </div>
                {isExpanded && renderTree(child, depth + 1)}
              </div>
            );
          } else {
            // Find file
            const fileDoc = docs.find(d => d.id === child.path);
            const isSelected = selectedDoc?.id === fileDoc?.id;
            return (
              <div
                key={child.path}
                className={`group/file w-full flex items-center justify-between py-1 px-2 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? isDark 
                      ? 'bg-zinc-850/80 border border-zinc-800 text-violet-400' 
                      : 'bg-violet-50 border border-violet-100 text-violet-700'
                    : isDark ? 'hover:bg-zinc-800/10 text-zinc-300' : 'hover:bg-zinc-100/60 text-zinc-700'
                }`}
              >
                <div className="flex-1 flex items-start gap-1.5 min-w-0 py-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fileDoc) {
                        setSelectedDocIds(prev =>
                          prev.includes(fileDoc.id) ? prev.filter(id => id !== fileDoc.id) : [...prev, fileDoc.id]
                        );
                      }
                    }}
                    className="p-0.5 rounded hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors shrink-0 text-zinc-400 hover:text-violet-500 cursor-pointer mt-0.5"
                  >
                    {fileDoc && selectedDocIds.includes(fileDoc.id) ? (
                      <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 group-hover/file:text-zinc-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileDoc && selectDocument(fileDoc)}
                    className="flex-1 flex flex-col min-w-0 cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-violet-500' : 'text-zinc-400'}`} />
                        <span className="truncate">{child.name}</span>
                      </div>
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0 ml-1 select-none">
                        {calculateReadingTime(fileDoc?.content || '')}
                      </span>
                    </div>
                    {fileDoc?.tags && fileDoc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5 ml-5">
                        {fileDoc.tags.slice(0, 3).map(t => (
                          <span key={t} className="text-[8px] font-mono opacity-60 bg-zinc-500/10 px-1 rounded">
                            #{t}
                          </span>
                        ))}
                        {fileDoc.tags.length > 3 && <span className="text-[8px] font-mono opacity-60">...</span>}
                      </div>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {fileDoc?.isFavorite && <Star className="w-3 h-3 fill-amber-500 text-amber-500" />}
                  {fileDoc && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingDoc(fileDoc);
                        setTargetFolder('root');
                        setCustomTargetFolder('');
                        setIsCustomFolder(false);
                        setShowMoveModal(true);
                      }}
                      className="opacity-0 group-hover/file:opacity-100 p-1 rounded hover:bg-violet-600 hover:text-white transition-all text-zinc-500 dark:text-zinc-400 cursor-pointer"
                      title={`Move ${child.name} to another folder`}
                    >
                      <Folder className="w-3 h-3 text-violet-500 group-hover/file:text-white transition-colors" />
                    </button>
                  )}
                </div>
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-130px)] animate-fade-in">
      
      {/* File Explorer Sidebar (3 cols) */}
      <div className={`lg:col-span-3 flex flex-col h-full border rounded-2xl ${
        isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
      } shadow-sm`}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <h2 className="font-bold text-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-500" />
            File Explorer
          </h2>
          <div className="flex items-center gap-1.5">
            <FileUploader
              onAddDoc={onAddDoc}
              onIndexRag={onIndexRag || (async () => {})}
              isDark={isDark}
              compact={true}
            />
            <button
              onClick={() => {
                setFolderParent('root');
                setShowCreateFolderForm(true);
                setSelectedDoc(null);
                setShowCreateForm(false);
              }}
              className="p-1.5 rounded-lg border text-zinc-500 hover:text-violet-500 hover:border-violet-500/40 cursor-pointer transition-colors"
              title="Create new folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setShowCreateForm(true);
                setSelectedDoc(null);
                setShowCreateFolderForm(false);
              }}
              className="p-1.5 rounded-lg border text-zinc-500 hover:text-violet-500 hover:border-violet-500/40 cursor-pointer transition-colors"
              title="Create new markdown document"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className={`px-4 py-3 border-b flex flex-col gap-2.5 ${isDark ? 'border-zinc-800/60 bg-zinc-950/15' : 'border-zinc-100 bg-zinc-50/40'}`}>
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={explorerSearchTerm}
              onChange={(e) => setExplorerSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-8 py-1.5 text-xs rounded-xl outline-none border transition-all ${
                isDark 
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200 focus:border-violet-500/50 focus:bg-zinc-950' 
                  : 'bg-white border-zinc-200 text-zinc-800 focus:border-violet-500/50'
              }`}
            />
            {explorerSearchTerm && (
              <button
                type="button"
                onClick={() => setExplorerSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Sort Select Row */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-violet-500" /> Sort By
            </span>
            <select
              value={explorerSortBy}
              onChange={(e: any) => setExplorerSortBy(e.target.value)}
              className={`text-xs px-2 py-1 rounded-lg border outline-none cursor-pointer transition-all ${
                isDark 
                  ? 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-700 focus:border-violet-500/50' 
                  : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300 focus:border-violet-500/50'
              }`}
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="updated_desc">Recently Updated</option>
              <option value="updated_asc">Oldest Updated</option>
              <option value="favorites">Favorites First</option>
            </select>
          </div>

          {/* Selected Tags list */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1.5 pt-1.5 border-t dark:border-zinc-850 border-zinc-150 mt-1">
              {selectedTags.map(tag => (
                <span 
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 cursor-pointer font-medium font-mono"
                >
                  #{tag}
                  <X className="w-2.5 h-2.5 text-violet-400 hover:text-white" />
                </span>
              ))}
              <button 
                type="button" 
                onClick={() => setSelectedTags([])}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 underline cursor-pointer ml-auto"
              >
                Clear all
              </button>
            </div>
          )}

          {/* All Document Tags Cloud */}
          {allDocTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 border-t dark:border-zinc-850 border-zinc-150 pt-2 text-[10px] scrollbar-thin shrink-0">
              <span className="text-zinc-500 shrink-0 font-semibold uppercase tracking-wider text-[9px] font-mono">Tags:</span>
              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                {allDocTags.map(tag => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagFilter(tag)}
                      className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer text-[9px] font-mono ${
                        isSelected 
                          ? 'bg-violet-600 border-violet-500 text-white font-bold' 
                          : isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Multi-select control bar */}
          <div className="flex items-center justify-between pt-2 border-t dark:border-zinc-850 border-zinc-150 text-[10px] mt-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (selectedDocIds.length === filteredDocs.length) {
                  setSelectedDocIds([]);
                } else {
                  setSelectedDocIds(filteredDocs.map(d => d.id));
                }
              }}
              className="text-zinc-500 dark:text-zinc-400 hover:text-violet-500 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {selectedDocIds.length === filteredDocs.length && filteredDocs.length > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span>{selectedDocIds.length > 0 ? `Selected ${selectedDocIds.length}` : 'Select All'}</span>
            </button>
            {selectedDocIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDocIds([])}
                className="text-red-500 hover:underline text-[9px]"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedDocIds.length > 0 && (() => {
          const allFolders = getExistingFolders(docs);
          return (
            <div className="bg-violet-600/10 border-b border-violet-500/20 p-2.5 space-y-2 shrink-0 animate-fade-in text-[11px]">
              <div className="flex flex-col gap-1 font-bold text-violet-400">
                <span>Bulk Action ({selectedDocIds.length} files selected):</span>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={handleBulkDuplicate}
                    className="px-1.5 py-0.5 bg-violet-600/25 hover:bg-violet-600/45 text-violet-200 rounded text-[9px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Duplicate selected files"
                  >
                    <Copy className="w-2.5 h-2.5" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkArchive}
                    className="px-1.5 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded text-[9px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Archive selected files"
                  >
                    <Archive className="w-2.5 h-2.5" /> Archive
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkExport}
                    className="px-1.5 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded text-[9px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Export selected files"
                  >
                    <Download className="w-2.5 h-2.5" /> Export
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="px-1.5 py-0.5 bg-red-500/20 hover:bg-red-500/35 text-red-400 rounded text-[9px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Delete selected files"
                  >
                    <Trash2 className="w-2.5 h-2.5" /> Delete
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setBulkActionType(bulkActionType === 'tag_add' ? 'none' : 'tag_add'); setBulkInputText(''); }}
                  className={`px-1.5 py-0.5 rounded text-[9px] border font-medium cursor-pointer ${bulkActionType === 'tag_add' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                >
                  + Tags
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkActionType(bulkActionType === 'tag_remove' ? 'none' : 'tag_remove'); setBulkInputText(''); }}
                  className={`px-1.5 py-0.5 rounded text-[9px] border font-medium cursor-pointer ${bulkActionType === 'tag_remove' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                >
                  - Tags
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkActionType(bulkActionType === 'move_folder' ? 'none' : 'move_folder'); setBulkFolderSelect('root'); }}
                  className={`px-1.5 py-0.5 rounded text-[9px] border font-medium cursor-pointer ${bulkActionType === 'move_folder' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
                  title="Move selected files to another folder or virtual category"
                >
                  Move Folder
                </button>
              </div>

              {bulkActionType !== 'none' && (
                <form onSubmit={handleBulkActionSubmit} className="flex items-center gap-1 pt-1 animate-fade-in">
                  {bulkActionType === 'move_folder' ? (
                    <div className="flex items-center gap-1 w-full">
                      <select
                        value={bulkFolderSelect}
                        onChange={(e) => setBulkFolderSelect(e.target.value)}
                        className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                      >
                        <option value="root">/</option>
                        {allFolders.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                        <option value="New Folder">+ Create New...</option>
                      </select>
                      {bulkFolderSelect === 'New Folder' && (
                        <input
                          type="text"
                          placeholder="New folder path..."
                          required
                          value={bulkInputText}
                          onChange={(e) => setBulkInputText(e.target.value)}
                          className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      required
                      placeholder={bulkActionType === 'tag_add' ? "tags to add..." : "tags to remove..."}
                      value={bulkInputText}
                      onChange={(e) => setBulkInputText(e.target.value)}
                      className="flex-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none focus:border-violet-500"
                    />
                  )}
                  <button
                    type="submit"
                    className="px-2 py-0.5 bg-violet-600 hover:bg-violet-700 text-white rounded text-[9px] font-bold shrink-0 cursor-pointer"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBulkActionType('none'); setBulkInputText(''); }}
                    className="px-1 py-0.5 text-zinc-400 hover:text-white text-[9px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          );
        })()}

        {draggedItem && (
          <div className="px-4 py-2 bg-violet-500/10 border-b border-violet-500/20 text-[10px] text-violet-400 font-medium animate-pulse flex items-center justify-between">
            <span className="truncate">Dragging: {draggedItem.name}</span>
            <span className="text-[9px] opacity-75">Drop on folder to move</span>
          </div>
        )}

        {/* Tree Render */}
        <div 
          onDragOver={(e) => {
            e.preventDefault();
            if (draggedItem && dragOverFolder === null) {
              setDragOverFolder('root');
            }
          }}
          onDragLeave={() => {
            if (dragOverFolder === 'root') {
              setDragOverFolder(null);
            }
          }}
          onDrop={async (e) => {
            e.preventDefault();
            if (dragOverFolder === 'root' && draggedItem) {
              await handleMoveNode(draggedItem, 'root');
            }
            setDragOverFolder(null);
          }}
          className={`flex-1 overflow-y-auto p-3 space-y-1 rounded-b-2xl transition-all ${
            dragOverFolder === 'root'
              ? 'bg-violet-500/10 border-2 border-dashed border-violet-500/40 m-2 rounded-xl'
              : ''
          }`}
        >
          {isMoving ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 h-full">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-zinc-500 font-medium">Moving files...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">No documents available.</div>
          ) : (
            renderTree(tree)
          )}
        </div>
      </div>

      {/* Editor & Preview Workspace (9 cols) */}
      <div className={`lg:col-span-9 flex flex-col h-full border rounded-2xl overflow-hidden ${
        isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
      } shadow-sm`}>
         {showCreateForm ? (
          /* Creation Document Form */
          <form onSubmit={handleCreateFile} className="flex flex-col h-full overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className={`p-1.5 rounded-lg border cursor-pointer ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="font-bold text-sm">Create New Markdown Document</h3>
                {draftSavedAt && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-500/5 select-none border border-dashed border-zinc-500/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Draft Saved ({draftSavedAt})</span>
                  </span>
                )}
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm"
              >
                Create File
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {detectedDraft && detectedDraft.id === 'markdown_new' && (
                <div className={`p-3 border rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in ${
                  isDark ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-850'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>
                      <strong>Unsaved Draft Found:</strong> There is a newer draft for this new document from {new Date(detectedDraft.updatedAt).toLocaleString()}.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedDraft.title) setNewFilePath(detectedDraft.title);
                        if (detectedDraft.content) setNewFileContent(detectedDraft.content);
                        if (detectedDraft.tagsString !== undefined) setNewFileTagsString(detectedDraft.tagsString);
                        setDetectedDraft(null);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer text-[11px]"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDraft('markdown_new');
                        setDetectedDraft(null);
                      }}
                      className="px-2 py-0.5 rounded border border-amber-500/30 hover:bg-amber-500/10 font-medium cursor-pointer text-[11px]"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetectedDraft(null)}
                      className="p-1 text-zinc-400 hover:text-zinc-500 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 text-xs rounded-xl">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Document Virtual Path
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. skills/react_guide.md or guides/how_to.md"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Folders are dynamically generated. Always terminate paths with the file extension (e.g., <code className="font-mono text-violet-400">.md</code>).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. guide, react, standard"
                  value={newFileTagsString}
                  onChange={(e) => setNewFileTagsString(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Initial File Content
                </label>
                <textarea
                  rows={15}
                  placeholder="# Enter your Markdown here..."
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  className={`w-full px-4 py-3 text-xs font-mono rounded-xl border outline-none transition-all resize-none ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
              </div>
            </div>
          </form>
        ) : showCreateFolderForm ? (
          /* Creation Folder Form */
          <form onSubmit={handleCreateFolder} className="flex flex-col h-full overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderForm(false)}
                  className={`p-1.5 rounded-lg border cursor-pointer ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="font-bold text-sm">Create New Folder / Sub-Folder</h3>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm"
              >
                Create Folder
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {folderErrorMsg && (
                <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 text-xs rounded-xl">
                  {folderErrorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  Parent Folder Location
                </label>
                <select
                  value={folderParent}
                  onChange={(e) => setFolderParent(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                >
                  <option value="root">Root (/)</option>
                  {getExistingFolders(docs).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                  New Folder Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. react, models, backend"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className={`w-full px-4 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                    isDark 
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                  }`}
                />
                <span className="text-[10px] text-zinc-500 block mt-1">
                  Creating a new folder will initialize it with an automatic <code className="font-mono text-violet-400">README.md</code> markdown document.
                </span>
              </div>
            </div>
          </form>
        ) : selectedDoc ? (
          /* Editor Workspace Panel */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Interactive Breadcrumbs */}
            <div className={`px-4 py-2 border-b flex items-center gap-1.5 text-[11px] font-medium font-mono shrink-0 ${
              isDark ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400' : 'bg-zinc-50/50 border-zinc-200 text-zinc-500'
            }`}>
              <span className="text-zinc-400 dark:text-zinc-500 uppercase tracking-wider text-[9px] font-semibold flex items-center gap-1">
                <Folder className="w-3.5 h-3.5 text-violet-500 fill-violet-500/10" />
                Location:
              </span>
              <button
                type="button"
                onClick={() => {
                  setExpandedFolders(prev => ({ ...prev, 'root': true }));
                  const rootReadme = docs.find(d => d.path === 'README.md' || d.path === 'index.md');
                  if (rootReadme) {
                    selectDocument(rootReadme);
                  } else if (docs.length > 0) {
                    const rootDoc = docs.find(d => !d.path.includes('/'));
                    if (rootDoc) selectDocument(rootDoc);
                  }
                }}
                className="hover:text-violet-500 transition-colors cursor-pointer font-bold"
              >
                root
              </button>
              {(() => {
                const parts = selectedDoc.path.split('/');
                return parts.map((part, index) => {
                  const isLast = index === parts.length - 1;
                  const currentPath = parts.slice(0, index + 1).join('/');
                  
                  return (
                    <span key={currentPath} className="flex items-center gap-1.5">
                      <span className="text-zinc-300 dark:text-zinc-700 font-normal">/</span>
                      {isLast ? (
                        <span className="text-zinc-800 dark:text-zinc-200 font-semibold truncate max-w-[120px] sm:max-w-[200px]">
                          {part}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBreadcrumbFolderClick(currentPath)}
                          className="hover:text-violet-500 transition-colors cursor-pointer hover:underline text-zinc-500 dark:text-zinc-400 font-semibold"
                        >
                          {part}
                        </button>
                      )}
                    </span>
                  );
                });
              })()}
            </div>

            {/* Header / Meta */}
            <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-4 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    className="font-bold text-base bg-transparent border-b border-transparent hover:border-zinc-400 focus:border-violet-500 outline-none p-0.5 truncate"
                  />
                  <button
                    onClick={handleToggleFavorite}
                    className="p-1 text-zinc-400 hover:text-amber-500 transition-colors"
                  >
                    <Star className={`w-4 h-4 ${selectedDoc.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 mt-1">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Path: {selectedDoc.path}
                  </span>
                  <span className="hidden sm:inline text-zinc-400 text-xs font-mono">|</span>
                  <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    {calculateReadingTime(editorContent)}
                  </span>
                  <span className="hidden sm:inline text-zinc-400 text-xs font-mono">|</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-violet-400 font-semibold font-mono shrink-0">Tags:</span>
                    <input
                      type="text"
                      placeholder="tag1, tag2, tag3"
                      value={editorTagsString}
                      onChange={(e) => setEditorTagsString(e.target.value)}
                      className={`text-[10px] px-2 py-0.5 rounded border outline-none font-mono max-w-[200px] bg-transparent ${
                        isDark 
                          ? 'border-zinc-800 text-zinc-300 focus:border-violet-500/50 hover:border-zinc-700' 
                          : 'border-zinc-200 text-zinc-700 focus:border-violet-500/50 hover:border-zinc-300'
                      }`}
                      title="Separate tags with commas. Save to apply."
                    />
                  </div>
                </div>
              </div>

              {/* View Layout Toggles & Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex rounded-xl p-0.5 border ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                  <button
                    onClick={() => setActiveTab('edit')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                      activeTab === 'edit'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Editor
                  </button>
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                      activeTab === 'preview'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </button>
                  <button
                    onClick={() => setActiveTab('split')}
                    className={`hidden md:flex px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all items-center gap-1 ${
                      activeTab === 'split'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Layout className="w-3.5 h-3.5" />
                    Split Layout
                  </button>
                </div>

                {draftSavedAt && (
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1 px-2 py-1 rounded bg-zinc-500/5 select-none border border-dashed border-zinc-500/10 animate-fade-in">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Draft Saved ({draftSavedAt})</span>
                  </span>
                )}

                <button
                  onClick={handleCopyCode}
                  className={`p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                    copied
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      : isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                  title="Copy raw Markdown code"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>

                <button
                  onClick={handleAnalyzeContent}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                    showAnalysisPanel
                      ? 'bg-violet-600/10 border-violet-500/30 text-violet-400'
                      : isDark
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                        : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50'
                  }`}
                  title="Generate metadata suggestions (Category, Tags, Summary, Keywords)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-500 animate-pulse" />
                  <span>Suggest Metadata</span>
                </button>

                <button
                  onClick={handleSaveDoc}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm disabled:opacity-55"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save File'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMovingDoc(selectedDoc);
                    setTargetFolder('root');
                    setCustomTargetFolder('');
                    setIsCustomFolder(false);
                    setShowMoveModal(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    isDark 
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750' 
                      : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50'
                  }`}
                  title="Move document to another folder"
                >
                  <Folder className="w-3.5 h-3.5 text-violet-500" />
                  <span>Move</span>
                </button>

                <button
                  onClick={handleDeleteDoc}
                  className="p-2 rounded-xl border text-xs cursor-pointer transition-all bg-red-500/10 border-red-500/20 text-red-500"
                  title="Delete file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showAnalysisPanel && (
              <div className={`p-4 border-b flex flex-col gap-3.5 animate-fade-in shrink-0 ${
                isDark ? 'bg-zinc-950/40 border-zinc-850' : 'bg-violet-50/25 border-zinc-150'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-500 animate-pulse" />
                    <span className="font-bold text-xs">AI Metadata Suggestions</span>
                    {analysisResults && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold font-mono uppercase tracking-wider ${
                        analysisResults.source === 'llm' 
                          ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20' 
                          : 'bg-amber-600/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {analysisResults.source === 'llm' ? '✨ Gemini AI' : '⚙️ Smart Heuristics'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowAnalysisPanel(false)}
                    className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isAnalyzing ? (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Analyzing document content...</span>
                  </div>
                ) : analysisResults ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Column 1: Category & Tags */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Suggested Category</span>
                          <button
                            type="button"
                            onClick={applySuggestedCategory}
                            className="text-[10px] text-violet-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Folder className="w-3 h-3" /> Move File
                          </button>
                        </div>
                        <div className={`p-2 rounded-xl border font-mono ${
                          isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700'
                        }`}>
                          {analysisResults.category}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Suggested Tags</span>
                          <button
                            type="button"
                            onClick={applySuggestedTags}
                            className="text-[10px] text-violet-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Apply Tags
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border bg-zinc-500/5 border-dashed dark:border-zinc-800">
                          {analysisResults.tags.map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                const currentTags = editorTagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);
                                if (!currentTags.includes(tag)) {
                                  setEditorTagsString([...currentTags, tag].join(', '));
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                                isDark 
                                  ? 'bg-zinc-950 border-zinc-800 hover:border-violet-500/50 hover:bg-zinc-900 text-zinc-300' 
                                  : 'bg-white border-zinc-200 hover:border-violet-500/50 hover:bg-zinc-50 text-zinc-700'
                              }`}
                              title="Click to add individual tag"
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Summary & Keywords */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Document Summary</span>
                          <button
                            type="button"
                            onClick={insertSummaryAtTop}
                            className="text-[10px] text-violet-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Insert at Top
                          </button>
                        </div>
                        <blockquote className={`p-2.5 rounded-xl border border-l-4 border-l-violet-500 text-xs italic leading-relaxed ${
                          isDark ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-650'
                        }`}>
                          "{analysisResults.summary}"
                        </blockquote>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Keywords</span>
                          <button
                            type="button"
                            onClick={insertKeywordsAtBottom}
                            className="text-[10px] text-violet-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Append at Bottom
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 p-2 rounded-xl border bg-zinc-500/5 border-dashed dark:border-zinc-800">
                          {analysisResults.keywords.map(kw => (
                            <span 
                              key={kw}
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                                isDark ? 'bg-zinc-900 text-zinc-400 border border-zinc-800' : 'bg-white text-zinc-600 border border-zinc-200'
                              }`}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-zinc-500">
                    No active suggestions. Click analyze to evaluate document contents.
                  </div>
                )}
              </div>
            )}

            {detectedDraft && (
              <div className={`px-4 py-3 border-b flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0 ${
                isDark ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-850'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>
                    <strong>Unsaved Draft Found:</strong> There is a newer offline draft of this document from {new Date(detectedDraft.updatedAt).toLocaleString()}.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditorContent(detectedDraft.content);
                      if (detectedDraft.title) setEditorTitle(detectedDraft.title);
                      if (detectedDraft.tagsString !== undefined) setEditorTagsString(detectedDraft.tagsString);
                      setDetectedDraft(null);
                    }}
                    className="px-2.5 py-1 rounded bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer"
                  >
                    Restore Draft
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteDraft(detectedDraft.id);
                      setDetectedDraft(null);
                    }}
                    className="px-2.5 py-1 rounded border border-amber-500/30 hover:bg-amber-500/10 font-medium cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetectedDraft(null)}
                    className="p-1 text-zinc-400 hover:text-zinc-500 cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Split Screen Panel */}
            <div className="flex-1 flex overflow-hidden">
              {/* Write Side */}
              {(activeTab === 'edit' || activeTab === 'split') && (
                <div className={`flex-1 flex flex-col overflow-hidden relative border-r ${isDark ? 'border-zinc-850' : 'border-zinc-150'}`}>
                  
                  {/* Editor Styling Toolbar */}
                  <div className={`px-4 py-2 border-b flex flex-wrap items-center gap-1.5 justify-between select-none ${
                    isDark ? 'bg-zinc-950/80 border-zinc-850' : 'bg-zinc-50 border-zinc-150'
                  }`}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => insertText('**', '**')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs font-bold text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Bold (Ctrl+B)"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => insertText('*', '*')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs italic text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Italic (Ctrl+I)"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => insertText('# ', '')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs font-mono text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Heading 1"
                      >
                        H1
                      </button>
                      <button
                        type="button"
                        onClick={() => insertText('## ', '')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs font-mono text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Heading 2"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => insertText('- ', '')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Bullet List"
                      >
                        List
                      </button>
                      <button
                        type="button"
                        onClick={() => insertText('[', '](url)')}
                        className={`px-2 py-1 rounded hover:bg-violet-600 hover:text-white transition-all text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer`}
                        title="Link"
                      >
                        Link
                      </button>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTableGenerator(!showTableGenerator)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all border ${
                          showTableGenerator
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : isDark
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                              : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        }`}
                        title="Table Generator"
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span>Insert Table</span>
                      </button>

                      {showTableGenerator && (
                        <div className={`absolute right-0 top-8 z-50 p-4 rounded-xl shadow-2xl border w-60 animate-fade-in ${
                          isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
                        }`}>
                          <h4 className="font-bold text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                            <Grid className="w-3 h-3 text-violet-500" />
                            Table Generator
                          </h4>
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] text-zinc-500 uppercase font-semibold">Rows</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={15}
                                  value={tableRows}
                                  onChange={(e) => setTableRows(Math.max(1, Math.min(15, Number(e.target.value))))}
                                  className={`w-full px-2 py-1 text-xs font-mono rounded border outline-none ${
                                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                                  }`}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] text-zinc-500 uppercase font-semibold">Cols</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={tableCols}
                                  onChange={(e) => setTableCols(Math.max(1, Math.min(10, Number(e.target.value))))}
                                  className={`w-full px-2 py-1 text-xs font-mono rounded border outline-none ${
                                    isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Hover Matrix Preview */}
                            <div className="flex flex-col gap-1 items-center justify-center p-2 rounded bg-zinc-500/5 border border-dashed dark:border-zinc-800">
                              {Array.from({ length: 6 }).map((_, rIdx) => (
                                <div key={rIdx} className="flex gap-1">
                                  {Array.from({ length: 6 }).map((_, cIdx) => {
                                    const active = rIdx < tableRows && cIdx < tableCols;
                                    return (
                                      <div
                                        key={cIdx}
                                        onMouseEnter={() => {
                                          setTableRows(rIdx + 1);
                                          setTableCols(cIdx + 1);
                                        }}
                                        className={`w-3.5 h-3.5 rounded-sm border cursor-pointer transition-all ${
                                          active
                                            ? 'bg-violet-600 border-violet-500'
                                            : 'bg-transparent border-zinc-350 dark:border-zinc-700'
                                        }`}
                                      />
                                    );
                                  })}
                                </div>
                              ))}
                              <span className="text-[9px] text-zinc-500 font-mono mt-1">{tableRows} rows × {tableCols} cols selected</span>
                            </div>

                            <button
                              type="button"
                              onClick={handleInsertTable}
                              className="w-full py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-xs font-bold cursor-pointer transition-colors"
                            >
                              Insert Table
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                    {/* Line Number Column Gutter (Simulates Code editor IDE) */}
                    <div className={`w-10 flex-col py-4 select-none shrink-0 font-mono text-[11px] text-right pr-2 hidden md:flex ${
                      isDark ? 'bg-zinc-950/60 text-zinc-600' : 'bg-zinc-50/50 text-zinc-400'
                    }`}>
                      {Array.from({ length: editorContent.split('\n').length || 1 }).map((_, i) => (
                        <div key={i} className="h-5">{i + 1}</div>
                      ))}
                    </div>

                    <textarea
                      id="markdown-textarea"
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className={`flex-1 p-4 font-mono text-xs leading-5 resize-none border-0 outline-none overflow-y-auto whitespace-pre overflow-x-auto ${
                        isDark ? 'bg-zinc-950/40 text-zinc-200 focus:bg-zinc-950/20' : 'bg-white text-zinc-800'
                      }`}
                      placeholder="# Hello, start writing Markdown..."
                    />
                  </div>
                </div>
              )}

              {/* Preview Side */}
              {(activeTab === 'preview' || activeTab === 'split') && (
                <div className="flex-1 p-6 overflow-y-auto prose dark:prose-invert max-w-none text-left">
                  {editorContent ? (
                    <CustomMarkdownRenderer markdown={editorContent} isDark={isDark} />
                  ) : (
                    <div className="text-zinc-400 text-sm italic py-8 text-center">Nothing to preview. Start writing on the left panel.</div>
                  )}
                </div>
              )}
            </div>

            {/* Editor Footer Status */}
            <div className={`px-4 py-1.5 border-t text-[10px] text-zinc-400 font-mono flex justify-between items-center ${isDark ? 'border-zinc-850 bg-zinc-950/80' : 'border-zinc-150 bg-zinc-50'}`}>
              <span>UTF-8 Document Workspace</span>
              <span>Lines: {editorContent.split('\n').length} | Chars: {editorContent.length}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-500">
            <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
              <BookOpen className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="font-semibold text-base mb-1">No file loaded</h3>
            <p className="text-sm max-w-xs leading-relaxed">
              Select an .md file from the Explorer tree on the left, or create a brand new virtual markdown path to edit.
            </p>
          </div>
        )}
      </div>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 animate-fade-in ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
          }`}>
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/10 text-red-500 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base leading-tight">Delete Document?</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  Are you sure you want to permanently delete <code className="font-mono text-violet-400 font-semibold break-all">"{selectedDoc?.path}"</code>? This action cannot be undone.
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isDark 
                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300 bg-zinc-900' 
                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600 bg-white'
                }`}
              >
                Cancel, Keep File
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (selectedDoc) {
                    await onDeleteDoc(selectedDoc.id);
                    setSelectedDoc(null);
                  }
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-sm transition-all"
              >
                Yes, Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Manual Move Document Modal */}
      {showMoveModal && movingDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm" onClick={() => setShowMoveModal(false)} />
          <form 
            onSubmit={handleManualMoveDocSubmit}
            className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 animate-fade-in ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-3 bg-violet-500/10 text-violet-500 rounded-xl shrink-0">
                <Folder className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base leading-tight">Move Document</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  Move <code className="font-mono text-violet-400 font-semibold break-all">"{movingDoc.path.split('/').pop()}"</code> to a different directory.
                </p>
              </div>
            </div>

            <div className="space-y-3 my-1">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={!isCustomFolder}
                    onChange={() => setIsCustomFolder(false)}
                    className="accent-violet-600"
                  />
                  Select Existing Folder
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={isCustomFolder}
                    onChange={() => setIsCustomFolder(true)}
                    className="accent-violet-600"
                  />
                  Create New Folder
                </label>
              </div>

              {!isCustomFolder ? (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Target Folder</label>
                  <select
                    value={targetFolder}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none transition-all ${
                      isDark 
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                    }`}
                  >
                    <option value="root">Root (/)</option>
                    {getExistingFolders(docs).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">New Folder Path (e.g. guides/react)</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter folder path..."
                    value={customTargetFolder}
                    onChange={(e) => setCustomTargetFolder(e.target.value)}
                    className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                      isDark 
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                    }`}
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isDark 
                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300 bg-zinc-900' 
                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600 bg-white'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isMoving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm disabled:opacity-55 transition-all"
              >
                {isMoving ? 'Moving...' : 'Move File'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Manual Move Folder Modal */}
      {showMoveFolderModal && movingFolder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm" onClick={() => setShowMoveFolderModal(false)} />
          <form 
            onSubmit={handleManualMoveFolderSubmit}
            className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col gap-4 animate-fade-in ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-850'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-3 bg-violet-500/10 text-violet-500 rounded-xl shrink-0">
                <Folder className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base leading-tight">Move Folder</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  Move folder <code className="font-mono text-violet-400 font-semibold break-all">"{movingFolder.name}"</code> and all its files to another folder.
                </p>
              </div>
            </div>

            <div className="space-y-3 my-1">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={!isCustomFolder}
                    onChange={() => setIsCustomFolder(false)}
                    className="accent-violet-600"
                  />
                  Select Existing Folder
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    checked={isCustomFolder}
                    onChange={() => setIsCustomFolder(true)}
                    className="accent-violet-600"
                  />
                  Create New Folder
                </label>
              </div>

              {!isCustomFolder ? (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Target Folder</label>
                  <select
                    value={targetFolder}
                    onChange={(e) => setTargetFolder(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none transition-all ${
                      isDark 
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                    }`}
                  >
                    <option value="root">Root (/)</option>
                    {getExistingFolders(docs).filter(f => f !== movingFolder.path && !f.startsWith(movingFolder.path + '/')).map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">New Folder Path (e.g. guides/react)</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter folder path..."
                    value={customTargetFolder}
                    onChange={(e) => setCustomTargetFolder(e.target.value)}
                    className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none transition-all ${
                      isDark 
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                    }`}
                  />
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setShowMoveFolderModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isDark 
                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300 bg-zinc-900' 
                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600 bg-white'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isMoving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white cursor-pointer shadow-sm disabled:opacity-55 transition-all"
              >
                {isMoving ? 'Moving...' : 'Move Folder'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reusable File Upload & RAG Re-indexing Modal */}
      <MarkdownUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onAddDoc={onAddDoc}
        onIndexRag={onIndexRag || (async () => { console.warn("RAG indexing not configured on parent."); })}
        isDark={isDark}
      />
    </div>
  );
}
