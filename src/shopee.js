import { createHash } from 'node:crypto';

const API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

export async function queryShopee(config, query) {
  if (!config.shopeeAppId || !config.shopeeAppSecret) {
    throw new Error('SHOPEE_APP_ID e SHOPEE_APP_SECRET são obrigatórios para buscar ofertas');
  }
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash('sha256')
    .update(config.shopeeAppId + timestamp + payload + config.shopeeAppSecret, 'utf8')
    .digest('hex');
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'SHA256 Credential=' + config.shopeeAppId +
        ', Timestamp=' + timestamp + ', Signature=' + signature
    },
    body: payload,
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) {
    throw new Error('Shopee HTTP ' + response.status);
  }
  const json = await response.json();
  if (json.errors?.length) {
    const codes = json.errors.map(error => String(error.extensions?.code || 'unknown')).join(',');
    throw new Error('Shopee GraphQL retornou erro(s), código(s): ' + codes);
  }
  return json.data || {};
}

export async function searchProducts(config, keyword) {
  const query = [
    '{ productOfferV2(',
    'keyword: ' + JSON.stringify(keyword) + ', ',
    'sortType: 2, page: 1, limit: ' + Math.floor(config.resultsPerQuery),
    ') { nodes { itemId shopId productName offerLink imageUrl priceMin',
    'priceDiscountRate ratingStar sales commissionRate } } }'
  ].join(' ');
  const response = await queryShopee(config, query);
  const nodes = response.productOfferV2?.nodes;
  if (!Array.isArray(nodes)) throw new Error('Resposta inesperada de productOfferV2');
  return nodes;
}
