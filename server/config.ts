import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { Health } from "../shared/api";

export const projectRoot = resolve(import.meta.dir, "..");
const varsPath = resolve(projectRoot, ".dev.vars");
const vars = existsSync(varsPath) ? parse(readFileSync(varsPath)) : {};
const env = (key: string, fallback = "") => process.env[key] || vars[key] || fallback;

export const config = {
  jevToken: env("JEV_TOKEN", env("TYPESAFE_API_KEY")),
  openaiKey: env("OPENAI_API_KEY"),
  anthropicKey: env("ANTHROPIC_API_KEY"),
  jevModel: env("JEV_MODEL", "jev-1.13.0"),
  openaiModel: env("OPENAI_MODEL", "gpt-6-astra"),
  anthropicModel: env("ANTHROPIC_MODEL", "claude-sonnet-5"),
  changelogModel: env("CHANGELOG_MODEL", "claude-haiku-4-5-20251001"),
  port: Number(env("API_PORT", env("PORT", "4317"))),
};

export const health: Health = {
  jev: { configured: Boolean(config.jevToken), model: config.jevModel },
  openai: { configured: Boolean(config.openaiKey), model: config.openaiModel },
  anthropic: { configured: Boolean(config.anthropicKey), model: config.anthropicModel },
};
