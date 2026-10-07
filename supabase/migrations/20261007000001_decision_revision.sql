-- W-7.1 (D-040): order of the answers on one proposal, across devices.
--
-- Until now the answer in force on a proposal was the one with the latest `decided_at`, a device
-- clock. A device whose clock runs ahead could win over an answer given later, on purpose, by
-- someone who had already seen its answer. `revision` is a logical counter per proposal: a device
-- writes 1 + the highest revision it knows on that proposal. A gesture made after seeing another
-- one therefore always comes after it; two answers given offline without seeing each other share
-- a revision and are ordered by instant then id (deterministic, but not a proof of real order).
--
-- Deployment: additive. Rows recorded before keep revision 0 and their order by instant. An app
-- version without this column keeps working (the column has a default) but its answers sort as
-- revision 0: update every device, as for W-5.
-- RLS: unchanged (owner-only policies of `adjustments`). Sync: pushed only when set, pulled back.
-- Export / deletion: the column belongs to `adjustments` (Privacy Center category `journey`,
-- deleted with the account by cascade). Immutability: covered by `adjustments_immutable`.

alter table public.adjustments
  add column revision integer not null default 0,
  add constraint adjustments_revision_range check (revision between 0 and 1000000);
