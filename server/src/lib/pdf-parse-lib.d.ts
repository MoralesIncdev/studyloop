// pdf-parse's own top-level `index.js` runs a `!module.parent` "debug mode"
// self-test at import time that tries to synchronously read a hardcoded
// fixture PDF from pdf-parse's OWN `test/data/` directory — under
// Vitest/ESM's module loading (no CJS `module.parent` tracking), that check
// evaluates true in every consuming project, throwing ENOENT the instant
// `pdf-parse` is imported (see lib/slides.ts's import comment). Importing
// the inner implementation module directly sidesteps that self-test
// entirely; it's the exact same function `pdf-parse`'s index.js re-exports
// unchanged, minus the debug harness. `@types/pdf-parse` only ships types
// for the top-level `pdf-parse` module, so this ambient declaration mirrors
// its `Options`/`Result` shape for the subpath import.
declare module "pdf-parse/lib/pdf-parse.js" {
  import type PdfParseDefault from "pdf-parse";
  const pdfParse: typeof PdfParseDefault;
  export default pdfParse;
}
