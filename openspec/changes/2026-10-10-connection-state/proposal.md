# Connection readiness UX

## Why
Authentication and page-loading failures currently enter the CDP retry loop,
causing misleading transport errors and repeated waits.

## What changes
Separate transport retries from page readiness. Detect visible linking markers
without localized strings, report loading, and close unsuccessful CDP clients.

## Capabilities and impact
Modify connection readiness for all commands using the shared client, including
whoami, chats, read and poll-results. No automatic login or session changes.
