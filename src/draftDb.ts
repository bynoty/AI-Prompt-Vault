// Simple client-side IndexedDB helper for document and prompt drafts
export interface DraftData {
  id: string; // e.g. 'markdown_123' or 'prompt_abc'
  type: 'markdown' | 'prompt';
  targetId: string; // The ID of the doc/prompt, or 'new'
  title: string;
  content: string;
  tagsString?: string; // tags as comma separated or array
  description?: string; // prompts only
  platform?: string; // prompts only
  category?: string; // prompts only
  updatedAt: number;
}

const DB_NAME = 'PromptDocDraftsDB';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB for drafts');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveDraft(id: string, data: Omit<DraftData, 'id' | 'updatedAt'>): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const draftRecord: DraftData = {
        ...data,
        id,
        updatedAt: Date.now()
      };
      
      const request = store.put(draftRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error saving draft to IndexedDB:', err);
  }
}

export async function getDraft(id: string): Promise<DraftData | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error getting draft from IndexedDB:', err);
    return null;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error deleting draft from IndexedDB:', err);
  }
}
