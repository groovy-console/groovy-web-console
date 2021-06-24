import CodeMirror from 'codemirror'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/fold/brace-fold'
import 'codemirror/addon/fold/foldcode'
import 'codemirror/addon/fold/foldgutter'
import 'codemirror/addon/selection/active-line'
import 'codemirror/mode/groovy/groovy'

export function createEditor (codeArea: HTMLTextAreaElement) {
  return CodeMirror.fromTextArea(<HTMLTextAreaElement>codeArea, <any>{ // need to cast to any, since generated types don't support extensions `matchBrackets`
    lineNumbers: true,
    mode: 'groovy',
    tabSize: 4,
    indentUnit: 4,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    styleActiveLine: true
  })
}

export function createOutput (outputArea: HTMLTextAreaElement) {
  return CodeMirror.fromTextArea(<HTMLTextAreaElement>outputArea, <any>{
    readOnly: true,
    foldGutter: true,
    gutters: ['CodeMirror-foldgutter'],
    lineWrapping: true
  })
}
