# Debugger Enhancements Implementation Plan

## Assumptions

- The MCP server will continue to target Chromium-based browsers via Puppeteer, so Chrome DevTools Protocol (CDP) features available in Chrome 124+ can be relied upon.
- Introducing new runtime dependencies (e.g., for source map parsing) is acceptable as long as they are production-safe and added to `package.json`.
- MCP clients can address resources by URI; therefore, exposing page sources through a deterministic URI scheme will let tools and humans coordinate breakpoint locations.

## Key Research Findings

1. [`Debugger.getScriptSource`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-getScriptSource) returns the full source text for a given `scriptId`, which allows us to serve compiled bundle sources over MCP resources.
2. [`Debugger.setBreakpointByUrl`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-setBreakpointByUrl) resolves breakpoints against all scripts whose URL (or regex) matches, so mapping original source coordinates to generated URLs lets CDP honor TypeScript/JSX breakpoints.
3. [`Debugger.scriptParsed`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#event-scriptParsed) events surface `sourceMapURL`, providing the entrypoint for retrieving and parsing source maps when bundles map back to authored files.

## Success Rubric

1. **Resource coverage** – Every parsed script (compiled and mapped originals) is available as an MCP resource with stable URIs and readable metadata.
2. **Source accuracy** – Reading a resource returns the exact text from the bundle or source map (inline or external), including support for inline `sourcesContent`.
3. **Sourcemap breakpoints** – Setting a breakpoint against an original source URI or URL lands on the expected generated location and pauses execution when hit.
4. **Tool UX** – Debugger tool descriptions document end-to-end workflows (e.g., set breakpoint → trigger action → inspect status) so users understand sequencing.
5. **Reliability** – New behavior tolerates missing or invalid source maps gracefully and keeps existing non-sourcemapped flows working.
6. **Docs/tests** – Regenerated documentation reflects the richer descriptions, and type-checking continues to pass.
7. **Maintainability** – Added structures (e.g., source registries) are encapsulated, typed, and integrate with `McpContext` without leaking implementation details.

## Approach Evaluation

- **Source map parsing**: Considered `source-map-js` (battle-tested, Promise-based) vs. `@jridgewell/trace-mapping` (lightweight). `source-map-js` offers high-level helpers like `SourceMapConsumer.originalPositionFor`/`generatedPositionFor`, reducing custom math, so we will adopt it despite the slightly larger footprint.
- **Resource transport**: Either push static resources per script via `server.registerResource` (risking stale entries) or expose a `ResourceTemplate` backed by live enumeration. The template approach keeps listings fresh per page and lets us scope URIs to the selected page, so we will register a template with dynamic list/read callbacks.
- **Breakpoint API surface**: Extending the `debugger_set_breakpoint` schema to accept either a raw URL or a `sourceUri` aligned with the new resources avoids breaking existing consumers and enables sourcemap-aware flows without duplicating tools.

## Step-by-Step Plan

1. **Source inventory** – Extend `DebuggerSession` to track scripts, execution contexts, and source-map metadata; add helpers to fetch script text, load and parse source maps (respecting inline `sourcesContent`), and enumerate both compiled and original sources.
2. **Resource exposure** – Introduce a `PageSourceManager` (or similar) in `McpContext` that leverages `DebuggerSession` to list and read sources, then register an MCP `ResourceTemplate` (e.g., `chrome-devtools://page/{pageId}/sources/{sourceId}`) whose list/read callbacks surface metadata and contents.
3. **Sourcemap breakpoint mapping** – Enhance `DebuggerSession.setBreakpoint` to accept either `url`/`sourceUri` and, when targeting an original source, translate the requested location to generated coordinates using the parsed source map before calling `Debugger.setBreakpointByUrl`.
4. **Tool updates** – Update debugger tool schemas/descriptions to mention `sourceUri`, clarify workflows, and highlight step-by-step usage; ensure removal/list tooling understands the new metadata and emits friendly output.
5. **Documentation & validation** – Regenerate tool docs (`npm run docs`) so examples appear in `docs/tool-reference.md`, ensure README TOC updates, and run `npm run typecheck` to confirm typing remains sound.
6. **Iterate & verify** – Manually review against the rubric, adjust as needed, and commit once the enhancements and docs satisfy the success criteria.
