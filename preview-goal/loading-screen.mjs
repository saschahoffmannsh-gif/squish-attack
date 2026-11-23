import {bindDocument, installLangPicker} from './i18n.mjs?v=preview-goal';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=preview-goal';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=preview-goal';
registerOfflineCache();
