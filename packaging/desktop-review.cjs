/* eslint-disable @typescript-eslint/no-require-imports */
process.env.MOTION_DESKTOP_REVIEW = "1";
if (process.env.MOTION_REVIEW_SMOKE === "1") {
  const fs = require("node:fs"),
    path = require("node:path"),
    crypto = require("node:crypto");
  const root = path.resolve(__dirname, "../.data/review/desktop");
  fs.mkdirSync(root, { recursive: true });
  const keys = crypto.generateKeyPairSync("ed25519");
  global.__motionReviewSigningKey = keys.privateKey;
  const keyPath = path.join(root, "test-update-public.pem");
  fs.writeFileSync(
    keyPath,
    keys.publicKey.export({ type: "spki", format: "pem" }),
  );
  process.env.MOTION_REVIEW_UPDATE_PUBLIC_KEY = keyPath;
}
require("./electron-main.cjs");
