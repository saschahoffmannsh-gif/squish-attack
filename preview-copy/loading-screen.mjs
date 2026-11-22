import {bindDocument, installLangPicker} from './i18n.mjs?v=launch-40';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=launch-40';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=launch-40';
registerOfflineCache();
