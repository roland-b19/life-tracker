## Summary
<What changed and why, in a few lines. The decisions it adds or changes. The files it shares with other work in progress (overlap check), or "Shares no files with other work.">

## Testing
| Command | Result |
|---|---|
| <each command run, such as the one check command> | <its exact result, such as "124 tests OK"> |

## Risk
Tier: <Low|Medium|High>
<The tier script's reason lines.>

## Review
| Change | Proof | Confidence |
|---|---|---|
| <one part of the change> | <the test or command output that proves it works> | <High, Medium or Low> |

| Finding | Where | Tag | Confidence | Proof | Outcome |
|---|---|---|---|---|---|
| <what is wrong> | <file:line> | <Important, Nit or Pre-existing> | <High, Medium or Low> | <the failing test, output or code read that shows it> | <Fixed in commit, or why not> |

<Write "No findings." instead of the findings table when the review found none. Then the rounds run, such as "2 rounds: /code-review high, /security-review".>

Confidence: High = a test fails without the fix, or command output shows it. Medium = confirmed by reading the code. Low = plausible only.

## How to revert
`git revert -m 1 <merge commit>`
<Any data or setting to restore after the revert, or "Nothing else.">

<The attribution lines the session was given for pull requests.>
