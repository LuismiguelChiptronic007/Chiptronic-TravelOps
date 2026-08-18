import {
  api,
  formatSectorName,
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
    opt.textContent = formatSectorName(s);
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

let isSubmitting = false;

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(alertEl);

  if (isSubmitting) return;
  isSubmitting = true;

  if (!passwordRulesMet(form.password.value)) {
    showAlert(alertEl, 'A senha não atende aos requisitos mínimos.');
    isSubmitting = false;
    return;
  }

  if (form.password.value !== form.password_confirm.value) {
    showAlert(alertEl, 'As senhas não coincidem.');
    isSubmitting = false;
    return;
  }

  const emailValue = form.email.value.trim().toLowerCase();
  if (!/^[^@\s]+@chiptronic\.com\.br$/.test(emailValue)) {
    showAlert(alertEl, 'Use um e-mail corporativo válido @chiptronic.com.br.');
    isSubmitting = false;
    return;
  }

  const originalText = btn?.textContent || 'Cadastrar';
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.textContent = 'Cadastrando...';
  }
  try {
    const data = await api.register({
      full_name: form.full_name.value.trim(),
      email: emailValue,
      sector: form.sector.value,
      position_title: form.position_title.value,
      password: form.password.value,
      password_confirm: form.password_confirm.value,
    });
    setSession(data.token, data.user);
    window.location.href = 'index.html';
  } catch (err) {
    const msg = err.message || 'Falha no cadastro';
    if (msg === 'Failed to fetch') {
      showAlert(alertEl, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
    } else if (msg && msg.toLowerCase().includes('já cadastrado')) {
      showAlert(alertEl, msg + ' Se você já se cadastrou, acesse a página de Login ao invés de tentar cadastrar novamente.');
    } else {
      showAlert(alertEl, msg);
    }
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.textContent = originalText;
    }
    isSubmitting = false;
  }
});
