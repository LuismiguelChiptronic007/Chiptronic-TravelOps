import {
  api,
  hideAlert,
  redirectIfAuth,
  setSession,
  showAlert,
} from './api.js';
import {
  initPasswordFields,
  bindPasswordRules,
  passwordRulesMet,
} from './password-field.js';

if (redirectIfAuth()) {
  /* already logged in */
}

const form = document.getElementById('register-form');
const alertEl = document.getElementById('alert');
const btn = document.getElementById('btn-submit');
const sectorSelect = document.getElementById('sector');
const positionSelect = document.getElementById('position_title');
const leaderHint = document.getElementById('leader-hint');
const passwordInput = document.getElementById('password');

// Debug log
console.log('Debug: sectorSelect element:', sectorSelect);

initPasswordFields();
bindPasswordRules(passwordInput, document.getElementById('password-rules'));

async function loadSectors() {
  try {
    console.log('Fetching sectors from API...');
    const res = await api.sectors();
    console.log('API response:', res);
    
    if (!sectorSelect) {
      console.error('ERROR: sectorSelect is null!');
      return;
    }
    
    const sectors = res.sectors || [];
    console.log('Adding', sectors.length, 'sectors to dropdown');
    
    for (const s of sectors) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sectorSelect.appendChild(opt);
      console.log('Added sector:', s);
    }
  } catch (err) {
    console.error('Error loading sectors:', err);
    showAlert(alertEl, 'Não foi possível carregar os setores. Tente novamente.');
  }
}

function updateLeaderHint() {
  if (!leaderHint) return;
  const isLeader = positionSelect.value === 'Líder';
  leaderHint.classList.toggle('hidden', !isLeader);
}

positionSelect?.addEventListener('change', updateLeaderHint);
loadSectors();
updateLeaderHint();

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);

  if (!passwordRulesMet(form.password.value)) {
    showAlert(alertEl, 'A senha não atende aos requisitos mínimos.');
    return;
  }

  if (form.password.value !== form.password_confirm.value) {
    showAlert(alertEl, 'As senhas não coincidem.');
    return;
  }

  btn.disabled = true;
  try {
    const data = await api.register({
      full_name: form.full_name.value.trim(),
      email: form.email.value.trim(),
      sector: form.sector.value,
      position_title: form.position_title.value,
      password: form.password.value,
      password_confirm: form.password_confirm.value,
    });
    setSession(data.token, data.user);
    location.href = 'index.html';
  } catch (err) {
    showAlert(alertEl, err.message || 'Falha no cadastro');
    btn.disabled = false;
  }
});
