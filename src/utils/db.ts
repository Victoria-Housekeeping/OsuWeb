const DB_NAME = 'OsuTouchDB';
const DB_VERSION = 3;
const STORE_NAME = 'osz_files';
const ASSETS_STORE_NAME = 'custom_assets';
const KOMPLI_SKINS_STORE_NAME = 'kompli_skins';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE_NAME)) {
        db.createObjectStore(ASSETS_STORE_NAME, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(KOMPLI_SKINS_STORE_NAME)) {
        db.createObjectStore(KOMPLI_SKINS_STORE_NAME, { keyPath: 'name' });
      }
    };
  });
}

export async function saveOszFile(name: string, blob: Blob): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ name, blob });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('Failed to save in IndexedDB:', err);
  }
}

export async function getAllOszFiles(): Promise<{ name: string; blob: Blob }[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (err) {
    console.error('Failed to query IndexedDB:', err);
    return [];
  }
}

export async function getOszFile(name: string): Promise<Blob | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);
      request.onsuccess = () => {
        db.close();
        if (request.result) resolve(request.result.blob);
        else resolve(null);
      };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (err) {
    console.error('Failed to get osz from IndexedDB:', err);
    return null;
  }
}

export async function deleteOszFile(name: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(name);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('Failed to delete from IndexedDB:', err);
  }
}

export async function saveCustomAsset(name: string, blob: Blob): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSETS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ASSETS_STORE_NAME);
      const request = store.put({ name, blob });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('Failed to save asset in IndexedDB:', err);
  }
}

export async function getCustomAsset(name: string): Promise<Blob | null> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ASSETS_STORE_NAME, 'readonly');
      const store = tx.objectStore(ASSETS_STORE_NAME);
      const request = store.get(name);
      request.onsuccess = () => {
        db.close();
        if (request.result) resolve(request.result.blob);
        else resolve(null);
      };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (err) {
    console.error('Failed to get asset from IndexedDB:', err);
    return null;
  }
}

export async function saveKompliSkin(name: string, data: any): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KOMPLI_SKINS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(KOMPLI_SKINS_STORE_NAME);
      const request = store.put({ name, data });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('Failed to save Kompli-Skin:', err);
  }
}

export async function getAllKompliSkins(): Promise<{ name: string; data: any }[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KOMPLI_SKINS_STORE_NAME, 'readonly');
      const store = tx.objectStore(KOMPLI_SKINS_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (err) {
    console.error('Failed to get Kompli-Skins:', err);
    return [];
  }
}

export async function deleteKompliSkin(name: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KOMPLI_SKINS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(KOMPLI_SKINS_STORE_NAME);
      const request = store.delete(name);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('Failed to delete Kompli-Skin:', err);
  }
}


