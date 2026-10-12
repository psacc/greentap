# Connection state

- WHEN a visible QR/link-device screen is present THEN fail promptly with
  `greentap login` and QR-scan guidance, without transport retries or reloads.
- WHEN a page is loading THEN announce the wait on stderr, poll until ready or
  logged out, and use loading/retry guidance if the readiness budget expires.
- WHEN a visible chat grid is ready THEN preserve ordinary command behavior and
  existing safe informational-modal dismissal.
- WHEN CDP is warming up THEN retry establishment with a startup/reconnect notice;
  never wrap an authentication error as a CDP error.
- WHEN preparation fails THEN disconnect the acquired client.
