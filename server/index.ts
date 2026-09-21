import { config } from "./config";
import { handleRequest } from "./app";

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  fetch: handleRequest,
  maxRequestBodySize: 310000,
  idleTimeout: 180,
});
console.log(`Jev demo server ready at http://localhost:${server.port}`);
