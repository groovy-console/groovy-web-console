import { library, dom } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { far } from '@fortawesome/free-regular-svg-icons'
import { fab } from '@fortawesome/free-brands-svg-icons'
import {initFromUrl, initView} from "./view";
import {fromEvent} from "rxjs";

library.add(fas, far, fab)

fromEvent(document, 'onload').subscribe( () => {
    dom.i2svg()
    initView()
    initFromUrl()
});
