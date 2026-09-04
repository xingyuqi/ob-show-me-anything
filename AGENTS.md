# Repository instructions

## Runtime

- Keep document processing local. Runtime code uses browser and Obsidian interfaces only. Office, WPS and remote services are optional external viewers, never runtime dependencies.
- Keep `isDesktopOnly` false. Verify new runtime dependencies in desktop and mobile-compatible browser environments.
- Treat files beginning with `~$` as Office temporary files and do not parse them.

## File safety

- Preserve OOXML package parts that the editor does not change. DOCX and PPTX edit existing XML nodes; XLSX edits go through `xlsx-patcher.ts`.
- Keep protected, signed, revision-bearing and macro-bearing files read-only when saving could discard content.
- `PreviewAdapter.serialize()` returns `null` when nothing changed. A no-op save must not rewrite the source file.
- Keep the source-file change check before every write. Unsupported edits must leave the source untouched.

## Modules

- `main.ts` owns the Obsidian view, toolbar, conflict check, validation and vault write.
- Format adapters own parsing, rendering and serialization behind `PreviewAdapter`.
- Bundle PDF.js and its worker into `main.js`; the worker uses the `?raw` loader in `esbuild.config.mjs`.

## Verification

- Run `npm run check` after each code change.
- Before release, test DOCX, PPTX, XLSX, XLS and PDF in an isolated vault. Save only copies of fixtures, reopen them and compare their original package entries.
- Test a no-op save, source-file conflict handling, protected files and one large PDF. The large PDF should render nearby pages instead of every page.

## Release

- Run `npm run release:prepare` and keep source plus release files in the same commit.
- Use the exact manifest version as the Git tag, without a `v` prefix.
- Attach `main.js`, `manifest.json` and `styles.css` to the GitHub Release.
