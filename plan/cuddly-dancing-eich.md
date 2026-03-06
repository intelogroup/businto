# Plan: Form card height — content-based, not stretched

## Context
The form card currently stretches to match the chat panel height via CSS (`items-stretch` on the grid, `h-full` on the column wrapper and card). This leaves large empty space below the form fields on step 1. The fix is to let the card size to its content.

## Change

**File:** `src/components/forms.tsx`

3 small class removals on adjacent lines (~554–559):

| Element | Current | Change |
|---|---|---|
| 2-col grid (line ~554) | `items-stretch` | replace with `items-start` |
| Left column div (line ~558) | `h-full` in className | remove |
| Form card div (line ~559) | `h-full flex flex-col` | remove `h-full`, remove `flex flex-col` |

## Verification
- Dev server: form card should hug its content height on step 1, and grow as step 2 fields animate in
- Chat panel on the right remains unaffected (it has its own height from its content)
- No logic changes needed — purely presentational
