export interface ExecutionInfo {
  executionTime: number
  groovyVersion: string
  spockVersion: string
}

export interface ExecutionResult {
  out: string
  err: string
  result: string
  info: ExecutionInfo
}

export interface GistFile {
  truncated: boolean
  language: string
  content: string
}

// Minimal interface for the fields that interest us from the response
export interface GistResponse {
  files: Map<string, GistFile>
}

export interface StackOverflowQuestion {
  title: string,
  tags: string[],
  body_markdown: string // eslint-disable-line camelcase
}

export interface StackOverflowResponse {
  items: StackOverflowQuestion[]
}

export type ThemeColor = 'light' | 'dark'
export type ColorMode = ThemeColor | 'system'

export interface User {
  login: string
  // eslint-disable-next-line camelcase
  avatar_url: string
}

export interface GistMetadata {
  id: string
  filename: string
  public: boolean
  ownerLogin: string | null
}

export interface ProxiedGistResponse {
  id: string
  filename: string
  code: string
  ownerLogin: string | null
  public: boolean
}

export interface SaveGistRequest {
  name: string
  public: boolean
  code: string
  output?: string
}

export interface UpdateGistRequest {
  filename: string
  code: string
  output?: string
}

export interface SavedGistResponse {
  id: string
  public: boolean
}
