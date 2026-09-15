# Quarterly assessment and grade-adjusted records (v3)

Implements the requested priorities 1–3 only: repeated time-ordered assessment, improved record features, and venue-specific weights.

## Features and compatibility

V3 preserves the existing thirteen concepts while replacing the speed reference with a median of preceding winning times in venue/distance/grade/track. It falls back to venue/distance/grade, requires 20 prior records, and treats unknown grades as missing. Last-five-start median, shrunk best record, and consistency (negative standard deviation, at least three records) extend the user controls to 16 integer weights. All features use a fixed scaler fitted through 2023-09-30, before the earliest inner selection period. Every race date is computed before outcomes from that date update history.

Saved ten-weight and thirteen-weight custom settings explicitly retain their v1/v2 calculations. Regional mode stores a common fallback plus three 16-weight arrays; editing a venue changes only that array. The historical worker caches by the effective weights for each race's venue.

## Nested chronological experiment

For each quarter starting in 2024, consider the preceding 24 and 36 months. The last three months within that window are the selection period; the preceding 21 or 33 months are used for candidate generation. Five record variants are compared: mean, median, best, mean with consistency, and a blend of all four record features. Candidate generation uses deterministic native search, integer 5/1-point transfers, both anchors and rank intervals. Finalists are recalculated with the site's exact JavaScript probability engine on the selection quarter.

Coverage may shift when field sizes change. Selection therefore limits ranges using only historical field sizes/odds availability: in every preceding training and selection quarter, at least 60% of ALL races must have at least two ranks available within the range, giving a buffer above the final 40% gate. Native generation applies the training-only restriction. No next-quarter outcome is used to change a chosen configuration. The actual subsequent-quarter result must pass 40% of ALL races, including missing-data races in the denominator. Infeasible experiments fail rather than hiding the quarter. Search is finite and not a global-maximum claim.

For the selected common strategy, regional candidate weights are blended with the common weights using n/(n+1000). A region needs at least 500 training races and 100 selection races, otherwise it uses common weights. The regional candidate is retained only if it beats common weights on the inner selection period. Both common and regional strategies are evaluated in the following quarter; a third series chooses between them solely on the preceding selection period. The shared anchor and rank interval remain the same across venues.

Daily-closing maximum drawdown is computed from cumulative equal-one-unit net payouts; it does not assume an intraday ordering between venues. Headline rate × average winning payout remains the selection objective.

## Interpretation and updates

The full-archive recalculation of the latest fixed preset differs from the sequence of quarter-specific predictions. Both are explicitly labeled. The historical archive was already used in prior experiments; repeated quarterly assessment is not an untouched future test. Final place odds are retrospective, not evidence of pre-race executable performance.

Only race dates before today in Korea enter research, avoiding incomplete current-day cards and future scheduled cards. The publishing workflow refreshes features each run and retains frozen settings within a quarter. On arrival of a completed race day in a new quarter it recomputes the rolling report. Old presets and previous reports remain available. UI tests verify regional edits, persistence and loading the newest report; report tests replay frozen quarter settings through the actual site engine.
