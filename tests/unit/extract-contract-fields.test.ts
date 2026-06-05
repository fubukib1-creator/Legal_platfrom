import { describe, it, expect } from "vitest";
import {
  extractTrackingFields,
  type ExtractedTrackingFields,
} from "@/lib/extract-contract-fields";

describe("extractTrackingFields", () => {
  it("returns the full empty shape when ANTHROPIC_API_KEY is unset", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await extractTrackingFields(Buffer.from([]));
      const expected: ExtractedTrackingFields = {
        effectiveDate: null,
        expiryDate: null,
        renewalDecisionDeadline: null,
        contractValue: null,
        revenueStamp: null,
        depositAmount: null,
        depositReturnDate: null,
      };
      expect(r).toEqual(expected);
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("ExtractedTrackingFields includes the 3 new tracking fields", () => {
    const sample: ExtractedTrackingFields = {
      effectiveDate: new Date("2026-01-01"),
      expiryDate: new Date("2027-01-01"),
      renewalDecisionDeadline: new Date("2026-11-01"),
      contractValue: "1000000.00",
      revenueStamp: "1000.00",
      depositAmount: "50000.00",
      depositReturnDate: new Date("2027-02-01"),
    };
    expect(sample.effectiveDate).toBeInstanceOf(Date);
    expect(sample.contractValue).toMatch(/^\d+\.\d{2}$/);
    expect(sample.revenueStamp).toMatch(/^\d+\.\d{2}$/);
  });
});
