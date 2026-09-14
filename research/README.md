# Joint anchor, rank interval and weight search

The objective is winning QPL payout sum / evaluated races, equivalent to hit rate
times mean winning payout. Losing races contribute zero. A race without a valid
final place market, confirmed QPL results or a partner in the selected interval is
excluded using the site's existing policy. Cancelled horses are excluded from
selection exactly as in the site, while the model's original field is retained.

This is retrospective same-data optimization over the available 2021–2026 archive.
It is not out-of-sample validation. Existing learned models and final odds have
the same limitations as the site's historical statistics. Choosing the maximum
among many configurations can overfit, particularly for rare high-rank intervals.
The report includes the unconstrained maximum and a separate maximum requiring
at least 80% of the baseline's evaluable races. Neither is a guaranteed global
maximum over every possible weight vector or a forecast of future returns.

Reproduce from repository root (Node.js and g++ with OpenMP):

```sh
node scripts/export-search.cjs /tmp/betkj3-search-input.txt
g++ -O3 -std=c++17 -fopenmp -ffp-contract=off scripts/search-strategy.cpp -o /tmp/betkj3-search
OMP_NUM_THREADS=6 /tmp/betkj3-search /tmp/betkj3-search-input.txt research/strategy-search-finalists.json
node scripts/verify-search.cjs research/strategy-search-finalists.json
node scripts/check-search-report.cjs
```

Search weights are integer percentages summing to 100. The deterministic seed is
20260914. Initial candidates include default, single-feature, two-feature and
random sparse/dense weights. Both anchor modes and all 190 contiguous rank ranges
from 2 through 20 are screened per vector. Local transfers use 10, 5, 2 and 1
percentage-point increments around the strongest broad and unconstrained vectors.

Native screening uses the monotonic ordering of Plackett–Luce strengths for custom
probabilities. Ties and floating-point probability sums can alter the site's tie
breaks, so finalists are recomputed using actual TuningModel probabilities and
Betkj3Policy comparisons. The current learned model is also compared exhaustively.
The selected reports are finally checked against QplHistoryEngine, including each
year's counts and winning payouts. Source hashes are recorded in strategy-search.json.
