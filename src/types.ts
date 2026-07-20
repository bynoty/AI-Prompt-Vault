export interface PromptVersion {
  version: number;
  content: string;
  updatedAt: string;
  comment: string;
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  platform: string; // 'Gemini' | 'Claude' | 'ChatGPT' | 'Cursor' | 'Windsurf' | 'Copilot' | 'Other'
  isFavorite: boolean;
  versions: PromptVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface MarkdownDoc {
  id: string;
  path: string; // e.g., 'rules/context.md'
  title: string;
  content: string;
  isFavorite: boolean;
  updatedAt: string;
  tags?: string[];
}

export interface FolderNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FolderNode[];
}

export interface ActivityLog {
  id: string;
  type: 'create_prompt' | 'update_prompt' | 'delete_prompt' | 'create_doc' | 'update_doc' | 'git_sync' | 'rag_index';
  description: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: string[]; // Source markdown paths or prompt titles
}

export interface DashboardStats {
  promptCount: number;
  docCount: number;
  favoriteCount: number;
  recentUpdated: (Prompt | MarkdownDoc)[];
  mostUsedTags: { tag: string; count: number }[];
  platformStats: { platform: string; count: number }[];
  recentActivity: ActivityLog[];
}
