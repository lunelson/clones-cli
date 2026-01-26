import { describe, it, expect } from "vitest";
import { normalizeRegistry, normalizeLocalState } from "../../src/lib/schema.js";

describe("normalizeRegistry", () => {
  it("drops unknown fields and defaults invalid values", () => {
    const raw = {
      version: "1.0.0",
      extra: "field",
      repos: [
        {
          id: "github.com:owner/repo",
          host: "github.com",
          owner: "owner",
          repo: "repo",
          cloneUrl: "https://github.com/owner/repo.git",
          defaultRemoteName: "origin",
          updateStrategy: "weird",
          submodules: "none",
          lfs: "auto",
          addedAt: "2026-01-01T00:00:00Z",
          managed: "yes",
          addedBy: "manual",
          tags: ["ok", 42],
        },
      ],
    };

    const normalized = normalizeRegistry(raw);

    expect(normalized.data.repos[0].updateStrategy).toBe("hard-reset");
    expect(normalized.data.repos[0].managed).toBe(true);
    expect(normalized.data.repos[0].tags).toEqual(["ok"]);
    expect((normalized.data.repos[0] as any).addedBy).toBeUndefined();
    expect(normalized.issues.length).toBeGreaterThan(0);
  });
});

describe("normalizeLocalState", () => {
  it("drops unknown fields and invalid repo state", () => {
    const raw = {
      version: "1.0.0",
      lastSyncRun: 123,
      extra: "field",
      repos: {
        "github.com:owner/repo": {
          lastSyncedAt: "2026-01-01T00:00:00Z",
          extraField: true,
        },
        "github.com:owner/bad": "invalid",
      },
    };

    const normalized = normalizeLocalState(raw);

    expect(normalized.data.lastSyncRun).toBeUndefined();
    expect(normalized.data.repos["github.com:owner/repo"].lastSyncedAt).toBe(
      "2026-01-01T00:00:00Z"
    );
    expect(normalized.data.repos["github.com:owner/bad"]).toBeUndefined();
    expect(normalized.issues.length).toBeGreaterThan(0);
  });
});
