import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** nginx only allows the inline theme script whose SHA-256 is in its Content-Security-Policy. If index.html changes,
 * this fails until the hash in docker/nginx.conf is updated, instead of the theme silently breaking in production. */
test("CSP script hash matches the inline script in index.html", () => {
  const root = path.resolve(__dirname, "../../..");
  const html = readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const nginx = readFileSync(path.join(root, "docker/nginx.conf"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(scripts).toHaveLength(1);
  const hash = createHash("sha256").update(scripts[0], "utf8").digest("base64");
  expect(nginx).toContain(`'sha256-${hash}'`);
});
