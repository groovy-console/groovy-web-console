import { decodeUrlSafe, decompressFromBase64 } from './compression'
import { loadGist, loadGithubFile } from './github'
import {
  BehaviorSubject,
  debounceTime,
  distinctUntilChanged,
  filter,
  from, mergeWith,
  Observable,
  of,
  Subject
} from 'rxjs'
import { concatMap, tap } from 'rxjs/operators'
import { loadCodeFromQuestion } from './stackoverflow'
import { HistoryService } from './history'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection, ViewUpdate
} from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { Diagnostic, linter, lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint'
import { oneDark } from '@codemirror/theme-one-dark'
import { ThemeColor } from './types'
import { tomorrow } from 'thememirror'

export type EditorHistoryState = 'saved' | 'unsaved'

abstract class ThemeableEditor {
  private currentThemeColor: ThemeColor
  private themeCompartment = new Compartment()

  protected constructor (initialThemeColor: ThemeColor) {
    this.currentThemeColor = initialThemeColor
  }

  protected abstract get codeMirror (): EditorView

  private getTheme (themeColor: ThemeColor) {
    return (themeColor === 'light') ? tomorrow : oneDark
  }

  public switchTheme (themeColor: ThemeColor) {
    if (this.currentThemeColor === themeColor) return
    this.currentThemeColor = themeColor
    this.codeMirror.dispatch({ effects: this.themeCompartment.reconfigure(this.getTheme(themeColor)) })
  }

  protected themeExtension () {
    return this.themeCompartment.of(this.getTheme(this.currentThemeColor))
  }
}

export class CodeEditor extends ThemeableEditor {
  protected codeMirror: EditorView
  private lintErrors: Diagnostic[] = []
  private historyService = new HistoryService()
  private editorChanges$ = new Subject<String>()
  private editorFocusChanges$ = new Subject<boolean>()
  private editorState$ = new BehaviorSubject<EditorHistoryState>('saved')
  private editorStateObservable = this.editorState$.pipe(distinctUntilChanged())

  constructor (codeArea: HTMLElement, theme: ThemeColor) {
    super(theme)
    this.codeMirror = this.createEditor(codeArea)
    this.enablePersistence()
    this.setCode(this.historyService.getEditorContent())
    this.editorChanges$.subscribe(() => {
      // clear errors when the user changes the editor,
      // as we don't have a way to check the correctness locally
      this.clearErrors()
    })
  }

  private enablePersistence () {
    // Observable for editor changes
    const editorChanges$ = this.editorChanges$.pipe(
      tap(() => {
        this.editorState$.next('unsaved')
      }),
      debounceTime(3000) // Wait for 3 seconds of inactivity
    )

    // Observable for editor blur event
    const editorBlur$ = this.editorFocusChanges$.pipe(
      filter(hasFocus => !hasFocus)
    )

    editorChanges$.pipe(
      mergeWith(editorBlur$),
      tap(() => {
        this.historyService.storeEditorContent(this.getCode())
        this.editorState$.next('saved')
      })
    ).subscribe()
  }

  private posToOffset (line: number, col: number) {
    return this.codeMirror.state.doc.line(line + 1).from + col
  }

  private createEditor (parentContainer: HTMLElement) {
    return new EditorView({
      parent: parentContainer,
      extensions: [
        StreamLanguage.define(groovy),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        linter(__ => this.lintErrors, { delay: 0 }),
        lintGutter(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap
        ]),
        this.themeExtension(),
        EditorView.updateListener.of(update => this.updateListener(update))
      ]
    })
  }

  private updateListener (update: ViewUpdate) {
    console.debug('Editor update', update)
    if (update.docChanged) {
      this.editorChanges$.next('update')
    }
    if (update.focusChanged) {
      this.editorFocusChanges$.next(update.view.hasFocus)
    }
  }

  public getCode () {
    return this.codeMirror.state.doc.toString()
  }

  public setCode (code: string) {
    this.clearErrors()
    this.codeMirror.dispatch({
      changes: { from: 0, to: this.codeMirror.state.doc.length, insert: code }
    })
  }

  public getEditorState (): Observable<EditorHistoryState> {
    return this.editorStateObservable
  }

  public handleErrorResult (result: string) {
    this.lintErrors = []
    // check if it's a syntax error
    const lineColInfo = result.match(/.*@ line (\d+), column (\d+).$/)
    if (lineColInfo && lineColInfo.length >= 3) {
      const from = this.posToOffset(parseInt(lineColInfo[1]) - 1, parseInt(lineColInfo[2]) - 1)
      this.addErrorHint(from, from + 1, result)
    } else { // check if it's an exception
      const exceptionLines = result.split('\n')
      const scriptLineFound = exceptionLines.find(line => line.match(/\tat Script1\.run\(Script1\.groovy:(\d+)\)$/))
      if (scriptLineFound) {
        const lineNumber = scriptLineFound.slice(scriptLineFound.indexOf(':') + 1, scriptLineFound.length - 1)

        const exceptionMessage = exceptionLines.filter(line => line.indexOf('\t') === -1).join('\n')
        const from = this.posToOffset(parseInt(lineNumber) - 1, 0)
        this.addErrorHint(from, from + 1, exceptionMessage)
      }
    }
  }

  addErrorHint (from: number, to: number, errorText?: string) {
    this.codeMirror.focus()
    if (errorText) {
      this.lintErrors.push({
        from,
        to,
        message: errorText,
        severity: 'error'
      })
      this.codeMirror.dispatch(
        { selection: { anchor: from } },
        setDiagnostics(this.codeMirror.state, this.lintErrors) // manually set the diagnostics, otherwise the gutter won't show immediately
      )
    }
  }

  public clearErrors () {
    if (this.lintErrors.length > 0) {
      this.lintErrors = []
      this.codeMirror.dispatch(setDiagnostics(this.codeMirror.state, []))
    }
  }

  public loadFromUrl (query:string) {
    return of(new URLSearchParams(query))
      .pipe(
        concatMap(queryParams => {
          if (queryParams.has('code')) {
            return of(decodeUrlSafe(queryParams.get('code')))
          } else if (queryParams.has('codez')) {
            return from(decompressFromBase64(queryParams.get('codez')))
          } else if (queryParams.has('gist')) {
            return loadGist(queryParams.get('gist'))
          } else if (queryParams.has('github')) {
            return loadGithubFile(queryParams.get('github'))
          } else if (queryParams.has('stackoverflow')) {
            return loadCodeFromQuestion(queryParams.get('stackoverflow'))
          }
          return of('')
        }),
        tap(code => {
          if (code !== '') {
            this.setCode(code)
          }
        })
      )
  }
}

export class OutputEditor extends ThemeableEditor {
  protected codeMirror: EditorView

  constructor (parentContainer: HTMLElement, theme: ThemeColor) {
    super(theme)
    this.codeMirror = this.createOutput(parentContainer)
  }

  createOutput (parentContainer: HTMLElement) {
    return new EditorView({
      parent: parentContainer,
      extensions: [
        StreamLanguage.define(groovy),
        lineNumbers(),
        foldGutter(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        this.themeExtension()
      ]
    })
  }

  public setContent (code: string) {
    this.codeMirror.dispatch({
      changes: { from: 0, to: this.codeMirror.state.doc.length, insert: code }
    })
  }
}
