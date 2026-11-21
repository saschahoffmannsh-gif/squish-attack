import {bindDocument, installLangPicker} from './i18n.mjs?v=launch-39';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=launch-39';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=launch-39';
registerOfflineCache();
