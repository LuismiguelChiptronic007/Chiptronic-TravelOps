 window.__API_BASE = "https://chiptronic-travelops.luismiguelgomesoliveira-014.workers.dev/api";

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => {});
	});
}

if ('indexedDB' in window) {
	import('./db-offline.js').catch(() => {});
}