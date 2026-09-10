import { api, hideAlert, showAlert } from './api.js';
import { initPasswordFields } from './password-field.js';

const alertEl = document.getElementById('alert');
const forgotForm = document.getElementById('forgot-form');
const resetForm = document.getElementById('reset-form');

initPasswordFields();

forgotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  try {
    const res = await api.forgotPassword(document.getElementById('email').value.trim());
    const msg = res.message || 'Solicitação enviada.';
    showAlert(alertEl, msg, 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

const params = new URLSearchParams(window.location.search);
const tokenFromUrl = params.get('token');
if (tokenFromUrl && document.getElementById('token')) {
  document.getElementById('token').value = tokenFromUrl;
}

resetForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);
  try {
    const res = await api.resetPassword({
      token: document.getElementById('token').value.trim(),
      password: document.getElementById('password').value,
      password_confirm: document.getElementById('password_confirm').value,
    });
    showAlert(alertEl, res.message || 'Senha redefinida.', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});
