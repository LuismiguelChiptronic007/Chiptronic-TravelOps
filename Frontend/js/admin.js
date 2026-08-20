import { api, formatDateBR, formatSectorName } from './api.js';
import { escapeHtml, mountShell, showToast } from './layout.js';

const body = document.getElementById('users-body');
const alertEl = document.getElementById('admin-alert');
let viewer = null;
let users = [];

function showError(message) {
  alertEl.textContent = message;
  alertEl.className = 'alert alert-danger';
}

function formatActivity(value) {
  if (!value) return 'Nunca';
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function roleLabel(user) {
  if (user.is_admin_master) return '<span class="admin-level master">Admin Master</span>';
  if (user.is_admin) return '<span class="admin-level">Administrador</span>';
  return '<span class="admin-level user">Usuário</span>';
}

function actionButtons(user) {
  if (user.is_admin_master || !viewer.is_admin_master) return '<span class="admin-muted">Sem ações</span>';
  const nextRole = user.is_admin ? 'user' : 'admin';
  const label = user.is_admin ? 'Remover admin' : 'Tornar admin';
  return `
    <button type="button" class="admin-action role-action" data-id="${user.id}" data-role="${nextRole}">${label}</button>
    <button type="button" class="admin-action delete-action" data-id="${user.id}" aria-label="Excluir usuário">▣ Excluir</button>`;
}

function renderUsers() {
  document.getElementById('users-count').textContent = users.length;
  document.getElementById('admins-count').textContent = users.filter((user) => user.is_admin).length;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum usuário encontrado.</td></tr>';
    return;
  }
  body.innerHTML = users.map((user) => `
    <tr>
      <td><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(formatSectorName(user.sector))}</small></td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="admin-status"><i></i> Ativo</span></td>
      <td>${roleLabel(user)}</td>
      <td class="admin-activity">${escapeHtml(formatActivity(user.last_activity))}</td>
      <td class="actions">${actionButtons(user)}</td>
    </tr>`).join('');
}

async function loadUsers() {
  body.innerHTML = '<tr><td colspan="6" class="empty-state">Carregando usuários...</td></tr>';
  try {
    const result = await api.adminUsers();
    users = result.users || [];
    renderUsers();
  } catch (error) {
    showError(error.message || 'Não foi possível carregar os usuários.');
    body.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(error.message || 'Erro ao carregar usuários.')}</td></tr>`;
  }
}

body.addEventListener('click', async (event) => {
  const roleButton = event.target.closest('.role-action');
  const deleteButton = event.target.closest('.delete-action');
  const button = roleButton || deleteButton;
  if (!button) return;
  const user = users.find((item) => String(item.id) === button.dataset.id);
  if (!user) return;

  if (deleteButton && !window.confirm(`Excluir o usuário ${user.full_name}?`)) return;
  button.disabled = true;
  try {
    if (roleButton) await api.updateAdminRole(user.id, button.dataset.role);
    else await api.deleteAdminUser(user.id);
    showToast({ type: 'success', title: 'Painel atualizado', msg: roleButton ? 'Nível do usuário atualizado.' : 'Usuário excluído.', duration: 2600 });
    await loadUsers();
  } catch (error) {
    showError(error.message || 'Não foi possível concluir a ação.');
    button.disabled = false;
  }
});

document.getElementById('refresh-users').addEventListener('click', loadUsers);

const start = async () => {
  viewer = await mountShell({ active: 'admin' });
  if (!viewer || !viewer.is_admin) {
    window.location.href = 'index.html';
    return;
  }
  await loadUsers();
};

start();
