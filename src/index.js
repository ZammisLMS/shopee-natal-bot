import 'dotenv/config';
import { loadConfig } from './config.js';
import { searchProducts } from './shopee.js';
import { chooseOffer, canPost, formatMessage } from './offers.js';
import { loadState, saveState, cleanState } from './state.js';
import { connectWhatsApp, listGroups, publishOffer, validateGroup } from './whatsapp.js';

const config = loadConfig();
const mode = process.argv[2] || '--run';
if (!['--run', '--scan-once', '--list-groups'].includes(mode)) {
  throw new Error('Modo inválido. Use npm start, npm run scan ou npm run list-groups.');
}
if (mode !== '--list-groups' && (!config.shopeeAppId || !config.shopeeAppSecret)) {
  throw new Error('Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET no arquivo .env.');
}

function logOffer(offer) {
  console.log('Oferta selecionada: ' + offer.title + ' | R$ ' + offer.price.toFixed(2) +
    ' | desconto ' + offer.discount.toFixed(1) + '% | comissão ' + offer.commission.toFixed(1) + '%');
}

async function scanCandidates(state) {
  const candidates = [];
  let successfulQueries = 0;
  const count = Math.min(config.keywordsPerScan, config.keywords.length);
  for (let i = 0; i < count; i++) {
    const keyword = config.keywords[(state.cursor + i) % config.keywords.length];
    try {
      const results = await searchProducts(config, keyword);
      console.log('Busca "' + keyword + '": ' + results.length + ' produtos retornados');
      candidates.push(...results);
      successfulQueries++;
    } catch (error) {
      console.error('Falha ao buscar "' + keyword + '": ' + error.message);
    }
  }
  if (successfulQueries) state.cursor = (state.cursor + count) % config.keywords.length;
  cleanState(state);
  await saveState(config.stateFile, state);
  if (!successfulQueries) throw new Error('Nenhuma consulta à Shopee foi concluída; envio suspenso neste ciclo.');
  return chooseOffer(candidates, state, config);
}

async function runCycle(socket = null) {
  const state = await loadState(config.stateFile);
  if (config.sendEnabled && !canPost(state, config)) {
    console.log('Fora da janela de envio ou limite de publicações atingido.');
    return;
  }
  const offer = await scanCandidates(state);
  if (!offer) {
    console.log('Nenhuma oferta de Natal passou por todos os filtros neste ciclo.');
    return;
  }
  logOffer(offer);
  if (!config.sendEnabled || !socket) {
    console.log('Modo de simulação: nenhuma mensagem enviada. Para ativar: SEND_ENABLED=true.');
    console.log(formatMessage(offer));
    return;
  }
  const pending = { key: offer.key, at: new Date().toISOString() };
  state.pending.push(pending);
  await saveState(config.stateFile, state);
  try {
    await publishOffer(socket, config, offer, formatMessage(offer));
    state.pending = state.pending.filter(entry => entry !== pending);
    state.sent.push({ key: offer.key, at: new Date().toISOString(), price: offer.price });
    cleanState(state);
    await saveState(config.stateFile, state);
    console.log('Oferta enviada e registrada com sucesso.');
  } catch (error) {
    console.error('Falha/resultado incerto no WhatsApp: ' + error.message);
    console.error('Oferta ficou pendente por 24h para prevenir publicação duplicada. Verifique o grupo.');
  }
}

if (mode === '--scan-once') {
  await runCycle();
} else {
  let timer = null;
  let busy = false;
  const handlers = {
    onDisconnect() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    async onReady(socket) {
      if (mode === '--list-groups') {
        await listGroups(socket);
        console.log('Copie o JID desejado no .env. Encerre com Ctrl+C.');
        return;
      }
      if (config.sendEnabled) {
        const group = await validateGroup(socket, config);
        console.log('Grupo validado: ' + group.subject);
      }
      const tick = async () => {
        if (busy) return;
        busy = true;
        try { await runCycle(socket); }
        catch (error) { console.error('Ciclo abortado sem envio: ' + error.message); }
        finally { busy = false; }
      };
      if (timer) clearInterval(timer);
      timer = setInterval(tick, config.intervalMinutes * 60000);
      await tick();
    }
  };
  console.log(config.sendEnabled ? 'Modo AUTOMÁTICO habilitado.' : 'Modo de simulação; sem envio.');
  await connectWhatsApp(config, handlers);
}
