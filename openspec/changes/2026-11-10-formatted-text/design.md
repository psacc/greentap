# Design

The four roles were confirmed in a live snapshot of the sandbox chat. They are
Playwright ARIA roles, not localized strings (Tier 1). The same depth rules as
`text:` apply, so `body` still excludes quoted content.

Risk: a formatted run inside a quote container joins `text`, as plain quoted
text already does.
