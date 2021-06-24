export interface ExecutionResult {
    out: string
    err: string
    result: string
}

export interface GistResponse {
    files: Map<string, GistFile>
}

export interface GistFile {
    truncated: boolean
    language: string
    content: string
}
