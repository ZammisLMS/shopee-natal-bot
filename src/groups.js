import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { saveState } from './state.js';

const MAX_GROUPS = 20;
const onlyShopee = 'shopee';
const number = (value, field, min, max) => {
  const x = Number(value);
  if (!Number.isFinite(x) || x < min || x > max) {
    throw new Error(field + ' deve estar entre ' + min + ' e ' + max);
  }
  return x;
};
const strings = (input, field, limit) => {
  if (!Array.isArray(input) || input.length === 0 || input.length > limit ||
    input.some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) {
    throw new Error(field + ' deve ser uma lista de 1 a ' + limit + ' termos');
  }
  return [...new Set(input.map(x => x.trim()))];
};
const optionalStrings = (input, field) => {
  if (!Array.isArray(input) || input.length > 30 ||
    input.some(x => typeof x !== 'string' || x.length > 100)) {
    throw new Error(field + ' deve ser uma lista de até 30 termos');
  }
  return [...new Set(input.map(x => x.trim()).filter(Boolean))];
};

export function normalizeGroup(input) {
  if (!input || typeof input !== 'object') throw new Error('Grupo inválido');
  const id = String(input.id || 'grupo-' + randomUUID().slice(0, 8));
  if (!/^[a-z0-9_-]{2,48}$/.test(id)) throw new Error('ID de grupo inválido');
  const name = String(input.name || '').trim();
  if (!name || name.length > 90) throw new Error('Nome do grupo inválido');
  const jid = String(input.jid || '').trim();
  const enabled = input.enabled === true;
  if (jid && !/^[0-9-]+@g\.us$/.test(jid)) throw new Error('JID do WhatsApp inválido');
  if (enabled && !jid) throw new Error('Configure o JID antes de ativar o grupo');
  const provider = String(input.provider || 'shopee');
  if (provider !== onlyShopee) throw new Error('No MVP, apenas a Shopee está integrada');
  const filters = input.filters || {};
  const schedule = input.schedule || {};
  const group = {
    id, name, jid, enabled, provider,
    keywords: strings(input.keywords, 'Palavras-chave', 40),
    matchTerms: strings(input.matchTerms, 'Termos de correspondência', 40),
    excludeTerms: optionalStrings(input.excludeTerms || [], 'Exclusões'),
    filters: {
      maxPrice: number(filters.maxPrice, 'Preço máximo', 1, 100000),
      minDiscount: number(filters.minDiscount, 'Desconto mínimo', 0, 100),
      minRating: number(filters.minRating, 'Avaliação mínima', 0, 5),
      minSales: number(filters.minSales, 'Vendas mínimas', 0, 100000000),
      minCommission: number(filters.minCommission, 'Comissão mínima', 0, 100)
    },
    schedule: {
      intervalMinutes: number(schedule.intervalMinutes, 'Intervalo de busca', 15, 1440),
      maxDailySends: number(schedule.maxDailySends, 'Publicações diárias', 1, 24),
      minPostGapMinutes: number(schedule.minPostGapMinutes, 'Intervalo entre posts', 10, 1440),
      repostCooldownDays: number(schedule.repostCooldownDays, 'Prazo de repetição', 1, 90),
      startHour: number(schedule.startHour, 'Início', 0, 23),
      endHour: number(schedule.endHour, 'Fim', 1, 24)
    }
  };
  if (group.schedule.endHour <= group.schedule.startHour) {
    throw new Error('Horário final deve ser maior que o inicial');
  }
  return group;
}

export async function loadGroups(file) {
  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Configuração de grupos indisponível: ' + error.message);
    raw = JSON.parse(await readFile(resolve('config/groups.example.json'), 'utf8'));
    await saveState(file, raw);
  }
  if (!Array.isArray(raw) || raw.length > MAX_GROUPS) throw new Error('Lista de grupos inválida');
  const groups = raw.map(normalizeGroup);
  if (new Set(groups.map(g => g.id)).size !== groups.length) throw new Error('IDs de grupos duplicados');
  return groups;
}

let mutationChain = Promise.resolve();
function serialized(operation) {
  const action = mutationChain.then(operation);
  mutationChain = action.catch(() => {});
  return action;
}
export function upsertGroup(file, input, targetId = null) {
  return serialized(async () => {
    const groups = await loadGroups(file);
    const group = normalizeGroup({ ...input, id: targetId || input.id });
    const index = groups.findIndex(g => g.id === group.id);
    if (targetId && index < 0) throw new Error('Grupo não encontrado');
    if (index < 0 && groups.length >= MAX_GROUPS) throw new Error('Limite de 20 grupos');
    if (index >= 0) groups[index] = group;
    else groups.push(group);
    await saveState(file, groups);
    return group;
  });
}
export function deleteGroup(file, targetId) {
  return serialized(async () => {
    const groups = await loadGroups(file);
    const next = groups.filter(g => g.id !== targetId);
    if (next.length === groups.length) throw new Error('Grupo não encontrado');
    await saveState(file, next);
  });
}
