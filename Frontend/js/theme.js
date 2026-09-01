const THEME_KEY = 'cto_theme';

function getSystemTheme() {
  return 'light';
}

export function getStoredTheme() {
  localStorage.setItem(THEME_KEY, 'light');
  return 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', 'light');
}

export function toggleTheme() {
  localStorage.setItem(THEME_KEY, 'light');
  applyTheme('light');
  return 'light';
}

applyTheme('light');
