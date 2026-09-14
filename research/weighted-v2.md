# Corrected weighted model v2

This implements review items 1–3. Sectionals, pace, early/late running style and pair tactical compatibility (item 4) are deliberately excluded.

## Data and chronology

Official result records are parsed by timeline/scripts/model-research/collect_v7.py, using timeline/training/history-v7.jsonl.gz and retained missing tail reports. Raw recovery is cached in history/weighted-source.jsonl.gz. Existing cards and final place odds remain the evaluation universe, including incomplete races in coverage denominators.

Horse histories are matched by venue, name, birth cohort (year minus reported age), and sex group (male/gelding together). This is not an official horse-ID join; horses with missing or inconsistent identity data can lack matched history. A snapshot records each horse's last prior date and support counts.

All races on a date are scored before any result on that date is added to horse, jockey, trainer or track history. Current-race finish/time never enters features. Previous race records are available only after their date. Withdrawn official starters are removed before v2 probabilities are calculated.

## Thirteen features

1. Place rate uses official place winners/slots, one year and 120-day exponential half-life, with 8 prior starts.
2. Win rate uses 12 prior starts and is separately ablated.
3. Place rate within ±200m shrinks to overall place rate with 6 prior starts.
4. Current rating minus field mean replaces field min/max scaling.
5. Last five finishing fractions use the original field size and recency weighting.
6–7. Jockey/trainer one-year residual place performance subtracts expected performance from the horse's prior records, with shrinkage of 30 starts. This is a proxy for horse-quality adjustment, not a causal skill estimate.
8. Own prior burden minus current burden, clipped ±5kg, only same grade and rating within 3. Missing comparable races are neutral.
9. Deviation from median body weight of successful starts among last ten, at least three records.
10. Smooth log deviation from own median interval, at least three prior intervals.
11. Prior race time vs prior-date median winning time in venue/distance/track, falling back to venue/distance, requiring 20 races. Converted to 1200m equivalent and clipped.
12. Prior time behind the winner, converted to 1200m equivalent. This is a time margin in seconds, NOT lengths.
13. Prior opponent average rating relative to the current field and grade change.

All numerical columns use means/std fitted on 2021–2023 only, z clipped to ±3 and mapped to [0,1]. Missing features are neutral 0.5. Sparse rate features have explicit priors. The scaler is fixed for subsequent years. Training-period reports remain in-sample; preprocessing is not claimed to be out-of-time for 2021–2023.

## Search and assessment

Native deterministic sparse/random search and 10/5/2/1 percentage-point transfers use only 2021–2023 results. Both anchor modes and all 190 rank intervals are considered. Win-present and win-absent arms produce their own finalists. Each finalist is recalculated with the actual JavaScript site probabilities on 2024. The best arm/configuration is chosen on 2024 before later-period results are computed.

At least 40% of ALL source races must be covered, including missing-odds races in the denominator. Training and selection periods enforce the constraint and the selected configuration is checked on the full archive and later period. The search is finite and does not guarantee a global optimum. Later-period figures are not a fresh untouched holdout: the same archive was used in earlier experiments.

Final place odds are post-race data in this archive. Results are retrospective final-odds scenarios, not recorded pre-race predictions. Rate × average winning payout equals gross return for equal one-unit stakes.

## Compatibility and reproducibility

Saved 10-weight custom settings are migrated to explicit legacy mode and keep the old calculation. New custom settings store 13 integer weights. Existing learned-model mode is retained. Editing weights explicitly switches to v2.

Run .github/workflows/weighted-v2.yml for data construction, leakage/compatibility/archive checks, training-only search and exact chronological assessment. The normal publisher refreshes features and historical statistics without automatically reselecting the research winner.
