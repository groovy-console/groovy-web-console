export function encodeUrlSafe (bytes:string) {
  return btoa(bytes)
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, '') // Remove ending '='
}

export function decodeUrlSafe (base64:string) {
  return atob(base64
    .replace(/-/g, '+') // Convert '-' to '+'
    .replace(/_/g, '/') // Convert '_' to '/')
  )
}

function str2UInt8Array (str:string) {
  // Convert binary string to character-number array
  const charData = str.split('').map(function (x) {
    return x.charCodeAt(0)
  })

  // Turn number array into byte-array
  return new Uint8Array(charData)
}
function uint8ArrayToString (u8:string) { // TODO check whether to:string works now with pako
  return String.fromCharCode.apply(null, u8)
}

export async function compressToBase64 (value:string) {
  const pako = await import(/* webpackChunkName: "pako" */ 'pako')
  return encodeUrlSafe(uint8ArrayToString(pako.deflate(value, { to: 'string' })))
}

export async function decompressFromBase64 (value:string) {
  const pako = await import(/* webpackChunkName: "pako" */ 'pako')
  return pako.inflate(str2UInt8Array(decodeUrlSafe(value)), { to: 'string' })
}
