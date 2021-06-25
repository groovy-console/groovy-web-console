import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/display/autorefresh'
import 'codemirror/addon/edit/closebrackets'
import 'codemirror/addon/edit/matchbrackets'
import 'codemirror/addon/fold/brace-fold'
import 'codemirror/addon/fold/foldcode'
import 'codemirror/addon/fold/foldgutter'
import 'codemirror/addon/fold/foldgutter.css'
import 'codemirror/addon/lint/lint.css'
import { Annotation } from 'codemirror/addon/lint/lint'
import 'codemirror/addon/selection/active-line'
import 'codemirror/mode/groovy/groovy'
import { decodeUrlSafe, decompressFromBase64 } from './compression'
import { loadGist, loadGithubFile } from './github'

export class CodeEditor {
  private codeMirror: CodeMirror.EditorFromTextArea
  private lintErrors: Annotation[] = []

  constructor (codeArea: HTMLTextAreaElement) {
    this.codeMirror = this.createEditor(codeArea)

    this.codeMirror.on('change', () => {
      // clear errors when the user changes the editor,
      // as we don't have a way to check the correctness locally
      if (this.lintErrors.length > 0) {
        this.clearErrors()
      }
    })
  }

  private getCustomAnnotations (): Annotation[] {
    return this.lintErrors
  }

  private createEditor (codeArea: HTMLTextAreaElement) {
    return CodeMirror.fromTextArea(<HTMLTextAreaElement>codeArea, <any>{ // need to cast to any, since generated types don't support extensions `matchBrackets`
      lineNumbers: true,
      mode: 'groovy',
      tabSize: 4,
      indentUnit: 4,
      matchBrackets: true,
      autoCloseBrackets: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
      styleActiveLine: true,
      lint: {
        // we need to disable automatic linting to be able to trigger it manually
        lintOnChange: false,
        // this allows us to add custom linting annotations, currently used only for error responses
        getAnnotations: () => this.getCustomAnnotations()
      }
    })
  }

  public getCode () {
    return this.codeMirror.getValue()
  }

  public setCode (code: string) {
    this.clearErrors()
    this.codeMirror.setValue(code)
    this.codeMirror.refresh()
  }

  public handleErrorResult (result: string) {
    // check if it's a syntax error
    const lineColInfo = result.match(/.*@ line (\d+), column (\d+).$/)
    if (lineColInfo && lineColInfo.length >= 3) {
      this.addErrorHint({
        line: parseInt(lineColInfo[1]) - 1,
        ch: parseInt(lineColInfo[2]) - 1
      }, result)
    } else { // check if it's an exception
      const exceptionLines = result.split('\n')
      const scriptLineFound = exceptionLines.find(line => line.match(/\tat Script1\.run\(Script1\.groovy:(\d+)\)$/))
      if (scriptLineFound) {
        const lineNumber = scriptLineFound.slice(scriptLineFound.indexOf(':') + 1, scriptLineFound.length - 1)

        const exceptionMessage = exceptionLines.filter(line => line.indexOf('\t') === -1).join('\n')
        this.addErrorHint({
          line: parseInt(lineNumber) - 1,
          ch: 0
        }, exceptionMessage)
      }
    }
  }

  addErrorHint (position: CodeMirror.Position, errorText?: string) {
    this.codeMirror.setCursor(position)
    this.codeMirror.focus()
    if (errorText) {
      this.lintErrors.push({
        from: position,
        to: CodeMirror.Pos(position.line, position.ch + 1),
        message: errorText,
        severity: 'error'
      })
      this.codeMirror.performLint()
    }
  }

  public clearErrors () {
    this.lintErrors = []
    this.codeMirror.performLint()
  }

  public loadFromUrl () {
    const queryParams = new URLSearchParams(location.search)
    if (queryParams.has('code')) {
      this.setCode(decodeUrlSafe(queryParams.get('code')))
    } else if (queryParams.has('codez')) {
      decompressFromBase64(queryParams.get('codez'))
        .then(code => this.setCode(code))
    } else if (queryParams.has('gist')) {
      loadGist(queryParams.get('gist'))
        .subscribe(gistCode => this.setCode(gistCode))
    } else if (queryParams.has('github')) {
      loadGithubFile(queryParams.get('github'))
        .subscribe(githubCode => this.setCode(githubCode))
    }
  }
}

export class OutputEditor {
  private codeMirror: CodeMirror.EditorFromTextArea

  constructor (codeArea: HTMLTextAreaElement) {
    this.codeMirror = this.createOutput(codeArea)
  }

  createOutput (outputArea: HTMLTextAreaElement) {
    return CodeMirror.fromTextArea(<HTMLTextAreaElement>outputArea, <any>{
      readOnly: true,
      foldGutter: true,
      gutters: ['CodeMirror-foldgutter'],
      lineWrapping: true
    })
  }

  public setContent (code: string) {
    this.codeMirror.setValue(code)
    this.codeMirror.refresh()
  }
}
