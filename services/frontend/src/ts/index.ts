import {dom, library} from '@fortawesome/fontawesome-svg-core'
import {faFileCode, faHome, faPlay, faSave, faUser} from '@fortawesome/free-solid-svg-icons'
import {initFromUrl, initView} from "./view";

initView()
setTimeout(initFromUrl, 200)

library.add(faPlay, faSave, faHome, faFileCode, faUser)
dom.i2svg()

