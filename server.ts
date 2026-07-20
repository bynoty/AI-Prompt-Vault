import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

const execPromise = promisify(exec);

// Supabase Configuration
const rawUrl = process.env.SUPABASE_URL;
const SUPABASE_URL = (rawUrl && rawUrl.startsWith("http")) ? rawUrl : "https://ijpiebqfhsgalypfesti.supabase.co";

const rawKey = process.env.SUPABASE_ANON_KEY;
const SUPABASE_ANON_KEY = (rawKey && rawKey.trim().length > 10) ? rawKey : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqcGllYnFmaHNnYWx5cGZlc3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NjA4NjcsImV4cCI6MjEwMDAzNjg2N30.hInRP9QQSD_FI0R0-aIUwDARHrG8vHfLYshEGXDFOno";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

// In-Memory caches for user-scoped logs and indexes (that do not have dedicated tables in current SQL schema)
const userRagIndexes = new Map<string, RagIndexItem[]>();
const userActivityLogs = new Map<string, ActivityLog[]>();

// Types matching /src/types.ts
interface PromptVersion {
  version: number;
  content: string;
  updatedAt: string;
  comment: string;
}

interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  platform: string;
  isFavorite: boolean;
  versions: PromptVersion[];
  createdAt: string;
  updatedAt: string;
}

interface MarkdownDoc {
  id: string;
  path: string;
  title: string;
  content: string;
  isFavorite: boolean;
  updatedAt: string;
  tags?: string[];
}

interface ActivityLog {
  id: string;
  type: 'create_prompt' | 'update_prompt' | 'delete_prompt' | 'create_doc' | 'update_doc' | 'git_sync' | 'rag_index';
  description: string;
  timestamp: string;
}

interface RagIndexItem {
  id: string;
  docId: string;
  path: string;
  text: string;
  embedding: number[] | null;
}

// Global state / file-backed DB paths
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "vault_db.json");

// Helper to log activities
let activityLogs: ActivityLog[] = [];

function logActivity(type: ActivityLog['type'], description: string) {
  const log: ActivityLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    description,
    timestamp: new Date().toISOString()
  };
  activityLogs.unshift(log);
  if (activityLogs.length > 50) {
    activityLogs = activityLogs.slice(0, 50);
  }
}

// Auth token validation helper
async function getAuthenticatedUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  if (!token) return null;

  if (token === "vault_jwt_token_admin") {
    return { id: "admin_user_id", email: "admin@promptvault.local" };
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    console.error("Auth error:", err);
    return null;
  }
}

// Database mapper helpers
function mapDbPromptToPrompt(row: any): Prompt {
  return {
    id: row.id,
    title: row.title || "",
    description: row.description || "",
    content: row.content || "",
    category: row.category || "General",
    tags: Array.isArray(row.tags) ? row.tags : [],
    platform: row.platform || "Gemini",
    isFavorite: row.is_favorite ?? row.isFavorite ?? false,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    versions: (row.prompt_versions || []).map((v: any) => ({
      version: v.version,
      content: v.content,
      updatedAt: v.updated_at || v.updatedAt || new Date().toISOString(),
      comment: v.comment || ""
    })).sort((a: any, b: any) => a.version - b.version)
  };
}

function mapDbDocToDoc(row: any): MarkdownDoc {
  return {
    id: row.id,
    path: row.path || "",
    title: row.title || "",
    content: row.content || "",
    isFavorite: row.is_favorite ?? row.isFavorite ?? false,
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

// Multi-user request scopes
async function getUserScope(req: express.Request, globalPrompts: Prompt[], globalMarkdowns: MarkdownDoc[], globalRagIndex: RagIndexItem[], globalActivityLogs: ActivityLog[]) {
  const user = await getAuthenticatedUser(req);
  if (!user || user.id === "admin_user_id") {
    return {
      user: user || { id: "admin_user_id", email: "admin@promptvault.local" },
      isSupabase: false,
      prompts: globalPrompts,
      markdowns: globalMarkdowns,
      ragIndex: globalRagIndex,
      activityLogs: globalActivityLogs
    };
  }

  try {
    const { data: promptsData, error: promptsErr } = await supabase
      .from('prompts')
      .select('*, prompt_versions(*)')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (promptsErr) throw promptsErr;

    const { data: docsData, error: docsErr } = await supabase
      .from('markdown_docs')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (docsErr) throw docsErr;

    const userPrompts = (promptsData || []).map(mapDbPromptToPrompt);
    const userMarkdowns = (docsData || []).map(mapDbDocToDoc);

    if (!userRagIndexes.has(user.id)) {
      userRagIndexes.set(user.id, []);
    }
    if (!userActivityLogs.has(user.id)) {
      userActivityLogs.set(user.id, []);
    }

    return {
      user,
      isSupabase: true,
      prompts: userPrompts,
      markdowns: userMarkdowns,
      ragIndex: userRagIndexes.get(user.id) || [],
      activityLogs: userActivityLogs.get(user.id) || []
    };
  } catch (err) {
    console.error("Supabase user-scope load failed, falling back to local DB:", err);
    return {
      user,
      isSupabase: false,
      prompts: globalPrompts,
      markdowns: globalMarkdowns,
      ragIndex: globalRagIndex,
      activityLogs: globalActivityLogs
    };
  }
}

// Helper to log user activities
function logUserActivity(userId: string, type: ActivityLog['type'], description: string, globalActivityLogs: ActivityLog[]) {
  const log: ActivityLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type,
    description,
    timestamp: new Date().toISOString()
  };

  if (userId === "admin_user_id") {
    globalActivityLogs.unshift(log);
    if (globalActivityLogs.length > 50) {
      globalActivityLogs.splice(50);
    }
  } else {
    const logs = userActivityLogs.get(userId) || [];
    logs.unshift(log);
    if (logs.length > 50) {
      logs.splice(50);
    }
    userActivityLogs.set(userId, logs);
  }
}

// Lazy load Gemini
let aiInstance: GoogleGenAI | null = null;
function getGeminiAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required in secrets");
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// Cosine similarity for RAG
function dotProduct(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
function magnitude(a: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}
function cosineSimilarity(a: number[], b: number[]) {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

// Simple token/keyword-based similarity as fallback
function calculateKeywordScore(query: string, text: string): number {
  const queryWords = query.toLowerCase().split(/[^a-zA-Z0-9ก-๙]+/);
  const textWords = text.toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (word.length > 1) {
      if (textWords.includes(word)) {
        score += 1.0;
        // Exact match bonus
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(textWords)) {
          score += 1.5;
        }
      }
    }
  }
  return score;
}

// Simple heuristic-based content analysis for markdown suggestions
function analyzeHeuristics(content: string, title: string, filePath: string) {
  const text = `${title || ""} ${filePath || ""} ${content || ""}`.toLowerCase();
  
  // 1. Suggest Category
  let category = "General";
  if (text.includes("react") || text.includes("javascript") || text.includes("typescript") || text.includes("code") || text.includes("api") || text.includes("html") || text.includes("css")) {
    category = "Development";
  } else if (text.includes("prompt") || text.includes("llm") || text.includes("gpt") || text.includes("gemini") || text.includes("ai")) {
    category = "AI Prompts";
  } else if (text.includes("tutorial") || text.includes("guide") || text.includes("how to") || text.includes("install")) {
    category = "Guides";
  } else if (text.includes("meeting") || text.includes("notes") || text.includes("agenda") || text.includes("journal")) {
    category = "Notes";
  }

  // 2. Extract Keywords and Tags
  const stopWords = new Set(["this", "that", "with", "from", "your", "have", "about", "there", "their", "will", "would", "could", "should", "some", "them", "then", "were", "been", "here", "also", "into", "more", "other", "than", "then", "very", "what", "when", "where", "which", "who", "whom", "whose", "why", "how", "null", "undefined"]);
  const words = text.split(/[^a-zA-Z0-9ก-๙]+/).filter(w => w.length > 3 && !stopWords.has(w));
  
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  
  const sortedWords = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
  
  const tags = sortedWords.slice(0, 4);
  const keywords = sortedWords.slice(4, 9);

  // 3. Simple Summary Heuristic
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('!') && !l.startsWith('['));
  let summary = lines.length > 0 ? lines[0] : `Document regarding ${title || 'unnamed'}`;
  if (summary.length > 150) {
    summary = summary.substring(0, 147) + "...";
  }

  return {
    category,
    tags: tags.length > 0 ? tags : ["general"],
    summary,
    keywords: keywords.length > 0 ? keywords : ["documentation", "reference"]
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Ensure data folder and DB file exist
  await fs.mkdir(DATA_DIR, { recursive: true });

  let prompts: Prompt[] = [];
  let markdowns: MarkdownDoc[] = [];
  let ragIndex: RagIndexItem[] = [];

  // Seed sample prompts & markdowns if DB empty
  async function loadDatabase() {
    try {
      if (existsSync(DB_FILE)) {
        const raw = await fs.readFile(DB_FILE, "utf-8");
        const data = JSON.parse(raw);
        prompts = data.prompts || [];
        markdowns = data.markdowns || [];
        ragIndex = data.ragIndex || [];
        activityLogs = data.activityLogs || [];
      } else {
        // Initialize with beautiful seeds
        prompts = [
          {
            id: "p_1",
            title: "React 19 Performance Optimizer",
            description: "A highly specialized system prompt designed to review React 19 codebases, identifying unnecessary rendering and recommending compiler-friendly hooks.",
            content: "You are an expert React 19 compiler optimization assistant. Analyze the given code for:\n1. Unnecessary useEffect uses and state duplication.\n2. Functions/objects passed as props that should be memoized or kept outside components.\n3. Optimization opportunities using React 19 features like use() and Action states.\n\nProvide clear refactored code blocks and explain why your refactoring is compiler-friendly.",
            category: "Development",
            tags: ["React", "Performance", "Optimization"],
            platform: "Gemini",
            isFavorite: true,
            versions: [
              {
                version: 1,
                content: "You are an expert React 19 compiler optimization assistant. Analyze the given code...",
                updatedAt: new Date().toISOString(),
                comment: "Initial prompt seed"
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: "p_2",
            title: "Advanced Claude 3.5 System Architect",
            description: "Craft detailed software architectures with Clean Architecture guidelines, bento UI models, and scalable API schemas.",
            content: "You are a Principal Software Architect. Draft a software design specification for the requested system. Your output must strictly follow Clean Architecture: \n- Domain model & Business rules (Entities)\n- Use cases (Interactors)\n- Interface adapters (Controllers, Gateways, Presenters)\n- Infrastructure (DB, Frameworks, Web API)\n\nInclude a detailed Mermaid diagram representing the flow of data.",
            category: "Architecture",
            tags: ["Claude", "Clean Architecture", "Mermaid"],
            platform: "Claude",
            isFavorite: false,
            versions: [
              {
                version: 1,
                content: "You are a Principal Software Architect. Draft a software design specification...",
                updatedAt: new Date().toISOString(),
                comment: "Initial seed prompt"
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: "p_3",
            title: "Cursor Rule-Based Context Generator",
            description: "Produces customized .cursorrules content designed to enforce rigorous TypeScript, component composition, and CSS discipline in active projects.",
            content: "Generate a custom `.cursorrules` file for a full-stack Next.js/Tailwind/TypeScript project. Ensure it includes constraints to:\n- Restrict client-side API key usage strictly.\n- Enforce functional components with TypeScript.\n- Encourage Tailwind arbitrary values avoidance.\n- Maintain absolute directories resolution alias.",
            category: "Prompt Engineering",
            tags: ["Cursor", "TypeScript", "Rules"],
            platform: "Cursor",
            isFavorite: true,
            versions: [
              {
                version: 1,
                content: "Generate a custom `.cursorrules` file for a full-stack Next.js/Tailwind/TypeScript project...",
                updatedAt: new Date().toISOString(),
                comment: "CursorRules Creator seed"
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ];

        markdowns = [
          {
            id: "md_1",
            path: "README.md",
            title: "AI Prompt Vault",
            content: `# AI Prompt Vault 🌌\n\nWelcome to your self-hosted centralized AI Knowledge repository! This platform is designed to store, manage, test, and optimize AI prompts, technical documentation, and .md files.\n\n### Core Platform Architecture\n\`\`\`mermaid\ngraph TD\n    A[Client UI - React/Vite] -->|API Requests| B[Full-Stack Express Server]\n    B -->|Search/Sync| C[Local File-Backed DB]\n    B -->|Embeddings & Chat| D[Gemini API - RAG Engine]\n    B -->|Git Operations| E[Public Repositories]\n\`\`\`\n\n### Features Included:\n1. **Prompt Library**: Complete versioning, copy-to-clipboard, tag management, platform labels.\n2. **Markdown Workspace**: Mermaid diagrams parsing, nested directories exploration, and custom folder structures.\n3. **Fuzzy Search**: Instantly find prompts or markdowns.\n4. **Gemini RAG Assistant**: Ask questions that search deep into your stored Markdown documents.`,
            isFavorite: true,
            updatedAt: new Date().toISOString()
          },
          {
            id: "md_2",
            path: "skills/prompting.md",
            title: "Advanced Prompting Skill",
            content: `# Advanced Prompting Techniques 💡\n\nThis guide outlines the core techniques supported by state-of-the-art LLMs (Gemini 2.5/3.5, Claude 3.5, ChatGPT-4o).\n\n### 1. Few-Shot Prompting\nProvide structured inputs and outputs as context before requesting the target response:\n\`\`\`text\nInput: Write a greeting for a developer.\nOutput: Hello developer! May your compilation always succeed.\nInput: Write a greeting for a designer.\nOutput: Greetings creator! May your layout always balance perfectly.\n\`\`\`\n\n### 2. ReAct (Reason-Action-Observation) Pattern\nEnforce reasoning phases before execution:\n\`\`\`text\nThought: I need to calculate the sales tax.\nAction: calculateTax(100, 0.07)\nObservation: Tax is 7.\nThought: The final total is 107.\n\`\`\`\n\n### 3. RAG Optimization\nOptimize chunk structures to feed prompt windows with clean context. Use hierarchical document indexes to maintain layout relations.`,
            isFavorite: false,
            updatedAt: new Date().toISOString()
          },
          {
            id: "md_3",
            path: "rules/rules.md",
            title: "System Rules Config",
            content: `# System Rules & Quality Guidelines 🛡️\n\nTo ensure codebase cleanliness and application longevity, adhere strictly to the following parameters:\n\n- **Client Security**: Never leak credentials, API tokens, or workspace paths to the frontend.\n- **Component Composition**: Prefer small modular React components in \`src/components/\` rather than consolidating everything inside \`App.tsx\`.\n- **Error Boundaries**: Wrap network requests and file reads in robust try-catch handlers.`,
            isFavorite: false,
            updatedAt: new Date().toISOString()
          }
        ];

        ragIndex = [];
        logActivity('rag_index', 'Database initialized with elegant sample data.');
        await saveDatabase();
      }
    } catch (err) {
      console.error("Failed to load or parse database file", err);
    }
  }

  async function saveDatabase() {
    try {
      await fs.writeFile(DB_FILE, JSON.stringify({
        prompts,
        markdowns,
        ragIndex,
        activityLogs
      }, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to write database file", err);
    }
  }

  await loadDatabase();

  // --- API ROUTES ---

  // Auth local signup endpoint
  app.post("/api/auth/signup", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const email = username.includes('@') ? username : `${username}@promptvault.local`;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: username.split('@')[0]
          }
        }
      });

      if (error) {
        return res.status(400).json({ success: false, message: error.message });
      }

      if (!data.user) {
        return res.status(400).json({ success: false, message: "Signup succeeded but no user session created." });
      }

      res.json({
        success: true,
        message: "Registration successful! Please sign in.",
        user: {
          username: username.split('@')[0],
          email: data.user.email
        }
      });
    } catch (err: any) {
      console.error("Signup error:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to sign up" });
    }
  });

  // Auth local login endpoint
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }
    
    const email = username.includes('@') ? username : `${username}@promptvault.local`;

    try {
      // Try logging in directly
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      // Special case: If logging in as admin/vault123 and user does not exist yet on Supabase,
      // auto-create/sign-up the admin user in Supabase!
      if (error && username === "admin" && password === "vault123" && 
          (error.message.toLowerCase().includes("invalid login credentials") || 
           error.message.toLowerCase().includes("email not confirmed") ||
           error.message.toLowerCase().includes("user not found"))) {
        console.log("Admin user does not exist in Supabase. Attempting to auto-register admin@promptvault.local...");
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: "admin"
            }
          }
        });

        if (!signUpError && signUpData.user) {
          // Try logging in again after auto-signup
          const retryAuth = await supabase.auth.signInWithPassword({
            email,
            password
          });
          data = retryAuth.data;
          error = retryAuth.error;
        }
      }

      if (error) {
        // Fallback to local admin offline session ONLY if Supabase connection fails completely (not just bad password)
        // This ensures the application remains usable even if Supabase is temporarily offline.
        if (username === "admin" && password === "vault123" && 
            (error.message.includes("fetch") || error.message.includes("Failed to fetch") || error.message.includes("Network"))) {
          console.warn("Supabase unreachable for admin user. Falling back to local offline admin...");
          return res.json({
            success: true,
            token: "vault_jwt_token_admin",
            user: { username: "Admin (Offline/Local)", email: "admin@promptvault.local" }
          });
        }
        return res.status(401).json({ success: false, message: error.message });
      }

      if (!data.session || !data.user) {
        return res.status(401).json({ success: false, message: "Invalid session." });
      }

      res.json({
        success: true,
        token: data.session.access_token,
        user: {
          username: username.split('@')[0],
          email: data.user.email
        }
      });
    } catch (err: any) {
      console.error("Login error:", err);
      // Fallback for admin if unexpected error (e.g. offline)
      if (username === "admin" && password === "vault123") {
        return res.json({
          success: true,
          token: "vault_jwt_token_admin",
          user: { username: "Admin (Offline/Local)", email: "admin@promptvault.local" }
        });
      }
      res.status(500).json({ success: false, message: err.message || "Authentication failed" });
    }
  });

  // Get Stats
  app.get("/api/stats", async (req, res) => {
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);
    const favoriteCount = scope.prompts.filter(p => p.isFavorite).length + scope.markdowns.filter(m => m.isFavorite).length;
    
    // Tag cloud calculation
    const tagsMap: Record<string, number> = {};
    scope.prompts.forEach(p => {
      p.tags.forEach(t => {
        tagsMap[t] = (tagsMap[t] || 0) + 1;
      });
    });
    const mostUsedTags = Object.entries(tagsMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Platform stats
    const platformMap: Record<string, number> = {};
    scope.prompts.forEach(p => {
      platformMap[p.platform] = (platformMap[p.platform] || 0) + 1;
    });
    const platformStats = Object.entries(platformMap).map(([platform, count]) => ({ platform, count }));

    // Recent items
    const merged = [
      ...scope.prompts.map(p => ({ ...p, type: 'prompt' as const })),
      ...scope.markdowns.map(m => ({ ...m, type: 'markdown' as const }))
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json({
      promptCount: scope.prompts.length,
      docCount: scope.markdowns.length,
      favoriteCount,
      recentUpdated: merged.slice(0, 5),
      mostUsedTags,
      platformStats,
      recentActivity: scope.activityLogs
    });
  });

  // Prompts CRUD
  app.get("/api/prompts", async (req, res) => {
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);
    res.json(scope.prompts);
  });

  app.post("/api/prompts", async (req, res) => {
    const { title, description, content, category, tags, platform } = req.body;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    const generatedId = `p_${Date.now()}`;
    const newPrompt: Prompt = {
      id: generatedId,
      title: title || "Untitled Prompt",
      description: description || "",
      content: content || "",
      category: category || "General",
      tags: tags || [],
      platform: platform || "Gemini",
      isFavorite: false,
      versions: [
        {
          version: 1,
          content: content || "",
          updatedAt: new Date().toISOString(),
          comment: "Created prompt"
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (scope.isSupabase && scope.user) {
      try {
        const { error: pErr } = await supabase
          .from('prompts')
          .insert({
            id: generatedId,
            title: newPrompt.title,
            description: newPrompt.description,
            content: newPrompt.content,
            category: newPrompt.category,
            tags: newPrompt.tags,
            platform: newPrompt.platform,
            is_favorite: false,
            user_id: scope.user.id,
            created_at: newPrompt.createdAt,
            updated_at: newPrompt.updatedAt
          });

        if (pErr) throw pErr;

        const { error: vErr } = await supabase
          .from('prompt_versions')
          .insert({
            prompt_id: generatedId,
            version: 1,
            content: newPrompt.content,
            comment: "Created prompt",
            updated_at: new Date().toISOString()
          });

        if (vErr) throw vErr;

        logUserActivity(scope.user.id, 'create_prompt', `Created prompt "${newPrompt.title}"`, activityLogs);
        return res.json(newPrompt);
      } catch (err: any) {
        console.error("Supabase prompt insert failed, falling back to local:", err);
      }
    }

    prompts.unshift(newPrompt);
    logActivity('create_prompt', `Created prompt "${newPrompt.title}"`);
    await saveDatabase();
    res.json(newPrompt);
  });

  app.put("/api/prompts/:id", async (req, res) => {
    const { id } = req.params;
    const { title, description, content, category, tags, platform, isFavorite, versionComment } = req.body;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    const idx = scope.prompts.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    const current = scope.prompts[idx];
    let updatedContent = current.content;
    let versions = [...current.versions];
    let newVersionCreated = false;

    // If prompt content changed, make a new version
    if (content !== undefined && content !== current.content) {
      updatedContent = content;
      newVersionCreated = true;
      versions.push({
        version: current.versions.length + 1,
        content,
        updatedAt: new Date().toISOString(),
        comment: versionComment || `Updated to version ${current.versions.length + 1}`
      });
    }

    const updatedPrompt: Prompt = {
      ...current,
      title: title !== undefined ? title : current.title,
      description: description !== undefined ? description : current.description,
      content: updatedContent,
      category: category !== undefined ? category : current.category,
      tags: tags !== undefined ? tags : current.tags,
      platform: platform !== undefined ? platform : current.platform,
      isFavorite: isFavorite !== undefined ? isFavorite : current.isFavorite,
      versions,
      updatedAt: new Date().toISOString()
    };

    if (scope.isSupabase && scope.user) {
      try {
        const { error: pErr } = await supabase
          .from('prompts')
          .update({
            title: updatedPrompt.title,
            description: updatedPrompt.description,
            content: updatedPrompt.content,
            category: updatedPrompt.category,
            tags: updatedPrompt.tags,
            platform: updatedPrompt.platform,
            is_favorite: updatedPrompt.isFavorite,
            updated_at: updatedPrompt.updatedAt
          })
          .eq('id', id)
          .eq('user_id', scope.user.id);

        if (pErr) throw pErr;

        if (newVersionCreated) {
          const { error: vErr } = await supabase
            .from('prompt_versions')
            .insert({
              prompt_id: id,
              version: versions.length,
              content: updatedPrompt.content,
              comment: versionComment || `Updated to version ${versions.length}`,
              updated_at: new Date().toISOString()
            });

          if (vErr) throw vErr;
        }

        logUserActivity(scope.user.id, 'update_prompt', `Updated prompt "${updatedPrompt.title}"`, activityLogs);
        return res.json(updatedPrompt);
      } catch (err: any) {
        console.error("Supabase prompt update failed, falling back to local:", err);
      }
    }

    const localIdx = prompts.findIndex(p => p.id === id);
    if (localIdx !== -1) {
      prompts[localIdx] = updatedPrompt;
      logActivity('update_prompt', `Updated prompt "${updatedPrompt.title}"`);
      await saveDatabase();
    }
    res.json(updatedPrompt);
  });

  app.delete("/api/prompts/:id", async (req, res) => {
    const { id } = req.params;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    const idx = scope.prompts.findIndex(p => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    const removed = scope.prompts[idx];

    if (scope.isSupabase && scope.user) {
      try {
        await supabase
          .from('prompt_versions')
          .delete()
          .eq('prompt_id', id);

        const { error: pErr } = await supabase
          .from('prompts')
          .delete()
          .eq('id', id)
          .eq('user_id', scope.user.id);

        if (pErr) throw pErr;

        logUserActivity(scope.user.id, 'delete_prompt', `Deleted prompt "${removed.title}"`, activityLogs);
        return res.json({ success: true });
      } catch (err: any) {
        console.error("Supabase prompt delete failed, falling back to local:", err);
      }
    }

    const localIdx = prompts.findIndex(p => p.id === id);
    if (localIdx !== -1) {
      prompts.splice(localIdx, 1);
      logActivity('delete_prompt', `Deleted prompt "${removed.title}"`);
      await saveDatabase();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Prompt not found" });
    }
  });

  // Markdowns CRUD
  app.get("/api/markdowns", async (req, res) => {
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);
    res.json(scope.markdowns);
  });

  app.post("/api/markdowns/suggest", async (req, res) => {
    const { content, title, path: filePath } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Content is required to generate suggestions." });
    }

    try {
      const hasApiKey = !!process.env.GEMINI_API_KEY;
      if (hasApiKey) {
        try {
          const ai = getGeminiAI();
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: `Analyze this markdown document and suggest:
1. Suggested Category (single descriptive word or simple category name, e.g., 'Development', 'Guides', 'AI Prompts', 'General')
2. Suggested Tags (3-5 relevant lowercase tags)
3. Summary (1-2 sentences summarizing the file content)
4. Keywords (4-6 key terms or phrases)

Title: ${title || "Untitled"}
Path: ${filePath || ""}
Content:
${content.substring(0, 8000)}`, // limit text size for efficiency
            config: {
              systemInstruction: "You are an expert documentation analyst. Analyze the document and return suggestions strictly matching the JSON schema format.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                  summary: { type: Type.STRING },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["category", "tags", "summary", "keywords"]
              }
            }
          });

          if (response.text) {
            const data = JSON.parse(response.text.trim());
            return res.json({
              ...data,
              source: "llm"
            });
          }
        } catch (llmErr: any) {
          console.error("Gemini suggestion failed, falling back to heuristics:", llmErr.message);
        }
      }

      // Fallback or No API Key -> Heuristic analysis
      const heuristics = analyzeHeuristics(content, title, filePath);
      res.json({
        ...heuristics,
        source: "heuristic"
      });

    } catch (err: any) {
      console.error("Suggestion error:", err);
      res.status(500).json({ error: err.message || "Failed to generate suggestions" });
    }
  });

  app.post("/api/markdowns", async (req, res) => {
    const { path: docPath, title, content } = req.body;
    if (!docPath) return res.status(400).json({ error: "Path is required" });

    // Clean leading slash
    const cleanPath = docPath.startsWith('/') ? docPath.substring(1) : docPath;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    // Check if path already exists in current scope
    const existingIdx = scope.markdowns.findIndex(m => m.path.toLowerCase() === cleanPath.toLowerCase());
    if (existingIdx !== -1) {
      return res.status(400).json({ error: `File at "${cleanPath}" already exists.` });
    }

    const generatedId = `md_${Date.now()}`;
    const newDoc: MarkdownDoc = {
      id: generatedId,
      path: cleanPath,
      title: title || path.basename(cleanPath, '.md'),
      content: content || "",
      isFavorite: false,
      updatedAt: new Date().toISOString()
    };

    if (scope.isSupabase && scope.user) {
      try {
        const { error: mErr } = await supabase
          .from('markdown_docs')
          .insert({
            id: generatedId,
            path: newDoc.path,
            title: newDoc.title,
            content: newDoc.content,
            is_favorite: false,
            tags: [],
            user_id: scope.user.id,
            updated_at: newDoc.updatedAt
          });

        if (mErr) throw mErr;

        logUserActivity(scope.user.id, 'create_doc', `Created Markdown document "${newDoc.path}"`, activityLogs);
        return res.json(newDoc);
      } catch (err: any) {
        console.error("Supabase markdown doc insert failed, falling back to local:", err);
      }
    }

    markdowns.push(newDoc);
    logActivity('create_doc', `Created Markdown document "${newDoc.path}"`);
    await saveDatabase();
    res.json(newDoc);
  });

  app.put("/api/markdowns/:id", async (req, res) => {
    const { id } = req.params;
    const { content, title, isFavorite, path: newPath, tags } = req.body;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    const idx = scope.markdowns.findIndex(m => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Document not found" });
    }

    const current = scope.markdowns[idx];
    const updatedDoc: MarkdownDoc = {
      ...current,
      path: newPath !== undefined ? newPath : current.path,
      title: title !== undefined ? title : current.title,
      content: content !== undefined ? content : current.content,
      isFavorite: isFavorite !== undefined ? isFavorite : current.isFavorite,
      tags: tags !== undefined ? tags : current.tags,
      updatedAt: new Date().toISOString()
    };

    if (scope.isSupabase && scope.user) {
      try {
        const { error: mErr } = await supabase
          .from('markdown_docs')
          .update({
            path: updatedDoc.path,
            title: updatedDoc.title,
            content: updatedDoc.content,
            is_favorite: updatedDoc.isFavorite,
            tags: updatedDoc.tags,
            updated_at: updatedDoc.updatedAt
          })
          .eq('id', id)
          .eq('user_id', scope.user.id);

        if (mErr) throw mErr;

        logUserActivity(scope.user.id, 'update_doc', `Updated document "${updatedDoc.path}"`, activityLogs);
        return res.json(updatedDoc);
      } catch (err: any) {
        console.error("Supabase markdown doc update failed, falling back to local:", err);
      }
    }

    const localIdx = markdowns.findIndex(m => m.id === id);
    if (localIdx !== -1) {
      markdowns[localIdx] = updatedDoc;
      logActivity('update_doc', `Updated document "${updatedDoc.path}"`);
      await saveDatabase();
    }
    res.json(updatedDoc);
  });

  app.delete("/api/markdowns/:id", async (req, res) => {
    const { id } = req.params;
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    const idx = scope.markdowns.findIndex(m => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Document not found" });
    }

    const removed = scope.markdowns[idx];

    if (scope.isSupabase && scope.user) {
      try {
        const { error: mErr } = await supabase
          .from('markdown_docs')
          .delete()
          .eq('id', id)
          .eq('user_id', scope.user.id);

        if (mErr) throw mErr;

        logUserActivity(scope.user.id, 'delete_prompt', `Deleted document "${removed.path}"`, activityLogs);
        return res.json({ success: true });
      } catch (err: any) {
        console.error("Supabase markdown doc delete failed, falling back to local:", err);
      }
    }

    const localIdx = markdowns.findIndex(m => m.id === id);
    if (localIdx !== -1) {
      markdowns.splice(localIdx, 1);
      // Clean ragIndex items associated
      ragIndex = ragIndex.filter(item => item.docId !== id);
      logActivity('delete_prompt', `Deleted document "${removed.path}"`);
      await saveDatabase();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Document not found" });
    }
  });

  // Full Text Search across both libraries
  app.get("/api/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== "string") {
      return res.json({ prompts: [], markdowns: [] });
    }

    const query = q.toLowerCase();
    const scope = await getUserScope(req, prompts, markdowns, ragIndex, activityLogs);

    // Fuzzy filtering for prompts
    const filteredPrompts = scope.prompts.filter(p => {
      return p.title.toLowerCase().includes(query) ||
             p.content.toLowerCase().includes(query) ||
             p.description.toLowerCase().includes(query) ||
             p.category.toLowerCase().includes(query) ||
             p.tags.some(t => t.toLowerCase().includes(query));
    });

    // Fuzzy filtering for markdowns
    const filteredMarkdowns = scope.markdowns.filter(m => {
      return m.title.toLowerCase().includes(query) ||
             m.path.toLowerCase().includes(query) ||
             m.content.toLowerCase().includes(query);
    });

    res.json({
      prompts: filteredPrompts,
      markdowns: filteredMarkdowns
    });
  });

  // --- RAG INDEXING AND VECTOR RAG SYSTEM ---

  // Index all markdown documents (generating actual Gemini Embeddings)
  app.post("/api/rag/index", async (req, res) => {
    try {
      logActivity('rag_index', 'Starting vector RAG indexing process...');
      const hasApiKey = !!process.env.GEMINI_API_KEY;
      
      const newIndex: RagIndexItem[] = [];

      for (const doc of markdowns) {
        // Chunk markdown by headings (e.g., split on ## or ### or general paragraphs)
        const chunks: string[] = [];
        const sections = doc.content.split(/(?=^##+ )/m);
        for (const sec of sections) {
          const trimmed = sec.trim();
          if (!trimmed) continue;
          
          // If section is too large, split it further by double line breaks
          if (trimmed.length > 2000) {
            const subs = trimmed.split(/\n\s*\n/);
            let currentSub = "";
            for (const sub of subs) {
              if ((currentSub + sub).length < 2000) {
                currentSub += (currentSub ? "\n\n" : "") + sub;
              } else {
                if (currentSub) chunks.push(currentSub.trim());
                currentSub = sub;
              }
            }
            if (currentSub) chunks.push(currentSub.trim());
          } else {
            chunks.push(trimmed);
          }
        }

        // Generate embeddings for each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunkText = chunks[i];
          let embedding: number[] | null = null;

          if (hasApiKey) {
            try {
              const ai = getGeminiAI();
              const response = await ai.models.embedContent({
                model: "gemini-embedding-2-preview",
                contents: chunkText,
              });
              const respAny = response as any;
              const embedObj = respAny.embedding || respAny.embeddings;
              if (embedObj) {
                if (Array.isArray(embedObj)) {
                  embedding = embedObj[0]?.values || null;
                } else if (embedObj.values) {
                  embedding = embedObj.values;
                }
              }
            } catch (err: any) {
              console.error(`Gemini embedding failed for chunk ${i} in ${doc.path}: ${err.message}`);
            }
          }

          newIndex.push({
            id: `chunk_${doc.id}_${i}_${Date.now()}`,
            docId: doc.id,
            path: doc.path,
            text: chunkText,
            embedding
          });
        }
      }

      ragIndex = newIndex;
      logActivity('rag_index', `Successfully indexed ${markdowns.length} markdown documents into ${ragIndex.length} vector chunks.`);
      await saveDatabase();

      res.json({
        success: true,
        message: `Indexed ${markdowns.length} documents into ${ragIndex.length} chunks.`,
        apiUsed: hasApiKey,
        chunksIndexed: ragIndex.length
      });
    } catch (error: any) {
      console.error("RAG indexing error:", error);
      res.status(500).json({ error: error.message || "RAG Indexing failed" });
    }
  });

  // Query the AI Assistant (either direct LLM generation or RAG search)
  app.post("/api/rag/ask", async (req, res) => {
    const { question, mode } = req.body; // mode: 'rag' | 'general'
    if (!question) return res.status(400).json({ error: "Question is required" });

    try {
      const hasApiKey = !!process.env.GEMINI_API_KEY;
      if (!hasApiKey) {
        return res.status(400).json({ error: "Gemini API Key is not configured. Please supply GEMINI_API_KEY in Settings/Secrets panel." });
      }

      const ai = getGeminiAI();
      let promptText = question;
      let relevantSources: string[] = [];

      if (mode === 'rag') {
        if (ragIndex.length === 0) {
          // Trigger a quick index on the fly if index is empty
          await axiosIndexTrigger();
        }

        // Get query embedding if key is available
        let queryVector: number[] | null = null;
        try {
          const embeddingResponse = await ai.models.embedContent({
            model: "gemini-embedding-2-preview",
            contents: question,
          });
          const respAny = embeddingResponse as any;
          const embedObj = respAny.embedding || respAny.embeddings;
          if (embedObj) {
            if (Array.isArray(embedObj)) {
              queryVector = embedObj[0]?.values || null;
            } else if (embedObj.values) {
              queryVector = embedObj.values;
            }
          }
        } catch (err) {
          console.error("Could not embed query, falling back to keyword similarity", err);
        }

        // Calculate similarities
        const scoredChunks = ragIndex.map(chunk => {
          let score = 0;
          if (queryVector && chunk.embedding) {
            score = cosineSimilarity(queryVector, chunk.embedding);
          } else {
            // Fallback keyword score
            score = calculateKeywordScore(question, chunk.text) * 0.1; // scale to a low weight decimal
          }
          return { chunk, score };
        });

        // Sort descending
        scoredChunks.sort((a, b) => b.score - a.score);

        // Get top 4 most relevant chunks
        const topChunks = scoredChunks.slice(0, 4).filter(sc => sc.score > 0.05);

        if (topChunks.length > 0) {
          relevantSources = Array.from(new Set(topChunks.map(sc => sc.chunk.path)));
          const contextText = topChunks.map(sc => `--- SOURCE: ${sc.chunk.path} (Similarity: ${(sc.score * 100).toFixed(1)}%) ---\n${sc.chunk.text}`).join("\n\n");

          promptText = `You are the AI Prompt Vault knowledge explorer. You answer questions strictly based on the provided local documentation context.
If the context does not contain enough info to answer, answer with your general knowledge but clearly state that the local documentation was insufficient.

Local Context Chunk Documents:
${contextText}

Question:
${question}

Please answer the question clearly, citing the source paths when appropriate. Use beautiful markdown formatting.`;
        } else {
          promptText = `You are the AI Prompt Vault knowledge explorer. The user queried: "${question}". No matching documentation was found in their libraries. Answer their question with your high-fidelity knowledge and suggest how they might structure a Markdown document in their Vault to support this.`;
        }
      }

      // Generate response from Gemini
      const geminiResponse = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptText,
        config: {
          systemInstruction: "You are an elite, concise Prompt Engineer and AI Developer assistant. Provide well-structured markdown answers."
        }
      });

      res.json({
        answer: geminiResponse.text,
        sources: relevantSources,
        mode
      });

    } catch (error: any) {
      console.error("AI QA error:", error);
      res.status(500).json({ error: error.message || "Failed to process AI assistant response" });
    }

    async function axiosIndexTrigger() {
      // Internal helper to perform a quick seed of ragIndex if it was empty
      const tempIndex: RagIndexItem[] = [];
      for (const doc of markdowns) {
        tempIndex.push({
          id: `chunk_${doc.id}_0`,
          docId: doc.id,
          path: doc.path,
          text: doc.content.substring(0, 2000),
          embedding: null
        });
      }
      ragIndex = tempIndex;
    }
  });

  // AI Assistant Special tools
  app.post("/api/ai/tool", async (req, res) => {
    const { tool, params } = req.body;
    const ai = getGeminiAI();

    try {
      if (tool === "summarize_doc") {
        const doc = markdowns.find(m => m.id === params.docId);
        if (!doc) return res.status(404).json({ error: "Document not found" });

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Please summarize this markdown file called "${doc.path}". Extract the key goals, skills or instructions, and lay them out in a beautiful executive summary with key take-away bullets.\n\nDOCUMENT CONTENT:\n${doc.content}`,
        });
        res.json({ result: response.text });

      } else if (tool === "improve_prompt") {
        const pList = prompts.map(p => `- [${p.category}] ${p.title}: "${p.description}"`).join("\n");
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `The user wants to generate a high-quality prompt template. Here are some of their existing prompt templates for styling reference:\n${pList}\n\nTask:\nGenerate a better, fully optimized, and production-grade system prompt or prompt template based on the following instructions: "${params.instructions}".\n\nProvide the complete optimized prompt within a code block, along with a list of variables in that prompt and tips on how to use it.`,
        });
        res.json({ result: response.text });

      } else if (tool === "compare_files") {
        const doc1 = markdowns.find(m => m.id === params.doc1Id);
        const doc2 = markdowns.find(m => m.id === params.doc2Id);
        if (!doc1 || !doc2) return res.status(404).json({ error: "One or both documents not found" });

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Compare these two markdown files and highlight key structural, rules, or content differences. Suggest an integration if the user wishes to combine them.\n\nFile 1: "${doc1.path}"\n${doc1.content}\n\nFile 2: "${doc2.path}"\n${doc2.content}`,
        });
        res.json({ result: response.text });
      } else {
        res.status(400).json({ error: "Unknown tool" });
      }
    } catch (error: any) {
      console.error("AI tool execution error:", error);
      res.status(500).json({ error: error.message || "AI Tool failed" });
    }
  });

  // --- GIT SIMULATION & INTEGRATION ---

  // Git Import public repository and parse markdown files
  app.post("/api/git/import", async (req, res) => {
    const { repoUrl, folderToSync } = req.body;
    if (!repoUrl) return res.status(400).json({ error: "Repository URL is required" });

    const tempDir = path.join(os.tmpdir(), `git_vault_${Date.now()}`);
    logActivity('git_sync', `Initiating Git clone for repository "${repoUrl}"...`);

    try {
      // Run Git Clone
      await execPromise(`git clone --depth 1 "${repoUrl}" "${tempDir}"`);

      // Scan directories for markdown files recursively
      const importedDocs: MarkdownDoc[] = [];
      const rootFolder = folderToSync ? path.join(tempDir, folderToSync) : tempDir;

      async function scanDir(dir: string, baseDir: string) {
        let files;
        try {
          files = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          return; // Ignore directories we can't read
        }

        for (const file of files) {
          const fullPath = path.join(dir, file.name);
          const relativePath = path.relative(baseDir, fullPath);

          if (file.isDirectory()) {
            // Ignore standard build folders
            if (file.name !== ".git" && file.name !== "node_modules" && file.name !== "dist") {
              await scanDir(fullPath, baseDir);
            }
          } else if (file.isFile() && file.name.endsWith(".md")) {
            const content = await fs.readFile(fullPath, "utf-8");
            importedDocs.push({
              id: `md_git_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              path: relativePath,
              title: file.name,
              content,
              isFavorite: false,
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      await scanDir(rootFolder, rootFolder);

      // Add files to our database, keeping unique paths
      let addedCount = 0;
      let updatedCount = 0;

      for (const doc of importedDocs) {
        const existingIdx = markdowns.findIndex(m => m.path === doc.path);
        if (existingIdx !== -1) {
          markdowns[existingIdx].content = doc.content;
          markdowns[existingIdx].updatedAt = new Date().toISOString();
          updatedCount++;
        } else {
          markdowns.push(doc);
          addedCount++;
        }
      }

      // Cleanup cloned folder
      await fs.rm(tempDir, { recursive: true, force: true });

      logActivity('git_sync', `Git Sync Complete: Imported ${addedCount} new files, updated ${updatedCount} existing files from "${repoUrl}".`);
      await saveDatabase();

      res.json({
        success: true,
        addedCount,
        updatedCount,
        filesCount: importedDocs.length
      });

    } catch (err: any) {
      console.error("Git operation failed:", err);
      // Ensure tempDir cleanup
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {}
      res.status(500).json({ error: `Git Import failed: ${err.message}` });
    }
  });

  // --- IMPORT / EXPORT ROUTES ---

  // Export full project workspace as ZIP file
  app.get("/api/download-zip", async (req, res) => {
    try {
      console.log("Generating project source ZIP archive using JSZip...");
      const zip = new JSZip();
      const workspaceRoot = process.cwd();

      async function addDirectoryToZip(zipInstance: JSZip, dirPath: string) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(workspaceRoot, fullPath);

          // Skip ignored folders/files
          if (
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === '.git' ||
            entry.name === '.cache' ||
            entry.name === '.npm' ||
            entry.name === 'db.json' ||
            entry.name.endsWith('.zip') ||
            entry.name.endsWith('.tar.gz')
          ) {
            continue;
          }

          if (entry.isDirectory()) {
            await addDirectoryToZip(zipInstance, fullPath);
          } else if (entry.isFile()) {
            try {
              const fileContent = await fs.readFile(fullPath);
              zipInstance.file(relativePath, fileContent);
            } catch (err) {
              console.warn(`Could not read file ${fullPath}:`, err);
            }
          }
        }
      }

      await addDirectoryToZip(zip, workspaceRoot);

      console.log("Generating ZIP buffer...");
      const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const zipPath = path.join(os.tmpdir(), `prompt-vault-source-${Date.now()}.zip`);
      await fs.writeFile(zipPath, zipBuffer);

      console.log(`ZIP successfully generated, sending download response...`);
      res.download(zipPath, "AI-Prompt-Vault-Source.zip", async (err) => {
        if (err) {
          console.error("Error sending project ZIP file:", err);
        }
        // Cleanup the temporary zip file from host
        try {
          await fs.unlink(zipPath);
        } catch (cleanupErr) {
          console.error("Failed to delete temp zip file from OS:", cleanupErr);
        }
      });
    } catch (err: any) {
      console.error("Failed to generate ZIP file of workspace using JSZip:", err);
      res.status(500).json({ error: `Failed to compile workspace ZIP file: ${err.message}` });
    }
  });

  // Database connection check endpoint
  app.get("/api/db/status", async (req, res) => {
    try {
      if (!supabase) {
        return res.json({ active: false, error: "Supabase client not initialized" });
      }

      const { data, error } = await supabase
        .from('prompts')
        .select('id')
        .limit(1);

      if (error) {
        if (error.message && (
          error.message.includes("fetch") || 
          error.message.includes("network") || 
          error.message.includes("Failed to fetch") ||
          error.message.includes("TypeError")
        )) {
          return res.json({ active: false, error: error.message });
        }
        return res.json({ active: true, warning: error.message });
      }

      res.json({ active: true });
    } catch (err: any) {
      console.error("Supabase status check failed:", err);
      res.json({ active: false, error: err.message || "Failed to reach database" });
    }
  });

  // Local data to Supabase migration endpoint
  app.post("/api/db/migrate", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user || user.id === "admin_user_id") {
        return res.status(401).json({ error: "Unauthorized. You must be logged in via Supabase to migrate local data." });
      }

      // Load local JSON state as local source of truth
      let localPrompts: Prompt[] = [];
      let localMarkdowns: MarkdownDoc[] = [];

      try {
        if (existsSync(DB_FILE)) {
          const raw = await fs.readFile(DB_FILE, "utf-8");
          const data = JSON.parse(raw);
          localPrompts = data.prompts || [];
          localMarkdowns = data.markdowns || [];
        }
      } catch (err) {
        console.error("Failed to load local DB_FILE for migration, falling back to server memory state:", err);
        localPrompts = prompts;
        localMarkdowns = markdowns;
      }

      if (localPrompts.length === 0 && localMarkdowns.length === 0) {
        return res.json({ 
          success: true, 
          message: "No local prompts or markdown documents found to migrate.", 
          migratedPrompts: 0, 
          migratedDocs: 0 
        });
      }

      let migratedPrompts = 0;
      let migratedDocs = 0;
      let skippedPrompts = 0;
      let skippedDocs = 0;

      // 1. Migrate Prompts
      for (const p of localPrompts) {
        try {
          const { data: existing, error: checkErr } = await supabase
            .from('prompts')
            .select('id')
            .eq('user_id', user.id)
            .eq('title', p.title)
            .limit(1);

          if (checkErr) {
            console.error(`Error checking existing prompt "${p.title}":`, checkErr);
          }

          if (existing && existing.length > 0) {
            skippedPrompts++;
            continue;
          }

          const newId = `p_mig_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          const { error: pErr } = await supabase
            .from('prompts')
            .insert({
              id: newId,
              title: p.title,
              description: p.description || "",
              content: p.content || "",
              category: p.category || "General",
              tags: p.tags || [],
              platform: p.platform || "Gemini",
              is_favorite: !!p.isFavorite,
              user_id: user.id,
              created_at: p.createdAt || new Date().toISOString(),
              updated_at: p.updatedAt || new Date().toISOString()
            });

          if (pErr) {
            console.error(`Failed to insert prompt "${p.title}" during migration:`, pErr);
            continue;
          }

          if (p.versions && Array.isArray(p.versions)) {
            for (const v of p.versions) {
              await supabase
                .from('prompt_versions')
                .insert({
                  prompt_id: newId,
                  version: v.version || 1,
                  content: v.content || "",
                  comment: v.comment || "Migrated version",
                  updated_at: v.updatedAt || new Date().toISOString()
                });
            }
          } else {
            await supabase
              .from('prompt_versions')
              .insert({
                prompt_id: newId,
                version: 1,
                content: p.content || "",
                comment: "Migrated prompt",
                updated_at: new Date().toISOString()
              });
          }

          migratedPrompts++;
        } catch (promptErr) {
          console.error(`Migration error on prompt "${p.title}":`, promptErr);
        }
      }

      // 2. Migrate Markdown Docs
      for (const m of localMarkdowns) {
        try {
          const { data: existing, error: checkErr } = await supabase
            .from('markdown_docs')
            .select('id')
            .eq('user_id', user.id)
            .eq('path', m.path)
            .limit(1);

          if (checkErr) {
            console.error(`Error checking existing markdown doc "${m.path}":`, checkErr);
          }

          if (existing && existing.length > 0) {
            skippedDocs++;
            continue;
          }

          const newId = `md_mig_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          const { error: mErr } = await supabase
            .from('markdown_docs')
            .insert({
              id: newId,
              path: m.path,
              title: m.title || m.path,
              content: m.content || "",
              is_favorite: !!m.isFavorite,
              tags: m.tags || [],
              user_id: user.id,
              updated_at: m.updatedAt || new Date().toISOString()
            });

          if (mErr) {
            console.error(`Failed to insert markdown document "${m.path}" during migration:`, mErr);
            continue;
          }

          migratedDocs++;
        } catch (docErr) {
          console.error(`Migration error on document "${m.path}":`, docErr);
        }
      }

      logUserActivity(
        user.id, 
        'git_sync', 
        `Migrated local state database contents into Supabase cloud storage (${migratedPrompts} prompts, ${migratedDocs} markdowns inserted).`, 
        activityLogs
      );

      res.json({
        success: true,
        migratedPrompts,
        migratedDocs,
        skippedPrompts,
        skippedDocs,
        message: `Migration successful! Pushed ${migratedPrompts} prompts and ${migratedDocs} documents to your Supabase cloud tables. ${skippedPrompts + skippedDocs} duplicate items were skipped.`
      });

    } catch (err: any) {
      console.error("Database migration handler failed:", err);
      res.status(500).json({ error: err.message || "Failed to execute local-to-cloud data migration" });
    }
  });

  // Export as JSON / ZIP
  app.get("/api/export/:format", (req, res) => {
    const { format } = req.params;
    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=prompt_vault_export.json");
      res.send(JSON.stringify({ prompts, markdowns }, null, 2));
    } else {
      res.status(400).send("Format not supported directly. Zip is handled fully on client-side JS using JSZip which provides seamless progress UI!");
    }
  });

  // Bulk import JSON
  app.post("/api/import/json", async (req, res) => {
    const { prompts: importedPrompts, markdowns: importedMarkdowns } = req.body;
    let addedPrompts = 0;
    let addedDocs = 0;

    if (Array.isArray(importedPrompts)) {
      importedPrompts.forEach((p: any) => {
        if (p.title && p.content) {
          prompts.unshift({
            id: `p_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: p.title,
            description: p.description || "",
            content: p.content,
            category: p.category || "Imported",
            tags: p.tags || [],
            platform: p.platform || "Gemini",
            isFavorite: !!p.isFavorite,
            versions: p.versions || [{ version: 1, content: p.content, updatedAt: new Date().toISOString(), comment: "Imported prompt" }],
            createdAt: p.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          addedPrompts++;
        }
      });
    }

    if (Array.isArray(importedMarkdowns)) {
      importedMarkdowns.forEach((m: any) => {
        if (m.path && m.content) {
          const cleanPath = m.path.startsWith('/') ? m.path.substring(1) : m.path;
          const existingIdx = markdowns.findIndex(ex => ex.path === cleanPath);
          if (existingIdx !== -1) {
            markdowns[existingIdx].content = m.content;
            markdowns[existingIdx].updatedAt = new Date().toISOString();
          } else {
            markdowns.push({
              id: `md_imp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              path: cleanPath,
              title: m.title || path.basename(cleanPath),
              content: m.content,
              isFavorite: !!m.isFavorite,
              updatedAt: new Date().toISOString()
            });
            addedDocs++;
          }
        }
      });
    }

    logActivity('git_sync', `Bulk Import: Loaded ${addedPrompts} prompts, ${addedDocs} markdown files.`);
    await saveDatabase();
    res.json({ success: true, addedPrompts, addedDocs });
  });

  // --- VITE MIDDLEWARE CONFIGURATION ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA Wildcard fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Prompt Vault Server running on http://localhost:${PORT}`);
  });
}

startServer();
