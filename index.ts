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
import lockfile from "proper-lockfile";

/** Default keys to strip when `stripVolatileKeys` is not set in settings.json */
const DEFAULT_VOLATILE_KEYS = [
    "defaultModel",
    "defaultProvider",
    "lastChangelogVersion",
];

/** The settings.json key that configures which keys to strip */
const CONFIG_KEY = "stripVolatileKeys";

const LOCK_MAX_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 20;
const LOCK_ERROR_CODE = "ELOCKED";

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
export function readVolatileKeysFromConfig(
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

export function stripVolatileKeysFromSettings(
    settings: Record<string, unknown>,
): boolean {
    const volatileKeys = readVolatileKeysFromConfig(settings);
    let changed = false;

    for (const key of Object.keys(settings)) {
        if (volatileKeys.has(key)) {
            delete settings[key];
            changed = true;
        }
    }

    return changed;
}

function acquireSettingsLock(settingsPath: string): () => void {
    let lastError: unknown;

    for (let attempt = 1; attempt <= LOCK_MAX_ATTEMPTS; attempt++) {
        try {
            return lockfile.lockSync(settingsPath, { realpath: false });
        } catch (error) {
            const code =
                typeof error === "object" && error !== null && "code" in error
                    ? String(error.code)
                    : undefined;
            if (code !== LOCK_ERROR_CODE || attempt === LOCK_MAX_ATTEMPTS) {
                throw error;
            }
            lastError = error;

            const start = Date.now();
            while (Date.now() - start < LOCK_RETRY_DELAY_MS) {
                // Wait synchronously so cleanup remains ordered with Pi's synchronous lock.
            }
        }
    }

    throw lastError ?? new Error("Failed to acquire settings lock");
}

/**
 * Strip volatile keys from the global settings.json file.
 */
function stripVolatileKeys(): void {
    const settingsPath = getGlobalSettingsPath();

    if (!existsSync(settingsPath)) {
        return;
    }

    let release: (() => void) | undefined;
    try {
        release = acquireSettingsLock(settingsPath);
        const raw = readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw);

        if (stripVolatileKeysFromSettings(settings)) {
            writeFileSync(
                settingsPath,
                `${JSON.stringify(settings, null, 2)}\n`,
                "utf-8",
            );
        }
    } catch {
        // Silently ignore parse/write errors - don't disrupt pi's shutdown
    } finally {
        release?.();
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
