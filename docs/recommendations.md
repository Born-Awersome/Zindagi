# Recommendation design: hybrid-v1

## Why this baseline

Zindagi has no real interaction dataset yet. A pretrained language model would add latency, cost, and a new destination for personal data without demonstrating better matches. Collaborative filtering alone has a cold-start problem. The current model combines explicit interests with observed activity and optional geography; it runs locally on the Node server and returns human-readable reasons.

This is a practical baseline for a hackathon, not a claim that one model is universally best.

## Candidate eligibility

- Require authenticated requests.
- Include only people who explicitly enabled profile discovery.
- Exclude the requesting user and blocked relationships in either direction.
- In nearby mode, both users need unexpired approximate presence and must be within the selected radius. A denied permission never falls back to a guessed location.
- No emails, usernames, hashes, coordinates, or precise distances are returned in candidate responses.

## People score

Available signals are weighted and normalized by the sum of their weights:

| Signal | Weight | Implementation |
| --- | --- | --- |
| Shared focus | 0.35 | Same chosen life aspect |
| Goal overlap | 0.20 | Jaccard overlap of Unicode word tokens; simple stopwords removed |
| Activity balance | 0.25 | Cosine similarity of five `log(1 + points)` values, omitted when either user has no points |
| Approximate proximity | 0.10 | `exp(-kilometres / 10)`, omitted without both locations |
| Recency | 0.10 | Exponential decay over 30 days since profile edit or task completion |

The activity signal uses direction and compresses counts; it does not rank people by total XP or popularity. With no activity history, explicit interests and goals still provide matching signals. Goal overlap is lexical, not multilingual semantic understanding. Weights are hand-chosen and have not been tuned on user outcomes.

After scoring, a greedy diversity pass subtracts 0.08 for each already-selected recommendation with the same focus. This gently mixes interests instead of returning only one category. A deterministic ID tie-break keeps results stable. Responses give reasons, not a misleading match-probability percentage.

## Tasks and guilds

Tasks rank by current focus (0.65) and opportunity for balance (0.35, based on lower category points relative to the user's highest category). Durations and rewards never change to maximize engagement.

Guild discovery places groups with eligible, actively nearby members first, then groups matching the user's focus. Membership and leaderboard visibility remain explicit user actions. Guild recommendation is an understandable heuristic rather than a separate learned model.

## Validation today

Automated tests check cold-start finite scores, focus ordering, nearby radius exclusion, privacy opt-out, blocked relationships, presence expiration, and deterministic tie behavior. Browser checks exercise real API recommendations with two independent test accounts. These establish functional correctness, **not recommendation quality**.

## Evidence needed before a learned upgrade

Collect only necessary, consented events: recommendation shown, explanation shown, profile opened, circle added/removed, guild joined/left, and later shared challenge participation. Keep raw coordinates out of these events. Include impression logging so unseen candidates are not treated as negative examples. Do not infer sensitive traits.

Use chronological train/validation/test splits with user-level leakage checks. Evaluate Recall@K and NDCG@K alongside acceptance rate, retained guild participation, diversity, coverage for new users, and opt-out rates. Compare against focus-only, distance-only, and hybrid-v1 baselines. Do not optimize for time spent on the site.

With enough feedback, a two-stage system is a sensible next experiment:

1. Retrieve eligible candidates using geography, interests, and optional embeddings of user-provided goals.
2. Rank with a supervised learning-to-rank model such as LightGBM LambdaMART using the interpretable signals above plus consented interaction features.
3. Retain eligibility/privacy checks and diversity reranking outside the model; retain hybrid-v1 as the cold-start fallback.

Choose the winner from held-out results and a small controlled experiment. Training, evaluation datasets, and claimed quality improvements are intentionally not fabricated for this initial release.
