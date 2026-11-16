import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_FREE_PRODUCT, registerAdFree, isAdFree, canOfferAdFree, hasAdFreeAdapter, purchaseAdFree, adFreePriceLabel } from '../game/ad-free.mjs';

test('launch-26: Werbefrei ist im Web aus, Kauf nur über nativen Adapter', () => {
  registerAdFree(null);
  assert.equal(AD_FREE_PRODUCT.id, 'squish.adfree');
  assert.equal(AD_FREE_PRODUCT.price, 2.99);
  assert.equal(isAdFree(), false);
  assert.equal(hasAdFreeAdapter(), false);
  assert.equal(canOfferAdFree(), false);
});

test('isAdFree folgt dem Adapter; Kauf ändert nicht das 1×-Limit (nur Entitlement)', async () => {
  let owned = false;
  registerAdFree({
    isAdFree: () => owned,
    purchase: async () => { owned = true; return { ok: true, transactionId: 't1' }; },
    priceLabel: '2,99 €',
  });
  assert.equal(isAdFree(), false);
  assert.equal(canOfferAdFree(), true);
  assert.equal(adFreePriceLabel(), '2,99 €');
  const r = await purchaseAdFree();
  assert.equal(r.ok, true);
  assert.equal(isAdFree(), true);
  assert.equal(canOfferAdFree(), false);
  const again = await purchaseAdFree();
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
  registerAdFree({ isAdFree: () => { throw new Error('boom'); } });
  assert.equal(isAdFree(), false);
  registerAdFree(null);
});

test('abgebrochener Kauf lässt isAdFree falsch', async () => {
  registerAdFree({ isAdFree: () => false, purchase: async () => ({ ok: false, reason: 'cancelled' }) });
  const r = await purchaseAdFree();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cancelled');
  assert.equal(isAdFree(), false);
  registerAdFree(null);
});
