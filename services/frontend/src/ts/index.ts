import {dom, library} from '@fortawesome/fontawesome-svg-core';
import {faCopy, faFileCode, faHome, faPlay, faSave, faUser} from '@fortawesome/free-solid-svg-icons';
import {initFromUrl, initView} from "./view";

initView();
setTimeout(initFromUrl, 200);

library.add(faCopy, faFileCode, faHome, faPlay, faSave, faUser);
dom.i2svg();

