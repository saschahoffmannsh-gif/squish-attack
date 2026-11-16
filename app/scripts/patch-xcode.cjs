// Einmalig nach `npx cap add ios` (schon erledigt, liegt im Repo): passt das Xcode-Projekt an.
// Nur iPhone, Sprachen de/en, InfoPlist.strings, Privacy Manifest, StoreKit-Testdatei, Game-Center-Entitlement.
// Mehrfach ausführbar (idempotent). Aufruf: node scripts/patch-xcode.cjs
const fs = require('fs');
const path = require('path');
const xcode = require('xcode');
const file = path.join(__dirname, '..', 'ios/App/App.xcodeproj/project.pbxproj');
const proj = xcode.project(file).parseSync();
const target = proj.getFirstTarget().uuid;
const appGroup = proj.findPBXGroupKey({ name: 'App' }) || proj.findPBXGroupKey({ path: 'App' });

// nur iPhone, Hochformat
const cfgs = proj.pbxXCBuildConfigurationSection();
for (const k of Object.keys(cfgs)) {
  const s = cfgs[k].buildSettings; if (!s || !s.PRODUCT_BUNDLE_IDENTIFIER) continue;
  s.TARGETED_DEVICE_FAMILY = '1';
  s.SUPPORTS_MACCATALYST = 'NO';
  s.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = 'NO';
  s.SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = 'NO';
  s.INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = 'UIInterfaceOrientationPortrait';
}
// Sprachen
const project = proj.getFirstProject().firstProject;
for (const r of ['de', 'en']) if (!project.knownRegions.includes(r)) project.knownRegions.push(r);

const hasFile = name => JSON.stringify(proj.pbxFileReferenceSection()).includes(`"${name}"`) ||
  JSON.stringify(proj.hash.project.objects.PBXVariantGroup || {}).includes(name);

if (!hasFile('InfoPlist.strings')) {
  const vg = proj.addLocalizationVariantGroup('InfoPlist.strings');
  // ohne „Resources“-Gruppe hängt die Bibliothek die Gruppe nirgends ein → in den App-Ordner
  const kids = proj.getPBXGroupByKey(appGroup).children;
  if (!kids.some(c => c.value === vg.fileRef)) kids.push({ value: vg.fileRef, comment: 'InfoPlist.strings' });
  for (const lang of ['de', 'en']) {
    proj.addFile(`${lang}.lproj/InfoPlist.strings`, vg.fileRef, { lastKnownFileType: 'text.plist.strings', name: lang });
  }
}
if (!hasFile('PrivacyInfo.xcprivacy')) {
  const f = proj.addFile('PrivacyInfo.xcprivacy', appGroup, { lastKnownFileType: 'text.xml' });
  f.uuid = proj.generateUuid(); f.target = target;
  proj.addToPbxBuildFileSection(f); proj.addToPbxResourcesBuildPhase(f);
}
if (!hasFile('Squish.storekit')) proj.addFile('Squish.storekit', appGroup, { lastKnownFileType: 'text' });
if (!hasFile('App.entitlements')) {
  proj.addFile('App.entitlements', appGroup, { lastKnownFileType: 'text.plist.entitlements' });
}
for (const k of Object.keys(cfgs)) {
  const s = cfgs[k].buildSettings; if (!s || !s.PRODUCT_BUNDLE_IDENTIFIER) continue;
  s.CODE_SIGN_ENTITLEMENTS = 'App/App.entitlements';
}

let out = proj.writeSync()
  .replace(/ (explicitFileType|fileEncoding) = undefined;/g, '')
  .replace(/InfoPlist\.strings in undefined/g, 'InfoPlist.strings in Resources')
  .replace(/name = "InfoPlist\.strings"; path = "(de|en)\.lproj\/InfoPlist\.strings"/g, 'name = $1; path = "$1.lproj/InfoPlist.strings"');
fs.writeFileSync(file, out);
console.log('Xcode-Projekt angepasst');
