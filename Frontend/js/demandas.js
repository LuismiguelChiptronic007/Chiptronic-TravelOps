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
    pendente: { cls: 'badge planned', label: 'Pendente' },
    em_andamento: { cls: 'badge in_progress', label: 'Em andamento' },
    concluida: { cls: 'badge completed', label: 'Concluída' },
  };
  const cfg = map[status] || { cls: 'badge planned', label: status || '—' };
  return `<span class="${cfg.cls}">${cfg.label}</span>`;
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

  const modal = fullPage
    ? document.getElementById('demandas-page-form')
    : document.createElement('div');
  if (!modal) return;
  if (!fullPage) {
    modal.className = 'modal-overlay';
    modal.id = 'demanda-modal';
  }
  const closeForm = () => fullPage ? window.history.back() : modal.remove();

  function render() {
    const veiculosHtml = veiculos.map((v, idx) => renderVeiculoCard(v, idx)).join('');
    const tipoProjetoGlobal = veiculos[0]?.tipo_projeto || '';
    const projetosHtml = projetosCache.length
      ? projetosCache.map(p => `<option value="${escapeHtml(p.name)}" ${p.name === tipoProjetoGlobal ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')
      : '<option value="">Nenhum projeto cadastrado para o setor</option>';

    modal.innerHTML = `
      <div class="${fullPage ? 'demandas-page-content' : 'modal-content'}">
        <div class="modal-header">
          <h2>Fornecer demandas — Veículos e atividades</h2>
          <button type="button" class="${fullPage ? 'demandas-page-back' : 'modal-close'}" aria-label="Fechar">${fullPage ? 'Voltar' : '&times;'}</button>
        </div>
        <div class="modal-body">
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
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancelar-demanda">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-salvar-demanda">Salvar demandas</button>
        </div>
      </div>`;

    modal.querySelector(fullPage ? '.demandas-page-back' : '.modal-close').addEventListener('click', closeForm);
    if (!fullPage) modal.addEventListener('click', (e) => { if (e.target === modal) closeForm(); });

    modal.querySelector('#demanda-tipo-projeto').addEventListener('change', (e) => {
      const val = e.target.value;
      veiculos.forEach(v => v.tipo_projeto = val);
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

    modal.querySelector('#btn-cancelar-demanda').addEventListener('click', () => modal.remove());
    modal.querySelector('#btn-salvar-demanda').addEventListener('click', salvar);

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
          <div><label>Ano</label><input data-campo="ano" data-idx="${idx}" value="${escapeHtml(v.ano)}" placeholder="Ex: 2024"/></div>
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
      veiculos: veiculos.map(v => ({
        montadora: v.montadora.trim(),
        modelo: v.modelo.trim(),
        versao_modelo: v.versao_modelo.trim(),
        ano: v.ano.trim(),
        placa: v.placa.trim(),
        atividades: v.atividades.map(a => ({
          atividade_modelo_id: Number(a.atividade_modelo_id) || 0,
          prioridade: Number(a.prioridade) || 1
        }))
      }))
    };
    try {
      const res = await api.demandas.criarViagem(viagemId, payload);
      if (alertEl) showAlert(alertEl, 'Demandas salvas com sucesso! Os integrantes foram notificados.', 'success');
      closeForm();
      if (typeof onCriada === 'function') onCriada(res.demandas || []);
    } catch (err) {
      if (alertEl) showAlert(alertEl, err.message || 'Erro ao salvar demandas.');
      else alert(err.message || 'Erro ao salvar demandas.');
    }
  }

  document.body.appendChild(modal);

  const [atividadesResult, projetosResult] = await Promise.allSettled([
    api.demandas.atividadesModelo(),
    api.projects({ trip_id: viagemId })
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

  const todas = Array.isArray(demandas) ? demandas : [];
  if (!todas.length) {
    container.innerHTML = `
      <div class="panel" style="margin-top:0;">
        <div class="panel-header">
          <h2>Demandas fornecidas pelo líder</h2>
        </div>
        <div class="panel-body">
          <div class="empty-state">Nenhuma demanda fornecida para esta viagem ainda.</div>
        </div>
      </div>`;
    return;
  }

  let totalPendentes = 0;
  let totalAndamento = 0;
  let totalConcluidas = 0;

  const cards = todas.map(demanda => {
    const vCards = (demanda.veiculos || []).map(dv => {
      const atividadesSorted = [...(dv.atividades || [])].sort((a, b) => Number(a.prioridade) - Number(b.prioridade));
      const rows = atividadesSorted.map(a => {
        if (a.status === 'pendente') totalPendentes++;
        else if (a.status === 'em_andamento') totalAndamento++;
        else if (a.status === 'concluida') totalConcluidas++;

        const pc = prioridadeCor(a.prioridade);
        return `
          <tr>
            <td><span style="display:inline-flex;padding:2px 8px;border-radius:999px;background:${pc.bg};color:${pc.text};border:1px solid ${pc.border};font-size:0.75rem;font-weight:700;">${pc.label}</span></td>
            <td>${escapeHtml(a.atividade_descricao || '—')}</td>
            <td>${statusDemandaBadge(a.status)}
                ${a.status === 'concluida' && a.concluida_nome ? `<div class="text-muted" style="font-size:0.75rem;margin-top:2px;">${escapeHtml(a.concluida_nome)} · ${formatDateBR(String(a.concluida_em || '').slice(0,10))}</div>` : ''}
            </td>
          </tr>`;
      }).join('');

      const cabVeic = [dv.montadora, dv.modelo, dv.versao_modelo].filter(Boolean).join(' · ') || '—';

      return `
        <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--panel-bg);">
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:start;justify-content:space-between;margin-bottom:10px;">
            <div>
              <strong>${escapeHtml(cabVeic)}</strong>
              <div class="text-muted" style="font-size:0.85rem;">
                ${dv.placa ? `Placa: <strong>${escapeHtml(dv.placa.toUpperCase())}</strong>` : ''}
                ${dv.ano ? ` · Ano: <strong>${escapeHtml(dv.ano)}</strong>` : ''}
              </div>
            </div>
          </div>
          ${(dv.atividades || []).length ? `
          <table class="data" style="width:100%;margin:0;">
            <thead><tr><th style="width:60px;">Pri</th><th>Atividade</th><th style="width:170px;">Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : '<div class="text-muted" style="padding:8px 4px;">Sem atividades cadastradas.</div>'}
        </div>`;
    }).join('');

    return `
      <div class="demanda-group-card" style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="margin:0;font-size:1rem;">Demanda · ${escapeHtml(demanda.tipo_projeto)}</h3>
            <div class="text-muted" style="font-size:0.8rem;">Criado por ${escapeHtml(demanda.criado_nome || 'Líder')} em ${formatDateBR(String(demanda.criado_em || '').slice(0,10))}</div>
          </div>
          ${statusDemandaBadge(demanda.status)}
        </div>
        ${vCards || '<div class="empty-state" style="padding:12px;">Sem veículos nesta demanda.</div>'}
      </div>`;
  }).join('');

  const resumoHtml = `
    <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
      <span class="badge planned">Pendentes: ${totalPendentes}</span>
      <span class="badge in_progress">Em andamento: ${totalAndamento}</span>
      <span class="badge completed">Concluídas: ${totalConcluidas}</span>
    </div>`;

  container.innerHTML = `
    <div class="panel" style="margin-top:0;">
      <div class="panel-header">
        <h2>Demandas fornecidas pelo líder</h2>
      </div>
      <div class="panel-body">
        ${resumoHtml}
        ${cards}
      </div>
    </div>`;

}

export function inserirCampoAtividadePrioridadeNoForm(formEl, trip, { onChange } = {}) {
  if (!formEl || !trip) return;
  if (formEl.querySelector('#demanda-prioridade-wrap')) return;

  const demandas = trip.demandas || [];
  const demandasFlat = [];
  for (const d of demandas) {
    for (const dv of d.veiculos || []) {
      const chave = `${dv.id}`;
      if (!demandasFlat.some(x => x.veiculoId === dv.id)) {
        demandasFlat.push({
          veiculoId: dv.id,
          demandaId: d.id,
          tipoProjeto: d.tipo_projeto,
          montadora: dv.montadora,
          modelo: dv.modelo,
          versao: dv.versao_modelo,
          ano: dv.ano,
          placa: dv.placa,
          atividades: (dv.atividades || []).filter(a => a.status !== 'concluida')
        });
      }
    }
  }

  const temDemandas = demandasFlat.some(x => x.atividades.length > 0);

  const wrap = document.createElement('div');
  wrap.id = 'demanda-prioridade-wrap';
  wrap.innerHTML = `
    <div style="border:1px dashed var(--border);border-radius:12px;padding:14px;margin-bottom:14px;background:linear-gradient(135deg, rgba(139,92,246,0.06), rgba(59,130,246,0.04));">
      <label style="font-weight:600;display:block;margin-bottom:8px;">Tipo de atividade que está registrando</label>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        <label style="display:inline-flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:var(--panel-bg);">
          <input type="radio" name="demanda_tipo_ativ" value="normal" checked /> Atividade normal realizada
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:10px;cursor:pointer;background:var(--panel-bg);" ${!temDemandas ? 'opacity:0.5;pointer-events:none;' : ''}>
          <input type="radio" name="demanda_tipo_ativ" value="prioridade" ${!temDemandas ? 'disabled' : ''} /> Atividade de prioridade (demanda do líder)
        </label>
      </div>
      ${!temDemandas ? '<div class="text-muted" style="font-size:0.8rem;margin-top:6px;">Não há demandas pendentes para esta viagem.</div>' : ''}
      <div id="demanda-campos-veiculo-ativ" class="hidden-fields" style="margin-top:12px;">
        <div class="form-grid two">
          <div>
            <label for="demanda_veiculo_select">Selecione o veículo da demanda</label>
            <select id="demanda_veiculo_select">
              <option value="">Selecione…</option>
              ${demandasFlat.filter(v => v.atividades.length).map(v => {
                const label = [v.montadora, v.modelo, v.versao].filter(Boolean).join(' · ') + (v.placa ? ` — Placa: ${v.placa.toUpperCase()}` : '');
                return `<option value="${v.veiculoId}">[${escapeHtml(v.tipoProjeto)}] ${escapeHtml(label)}</option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <label for="demanda_atividade_select">Atividade pendente</label>
            <select id="demanda_atividade_select" disabled>
              <option value="">Primeiro escolha o veículo…</option>
            </select>
          </div>
        </div>
      </div>
    </div>`;

  const summaryField = formEl.querySelector('#summary-field');
  if (summaryField) summaryField.parentNode.insertBefore(wrap, summaryField);
  else formEl.appendChild(wrap);

  wrap.querySelectorAll('input[name="demanda_tipo_ativ"]').forEach(r => {
    r.addEventListener('change', () => {
      const tipo = wrap.querySelector('input[name="demanda_tipo_ativ"]:checked')?.value;
      const campos = document.getElementById('demanda-campos-veiculo-ativ');
      if (tipo === 'prioridade') campos.classList.remove('hidden-fields');
      else campos.classList.add('hidden-fields');
      if (typeof onChange === 'function') onChange();
    });
  });

  document.getElementById('demanda_veiculo_select')?.addEventListener('change', (e) => {
    const vid = Number(e.target.value || 0);
    const selAtiv = document.getElementById('demanda_atividade_select');
    if (!selAtiv) return;
    selAtiv.disabled = !vid;
    if (!vid) { selAtiv.innerHTML = '<option value="">Primeiro escolha o veículo…</option>'; return; }
    const veic = demandasFlat.find(v => v.veiculoId === vid);
    if (!veic) { selAtiv.innerHTML = '<option value="">Nenhuma atividade</option>'; return; }
    const opts = veic.atividades.map(a => {
      const pc = prioridadeCor(a.prioridade);
      return `<option value="${a.id}" data-veiculo="${veic.veiculoId}">[P${a.prioridade}] ${escapeHtml(a.atividade_descricao || '')}</option>`;
    }).join('');
    selAtiv.innerHTML = `<option value="">Selecione a atividade…</option>${opts}`;
  });
}

export function extrairPayloadDemandaDoForm() {
  const tipo = document.querySelector('input[name="demanda_tipo_ativ"]:checked')?.value;
  const ehPrioridade = tipo === 'prioridade';
  const atividadeId = Number(document.getElementById('demanda_atividade_select')?.value || 0);
  const veiculoId = Number(document.getElementById('demanda_veiculo_select')?.value || 0);
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
