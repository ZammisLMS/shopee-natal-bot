'use strict';
const $ = id => document.getElementById(id);
let authToken = sessionStorage.getItem('garimpo-token') || '';
let snapshot = null;
let toastTimeout;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = value => Number(value).toLocaleString('pt-BR');
const lines = value => String(value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const defaults = () => ({
  name: '', jid: '', enabled: false, provider: 'shopee',
  keywords: ['achadinho'], matchTerms: ['achadinho'], excludeTerms: [],
  filters: { maxPrice: 150, minDiscount: 25, minRating: 4.7, minSales: 50, minCommission: 4 },
  schedule: { intervalMinutes: 45, maxDailySends: 5, minPostGapMinutes: 120, repostCooldownDays: 7, startHour: 9, endHour: 21 }
});
async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + authToken, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Falha ao acessar o painel');
    error.status = response.status;
    throw error;
  }
  return data;
}
function toast(message, isError = false) {
  const elem = $('toast');
  elem.textContent = message;
  elem.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elem.classList.add('hidden'), 6500);
}
function loggedIn(value) {
  $('login').classList.toggle('hidden', value);
  $('app').classList.toggle('hidden', !value);
}
async function refresh() {
  const data = await api('/overview');
  snapshot = data;
  loggedIn(true);
  $('stat-groups').textContent = num(data.groups.length);
  $('stat-active').textContent = num(data.groups.filter(group => group.enabled).length);
  $('stat-sent').textContent = num(Object.values(data.counters).reduce((sum, item) => sum + item.sentToday, 0));
  $('stat-sources').innerHTML = num(data.providers.filter(p => p.status === 'active').length) +
    '<span class="stat-suffix">/' + num(data.providers.length) + '</span>';
  $('connection-dot').classList.toggle('online', data.connected);
  $('connection-label').textContent = (data.connected ? 'WhatsApp conectado' : 'WhatsApp desconectado') +
    (data.sendingEnabled ? ' · Envios liberados' : ' · Simulação');
  renderGroups(data);
  renderProviders(data.providers);
  renderEvents(data);
}
function renderGroups(data) {
  const root = $('groups-list');
  if (!data.groups.length) {
    root.innerHTML = '<div class="empty">Nenhum grupo cadastrado. Comece clicando em “Novo grupo”.</div>';
    return;
  }
  root.innerHTML = data.groups.map(group => {
    const c = data.counters[group.id] || {};
    const icon = group.id.includes('suplement') || group.name.toLowerCase().includes('fit') ? '◆' : '✦';
    const fitness = icon === '◆';
    const status = group.enabled ? 'ATIVO' : 'PAUSADO';
    const lastScan = c.lastScan ? new Date(c.lastScan).toLocaleString('pt-BR', { timeZone: data.timeZone }) : 'Nunca';
    return '<article class="group-card">' +
      '<div class="group-top"><div class="group-icon' + (fitness ? ' fitness' : '') + '">' + icon + '</div><span class="badge' + (group.enabled ? ' on' : '') + '">' + status + '</span></div>' +
      '<h3>' + esc(group.name) + '</h3>' +
      '<div class="group-meta">' + esc(group.jid || 'Sem WhatsApp vinculado') + '</div>' +
      '<div class="group-tags">' + group.keywords.slice(0, 3).map(key => '<span class="tag">' + esc(key) + '</span>').join('') +
      (group.keywords.length > 3 ? '<span class="tag">+' + (group.keywords.length - 3) + '</span>' : '') + '</div>' +
      '<div class="group-details"><div>Preço máximo<b>' + money(group.filters.maxPrice) + '</b></div><div>Desconto mín.<b>' + num(group.filters.minDiscount) + '%</b></div><div>Posts / dia<b>' + num(group.schedule.maxDailySends) + '</b></div></div>' +
      '<div class="group-meta" style="margin-top:14px">Enviados hoje: ' + num(c.sentToday || 0) +
      ' · Última busca: ' + esc(lastScan) + '</div>' +
      '<div class="group-actions"><button data-action="edit" data-id="' + esc(group.id) + '">⚙ &nbsp; Configurar</button>' +
      '<button class="preview" data-action="preview" data-id="' + esc(group.id) + '">⌕ &nbsp; Testar busca</button></div>' +
      '<div class="preview-result" id="preview-' + esc(group.id) + '"></div>' +
      '</article>';
  }).join('');
}
function renderProviders(providers) {
  const icons = { shopee: 'S', aliexpress: 'A', amazon: 'a', awin: '◈', mercadolivre: 'M', magalu: 'm', tiktok: '♪' };
  const labels = { active: 'INTEGRADA', planned: 'PLANEJADA', research: 'EM ESTUDO' };
  $('sources-list').innerHTML = providers.map(p =>
    '<div class="source"><div class="source-id"><div class="source-icon">' + esc(icons[p.id] || '◎') +
    '</div><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.capability) +
    '</p></div></div><span class="source-status ' + (p.status === 'active' ? 'active' : '') + '">' +
    esc(labels[p.status]) + '</span></div>'
  ).join('');
}
function renderEvents(data) {
  const names = Object.fromEntries(data.groups.map(g => [g.id, g.name]));
  const statuses = { sent: 'ENVIADO', preview: 'SIMULAÇÃO', empty: 'SEM OFERTA', error: 'ERRO', uncertain: 'VERIFICAR ENVIO' };
  $('events-list').innerHTML = data.events.length ? data.events.map(event =>
    '<div class="activity-row"><div><strong>' + esc(names[event.groupId] || event.groupId || 'Grupo removido') +
    '</strong><small>' + esc(event.title || event.detail || 'Busca concluída') +
    (event.price ? ' · ' + money(event.price) : '') +
    '</small></div><span class="event-status ' + esc(event.outcome) + '">' + esc(statuses[event.outcome] || event.outcome) +
    '</span><span>' + esc(new Date(event.at).toLocaleString('pt-BR', {
      dateStyle: 'short', timeStyle: 'short', timeZone: data.timeZone
    })) + '</span></div>'
  ).join('') : '<div class="empty">Sem atividade ainda. Teste uma busca dentro de um grupo.</div>';
}
function openDrawer(group = null) {
  const data = group || defaults();
  const form = $('group-form');
  $('group-id').value = group?.id || '';
  $('drawer-title').textContent = group ? 'Editar ' + group.name : 'Novo grupo';
  for (const name of ['name', 'jid', 'provider']) form.elements.namedItem(name).value = data[name];
  for (const name of ['keywords', 'matchTerms', 'excludeTerms']) form.elements.namedItem(name).value = data[name].join('\n');
  for (const [name, value] of Object.entries(data.filters)) form.elements.namedItem(name).value = value;
  for (const [name, value] of Object.entries(data.schedule)) form.elements.namedItem(name).value = value;
  form.elements.namedItem('enabled').checked = data.enabled;
  $('group-delete').classList.toggle('hidden', !group);
  $('form-error').textContent = '';
  $('drawer').classList.remove('hidden');
  $('drawer-overlay').classList.remove('hidden');
  form.elements.namedItem('name').focus();
}
function closeDrawer() {
  $('drawer').classList.add('hidden');
  $('drawer-overlay').classList.add('hidden');
}
function collectGroup() {
  const form = $('group-form');
  const v = name => form.elements.namedItem(name).value.trim();
  const n = name => Number(v(name));
  return {
    name: v('name'), jid: v('jid'), provider: v('provider'),
    enabled: form.elements.namedItem('enabled').checked,
    keywords: lines(v('keywords')), matchTerms: lines(v('matchTerms')), excludeTerms: lines(v('excludeTerms')),
    filters: { maxPrice: n('maxPrice'), minDiscount: n('minDiscount'), minRating: n('minRating'), minSales: n('minSales'), minCommission: n('minCommission') },
    schedule: { intervalMinutes: n('intervalMinutes'), maxDailySends: n('maxDailySends'),
      minPostGapMinutes: n('minPostGapMinutes'), repostCooldownDays: n('repostCooldownDays'),
      startHour: n('startHour'), endHour: n('endHour') }
  };
}
async function preview(id, button) {
  button.disabled = true;
  button.textContent = 'Pesquisando…';
  try {
    const result = await api('/groups/' + id + '/preview', { method: 'POST' });
    const element = $('preview-' + id);
    if (result.offer) {
      const o = result.offer;
      element.innerHTML = '<div class="test-found"><strong>✔ Oferta aprovada nos filtros</strong><p>' +
        esc(o.title) + ' · ' + money(o.price) + ' · ' + num(o.discount) +
        '% OFF</p><a href="' + esc(o.link) + '" target="_blank" rel="noopener noreferrer">Abrir oferta ↗</a></div>';
    } else {
      element.innerHTML = '<div class="test-found">Nenhuma oferta passou pelos filtros nesta busca.</div>';
    }
    toast('Busca concluída sem envio de mensagens.');
    await refresh();
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = '⌕   Testar busca'; }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const token = $('token').value.trim();
  if (!token) return;
  authToken = token;
  try {
    await refresh();
    sessionStorage.setItem('garimpo-token', token);
    $('token').value = '';
    $('login-error').textContent = '';
  } catch (error) {
    $('login-error').textContent = 'Acesso não autorizado ou servidor indisponível: ' + error.message;
    authToken = '';
    sessionStorage.removeItem('garimpo-token');
  }
});
$('logout').addEventListener('click', () => {
  authToken = ''; snapshot = null;
  sessionStorage.removeItem('garimpo-token');
  loggedIn(false);
});
$('refresh').addEventListener('click', () => refresh().catch(err => toast(err.message, true)));
$('new-group').addEventListener('click', () => openDrawer());
$('new-group-alt').addEventListener('click', () => openDrawer());
$('drawer-close').addEventListener('click', closeDrawer);
$('drawer-overlay').addEventListener('click', closeDrawer);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
$('groups-list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || !snapshot) return;
  const group = snapshot.groups.find(g => g.id === button.dataset.id);
  if (!group) return;
  if (button.dataset.action === 'edit') openDrawer(group);
  if (button.dataset.action === 'preview') await preview(group.id, button);
});
$('group-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('group-id').value;
  const button = $('save-group');
  button.disabled = true;
  try {
    await api(id ? '/groups/' + id : '/groups', { method: id ? 'PUT' : 'POST', body: JSON.stringify(collectGroup()) });
    closeDrawer(); await refresh(); toast('Grupo salvo com sucesso.');
  } catch (error) { $('form-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('group-delete').addEventListener('click', async () => {
  const id = $('group-id').value;
  const group = snapshot?.groups.find(g => g.id === id);
  if (!group || !confirm('Excluir "' + group.name + '"? O histórico de envios será mantido.')) return;
  try { await api('/groups/' + id, { method: 'DELETE' }); closeDrawer(); await refresh(); toast('Grupo removido.'); }
  catch (error) { $('form-error').textContent = error.message; }
});
if (authToken) refresh().catch(() => { authToken = ''; sessionStorage.removeItem('garimpo-token'); loggedIn(false); });
