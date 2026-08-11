const THEME_KEY = 'cto_theme';

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  return next;
}

// Aplica imediatamente para evitar flash
applyTheme(getStoredTheme());
