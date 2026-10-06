import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Readings are personal, so they live in the home directory and never in the
// clone. TOKEN_RESET_HOME moves the folder. TOKEN_RESET_DATA moves the JSON file alone.
export function homeDir() {
  return process.env.TOKEN_RESET_HOME || path.join(os.homedir(), ".tokens-reset");
}

export function dataFile() {
  return process.env.TOKEN_RESET_DATA || path.join(homeDir(), "usage.json");
}

export function dashboardFile() {
  return path.join(homeDir(), "dashboard.html");
}

// How the person started this tool, for messages that name a next command.
export function selfCommand() {
  return /[\\/]node_modules[\\/]/.test(packageRoot) ? "tokens-reset" : "node bin/cli.js";
}
