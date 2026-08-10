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

initPasswordFields();
bindPasswordRules(passwordInput, document.getElementById('password-rules'));

const FALLBACK_SECTORS = [
  'APLICAÇÃO',
  'CRIPTO',
  'DIESELDIAG',
  'ECU TEST',
  'HARDWARE',
  'MOBILE',
  'MOTODIAG',
  'OBDMAP',
  'PROJETOS ESPECIAIS',
  'RESOLVE',
  'T.I INTERNO',
  'T.I TELEMETRIA',
  'TELEMETRIA ADM',
  'TELEMETRIA HW',
  'TELEMETRIA SW',
];

async function loadSectors() {
  if (!sectorSelect) {
    console.error('ERROR: sectorSelect is null!');
    return;
  }

  sectorSelect.innerHTML = '<option value="">Selecione seu setor</option>';

  let sectors = [];
  try {
    const res = await api.sectors();
    sectors = res.sectors || [];
  } catch (err) {
    console.warn('API de setores falhou, usando fallback.', err);
    sectors = FALLBACK_SECTORS.slice();
  }

  if (!sectors.length) sectors = FALLBACK_SECTORS.slice();

  for (const s of sectors) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sectorSelect.appendChild(opt);
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
