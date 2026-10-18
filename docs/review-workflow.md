# Expert review: handing out a build and merging the results

The answer keys are derived from BAFA's sample solutions and need a subject-matter
expert's check. The reviewer gets a private APK, reviews in the app and sends back a
JSON file. This document is the checklist for both ends.

## Current round: `review-4`

| | |
|---|---|
| Built | 2026-10-18, for the same reviewer (personal use only) |
| Code | git tag `review-4` |
| APK | `private/Energieberatung.apk`, SHA-256 `7f06f84cfab934ec26354a4ebf2eec07a99db2125bfc3265deb70bb675c98fa0` |
| Built with | `npm run android:private -w @exam/web` (PDFs from `private/pdfs` built in) |
| Baseline | `annotations/review-baseline.json` (question hashes of that build) |

New in this build: her review of all 733 WG questions bundled, and "← Zurück" while
learning (her request): skipped questions can be answered, answered ones are shown with
their result. Question hashes are the same as in `review-3`. Installs over `review-3`.

## Previous rounds

`review-3` (handed out 2026-10-10, APK now `private/Energieberatung-review-3.apk`,
SHA-256 `4ea34f0ec159e18b906d00d0652d1d2679aa6294dc1a4630e41c84a3ca4ff19f`): true/false
statements answered with two buttons; WG 3.3.09/3.3.10, WG 3.6.3.23/3.6.3.24 and
NWG 3.2.3.11/3.2.3.12 split. Her export of 2026-10-18 (all WG questions) still had
reviews of WG 3.3.09 and 3.6.3.23 with the pre-split hashes; they were migrated by hand.


`review-2` (handed out 2026-10-09, APK now `private/Energieberatung-review-2.apk`,
SHA-256 `5beefb0760a3ca1710c25f7bc40975d9ad46f106e7553067ef725e40c9aeecaa`): her
review-1 results bundled, flagged questions fixed, skip/mark/repeat-wrong added.


`review-1` (handed out 2026-10-06, APK now `private/Energieberatung-review-1.apk`,
SHA-256 `1d71fa25e558d9adb34d91853b37eb6eacb34691e68d1d68d97695e7e8d74bce`): merged
2026-10-09, 98 WG questions.

What the reviewer was asked to do in `review-1`, separately for Wohngebäude (her focus: the three WG
catalogues) and, optionally, Nichtwohngebäude: review all uncertain questions (WG 78,
NWG 52), then a random sample of 20, then export. She was also asked for feedback on
the app itself. That feedback is meant to shape the final version.

## When the results arrive

1. Save the file(s) as `private/reviews/pruefung-energieberatung-<date>.json`.
   Every export contains all reviews so far, so the newest file is enough; several are fine too.
2. See what she changed and noted:
   ```sh
   npm run import -- reviews private/reviews/<file>.json
   ```
   This lists every ✗/? verdict, corrected answer (old → new) and note, and flags
   reviews whose question changed since (`ACHTUNG … wird ignoriert`).
3. Merge into the shipped annotations:
   ```sh
   npm run import -- merge-reviews private/reviews/*.json
   ```
   It must print `Alle Prüfungen passen zu Build "review-N"` (the current round). If it warns about
   mismatches, see below before going on.
4. `npm test`, then commit `annotations/annotations.json` (our own data, no BAFA content).
5. Work through the notes and her feedback on the app. Questions marked `unclear` or
   `wrong` without a correction need a decision. Ask her if needed.

## Keep reviews valid

A review stores the question's content hash, and corrected answers store **option
positions**. If the importer extracts a question differently (text, options, solution),
the hash changes and the app silently ignores that review. Therefore:

- Do **not** change the importer's text extraction while a review round is open. The
  test `keeps the question hashes of the review build` (in
  `packages/importer/test/catalogs.test.ts`, needs `private/pdfs`) fails if you do.
- If an importer change is needed anyway, merge the outstanding results first
  (step 3), then change the importer and migrate `annotations.json` deliberately
  (e.g. map old → new hashes after checking the options didn't move).
- If `merge-reviews` warns about mismatches, check out `review-1`, run
  `npm run import -- reviews <file>` there to see the reviews against the questions she saw,
  and fix the affected entries by hand.
- If BAFA publishes new PDFs: the baseline lists the SHA-256 of the PDFs she reviewed.
  Changed questions get a new hash and need a new review; unchanged ones keep theirs.

## Handing out another build

- Build with `npm run android:private -w @exam/web` on this machine. Gradle needs a
  full JDK: if it complains about `JAVA_COMPILER`, prefix
  `JAVA_HOME=~/android-studio/jbr`. It is signed
  with `~/.android/debug.keystore`. With the same key, the new APK installs **over** the
  old one and her local reviews stay. Tell her **not** to uninstall first. If the key is
  lost, ask her to export before installing.
- After merging, her reviews are also bundled in the app. Local reviews still win.
- Record the round: `git tag review-N`, then
  `npm run import -- baseline review-N private/pdfs/*.pdf`, and update the table above.

## Licensing reminder

The private APK contains BAFA's PDFs and is for the reviewer's personal use only.
Never publish it, and never deploy a web build made with `android:private`. Public
builds use `npm run android` (users import the PDFs themselves).
