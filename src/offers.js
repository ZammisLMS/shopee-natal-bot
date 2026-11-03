const NATAL = /\b(natal(?:ino|ina|inos|inas)?|noel|guirlanda|pisca[\s-]*pisca|festao|rena(?:s)?)\b/i;

export function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const cleaned = value.trim().replace('%', '').replace(',', '.');
  if (!cleaned) return NaN;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : NaN;
}

export function percent(value) {
  const parsed = numeric(value);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  const raw = String(value).trim();
  return parsed > 0 && parsed < 1 && !raw.includes('%') ? parsed * 100 : parsed;
}

function normalizeText(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesTerms(title, config) {
  const normalized = normalizeText(title);
  const excluded = config?.excludeTerms || [];
  if (excluded.some(term => normalized.includes(normalizeText(term)))) return false;
  if (Array.isArray(config?.matchTerms)) {
    return config.matchTerms.some(term => normalized.includes(normalizeText(term)));
  }
  return NATAL.test(normalized);
}

function validAffiliateUrl(link) {
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      (host === 'shopee.com.br' || host.endsWith('.shopee.com.br') ||
       host === 'shope.ee' || host.endsWith('.shope.ee'));
  } catch {
    return false;
  }
}

export function normalizeOffer(raw, group = undefined) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.productName || '').trim();
  if (!matchesTerms(title, group)) return null;
  if (!validAffiliateUrl(raw.offerLink)) return null;
  const price = numeric(raw.priceMin);
  const discount = percent(raw.priceDiscountRate);
  const rating = numeric(raw.ratingStar);
  const sales = numeric(raw.sales);
  const commission = percent(raw.commissionRate);
  const shopId = String(raw.shopId ?? '').trim();
  const itemId = String(raw.itemId ?? '').trim();
  if (!shopId || !itemId || ![price, discount, rating, sales, commission].every(Number.isFinite)) {
    return null;
  }
  if (price <= 0 || discount < 0 || discount > 100 || rating > 5 || sales < 0 || commission > 100) return null;
  let imageUrl = null;
  try {
    const image = new URL(raw.imageUrl);
    const host = image.hostname.toLowerCase();
    if (image.protocol === 'https:' &&
        (host.endsWith('.susercontent.com') || host === 'susercontent.com' ||
         host.endsWith('.shopee.com.br') || host === 'shopee.com.br' ||
         host.endsWith('.shopeemobile.com') || host === 'shopeemobile.com')) {
      imageUrl = image.href;
    }
  } catch {
    // Imagem ausente ou fora de domínios conhecidos: texto.
  }
  return {
    key: shopId + ':' + itemId,
    title: title.slice(0, 200),
    price, discount, rating, sales, commission,
    link: raw.offerLink, imageUrl
  };
}

export function qualifies(offer, config) {
  return Boolean(offer && offer.price <= config.maxPrice &&
    offer.discount >= config.minDiscount && offer.rating >= config.minRating &&
    offer.sales >= config.minSales && offer.commission >= config.minCommission);
}

export function rankingScore(offer) {
  return offer.discount * 0.55 + offer.commission * 0.2 +
    offer.rating * 4 + Math.min(12, Math.log10(offer.sales + 1) * 4);
}

function sameGroup(entry, groupId) {
  return groupId === undefined || (entry.groupId || 'natal') === groupId;
}

export function chooseOffer(rawOffers, state, config, now = Date.now(), groupId = undefined) {
  const cooldownMs = config.repostCooldownDays * 24 * 60 * 60 * 1000;
  const recent = new Set((state.sent || [])
    .filter(entry => sameGroup(entry, groupId) && now - Date.parse(entry.at) < cooldownMs)
    .map(entry => entry.key));
  const pending = new Set((state.pending || [])
    .filter(entry => sameGroup(entry, groupId) && now - Date.parse(entry.at) < 24 * 60 * 60 * 1000)
    .map(entry => entry.key));
  const candidates = new Map();
  for (const raw of rawOffers) {
    const offer = normalizeOffer(raw, config);
    if (!qualifies(offer, config) || recent.has(offer.key) || pending.has(offer.key)) continue;
    const previous = candidates.get(offer.key);
    if (!previous || rankingScore(offer) > rankingScore(previous)) candidates.set(offer.key, offer);
  }
  return [...candidates.values()].sort((a, b) => rankingScore(b) - rankingScore(a))[0] || null;
}

export function brasilDate(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now));
  const get = type => parts.find(part => part.type === type)?.value;
  return { day: get('year') + '-' + get('month') + '-' + get('day'), hour: Number(get('hour')) };
}

export function canPost(state, config, now = Date.now(), groupId = undefined) {
  const local = brasilDate(now, config.timeZone);
  if (local.hour < config.sendStartHour || local.hour >= config.sendEndHour) return false;
  const attempts = [...(state.sent || []), ...(state.pending || [])].filter(entry => sameGroup(entry, groupId));
  if (attempts.filter(entry => brasilDate(Date.parse(entry.at), config.timeZone).day === local.day).length >= config.maxDailySends) return false;
  const latest = attempts.reduce((max, entry) => Math.max(max, Date.parse(entry.at) || 0), 0);
  return !latest || now - latest >= config.minPostGapMinutes * 60000;
}

export function formatMessage(offer, groupName = 'Achadinhos de Natal') {
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const headline = String(groupName).replace(/[\r\n*]/g, ' ').trim().slice(0, 90).toUpperCase();
  return [
    '✨ *' + headline + '* 🛍️',
    '',
    '*' + offer.title.replace(/[\r\n*]/g, ' ').trim() + '*',
    '',
    '💰 *Preço:* ' + brl.format(offer.price),
    '🔥 *Desconto informado:* ' + Math.round(offer.discount) + '%',
    '⭐ *Avaliação:* ' + offer.rating.toFixed(1) + '/5',
    '',
    '🛒 *Comprar na Shopee:*',
    offer.link,
    '',
    '🔎 Oferta sujeita a alteração de preço e disponibilidade.',
    '🔗 Link de afiliado.'
  ].join('\n');
}
