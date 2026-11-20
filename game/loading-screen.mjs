import {bindDocument, installLangPicker} from './i18n.mjs?v=launch-36';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=launch-36';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=launch-36';
registerOfflineCache();
