export declare class XlsxPasswordError extends Error {
    readonly code: "WRONG_PASSWORD";
    constructor();
}
/**
 * Decrypt an ECMA-376 Agile encrypted package when a password is given.
 * Returns the inner OOXML zip bytes. Throws WRONG_PASSWORD on failure.
 * Standard (RC4) encryption is rejected with ENCRYPTED_XLSX via the caller.
 */
export declare function decryptAgile(bytes: Uint8Array, password: string): Promise<Uint8Array>;
