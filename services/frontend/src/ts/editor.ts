import {StreamLanguage} from "@codemirror/stream-parser"
import {groovy} from "@codemirror/legacy-modes/mode/groovy"
import {basicSetup, EditorState, EditorView} from "@codemirror/basic-setup"
import {Compartment} from "@codemirror/state";
import {foldGutter} from "@codemirror/fold";
import {highlightActiveLineGutter, lineNumbers} from "@codemirror/gutter";
import {bracketMatching} from "@codemirror/matchbrackets";
import {closeBrackets} from "@codemirror/closebrackets";

const tabSize = new Compartment
const state = EditorState.create({
    extensions: [
        basicSetup, StreamLanguage.define(groovy),
        tabSize.of(EditorState.tabSize.of(4)),
        foldGutter(),
        lineNumbers(),
        bracketMatching(),
        closeBrackets(),
        highlightActiveLineGutter()
    ]
})
export const view = new EditorView({
    state,
    parent: document.querySelector("#code")
})
