import { resolve } from "node:path";

const cwd = resolve(import.meta.dir, "..");
const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  cwd,
  env: { ...process.env, API_PORT: "4318" },
  stdout: "inherit",
  stderr: "inherit",
});
const web = Bun.spawn(["bun", "x", "--no-install", "vite"], {
  cwd,
  stdout: "inherit",
  stderr: "inherit",
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const code = await Promise.race([api.exited, web.exited]);
stop();
process.exit(code);
