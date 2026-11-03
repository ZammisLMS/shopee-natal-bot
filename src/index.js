import 'dotenv/config';
import { loadConfig } from './config.js';
import { searchProducts } from './shopee.js';
import { chooseOffer, canPost, formatMessage } from './offers.js';
import { loadState, saveState, cleanState, recordEvent } from './state.js';
import { loadGroups } from './groups.js';
import { createPanel } from './panel.js';
import { connectWhatsApp, listGroups, publishOffer } from './whatsapp.js';

const config = loadConfig();
const mode = process.argv[2] || '--run';
if (!['--run', '--scan-once', '--list-groups'].includes(mode)) {
  throw new Error('Use npm start, npm run scan ou npm run list-groups.');
}
if (mode === '--scan-once' && (!config.shopeeAppId || !config.shopeeAppSecret)) {
  throw new Error('Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET para testar buscas.');
}
let activeSocket = null;
let scanning = false;
let timer = null;

function groupLimits(group) {
  return {
    ...group, ...group.filters,
    maxDailySends: group.schedule.maxDailySends,
    minPostGapMinutes: group.schedule.minPostGapMinutes,
    repostCooldownDays: group.schedule.repostCooldownDays,
    sendStartHour: group.schedule.startHour,
    sendEndHour: group.schedule.endHour,
    timeZone: config.timeZone
  };
}
async function runGroup(group, { preview = false, socket = null } = {}) {
  const state = await loadState(config.stateFile);
  const limits = groupLimits(group);
  if (!preview && config.sendEnabled && !canPost(state, limits, Date.now(), group.id)) {
    return { outcome: 'limit', reason: 'Fora do horário ou cota diária' };
  }
  if (!preview && config.sendEnabled && state.sent.concat(state.pending).some(entry =>
    Date.now() - Date.parse(entry.at) < 3 * 60 * 1000)) {
    return { outcome: 'limit', reason: 'Intervalo mínimo global de 3 minutos' };
  }
  const results = [];
  const offset = Number(state.cursors[group.id] || 0);
  const count = Math.min(config.keywordsPerScan, group.keywords.length);
  let success = 0;
  for (let i = 0; i < count; i++) {
    const keyword = group.keywords[(offset + i) % group.keywords.length];
    try {
      const offers = await searchProducts(config, keyword);
      results.push(...offers);
      success++;
      console.log('[' + group.name + '] "' + keyword + '": ' + offers.length + ' resultados');
    } catch (error) {
      console.error('[' + group.name + '] Busca falhou: ' + error.message);
    }
  }
  if (!preview) state.lastScans[group.id] = new Date().toISOString();
  if (success) state.cursors[group.id] = (offset + count) % group.keywords.length;
  if (!success) {
    recordEvent(state, { groupId: group.id, outcome: 'error', detail: 'Nenhuma consulta à Shopee concluiu' });
    await saveState(config.stateFile, cleanState(state));
    throw new Error('Não foi possível consultar a Shopee; nenhum envio realizado.');
  }
  const offer = chooseOffer(results, state, limits, Date.now(), group.id);
  if (!offer) {
    recordEvent(state, { groupId: group.id, outcome: 'empty', detail: 'Nenhum produto passou pelos filtros' });
    await saveState(config.stateFile, cleanState(state));
    return { outcome: 'empty', totalResults: results.length };
  }
  const summary = {
    title: offer.title, price: offer.price, discount: offer.discount,
    commission: offer.commission, link: offer.link, totalResults: results.length
  };
  if (preview || !config.sendEnabled || !group.enabled || !socket) {
    recordEvent(state, { groupId: group.id, outcome: 'preview', ...summary });
    await saveState(config.stateFile, cleanState(state));
    console.log('[' + group.name + '] SIMULAÇÃO:', offer.title);
    return { outcome: 'preview', offer: summary };
  }
  const pending = { key: offer.key, groupId: group.id, at: new Date().toISOString() };
  state.pending.push(pending);
  await saveState(config.stateFile, cleanState(state));
  try {
    await publishOffer(socket, {
      ...config, groupJid: group.jid, expectedGroupName: group.name
    }, offer, formatMessage(offer, group.name));
    state.pending = state.pending.filter(entry => entry !== pending);
    state.sent.push({ key: offer.key, groupId: group.id, at: new Date().toISOString(), price: offer.price });
    recordEvent(state, { groupId: group.id, outcome: 'sent', ...summary });
    await saveState(config.stateFile, cleanState(state));
    console.log('[' + group.name + '] Oferta enviada:', offer.title);
    return { outcome: 'sent', offer: summary };
  } catch (error) {
    recordEvent(state, { groupId: group.id, outcome: 'uncertain', detail: error.message });
    await saveState(config.stateFile, cleanState(state));
    throw new Error('Envio incerto; pendência conservada por 24h: ' + error.message);
  }
}

async function singleFlight(fn) {
  if (scanning) throw new Error('Já existe uma busca em andamento. Tente novamente em instantes.');
  scanning = true;
  try { return await fn(); }
  finally { scanning = false; }
}
async function tick() {
  if (scanning || !config.shopeeAppId || !config.shopeeAppSecret) return;
  if (config.sendEnabled && !activeSocket) return;
  await singleFlight(async () => {
    const groups = await loadGroups(config.groupsFile);
    for (const group of groups.filter(g => g.enabled)) {
      const state = await loadState(config.stateFile);
      const last = Date.parse(state.lastScans[group.id] || '') || 0;
      if (Date.now() - last < group.schedule.intervalMinutes * 60000) continue;
      try {
        await runGroup(group, { socket: activeSocket });
      } catch (error) {
        console.error('[' + group.name + '] Ciclo sem envio:', error.message);
      }
    }
  });
}

if (mode === '--scan-once') {
  await singleFlight(async () => {
    for (const group of await loadGroups(config.groupsFile)) {
      try { console.log(group.name, await runGroup(group, { preview: true })); }
      catch (error) { console.error('[' + group.name + '] ' + error.message); }
    }
  });
} else {
  if (mode === '--run') {
    createPanel(config, {
      connected: () => Boolean(activeSocket),
      preview: group => singleFlight(() => runGroup(group, { preview: true }))
    });
    // Consulta a cada minuto; os intervalos, filtros e cotas são individuais.
    timer = setInterval(() => tick().catch(error => console.error('Agendamento:', error.message)), 60000);
    await tick();
    console.log(config.sendEnabled ? 'Envios automáticos autorizados pelo .env.' :
      'Modo seguro: SEND_ENABLED=false, somente simulações.');
  }
  await connectWhatsApp(config, {
    onDisconnect() { activeSocket = null; },
    async onReady(socket) {
      activeSocket = socket;
      if (mode === '--list-groups') {
        await listGroups(socket);
        console.log('Use os JIDs no painel, com o nome exato de cada grupo.');
      } else {
        await tick();
      }
    }
  });
}
