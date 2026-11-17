// Sobe os serviços simulados e o servidor local, roda os testes e encerra tudo.
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const procs = [];
const start = (cmd, args, env = {}) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  p.stdout.on("data", (d) => process.env.DEBUG && process.stdout.write(d));
  p.stderr.on("data", (d) => process.env.DEBUG && process.stderr.write(d));
  procs.push(p);
  return p;
};
const waitFor = async (url, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`timeout esperando ${url}`);
};

// Banco local limpo a cada execução
rmSync(".wrangler/state", { recursive: true, force: true });
const mig = spawn("npx", ["wrangler", "d1", "migrations", "apply", "dash-idiomas", "--local"], { stdio: "ignore" });
await new Promise((r) => mig.on("exit", r));

start("node", ["tests/mock-services.mjs"]);
start("npx", ["wrangler", "dev", "--port", "8787", "--ip", "127.0.0.1"]);
let code = 1;
try {
  await waitFor("http://127.0.0.1:9911/__state");
  await waitFor("http://127.0.0.1:8787/");
  const extra = process.argv.slice(2);
  const t = spawn("node", ["--test", ...(extra.length ? extra : ["tests/api.test.mjs"])], { stdio: "inherit" });
  code = await new Promise((r) => t.on("exit", r));
} finally {
  procs.forEach((p) => { try { process.kill(-p.pid, "SIGTERM"); } catch {} });
}
process.exit(code);
