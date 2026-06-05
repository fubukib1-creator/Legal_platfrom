import { describe, it, expect } from "vitest";
import {
  formatContractNumber,
  nextSequenceFromAll,
  parseContractNumber,
} from "@/lib/contract-number";

describe("formatContractNumber", () => {
  it("formats with three-digit padded sequence", () => {
    expect(
      formatContractNumber({ teamCode: "06", typeCode: "AN", year: 2026, sequence: 1 }),
    ).toBe("INP_06AN2026001");
    expect(
      formatContractNumber({ teamCode: "01", typeCode: "AM", year: 2026, sequence: 42 }),
    ).toBe("INP_01AM2026042");
    expect(
      formatContractNumber({ teamCode: "07", typeCode: "AO", year: 2026, sequence: 999 }),
    ).toBe("INP_07AO2026999");
  });

  it("rejects invalid teamCode", () => {
    expect(() =>
      formatContractNumber({ teamCode: "6", typeCode: "AN", year: 2026, sequence: 1 }),
    ).toThrow();
    expect(() =>
      formatContractNumber({ teamCode: "AA", typeCode: "AN", year: 2026, sequence: 1 }),
    ).toThrow();
  });

  it("rejects invalid typeCode", () => {
    expect(() =>
      formatContractNumber({ teamCode: "06", typeCode: "an", year: 2026, sequence: 1 }),
    ).toThrow();
    expect(() =>
      formatContractNumber({ teamCode: "06", typeCode: "ANN", year: 2026, sequence: 1 }),
    ).toThrow();
  });

  it("rejects invalid year and sequence", () => {
    expect(() =>
      formatContractNumber({ teamCode: "06", typeCode: "AN", year: 99, sequence: 1 }),
    ).toThrow();
    expect(() =>
      formatContractNumber({ teamCode: "06", typeCode: "AN", year: 2026, sequence: 0 }),
    ).toThrow();
    expect(() =>
      formatContractNumber({ teamCode: "06", typeCode: "AN", year: 2026, sequence: 1000 }),
    ).toThrow();
  });
});

describe("parseContractNumber", () => {
  it("parses valid numbers", () => {
    expect(parseContractNumber("INP_06AN2026001")).toEqual({
      teamCode: "06",
      typeCode: "AN",
      year: 2026,
      sequence: 1,
    });
    expect(parseContractNumber("INP_01AM2026042")).toEqual({
      teamCode: "01",
      typeCode: "AM",
      year: 2026,
      sequence: 42,
    });
    expect(parseContractNumber("INP_07AO2027999")).toEqual({
      teamCode: "07",
      typeCode: "AO",
      year: 2027,
      sequence: 999,
    });
  });

  it("returns null for invalid formats", () => {
    expect(parseContractNumber("CTR-2026-0001")).toBeNull();
    expect(parseContractNumber("INP_6AN2026001")).toBeNull();      // single-digit team
    expect(parseContractNumber("INP_06aN2026001")).toBeNull();     // lowercase type
    expect(parseContractNumber("INP_06ANN026001")).toBeNull();     // type too long
    expect(parseContractNumber("INP-06AN2026001")).toBeNull();     // wrong separator
    expect(parseContractNumber("")).toBeNull();
  });
});

describe("nextSequenceFromAll", () => {
  it("returns 1 when no contracts in the given year", () => {
    expect(nextSequenceFromAll([], 2026)).toBe(1);
    expect(nextSequenceFromAll(["INP_06AN2025999"], 2026)).toBe(1);
  });

  it("returns max+1 across team/type combinations within the same year", () => {
    expect(
      nextSequenceFromAll(
        ["INP_06AN2026001", "INP_01AM2026003", "INP_07AO2026002"],
        2026,
      ),
    ).toBe(4);
  });

  it("ignores other years when computing the next sequence", () => {
    expect(
      nextSequenceFromAll(
        ["INP_06AN2025900", "INP_01AM2027050", "INP_07AO2026005"],
        2026,
      ),
    ).toBe(6);
  });

  it("ignores garbage entries", () => {
    expect(
      nextSequenceFromAll(["garbage", "CTR-2026-0001", "INP_06AN2026007"], 2026),
    ).toBe(8);
  });

  it("round-trip: format(nextSeq([...]),...) sits one above the prior max", () => {
    const existing = ["INP_06AN2026007", "INP_01AM2026003"];
    const next = formatContractNumber({
      teamCode: "06",
      typeCode: "AN",
      year: 2026,
      sequence: nextSequenceFromAll(existing, 2026),
    });
    expect(next).toBe("INP_06AN2026008");
  });
});
