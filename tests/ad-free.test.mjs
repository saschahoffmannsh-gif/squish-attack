import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_FREE_PRODUCT, AD_FREE_OFFER_ENABLED, isAdFreeOfferEnabled, registerAdFree, isAdFree, canOfferAdFree, canRestoreAdFree, hasAdFreeAdapter, purchaseAdFree, restoreAdFree, adFreePriceLabel } from '../game/ad-free.mjs';

function withOffer(on, fn) {
  const prev = globalThis.__SQUISH_AD_FREE_OFFER__;
  globalThis.__SQUISH_AD_FREE_OFFER__ = on;
  try { return fn(); }
  finally {
    if (prev === undefined) delete globalThis.__SQUISH_AD_FREE_OFFER__;
    else globalThis.__SQUISH_AD_FREE_OFFER__ = prev;
  }
}


test('launch-26: Werbefrei ist im Web aus, Kauf nur über nativen Adapter', () => {
  registerAdFree(null);
  assert.equal(AD_FREE_PRODUCT.id, 'squish.adfree');
  assert.equal(AD_FREE_PRODUCT.price, 4.99);
  assert.equal(isAdFree(), false);
  assert.equal(hasAdFreeAdapter(), false);
  assert.equal(canOfferAdFree(), false);
  assert.equal(canRestoreAdFree(), false);
});

test('1.0: Werbefrei-Angebot ist aus – Kauf und Wiederherstellen bleiben verborgen, auch mit Adapter', () => {
  assert.equal(AD_FREE_OFFER_ENABLED, false);
  assert.equal(isAdFreeOfferEnabled(), false);
  registerAdFree({
    isAdFree: () => false,
    purchase: async () => ({ ok: true }),
    restore: async () => ({ ok: true, owned: true }),
  });
  assert.equal(canOfferAdFree(), false);
  assert.equal(canRestoreAdFree(), false);
  assert.equal(withOffer(true, () => canOfferAdFree()), true);
  assert.equal(withOffer(true, () => canRestoreAdFree()), true);
  registerAdFree(null);
});

test('isAdFree folgt dem Adapter; Kauf ändert nicht das 1×-Limit (nur Entitlement)', async () => {
  let owned = false;
  registerAdFree({
    isAdFree: () => owned,
    purchase: async () => { owned = true; return { ok: true, transactionId: 't1' }; },
    priceLabel: '4,99 €',
  });
  assert.equal(isAdFree(), false);
  assert.equal(canOfferAdFree(), false, '1.0: Angebot aus');
  assert.equal(withOffer(true, () => canOfferAdFree()), true);
  assert.equal(adFreePriceLabel(), '4,99 €');
  const r = await purchaseAdFree();
  assert.equal(r.ok, true);
  assert.equal(isAdFree(), true);
  assert.equal(canOfferAdFree(), false);
  assert.equal(withOffer(true, () => canOfferAdFree()), false);
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

test('Käufe wiederherstellen setzt das Entitlement und bleibt im Web ohne Adapter unsichtbar', async () => {
  registerAdFree(null);
  assert.equal(canRestoreAdFree(), false);
  const none = await restoreAdFree();
  assert.equal(none.ok, false);
  assert.equal(none.reason, 'unavailable');

  let owned = false;
  registerAdFree({
    isAdFree: () => owned,
    purchase: async () => ({ ok: false, reason: 'unavailable' }),
    restore: async () => { owned = true; return { ok: true, owned: true }; },
  });
  assert.equal(canRestoreAdFree(), false, '1.0: Angebot aus');
  assert.equal(withOffer(true, () => canRestoreAdFree()), true);
  assert.equal(withOffer(true, () => canOfferAdFree()), true, 'Restore-Eintrag ersetzt den Kaufknopf nicht, solange noch nicht gekauft');
  const r = await restoreAdFree();
  assert.equal(r.ok, true);
  assert.equal(r.owned, true);
  assert.equal(isAdFree(), true);
  assert.equal(canOfferAdFree(), false);
  assert.equal(withOffer(true, () => canOfferAdFree()), false);
  registerAdFree(null);
});
