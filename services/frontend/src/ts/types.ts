export interface ExecutionResult {
    out: string
    err: string
    result: string
}

// Minimal interface for the fields that interest us from the response
export interface GistResponse {
    files: Map<string, GistFile>
}

export interface GistFile {
    truncated: boolean
    language: string
    content: string
}
