import assert from "node:assert";
import { NextRequest } from "next/server";
import { verifyAuthAndRateLimit } from "../src/lib/authRateLimit";

console.log("=== Testing Access Gate & Rate Limiting (Item 4) ===");

const TEST_SECRET = "test-secret-token-12345";
process.env.APP_ACCESS_TOKEN = TEST_SECRET;
process.env.NODE_ENV = "test";

// Test 1: No token provided -> 401 Unauthorized
console.log("\n[Test 1] Request with no access token (expected 401)...");
const reqNoToken = new NextRequest("http://localhost:3000/api/media?file=test.mp4", {
  method: "GET",
  headers: { "x-forwarded-for": "203.0.113.1" },
});
const resNoToken = verifyAuthAndRateLimit(reqNoToken);
assert.ok(resNoToken !== null, "Should block request without token");
assert.strictEqual(resNoToken.status, 401, "Status must be 401");
console.log("-> PASS: Blocked with HTTP 401 Unauthorized (no token)");

// Test 2: Wrong token provided -> 401 Unauthorized
console.log("\n[Test 2] Request with wrong access token (expected 401)...");
const reqWrongToken = new NextRequest("http://localhost:3000/api/media?file=test.mp4", {
  method: "GET",
  headers: {
    "x-app-access-token": "wrong-secret-token",
    "x-forwarded-for": "203.0.113.2",
  },
});
const resWrongToken = verifyAuthAndRateLimit(reqWrongToken);
assert.ok(resWrongToken !== null, "Should block request with wrong token");
assert.strictEqual(resWrongToken.status, 401, "Status must be 401");
console.log("-> PASS: Blocked with HTTP 401 Unauthorized (wrong token)");

// Test 3: Correct token via Header (x-app-access-token) -> 200 (null response = allowed)
console.log("\n[Test 3a] Request with correct token via header (expected allowed)...");
const reqCorrectHeader = new NextRequest("http://localhost:3000/api/media?file=test.mp4", {
  method: "GET",
  headers: {
    "x-app-access-token": TEST_SECRET,
    "x-forwarded-for": "203.0.113.3",
  },
});
const resCorrectHeader = verifyAuthAndRateLimit(reqCorrectHeader);
assert.strictEqual(resCorrectHeader, null, "Should allow request with correct header token");
console.log("-> PASS: Allowed through access gate via x-app-access-token header");

// Test 3b: Correct token via Cookie (app_access_token) for <video> elements -> allowed
console.log("\n[Test 3b] Request with correct token via Cookie for <video> elements (expected allowed)...");
const reqCorrectCookie = new NextRequest("http://localhost:3000/api/media?file=test.mp4", {
  method: "GET",
  headers: {
    cookie: `app_access_token=${TEST_SECRET}`,
    "x-forwarded-for": "203.0.113.4",
  },
});
const resCorrectCookie = verifyAuthAndRateLimit(reqCorrectCookie);
assert.strictEqual(resCorrectCookie, null, "Should allow request with correct cookie token");
console.log("-> PASS: Allowed through access gate via app_access_token cookie");

// Test 4: Rate limit exceeding 60 requests per minute -> 429 Too Many Requests
console.log("\n[Test 4] Rate limit: Sending 65 requests from same IP (expected 429 on >60)...");
const rateLimitedIp = "198.51.100.99";
let blockedWith429 = false;
let allowedCount = 0;
let blockedStatus = 0;

for (let i = 1; i <= 65; i++) {
  const req = new NextRequest("http://localhost:3000/api/test-keys", {
    method: "POST",
    headers: {
      "x-app-access-token": TEST_SECRET,
      "x-forwarded-for": rateLimitedIp,
    },
  });
  const res = verifyAuthAndRateLimit(req);
  if (res === null) {
    allowedCount++;
  } else {
    blockedWith429 = true;
    blockedStatus = res.status;
    break;
  }
}

assert.strictEqual(allowedCount, 60, "Must allow exactly 60 requests before rate limiting");
assert.strictEqual(blockedStatus, 429, "61st request must be blocked with HTTP 429");
console.log(`-> PASS: Exactly ${allowedCount} requests allowed; request #61 returned HTTP ${blockedStatus} Too Many Requests`);

// Test 5: Production fail closed when APP_ACCESS_TOKEN is unset
console.log("\n[Test 5] Production mode with APP_ACCESS_TOKEN unset (expected fail-closed 401)...");
delete process.env.APP_ACCESS_TOKEN;
process.env.NODE_ENV = "production";

const reqProdUnset = new NextRequest("http://localhost:3000/api/upload", {
  method: "POST",
  headers: { "x-forwarded-for": "203.0.113.50" },
});
const resProdUnset = verifyAuthAndRateLimit(reqProdUnset);
assert.ok(resProdUnset !== null, "Must fail closed in production when APP_ACCESS_TOKEN is unset");
assert.strictEqual(resProdUnset.status, 401, "Status must be 401 in production when unset");
console.log("-> PASS: Production mode with unset APP_ACCESS_TOKEN failed closed with HTTP 401");

// Restore env
delete process.env.APP_ACCESS_TOKEN;
process.env.NODE_ENV = "test";

console.log("\nALL ACCESS GATE TESTS PASSED!\n");
