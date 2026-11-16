import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { patchIndexHtml, auditBundle, build, ROOT_INDEX } from '../scripts/build-web.mjs';
import { storeProductId } from '../src/app-config.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(APP, p), 'utf8');

test('capacitor.config.json: Platzhalter-App-ID, lokales webDir, kein server.url (Richtlinie 2.5.2)', () => {
  const c = JSON.parse(read('capacitor.config.json'));
  assert.equal(c.appId, 'de.hoffmann.squishattack');
  assert.equal(c.webDir, 'www');
  assert.equal(c.server?.url, undefined);
  assert.equal(c.ios.scrollEnabled, false);
  assert.equal(c.ios.contentInset, 'never');
});
test('Info.plist: nur Hochformat, AdMob-TEST-App-ID, ATT-Text, SKAdNetwork', () => {
  const p = read('ios/App/App/Info.plist');
  const orient = p.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/)[1];
  assert.deepEqual([...orient.matchAll(/<string>(.*?)<\/string>/g)].map(m => m[1]), ['UIInterfaceOrientationPortrait']);
  assert.ok(!p.includes('UISupportedInterfaceOrientations~ipad'));
  assert.match(p, /<key>GADApplicationIdentifier<\/key>\s*<string>ca-app-pub-3940256099942544~1458002511<\/string>/);
  assert.match(p, /<key>NSUserTrackingUsageDescription<\/key>/);
  assert.ok((p.match(/\.skadnetwork</g) || []).length >= 40);
  assert.match(p, /cstr6suwn9\.skadnetwork/);
  for (const l of ['de', 'en']) assert.match(read(`ios/App/App/${l}.lproj/InfoPlist.strings`), /"NSUserTrackingUsageDescription" = ".+";/);
});
test('Xcode-Projekt: nur iPhone, Bundle-ID, Sprachen, Privacy Manifest, StoreKit-Schema', () => {
  const x = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.ok(!/TARGETED_DEVICE_FAMILY = "1,2"/.test(x));
  assert.equal((x.match(/TARGETED_DEVICE_FAMILY = 1;/g) || []).length, 2);
  assert.equal((x.match(/PRODUCT_BUNDLE_IDENTIFIER = de\.hoffmann\.squishattack;/g) || []).length, 2);
  assert.match(x, /PrivacyInfo\.xcprivacy in Resources/);
  assert.match(x, /InfoPlist\.strings in Resources/);
  assert.ok(!x.includes('undefined'));
  assert.match(read('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), /StoreKitConfigurationFileReference[\s\S]*Squish\.storekit/);
});
test('Squish.storekit enthält genau die Shop-Produkte als Verbrauchsartikel', async () => {
  const { shopProducts } = await import('../../game/shop.mjs');
  const sk = JSON.parse(read('ios/App/App/Squish.storekit'));
  const want = shopProducts().map(p => storeProductId(p.id)).sort();
  assert.deepEqual(sk.products.map(p => p.productID).sort(), want);
  assert.ok(sk.products.every(p => p.type === 'Consumable'));
});
test('App-Icon und Startbild: alle Dateien vorhanden', () => {
  const icon = JSON.parse(read('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json'));
  for (const i of icon.images) if (i.filename) assert.ok(existsSync(join(APP, 'ios/App/App/Assets.xcassets/AppIcon.appiconset', i.filename)), i.filename);
  const splash = JSON.parse(read('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json'));
  for (const i of splash.images) if (i.filename) assert.ok(existsSync(join(APP, 'ios/App/App/Assets.xcassets/Splash.imageset', i.filename)), i.filename);
});
test('index.html-Patch: Viewport ohne Zoom, native-boot statt loading-screen, app.css', () => {
  const html = '<html lang="de"><head><meta name="viewport" content="width=device-width" /></head><body><script type="module" src="loading-screen.mjs?v=launch-9"></script></body></html>';
  const out = patchIndexHtml(html, 'launch-9');
  assert.match(out, /user-scalable=no/); assert.match(out, /viewport-fit=cover/);
  assert.match(out, /src="app\/native-boot\.mjs\?v=launch-9"/);
  assert.ok(!out.includes('loading-screen.mjs'));
  assert.match(out, /href="app\/app\.css\?v=launch-9"/);
  assert.throws(() => patchIndexHtml(html, 'launch-10'), /loading-screen/);
  assert.match(ROOT_INDEX, /game\/index\.html/);
});
test('Bundle-Prüfung findet Fremd-Code', () => {
  const d = mkdtempSync(join(tmpdir(), 'sq-'));
  try {
    build({ out: d, log: () => {} });
    assert.deepEqual(auditBundle(d), []);
    assert.ok(existsSync(join(d, 'game/app/native-boot.mjs')));
    assert.ok(!existsSync(join(d, 'lab')) && !existsSync(join(d, 'tests')) && !existsSync(join(d, 'sw.js')));
    const boot = readFileSync(join(d, 'game/app/native-boot.mjs'), 'utf8');
    assert.ok(!boot.includes('__BUILD__'));
    assert.ok(!/https?:\/\//.test(boot));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
