import { z } from "zod";
import { env } from "./env.js";
import { ApiException, ErrorCode } from "./errors.js";
import { IdentificationSchema, type Identification } from "../../src/types/index.js";

/** Raw shape we ask Gemini to return. Kept separate from our domain schema so a
 *  model output change can't silently corrupt downstream contracts. */
const GeminiRawSchema = z.object({
  brand: z.string(),
  model_family: z.string(),
  reference_number: z.string().nullable(),
  confidence_score: z.number().min(0).max(1),
  possible_matches: z
    .array(
      z.object({
        brand: z.string(),
        model_family: z.string(),
        reference_number: z.string().nullable(),
        confidence_score: z.number().min(0).max(1),
      })
    )
    .max(5),
  authenticity: z.object({
    level: z.enum(["none", "review_suggested", "high_caution"]),
    note: z.string(),
  }),
});

const PROMPT_SINGLE = `You are an expert horologist. Identify the wristwatch in the image (the dial/front).
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  }
}
Rules:
- FIRST look for any text, logo, or wordmark printed/engraved on the dial, bezel, or case — this is the
  strongest signal for brand. Read it literally; do not guess a different brand than what is written.
- Do NOT fabricate reference numbers. If not clearly readable, use null.
- Lower confidence_score when the image is blurry, partial, or ambiguous.
- Output ONLY the JSON object, no markdown, no prose.`;

const PROMPT_WITH_BACK = `You are an expert horologist. Identify the wristwatch from these two images:
the FIRST image is the dial/front, the SECOND image is the case back.
Return STRICT JSON only, matching this schema exactly:
{
  "brand": string,                       // best-guess brand, or "Unknown"
  "model_family": string,                // e.g. "Submariner", or "Unknown"
  "reference_number": string | null,     // ONLY if visibly legible; else null. NEVER invent one.
  "confidence_score": number,            // 0..1 overall confidence in brand+model_family
  "possible_matches": [                  // up to 5 alternatives, most likely first
    { "brand": string, "model_family": string, "reference_number": string | null, "confidence_score": number }
  ],
  "authenticity": {                      // ADVISORY only, never definitive
    "level": "none" | "review_suggested" | "high_caution",
    "note": string                       // short, hedged observation; do not assert "fake"
  }
}
Rules:
- FIRST look for any text, logo, or wordmark printed/engraved on the dial, bezel, or case — this is the
  strongest signal for brand. Read it literally; do not guess a different brand than what is written.
- Use the case back to cross-check authenticity: look for a serial/model number, hallmark or "Swiss Made"
  style stamps, engraving quality and font consistency, and whether case-back text/markings plausibly match
  the brand read from the front. Inconsistency between front branding and case-back markings should raise
  authenticity_caution toward "review_suggested" or "high_caution".
- Do NOT fabricate reference numbers. If not clearly readable, use null.
- Lower confidence_score when either image is blurry, partial, or ambiguous.
- Output ONLY the JSON object, no markdown, no prose.`;

export async function identifyWithGemini(
  imageBase64: string,
  imageBase64Back?: string
): Promise<Identification> {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  // Normalize to data URLs; strip any existing prefix first to avoid double-prefixing.
  const toDataUrl = (b64: string) =>
    `data:image/jpeg;base64,${b64.replace(/^data:image\/\w+;base64,/, "")}`;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = imageBase64Back
    ? [
        { type: "text", text: PROMPT_WITH_BACK },
        { type: "image_url", image_url: { url: toDataUrl(imageBase64) } },
        { type: "image_url", image_url: { url: toDataUrl(imageBase64Back) } },
      ]
    : [
        { type: "text", text: PROMPT_SINGLE },
        { type: "image_url", image_url: { url: toDataUrl(imageBase64) } },
      ];

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: env.groq.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    throw new ApiException(ErrorCode.UPSTREAM_UNAVAILABLE, "Identification service unreachable");
  }

  if (!resp.ok) {
    throw new ApiException(
      ErrorCode.UPSTREAM_UNAVAILABLE,
      `Identification service error (${resp.status})`
    );
  }

  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new ApiException(ErrorCode.IDENTIFICATION_FAILED, "Empty identification response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiException(ErrorCode.IDENTIFICATION_FAILED, "Malformed identification response");
  }

  const raw = GeminiRawSchema.safeParse(parsed);
  if (!raw.success) {
    throw new ApiException(ErrorCode.IDENTIFICATION_FAILED, "Unexpected identification format");
  }

  const r = raw.data;
  const searchString = [r.brand, r.model_family, r.reference_number]
    .filter((x) => x && x !== "Unknown")
    .join(" ")
    .trim();

  // verification_required whenever confidence is sub-high OR a reference number
  // is asserted (highest hallucination risk).
  const verificationRequired = r.confidence_score < 0.85 || r.reference_number != null;

  const identification: Identification = {
    brand: r.brand,
    model_family: r.model_family,
    reference_number: r.reference_number,
    search_string: searchString || r.brand,
    confidence_score: r.confidence_score,
    possible_matches: r.possible_matches,
    authenticity_caution: { level: r.authenticity.level, note: r.authenticity.note },
    verification_required: verificationRequired,
  };

  // Final guarantee the contract holds before it leaves the server.
  return IdentificationSchema.parse(identification);
}
