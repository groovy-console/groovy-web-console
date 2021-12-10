import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faPlay, faSave, faSearch, faShare } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'
import { faGithub } from '@fortawesome/free-brands-svg-icons'

initView()

library.add(faCopy, faGithub, faPlay, faSave, faShare, faSearch)
dom.i2svg()
