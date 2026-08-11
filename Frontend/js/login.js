import {
  api,
  hideAlert,
  redirectIfAuth,
  setSession,
  showAlert,
} from './api.js';
import { initPasswordFields } from './password-field.js';

if (redirectIfAuth()) {
  /* already logged in */
}

initPasswordFields();

const form = document.getElementById('login-form');
const alertEl = document.getElementById('alert');
const btn = document.getElementById('btn-submit');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  btn.disabled = true;

  try {
    const data = await api.login({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    setSession(data.token, data.user);
    location.href = 'index.html';
  } catch (err) {
    const msg = err.message || 'Falha no login';
    if (msg === 'Failed to fetch') {
      showAlert(alertEl, 'Erro de conexão: verifique se o servidor de desenvolvimento está rodando e abra o app em http://127.0.0.1:8787/');
    } else {
      showAlert(alertEl, msg);
    }
    btn.disabled = false;
  }
});
