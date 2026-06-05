import { describe, it, expect } from "vitest";
import {
  CONTRACT_SORT_KEYS,
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  isContractSortKey,
  parseSortDir,
} from "@/lib/contract-sort";

describe("isContractSortKey", () => {
  it("accepts every value in CONTRACT_SORT_KEYS", () => {
    for (const k of CONTRACT_SORT_KEYS) {
      expect(isContractSortKey(k)).toBe(true);
    }
  });

  it("rejects values that aren't in the allow-list", () => {
    expect(isContractSortKey("contractValue")).toBe(false);
    expect(isContractSortKey("")).toBe(false);
    // SQL-injection-shaped input is rejected outright — the page falls back to
    // the default sort key, so the value never reaches Prisma.
    expect(isContractSortKey("id; DROP TABLE Contract;--")).toBe(false);
  });
});

describe("parseSortDir", () => {
  it("returns 'asc' only for the literal string 'asc'", () => {
    expect(parseSortDir("asc")).toBe("asc");
  });

  it("returns 'desc' for anything else (default)", () => {
    expect(parseSortDir("desc")).toBe("desc");
    expect(parseSortDir(undefined)).toBe("desc");
    expect(parseSortDir("")).toBe("desc");
    expect(parseSortDir("ASC")).toBe("desc");
    expect(parseSortDir("ascending")).toBe("desc");
  });
});

describe("defaults", () => {
  it("default sort key is updatedAt desc", () => {
    expect(DEFAULT_SORT_KEY).toBe("updatedAt");
    expect(DEFAULT_SORT_DIR).toBe("desc");
  });
});
