import * as CodeMirror from "codemirror";
import {ExecutionResult} from "./types";
import {fromEvent} from "rxjs";
import {concatMap, debounceTime, tap} from "rxjs/operators";
import {executeScript} from "./groovy-console";
import {compressToBase64, decodeUrlSafe, decompressFromBase64} from "./compression";
import {loadGist, loadGithubFile} from "./github";

const codeArea = document.getElementById('code');
const outputArea = document.getElementById("output");
const version = document.getElementById("version") as HTMLSelectElement;
const executeButton = document.getElementById("execute");
const save = document.getElementById("save")
const tabOutput = document.getElementById("tabOutput");
const tabResult = document.getElementById("tabResult");
const tabError = document.getElementById("tabError");
const tabs = [tabOutput, tabResult, tabError];
let activeTab: HTMLElement;

let executionResult: ExecutionResult = {out: "", err: "", result: null};

const codeCM = CodeMirror.fromTextArea(<HTMLTextAreaElement>codeArea, <any>{ // need to cast to any, since generated types don't support extensions `matchBrackets`
    lineNumbers: true,
    mode: "groovy",
    tabSize: 4,
    indentUnit: 4,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    styleActiveLine: true,
});

const outputCM = CodeMirror.fromTextArea(<HTMLTextAreaElement>outputArea, <any>{
    readOnly: true,
    foldGutter: true,
    gutters: ["CodeMirror-foldgutter"],
    lineWrapping: true,
});


function clearOutput() {
    executionResult.out = "";
    executionResult.err = "";
    executionResult.result = null;
    outputCM.setValue("");
}

function updateOutput() {
    if (activeTab === tabOutput) {
        outputCM.setValue(executionResult.out || "");
    } else if (activeTab === tabResult) {
        if (executionResult.result !== null && executionResult.result !== undefined) {
            console.log("Type of result: ", typeof executionResult.result);
            if (typeof executionResult.result === 'string') {
                outputCM.setValue(executionResult.result);
            } else {
                outputCM.setValue(JSON.stringify(executionResult.result, null, 2));
            }
        } else {
            outputCM.setValue("null");
        }
    } else if (activeTab === tabError) {
        outputCM.setValue(executionResult.err || "");
    }
}

function handleExecutionResult(result: ExecutionResult) {
    if (result.err) {
        switchTab(tabError);
        // check if it's a syntax error
        const lineColInfo = result.err.match(/.*@ line (\d+), column (\d+).$/);
        if (lineColInfo && lineColInfo.length >= 3) {
            codeCM.setCursor({line: parseInt(lineColInfo[1]) - 1, ch: parseInt(lineColInfo[2]) - 1});
            codeCM.focus();
        } else { // check if it's an exception
            const exceptionLines = result.err.split('\n');
            const scriptLineFound = exceptionLines.find(line => line.match(/\tat Script1\.run\(Script1\.groovy:(\d+)\)$/));
            if (scriptLineFound) {
                const lineNumber = scriptLineFound.slice(scriptLineFound.indexOf(':') + 1, scriptLineFound.length - 1);
                codeCM.setCursor({line: parseInt(lineNumber) - 1, ch: 0});
                codeCM.focus();
            }
        }
    } else if (result.out) {
        switchTab(tabOutput);
    } else if (result.result) {
        switchTab(tabResult);
    }
    console.log(result);
}


function switchTab(active: HTMLElement) {
    [tabOutput, tabResult, tabError].forEach(e =>
        (e.parentNode as HTMLElement).classList.remove("is-active"));
    (active.parentNode as HTMLElement).classList.add("is-active");
    activeTab = active;
}

function addTabBehavior(tab: HTMLElement) {
    fromEvent(tab, 'click')
        .pipe(
            tap(e => switchTab(e.target as HTMLElement))
        ).subscribe(() => updateOutput());
}

export function initFromUrl() {
    const queryParams = new URLSearchParams(location.search)
    if (queryParams.has("code")) {
        codeCM.setValue(decodeUrlSafe(queryParams.get("code")))
    } else if (queryParams.has("codez")) {
        const code = decompressFromBase64(queryParams.get("codez"));
        codeCM.setValue(code);
    } else if (queryParams.has("gist")) {
        loadGist(queryParams.get("gist")).subscribe(gistCode => codeCM.setValue(gistCode));
    } else if (queryParams.has("github")) {
        loadGithubFile(queryParams.get("github")).subscribe(githubCode => codeCM.setValue(githubCode));
    }
}


export function initView() {
    fromEvent(executeButton, 'click')
        .pipe(
            tap(() => clearOutput()),
            concatMap(() => executeScript(version.value, codeCM.getValue())),
            tap(result => handleExecutionResult(result))
        )
        .subscribe({
            next: result => {
                executionResult = result;
                updateOutput()
            },
            error: err => {
                console.log("Response NOT OK", err);
                executionResult = {
                    out: "",
                    err: "An error occured while sending the Groovy script for execution",
                    result: null
                };
                updateOutput()
            }
        });

    fromEvent(save, 'click')
        .pipe(
            debounceTime(1000)
        ).subscribe(() => {
        const editorContent = codeCM.getValue();
        const codez = compressToBase64(editorContent);
        console.log("compressed", codez)
    });

    tabs.forEach(tab => addTabBehavior(tab));
    switchTab(tabOutput);
}
