import {bindDocument, installLangPicker} from './i18n.mjs?v=preview-gel';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=preview-gel';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=preview-gel';
registerOfflineCache();
