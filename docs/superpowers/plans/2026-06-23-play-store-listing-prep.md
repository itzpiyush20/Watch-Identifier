# Play Store Listing Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce everything needed for a future Google Play Console submission — publicly hosted legal pages, a feature graphic, screenshots, listing copy, and a compliance reference doc — without submitting. Actual submission stays blocked until billing integration (separate project) lands.

**Architecture:** Two new Vercel serverless functions (`api/privacy-policy.ts`, `api/terms.ts`) render server-side HTML reusing the same copy as the existing in-app legal screens, exposed at clean URLs (`/privacy-policy`, `/terms`) via `vercel.json` rewrites. Store assets and copy are static files committed under a new `store-assets/` directory — no app code changes, no new runtime dependencies.

**Tech Stack:** Vercel Functions (`@vercel/node`, matching existing `api/*.ts` handlers), `sharp-cli` run via `npx` as a one-time asset-generation tool (not added to `package.json`).

---

## Spec reference

This plan implements `docs/superpowers/specs/2026-06-23-play-store-listing-prep-design.md`. Read that file for full context on what's explicitly out of scope (no submission, no billing, no pricing decisions, no AAB/signing changes).

## File Structure

- Create: `api/_lib/legalPage.ts` — shared HTML page template, used by both legal routes.
- Create: `api/privacy-policy.ts` — GET handler serving the privacy policy as HTML.
- Create: `api/terms.ts` — GET handler serving the terms of service as HTML.
- Modify: `vercel.json` — add `rewrites` mapping `/privacy-policy` and `/terms` to the two functions above.
- Create: `store-assets/feature-graphic.svg` — source for the Play Store feature graphic.
- Create: `store-assets/feature-graphic.png` — generated 1024×500 PNG (committed binary, built once via the commands in Task 5).
- Create: `store-assets/screenshots/README.md` — capture instructions; screenshots themselves are saved alongside it as PNGs.
- Create: `store-assets/listing-copy.md` — title, category, short/full description for pasting into Play Console.
- Create: `store-assets/compliance-reference.md` — content rating, data safety answers, support email, distribution, for pasting into Play Console.

---

### Task 1: Shared legal-page HTML template

**Files:**
- Create: `api/_lib/legalPage.ts`

- [ ] **Step 1: Write the template helper**

```typescript
// api/_lib/legalPage.ts
export interface LegalSection {
  heading: string;
  body: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderLegalPage(title: string, sections: LegalSection[]): string {
  const sectionsHtml = sections
    .map((s) => `<h2>${escapeHtml(s.heading)}</h2>\n<p>${escapeHtml(s.body)}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — The Watch Identifier</title>
<style>
  body { background:#0B0B0C; color:#F5F5F5; font-family: -apple-system, Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; line-height: 1.6; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 32px; color:#FFFFFF; }
  p { color:#C7C7CC; }
  a { color:#7CC4FF; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${sectionsHtml}
</body>
</html>`;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit api/_lib/legalPage.ts --moduleResolution node16 --module node16 --target es2020 --skipLibCheck`
Expected: no output (success). If it complains about an isolated-file project config, run the full project check instead: `npm run typecheck` — expected: no new errors compared to before this file existed.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/legalPage.ts
git commit -m "Add shared HTML template for hosted legal pages"
```

---

### Task 2: Privacy policy route

**Files:**
- Create: `api/privacy-policy.ts`

- [ ] **Step 1: Write the handler**

Content mirrors `app/legal/privacy-policy.tsx`, with a contact line added (the in-app screen has no contact info today; this is the public-facing page Play Console links to).

```typescript
// api/privacy-policy.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderLegalPage, type LegalSection } from "./_lib/legalPage.js";

const SECTIONS: LegalSection[] = [
  {
    heading: "What we collect",
    body: "When you create an account, we store your email address via Supabase Authentication. When you scan a watch, we store the identified brand, model, reference number, estimated value, and confidence score in your portfolio — both locally on your device and, if you are signed in, synced to our cloud database so your collection follows you across devices.",
  },
  {
    heading: "What we never store",
    body: "Photos you capture or upload are processed to generate an identification result and are not retained on our servers or by our AI identification provider afterward. The photo file itself stays only on your device — it is never included in the cloud sync of your portfolio.",
  },
  {
    heading: "Third parties",
    body: "To identify a watch, the photo is sent securely to our AI identification provider solely to generate a result. To estimate market value, the identified brand/model (text only — never the photo) is sent to eBay's public listings API. Neither receives your email or account information.",
  },
  {
    heading: "Your data, your control",
    body: "You can delete your account at any time from Settings. This permanently removes your account and your cloud-synced portfolio data. Data stored locally on your device is removed from the device at the same time.",
  },
  {
    heading: "Contact us",
    body: "Questions or concerns about this policy? Email itzpiyush20@gmail.com.",
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).send("Use GET");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderLegalPage("Privacy Policy", SECTIONS));
}
```

- [ ] **Step 2: Verify locally**

Run: `npm run api:dev` (this is `vercel dev`, the project's existing way to run API functions locally — see `package.json`). Leave it running, then in a second terminal:

Run: `curl -s http://localhost:3000/api/privacy-policy`
Expected: HTML output starting with `<!DOCTYPE html>` and containing `<h1>Privacy Policy</h1>` and `itzpiyush20@gmail.com`.

Stop the `vercel dev` process (Ctrl+C) once verified.

- [ ] **Step 3: Commit**

```bash
git add api/privacy-policy.ts
git commit -m "Add hosted privacy policy route"
```

---

### Task 3: Terms of service route

**Files:**
- Create: `api/terms.ts`

- [ ] **Step 1: Write the handler**

Content mirrors `app/legal/terms.tsx`, with the same contact line added.

```typescript
// api/terms.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderLegalPage, type LegalSection } from "./_lib/legalPage.js";

const SECTIONS: LegalSection[] = [
  {
    heading: "Identification is AI-assisted, not a guarantee",
    body: "Brand, model, reference number, and authenticity notes are generated by an AI model from the photos you provide and may be inaccurate or incomplete. Always verify reference numbers and authenticity through an authorized dealer or qualified watchmaker before relying on this app's output for a purchase, sale, or insurance decision.",
  },
  {
    heading: "Valuations are estimates",
    body: "Market value estimates are derived from active marketplace listing prices, not realized sale prices, and do not constitute a professional appraisal. Actual sale prices may differ significantly.",
  },
  {
    heading: "Subscriptions",
    body: "Paid tiers increase your daily scan allowance and portfolio history retention as described on the Upgrade screen. Subscriptions, once available, are billed and managed through Google Play and can be cancelled at any time through your Google Play account settings.",
  },
  {
    heading: "Account deletion",
    body: "You may delete your account at any time from Settings. This action is permanent and cannot be undone.",
  },
  {
    heading: "Contact us",
    body: "Questions about these terms? Email itzpiyush20@gmail.com.",
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).send("Use GET");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderLegalPage("Terms of Service", SECTIONS));
}
```

- [ ] **Step 2: Verify locally**

Run: `npm run api:dev`, then in a second terminal:

Run: `curl -s http://localhost:3000/api/terms`
Expected: HTML containing `<h1>Terms of Service</h1>` and `itzpiyush20@gmail.com`.

Stop `vercel dev` once verified.

- [ ] **Step 3: Commit**

```bash
git add api/terms.ts
git commit -m "Add hosted terms of service route"
```

---

### Task 4: Clean URLs via Vercel rewrites

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add rewrites**

Current `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm ci",
  "functions": {
    "api/*.ts": {
      "maxDuration": 30
    }
  },
  "regions": ["bom1"]
}
```

New `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm ci",
  "functions": {
    "api/*.ts": {
      "maxDuration": 30
    }
  },
  "regions": ["bom1"],
  "rewrites": [
    { "source": "/privacy-policy", "destination": "/api/privacy-policy" },
    { "source": "/terms", "destination": "/api/terms" }
  ]
}
```

- [ ] **Step 2: Verify locally**

Run: `npm run api:dev`, then in a second terminal:

Run: `curl -s http://localhost:3000/privacy-policy`
Expected: same HTML as `curl http://localhost:3000/api/privacy-policy` returned in Task 2 — `vercel dev` honors `rewrites` from `vercel.json`.

Run: `curl -s http://localhost:3000/terms`
Expected: same HTML as the direct `/api/terms` route in Task 3.

Stop `vercel dev` once verified.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "Add clean URL rewrites for hosted legal pages"
```

- [ ] **Step 4: Note the public URLs for later use**

Once this deploys (next push to the connected Vercel project), the live URLs will be:
- `https://watch-identifier.vercel.app/privacy-policy`
- `https://watch-identifier.vercel.app/terms`

(Confirmed from `EXPO_PUBLIC_API_BASE_URL` in the project's `.env`.) These two URLs go into Play Console's "Privacy Policy" field and the listing copy in Task 7.

---

### Task 5: Feature graphic (1024×500)

**Files:**
- Create: `store-assets/feature-graphic.svg`
- Create: `store-assets/feature-graphic.png` (generated binary)

This task generates a PNG via `npx sharp-cli` (no new dependency added to `package.json` — it's fetched on demand and only used here, once). It was verified working in this environment before being added to this plan.

- [ ] **Step 1: Write the SVG source**

```xml
<!-- store-assets/feature-graphic.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <rect width="1024" height="500" fill="#0B0B0C"/>
  <text x="500" y="240" font-family="Arial" font-size="64" fill="#FFFFFF" font-weight="bold">The Watch</text>
  <text x="500" y="310" font-family="Arial" font-size="64" fill="#FFFFFF" font-weight="bold">Identifier</text>
  <text x="500" y="370" font-family="Arial" font-size="28" fill="#C7C7CC">Identify. Value. Collect.</text>
</svg>
```

- [ ] **Step 2: Generate intermediate background PNG**

Run: `npx --yes sharp-cli -i store-assets/feature-graphic.svg -o /tmp/feature-bg.png resize 1024 500`
Expected: a file is written at `/tmp/feature-bg.png` (command prints the output path).

- [ ] **Step 3: Resize the app icon for the banner**

Run: `npx --yes sharp-cli -i assets/adaptive-icon.png -o /tmp/feature-icon-360.png resize 360 360`
Expected: a file is written at `/tmp/feature-icon-360.png`.

- [ ] **Step 4: Composite icon onto background and save the final asset**

Run: `npx --yes sharp-cli -i /tmp/feature-bg.png -o store-assets/feature-graphic.png composite /tmp/feature-icon-360.png --gravity west`
Expected: `store-assets/feature-graphic.png` is created.

- [ ] **Step 5: Verify dimensions**

Run: `npx --yes sharp-cli -i store-assets/feature-graphic.png -o /tmp/verify.png resize 1024 500`
Expected: no error — if the input were not already 1024×500, this would still succeed (it resizes), so instead confirm visually: open `store-assets/feature-graphic.png` in any image viewer and confirm it's a dark banner with "The Watch Identifier" text and the app icon on the left edge, no distortion or cropping.

- [ ] **Step 6: Commit**

```bash
git add store-assets/feature-graphic.svg store-assets/feature-graphic.png
git commit -m "Add Play Store feature graphic"
```

---

### Task 6: Screenshots

**Files:**
- Create: `store-assets/screenshots/README.md`
- Create: `store-assets/screenshots/01-scan.png`, `02-results.png`, `03-profile.png` (captured manually — see below)

Screenshots require a running app on a device or emulator; this step cannot be scripted from the command line alone.

- [ ] **Step 1: Write capture instructions**

```markdown
<!-- store-assets/screenshots/README.md -->
# Play Store Screenshots

Captured from a running build of The Watch Identifier (`npm run android` with a
connected device/emulator, or `npm start` + a dev client).

## How these were captured

1. Start the app: `npm run android` (or `npm start` and open in a dev client).
2. Navigate to the **Scan** tab, frame a watch (or any object for a placeholder
   shot), and capture the screen before pressing the shutter button.
3. Capture a completed **Results** screen after a successful identification.
4. Navigate to **Profile** and capture the tier/quota screen.
5. Pull each screenshot off the device/emulator:
   - Emulator: use the emulator's built-in camera/screenshot button (saves to
     the host machine automatically), or run
     `adb exec-out screencap -p > store-assets/screenshots/01-scan.png`
   - Physical device: take the screenshot with the device's hardware shortcut,
     then `adb pull /sdcard/Pictures/Screenshots/<filename>.png store-assets/screenshots/01-scan.png`
6. Repeat for `02-results.png` (Results screen) and `03-profile.png` (Profile screen).

## Requirements (Play Console)

- Minimum 2 screenshots, phone aspect ratio.
- Minimum dimension 320px, maximum 3840px on the long edge.
- PNG or JPEG, no alpha channel.
```

- [ ] **Step 2: Capture the three screenshots**

Follow the README above. Save the three files at:
- `store-assets/screenshots/01-scan.png`
- `store-assets/screenshots/02-results.png`
- `store-assets/screenshots/03-profile.png`

Expected: three PNG files exist at those paths, each a phone-aspect-ratio screenshot of a real app screen (not blank/crashed states).

- [ ] **Step 3: Commit**

```bash
git add store-assets/screenshots/
git commit -m "Add Play Store screenshots and capture instructions"
```

---

### Task 7: Listing copy

**Files:**
- Create: `store-assets/listing-copy.md`

- [ ] **Step 1: Write the listing copy**

```markdown
<!-- store-assets/listing-copy.md -->
# Play Console Listing Copy

## Title
The Watch Identifier

## Category
Lifestyle

## Short description (80 characters max)
Identify any watch from a photo and get an instant market value estimate.

## Full description (4000 characters max)
Point your camera at a watch and let The Watch Identifier tell you what it
is. Snap a photo of the dial (and optionally the case back for a more
confident result), and get back the brand, model family, and — when
confidence is high enough — a possible reference number, along with a
market value estimate.

**How valuation works:** estimates are built from active marketplace
listing prices, not confirmed sale prices, and are clearly labeled as such
in every result. Think of it as "what sellers are currently asking," not a
professional appraisal — always verify with an authorized dealer before
making a purchase, sale, or insurance decision based on the app's output.

**Build your collection:** every scan is saved to your personal portfolio,
synced across devices when you're signed in. Track what you own, what it's
roughly worth, and how your collection has grown over time.

**Free to try:** every new account gets a 7-day free trial with full scan
limits and unlimited portfolio history. After the trial, continue on a
limited free tier, or subscribe to a paid plan for a higher daily scan
allowance and unlimited history. (Plans starting at $X.XX/mo — final
pricing TBD, subject to change before subscriptions go live.)

**Your privacy:** photos you capture are processed only to generate your
result and are never stored on our servers. Only the identification data
you choose to keep in your portfolio is saved.

Whether you're cataloging a growing collection or just curious what's on
your wrist, The Watch Identifier turns a photo into an answer in seconds.
```

- [ ] **Step 2: Verify length limits**

Run: `node -e "const fs=require('fs'); const t=fs.readFileSync('store-assets/listing-copy.md','utf8'); const short=t.split('## Short description')[1].split('##')[0].trim(); const full=t.split('## Full description')[1].split('##')[1] ?? t.split('## Full description')[1]; console.log('short:', short.length); console.log('full section chars:', t.split('## Full description (4000 characters max)')[1].trim().length)"`
Expected: `short:` value is ≤ 80, and the full-description character count is ≤ 4000. If either exceeds the limit, trim the copy in Step 1 and re-run.

- [ ] **Step 3: Commit**

```bash
git add store-assets/listing-copy.md
git commit -m "Add Play Store listing copy"
```

---

### Task 8: Compliance reference doc

**Files:**
- Create: `store-assets/compliance-reference.md`

- [ ] **Step 1: Write the reference doc**

```markdown
<!-- store-assets/compliance-reference.md -->
# Play Console Compliance Reference

This is a reference for filling out Play Console's own forms — Play Console
does not accept these answers as code or config, only through its UI.

## Content rating
Everyone / general audience. No violence, gambling, user-generated content
visible to others, or mature themes. When completing the content rating
questionnaire (IARC), answer "No" to all violence/sexual content/gambling
prompts.

## Data safety form

| Data type | Collected? | Purpose | Shared with third parties? |
|---|---|---|---|
| Photos (camera) | Processed, not stored | Generate watch identification result | Sent to AI identification provider for processing only; not retained afterward |
| Email address | Yes | Account creation/login (Supabase Auth) | No |
| App activity (scan/identification results) | Yes | Portfolio sync across devices | No |
| Usage analytics events | Yes | Product analytics (`analytics_events` table) | No |
| Crash logs | Yes | Crash reporting (server-side Sentry) | Sentry (crash reporting infrastructure only) |

Data deletion: account deletion is available in-app (Settings → Delete My
Account), permanently removing the account and cloud-synced portfolio data.

## Support email
itzpiyush20@gmail.com

## Distribution
Worldwide — no country restrictions.

## Privacy policy URL
https://watch-identifier.vercel.app/privacy-policy
```

- [ ] **Step 2: Commit**

```bash
git add store-assets/compliance-reference.md
git commit -m "Add Play Console compliance reference doc"
```

---

### Task 9: Final check

- [ ] **Step 1: Confirm every deliverable exists**

Run: `ls store-assets store-assets/screenshots api/privacy-policy.ts api/terms.ts api/_lib/legalPage.ts`
Expected: all of the following are listed: `feature-graphic.svg`, `feature-graphic.png`, `listing-copy.md`, `compliance-reference.md`, `screenshots/README.md`, `screenshots/01-scan.png`, `screenshots/02-results.png`, `screenshots/03-profile.png`, plus the three `api/` files.

- [ ] **Step 2: Confirm no submission has happened**

This plan never touches Play Console, `eas submit`, or any signing/build config. Confirm `git log --oneline -10` shows only the commits from Tasks 1–8 (legal routes, rewrites, store assets, copy, compliance doc) — nothing related to building or uploading an AAB.

- [ ] **Step 3: Final commit if anything was left unstaged**

```bash
git status
```

Expected: working tree clean (everything from Tasks 1–8 already committed). If anything is unstaged, `git add` it and commit with a message describing what was missed.
