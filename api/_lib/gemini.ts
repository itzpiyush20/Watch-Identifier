import { z } from "zod";
import { env } from "./env";
import { ApiException, ErrorCode } from "./errors";
import { IdentificationSchema, type Identification } from "../../src/types";

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

const PROMPT = `You are an expert horologist. Identify the wristwatch in the image.
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
- Do NOT fabricate reference numbers. If not clearly readable, use null.
- Lower confidence_score when the image is blurry, partial, or ambiguous.
- Output ONLY the JSON object, no markdown, no prose.`;

export async function identifyWithGemini(imageBase64: string): Promise<Identification> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`;

  // Strip a possible data-URL prefix; Gemini wants raw base64.
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: "image/jpeg", data } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
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
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
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
