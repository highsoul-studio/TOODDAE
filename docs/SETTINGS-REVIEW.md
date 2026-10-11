# Settings review

This review covers the current Set page and the new Write/Do feedback. It is an assessment, not an instruction to remove credentials, change account access, or add every possible preference.

## Current coverage

Set already covers light/dark background and accent, sunrise/sunset switching, provider/model/effort selection, API-key storage, supported subscription modes, destination consent and connection testing. Folder selection and language live in the shared header. Reduced motion follows the operating-system preference.

The existing controls are sufficient for the requested editing, search, note creation and section ordering. Those actions belong on their respective pages; they do not need extra Set toggles.

## Useful next additions

| Priority | Addition | Why | Current evidence |
| --- | --- | --- | --- |
| High | Explicit removal of a saved API key | Users can replace a key but cannot discover how to remove a provider's saved credential from the current form. Removal should confirm the provider and invalidate consent/Test readiness. | `lib/secrets.js` already accepts an empty key to remove it; the Set form exposes only Save. |
| High | Backup location/status and a clear recovery/export workflow | Delete Undo is brief, and cloud synchronization is not a backup. Users need a clear way to preserve notes and recover after accidental edits. Exports must exclude API keys and subscription credentials. | Notes have private recovery snapshots and the CLI has backup operations, while Set has no backup management. |
| Medium | A short explanation of completion eligibility | Future-deadline tasks remain visible but no longer block today's target. The due/no-due/routine and early-completion rules should be discoverable without introducing competing score settings. | Progress, history and streak now share a single eligibility contract. |
| Later | Explicit app timezone when remote/mobile hosting is added | The sunrise country is not an app timezone selector. A remotely hosted server may have a different local timezone from the user's device. | Server status exposes its timezone; current usage runs locally on the user's computer. |

Keyboard commands and Markdown syntax help should be shown near the Write editor. Duplicating language, theme or OS reduced-motion controls in Set would add competing sources of truth. No new settings were added merely to make this page larger.

## Source references

- [Set UI](../Dayline/public/settings.js)
- [Settings validation and storage](../Dayline/lib/settings.js)
- [Credential storage](../Dayline/lib/secrets.js)
- [Note snapshots](../Dayline/lib/notes.js)
- [CLI data operations](../Dayline/scripts/dl.mjs)
