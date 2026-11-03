import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { loadGroups, upsertGroup, deleteGroup } from './groups.js';
import { loadState } from './state.js';
import { brasilDate } from './offers.js';

const ASSETS = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8']
};
export const providers = [
  { id: 'shopee', name: 'Shopee', status: 'active', capability: 'Busca e links de afiliado via API GraphQL' },
  { id: 'aliexpress', name: 'AliExpress', status: 'planned', capability: 'API de afiliados (produto/oferta): requer conta e credenciais' },
  { id: 'amazon', name: 'Amazon', status: 'planned', capability: 'Creators API: integração e elegibilidade pendentes' },
  { id: 'awin', name: 'Awin', status: 'planned', capability: 'Catálogos de produtos e links para anunciantes habilitados' },
  { id: 'mercadolivre', name: 'Mercado Livre', status: 'research', capability: 'Programa de afiliados: API de deeplink não verificada' },
  { id: 'magalu', name: 'Magalu', status: 'research', capability: 'Influenciador Magalu: API de afiliados não verificada' },
  { id: 'tiktok', name: 'TikTok Shop', status: 'research', capability: 'APIs restritas a autorização e elegibilidade do programa' }
];

const maxBodyBytes = 65536;
function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(value));
}
function authorized(request, token) {
  const provided = request.headers.authorization;
  if (!provided || !provided.startsWith('Bearer ')) return false;
  const a = Buffer.from(provided.slice(7));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    throw new Error('Content-Type precisa ser application/json');
  }
  let bytes = 0, content = '';
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new Error('Configuração excede 64 KB');
    content += chunk.toString('utf8');
  }
  const data = JSON.parse(content);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Envie um objeto JSON');
  return data;
}

export function createPanel(config, { connected, preview }) {
  if (!config.panelToken) {
    console.log('Painel desativado: configure PANEL_TOKEN (mínimo 32 caracteres).');
    return null;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && ASSETS[path]) {
        const [name, type] = ASSETS[path];
        const file = await readFile(resolve('panel', name));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(file);
        return;
      }
      if (!path.startsWith('/api/')) return json(res, 404, { error: 'Não encontrado' });
      if (!authorized(req, config.panelToken)) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        return json(res, 401, { error: 'Token inválido' });
      }
      if (req.method === 'GET' && path === '/api/overview') {
        const [groups, state] = await Promise.all([loadGroups(config.groupsFile), loadState(config.stateFile)]);
        const today = brasilDate(Date.now(), config.timeZone).day;
        const counters = Object.fromEntries(groups.map(group => [
          group.id, {
            sentToday: state.sent.filter(entry =>
              (entry.groupId || 'natal') === group.id &&
              brasilDate(Date.parse(entry.at), config.timeZone).day === today).length,
            pending: state.pending.filter(entry => (entry.groupId || 'natal') === group.id).length,
            lastScan: state.lastScans[group.id] || null
          }
        ]));
        return json(res, 200, {
          groups, counters,
          events: state.events.slice(-70).reverse(),
          providers,
          sendingEnabled: config.sendEnabled,
          connected: Boolean(connected()),
          timeZone: config.timeZone
        });
      }
      if (req.method === 'POST' && path === '/api/groups') {
        const data = await readJson(req);
        return json(res, 201, { group: await upsertGroup(config.groupsFile, data) });
      }
      const match = path.match(/^\/api\/groups\/([a-z0-9_-]{2,48})(\/preview)?$/);
      if (match) {
        const id = match[1];
        if (req.method === 'PUT' && !match[2]) {
          const data = await readJson(req);
          return json(res, 200, { group: await upsertGroup(config.groupsFile, data, id) });
        }
        if (req.method === 'DELETE' && !match[2]) {
          await deleteGroup(config.groupsFile, id);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && match[2]) {
          const group = (await loadGroups(config.groupsFile)).find(g => g.id === id);
          if (!group) return json(res, 404, { error: 'Grupo não encontrado' });
          const result = await preview(group);
          return json(res, 200, result);
        }
      }
      return json(res, 404, { error: 'Rota inexistente' });
    } catch (error) {
      console.error('Painel:', error.message);
      const badRequest = /Grupo|JID|Termos|termos|Palavras|válid|inválid|Configura|Lista|Preço|Desconto|Comissão|Início|Fim|Horário|Limite|Intervalo|Publicações|Prazo|Content-Type|64 KB|JSON|entre|não encontrado|indisponível|máximo/i.test(error.message);
      json(res, badRequest ? 400 : 500, { error: error.message });
    }
  });
  server.listen(config.panelPort, config.panelHost, () =>
    console.log('Painel: http://' + config.panelHost + ':' + config.panelPort + ' (exige token)'));
  return server;
}
