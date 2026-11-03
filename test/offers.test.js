import test from 'node:test';
import assert from 'node:assert/strict';
import { percent, normalizeOffer, qualifies, chooseOffer, canPost, formatMessage } from '../src/offers.js';

const base = {
  itemId: 12345, shopId: 98765, productName: 'Guirlanda de Natal 35 cm',
  offerLink: 'https://s.shopee.com.br/exemplo', imageUrl: 'https://cf.shopee.com.br/file/exemplo',
  priceMin: '39.90', priceDiscountRate: '0.35', ratingStar: '4.9',
  sales: 250, commissionRate: '0.08'
};
const config = {
  maxPrice: 100, minDiscount: 30, minRating: 4.7, minSales: 50, minCommission: 5,
  repostCooldownDays: 7, maxDailySends: 6, minPostGapMinutes: 120,
  sendStartHour: 9, sendEndHour: 21, timeZone: 'America/Sao_Paulo'
};

test('normaliza percentuais fracionários e inteiros', () => {
  assert.equal(percent('0.35'), 35);
  assert.equal(percent('35%'), 35);
  assert.equal(percent('8'), 8);
});

test('aceita achadinho natalino com link de afiliado e bons indicadores', () => {
  const offer = normalizeOffer(base);
  assert.equal(offer.key, '98765:12345');
  assert.equal(offer.discount, 35);
  assert.equal(offer.commission, 8);
  assert.equal(qualifies(offer, config), true);
  assert.match(formatMessage(offer), /Link de afiliado/);
});

test('descarta outros temas ou link não confiável', () => {
  assert.equal(normalizeOffer({ ...base, productName: 'Carregador para celular' }), null);
  assert.equal(normalizeOffer({ ...base, offerLink: 'http://s.shopee.com.br/exemplo' }), null);
  assert.equal(normalizeOffer({ ...base, offerLink: 'https://exemplo.com/item' }), null);
});

test('exige todos os filtros e bloqueia duplicatas por 7 dias', () => {
  assert.equal(qualifies(normalizeOffer({ ...base, priceMin: '150' }), config), false);
  assert.equal(qualifies(normalizeOffer({ ...base, ratingStar: '4.4' }), config), false);
  const now = Date.parse('2026-11-03T15:00:00Z');
  const state = { sent: [{ key: '98765:12345', at: new Date(now - 2 * 86400000).toISOString() }], pending: [] };
  assert.equal(chooseOffer([base], state, config, now), null);
  state.sent[0].at = new Date(now - 10 * 86400000).toISOString();
  assert.equal(chooseOffer([base], state, config, now)?.key, '98765:12345');
});

test('protege ofertas com envio pendente de reenvio', () => {
  const now = Date.parse('2026-11-03T15:00:00Z');
  const state = { sent: [], pending: [{ key: '98765:12345', at: new Date(now).toISOString() }] };
  assert.equal(chooseOffer([base], state, config, now), null);
});

test('respeita horários, intervalo e teto diário de envios no Brasil', () => {
  const now = Date.parse('2026-11-03T18:00:00Z'); // 15:00 em São Paulo
  assert.equal(canPost({ sent: [] }, config, now), true);
  assert.equal(canPost({ sent: [] }, config, Date.parse('2026-11-03T10:00:00Z')), false);
  const recent = new Date(now - 30 * 60000).toISOString();
  assert.equal(canPost({ sent: [{ key: 'x', at: recent }] }, config, now), false);
  const old = new Date(now - 3 * 3600000).toISOString();
  const six = Array.from({ length: 6 }, (_, i) => ({ key: String(i), at: old }));
  assert.equal(canPost({ sent: six }, config, now), false);
});

test('tentativas pendentes também respeitam limite e intervalo diário', () => {
  const now = Date.parse('2026-11-03T18:00:00Z');
  const pending = [{ key: 'x', at: new Date(now - 15 * 60000).toISOString() }];
  assert.equal(canPost({ sent: [], pending }, config, now), false);
});
