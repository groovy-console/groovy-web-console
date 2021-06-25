import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faFileCode, faHome, faPlay, faSave, faUser } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.css'
import 'bulma/css/bulma.css'
import '@creativebulma/bulma-tooltip/dist/bulma-tooltip.css'

initView()

library.add(faCopy, faFileCode, faHome, faPlay, faSave, faUser)
dom.i2svg()
