import {bindDocument, installLangPicker} from './i18n.mjs?v=launch-38';
bindDocument();
installLangPicker();
import {installStartMenu} from './start-menu.mjs?v=launch-38';
installStartMenu();
import {registerOfflineCache} from './sw-register.mjs?v=launch-38';
registerOfflineCache();
