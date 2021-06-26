import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faFileCode, faHome, faPlay, faSave, faShare, faUser } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'

initView()

library.add(faCopy, faFileCode, faHome, faPlay, faSave, faShare, faUser)
dom.i2svg()
