import pako from "https://cdn.jsdelivr.net/npm/pako@2.0.3/dist/pako.esm.mjs"

export function encodeUrlSafe(bytes) {
    return btoa(bytes)
        .replace(/\+/g, '-') // Convert '+' to '-'
        .replace(/\//g, '_') // Convert '/' to '_'
        .replace(/=+$/, ''); // Remove ending '='
}

export function decodeUrlSafe(base64) {
    return atob(base64
        .replace(/-/g, '+') // Convert '-' to '+'
        .replace(/_/g, '/') // Convert '_' to '/')
    );
}


function str2UInt8Array(str) {
    // Convert binary string to character-number array
    const charData = str.split('').map(function (x) {
        return x.charCodeAt(0);
    });

    // Turn number array into byte-array
    return new Uint8Array(charData)
}
function uint8ArrayToString (u8) {
    return String.fromCharCode.apply(null, u8);
}

export function compressToBase64(value) {
    return encodeUrlSafe(uint8ArrayToString(pako.deflate(value, { to: 'string' })))
}

export function decompressFromBase64(value) {
    return pako.inflate(str2UInt8Array(decodeUrlSafe(value)), {to: 'string'});
}
