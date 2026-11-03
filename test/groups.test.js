import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeGroup, loadGroups, upsertGroup, deleteGroup } from '../src/groups.js';
import { normalizeOffer, chooseOffer, canPost, formatMessage } from '../src/offers.js';
import { loadState } from '../src/state.js';

function group(id, keyword) {
  return {
    id, name: 'Achadinhos ' + id, jid: '', enabled: false, provider: 'shopee',
    keywords: [keyword], matchTerms: [keyword], excludeTerms: ['brinde'],
    filters: { maxPrice: 250, minDiscount: 20, minRating: 4, minSales: 10, minCommission: 4 },
    schedule: { intervalMinutes: 30, maxDailySends: 3, minPostGapMinutes: 120,
      repostCooldownDays: 7, startHour: 9, endHour: 21 }
  };
}
const raw = {
  itemId: 10, shopId: 20, productName: 'Creatina monohidratada 300g',
  offerLink: 'https://s.shopee.com.br/exemplo', priceMin: 89,
  priceDiscountRate: 0.3, ratingStar: 4.9, sales: 200, commissionRate: 0.07
};
function limits(g) {
  return { ...g, ...g.filters, ...g.schedule,
    sendStartHour: g.schedule.startHour, sendEndHour: g.schedule.endHour,
    timeZone: 'America/Sao_Paulo' };
}

test('filtro por nicho e exclusões: Natal não recebe creatina', () => {
  assert.equal(normalizeOffer(raw, group('natal', 'natal')), null);
  assert.equal(normalizeOffer(raw, group('suplementos', 'creatina'))?.title, raw.productName);
  assert.equal(normalizeOffer({ ...raw, productName: 'brinde creatina' }, group('suplementos', 'creatina')), null);
});
test('deduplicação e limite diário são separados por grupo', () => {
  const natal = limits(group('natal', 'natal'));
  const suplementos = limits(group('suplementos', 'creatina'));
  const now = Date.parse('2026-11-03T18:00:00Z');
  const state = {
    sent: [{ key: '20:10', groupId: 'natal', at: new Date(now - 60_000).toISOString() }],
    pending: []
  };
  assert.equal(chooseOffer([raw], state, suplementos, now, 'suplementos')?.key, '20:10');
  assert.equal(chooseOffer([raw], state, { ...suplementos, matchTerms: ['creatina'] }, now, 'natal'), null);
  assert.equal(canPost(state, natal, now, 'natal'), false);
  assert.equal(canPost(state, suplementos, now, 'suplementos'), true);
  assert.match(formatMessage(normalizeOffer(raw, suplementos), 'Achadinhos Fitness'), /FITNESS/);
});
test('não ativa grupo sem JID e valida nome e horário', () => {
  assert.throws(() => normalizeGroup({ ...group('natal', 'natal'), enabled: true }), /JID/);
  assert.throws(() => normalizeGroup({ ...group('natal', 'natal'), schedule: { ...group('natal', 'natal').schedule, endHour: 8 } }), /maior/);
  assert.equal(normalizeGroup({ ...group('natal', 'natal'), jid: '123456@g.us', enabled: true }).enabled, true);
  assert.throws(() => normalizeGroup({ ...group('natal', 'natal'), provider: 'amazon' }), /apenas a Shopee/);
});
test('cria, atualiza e apaga grupos em arquivo persistente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'garimpo-test-'));
  const file = join(dir, 'groups.json');
  try {
    const a = await upsertGroup(file, group('natal', 'natal'));
    assert.equal(a.id, 'natal');
    await upsertGroup(file, group('suplementos', 'creatina'));
    assert.equal((await loadGroups(file)).length, 2);
    const updated = await upsertGroup(file, { ...a, name: 'Natal VIP' }, 'natal');
    assert.equal(updated.name, 'Natal VIP');
    await deleteGroup(file, 'natal');
    assert.deepEqual((await loadGroups(file)).map(g => g.id), ['suplementos']);
    const state = await loadState(join(dir, 'new-state.json'));
    assert.deepEqual(state.events, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
