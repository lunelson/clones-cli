import { describe, it, expect } from "vitest";
import {
  parseGitUrl,
  generateRepoId,
  isValidGitUrl,
} from "../../src/lib/url-parser.js";

describe("parseGitUrl", () => {
  describe("SSH URLs", () => {
    it("parses standard SSH URL with .git suffix", () => {
      const result = parseGitUrl("git@github.com:owner/repo.git");

      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "git@github.com:owner/repo.git",
      });
    });

    it("parses SSH URL without .git suffix", () => {
      const result = parseGitUrl("git@github.com:owner/repo");

      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "git@github.com:owner/repo.git",
      });
    });

    it("parses GitLab SSH URL", () => {
      const result = parseGitUrl("git@gitlab.com:company/project.git");

      expect(result).toEqual({
        host: "gitlab.com",
        owner: "company",
        repo: "project",
        cloneUrl: "git@gitlab.com:company/project.git",
      });
    });

    it("parses custom host SSH URL", () => {
      const result = parseGitUrl("git@git.company.com:team/app.git");

      expect(result).toEqual({
        host: "git.company.com",
        owner: "team",
        repo: "app",
        cloneUrl: "git@git.company.com:team/app.git",
      });
    });
  });

  describe("HTTPS URLs", () => {
    it("parses standard HTTPS URL with .git suffix", () => {
      const result = parseGitUrl("https://github.com/owner/repo.git");

      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "https://github.com/owner/repo.git",
      });
    });

    it("parses HTTPS URL without .git suffix", () => {
      const result = parseGitUrl("https://github.com/owner/repo");

      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "https://github.com/owner/repo.git",
      });
    });

    it("parses HTTP URL", () => {
      const result = parseGitUrl("http://github.com/owner/repo.git");

      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "http://github.com/owner/repo.git",
      });
    });

    it("parses Bitbucket HTTPS URL", () => {
      const result = parseGitUrl("https://bitbucket.org/team/project.git");

      expect(result).toEqual({
        host: "bitbucket.org",
        owner: "team",
        repo: "project",
        cloneUrl: "https://bitbucket.org/team/project.git",
      });
    });
  });

  describe("edge cases", () => {
    it("trims whitespace", () => {
      const result = parseGitUrl("  https://github.com/owner/repo.git  ");

      expect(result.owner).toBe("owner");
      expect(result.repo).toBe("repo");
    });

    it("throws on invalid URL format", () => {
      expect(() => parseGitUrl("not-a-url")).toThrow("Invalid Git URL format");
    });

    it("throws on bare domain", () => {
      expect(() => parseGitUrl("https://github.com")).toThrow(
        "Invalid Git URL format"
      );
    });

    it("throws on URL with only owner", () => {
      expect(() => parseGitUrl("https://github.com/owner")).toThrow(
        "Invalid Git URL format"
      );
    });
  });
});

describe("generateRepoId", () => {
  it("generates ID from parsed URL", () => {
    const parsed = parseGitUrl("https://github.com/owner/repo.git");
    const id = generateRepoId(parsed);

    expect(id).toBe("github.com:owner/repo");
  });

  it("includes host in ID for uniqueness", () => {
    const github = parseGitUrl("https://github.com/owner/repo.git");
    const gitlab = parseGitUrl("https://gitlab.com/owner/repo.git");

    expect(generateRepoId(github)).not.toBe(generateRepoId(gitlab));
  });
});

describe("isValidGitUrl", () => {
  it("returns true for valid SSH URL", () => {
    expect(isValidGitUrl("git@github.com:owner/repo.git")).toBe(true);
  });

  it("returns true for valid HTTPS URL", () => {
    expect(isValidGitUrl("https://github.com/owner/repo.git")).toBe(true);
  });

  it("returns false for invalid URL", () => {
    expect(isValidGitUrl("not-a-url")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidGitUrl("")).toBe(false);
  });
});
