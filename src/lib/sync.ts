import { supabase } from './supabase';
import { Prompt, MarkdownDoc } from '../types';

export interface SyncQueueItem {
  id: string;
  type: 'prompt' | 'markdown';
  action: 'insert' | 'update' | 'delete';
  data: any; // Prompt or MarkdownDoc format
  timestamp: string; // ISO string when queued
  retryCount: number;
  lastError?: string;
}

export interface SyncSummary {
  success: boolean;
  syncedPrompts: number;
  syncedDocs: number;
  failedCount: number;
  skippedCount: number;
  details: string[];
}

export interface SyncStatus {
  pendingCount: number;
  pendingPrompts: number;
  pendingDocs: number;
  lastSyncTime: string | null;
  status: 'idle' | 'syncing' | 'error' | 'success';
}

const QUEUE_KEY = 'vault_offline_sync_queue';
const LAST_SYNC_KEY = 'vault_last_sync_timestamp';

/**
 * Retrieve all pending records from local storage queue
 */
export function getPendingRecords(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse sync queue:', err);
    return [];
  }
}

/**
 * Save pending records back to local storage queue
 */
export function savePendingRecords(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save sync queue:', err);
  }
}

/**
 * Queue a new change to be synced later
 */
export function queuePendingRecord(
  type: 'prompt' | 'markdown',
  action: 'insert' | 'update' | 'delete',
  id: string,
  data: any
): void {
  const queue = getPendingRecords();
  
  // Clean up any existing pending operation for the same item to avoid redundancy
  const filteredQueue = queue.filter(item => !(item.id === id && item.type === type));
  
  const newItem: SyncQueueItem = {
    id,
    type,
    action,
    data,
    timestamp: new Date().toISOString(),
    retryCount: 0
  };
  
  filteredQueue.push(newItem);
  savePendingRecords(filteredQueue);
}

/**
 * Remove an item from the pending queue
 */
export function dequeueRecord(id: string, type: 'prompt' | 'markdown'): void {
  const queue = getPendingRecords();
  const updated = queue.filter(item => !(item.id === id && item.type === type));
  savePendingRecords(updated);
}

/**
 * Clear the entire pending queue
 */
export function clearPendingRecords(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch (err) {
    console.error('Failed to clear sync queue:', err);
  }
}

/**
 * Get current sync status statistics
 */
export function getSyncStatus(): SyncStatus {
  const queue = getPendingRecords();
  const pendingPrompts = queue.filter(item => item.type === 'prompt').length;
  const pendingDocs = queue.filter(item => item.type === 'markdown').length;
  const lastSyncTime = localStorage.getItem(LAST_SYNC_KEY);
  
  let currentStatus: SyncStatus['status'] = 'idle';
  const lastStatus = localStorage.getItem('vault_sync_status_state');
  if (lastStatus === 'syncing' || lastStatus === 'error' || lastStatus === 'success') {
    currentStatus = lastStatus;
  }

  return {
    pendingCount: queue.length,
    pendingPrompts,
    pendingDocs,
    lastSyncTime,
    status: currentStatus
  };
}

/**
 * Update the global sync status tracking
 */
export function setSyncStatusState(status: SyncStatus['status']): void {
  localStorage.setItem('vault_sync_status_state', status);
  if (status === 'success') {
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  }
}

/**
 * Sleep helper for exponential backoff retry logic
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Synchronize local pending queue to Supabase database.
 * Supports batched upsert, conflict resolution (latest-write-wins), and automatic backoff retries.
 */
export async function syncLocalToSupabase(
  conflictStrategy: 'latest_wins' | 'local_wins' | 'cloud_wins' = 'latest_wins',
  onProgress?: (percent: number, message: string) => void
): Promise<SyncSummary> {
  setSyncStatusState('syncing');
  const queue = getPendingRecords();
  
  const summary: SyncSummary = {
    success: true,
    syncedPrompts: 0,
    syncedDocs: 0,
    failedCount: 0,
    skippedCount: 0,
    details: []
  };

  if (queue.length === 0) {
    setSyncStatusState('success');
    summary.details.push('No pending local records to sync.');
    return summary;
  }

  // 1. Check active user session
  onProgress?.(5, 'Authenticating session with Supabase...');
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr || !session?.user) {
    setSyncStatusState('error');
    summary.success = false;
    summary.details.push('Synchronization failed: No active user session found. Please log in.');
    return summary;
  }

  const userId = session.user.id;
  const totalItems = queue.length;
  const remainingQueue: SyncQueueItem[] = [];

  // 2. Process each item with conflict detection and retry logic
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const progressPercent = Math.round(10 + (i / totalItems) * 85);
    onProgress?.(progressPercent, `Syncing ${item.type} "${item.id}" (${i + 1}/${totalItems})...`);

    let processedSuccessfully = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!processedSuccessfully && attempts < maxAttempts) {
      attempts++;
      try {
        if (item.action === 'delete') {
          // Perform DELETE on Supabase
          const table = item.type === 'prompt' ? 'prompts' : 'markdown_docs';
          const { error: delErr } = await supabase
            .from(table)
            .delete()
            .eq('id', item.id)
            .eq('user_id', userId);

          if (delErr) throw delErr;
          
          processedSuccessfully = true;
          if (item.type === 'prompt') summary.syncedPrompts++;
          else summary.syncedDocs++;
          summary.details.push(`Deleted ${item.type} (ID: ${item.id}) from cloud.`);
        } else {
          // INSERT or UPDATE - requiring Conflict Detection
          const table = item.type === 'prompt' ? 'prompts' : 'markdown_docs';
          
          // Query current state from Supabase to detect conflict
          const { data: remoteData, error: fetchErr } = await supabase
            .from(table)
            .select('*')
            .eq('id', item.id)
            .eq('user_id', userId)
            .maybeSingle();

          if (fetchErr) {
            console.warn(`Could not query remote version for conflict check on ID: ${item.id}`, fetchErr);
          }

          let shouldUpsert = true;

          if (remoteData) {
            const remoteUpdated = remoteData.updated_at || remoteData.updatedAt || '';
            const localUpdated = item.data.updatedAt || item.data.updated_at || '';

            if (conflictStrategy === 'cloud_wins') {
              shouldUpsert = false;
              summary.skippedCount++;
              summary.details.push(`Conflict: Cloud wins on ${item.type} "${item.id}". Local changes skipped.`);
            } else if (conflictStrategy === 'latest_wins' && remoteUpdated && localUpdated) {
              const remoteTime = new Date(remoteUpdated).getTime();
              const localTime = new Date(localUpdated).getTime();
              
              if (remoteTime > localTime) {
                shouldUpsert = false;
                summary.skippedCount++;
                summary.details.push(`Conflict: Cloud is newer for ${item.type} "${item.id}". Skipping local changes.`);
              }
            }
          }

          if (shouldUpsert) {
            if (item.type === 'prompt') {
              const p = item.data as Prompt;
              const { error: pErr } = await supabase
                .from('prompts')
                .upsert({
                  id: p.id,
                  title: p.title,
                  description: p.description || '',
                  content: p.content || '',
                  category: p.category || 'General',
                  tags: p.tags || [],
                  platform: p.platform || 'Gemini',
                  is_favorite: !!p.isFavorite,
                  user_id: userId,
                  updated_at: p.updatedAt || new Date().toISOString()
                });

              if (pErr) throw pErr;

              // Synchronize prompt versions if available
              if (p.versions && Array.isArray(p.versions)) {
                for (const v of p.versions) {
                  await supabase
                    .from('prompt_versions')
                    .upsert({
                      prompt_id: p.id,
                      version: v.version,
                      content: v.content,
                      comment: v.comment || '',
                      updated_at: v.updatedAt || new Date().toISOString()
                    });
                }
              }

              summary.syncedPrompts++;
              summary.details.push(`Synced prompt "${p.title}" successfully.`);
            } else {
              const m = item.data as MarkdownDoc;
              const { error: mErr } = await supabase
                .from('markdown_docs')
                .upsert({
                  id: m.id,
                  path: m.path,
                  title: m.title || m.path,
                  content: m.content || '',
                  is_favorite: !!m.isFavorite,
                  tags: m.tags || [],
                  user_id: userId,
                  updated_at: m.updatedAt || new Date().toISOString()
                });

              if (mErr) throw mErr;

              summary.syncedDocs++;
              summary.details.push(`Synced markdown document "${m.path}" successfully.`);
            }
          }

          processedSuccessfully = true;
        }
      } catch (err: any) {
        console.warn(`Sync attempt ${attempts}/${maxAttempts} failed for item ${item.id}:`, err);
        if (attempts < maxAttempts) {
          // Exponential backoff
          await sleep(Math.pow(2, attempts) * 300);
        } else {
          summary.failedCount++;
          summary.success = false;
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = err.message || 'Unknown network or database error';
          remainingQueue.push(item);
          summary.details.push(`Failed to sync ${item.type} "${item.id}" after ${maxAttempts} attempts: ${item.lastError}`);
        }
      }
    }
  }

  // 3. Update local queue with items that failed
  savePendingRecords(remainingQueue);
  setSyncStatusState(summary.success ? 'success' : 'error');
  onProgress?.(100, summary.success ? 'Sync Completed!' : 'Sync Completed with errors.');

  return summary;
}

/**
 * Pull all data from Supabase to overwrite/update the local store
 */
export async function syncSupabaseToLocal(): Promise<{ success: boolean; promptsCount: number; docsCount: number; error?: string }> {
  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session?.user) {
      return { success: false, promptsCount: 0, docsCount: 0, error: 'No authenticated user session found.' };
    }

    const userId = session.user.id;

    // Fetch cloud prompts
    const { data: cloudPrompts, error: pErr } = await supabase
      .from('prompts')
      .select('*, versions:prompt_versions(*)')
      .eq('user_id', userId);

    if (pErr) throw pErr;

    // Fetch cloud documents
    const { data: cloudDocs, error: dErr } = await supabase
      .from('markdown_docs')
      .select('*')
      .eq('user_id', userId);

    if (dErr) throw dErr;

    // Transform back to types
    const localPrompts: Prompt[] = (cloudPrompts || []).map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      content: p.content,
      category: p.category,
      tags: p.tags,
      platform: p.platform,
      isFavorite: !!p.is_favorite,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      versions: (p.versions || []).map((v: any) => ({
        version: v.version,
        content: v.content,
        updatedAt: v.updated_at,
        comment: v.comment
      }))
    }));

    const localDocs: MarkdownDoc[] = (cloudDocs || []).map(d => ({
      id: d.id,
      path: d.path,
      title: d.title,
      content: d.content,
      isFavorite: !!d.is_favorite,
      tags: d.tags,
      updatedAt: d.updated_at
    }));

    // Cache to client localStorage for immediate offline access
    localStorage.setItem('vault_cached_prompts', JSON.stringify(localPrompts));
    localStorage.setItem('vault_cached_docs', JSON.stringify(localDocs));
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

    return {
      success: true,
      promptsCount: localPrompts.length,
      docsCount: localDocs.length
    };
  } catch (err: any) {
    console.error('Failed to sync cloud data to local:', err);
    return {
      success: false,
      promptsCount: 0,
      docsCount: 0,
      error: err.message || 'Failed to pull cloud database records'
    };
  }
}

/**
 * Fetch prompts, docs, and calculate stats directly from Supabase (client-side fallback for Vercel)
 */
export async function fetchDirectFromSupabase(): Promise<{ success: boolean; prompts: Prompt[]; docs: MarkdownDoc[]; stats: any }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      // Fallback to local offline cache
      const cachedPrompts = localStorage.getItem('vault_cached_prompts');
      const cachedDocs = localStorage.getItem('vault_cached_docs');
      const prompts = cachedPrompts ? JSON.parse(cachedPrompts) : [];
      const docs = cachedDocs ? JSON.parse(cachedDocs) : [];
      return { success: true, prompts, docs, stats: calculateStatsClient(prompts, docs) };
    }

    const userId = session.user.id;

    // Fetch cloud prompts
    const { data: cloudPrompts, error: pErr } = await supabase
      .from('prompts')
      .select('*, versions:prompt_versions(*)')
      .eq('user_id', userId);

    if (pErr) throw pErr;

    // Fetch cloud documents
    const { data: cloudDocs, error: dErr } = await supabase
      .from('markdown_docs')
      .select('*')
      .eq('user_id', userId);

    if (dErr) throw dErr;

    const prompts: Prompt[] = (cloudPrompts || []).map(p => ({
      id: p.id,
      title: p.title || '',
      description: p.description || '',
      content: p.content || '',
      category: p.category || 'General',
      tags: p.tags || [],
      platform: p.platform || 'Gemini',
      isFavorite: !!p.is_favorite,
      createdAt: p.created_at || new Date().toISOString(),
      updatedAt: p.updated_at || new Date().toISOString(),
      versions: (p.versions || []).map((v: any) => ({
        version: v.version,
        content: v.content,
        updatedAt: v.updated_at,
        comment: v.comment
      })).sort((a: any, b: any) => a.version - b.version)
    }));

    const docs: MarkdownDoc[] = (cloudDocs || []).map(d => ({
      id: d.id,
      path: d.path,
      title: d.title || d.path,
      content: d.content || '',
      isFavorite: !!d.is_favorite,
      tags: d.tags || [],
      updatedAt: d.updated_at || new Date().toISOString()
    }));

    // Save to cache
    localStorage.setItem('vault_cached_prompts', JSON.stringify(prompts));
    localStorage.setItem('vault_cached_docs', JSON.stringify(docs));

    return {
      success: true,
      prompts,
      docs,
      stats: calculateStatsClient(prompts, docs)
    };
  } catch (err: any) {
    console.error('fetchDirectFromSupabase error:', err);
    // Fallback to cache on error
    const cachedPrompts = localStorage.getItem('vault_cached_prompts');
    const cachedDocs = localStorage.getItem('vault_cached_docs');
    const prompts = cachedPrompts ? JSON.parse(cachedPrompts) : [];
    const docs = cachedDocs ? JSON.parse(cachedDocs) : [];
    return {
      success: false,
      prompts,
      docs,
      stats: calculateStatsClient(prompts, docs)
    };
  }
}

function calculateStatsClient(prompts: Prompt[], docs: MarkdownDoc[]) {
  const favoriteCount = prompts.filter(p => p.isFavorite).length + docs.filter(m => m.isFavorite).length;
  
  // Tag cloud calculation
  const tagsMap: Record<string, number> = {};
  prompts.forEach(p => {
    (p.tags || []).forEach(t => {
      tagsMap[t] = (tagsMap[t] || 0) + 1;
    });
  });
  const mostUsedTags = Object.entries(tagsMap)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Platform stats
  const platformMap: Record<string, number> = {};
  prompts.forEach(p => {
    platformMap[p.platform] = (platformMap[p.platform] || 0) + 1;
  });
  const platformStats = Object.entries(platformMap).map(([platform, count]) => ({ platform, count }));

  // Recent items
  const merged = [
    ...prompts.map(p => ({ ...p, type: 'prompt' as const })),
    ...docs.map(m => ({ ...m, type: 'markdown' as const }))
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    promptCount: prompts.length,
    docCount: docs.length,
    favoriteCount,
    recentUpdated: merged.slice(0, 5),
    mostUsedTags,
    platformStats,
    recentActivity: []
  };
}
