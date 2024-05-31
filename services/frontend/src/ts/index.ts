import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faPlay, faSave, faSearch, faShare, faSun, faMoon, faDesktop, faClock } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { enableBulmaSupport } from './bulma-support'

initView()
enableBulmaSupport()

library.add(faCopy, faGithub, faPlay, faSave, faShare, faSearch, faSun, faMoon, faDesktop, faClock)
dom.i2svg()
