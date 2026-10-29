import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authHandoffHash,
  authOauthSignupHash,
  authTotpHash,
  parseAuthHash,
  stripAuthQuery,
} from "./auth-hash.js";

describe("auth hash fragments", () => {
  it("round-trips handoff / totp / oauth signup", () => {
    assert.equal(parseAuthHash(`#${authHandoffHash("abc.def")}`).handoff, "abc.def");
    assert.equal(parseAuthHash(`#${authTotpHash("totp.jwt")}`).totp, "totp.jwt");
    assert.deepEqual(parseAuthHash(`#${authOauthSignupHash("s1", "ada@example.com")}`).oauthSignup, {
      token: "s1",
      email: "ada@example.com",
    });
  });

  it("ignores empty and unknown fragments", () => {
    assert.deepEqual(parseAuthHash(""), {});
    assert.deepEqual(parseAuthHash("#"), {});
    assert.equal(parseAuthHash("#ppt-oauth-signup=only-token").oauthSignup, undefined);
  });

  it("strips auth query keys", () => {
    const q = new URLSearchParams("token=a&totp_token=b&keep=1&oauth_signup_token=c&oauth_signup_email=d");
    stripAuthQuery(q);
    assert.equal(q.toString(), "keep=1");
  });
});
