import { describe, it, expect } from "vitest";
import {
  CONTRACT_COMPLEXITIES,
  CONTRACT_EXTENSION_FILTERS,
  isContractComplexity,
  isContractExtensionFilter,
} from "@/lib/contract-filters";

describe("isContractComplexity", () => {
  it("accepts every enum value", () => {
    for (const c of CONTRACT_COMPLEXITIES) {
      expect(isContractComplexity(c)).toBe(true);
    }
  });

  it("rejects unknown / malformed values", () => {
    expect(isContractComplexity("low")).toBe(false); // case-sensitive
    expect(isContractComplexity("CRITICAL")).toBe(false);
    expect(isContractComplexity("")).toBe(false);
    expect(isContractComplexity("LOW; DROP TABLE Contract;--")).toBe(false);
  });
});

describe("isContractExtensionFilter", () => {
  it("accepts only the two drill-down values", () => {
    for (const v of CONTRACT_EXTENSION_FILTERS) {
      expect(isContractExtensionFilter(v)).toBe(true);
    }
    expect(CONTRACT_EXTENSION_FILTERS).toEqual(["extended", "not_extended"]);
  });

  it("rejects anything else", () => {
    expect(isContractExtensionFilter("extended ")).toBe(false);
    expect(isContractExtensionFilter("notextended")).toBe(false);
    expect(isContractExtensionFilter("")).toBe(false);
  });
});
