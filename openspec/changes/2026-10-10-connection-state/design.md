# Design

Probe visible chat-grid and QR/link-device markers. A generic canvas is not an
authentication signal because chats can contain media. Unknown UI remains loading;
after a bounded wait it gets retry guidance, rather than a logout diagnosis.
Poll during loading so a QR appearing later is detected promptly. Preserve one
reload recovery and informational-modal handling. Keep retries confined to CDP
establishment; disconnect on readiness or locale-detection failure.

Diagnostics go to stderr so JSON stdout stays clean. Do not change authentication,
restart a shared daemon, or capture account data to test logout.

Risk: upstream structural markers can change. Synthetic DOM tests verify the
chosen signals; live validation remains required before merge.
