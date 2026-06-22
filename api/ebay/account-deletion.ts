import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";

/** eBay Marketplace Account Deletion notification endpoint.
 *  GET: answer the challenge eBay sends when you save the endpoint URL.
 *  POST: acknowledge deletion notifications. We never persist eBay user
 *  data (app-level Browse API only), so there is nothing to delete —
 *  this just satisfies eBay's mandatory ack-within-15s requirement. */

const VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN || "";
const ENDPOINT_URL = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT || "";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "GET") {
    const challengeCode = Array.isArray(req.query.challenge_code)
      ? req.query.challenge_code[0]
      : req.query.challenge_code;

    if (!challengeCode || !VERIFICATION_TOKEN || !ENDPOINT_URL) {
      res.status(400).json({ error: "Missing challenge_code or server verification config" });
      return;
    }

    const hash = createHash("sha256")
      .update(challengeCode)
      .update(VERIFICATION_TOKEN)
      .update(ENDPOINT_URL)
      .digest("hex");

    res.status(200).json({ challengeResponse: hash });
    return;
  }

  if (req.method === "POST") {
    // No eBay user data is ever stored server-side, so just acknowledge.
    console.log("[ebay/account-deletion] notification received", req.body?.notification?.data);
    res.status(200).end();
    return;
  }

  res.status(405).end();
}
