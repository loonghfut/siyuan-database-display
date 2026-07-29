import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sign } from "node:crypto";
import { resolve } from "node:path";

const userId = process.argv[2]?.trim();
const keyPath = resolve(".license/pro-license-private.pem");
if (!userId) {
    throw new Error("Usage: npm run issue-license -- <siyuan-user-id>");
}
if (!existsSync(keyPath)) {
    throw new Error("Missing .license/pro-license-private.pem. Run npm run generate-license-key first.");
}

const payload = { version: 1, userId, edition: "pro" };
const signature = sign(null, Buffer.from(JSON.stringify(payload)), readFileSync(keyPath)).toString("base64");
const licenseDir = resolve(".license/issued");
const filename = `${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}.license.json`;
const licensePath = resolve(licenseDir, filename);
mkdirSync(licenseDir, { recursive: true });
writeFileSync(licensePath, JSON.stringify({ payload, signature }, null, 2));
console.log(`License created: ${licensePath}`);
