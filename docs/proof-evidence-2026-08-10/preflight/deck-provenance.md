# Independent Deck Provenance (D-02)

**Task:** 04-01 Task 3 — source and vet a genuinely independent, publicly available deck (PDF), not manufactured from this run's lecture transcript.

## Search process

Live web search (Google, Bing, DuckDuckGo, Ecosia, Brave, Mojeek, marginalia.nu, several public SearXNG instances) was attempted first via the `browse` skill (headless Chromium); every general-purpose search engine returned an automated-traffic CAPTCHA/challenge page to the headless client with no way to solve it programmatically — this itself is recorded as a process note, not a product finding (search-engine bot defenses are outside StudyLoop's own surface). The search pivoted to direct navigation of known reputable government/institutional domains instead. `ardsnet.org` (NIH-funded ARDS Clinical Trials Network's ventilator protocol card) was located and topically on point, but its HTTPS certificate presented a hostname mismatch (`subject: CN=hedwig.mgh.harvard.edu`, does not cover `www.ardsnet.org`) — curl refused the connection (`SSL: no alternative certificate subject name matches target host name`) and it was rejected rather than bypassed with `-k`; a cert mismatch is a legitimate trust-boundary concern (T-04-03) regardless of how well-known the underlying organization is. The CDC NHSN source below was then located directly from `cdc.gov`'s own site navigation (no search engine needed) and downloaded with a valid, correctly-matching HTTPS certificate.

## Source

- **Source URL:** https://www.cdc.gov/nhsn/pdfs/pscmanual/10-vae_final.pdf
- **Publisher:** Centers for Disease Control and Prevention (CDC), National Healthcare Safety Network (NHSN) — a U.S. federal government health service (the "government health service" category D-02 names)
- **Deck title:** *Chapter 10: Ventilator-Associated Event (VAE) Protocol* (from the NHSN Patient Safety Component Manual)
- **Publication date:** January 2026 (page 1 header: "January 2026 10-1")
- **Licence / terms:** U.S. Government work — CDC materials are, with narrow exceptions not applicable here, not subject to copyright in the United States (17 U.S.C. § 105) and are freely usable; CDC's own site states most CDC content may be used without permission (see cdc.gov's site-wide reuse policy). No paywall, login, or access restriction was encountered — the PDF is a direct public download link surfaced on the NHSN VAE public-facing page (`https://www.cdc.gov/nhsn/psc/vae/index.html`).
- **sha256:** `6f4b1cf15907e64c2f9bd737a2f6622ff437d84b6a33b9d9cccd045b06d4a822`
- **Local path:** `/Users/antemo/StudyLoopProof-2026-08-10/independent-deck/cdc-nhsn-vae-protocol-chapter10.pdf` (inside `PROOF_DATA_DIR`, outside the repo working tree — confirmed not present anywhere under `/Users/antemo/studyloop`)
- **Downloaded via:** `browse download ... --navigate` (real browser context — CDC's Akamai edge rejects a bare `curl` request with a 403, but serves the file normally to an actual browser session; no credential or auth bypass involved, purely a UA/bot-fingerprint difference)

## Vetting

**1. Topical overlap.** The VAE surveillance protocol's core mechanism is daily comparison of a ventilated patient's *minimum PEEP* and *minimum FiO2* values against a baseline period — both terms the chosen lecture (04-01 Task 2) teaches from first principles. Extracted-text scan: **"PEEP" appears 124 times, "FiO2" appears 114 times** across the document. (SIMV/CPAP/pressure-support are not part of the VAE surveillance definitions and do not appear — this deck's overlap is concentrated on PEEP/FiO2, which is expected for a surveillance-definitions chapter rather than a modes-of-ventilation teaching text; it is a genuinely independent second evidence channel on the topics it does cover, not a full substitute for the lecture's broader mode coverage.)

**2. Real text layer.** Extracted with the shipped `pdf-parse/lib/pdf-parse.js` path (same extractor `server/src/lib/slides.ts` uses), per-page `pagerender` hook, identical to the production code path:
- **Page count:** 44
- **Per-page character counts:** `[4435,3872,2902,3839,3259,3185,3148,2606,3094,2402,3615,3388,2841,1079,2876,3460,3257,2973,3254,1105,4622,3811,2548,2514,2906,2799,1022,2014,3676,928,1030,3123,4188,3627,3782,3433,3255,3427,3281,3621,3200,3596,4057,2046]`
- **Empty pages:** 0 of 44 (`isEmptyPageText` would return `false` for every page — min 928 chars, max 4622, average 3025)
- This is a genuine, substantial text layer, not a scanned/image-only document — the **text-layer path was taken**, not the image-only fallback.

**3. Terms permit local use.** Confirmed above (public-domain U.S. Government work, no login/paywall). The file was downloaded to `PROOF_DATA_DIR` only; the PDF binary is **not** committed to the repo (only this provenance record and the derived evidence are).

## Independence statement

This is CDC/NHSN's official infection-surveillance protocol chapter, authored for hospital infection preventionists reporting device-associated events — a completely different audience and purpose than a MedCram teaching video — dated January 2026 and hosted on CDC's own institutional site with no reference to, dependency on, or derivation from the chosen lecture's transcript in any way; it is genuinely independent per D-02.
