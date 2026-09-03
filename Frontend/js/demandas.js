import { api, showAlert, hideAlert, formatDateBR } from './api.js';
import { escapeHtml } from './layout.js';

export function prioridadeCor(prioridade) {
  const p = Number(prioridade || 0);
  if (p === 1) return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca', label: 'P1' };
  if (p === 2) return { bg: '#fef3c7', text: '#92400e', border: '#fde68a', label: 'P2' };
  return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0', label: `P${p}` };
}

export function statusDemandaBadge(status) {
  const map = {
    pendente: { cls: 'badge badge-planned', label: 'Pendente' },
    em_andamento: { cls: 'badge badge-in_progress', label: 'Em andamento' },
    concluida: { cls: 'badge badge-completed', label: 'Concluída' },
  };
  const cfg = map[status] || { cls: 'badge badge-planned', label: status || '—' };
  return `<span class="${cfg.cls}">${cfg.label}</span>`;
}

function calcularResumoDemandas(demandas) {
  let totalPendentes = 0;
  let totalAndamento = 0;
  let totalConcluidas = 0;
  for (const d of demandas || []) {
    for (const dv of d.veiculos || []) {
      for (const a of dv.atividades || []) {
        if (a.status === 'pendente') totalPendentes++;
        else if (a.status === 'em_andamento') totalAndamento++;
        else if (a.status === 'concluida') totalConcluidas++;
      }
    }
  }
  return { totalPendentes, totalAndamento, totalConcluidas };
}

function renderResumoDemandasHtml(demandas) {
  const { totalPendentes, totalAndamento, totalConcluidas } = calcularResumoDemandas(demandas);
  return `
    <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <span class="badge planned">Pendentes: ${totalPendentes}</span>
      <span class="badge in_progress">Em andamento: ${totalAndamento}</span>
      <span class="badge completed">Concluídas: ${totalConcluidas}</span>
    </div>`;
}

function renderDemandaVeiculoTableHtml(dv, tipoProjeto, { showEditarVeiculo = false } = {}) {
  const atividadesSorted = [...(dv.atividades || [])].sort((a, b) => Number(a.prioridade) - Number(b.prioridade));
  const rows = atividadesSorted.map((a) => {
    const pc = prioridadeCor(a.prioridade);
    return `
      <tr>
        <td><span style="font-size:0.8rem;font-weight:600;">${escapeHtml(tipoProjeto || '—')}</span></td>
        <td><span style="display:inline-flex;padding:2px 8px;border-radius:999px;background:${pc.bg};color:${pc.text};border:1px solid ${pc.border};font-size:0.75rem;font-weight:700;">${pc.label}</span></td>
        <td>${escapeHtml(a.atividade_descricao || '—')}</td>
        <td>${statusDemandaBadge(a.status)}
            ${a.status === 'concluida' && a.concluida_nome ? `<div class="text-muted" style="font-size:0.75rem;margin-top:2px;">${escapeHtml(a.concluida_nome)} · ${formatDateBR(String(a.concluida_em || '').slice(0,10))}</div>` : ''}
        </td>
      </tr>`;
  }).join('');

  const cabVeic = [dv.montadora, dv.modelo, dv.versao_modelo].filter(Boolean).join(' · ') || 'Veículo';

  return `
    <div class="demanda-vehicle-card" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--panel-bg);">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:start;justify-content:space-between;margin-bottom:10px;">
        <div>
          <strong>${escapeHtml(cabVeic)}</strong>
          <div class="text-muted" style="font-size:0.85rem;">
            ${dv.placa ? `Placa: <strong>${escapeHtml(String(dv.placa).toUpperCase())}</strong>` : ''}
            ${dv.ano ? ` · Ano: <strong>${escapeHtml(dv.ano)}</strong>` : ''}
          </div>
        </div>
        ${showEditarVeiculo ? `<button type="button" class="btn btn-secondary btn-sm btn-editar-veiculo" data-veiculo-id="${dv.id}">Editar veículo</button>` : ''}
      </div>
      ${atividadesSorted.length ? `
      <table class="data" style="width:100%;margin:0;">
        <thead><tr><th style="width:150px;">Projeto</th><th style="width:60px;">Pri</th><th>Atividade</th><th style="width:170px;">Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<div class="text-muted" style="padding:8px 4px;">Sem atividades cadastradas.</div>'}
    </div>`;
}

function renderDemandaGroupCardHtml(demanda, { showEditarVeiculo = false } = {}) {
  const vCards = (demanda.veiculos || [])
    .map((dv) => renderDemandaVeiculoTableHtml(dv, demanda.tipo_projeto, { showEditarVeiculo }))
    .join('');

  return `
    <div class="demanda-group-card demanda-status-${demanda.status || 'pendente'}" style="margin-bottom:18px;">
      <div class="demanda-group-header">
        <div class="text-muted" style="font-size:0.8rem;">Criado por ${escapeHtml(demanda.criado_nome || 'Líder')} em ${formatDateBR(String(demanda.criado_em || '').slice(0,10))}</div>
        <div class="demanda-status-highlight">${statusDemandaBadge(demanda.status)}</div>
      </div>
      ${vCards || '<div class="empty-state" style="padding:12px;">Sem veículos nesta demanda.</div>'}
    </div>`;
}

function validarPlaca(placa) {
  if (!placa) return true;
  const limpa = String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}[0-9]{4}$/.test(limpa) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(limpa);
}

export async function abrirModalDemandasLider(viagemId, { onCriada, alertEl, fullPage = false } = {}) {
  const existing = document.getElementById('demanda-modal');
  if (!fullPage && existing) existing.remove();

  let veiculos = [
    { montadora: '', modelo: '', versao_modelo: '', ano: '', placa: '', tipo_projeto: '', atividades: [] }
  ];
  let atividadesModeloCache = [];
  let projetosCache = [];
  let workTypesCache = [];
  let demandasExistentes = [];
  let tipoTrabalhoSelecionado = '';

  try {
    const res = await api.demandas.listarViagem(viagemId);
    demandasExistentes = Array.isArray(res?.demandas) ? res.demandas : [];
  } catch (e) {
    demandasExistentes = [];
  }

  try {
    const workTypesRes = await api.leaderWorkTypes.list();
    workTypesCache = Array.isArray(workTypesRes?.work_types) ? workTypesRes.work_types : [];
  } catch (e) {
    workTypesCache = [];
  }

  let veiculoEdicaoId = null;
  const modal = fullPage
    ? document.getElementById('demandas-page-form')
    : document.createElement('div');
  if (!modal) return;
  const closeForm = () => {
    veiculoEdicaoId = null;
    if (fullPage) window.history.back();
    else modal.remove();
  };
  if (!fullPage) {
    modal.className = 'modal-overlay';
    modal.id = 'demanda-modal';
  }

  function render() {
    const veiculosHtml = veiculos.map((v, idx) => renderVeiculoCard(v, idx)).join('');
    const tipoProjetoGlobal = veiculos[0]?.tipo_projeto || '';
    const tipoTrabalhoGlobal = tipoTrabalhoSelecionado;
    const projetosHtml = projetosCache.length
      ? projetosCache.map(p => `<option value="${escapeHtml(p.name)}" ${p.name === tipoProjetoGlobal ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')
      : '<option value="">Nenhum projeto cadastrado para o setor</option>';
    const workTypesHtml = workTypesCache.length
      ? workTypesCache.map(wt => `<option value="${escapeHtml(wt.name)}" ${wt.name === tipoTrabalhoGlobal ? 'selected' : ''}>${escapeHtml(wt.name)}</option>`).join('')
      : '<option value="">Nenhum tipo de trabalho cadastrado</option>';

    const demandasJaFornecidasHtml = demandasExistentes.length
      ? `
        <div id="demandas" style="margin-top:22px;">
          <h3 style="margin:0 0 10px; font-size:1rem;">Demandas já fornecidas para esta viagem</h3>
          ${renderResumoDemandasHtml(demandasExistentes)}
          ${demandasExistentes.map((demanda) => renderDemandaGroupCardHtml(demanda, { showEditarVeiculo: true })).join('')}
        </div>`
      : '<div class="empty-state" style="margin-top:18px;">Nenhuma demanda fornecida ainda para esta viagem.</div>';

    modal.innerHTML = `
      <div class="${fullPage ? 'panel demandas-form-panel' : 'modal-content'}">
        <div class="${fullPage ? 'panel-header' : 'modal-header'}">
          <h2>Fornecer demandas — Veículos e atividades</h2>
          <button type="button" class="${fullPage ? 'btn btn-secondary' : 'modal-close'}" aria-label="Fechar">${fullPage ? 'Voltar' : '&times;'}</button>
        </div>
        <div class="${fullPage ? 'panel-body' : 'modal-body'}">
          <div style="margin-bottom: 12px;">
            <label for="demanda-tipo-trabalho">Tipo de trabalho</label>
            <select id="demanda-tipo-trabalho" ${workTypesCache.length ? '' : 'disabled'}>
              <option value="">Selecione um tipo de trabalho...</option>
              ${workTypesHtml}
            </select>
          </div>
          <div style="margin-bottom: 16px;">
            <label for="demanda-tipo-projeto">Tipo de projeto (todos os veículos)</label>
            <select id="demanda-tipo-projeto" ${projetosCache.length ? '' : 'disabled'}>
              <option value="">Selecione um projeto...</option>
              ${projetosHtml}
            </select>
          </div>
          <div id="demanda-veiculos-wrap">${veiculosHtml}</div>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button type="button" class="btn btn-secondary" id="btn-add-veiculo">+ Adicionar veículo</button>
            <button type="button" class="btn btn-secondary" id="btn-duplicar-ultimo" ${veiculos.length === 0 ? 'disabled' : ''}>⎘ Duplicar veículo anterior</button>
          </div>
          ${demandasJaFornecidasHtml}
        </div>
        <div class="${fullPage ? 'form-actions' : 'modal-footer'}">
          <button type="button" class="btn btn-secondary" id="btn-cancelar-demanda">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-salvar-demanda">Salvar demandas</button>
        </div>
      </div>`;

    modal.querySelector(fullPage ? '.panel-header .btn' : '.modal-close').addEventListener('click', closeForm);
    if (!fullPage) modal.addEventListener('click', (e) => { if (e.target === modal) closeForm(); });

    modal.querySelector('#demanda-tipo-projeto').addEventListener('change', (e) => {
      const val = e.target.value;
      veiculos.forEach(v => v.tipo_projeto = val);
    });

    modal.querySelector('#demanda-tipo-trabalho')?.addEventListener('change', (e) => {
      tipoTrabalhoSelecionado = e.target.value.trim();
    });

    modal.querySelector('#btn-add-veiculo').addEventListener('click', () => {
      const ref = veiculos[veiculos.length - 1];
      veiculos.push({
        montadora: '', modelo: '', versao_modelo: '', ano: '', placa: '',
        tipo_projeto: ref?.tipo_projeto || tipoProjetoGlobal,
        atividades: []
      });
      render();
    });

    modal.querySelector('#btn-duplicar-ultimo').addEventListener('click', () => {
      if (!veiculos.length) return;
      const ult = veiculos[veiculos.length - 1];
      veiculos.push({
        montadora: ult.montadora,
        modelo: ult.modelo,
        versao_modelo: ult.versao_modelo,
        ano: ult.ano,
        placa: '',
        tipo_projeto: ult.tipo_projeto,
        atividades: ult.atividades.map(a => ({ ...a }))
      });
      render();
    });

    modal.querySelector('#btn-cancelar-demanda').addEventListener('click', closeForm);
    modal.querySelector('#btn-salvar-demanda').addEventListener('click', salvar);
    modal.querySelectorAll('.btn-editar-veiculo').forEach((btn) => {
      btn.addEventListener('click', () => {
        const veiculoId = Number(btn.dataset.veiculoId || 0);
        const veiculo = demandasExistentes.flatMap(d => (d.veiculos || [])).find(v => Number(v.id) === veiculoId);
        const demanda = demandasExistentes.find(d => (d.veiculos || []).some(v => Number(v.id) === veiculoId));
        if (!veiculo || !demanda) return;

        veiculoEdicaoId = veiculoId;
        veiculos = [{
          montadora: veiculo.montadora || '',
          modelo: veiculo.modelo || '',
          versao_modelo: veiculo.versao_modelo || '',
          ano: veiculo.ano || '',
          placa: veiculo.placa || '',
          tipo_projeto: demanda.tipo_projeto || '',
          atividades: (veiculo.atividades || []).map((atividade) => ({
            atividade_modelo_id: atividade.atividade_modelo_id || '',
            prioridade: atividade.prioridade || 1,
            atividade_descricao: atividade.atividade_descricao || '',
            status: atividade.status || 'pendente',
            existente: true,
          }))
        }];
        tipoTrabalhoSelecionado = demanda.tipo_trabalho || demanda.demanda_tipo_trabalho || '';
        render();
      });
    });

    bindVeiculoInputs();
  }

  function renderVeiculoCard(v, idx) {
    const totalAtiv = v.atividades.length;
    return `
      <div class="demanda-veiculo-card" data-idx="${idx}" style="border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:14px;background:var(--panel-bg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="margin:0;font-size:1rem;">Veículo ${idx + 1}${totalAtiv ? ` · <span class="text-muted" style="font-size:0.85rem;font-weight:400;">${totalAtiv} atividade(s)</span>` : ''}</h3>
          <button type="button" class="btn btn-danger btn-sm btn-remover-veiculo" data-idx="${idx}" ${veiculos.length <= 1 ? 'disabled' : ''}>Remover</button>
        </div>
        <div class="form-grid two">
          <div><label>Montadora *</label><input data-campo="montadora" data-idx="${idx}" value="${escapeHtml(v.montadora)}" placeholder="Ex: Volkswagen"/></div>
          <div><label>Modelo *</label><input data-campo="modelo" data-idx="${idx}" value="${escapeHtml(v.modelo)}" placeholder="Ex: T-Cross"/></div>
          <div><label>Versão modelo</label><input data-campo="versao_modelo" data-idx="${idx}" value="${escapeHtml(v.versao_modelo)}" placeholder="Ex: Comfortline 200 TSI"/></div>
          <div><label>Ano</label><input data-campo="ano" data-idx="${idx}" type="number" min="1900" max="2027" step="1" inputmode="numeric" value="${escapeHtml(v.ano)}" placeholder="Ex: 2024"/></div>
          <div style="grid-column:1/-1;"><label>Placa (formato AAA-0000 ou AAA0A00)</label><input data-campo="placa" data-idx="${idx}" value="${escapeHtml(v.placa)}" placeholder="Ex: ABC-1D23" class="placa-input"/></div>
        </div>
        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="font-size:0.9rem;">Atividades de prioridade</strong>
            <button type="button" class="btn btn-secondary btn-sm btn-add-ativ" data-idx="${idx}">+ Atividade</button>
          </div>
          <div class="demanda-ativ-list" data-idx="${idx}">
            ${v.atividades.map((a, aidx) => renderAtivRow(a, idx, aidx)).join('') || '<div class="text-muted" style="font-size:0.85rem;padding:8px 4px;">Nenhuma atividade. Clique em "+ Atividade" para adicionar.</div>'}
          </div>
        </div>
      </div>`;
  }

  function renderAtivRow(a, idx, aidx) {
    if (a.existente) {
      const pc = prioridadeCor(a.prioridade);
      const status = a.status === 'concluida' ? 'Concluída' : a.status === 'em_andamento' ? 'Em andamento' : 'Pendente';
      return `
        <div class="demanda-ativ-row" style="display:grid;grid-template-columns:1fr 90px 110px;gap:8px;margin-bottom:6px;align-items:center;">
          <div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);">${escapeHtml(a.atividade_descricao || 'Atividade existente')}</div>
          <span style="display:inline-flex;justify-content:center;padding:4px 8px;border-radius:999px;background:${pc.bg};color:${pc.text};border:1px solid ${pc.border};font-size:0.72rem;font-weight:700;">P${a.prioridade}</span>
          <span class="text-muted" style="font-size:0.75rem;">${status}</span>
        </div>`;
    }
    const opcoes = atividadesModeloCache.map(am =>
      `<option value="${am.id}" ${Number(a.atividade_modelo_id) === Number(am.id) ? 'selected' : ''}>${escapeHtml(am.tipo_projeto ? `[${am.tipo_projeto}] ` : '')}${escapeHtml(am.descricao)}</option>`
    ).join('');
    return `
      <div class="demanda-ativ-row" style="display:grid;grid-template-columns:1fr 90px 40px;gap:8px;margin-bottom:6px;align-items:center;">
        <select data-idx="${idx}" data-aidx="${aidx}" data-campo="atividade_modelo_id" class="ativ-select">
          <option value="">Selecione a atividade…</option>
          ${opcoes}
        </select>
        <input type="number" min="1" data-idx="${idx}" data-aidx="${aidx}" data-campo="prioridade" value="${a.prioridade || 1}" placeholder="P" title="Prioridade (1 maior, 2 média, 3+ menor)"/>
        <button type="button" class="btn btn-danger btn-sm btn-del-ativ" data-idx="${idx}" data-aidx="${aidx}" title="Remover atividade">✕</button>
      </div>`;
  }

  function bindVeiculoInputs() {
    modal.querySelectorAll('input[data-campo]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.idx);
        const campo = e.target.dataset.campo;
        if (veiculos[idx]) veiculos[idx][campo] = e.target.value;
        if (campo === 'placa') {
          const val = e.target.value.trim();
          if (val && !validarPlaca(val)) e.target.style.borderColor = '#dc2626';
          else e.target.style.borderColor = '';
        }
      });
    });
    modal.querySelectorAll('.btn-remover-veiculo').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (veiculos.length > 1) { veiculos.splice(idx, 1); render(); }
      });
    });
    modal.querySelectorAll('.btn-add-ativ').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        veiculos[idx].atividades.push({ atividade_modelo_id: '', prioridade: 1 });
        render();
      });
    });
    modal.querySelectorAll('select[data-campo="atividade_modelo_id"]').forEach(sel => {
      sel.addEventListener('change', () => {
        const idx = Number(sel.dataset.idx);
        const aidx = Number(sel.dataset.aidx);
        veiculos[idx].atividades[aidx].atividade_modelo_id = sel.value ? Number(sel.value) : '';
      });
    });
    modal.querySelectorAll('input[data-campo="prioridade"]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.idx);
        const aidx = Number(inp.dataset.aidx);
        const val = Number(inp.value) || 0;
        veiculos[idx].atividades[aidx].prioridade = val > 0 ? val : 1;
      });
    });
    modal.querySelectorAll('.btn-del-ativ').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const aidx = Number(btn.dataset.aidx);
        veiculos[idx].atividades.splice(aidx, 1);
        render();
      });
    });
  }

  async function salvar() {
    const tipo_projeto = (modal.querySelector('#demanda-tipo-projeto').value || '').trim();
    const tipo_trabalho = (modal.querySelector('#demanda-tipo-trabalho')?.value || tipoTrabalhoSelecionado || '').trim();
    if (!tipo_projeto) {
      const message = projetosCache.length
        ? 'Selecione o tipo de projeto.'
        : 'Cadastre pelo menos um projeto nas configurações do setor antes de fornecer demandas.';
      if (alertEl) showAlert(alertEl, message);
      else alert(message);
      return;
    }
    const payload = {
      tipo_projeto,
      tipo_trabalho,
      veiculos: veiculos.map(v => ({
        montadora: v.montadora.trim(),
        modelo: v.modelo.trim(),
        versao_modelo: v.versao_modelo.trim(),
        ano: v.ano.trim(),
        placa: v.placa.trim(),
        atividades: v.atividades.filter(a => !a.existente).map(a => ({
          atividade_modelo_id: Number(a.atividade_modelo_id) || 0,
          prioridade: Number(a.prioridade) || 1
        }))
      }))
    };
    try {
      let res;
      if (veiculoEdicaoId) {
        res = await api.demandas.editarVeiculo(veiculoEdicaoId, payload);
        if (alertEl) showAlert(alertEl, 'Mais demandas adicionadas ao veículo com sucesso.', 'success');
      } else {
        res = await api.demandas.criarViagem(viagemId, payload);
        if (alertEl) showAlert(alertEl, 'Demandas salvas com sucesso! Os integrantes foram notificados.', 'success');
      }
      veiculoEdicaoId = null;
      closeForm();
      if (typeof onCriada === 'function') onCriada(res.demandas || []);
    } catch (err) {
      if (alertEl) showAlert(alertEl, err.message || 'Erro ao salvar demandas.');
      else alert(err.message || 'Erro ao salvar demandas.');
    }
  }

  if (!fullPage) document.body.appendChild(modal);

  const [atividadesResult, projetosResult] = await Promise.allSettled([
    api.demandas.atividadesModelo(),
    api.leaderProjects.list()
  ]);
  atividadesModeloCache = atividadesResult.status === 'fulfilled'
    ? atividadesResult.value.atividades || []
    : [];
  projetosCache = projetosResult.status === 'fulfilled'
    ? projetosResult.value.projects || []
    : [];

  render();
}

export function renderQuadroDemandasIntegrante(container, demandas, tripId, { user, onStatusChange } = {}) {
  if (!container) return;
  container.id = 'demandas';
  container.innerHTML = '';

  const todas = (Array.isArray(demandas) ? demandas : [])
    .filter((demanda) => Array.isArray(demanda.veiculos) && demanda.veiculos.length > 0);
  if (!todas.length) {
    container.innerHTML = `
      <div class="panel" style="margin-top:0;">
        <div class="panel-header">
          <h2>Demandas fornecidas pelo líder</h2>
          <button type="button" class="panel-toggle" data-toggle="demandas-panel" aria-expanded="true" aria-label="Minimizar quadro de demandas" title="Minimizar quadro de demandas">▼</button>
        </div>
        <div class="panel-body panel-content demandas-panel-content">
          <div class="empty-state">Nenhuma demanda fornecida para esta viagem ainda.</div>
        </div>
      </div>`;
    wireDemandasPanelToggle(container);
    return;
  }

  const cards = todas.map((demanda) => renderDemandaGroupCardHtml(demanda, { showEditarVeiculo: false })).join('');

  container.innerHTML = `
    <div class="panel" style="margin-top:0;">
      <div class="panel-header">
        <h2>Demandas fornecidas pelo líder</h2>
        <button type="button" class="panel-toggle" data-toggle="demandas-panel" aria-expanded="true" aria-label="Minimizar quadro de demandas" title="Minimizar quadro de demandas">▼</button>
      </div>
      <div class="panel-body panel-content demandas-panel-content">
        ${renderResumoDemandasHtml(todas)}
        ${cards}
      </div>
    </div>`;

  wireDemandasPanelToggle(container);
}

function wireDemandasPanelToggle(container) {
  if (!container) return;
  const btn = container.querySelector('.panel-toggle[data-toggle="demandas-panel"]');
  const body = container.querySelector('.panel-content');
  if (!btn || !body) return;
  btn.addEventListener('click', () => {
    const isCollapsed = btn.classList.toggle('collapsed');
    body.classList.toggle('collapsed', isCollapsed);
    btn.setAttribute('aria-expanded', String(!isCollapsed));
    btn.setAttribute('aria-label', isCollapsed ? 'Expandir quadro de demandas' : 'Minimizar quadro de demandas');
    btn.setAttribute('title', isCollapsed ? 'Expandir quadro de demandas' : 'Minimizar quadro de demandas');
    try {
      const key = `trip_demandas_panel_collapsed_v2`;
      localStorage.setItem(key, isCollapsed ? '1' : '0');
    } catch (e) {}
  });
  try {
    const key = `trip_demandas_panel_collapsed_v2`;
    if (localStorage.getItem(key) === '1') {
      btn.classList.add('collapsed');
      body.classList.add('collapsed');
    }
  } catch (e) {}
}

function flattenAtividadesPendentes(demandas) {
  const rows = [];
  const all = Array.isArray(demandas) ? demandas : [];
  for (const d of all) {
    for (const dv of d.veiculos || []) {
      for (const a of dv.atividades || []) {
        if (a.status && a.status !== 'concluida') {
          rows.push({
            atividadeId: a.id,
            demandaId: d.id,
            veiculoId: dv.id,
            tipoProjeto: d.tipo_projeto || d.tipoProjeto || '',
            tipoTrabalho: String(d.tipo_trabalho || '').trim(),
            atividadeDescricao: a.atividade_descricao || '',
            montadora: dv.montadora || '',
            modelo: dv.modelo || '',
            versaoModelo: dv.versao_modelo || '',
            ano: dv.ano || '',
            placa: dv.placa || '',
            prioridade: Number(a.prioridade || 1),
            atividadeDescricao: a.atividade_descricao || '',
            status: a.status || 'pendente',
          });
        }
      }
    }
  }
  return rows.sort((a, b) => a.prioridade - b.prioridade);
}

export function inserirCampoAtividadePrioridadeNoForm(formEl, trip, { onChange } = {}) {
  if (!formEl || !trip) return;
  const antigo = formEl.querySelector('#demanda-prioridade-wrap');
  if (antigo) antigo.remove();

  const demandas = trip.demandas || [];
  const rows = flattenAtividadesPendentes(demandas);
  const temDemandas = rows.length > 0;

  const projetosUnicos = Array.from(new Set(rows.map(r => r.tipoProjeto).filter(Boolean))).sort();
  const modelosUnicos = Array.from(new Set(rows.map(r => r.modelo).filter(Boolean))).sort();
  const tiposTrabalhoUnicos = Array.from(new Set(rows.map(r => r.tipoTrabalho).filter(Boolean))).sort();

  let filtrosAtuais = { filtroPri: 'todas', filtroModelo: '', filtroProjeto: '', filtroTipoTrabalho: '' };

  const wrap = document.createElement('div');
  wrap.id = 'demanda-prioridade-wrap';

  const prioridadeOpts = `
    <option value="todas">Todas as prioridades</option>
    <option value="1">P1 — Crítica</option>
    <option value="2">P2 — Média</option>
    <option value="3plus">P3+ — Normal</option>`;
  const projetoOpts = [`<option value="">Todos os projetos</option>`, ...projetosUnicos.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)].join('');
  const modeloOpts = [`<option value="">Todos os modelos</option>`, ...modelosUnicos.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)].join('');
  const tipoTrabalhoOpts = [`<option value="">Todos os tipos de trabalho</option>`, ...tiposTrabalhoUnicos.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)].join('');

  wrap.innerHTML = `
    <div style="border:1px dashed var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04));">
      <label style="font-weight:600;display:block;margin-bottom:8px;">Tipo de atividade que está registrando</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        <label style="display:inline-flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:var(--panel-bg);">
          <input type="radio" name="demanda_tipo_ativ" value="normal" ${temDemandas ? '' : 'checked'} /> Atividade normal realizada
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:var(--panel-bg);" ${!temDemandas ? 'opacity:0.5;pointer-events:none;' : ''}>
          <input type="radio" name="demanda_tipo_ativ" value="prioridade" ${temDemandas ? 'checked' : 'disabled'} /> Atividade de prioridade (demanda do líder)
        </label>
      </div>
      ${!temDemandas ? '<div class="text-muted" style="font-size:0.8rem;margin-top:6px;">Não há demandas pendentes para esta viagem.</div>' : ''}
      <div id="demanda-campos-veiculo-ativ" ${temDemandas ? '' : 'class="hidden-fields"'} style="margin-top:12px;">
        <div class="text-muted" style="font-size:0.85rem;margin-bottom:6px;">Selecione abaixo as atividades de prioridade realizadas. Você pode marcar mais de uma, se necessário.</div>
        ${temDemandas ? `
        <div class="demanda-grid-container" style="margin-top:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--panel-bg);">
          <div style="padding:12px;border-bottom:1px solid var(--border);background:linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04));">
            <div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:end;">
              <div>
                <label for="demanda_filtro_pri" style="display:block;margin-bottom:4px;font-size:0.8rem;">Filtro por prioridade</label>
                <select id="demanda_filtro_pri" style="width:100%;min-height:32px;">${prioridadeOpts}</select>
              </div>
              <div>
                <label for="demanda_filtro_tipo" style="display:block;margin-bottom:4px;font-size:0.8rem;">Filtro por tipo de trabalho</label>
                <select id="demanda_filtro_tipo" style="width:100%;min-height:32px;">${tipoTrabalhoOpts}</select>
              </div>
              <div>
                <label for="demanda_filtro_mod" style="display:block;margin-bottom:4px;font-size:0.8rem;">Filtro por modelo</label>
                <select id="demanda_filtro_mod" style="width:100%;min-height:32px;">${modeloOpts}</select>
              </div>
              <div>
                <label for="demanda_filtro_proj" style="display:block;margin-bottom:4px;font-size:0.8rem;">Filtro por projeto</label>
                <select id="demanda_filtro_proj" style="width:100%;min-height:32px;">${projetoOpts}</select>
              </div>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data" style="width:100%;margin:0;">
              <thead>
                <tr>
                  <th style="width:40px;"></th>
                  <th>Montadora</th>
                  <th>Modelo</th>
                  <th>Versão modelo</th>
                  <th>Ano</th>
                  <th>Projeto</th>
                  <th>Atividade</th>
                  <th style="width:70px;">Prioridade</th>
                  <th>Tipo de trabalho</th>
                </tr>
              </thead>
              <tbody id="demanda-grid-body"></tbody>
            </table>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  wrap.dataset.ultimaAtivId = '';
  wrap.dataset.ultimoVeicId = '';

  function renderGridApenasTabela() {
    const { filtroPri, filtroModelo, filtroProjeto, filtroTipoTrabalho } = filtrosAtuais;
    const filtradas = rows.filter(r => {
      const okPri =
        filtroPri === 'todas' ||
        String(r.prioridade) === String(filtroPri) ||
        (filtroPri === '3plus' && r.prioridade >= 3);
      const okTipoTrabalho = !filtroTipoTrabalho || String(r.tipoTrabalho || '') === String(filtroTipoTrabalho);
      const okMod = !filtroModelo ||
        (r.modelo || '').toLowerCase() === String(filtroModelo).toLowerCase() ||
        (r.modelo || '').toLowerCase().includes(String(filtroModelo).toLowerCase());
      const okProj = !filtroProjeto || String(r.tipoProjeto || '') === String(filtroProjeto);
      return okPri && okTipoTrabalho && okMod && okProj;
    });

    const tbody = wrap.querySelector('#demanda-grid-body');
    if (!tbody) return;

    if (!filtradas.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Nenhuma atividade pendente encontrada com esses filtros.</td></tr>`;
      return;
    }

    const ultAtv = String(wrap.dataset.ultimaAtivId || '');
    tbody.innerHTML = filtradas.map(r => {
      const pc = prioridadeCor(r.prioridade);
      const isSel = String(r.atividadeId) === ultAtv;
      return `
        <tr data-ativ="${r.atividadeId}" data-veiculo="${r.veiculoId}">
          <td class="text-center" style="width:40px;">
            <input type="checkbox" name="demanda_ativ_cb" value="${r.atividadeId}" data-veiculo="${r.veiculoId}" ${isSel ? 'checked' : ''} />
          </td>
          <td>${escapeHtml(r.montadora) || '—'}</td>
          <td>${escapeHtml(r.modelo) || '—'}</td>
          <td>${escapeHtml(r.versaoModelo) || '—'}</td>
          <td>${escapeHtml(r.ano) || '—'}</td>
          <td>${escapeHtml(r.tipoProjeto) || '—'}</td>
          <td>${escapeHtml(r.atividadeDescricao) || '—'}</td>
          <td>
            <span style="display:inline-flex;padding:2px 10px;border-radius:999px;background:${pc.bg};color:${pc.text};border:1px solid ${pc.border};font-size:0.78rem;font-weight:700;">${pc.label}</span>
          </td>
          <td>${escapeHtml(r.tipoTrabalho) || '—'}</td>
        </tr>`;
    }).join('');

    bindGridCheckboxes();
  }

  function bindFiltrosUmaVez() {
    const priEl = wrap.querySelector('#demanda_filtro_pri');
    const tipoEl = wrap.querySelector('#demanda_filtro_tipo');
    const modEl = wrap.querySelector('#demanda_filtro_mod');
    const projEl = wrap.querySelector('#demanda_filtro_proj');
    const handler = () => {
      filtrosAtuais = {
        filtroPri: priEl?.value || 'todas',
        filtroTipoTrabalho: tipoEl?.value || '',
        filtroModelo: modEl?.value || '',
        filtroProjeto: projEl?.value || '',
      };
      renderGridApenasTabela();
    };
    priEl?.addEventListener('change', handler);
    tipoEl?.addEventListener('change', handler);
    modEl?.addEventListener('change', handler);
    projEl?.addEventListener('change', handler);
  }

  function bindGridCheckboxes() {
    wrap.querySelectorAll('input[name="demanda_ativ_cb"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const selecionados = [...wrap.querySelectorAll('input[name="demanda_ativ_cb"]:checked')];
        const atividadeIds = selecionados.map(item => String(item.value || '')).filter(Boolean);
        const veiculoIds = selecionados.map(item => String(item.dataset?.veiculo || '')).filter(Boolean);
        const atividadesSelecionadas = atividadeIds
          .map(id => rows.find(row => String(row.atividadeId) === id))
          .filter(Boolean);

        if (atividadeIds.length) {
          wrap.dataset.ultimaAtivId = atividadeIds.join(',');
          wrap.dataset.ultimoVeicId = veiculoIds.join(',');
        } else {
          wrap.dataset.ultimaAtivId = '';
          wrap.dataset.ultimoVeicId = '';
        }

        if (typeof onChange === 'function') onChange(atividadesSelecionadas);
      });
    });
  }

  const summaryField = formEl.querySelector('#summary-field');
  if (summaryField) summaryField.parentNode.insertBefore(wrap, summaryField);
  else formEl.appendChild(wrap);

  if (temDemandas) {
    bindFiltrosUmaVez();
    renderGridApenasTabela();
  }

  wrap.querySelectorAll('input[name="demanda_tipo_ativ"]').forEach(r => {
    r.addEventListener('change', () => {
      const tipo = wrap.querySelector('input[name="demanda_tipo_ativ"]:checked')?.value;
      const campos = document.getElementById('demanda-campos-veiculo-ativ');
      if (tipo === 'prioridade') campos?.classList.remove('hidden-fields');
      else {
        campos?.classList.add('hidden-fields');
        wrap.dataset.ultimaAtivId = '';
        wrap.dataset.ultimoVeicId = '';
        wrap.querySelectorAll('input[name="demanda_ativ_cb"]').forEach(cb => (cb.checked = false));
      }
      if (typeof onChange === 'function') onChange();
    });
  });
}

export function extrairPayloadDemandaDoForm() {
  const wrap = document.getElementById('demanda-prioridade-wrap');
  const tipo = document.querySelector('input[name="demanda_tipo_ativ"]:checked')?.value;
  const ehPrioridade = tipo === 'prioridade';
  let atividadeId = 0;
  let veiculoId = 0;
  const cbSel = document.querySelectorAll('input[name="demanda_ativ_cb"]:checked');
  const firstSelected = cbSel && cbSel.length ? cbSel[0] : null;
  if (firstSelected) {
    atividadeId = Number(firstSelected.value || 0);
    veiculoId = Number(firstSelected.dataset?.veiculo || 0);
  } else if (wrap) {
    const ids = String(wrap.dataset?.ultimaAtivId || '').split(',').filter(Boolean);
    const veicIds = String(wrap.dataset?.ultimoVeicId || '').split(',').filter(Boolean);
    atividadeId = Number(ids[0] || 0);
    veiculoId = Number(veicIds[0] || 0);
  }
  return {
    eh_atividade_prioridade: ehPrioridade,
    demanda_atividade_id: ehPrioridade && atividadeId > 0 ? atividadeId : null,
    demanda_veiculo_id: ehPrioridade && veiculoId > 0 ? veiculoId : null,
  };
}

export function demandasEstaoPendentes(trip) {
  const ds = trip?.demandas || [];
  for (const d of ds) {
    for (const v of d.veiculos || []) {
      for (const a of v.atividades || []) {
        if (a.status !== 'concluida') return true;
      }
    }
  }
  return false;
}