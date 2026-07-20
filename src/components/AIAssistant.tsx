import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MarkdownDoc, Prompt } from '../types';
import { Send, Sparkles, Terminal, FileText, Star, BookOpen, Layers, RefreshCw, AlertCircle, Copy, Check, MessageSquare, Compass, Info } from 'lucide-react';

interface AIAssistantProps {
  markdowns: MarkdownDoc[];
  prompts: Prompt[];
  onSelectDoc: (docId: string) => void;
  isDark: boolean;
  onIndexRag: () => Promise<{ success: boolean; message: string; apiUsed: boolean; chunksIndexed: number }>;
}

export default function AIAssistant({ markdowns, prompts, onSelectDoc, isDark, onIndexRag }: AIAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `🌌 **Hello! Welcome to the AI Prompt Vault Assistant.**\n\nI am your dedicated LLM & RAG co-pilot. I can explore your prompts, read your local documentation, and perform vector search. \n\n**Select a mode below or try one of the special developer actions in the right panel:**\n1. **Local Knowledge RAG Explorer**: I'll search deep across your active Markdown files using Gemini vector embeddings to find grounded context.\n2. **General Creator**: Ask me general prompting, development, or refactoring questions.`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'rag' | 'general'>('rag');
  const [chatLoading, setChatLoading] = useState(false);

  // Special tools panel states
  const [selectedTool, setSelectedTool] = useState<'summarize' | 'improve' | 'compare' | 'index'>('summarize');
  
  // Summarize Tool state
  const [sumDocId, setSumDocId] = useState('');
  const [sumLoading, setSumLoading] = useState(false);
  const [sumResult, setSumResult] = useState('');

  // Improve Prompt Tool state
  const [impInstructions, setImpInstructions] = useState('');
  const [impLoading, setImpLoading] = useState(false);
  const [impResult, setImpResult] = useState('');

  // Compare Tool state
  const [compDoc1Id, setCompDoc1Id] = useState('');
  const [compDoc2Id, setCompDoc2Id] = useState('');
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState('');

  // RAG Indexing state
  const [indexingState, setIndexingState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('assistant_recent_queries') || '[]');
    } catch {
      return [];
    }
  });

  const saveQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentQueries(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('assistant_recent_queries', JSON.stringify(updated));
      return updated;
    });
  };

  // Handle standard chat submit
  const handleChatSubmit = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const queryText = (customText || input).trim();
    if (!queryText || chatLoading) return;

    saveQuery(queryText);

    const userMessage: ChatMessage = {
      id: `m_user_${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: queryText, mode })
      });

      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, {
          id: `m_ast_${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          sources: data.sources || [],
          timestamp: new Date().toISOString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: `m_ast_err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **API Error**: ${data.error || 'Failed to communicate with Gemini. Ensure GEMINI_API_KEY is active.'}`,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `m_ast_err_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **Network Error**: Connection to AI endpoint failed. Make sure your server is online.`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Run Summarizer Tool
  const handleRunSummarizer = async () => {
    if (!sumDocId) return;
    setSumLoading(true);
    setSumResult('');
    try {
      const res = await fetch('/api/ai/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'summarize_doc', params: { docId: sumDocId } })
      });
      const data = await res.json();
      if (res.ok) {
        setSumResult(data.result);
        // Append to chat as nice context
        setMessages(prev => [...prev, {
          id: `m_tool_${Date.now()}`,
          role: 'assistant',
          content: `### 📄 Executive Summary for: *${markdowns.find(d => d.id === sumDocId)?.path}*\n\n${data.result}`,
          timestamp: new Date().toISOString()
        }]);
      } else {
        setSumResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setSumResult('Network connection failed.');
    } finally {
      setSumLoading(false);
    }
  };

  // Run Prompt Creator Tool
  const handleRunPromptCreator = async () => {
    if (!impInstructions) return;
    setImpLoading(true);
    setImpResult('');
    try {
      const res = await fetch('/api/ai/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'improve_prompt', params: { instructions: impInstructions } })
      });
      const data = await res.json();
      if (res.ok) {
        setImpResult(data.result);
        setMessages(prev => [...prev, {
          id: `m_tool_${Date.now()}`,
          role: 'assistant',
          content: `### 🔮 Optimized Prompt Engineered Template\n\n${data.result}`,
          timestamp: new Date().toISOString()
        }]);
      } else {
        setImpResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setImpResult('Network connection failed.');
    } finally {
      setImpLoading(false);
    }
  };

  // Run Comparison Tool
  const handleRunComparison = async () => {
    if (!compDoc1Id || !compDoc2Id) return;
    setCompLoading(true);
    setCompResult('');
    try {
      const res = await fetch('/api/ai/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'compare_files', params: { doc1Id: compDoc1Id, doc2Id: compDoc2Id } })
      });
      const data = await res.json();
      if (res.ok) {
        setCompResult(data.result);
        setMessages(prev => [...prev, {
          id: `m_tool_${Date.now()}`,
          role: 'assistant',
          content: `### 🛡️ Semantic Code/Context Comparison Audit\n\n${data.result}`,
          timestamp: new Date().toISOString()
        }]);
      } else {
        setCompResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setCompResult('Network connection failed.');
    } finally {
      setCompLoading(false);
    }
  };

  // Re-index trigger from Assistant
  const handleTriggerReindex = async () => {
    setIndexingState({ status: 'running', message: 'Vectorizing files and building document indexes...' });
    try {
      const data = await onIndexRag();
      if (data.success) {
        setIndexingState({
          status: 'done',
          message: `${data.message} RAG vector matrix loaded successfully. ${data.apiUsed ? 'Using high-fidelity Google Gemini embeddings.' : 'Using local fallback keywords index.'}`
        });
      } else {
        setIndexingState({ status: 'error', message: 'Indexing failed. Check credentials.' });
      }
    } catch (err) {
      setIndexingState({ status: 'error', message: 'Failed to complete index operation.' });
    }
  };

  const getSourceDocId = (path: string) => {
    const doc = markdowns.find(m => m.path === path);
    return doc ? doc.id : null;
  };

  // Simple renderer for assistant answers inside chat bubble
  const renderMessageContent = (content: string) => {
    const paragraphs = content.split('\n');
    return paragraphs.map((p, idx) => {
      if (p.startsWith('### ')) {
        return <h4 key={idx} className="font-bold text-sm tracking-tight mt-3 mb-1.5 text-zinc-900 dark:text-white">{p.replace('### ', '')}</h4>;
      }
      if (p.startsWith('- ') || p.startsWith('* ')) {
        return <li key={idx} className="ml-4 list-disc text-xs leading-relaxed my-1 text-zinc-700 dark:text-zinc-300">{p.substring(2)}</li>;
      }
      if (p.startsWith('**') && p.endsWith('**')) {
        return <p key={idx} className="font-bold text-xs my-1">{p.replace(/\*\*/g, '')}</p>;
      }
      if (p.trim().startsWith('1.') || p.trim().startsWith('2.') || p.trim().startsWith('3.')) {
        return <p key={idx} className="text-xs leading-relaxed my-1 text-zinc-700 dark:text-zinc-300 pl-2">{p}</p>;
      }
      return <p key={idx} className="text-xs leading-relaxed my-1 text-zinc-600 dark:text-zinc-300">{p}</p>;
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-130px)] animate-fade-in">
      
      {/* Active Chat Column (7 cols) */}
      <div className={`lg:col-span-7 flex flex-col h-full border rounded-2xl overflow-hidden ${
        isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
      } shadow-sm`}>
        
        {/* Chat Header / Mode Selection */}
        <div className={`p-4 border-b flex items-center justify-between gap-4 ${isDark ? 'border-zinc-800/60' : 'border-zinc-150'}`}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <h2 className="font-bold text-sm">AI assistant & RAG</h2>
          </div>

          <div className={`flex rounded-xl p-0.5 border text-xs font-semibold ${isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <button
              onClick={() => setMode('rag')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                mode === 'rag'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              RAG Docs Explorer
            </button>
            <button
              onClick={() => setMode('general')}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                mode === 'general'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              General Chat
            </button>
          </div>
        </div>

        {/* Chat Feed Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                  isUser 
                    ? isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                    : 'bg-violet-600 text-white border-transparent'
                }`}>
                  {isUser ? 'U' : <Sparkles className="w-4 h-4 fill-white/10" />}
                </div>

                <div className="space-y-1.5 min-w-0">
                  <div className={`p-4 rounded-2xl border text-left ${
                    isUser
                      ? isDark 
                        ? 'bg-violet-950/20 border-violet-900/40' 
                        : 'bg-violet-50/50 border-violet-100'
                      : isDark
                        ? 'bg-zinc-950 border-zinc-850'
                        : 'bg-zinc-50/50 border-zinc-100'
                  }`}>
                    <div className="prose dark:prose-invert max-w-none break-words">
                      {renderMessageContent(m.content)}
                    </div>

                    {/* Sources Badge citations */}
                    {!isUser && m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-dashed dark:border-zinc-800 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-semibold text-zinc-400">Cited Sources:</span>
                        {m.sources.map((src, sIdx) => {
                          const docId = getSourceDocId(src);
                          return (
                            <button
                              key={sIdx}
                              onClick={() => docId && onSelectDoc(docId)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-medium border cursor-pointer hover:-translate-y-0.5 transition-all ${
                                isDark 
                                  ? 'bg-zinc-900 border-zinc-800 hover:border-violet-500 text-zinc-300' 
                                  : 'bg-white border-zinc-200 hover:border-violet-400 text-zinc-600'
                              }`}
                            >
                              <FileText className="w-3 h-3 text-violet-500" />
                              {src}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <span className={`text-[9px] text-zinc-500 font-mono block ${isUser ? 'text-right' : ''}`}>
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })}

          {chatLoading && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-violet-600 text-white border-transparent animate-pulse">
                <Sparkles className="w-4 h-4 fill-white/10" />
              </div>
              <div className={`p-4 rounded-2xl border text-left ${isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50 border-zinc-100'}`}>
                <div className="flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <span className="text-[10px] text-zinc-500 font-mono font-semibold ml-2">Consulting Gemini RAG model...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Recent Queries pills */}
        {recentQueries.length > 0 && (
          <div className={`px-3 py-1.5 border-t flex flex-wrap items-center gap-1.5 text-xs ${isDark ? 'border-zinc-800/80 bg-zinc-950/40' : 'border-zinc-150 bg-zinc-50/50'}`}>
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[9px] mr-1">Recent:</span>
            {recentQueries.map((query, idx) => (
              <div 
                key={idx} 
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all text-[11px] ${
                  isDark 
                    ? 'bg-zinc-950 border-zinc-850 text-zinc-300 hover:border-violet-500' 
                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-violet-400'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleChatSubmit(undefined, query)}
                  className="cursor-pointer font-medium hover:text-violet-500 truncate max-w-[150px]"
                  title={`Re-run: "${query}"`}
                >
                  {query}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const updated = recentQueries.filter((_, i) => i !== idx);
                    setRecentQueries(updated);
                    localStorage.setItem('assistant_recent_queries', JSON.stringify(updated));
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
                setRecentQueries([]);
                localStorage.removeItem('assistant_recent_queries');
              }}
              className="text-zinc-500 hover:text-red-500 text-[10px] font-semibold ml-auto cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        {/* Input Form Bar */}
        <form onSubmit={handleChatSubmit} className={`p-3 border-t flex gap-2 bg-zinc-950/20 ${isDark ? 'border-zinc-800/80' : 'border-zinc-200'}`}>
          <input
            type="text"
            required
            placeholder={
              mode === 'rag' 
                ? 'Ask local documentation... (e.g., "Summarize prompting skill")' 
                : 'Ask Gemini general questions... (e.g., "Write a python script")'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={`flex-1 px-4 py-2 text-xs rounded-xl border outline-none transition-all ${
              isDark 
                ? 'bg-zinc-950 border-zinc-850 text-zinc-100 focus:border-violet-500' 
                : 'bg-white border-zinc-200 text-zinc-900 focus:border-violet-500'
            }`}
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Special Developer Toolboxes Panel (5 cols) */}
      <div className={`lg:col-span-5 flex flex-col h-full border rounded-2xl overflow-hidden ${
        isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
      } shadow-sm`}>
        
        {/* Tool Selector Tab Bar */}
        <div className={`p-2 border-b flex flex-wrap gap-1 ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
          <button
            onClick={() => setSelectedTool('summarize')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTool === 'summarize'
                ? isDark ? 'bg-zinc-800 text-violet-400 border border-zinc-700' : 'bg-zinc-100 text-violet-700 border border-zinc-200'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Summarize
          </button>
          <button
            onClick={() => setSelectedTool('improve')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTool === 'improve'
                ? isDark ? 'bg-zinc-800 text-violet-400 border border-zinc-700' : 'bg-zinc-100 text-violet-700 border border-zinc-200'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            AI Creator
          </button>
          <button
            onClick={() => setSelectedTool('compare')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTool === 'compare'
                ? isDark ? 'bg-zinc-800 text-violet-400 border border-zinc-700' : 'bg-zinc-100 text-violet-700 border border-zinc-200'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Compare
          </button>
          <button
            onClick={() => setSelectedTool('index')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedTool === 'index'
                ? isDark ? 'bg-zinc-800 text-violet-400 border border-zinc-700' : 'bg-zinc-100 text-violet-700 border border-zinc-200'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            RAG Admin
          </button>
        </div>

        {/* Dynamic Tool Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-left">
          {selectedTool === 'summarize' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-violet-500">
                <FileText className="w-4 h-4" />
                <h3 className="font-bold text-sm">Summarize Skill/Guideline Document</h3>
              </div>
              <p className="text-xs text-zinc-500">
                Pick one of your Markdown documents to instantly generate an executive summary layout with key takeaways.
              </p>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Target Document</label>
                <select
                  value={sumDocId}
                  onChange={(e) => setSumDocId(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${
                    isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-250 text-zinc-700'
                  }`}
                >
                  <option value="">-- Choose document --</option>
                  {markdowns.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.path}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleRunSummarizer}
                disabled={sumLoading || !sumDocId}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/10 cursor-pointer disabled:opacity-50"
              >
                {sumLoading ? 'Summarizing...' : 'Summarize File & Append to Chat'}
              </button>

              {sumResult && (
                <div className="space-y-2 mt-4">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Response Panel</span>
                  <div className={`p-4 rounded-xl border text-xs max-h-[180px] overflow-y-auto font-mono whitespace-pre-wrap ${
                    isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-150 text-zinc-700'
                  }`}>
                    {sumResult}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTool === 'improve' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-violet-500">
                <Sparkles className="w-4 h-4" />
                <h3 className="font-bold text-sm">Optimize System Prompt Template</h3>
              </div>
              <p className="text-xs text-zinc-500">
                Type instructions below to formulate a production-ready template conforming to active library patterns.
              </p>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Builder Guidelines</label>
                <textarea
                  rows={4}
                  placeholder="e.g. A Python unit-testing generator that validates strict types and exceptions"
                  value={impInstructions}
                  onChange={(e) => setImpInstructions(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none resize-none ${
                    isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-250 text-zinc-700'
                  }`}
                />
              </div>

              <button
                onClick={handleRunPromptCreator}
                disabled={impLoading || !impInstructions}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/10 cursor-pointer disabled:opacity-50"
              >
                {impLoading ? 'Formulating...' : 'Generate Prompt & Append to Chat'}
              </button>

              {impResult && (
                <div className="space-y-2 mt-4">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Response Panel</span>
                  <div className={`p-4 rounded-xl border text-xs max-h-[180px] overflow-y-auto font-mono whitespace-pre-wrap ${
                    isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-150 text-zinc-700'
                  }`}>
                    {impResult}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTool === 'compare' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-violet-500">
                <Layers className="w-4 h-4" />
                <h3 className="font-bold text-sm">Semantic Context File Comparison</h3>
              </div>
              <p className="text-xs text-zinc-500">
                Select two context, rules, or instruction files to highlight functional differences and merge criteria.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Document 1</label>
                  <select
                    value={compDoc1Id}
                    onChange={(e) => setCompDoc1Id(e.target.value)}
                    className={`w-full px-2 py-2 text-[11px] rounded-xl border outline-none cursor-pointer ${
                      isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-250 text-zinc-700'
                    }`}
                  >
                    <option value="">Select File 1</option>
                    {markdowns.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.path}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Document 2</label>
                  <select
                    value={compDoc2Id}
                    onChange={(e) => setCompDoc2Id(e.target.value)}
                    className={`w-full px-2 py-2 text-[11px] rounded-xl border outline-none cursor-pointer ${
                      isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-250 text-zinc-700'
                    }`}
                  >
                    <option value="">Select File 2</option>
                    {markdowns.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.path}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunComparison}
                disabled={compLoading || !compDoc1Id || !compDoc2Id}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/10 cursor-pointer disabled:opacity-50"
              >
                {compLoading ? 'Auditing differences...' : 'Compare Context Files'}
              </button>

              {compResult && (
                <div className="space-y-2 mt-4">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Response Panel</span>
                  <div className={`p-4 rounded-xl border text-xs max-h-[180px] overflow-y-auto font-mono whitespace-pre-wrap ${
                    isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-150 text-zinc-700'
                  }`}>
                    {compResult}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTool === 'index' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-violet-500">
                <RefreshCw className="w-4 h-4" />
                <h3 className="font-bold text-sm">RAG Search Index Configuration</h3>
              </div>
              <p className="text-xs text-zinc-500">
                Click index below to scan, chunk, and embed your markdown files. Grounded searches are updated instantly.
              </p>

              <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50 border-zinc-200'
              }`}>
                <Info className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-semibold block">Indexing Pipeline Parameter</span>
                  <p className="text-zinc-500">
                    Embeddings model: <code className="font-mono text-violet-400 bg-zinc-900/40 px-1 py-0.2 rounded text-[10px]">gemini-embedding-2-preview</code>
                  </p>
                  <p className="text-zinc-500">
                    Chunking: Split recursively by Heading Section headers with a maximum chunk window size of 2000 chars.
                  </p>
                </div>
              </div>

              <button
                onClick={handleTriggerReindex}
                disabled={indexingState.status === 'running'}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/10 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${indexingState.status === 'running' ? 'animate-spin' : ''}`} />
                {indexingState.status === 'running' ? 'Embedding documents...' : 'Re-index RAG Database now'}
              </button>

              {indexingState.message && (
                <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 mt-4 ${
                  indexingState.status === 'error'
                    ? 'bg-red-500/10 border-red-500/20 text-red-500'
                    : indexingState.status === 'running'
                      ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                }`}>
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-semibold">{indexingState.message}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
