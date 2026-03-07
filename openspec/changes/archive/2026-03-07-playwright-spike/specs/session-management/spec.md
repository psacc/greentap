## ADDED Requirements

### Requirement: Login via QR scan
The CLI SHALL provide `greentap login` to open a headed Chromium browser at WhatsApp Web for manual QR code scanning. The session SHALL persist in `~/.greentap/browser-data/`.

#### Scenario: First login
- **WHEN** user runs `greentap login` with no existing session
- **THEN** a headed browser opens at `https://web.whatsapp.com` and the CLI waits until the user closes the browser window

#### Scenario: Re-login after session expiry
- **WHEN** user runs `greentap login` with an expired session
- **THEN** the browser opens showing the QR code page for re-authentication

### Requirement: Logout
The CLI SHALL provide `greentap logout` to clear all session data.

#### Scenario: Logout clears session
- **WHEN** user runs `greentap logout`
- **THEN** the `~/.greentap/browser-data/` directory is removed and a confirmation message is printed

#### Scenario: Logout with no existing session
- **WHEN** user runs `greentap logout` with no session data
- **THEN** the command completes without error
