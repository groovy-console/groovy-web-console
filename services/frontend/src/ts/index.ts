import { dom, library } from '@fortawesome/fontawesome-svg-core'
import {
  faCopy,
  faCode,
  faPlay,
  faSave,
  faSearch,
  faShare
} from '@fortawesome/free-solid-svg-icons'
import { initView } from './view'
import '../resources/css/style.scss'

initView()

library.add(faCopy, faCode, faPlay, faSave, faShare, faSearch)
dom.i2svg()
