# Tractatus Tree Studio

Transform books and papers into exhaustive numbered trees, fresh-example variations, and connected prose.

## Run & Operate

- API: `pnpm --filter @workspace/api-server run dev`
- Web: `pnpm --filter @workspace/tractatus-studio run dev`
- Full check: `pnpm run typecheck`
- API contracts: `lib/api-spec/openapi.yaml`; regenerate with `pnpm --filter @workspace/api-spec run codegen`.
- Managed workflows supply ports and base paths. Restart the API after server edits.

## Product requirements

- Four editable boxes: source, original tree, fresh-example variation, and prose of the variation.
- Every box has immediate Copy and Delete, with no confirmation.
- Whole-page Clear reloads the page.
- OpenAI generation streams; Stop retains partial text.
- Automatic GPTZero checks run after editing or generation, not during streaming.
- Do not add login, payment, or unrelated features without an explicit request.

## Integration decisions

- OpenAI uses Replit AI Integrations and its supplied SDK client. Usage is billed to Replit credits.
- GPTZero uses its official text API and the GPTZERO_API_KEY secret, never browser-visible.
- Detection is advisory, not proof of authorship.
- Long texts are processed in sections rather than silently truncated. Multi-section detector scores are explicitly described as weighted estimates.
- No server-side document persistence is currently requested. TXT and Markdown uploads are read in the browser.

## Source map

- Frontend: `artifacts/tractatus-studio/src/pages/home.tsx`, `components/text-panel.tsx`, `hooks/use-detector.ts`.
- Backend routes: `artifacts/api-server/src/routes/tractatus.ts`.
- Transformations and GPTZero adapter: `artifacts/api-server/src/lib/tractatus.ts`.
- The provided paper and reference tree remain under `.local/conversation-workspace/files/attached_assets/`.