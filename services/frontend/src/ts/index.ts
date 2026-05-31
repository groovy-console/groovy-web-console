import { dom, library } from '@fortawesome/fontawesome-svg-core'
import { faCopy, faPlay, faSave, faSearch, faShare, faSun, faMoon, faDesktop, faClock, faTrash } from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { enableBulmaSupport } from './bulma-support'

library.add(faCopy, faGithub, faPlay, faSave, faShare, faSearch, faSun, faMoon, faDesktop, faClock, faTrash)
// dom.watch() converts existing <i> tags AND keeps watching for new ones,
// so icons rendered dynamically (e.g. inside the history modal's rows) also get SVG-ified.
dom.watch()

initView()
enableBulmaSupport()
