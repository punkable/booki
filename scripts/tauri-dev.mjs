/** Build or run the side-by-side Booki Dev edition. A normal `tauri build` stays Booki. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] === "dev" ? "dev" : "build";
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url)), mode, "--config", "src-tauri/tauri.dev.conf.json", ...process.argv.slice(3)],
  {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, BOOKI_EDITION: "dev", VITE_BOOKI_EDITION: "dev" },
  },
);
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => process.exit(code ?? 1));
