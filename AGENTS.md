# Repository instructions

## Runtime

- Keep document processing local. Runtime code must not call remote endpoints or require Office, WPS, Electron-only modules, or Node built-ins.
- Keep `isDesktopOnly` false. Test every runtime dependency against browser APIs before adding it.
- Preserve the source file when a format feature is unsupported. Disable editing when a safe write cannot be guaranteed.

## Design

- `main.ts` owns the Obsidian view, toolbar state, source-file conflict check, validation, and vault write.
- Each document format is an adapter at the `PreviewAdapter` seam. Format parsing and rendering stay inside that adapter.
- DOCX and PPTX edits patch existing OOXML nodes. XLSX edits use `xlsx-patcher.ts`. Rebuilding these files from extracted content is not an acceptable save path.
- XLS uses SheetJS and only exposes value and formula editing.
- PDF.js and its worker are bundled into `main.js`. Keep the worker import on the `?raw` path handled by `esbuild.config.mjs`.

## Checks

- Run `npm run check` after every code change. It must finish without lint or TypeScript errors.
- Test DOCX, PPTX, XLSX, XLS, and PDF in an isolated Obsidian vault before release.
- For save tests, edit copies of fixtures. Reopen each saved file and verify the changed value plus the original ZIP entries.
- Test source-file conflict handling and one large PDF. A large PDF must render nearby pages instead of every page at once.

## Release

- Use semantic versions in `package.json` and `manifest.json`.
- Run `npm run release:prepare`; verify the three files in `release/ob-show-me-anything/` match the root build.
- Commit source and release files together.
- The Git tag must exactly match `manifest.json`, without a `v` prefix.
- Attach `main.js`, `manifest.json`, and `styles.css` to the GitHub Release.
