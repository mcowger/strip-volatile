/**
 * strip-volatile - A pi extension that prevents volatile runtime data
 * from being persisted to settings.json.
 *
 * Reads the list of keys to strip from the `stripVolatileKeys` array
 * in settings.json. Falls back to built-in defaults if not configured.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Default keys to strip when `stripVolatileKeys` is not set in settings.json */
const DEFAULT_VOLATILE_KEYS = [
    "defaultModel",
    "defaultProvider",
    "lastChangelogVersion",
];

/** The settings.json key that configures which keys to strip */
const CONFIG_KEY = "stripVolatileKeys";

/**
 * Resolve the agent directory, matching pi's getAgentDir() behavior.
 * Respects PI_CODING_AGENT_DIR env var if set, otherwise ~/.pi/agent.
 */
function getAgentDir(): string {
    const envDir = process.env.PI_CODING_AGENT_DIR;
    if (envDir) {
        if (envDir === "~") return homedir();
        if (envDir.startsWith("~/")) return join(homedir(), envDir.slice(2));
        return envDir;
    }
    return join(homedir(), ".pi", "agent");
}

function getGlobalSettingsPath(): string {
    return join(getAgentDir(), "settings.json");
}

/**
 * Read the list of volatile keys from settings.json.
 * Uses the `stripVolatileKeys` array if present, otherwise falls back to defaults.
 */
function readVolatileKeysFromConfig(
    settings: Record<string, unknown>,
): Set<string> {
    const configured = settings[CONFIG_KEY];
    if (Array.isArray(configured) && configured.length > 0) {
        const keys = configured.filter(
            (k): k is string => typeof k === "string",
        );
        return new Set(keys);
    }
    return new Set(DEFAULT_VOLATILE_KEYS);
}

/**
 * Strip volatile keys from the global settings.json file.
 */
function stripVolatileKeys(): void {
    const settingsPath = getGlobalSettingsPath();

    if (!existsSync(settingsPath)) {
        return;
    }

    try {
        const raw = readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw);

        const volatileKeys = readVolatileKeysFromConfig(settings);

        let changed = false;
        for (const key of Object.keys(settings)) {
            if (volatileKeys.has(key)) {
                delete settings[key];
                changed = true;
            }
        }

        if (changed) {
            writeFileSync(
                settingsPath,
                `${JSON.stringify(settings, null, 2)}\n`,
                "utf-8",
            );
        }
    } catch {
        // Silently ignore parse/write errors - don't disrupt pi's shutdown
    }
}

export default function (pi: ExtensionAPI) {
    // Strip on startup to clean any keys that leaked in from a previous session
    pi.on("session_start", async () => {
        stripVolatileKeys();
    });

    // Strip when each agent loop starts and ends (idle boundaries, not per-message)
    pi.on("agent_start", async () => {
        stripVolatileKeys();
    });
    pi.on("agent_end", async () => {
        stripVolatileKeys();
    });

    // Strip on exit to ensure volatile keys never persist across sessions
    pi.on("session_shutdown", async () => {
        stripVolatileKeys();
    });
}
