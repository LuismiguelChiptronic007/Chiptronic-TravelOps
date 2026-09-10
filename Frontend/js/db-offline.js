const DB_NAME = 'TravelOpsDB';
const STORE_NAME = 'pending_trips';
const API_PATH = '/trips';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finishTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transacao offline cancelada.'));
  });
}

export async function saveTripOffline(tripData) {
  const db = await openOfflineDB();
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).add({
    payload: tripData,
    createdAt: new Date().toISOString(),
  });
  await finishTransaction(transaction);
  window.dispatchEvent(new CustomEvent('travelops-offline-saved'));
}

async function readPendingTrips(db) {
  const transaction = db.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function removePendingTrip(db, localId) {
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(localId);
  await finishTransaction(transaction);
}

export async function syncPendingTrips() {
  if (!navigator.onLine) return;
  const db = await openOfflineDB();
  const pendingTrips = await readPendingTrips(db);
  const token = localStorage.getItem('cto_token');
  if (!token) return;

  for (const item of pendingTrips) {
    try {
      const response = await fetch(`${window.__API_BASE || '/api'}${API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(item.payload),
      });
      if (response.ok) await removePendingTrip(db, item.localId);
    } catch {
      break;
    }
  }
}

window.addEventListener('online', () => syncPendingTrips().catch(() => {}));
if (navigator.onLine) syncPendingTrips().catch(() => {});
