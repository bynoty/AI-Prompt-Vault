import React, { useState, useEffect } from 'react';
import { Prompt, PromptVersion } from '../types';
import { Search, Plus, Star, Copy, Check, History, Sparkles, Tag, ChevronRight, Edit2, Trash2, Code, Info, ArrowLeft, Filter, CheckCircle2, AlertCircle, Zap, ThumbsUp, BookOpen, X, Lock, Unlock, CheckSquare, Square, Download, Archive } from 'lucide-react';
import { saveDraft, getDraft, deleteDraft } from '../draftDb';

const PROFESSIONAL_TEMPLATES = [
  {
    id: 'cot',
    name: 'Chain-of-Thought (CoT)',
    description: 'Guides the AI to reason step-by-step. Excellent for logical, technical, or math-heavy tasks.',
    category: 'Prompt Engineering',
    platform: 'Gemini',
    tags: 'reasoning, logic, cot',
    title: 'Chain-of-Thought Reasoning',
    promptDesc: 'A framework for solving logical, mathematical, or reasoning-intensive tasks step-by-step.',
    content: `You are an expert tutor and logical thinker. Your task is to solve the following problem step-by-step:

Context:
{{problem_context}}

Instructions:
1. Break down the problem into logical reasoning steps.
2. For each step, explain your thoughts, calculations, or premises clearly.
3. Verify your work at each step before moving to the next.
4. Finally, summarize the ultimate solution clearly under a "Conclusion" header.

Format:
- Step 1: [Reasoning]
- Step 2: [Reasoning]
...
- Conclusion: [Final answer]`
  },
  {
    id: 'fewshot',
    name: 'Few-Shot Prompting',
    description: 'Provide explicit input-output examples to establish strict formatting rules and output style.',
    category: 'Prompt Engineering',
    platform: 'Gemini',
    tags: 'few-shot, examples, format',
    title: 'Few-Shot Examples Framework',
    promptDesc: 'Teach the model specific formats or complex text transformations by example.',
    content: `You are a professional {{persona}} specialized in generating high-quality responses.

Your task is to transform the user input into the desired output style.

Here are a few examples of how you should handle the inputs:

Example 1:
- Input: {{example_input_1}}
- Output: {{example_output_1}}

Example 2:
- Input: {{example_input_2}}
- Output: {{example_output_2}}

Now, process the actual user input:
- Input: {{user_input}}
- Output:`
  },
  {
    id: 'persona',
    name: 'Role & Persona',
    description: 'Establishes an elite persona with deep skills, background context, and direct operational bounds.',
    category: 'AI Agent',
    platform: 'Gemini',
    tags: 'persona, role, agent',
    title: 'Expert Persona Setup',
    promptDesc: 'Set up an authoritative AI expert with defined guardrails and target objectives.',
    content: `You are {{role_name}}, a world-class expert in {{domain}}. 

Your background includes:
- Deep expertise in {{skills_list}}
- A commitment to high-precision, clear, and action-oriented communication.

Your task is to:
{{task_details}}

Constraints you must adhere to:
- Never make assumptions; ask clarifying questions if something is ambiguous.
- Provide objective, data-backed reasoning.
- Keep the output format in clean {{output_format}}.`
  },
  {
    id: 'constraints',
    name: 'Task & Constraints',
    description: 'Defines strict boundaries, criteria, forbidden actions, and precise output shape like JSON.',
    category: 'Development',
    platform: 'Gemini',
    tags: 'constraints, safety, json',
    title: 'Strict Task & Constraints',
    promptDesc: 'Enforce strict constraints, output formatting schema (like JSON), and scope guidelines.',
    content: `Context:
{{background_info}}

Your Task:
Create a detailed {{deliverable}} based on the input: {{input_data}}

Strict Constraints:
1. Do not include any preambles or post-response chatter.
2. Limit the response length to under {{max_length}}.
3. Use a tone that is {{tone}}.

Required Output Format:
Provide your response in JSON format matching this schema:
{{json_schema}}`
  }
];

const validatePromptContent = (content: string) => {
  const c = content.toLowerCase();
  
  // 1. Persona Definition Check
  const personaKeywords = ['you are', 'act as', 'role of', 'persona', 'expert', 'specialist', 'assistant', 'tutor', 'engineer', 'developer', 'designer', 'analyst', 'copywriter', 'consultant', 'manager', 'thinker', 'writer', 'agent'];
  const hasPersona = personaKeywords.some(kw => c.includes(kw));
  
  // 2. Context & Background Check
  const contextKeywords = ['context', 'about', 'background', 'topic', 'subject', 'scenario', 'problem', 'input', 'when', 'given', 'here is', 'source', 'data', 'details', 'goal', 'objective', 'situation'];
  const hasContext = contextKeywords.some(kw => c.includes(kw)) || content.length > 80;
  
  // 3. Output Format Instructions Check
  const formatKeywords = ['format', 'output', 'json', 'markdown', 'list', 'bullets', 'structure', 'respond with', 'produce', 'reply', 'schema', 'steps', 'table', 'style', 'xml', 'csv', 'yaml', 'syntax', 'render'];
  const hasFormat = formatKeywords.some(kw => c.includes(kw));

  // 4. Variable Brace Check
  const hasVariables = /\{\{([^}]+)\}\}/.test(content);
  const varsCount = (content.match(/\{\{([^}]+)\}\}/g) || []).length;

  const score = (hasPersona ? 1 : 0) + (hasContext ? 1 : 0) + (hasFormat ? 1 : 0);

  return {
    hasPersona,
    hasContext,
    hasFormat,
    hasVariables,
    varsCount,
    score,
  };
};

interface PromptLibraryProps {
  prompts: Prompt[];
  categories: string[];
  onAddPrompt: (p: Partial<Prompt>) => Promise<Prompt>;
  onUpdatePrompt: (id: string, updates: Partial<Prompt> & { versionComment?: string }) => Promise<Prompt>;
  onDeletePrompt: (id: string) => Promise<void>;
  isDark: boolean;
  selectedPromptId?: string | null;
  forceAddPrompt?: boolean;
  onClearForceAddPrompt?: () => void;
}

export default function PromptLibrary({
  prompts,
  categories,
  onAddPrompt,
  onUpdatePrompt,
  onDeletePrompt,
  isDark,
  selectedPromptId,
  forceAddPrompt,
  onClearForceAddPrompt
}: PromptLibraryProps) {
  // Sync forceAddPrompt
  useEffect(() => {
    if (forceAddPrompt) {
      setIsAdding(true);
      setFormTitle('');
      setFormDesc('');
      setFormContent('');
      setFormCategory('General');
      setFormPlatform('Gemini');
      setFormTagsString('');
      setIsEditing(false);
      setSelectedPrompt(null);
      if (onClearForceAddPrompt) {
        onClearForceAddPrompt();
      }
    }
  }, [forceAddPrompt]);

  // Master-Detail, selected prompt state
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  
  // Filtering & search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('All');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // Form states (Add/Edit)
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formPlatform, setFormPlatform] = useState('Gemini');
  const [formTagsString, setFormTagsString] = useState('');
  const [formVersionComment, setFormVersionComment] = useState('');

  // Drafts & Autosave States
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const [detectedDraft, setDetectedDraft] = useState<any | null>(null);

  // Dynamic template variables compiler
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [compiledPrompt, setCompiledPrompt] = useState('');

  // Copy states
  const [copied, setCopied] = useState(false);
  const [copiedCompiled, setCopiedCompiled] = useState(false);
  const [copiedApiJson, setCopiedApiJson] = useState(false);

  // Tags filter selection state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Multi-select / Bulk Operations States
  const [selectedPromptIds, setSelectedPromptIds] = useState<string[]>([]);
  const [bulkActionType, setBulkActionType] = useState<'tag_add' | 'tag_remove' | 'change_category' | 'none'>('none');
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkCategorySelect, setBulkCategorySelect] = useState('General');

  const handleBulkDelete = async () => {
    if (selectedPromptIds.length === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedPromptIds.length} selected prompts?`)) {
      for (const id of selectedPromptIds) {
        await onDeletePrompt(id);
      }
      setSelectedPromptIds([]);
      setSelectedPrompt(null);
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedPromptIds.length === 0) return;
    for (const id of selectedPromptIds) {
      const p = prompts.find(item => item.id === id);
      if (p) {
        await onAddPrompt({
          title: `${p.title} Copy`,
          description: p.description,
          content: p.content,
          category: p.category,
          platform: p.platform,
          tags: p.tags
        });
      }
    }
    setSelectedPromptIds([]);
  };

  const handleBulkArchive = async () => {
    if (selectedPromptIds.length === 0) return;
    if (confirm(`Archive ${selectedPromptIds.length} selected prompts? (This will set their category to "Archived" and append #archived tag)`)) {
      for (const id of selectedPromptIds) {
        const p = prompts.find(item => item.id === id);
        if (p) {
          const currentTags = p.tags || [];
          const updatedTags = currentTags.includes('archived') ? currentTags : [...currentTags, 'archived'];
          await onUpdatePrompt(id, {
            category: 'Archived',
            tags: updatedTags
          });
        }
      }
      setSelectedPromptIds([]);
    }
  };

  const handleBulkExport = () => {
    if (selectedPromptIds.length === 0) return;
    const selectedList = prompts.filter(p => selectedPromptIds.includes(p.id));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(selectedList, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `prompts_bulk_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setSelectedPromptIds([]);
  };

  const handleBulkActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPromptIds.length === 0) return;

    try {
      if (bulkActionType === 'tag_add') {
        const tagsToAdd = bulkInputText.split(',').map(t => t.trim()).filter(t => t.length > 0);
        for (const id of selectedPromptIds) {
          const p = prompts.find(item => item.id === id);
          if (p) {
            const currentTags = p.tags || [];
            const newTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
            await onUpdatePrompt(id, { tags: newTags });
          }
        }
      } else if (bulkActionType === 'tag_remove') {
        const tagsToRemove = bulkInputText.split(',').map(t => t.trim()).filter(t => t.length > 0);
        for (const id of selectedPromptIds) {
          const p = prompts.find(item => item.id === id);
          if (p) {
            const currentTags = p.tags || [];
            const newTags = currentTags.filter(t => !tagsToRemove.includes(t));
            await onUpdatePrompt(id, { tags: newTags });
          }
        }
      } else if (bulkActionType === 'change_category') {
        const targetCat = bulkCategorySelect.trim();
        if (!targetCat) return;
        for (const id of selectedPromptIds) {
          await onUpdatePrompt(id, { category: targetCat });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSelectedPromptIds([]);
      setBulkActionType('none');
      setBulkInputText('');
    }
  };

  // Version History Viewer
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);

  // Version Comparison states
  const [isComparingVersions, setIsComparingVersions] = useState(false);
  const [diffVersionA, setDiffVersionA] = useState<number | 'current'>('current');
  const [diffVersionB, setDiffVersionB] = useState<number | 'current'>('current');
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [activeDetailTab, setActiveDetailTab] = useState<'content' | 'history'>('content');

  const getContentForVersion = (verVal: number | 'current') => {
    if (!selectedPrompt) return '';
    if (verVal === 'current') return selectedPrompt.content;
    const found = selectedPrompt.versions.find(v => v.version === verVal);
    return found ? found.content : '';
  };

  const getLineDiff = (text1: string, text2: string) => {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    
    const dp: number[][] = Array(lines1.length + 1).fill(null).map(() => Array(lines2.length + 1).fill(0));
    for (let i = 1; i <= lines1.length; i++) {
      for (let j = 1; j <= lines2.length; j++) {
        if (lines1[i - 1] === lines2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const diff: { type: 'added' | 'removed' | 'unchanged'; value: string }[] = [];
    let i = lines1.length;
    let j = lines2.length;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
        diff.unshift({ type: 'unchanged', value: lines1[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'added', value: lines2[j - 1] });
        j--;
      } else {
        diff.unshift({ type: 'removed', value: lines1[i - 1] });
        i--;
      }
    }
    return diff;
  };

  // Sync selected prompt from props if requested
  useEffect(() => {
    if (selectedPromptId) {
      const p = prompts.find(pr => pr.id === selectedPromptId);
      if (p) {
        setSelectedPrompt(p);
        setIsEditing(false);
        setIsAdding(false);
      }
    } else if (prompts.length > 0 && !selectedPrompt) {
      setSelectedPrompt(prompts[0]);
    }
  }, [selectedPromptId, prompts]);

  // Extract variables in braces e.g. {{topic}}
  useEffect(() => {
    if (selectedPrompt) {
      const matches = selectedPrompt.content.match(/\{\{([^}]+)\}\}/g);
      if (matches) {
        const uniqueVars = Array.from(new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '').trim()))) as string[];
        const initialVars: Record<string, string> = {};
        uniqueVars.forEach(v => {
          initialVars[v] = templateVars[v] || '';
        });
        setTemplateVars(initialVars);
      } else {
        setTemplateVars({});
      }
      setSelectedVersion(null);
      setIsReadOnly(true);
      setActiveDetailTab('content');
      setIsComparingVersions(false);
    }
  }, [selectedPrompt]);

  // Compile prompt on variable change
  useEffect(() => {
    if (selectedPrompt) {
      let result = selectedPrompt.content;
      Object.entries(templateVars).forEach(([key, val]) => {
        // Safe regex replace
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
        result = result.replace(regex, val || `{{${key}}}`);
      });
      setCompiledPrompt(result);
    }
  }, [templateVars, selectedPrompt]);

  // Load draft if exists
  useEffect(() => {
    let active = true;
    const checkDraft = async () => {
      setDetectedDraft(null);
      setDraftSavedAt('');

      if (isAdding) {
        const draft = await getDraft('prompt_new');
        if (active && draft && (draft.content || draft.title || draft.description)) {
          setDetectedDraft(draft);
        }
      } else if (isEditing && selectedPrompt) {
        const draft = await getDraft('prompt_' + selectedPrompt.id);
        if (active && draft) {
          // Compare draft content against current selectedPrompt to ensure it is different
          const isDifferent = 
            draft.content !== selectedPrompt.content || 
            draft.title !== selectedPrompt.title || 
            draft.description !== selectedPrompt.description ||
            draft.category !== selectedPrompt.category ||
            draft.platform !== selectedPrompt.platform ||
            (draft.tagsString || '') !== (selectedPrompt.tags ? selectedPrompt.tags.join(', ') : '');
            
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
  }, [isAdding, isEditing, selectedPrompt]);

  // Periodic / Debounced Autosave for prompts
  useEffect(() => {
    let timeoutId: any;

    if (isAdding) {
      const hasUnsavedChanges = formContent || formTitle || formDesc || formTagsString;
      if (hasUnsavedChanges) {
        timeoutId = setTimeout(async () => {
          await saveDraft('prompt_new', {
            type: 'prompt',
            targetId: 'new',
            title: formTitle,
            description: formDesc,
            content: formContent,
            category: formCategory,
            platform: formPlatform,
            tagsString: formTagsString
          });
          setDraftSavedAt(new Date().toLocaleTimeString());
        }, 3000); // Autosave after 3 seconds of inactivity
      }
    } else if (isEditing && selectedPrompt) {
      const isDifferent = 
        formContent !== selectedPrompt.content || 
        formTitle !== selectedPrompt.title || 
        formDesc !== selectedPrompt.description ||
        formCategory !== selectedPrompt.category ||
        formPlatform !== selectedPrompt.platform ||
        formTagsString !== (selectedPrompt.tags ? selectedPrompt.tags.join(', ') : '');

      if (isDifferent) {
        timeoutId = setTimeout(async () => {
          await saveDraft('prompt_' + selectedPrompt.id, {
            type: 'prompt',
            targetId: selectedPrompt.id,
            title: formTitle,
            description: formDesc,
            content: formContent,
            category: formCategory,
            platform: formPlatform,
            tagsString: formTagsString
          });
          setDraftSavedAt(new Date().toLocaleTimeString());
        }, 3000); // Autosave after 3 seconds of inactivity
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    isAdding,
    isEditing,
    selectedPrompt,
    formContent,
    formTitle,
    formDesc,
    formCategory,
    formPlatform,
    formTagsString
  ]);

  const handleCopy = (text: string, type: 'original' | 'compiled') => {
    navigator.clipboard.writeText(text);
    if (type === 'original') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopiedCompiled(true);
      setTimeout(() => setCopiedCompiled(false), 2000);
    }
  };

  const handleCopyApiJson = (content: string, platform: string) => {
    let jsonPayload: any = {};
    const plat = platform.toLowerCase();
    
    if (plat === 'gemini') {
      jsonPayload = {
        contents: [
          {
            parts: [
              {
                text: content
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };
    } else if (plat === 'chatgpt' || plat === 'claude' || plat === 'copilot' || plat === 'cursor' || plat === 'windsurf') {
      const modelName = plat === 'chatgpt' ? 'gpt-4o' : plat === 'claude' ? 'claude-3-5-sonnet' : 'custom-model';
      jsonPayload = {
        model: modelName,
        messages: [
          {
            role: "user",
            content: content
          }
        ],
        temperature: 0.7,
        max_tokens: 2048
      };
    } else {
      jsonPayload = {
        prompt: content,
        temperature: 0.7,
        max_tokens: 2048
      };
    }

    const formattedJson = JSON.stringify(jsonPayload, null, 2);
    navigator.clipboard.writeText(formattedJson);
    setCopiedApiJson(true);
    setTimeout(() => setCopiedApiJson(false), 2000);
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = formTagsString.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (isAdding) {
      const newP = await onAddPrompt({
        title: formTitle,
        description: formDesc,
        content: formContent,
        category: formCategory,
        platform: formPlatform,
        tags
      });
      await deleteDraft('prompt_new');
      setDraftSavedAt('');
      setDetectedDraft(null);
      setSelectedPrompt(newP);
      setIsAdding(false);
    } else if (isEditing && selectedPrompt) {
      const updated = await onUpdatePrompt(selectedPrompt.id, {
        title: formTitle,
        description: formDesc,
        content: formContent,
        category: formCategory,
        platform: formPlatform,
        tags,
        versionComment: formVersionComment || undefined
      });
      await deleteDraft('prompt_' + selectedPrompt.id);
      setDraftSavedAt('');
      setDetectedDraft(null);
      setSelectedPrompt(updated);
      setIsEditing(false);
    }
  };

  const startAddPrompt = () => {
    setFormTitle('');
    setFormDesc('');
    setFormContent('');
    setFormCategory('General');
    setFormPlatform('Gemini');
    setFormTagsString('');
    setFormVersionComment('');
    setIsAdding(true);
    setIsEditing(false);
  };

  const startEditPrompt = () => {
    if (!selectedPrompt) return;
    setFormTitle(selectedPrompt.title);
    setFormDesc(selectedPrompt.description);
    setFormContent(selectedPrompt.content);
    setFormCategory(selectedPrompt.category);
    setFormPlatform(selectedPrompt.platform);
    setFormTagsString(selectedPrompt.tags.join(', '));
    setFormVersionComment('');
    setIsEditing(true);
    setIsAdding(false);
  };

  const handleApplyTemplate = (template: typeof PROFESSIONAL_TEMPLATES[0]) => {
    if (!formContent.trim() || confirm(`Applying the template "${template.name}" will overwrite your current form inputs. Do you want to proceed?`)) {
      setFormTitle(template.title);
      setFormDesc(template.promptDesc);
      setFormContent(template.content);
      setFormCategory(template.category);
      setFormPlatform(template.platform);
      setFormTagsString(template.tags);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrompt) return;
    if (confirm(`Are you sure you want to delete prompt "${selectedPrompt.title}"?`)) {
      const idToDelete = selectedPrompt.id;
      await onDeletePrompt(idToDelete);
      setSelectedPrompt(null);
    }
  };

  const handleToggleFavorite = async () => {
    if (!selectedPrompt) return;
    const updated = await onUpdatePrompt(selectedPrompt.id, {
      isFavorite: !selectedPrompt.isFavorite
    });
    setSelectedPrompt(updated);
  };

  // Filter prompts
  const filteredPrompts = prompts.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesPlatform = selectedPlatform === 'All' || p.platform === selectedPlatform;
    const matchesFavorite = !showOnlyFavorites || p.isFavorite;

    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => p.tags && p.tags.includes(tag));

    return matchesSearch && matchesCategory && matchesPlatform && matchesFavorite && matchesTags;
  });

  const allPromptTags = Array.from(
    new Set(prompts.flatMap(p => p.tags || []).map(t => t.trim()).filter(t => t.length > 0))
  ).sort();

  const getPlatformBg = (plat: string) => {
    switch (plat.toLowerCase()) {
      case 'gemini': return 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20';
      case 'claude': return 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20';
      case 'chatgpt': return 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20';
      case 'cursor': return 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20';
      default: return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-130px)] animate-fade-in">
      
      {/* Master List Column (5 cols) */}
      {!(isAdding || isEditing) && (
        <div className={`lg:col-span-5 flex flex-col h-full border rounded-2xl overflow-hidden ${
          isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
        } shadow-sm`}>
          
          {/* Search & Header */}
        <div className={`p-4 border-b space-y-3 ${isDark ? 'border-zinc-800/60' : 'border-zinc-150'}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              Prompt Library
            </h2>
            <button
              onClick={startAddPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Prompt
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search prompts, tags, keywords..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 text-sm rounded-xl border outline-none transition-all ${
                isDark 
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                  : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
              }`}
            />
          </div>

          {/* Quick Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs shrink-0 no-scrollbar">
            <button
              onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                showOnlyFavorites 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                  : 'bg-zinc-500/5 border-transparent text-zinc-500 hover:bg-zinc-500/10'
              }`}
            >
              <Star className={`w-3 h-3 ${showOnlyFavorites ? 'fill-amber-500' : ''}`} />
              Starred
            </button>

            <span className="text-zinc-300 dark:text-zinc-800">|</span>

            {/* Category selection */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`outline-none bg-transparent border-transparent text-zinc-500 hover:text-zinc-700 font-medium cursor-pointer ${isDark ? 'dark:text-zinc-400' : ''}`}
            >
              <option value="All" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat} className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>{cat}</option>
              ))}
            </select>

            <span className="text-zinc-300 dark:text-zinc-800">|</span>

            {/* Platform selection */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="outline-none bg-transparent border-transparent text-zinc-500 hover:text-zinc-700 font-medium cursor-pointer"
            >
              <option value="All" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>All Platforms</option>
              <option value="Gemini" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>Gemini</option>
              <option value="Claude" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>Claude</option>
              <option value="ChatGPT" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>ChatGPT</option>
              <option value="Cursor" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>Cursor</option>
              <option value="Windsurf" className={isDark ? 'bg-zinc-950 text-zinc-200' : 'bg-white'}>Windsurf</option>
            </select>
          </div>

          {/* Selected Tags list */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-1 pt-1">
              {selectedTags.map(tag => (
                <span 
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-violet-500/20 text-violet-400 border border-violet-500/30 cursor-pointer font-medium hover:bg-violet-500/30"
                >
                  #{tag}
                  <X className="w-3 h-3 text-violet-400 hover:text-white" />
                </span>
              ))}
              <button 
                type="button" 
                onClick={() => setSelectedTags([])}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* All Prompt Tags Cloud */}
          {allPromptTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 text-[10px] no-scrollbar shrink-0">
              <span className="text-zinc-400 shrink-0 font-semibold uppercase tracking-wider text-[9px]">Tags:</span>
              {allPromptTags.map(tag => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer shrink-0 text-[10px] ${
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
          )}

          {/* Multi-select control bar */}
          <div className="flex items-center justify-between pt-2 border-t dark:border-zinc-800/60 border-zinc-150 text-xs">
            <button
              type="button"
              onClick={() => {
                if (selectedPromptIds.length === filteredPrompts.length) {
                  setSelectedPromptIds([]);
                } else {
                  setSelectedPromptIds(filteredPrompts.map(p => p.id));
                }
              }}
              className="text-zinc-500 dark:text-zinc-400 hover:text-violet-500 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {selectedPromptIds.length === filteredPrompts.length && filteredPrompts.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-violet-500" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{selectedPromptIds.length > 0 ? `Selected ${selectedPromptIds.length}` : 'Select All'}</span>
            </button>
            {selectedPromptIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPromptIds([])}
                className="text-red-500 hover:underline text-[11px]"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedPromptIds.length > 0 && (
          <div className="bg-violet-600/10 border-b border-violet-500/20 p-3 space-y-2 shrink-0 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-bold text-violet-400">
              <span>Bulk Action ({selectedPromptIds.length} selected):</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleBulkDuplicate}
                  className="px-2 py-1 bg-violet-600/25 hover:bg-violet-600/45 text-violet-200 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Duplicate selected prompts"
                >
                  <Copy className="w-3 h-3" /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={handleBulkArchive}
                  className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Archive selected prompts"
                >
                  <Archive className="w-3 h-3" /> Archive
                </button>
                <button
                  type="button"
                  onClick={handleBulkExport}
                  className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Export selected prompts"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/35 text-red-400 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Delete selected prompts"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => { setBulkActionType(bulkActionType === 'tag_add' ? 'none' : 'tag_add'); setBulkInputText(''); }}
                className={`px-2 py-1 rounded text-[10px] border font-medium cursor-pointer ${bulkActionType === 'tag_add' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
              >
                + Add Tags
              </button>
              <button
                type="button"
                onClick={() => { setBulkActionType(bulkActionType === 'tag_remove' ? 'none' : 'tag_remove'); setBulkInputText(''); }}
                className={`px-2 py-1 rounded text-[10px] border font-medium cursor-pointer ${bulkActionType === 'tag_remove' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
              >
                - Remove Tags
              </button>
              <button
                type="button"
                onClick={() => { setBulkActionType(bulkActionType === 'change_category' ? 'none' : 'change_category'); setBulkCategorySelect(categories[0] || 'General'); }}
                className={`px-2 py-1 rounded text-[10px] border font-medium cursor-pointer ${bulkActionType === 'change_category' ? 'bg-violet-600 text-white border-violet-500' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}
              >
                Change Category
              </button>
            </div>

            {bulkActionType !== 'none' && (
              <form onSubmit={handleBulkActionSubmit} className="flex items-center gap-2 pt-1 animate-fade-in">
                {bulkActionType === 'change_category' ? (
                  <div className="flex items-center gap-2 w-full">
                    <select
                      value={bulkCategorySelect}
                      onChange={(e) => setBulkCategorySelect(e.target.value)}
                      className="flex-1 text-xs px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="New Category">+ Create New...</option>
                    </select>
                    {bulkCategorySelect === 'New Category' && (
                      <input
                        type="text"
                        placeholder="New category name..."
                        required
                        value={bulkInputText}
                        onChange={(e) => setBulkInputText(e.target.value)}
                        className="flex-1 text-xs px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder={bulkActionType === 'tag_add' ? "comma-separated tags to add..." : "comma-separated tags to remove..."}
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none focus:border-violet-500"
                  />
                )}
                <button
                  type="submit"
                  className="px-3 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkActionType('none'); setBulkInputText(''); }}
                  className="px-2 py-1 text-zinc-400 hover:text-white text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        )}

        {/* Prompts list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredPrompts.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              No matching prompts found.
            </div>
          ) : (
            filteredPrompts.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedPrompt(p);
                  setIsEditing(false);
                  setIsAdding(false);
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative group/prompt-item ${
                  selectedPrompt?.id === p.id
                    ? isDark 
                      ? 'bg-zinc-850 border-violet-500/50 shadow-md shadow-violet-950/20' 
                      : 'bg-violet-50/40 border-violet-200 shadow-sm'
                    : isDark
                      ? 'bg-zinc-950/40 border-zinc-850 hover:bg-zinc-900/60 hover:border-zinc-800'
                      : 'bg-zinc-50/30 border-zinc-100 hover:bg-zinc-100/40 hover:border-zinc-150'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPromptIds(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        );
                      }}
                      className="p-0.5 rounded hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors shrink-0 text-zinc-400 hover:text-violet-500 cursor-pointer"
                    >
                      {selectedPromptIds.includes(p.id) ? (
                        <CheckSquare className="w-4 h-4 text-violet-500" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-400 dark:text-zinc-600 group-hover/prompt-item:text-zinc-400" />
                      )}
                    </button>
                    <h4 className="font-semibold text-sm line-clamp-1">{p.title}</h4>
                  </div>
                  {p.isFavorite && <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />}
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                  {p.description || p.content}
                </p>

                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getPlatformBg(p.platform)} font-semibold font-mono`}>
                    {p.platform}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {p.category}
                  </span>
                </div>

                {p.tags && p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.tags.map(t => (
                      <span 
                        key={t} 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTagFilter(t);
                        }}
                        className={`text-[9px] px-1.5 py-0.2 rounded-md font-mono ${
                          isDark ? 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-violet-500/40 hover:text-zinc-200' : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:border-violet-500/40 hover:text-zinc-800'
                        }`}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    )}

      {/* Detail Panel Column (7 cols or 12 cols when editing/adding) */}
      <div className={`${(isAdding || isEditing) ? 'lg:col-span-12' : 'lg:col-span-7'} flex flex-col h-full border rounded-2xl overflow-hidden ${
        isDark ? 'bg-zinc-900/30 border-zinc-800/80' : 'bg-white border-zinc-200'
      } shadow-sm`}>
        {isAdding || isEditing ? (
          /* Create / Edit Form */
          <form onSubmit={handleSavePrompt} className="flex flex-col h-full overflow-hidden">
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setIsEditing(false);
                  }}
                  className={`p-1.5 rounded-lg border cursor-pointer ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isAdding ? 'Create New Prompt' : `Edit Prompt: ${selectedPrompt?.title}`}</span>
                  {draftSavedAt && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-500/5 select-none border border-dashed border-zinc-500/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Draft Saved ({draftSavedAt})</span>
                    </span>
                  )}
                </h3>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-sm cursor-pointer"
              >
                Save Prompt
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detectedDraft && (
                <div className={`mb-6 p-4 border rounded-xl flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0 ${
                  isDark ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-850'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>
                      <strong>Unsaved Draft Found:</strong> There is a newer offline draft of this prompt from {new Date(detectedDraft.updatedAt).toLocaleString()}.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (detectedDraft.title !== undefined) setFormTitle(detectedDraft.title);
                        if (detectedDraft.description !== undefined) setFormDesc(detectedDraft.description);
                        if (detectedDraft.content !== undefined) setFormContent(detectedDraft.content);
                        if (detectedDraft.category !== undefined) setFormCategory(detectedDraft.category);
                        if (detectedDraft.platform !== undefined) setFormPlatform(detectedDraft.platform);
                        if (detectedDraft.tagsString !== undefined) setFormTagsString(detectedDraft.tagsString);
                        setDetectedDraft(null);
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500 text-white font-bold hover:bg-amber-600 cursor-pointer text-xs"
                    >
                      Restore Draft
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteDraft(detectedDraft.id);
                        setDetectedDraft(null);
                      }}
                      className="px-2.5 py-1 rounded border border-amber-500/30 hover:bg-amber-500/10 font-medium cursor-pointer text-xs"
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

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                
                {/* Left Column - Main Form Fields (xl:col-span-8) */}
                <div className="xl:col-span-8 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                        Prompt Title
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Code Refactoring Wizard"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className={`w-full px-4 py-2 text-sm rounded-xl border outline-none transition-all ${
                          isDark 
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                        Category
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className={`w-full px-4 py-2.5 text-sm rounded-xl border outline-none cursor-pointer transition-all ${
                          isDark 
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                        }`}
                      >
                        <option value="General">General</option>
                        <option value="Development">Development</option>
                        <option value="Architecture">Architecture</option>
                        <option value="Prompt Engineering">Prompt Engineering</option>
                        <option value="UI/UX Design">UI/UX Design</option>
                        <option value="Refactoring">Refactoring</option>
                        <option value="AI Agent">AI Agent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Enter a brief description explaining what this prompt is used for."
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className={`w-full px-4 py-2 text-sm rounded-xl border outline-none transition-all ${
                        isDark 
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                        Target AI Platform
                      </label>
                      <select
                        value={formPlatform}
                        onChange={(e) => setFormPlatform(e.target.value)}
                        className={`w-full px-4 py-2.5 text-sm rounded-xl border outline-none cursor-pointer transition-all ${
                          isDark 
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
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

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                        Tags (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="React, clean-code, refactor"
                        value={formTagsString}
                        onChange={(e) => setFormTagsString(e.target.value)}
                        className={`w-full px-4 py-2 text-sm rounded-xl border outline-none transition-all ${
                          isDark 
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500 flex justify-between items-center">
                      <span>Prompt Core Content</span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 normal-case">Supports markdown. Wrap variables in braces like <code className="font-mono text-violet-400">{"{{variable}}"}</code></span>
                    </label>
                    <textarea
                      required
                      rows={14}
                      placeholder="You are an AI assistant specialized in..."
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      className={`w-full px-4 py-3 text-sm font-mono rounded-xl border outline-none transition-all resize-none ${
                        isDark 
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                      }`}
                    />
                  </div>

                  {isEditing && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-zinc-500">
                        Version Revision Comment
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Added detailed guidelines for hooks"
                        value={formVersionComment}
                        onChange={(e) => setFormVersionComment(e.target.value)}
                        className={`w-full px-4 py-2 text-sm rounded-xl border outline-none transition-all ${
                          isDark 
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-violet-500' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-violet-500'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* Right Column - Templates & Real-Time Validator (xl:col-span-4) */}
                <div className="xl:col-span-4 space-y-5">
                  
                  {/* Real-time Prompt Validator Panel */}
                  {(() => {
                    const validation = validatePromptContent(formContent);
                    const scorePercentage = Math.round((validation.score / 3) * 100);
                    
                    let ratingText = "Needs Work";
                    let ratingColor = "text-red-500 dark:text-red-400";
                    let barColor = "bg-red-500";
                    if (validation.score === 1) {
                      ratingText = "Needs Work";
                      ratingColor = "text-red-500 dark:text-red-400";
                      barColor = "bg-red-500";
                    } else if (validation.score === 2) {
                      ratingText = "Moderate Quality";
                      ratingColor = "text-amber-500 dark:text-amber-400";
                      barColor = "bg-amber-500";
                    } else if (validation.score === 3) {
                      ratingText = "Excellent Prompt";
                      ratingColor = "text-emerald-500 dark:text-emerald-400";
                      barColor = "bg-emerald-500";
                    }

                    return (
                      <div className={`p-5 rounded-2xl border ${
                        isDark ? 'bg-zinc-950/80 border-zinc-850' : 'bg-zinc-50/50 border-zinc-200'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-violet-500 animate-pulse" />
                            Prompt Validator
                          </span>
                          <span className={`text-xs font-bold ${ratingColor}`}>
                            {ratingText}
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-4">
                          <div 
                            className={`h-full transition-all duration-300 ${barColor}`} 
                            style={{ width: `${Math.max(scorePercentage, 8)}%` }} 
                          />
                        </div>

                        {/* Checklist items */}
                        <div className="space-y-3.5">
                          {/* Item 1: Persona */}
                          <div className="flex items-start gap-2.5">
                            {validation.hasPersona ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="text-xs">
                              <p className={`font-semibold ${validation.hasPersona ? 'text-zinc-300 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                Persona & Role Definition
                              </p>
                              {!validation.hasPersona ? (
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-normal">
                                  Missing words like: <em>"You are"</em> or <em>"Act as"</em>. 
                                  <button 
                                    type="button"
                                    onClick={() => setFormContent("You are an expert AI assistant specialized in... \n\n" + formContent)}
                                    className="text-violet-400 hover:underline font-semibold ml-1 cursor-pointer block mt-1 text-left"
                                  >
                                    + Insert Persona Header
                                  </button>
                                </p>
                              ) : (
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                                  Looks great! Model persona is defined.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Item 2: Context */}
                          <div className="flex items-start gap-2.5">
                            {validation.hasContext ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="text-xs">
                              <p className={`font-semibold ${validation.hasContext ? 'text-zinc-300 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                Context & Background Info
                              </p>
                              {!validation.hasContext ? (
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-normal">
                                  Provide context keywords (e.g. <em>"Context:"</em>, <em>"About:"</em>) or expand your instructions.
                                  <button 
                                    type="button"
                                    onClick={() => setFormContent(formContent + "\n\nContext:\n- [Add background details here]")}
                                    className="text-violet-400 hover:underline font-semibold ml-1 cursor-pointer block mt-1 text-left"
                                  >
                                    + Append Context Section
                                  </button>
                                </p>
                              ) : (
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                                  Context indicators are solid.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Item 3: Format */}
                          <div className="flex items-start gap-2.5">
                            {validation.hasFormat ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            )}
                            <div className="text-xs">
                              <p className={`font-semibold ${validation.hasFormat ? 'text-zinc-300 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                Output Format Instructions
                              </p>
                              {!validation.hasFormat ? (
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-normal">
                                  Define expected formatting terms (e.g. <em>"JSON"</em>, <em>"Markdown"</em>, <em>"List"</em>).
                                  <button 
                                    type="button"
                                    onClick={() => setFormContent(formContent + "\n\nOutput Format:\n- Provide response in clean markdown format.")}
                                    className="text-violet-400 hover:underline font-semibold ml-1 cursor-pointer block mt-1 text-left"
                                  >
                                    + Append Formatting Rule
                                  </button>
                                </p>
                              ) : (
                                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-normal">
                                  Format requirements are explicitly set.
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Dynamic Variables Tracker */}
                          <div className="border-t border-zinc-850 pt-3 flex items-center justify-between text-xs font-mono text-zinc-400">
                            <span>Dynamic Variables:</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold ${validation.hasVariables ? 'bg-violet-500/10 text-violet-400' : 'bg-zinc-800 text-zinc-500'}`}>
                              {validation.varsCount} found
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quick Template Cloner Panel */}
                  <div className={`p-5 rounded-2xl border flex flex-col ${
                    isDark ? 'bg-zinc-950/80 border-zinc-850' : 'bg-zinc-50/50 border-zinc-200'
                  }`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-violet-500" />
                      Use Template Framework
                    </span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 leading-normal">
                      Quickly clone structure from predefined professional prompt frameworks:
                    </p>

                     <div className="space-y-2.5 max-h-[220px] overflow-y-auto overflow-x-hidden pr-1">
                      {PROFESSIONAL_TEMPLATES.map(temp => (
                        <div 
                          key={temp.id}
                          onClick={() => handleApplyTemplate(temp)}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                            isDark 
                              ? 'bg-zinc-900/40 border-zinc-850 hover:border-violet-500/50 hover:bg-zinc-900/80' 
                              : 'bg-white border-zinc-200 hover:border-violet-500/50 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <h5 className={`font-semibold text-xs flex items-center gap-1 ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                              {temp.name}
                            </h5>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-violet-500/10 text-violet-400 font-medium whitespace-nowrap shrink-0">
                              Clone
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 line-clamp-2 leading-normal">
                            {temp.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </form>
        ) : selectedPrompt ? (
          /* View Details */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className={`p-6 border-b flex flex-wrap md:flex-nowrap items-center justify-between gap-4 ${isDark ? 'border-zinc-850' : 'border-zinc-150'}`}>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-xl tracking-tight">{selectedPrompt.title}</h3>
                  <button
                    onClick={handleToggleFavorite}
                    className="p-1 text-zinc-400 hover:text-amber-500 transition-colors"
                  >
                    <Star className={`w-5 h-5 ${selectedPrompt.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{selectedPrompt.description}</p>
                {selectedPrompt.tags && selectedPrompt.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedPrompt.tags.map(t => (
                      <span 
                        key={t}
                        onClick={() => toggleTagFilter(t)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border cursor-pointer ${
                          selectedTags.includes(t)
                            ? 'bg-violet-600 border-violet-500 text-white font-bold'
                            : isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-violet-500/40' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800 hover:border-violet-500/40'
                        }`}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Read-Only Lock Toggle */}
                <button
                  type="button"
                  onClick={() => setIsReadOnly(!isReadOnly)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer select-none ${
                    isReadOnly
                      ? isDark 
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' 
                        : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                      : isDark 
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-750 hover:text-zinc-200' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                  title={isReadOnly ? "Unlock editing" : "Lock as read-only"}
                >
                  {isReadOnly ? <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" /> : <Unlock className="w-3.5 h-3.5 shrink-0" />}
                  <span className="hidden sm:inline">
                    {isReadOnly ? 'Locked (Read-Only)' : 'Unlock to Edit'}
                  </span>
                  <span className="sm:hidden">
                    {isReadOnly ? 'Locked' : 'Unlocked'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={isReadOnly ? undefined : startEditPrompt}
                  disabled={isReadOnly}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isReadOnly
                      ? 'opacity-40 cursor-not-allowed bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-600'
                      : isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-750 text-zinc-300 cursor-pointer' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 text-zinc-700 cursor-pointer'
                  }`}
                  title={isReadOnly ? "Unlock to edit prompt" : "Edit prompt"}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={isReadOnly ? undefined : handleDelete}
                  disabled={isReadOnly}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isReadOnly
                      ? 'opacity-40 cursor-not-allowed bg-zinc-100 border-zinc-200 text-zinc-400 dark:bg-zinc-900/40 dark:border-zinc-800 dark:text-zinc-600'
                      : 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20 cursor-pointer'
                  }`}
                  title={isReadOnly ? "Unlock to delete prompt" : "Delete prompt"}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isReadOnly && (
              <div className={`px-6 py-3 flex items-center justify-between text-xs font-medium border-b transition-all ${
                isDark 
                  ? 'bg-amber-500/5 border-amber-500/10 text-amber-400/90' 
                  : 'bg-amber-50 border-amber-100 text-amber-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 animate-pulse text-amber-500 shrink-0" />
                  <span><strong>Read-Only Mode Active:</strong> Accidental edits are prevented. Click the unlock icon to make changes.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReadOnly(false)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border shrink-0 cursor-pointer ${
                    isDark 
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' 
                      : 'bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  Unlock
                </button>
              </div>
            )}

            {/* Tab Navigation */}
            <div className={`px-6 border-b flex items-center gap-1.5 shrink-0 ${isDark ? 'border-zinc-850 bg-zinc-900/10' : 'border-zinc-150 bg-zinc-50/50'}`}>
              <button
                type="button"
                onClick={() => setActiveDetailTab('content')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer select-none ${
                  activeDetailTab === 'content'
                    ? 'border-violet-600 text-violet-500 font-extrabold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                Prompt Content
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('history')}
                className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 select-none ${
                  activeDetailTab === 'history'
                    ? 'border-violet-600 text-violet-500 font-extrabold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Version History
                {selectedPrompt.versions && selectedPrompt.versions.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeDetailTab === 'history' ? 'bg-violet-500/15 text-violet-400' : 'bg-zinc-500/10 text-zinc-500'
                  }`}>
                    {selectedPrompt.versions.length}
                  </span>
                )}
              </button>
            </div>

            {/* Scrollable Workspace */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeDetailTab === 'history' ? (
                /* VERSION HISTORY TAB */
                <div className="space-y-6 animate-fade-in">
                  {selectedPrompt.versions && selectedPrompt.versions.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Left Panel: Versions List (5 cols) */}
                      <div className="lg:col-span-5 space-y-3">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-400">
                          Select a Version
                        </h4>
                        <div className={`border rounded-2xl divide-y overflow-hidden max-h-[450px] overflow-y-auto ${
                          isDark ? 'border-zinc-850 divide-zinc-850 bg-zinc-950/20' : 'border-zinc-150 divide-zinc-150 bg-zinc-50/20'
                        }`}>
                          {[...selectedPrompt.versions].reverse().map((ver) => {
                            const isSelected = selectedVersion?.version === ver.version;
                            return (
                              <div
                                key={ver.version}
                                onClick={() => setSelectedVersion(ver)}
                                className={`p-4 text-xs cursor-pointer transition-colors text-left ${
                                  isSelected
                                    ? isDark ? 'bg-violet-950/30' : 'bg-violet-50/70'
                                    : isDark ? 'hover:bg-zinc-900/60 bg-zinc-900/10' : 'hover:bg-zinc-50 bg-white'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[10px] ${
                                    isSelected
                                      ? 'bg-violet-600 text-white'
                                      : isDark ? 'bg-zinc-850 text-zinc-300' : 'bg-zinc-200 text-zinc-600'
                                  }`}>
                                    v{ver.version}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 font-mono">
                                    {new Date(ver.updatedAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className={`font-semibold line-clamp-2 ${isSelected ? 'text-violet-500' : isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                  {ver.comment || 'No comment provided'}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Panel: Selected Version Preview & Comparison (7 cols) */}
                      <div className="lg:col-span-7 space-y-4">
                        {selectedVersion ? (
                          <div className={`p-5 rounded-2xl border ${isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50 border-zinc-200'} space-y-4`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b dark:border-zinc-850">
                              <div>
                                <h4 className="font-bold text-sm flex items-center gap-1.5 text-violet-500">
                                  <History className="w-4 h-4" />
                                  Version v{selectedVersion.version}
                                </h4>
                                <p className="text-[10px] text-zinc-400 font-mono mt-1">
                                  Saved on {new Date(selectedVersion.updatedAt).toLocaleString()}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdatePrompt(selectedPrompt.id, { 
                                    content: selectedVersion.content, 
                                    versionComment: `Restored Version ${selectedVersion.version}` 
                                  }).then((updated) => {
                                    setSelectedPrompt(updated);
                                    setSelectedVersion(null);
                                    setActiveDetailTab('content');
                                  });
                                }}
                                className="px-3 py-1.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 cursor-pointer font-bold text-xs shadow-sm transition-all"
                              >
                                Revert to this Version
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                                Revision Comment
                              </span>
                              <p className={`p-3 rounded-xl text-xs font-medium border border-dashed ${
                                isDark ? 'bg-zinc-900/40 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700'
                              }`}>
                                {selectedVersion.comment || 'No revision comment provided.'}
                              </p>
                            </div>

                            {/* Version Content display with comparison option */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                                  Version Content
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-zinc-400 font-medium">Compare with current</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsComparingVersions(true);
                                      setDiffVersionA(selectedVersion.version);
                                      setDiffVersionB('current');
                                      setActiveDetailTab('content'); // switch to compare in content tab for full rendering
                                    }}
                                    className="text-[11px] font-bold text-violet-500 hover:underline cursor-pointer"
                                  >
                                    Open Diff View
                                  </button>
                                </div>
                              </div>
                              <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[250px] overflow-y-auto p-4 rounded-xl border ${
                                isDark ? 'bg-zinc-900/40 border-zinc-850 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-600'
                              }`}>
                                {selectedVersion.content}
                              </pre>
                            </div>
                          </div>
                        ) : (
                          <div className={`p-8 rounded-2xl border border-dashed text-center ${
                            isDark ? 'border-zinc-850 text-zinc-500' : 'border-zinc-200 text-zinc-400'
                          }`}>
                            <History className="w-8 h-8 mx-auto mb-2 text-zinc-400 opacity-60 animate-pulse" />
                            <p className="text-xs font-medium">
                              Select a version on the left to see details, preview code, or revert back to it.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`p-8 rounded-2xl border border-dashed text-center ${
                      isDark ? 'border-zinc-850 text-zinc-500' : 'border-zinc-200 text-zinc-400'
                    }`}>
                      <History className="w-8 h-8 mx-auto mb-2 text-zinc-400 opacity-60" />
                      <p className="text-sm font-semibold mb-1">No Previous Versions Found</p>
                      <p className="text-xs max-w-sm mx-auto leading-relaxed">
                        This prompt is currently on its initial version. When you modify this prompt in the editor, previous iterations will be saved and listed here.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* PROMPT CONTENT TAB (Original single/compare views) */
                <>
                  {/* Prompt Body Card */}
                  <div className={`p-5 rounded-2xl border ${isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50 border-zinc-100'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b dark:border-zinc-850">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1 shrink-0">
                          <Code className="w-3.5 h-3.5 text-violet-500" />
                          {isComparingVersions ? 'Diff Version History' : 'Prompt Content'}
                        </span>

                        {/* Compare toggler */}
                        <div className={`flex rounded-lg p-0.5 border text-[11px] font-semibold ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'}`}>
                          <button
                            type="button"
                            onClick={() => setIsComparingVersions(false)}
                            className={`px-2.5 py-1 rounded cursor-pointer transition-all ${
                              !isComparingVersions
                                ? 'bg-violet-600 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                          >
                            Single View
                          </button>
                          {selectedPrompt.versions && selectedPrompt.versions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                {
                                  setIsComparingVersions(true);
                                  if (selectedPrompt.versions.length > 0) {
                                    setDiffVersionA(selectedPrompt.versions[0].version);
                                    setDiffVersionB('current');
                                  }
                                }
                              }}
                              className={`px-2.5 py-1 rounded cursor-pointer transition-all ${
                                isComparingVersions
                                  ? 'bg-violet-600 text-white shadow-sm'
                                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                              }`}
                            >
                              Compare Versions
                            </button>
                          )}
                        </div>
                      </div>

                      {!isComparingVersions ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(selectedVersion ? selectedVersion.content : selectedPrompt.content, 'original')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              copied 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                : isDark ? 'bg-zinc-850 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            }`}
                          >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied!' : 'Copy Code'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyApiJson(selectedVersion ? selectedVersion.content : selectedPrompt.content, selectedPrompt.platform)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              copiedApiJson 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                : isDark ? 'bg-zinc-850 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            }`}
                            title="Copy prompt as an API request payload JSON"
                          >
                            {copiedApiJson ? <Check className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5 text-violet-500" />}
                            {copiedApiJson ? 'JSON Copied!' : 'Copy as API JSON'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-mono font-medium text-zinc-400">
                          Showing differences between A and B
                        </div>
                      )}
                    </div>
                    
                    {!isComparingVersions ? (
                      <>
                        <div className="relative">
                          <pre className={`text-xs md:text-sm font-mono whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto p-4 rounded-xl border border-dashed transition-all ${
                            isReadOnly
                              ? isDark 
                                ? 'bg-amber-500/[0.02] border-amber-500/25 text-zinc-300' 
                                : 'bg-amber-500/[0.01] border-amber-500/30 text-zinc-600'
                              : isDark 
                                ? 'bg-zinc-900/40 border-zinc-800 text-zinc-300' 
                                : 'bg-zinc-100/50 border-zinc-200 text-zinc-600'
                          }`}>
                            {selectedVersion ? selectedVersion.content : selectedPrompt.content}
                          </pre>
                          {isReadOnly && (
                            <div className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider select-none border transition-all ${
                              isDark 
                                ? 'bg-amber-50/10 border-amber-500/20 text-amber-400' 
                                : 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm'
                            }`}>
                              <Lock className="w-2.5 h-2.5 text-amber-500" />
                              Locked
                            </div>
                          )}
                        </div>

                        {selectedVersion && (
                          <div className="mt-3 p-3 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-xs flex items-center justify-between">
                            <span>Viewing <strong>Version {selectedVersion.version}</strong> content</span>
                            <button
                              onClick={() => {
                                onUpdatePrompt(selectedPrompt.id, { content: selectedVersion.content, versionComment: `Restored Version ${selectedVersion.version}` })
                                  .then((updated) => {
                                    setSelectedPrompt(updated);
                                    setSelectedVersion(null);
                                  });
                              }}
                              className="px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 cursor-pointer font-semibold"
                            >
                              Restore This Version
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-4">
                        {/* Version Selection Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-zinc-900/10 dark:bg-zinc-950/40 border dark:border-zinc-850">
                          <div>
                            <label className="block text-[10px] uppercase font-bold tracking-wider text-zinc-500 mb-1">
                              Base Version (A)
                            </label>
                            <select
                              value={diffVersionA}
                              onChange={(e) => setDiffVersionA(e.target.value === 'current' ? 'current' : Number(e.target.value))}
                              className={`w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none cursor-pointer ${
                                isDark 
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-violet-500' 
                                  : 'bg-white border-zinc-200 text-zinc-850 focus:border-violet-500'
                              }`}
                            >
                              <option value="current">Current Version</option>
                              {selectedPrompt.versions.map(v => (
                                <option key={v.version} value={v.version}>v{v.version} ({v.comment || 'No comment'})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold tracking-wider text-zinc-500 mb-1">
                              Comparison Version (B)
                            </label>
                            <select
                              value={diffVersionB}
                              onChange={(e) => setDiffVersionB(e.target.value === 'current' ? 'current' : Number(e.target.value))}
                              className={`w-full px-2.5 py-1.5 text-xs rounded-lg border outline-none cursor-pointer ${
                                isDark 
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-violet-500' 
                                  : 'bg-white border-zinc-200 text-zinc-850 focus:border-violet-500'
                              }`}
                            >
                              <option value="current">Current Version</option>
                              {selectedPrompt.versions.map(v => (
                                <option key={v.version} value={v.version}>v{v.version} ({v.comment || 'No comment'})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Diff Visualization Gutter */}
                        <div className="border rounded-xl overflow-hidden text-xs font-mono max-h-[300px] overflow-y-auto divide-y dark:divide-zinc-900">
                          {(() => {
                            const contentA = getContentForVersion(diffVersionA);
                            const contentB = getContentForVersion(diffVersionB);
                            const diffResult = getLineDiff(contentA, contentB);
                            return diffResult.map((line, lIdx) => {
                              let rowBg = '';
                              let prefix = ' ';
                              if (line.type === 'added') {
                                rowBg = 'bg-emerald-500/10 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500';
                                prefix = '+';
                              } else if (line.type === 'removed') {
                                rowBg = 'bg-red-500/10 dark:bg-red-950/20 text-red-600 dark:text-red-400 border-l-2 border-red-500';
                                prefix = '-';
                              } else {
                                rowBg = 'text-zinc-600 dark:text-zinc-400';
                              }
                              return (
                                <div key={lIdx} className={`p-1.5 font-mono whitespace-pre-wrap leading-relaxed ${rowBg} flex`}>
                                  <span className="w-5 select-none opacity-50 shrink-0">{prefix}</span>
                                  <span>{line.value || ' '}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Interactive Compiler Section */}
                  {Object.keys(templateVars).length > 0 && (
                    <div className={`p-5 rounded-2xl border ${isDark ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50/50 border-zinc-200'}`}>
                      <h4 className="font-bold text-sm mb-3 text-violet-500 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Interactive Prompt Variables Compiler
                      </h4>
                      <p className="text-xs text-zinc-500 mb-4">
                        This prompt contains templates fields. Type parameters below to live compile the optimized prompt!
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        {Object.keys(templateVars).map(v => (
                          <div key={v}>
                            <label className="block text-xs font-semibold mb-1 text-zinc-500">{v}</label>
                            <input
                              type="text"
                              placeholder={`Enter value for ${v}`}
                              value={templateVars[v]}
                              onChange={(e) => setTemplateVars({ ...templateVars, [v]: e.target.value })}
                              className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none transition-all ${
                                isDark 
                                  ? 'bg-zinc-900 border-zinc-800 text-zinc-200 focus:border-violet-500' 
                                  : 'bg-white border-zinc-200 text-zinc-800 focus:border-violet-500'
                              }`}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="relative mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Compiled Result</span>
                          <button
                            onClick={() => handleCopy(compiledPrompt, 'compiled')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                              copiedCompiled 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                : 'bg-violet-600 border-transparent text-white hover:bg-violet-700'
                            }`}
                          >
                            {copiedCompiled ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedCompiled ? 'Compiled Copied!' : 'Copy Compiled Prompt'}
                          </button>
                        </div>
                        <div className={`p-4 rounded-xl border text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto ${
                          isDark ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-150 text-zinc-700'
                        }`}>
                          {compiledPrompt}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-500">
            <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
              <Info className="w-8 h-8 text-violet-500" />
            </div>
            <h3 className="font-semibold text-base mb-1">No prompt selected</h3>
            <p className="text-sm max-w-xs leading-relaxed">
              Select a prompt from the list on the left to inspect, compile variables, or view version histories.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
