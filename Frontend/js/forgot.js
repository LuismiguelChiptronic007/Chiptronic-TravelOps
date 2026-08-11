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
    let msg = res.message || 'Solicitação enviada.';
    if (res.dev_reset_token) {
      msg += ` Token (dev): ${res.dev_reset_token}`;
      document.getElementById('token').value = res.dev_reset_token;
    }
    showAlert(alertEl, msg, 'success');
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});

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
      location.href = 'login.html';
    }, 1200);
  } catch (err) {
    showAlert(alertEl, err.message);
  }
});
