import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faPlay, faSave, faSearch, faShare, faClock } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { enableBulmaSupport } from './bulma-support'

initView()
enableBulmaSupport()

library.add(faCopy, faGithub, faPlay, faSave, faShare, faSearch, faClock)
dom.i2svg()
