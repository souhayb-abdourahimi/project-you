# AI rules

- Pipeline: user data → rules → deterministic engines → recommendations → AI explanation. The LLM never computes targets, loads or plans.
- LLM calls only from Edge Functions (`AIProvider`), never from the client.
- Any AI output that changes user data must parse against a Zod schema in `src/domain/ai/schemas.ts` and be re-validated by the relevant engine; invalid output is rejected, not patched.
- Send the minimum context for the question. Coach memory is structured (today `adjustments` rows `coach.*`, D-039; the `coach_memory` table is legacy and unused, D-042), never free-form sensitive text.
- No medical diagnosis; persistent pain → suggest a health professional. No guaranteed results.
