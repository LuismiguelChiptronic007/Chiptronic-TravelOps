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

let isSubmitting = false;
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  hideAlert(alertEl);
  btn.disabled = true;
  const oldBtnText = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>`;

  try {
    const data = await api.login({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    setSession(data.token, data.user);
    window.location.assign('index.html');
  } catch (err) {
    const msg = err.message || 'Falha no login';
    if (msg === 'Failed to fetch') {
      showAlert(alertEl, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
    } else {
      showAlert(alertEl, msg);
    }
  } finally {
    if (document.body.contains(btn)) {
      btn.disabled = false;
      btn.innerHTML = oldBtnText;
    }
    isSubmitting = false;
  }
});
