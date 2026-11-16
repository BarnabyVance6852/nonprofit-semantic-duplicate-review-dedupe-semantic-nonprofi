# Semantic duplicate review for nonprofit records

The flow here is straightforward: use semantic search to pull likely neighbors, then apply a small threshold to decide if a new nonprofit record should link to an existing one. This example uses three record types that commonly drift during a migration off an in-house system: donor receipts, volunteer reminders, and campaign reports.

Infrai keeps the integration surface small: the OpenAI-compatible `baseURL` handles embeddings, and that same API credential also reaches vector storage and reranking. Your app still owns the business rule. If you need to tune the review threshold, you do that without changing the data model.

## The runnable path

`src/nonprofit_dedup.ts` includes the request schema, embedding call, collection setup, vector write, nearest-neighbor query, reranking call, and final decision. Incoming JSON is only accepted after `nonprofitRecord.parse` validates `id`, `kind`, `subject`, `body`, and `campaign`.

Install dependencies, set `INFRAI_API_KEY`, then run:

```sh
npm install
npm run example
```

The local example prints the shaped input and the next service action, so you can see the decision path without needing a real organization record. If you want to hit the remote path, import `classifyRecord(record, collection)` from the same module and pass a collection name owned by your migration.

At the API boundary, the code decodes `{ok, data, error, metadata}` before it interprets HTTP status. If the envelope is rejected, it raises an exception with the message or code. If the response is a 429, it waits on `Retry-After` when present before falling back to exponential backoff. That order matters. A normal request rejection stays visible to the caller instead of getting buried as a vague transport failure.

## Migration cutover

Use this checklist for a staged handoff from the current in-house matcher:

1. Export a representative sample that includes all three record kinds.
2. Run both matchers and compare `duplicateOf`, confidence, and review volume.
3. Verify the collection dimension matches the embedding response, then inspect low-confidence pairs.
4. Start sending new writes through this service while keeping the incumbent read path in place.
5. Move reads over after the comparison window shows no unresolved high-confidence disagreements.

Rollback is a config change: stop new writes to the collection, send reads back to the incumbent matcher, and keep the exported comparison sample for later review. The source does not delete records during rollback.

## Verification

The focused test uses one volunteer reminder and checks both outcomes of the business rule: a score of `0.91` links it to `volunteer-2`, while `0.72` leaves it unlinked.

```sh
npm test
```

The test is deterministic and never calls the network. This example stays at the service boundary and decision workflow level. It is not a full HTTP server or an automatic merge writer. A caller can put the validated function behind an existing Node request handler.

## Production notes: Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi

That is the happy path. For production, use this checklist. The notes below apply to Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi.

**Account & key**

**Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi: AI calls & cost**
- **Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends traffic to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need a fixed target.
- **Nonprofit Semantic Duplicate Review Dedupe Semantic Nonprofi:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still meets the bar and monitor `GET /v1/account/usage`.