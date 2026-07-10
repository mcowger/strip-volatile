import { describe, expect, it } from "vitest";
import {
    readVolatileKeysFromConfig,
    stripVolatileKeysFromSettings,
} from "./index.js";

const CONFIG_KEY = "stripVolatileKeys";

describe("readVolatileKeysFromConfig", () => {
    it("returns default keys when config is absent", () => {
        const keys = readVolatileKeysFromConfig({});
        expect(keys.has("defaultModel")).toBe(true);
        expect(keys.has("defaultProvider")).toBe(true);
        expect(keys.has("lastChangelogVersion")).toBe(true);
        expect(keys.has(CONFIG_KEY)).toBe(false);
        expect(keys.has("theme")).toBe(false);
    });

    it("returns default keys when config is an empty array", () => {
        const keys = readVolatileKeysFromConfig({
            stripVolatileKeys: [],
        });
        expect(keys.has("defaultModel")).toBe(true);
        expect(keys.has(CONFIG_KEY)).toBe(false);
    });

    it("uses configured keys when provided", () => {
        const keys = readVolatileKeysFromConfig({
            stripVolatileKeys: ["myCustomKey", "anotherKey"],
        });
        expect(keys.has("myCustomKey")).toBe(true);
        expect(keys.has("anotherKey")).toBe(true);
        expect(keys.has(CONFIG_KEY)).toBe(false);
        // Defaults should NOT be included when config is explicit
        expect(keys.has("defaultModel")).toBe(false);
    });

    it("ignores non-string entries in config array", () => {
        const keys = readVolatileKeysFromConfig({
            stripVolatileKeys: ["validKey", 42, null, "alsoValid"],
        });
        expect(keys.has("validKey")).toBe(true);
        expect(keys.has("alsoValid")).toBe(true);
        expect(keys.has("42")).toBe(false);
    });

    it("does not include the config key itself so config persists", () => {
        const keys = readVolatileKeysFromConfig({
            stripVolatileKeys: ["something"],
        });
        expect(keys.has(CONFIG_KEY)).toBe(false);
    });
});

describe("stripVolatileKeys logic", () => {
    it("strips default volatile keys from settings object", () => {
        const settings: Record<string, unknown> = {
            theme: "dark",
            defaultModel: "claude-opus-4-7",
            defaultProvider: "anthropic",
            lastChangelogVersion: "0.70.5",
            transport: "sse",
        };

        const changed = stripVolatileKeysFromSettings(settings);

        expect(changed).toBe(true);
        expect(settings).toEqual({ theme: "dark", transport: "sse" });
    });

    it("strips configured keys but preserves the config key itself", () => {
        const settings: Record<string, unknown> = {
            theme: "dark",
            myCustomKey: "should-be-removed",
            stripVolatileKeys: ["myCustomKey"],
        };

        stripVolatileKeysFromSettings(settings);

        expect(settings).toEqual({
            theme: "dark",
            stripVolatileKeys: ["myCustomKey"],
        });
        expect(settings.myCustomKey).toBeUndefined();
    });

    it("does not modify settings without volatile or configured keys", () => {
        const settings: Record<string, unknown> = {
            theme: "dark",
            transport: "sse",
        };

        const changed = stripVolatileKeysFromSettings(settings);

        expect(changed).toBe(false);
        expect(settings).toEqual({ theme: "dark", transport: "sse" });
    });
});
