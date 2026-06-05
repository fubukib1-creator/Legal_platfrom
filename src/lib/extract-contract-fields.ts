import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type ExtractedTrackingFields = {
  effectiveDate: Date | null;
  expiryDate: Date | null;
  renewalDecisionDeadline: Date | null;
  contractValue: string | null;
  revenueStamp: string | null;
  depositAmount: string | null;
  depositReturnDate: Date | null;
};

const isoDateOrNull = z
  .string()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const decimalStringOrNull = z
  .string()
  .nullable()
  .describe("");

const extractionSchema = z.object({
  effectiveDate: isoDateOrNull.describe(
    "The contract effective / commencement date as ISO 8601 (YYYY-MM-DD). Null if not stated.",
  ),
  expiryDate: isoDateOrNull.describe(
    "The contract expiry / end date as ISO 8601 (YYYY-MM-DD). Null if not stated.",
  ),
  renewalDecisionDeadline: isoDateOrNull.describe(
    "The latest date by which one party must give notice to terminate or continue, expressed as ISO 8601. Null if no such deadline appears.",
  ),
  contractValue: decimalStringOrNull.describe(
    "Total contract value / consideration as a numeric string (e.g. '1500000.00'), no currency symbol or commas. Null if not stated.",
  ),
  revenueStamp: decimalStringOrNull.describe(
    "Revenue stamp / stamp duty (อากรแสตมป์) amount as a numeric string. Null if not stated.",
  ),
  depositAmount: decimalStringOrNull.describe(
    "Security deposit / refundable advance amount as a numeric string (e.g. '50000.00'), no currency symbol or commas. Null if no deposit is mentioned.",
  ),
  depositReturnDate: isoDateOrNull.describe(
    "The date the deposit is to be refunded as ISO 8601. Null if not stated.",
  ),
});

const SYSTEM_PROMPT = `You extract post-signature lifecycle dates and amounts from signed legal contracts.

Return strict JSON matching the provided schema. Use null for any field that is not stated explicitly in the document — do NOT guess, infer, or compute. Dates must be ISO 8601 (YYYY-MM-DD). The deposit amount is a plain decimal string with no currency symbol and no thousands separator.`;

const USER_PROMPT = `Extract the lifecycle fields from the attached signed contract:

1. effectiveDate — when does this contract take effect / commence?
2. expiryDate — when does this contract end / expire?
3. renewalDecisionDeadline — by what date must one party notify the other to terminate (or to continue, if auto-renewal applies)?
4. contractValue — total contract value / consideration, as a number.
5. revenueStamp — revenue stamp / stamp duty (อากรแสตมป์) amount, as a number.
6. depositAmount — the security deposit / refundable advance amount, as a number.
7. depositReturnDate — when must the deposit be refunded?

If any field is not explicitly stated in the document, return null for it. Do not infer.`;

export async function extractTrackingFields(
  pdf: Buffer,
): Promise<ExtractedTrackingFields> {
  const empty: ExtractedTrackingFields = {
    effectiveDate: null,
    expiryDate: null,
    renewalDecisionDeadline: null,
    contractValue: null,
    revenueStamp: null,
    depositAmount: null,
    depositReturnDate: null,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return empty;
  }

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdf.toString("base64"),
            },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(extractionSchema),
    },
  });

  return response.parsed_output ?? empty;
}
