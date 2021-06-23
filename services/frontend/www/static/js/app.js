const codeArea = document.getElementById('code');
const codeCM = CodeMirror.fromTextArea(codeArea, {
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

const outputArea = document.getElementById("output");
const outputCM = CodeMirror.fromTextArea(outputArea, {
    readOnly: true,
    foldGutter: true,
    gutters: ["CodeMirror-foldgutter"],
    lineWrapping: true,
});

let executionResult = {out: "", err: "", result: null};

function clearOutput() {
    executionResult.out = "";
    executionResult.err = "";
    executionResult.result = null;
    outputCM.setValue("");
}

function updateOutput() {
    if (tabOutput.parentNode.classList.contains("is-active")) {
        outputCM.setValue(executionResult.out || "");
    } else if (tabResult.parentNode.classList.contains("is-active")) {
        if (executionResult.result !== null && executionResult.result !== undefined) {
            console.log("Type of result: ", typeof executionResult.result);
            if ((typeof executionResult.result) === 'string') {
                outputCM.setValue(executionResult.result);
            } else {
                outputCM.setValue(JSON.stringify(executionResult.result, null, 2));
            }
        } else {
            outputCM.setValue("null");
        }
    } else if (tabError.parentNode.classList.contains("is-active")) {
        outputCM.setValue(executionResult.err || "");
    } 
}

const tabOutput = document.getElementById("tabOutput");
tabOutput.onclick = function(evt) {
    tabOutput.parentNode.classList.add("is-active");
    tabResult.parentNode.classList.remove("is-active");
    tabError.parentNode.classList.remove("is-active");
    updateOutput();
};
const tabResult = document.getElementById("tabResult");
tabResult.onclick = function(evt) {
    tabResult.parentNode.classList.add("is-active");
    tabOutput.parentNode.classList.remove("is-active");
    tabError.parentNode.classList.remove("is-active");
    updateOutput();

};
const tabError = document.getElementById("tabError");
tabError.onclick = function(evt) {
    tabError.parentNode.classList.add("is-active");
    tabOutput.parentNode.classList.remove("is-active");
    tabResult.parentNode.classList.remove("is-active");
    updateOutput();
};

const executeButton = document.getElementById("execute");
executeButton.onclick = async function(event) {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");

    clearOutput();
    const groovyVersion = document.getElementById("version").value;
    const response = await fetch(`https://europe-west1-gwc-experiment.cloudfunctions.net/${groovyVersion}`, { 
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            code: codeCM.getValue()
        })
    });
    
    executionResult = { out: "", err: "", result: null };
    if (response.ok) {
        executionResult = await response.json();
        if (executionResult.err) {
          tabError.click();

          // check if it's a syntax error
          const lineColInfo = executionResult.err.match(/.*@ line (\d+), column (\d+).$/);
          if (lineColInfo && lineColInfo.length >= 3) {
            codeCM.setCursor({line: parseInt(lineColInfo[1]) - 1, ch: parseInt(lineColInfo[2]) - 1});
            codeCM.focus();
          } else { // check if it's an exception
            const exceptionLines = executionResult.err.split('\n');
            const scriptLineFound = exceptionLines.find(line => line.match(/\tat Script1\.run\(Script1\.groovy:(\d+)\)$/));
            if (scriptLineFound) {
              const lineNumber = scriptLineFound.slice(scriptLineFound.indexOf(':') + 1, scriptLineFound.length - 1);
              codeCM.setCursor({line: parseInt(lineNumber) - 1, ch: 0});
              codeCM.focus();
            }
          }
        } else if (executionResult.out) {
          tabOutput.click();
        } else if (executionResult.result) {
          tabResult.click();
        }
        console.log(executionResult);
    } else {
        console.log("Response NOT OK");
        executionResult = { out: "", err: "An error occured while sending the Groovy script for execution", result: null };
    }
    updateOutput();
};

const queryParams = new URLSearchParams(location.search)
if (queryParams.has("code")) {
    codeCM.setValue(atob(queryParams.get("code")))
} else if(queryParams.has("gist")) {
    const {loadGist} = await import("./github.js");
    const gistCode = await loadGist(queryParams.get("gist"));
    codeCM.setValue(gistCode);
}
