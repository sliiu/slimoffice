export interface AuthHash {
    handoff?: string;
    totp?: string;
    oauthSignup?: {
        token: string;
        email: string;
        whitelist?: boolean;
    };
}
export declare function parseAuthHash(hash: string | undefined | null): AuthHash;
export declare function authHandoffHash(token: string): string;
export declare function authTotpHash(token: string): string;
export declare function authOauthSignupHash(token: string, email: string, opts?: {
    whitelist?: boolean;
}): string;
export declare function stripAuthQuery(params: URLSearchParams): void;
