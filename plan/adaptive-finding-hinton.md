# Plan: Remove Chat Autofocus + Supabase Chat History

## Context
The AI chat panel (`AIChatPanel`) currently has no explicit `autoFocus` attribute, but the browser default behavior causes the chat input to receive focus on page load. Additionally, all chat messages are ephemeral (client-side only via `useChat`). This plan: (1) removes the unwanted focus behavior, and (2) adds Supabase persistence so chat history survives page reloads.

---

## Part 1 — Remove Autofocus

**File:** [src/components/dashboard/ai-chat-panel.tsx](src/components/dashboard/ai-chat-panel.tsx)

No explicit `autoFocus` exists anywhere in the codebase. The browser is picking up the chat input as the first focusable element in the viewport on page load.

**Fix:** Add a `useRef` on the `Input` and blur it on mount.

```tsx
// Add inputRef alongside existing refs
const inputRef = useRef<HTMLInputElement>(null);

// New effect: blur the input on mount to prevent browser auto-focus
useEffect(() => {
    inputRef.current?.blur();
}, []); // empty deps = runs once on mount

// Add ref to the Input element
<Input
    ref={inputRef}
    placeholder="How can I help you?"
    ...
/>
```

No other files need to change for this.

---

## Part 2 — Supabase Chat History

### Schema (new migration)

**File to create:** `supabase/migrations/20260305000001_add_ai_chat_history.sql`

```sql
-- AI conversation sessions (one per user session)
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Individual messages within a session
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_ai_chat_sessions_user ON public.ai_chat_sessions(user_id);
CREATE INDEX idx_ai_chat_messages_session ON public.ai_chat_messages(session_id);

-- RLS
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own sessions" ON public.ai_chat_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own session messages" ON public.ai_chat_messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions
            WHERE id = session_id AND user_id = auth.uid()
        )
    );
```

### Client-side changes

**File:** [src/components/dashboard/ai-chat-panel.tsx](src/components/dashboard/ai-chat-panel.tsx)

Add Supabase browser client + persistence logic:

1. **On mount** (when `user` is available): load the most recent session's messages from `ai_chat_messages` and use them as `initialMessages` for `useChat`. If no session exists, create one.

2. **After user sends a message**: save the user message to `ai_chat_messages` (insert immediately after `sendMessage` is called).

3. **After AI response completes**: when `status` transitions from `'streaming'` to `'ready'` (watch via `useEffect` on `status`), save the last message in the `messages` array (the assistant reply).

Key implementation detail — use a `useEffect` to detect stream completion:
```tsx
const prevStatusRef = useRef(status);
useEffect(() => {
    if (prevStatusRef.current === 'streaming' && status === 'ready') {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant') {
            saveMessage(supabase, sessionId, 'assistant', getMsgText(lastMsg));
        }
    }
    prevStatusRef.current = status;
}, [status]);
```

4. **Session management**: store the current `sessionId` in a `useRef`. On mount, fetch or create:
```
GET ai_chat_sessions WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 1
  → if found: load its messages, set sessionId
  → if not found: INSERT new session, set sessionId
```

5. **Unauthenticated users**: skip persistence entirely (chat still works, just not saved).

### Helper function (inline in component):
```tsx
async function saveMessage(supabase, sessionId: string, role: string, content: string) {
    await supabase.from('ai_chat_messages').insert({ session_id: sessionId, role, content });
    await supabase.from('ai_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);
}
```

### No API route changes needed
The `/api/chat/route.ts` already fetches trip context per-request. No changes needed there.

---

## Critical Files
- [src/components/dashboard/ai-chat-panel.tsx](src/components/dashboard/ai-chat-panel.tsx) — main changes
- `supabase/migrations/20260305000001_add_ai_chat_history.sql` — new migration (to be applied via `supabase db push`)
- [src/lib/supabase/client.ts](src/lib/supabase/client.ts) — reuse `createClient()` (no changes needed)

---

## Verification

1. **Autofocus**: Load the home/dashboard page → chat input should NOT be focused. User can still click or tab into it normally.

2. **Chat persistence**:
   - Log in → send a few messages
   - Hard-refresh the page → messages should reload from DB
   - Check Supabase: `ai_chat_sessions` and `ai_chat_messages` tables should have rows
   - Log out → verify no data leaks (RLS blocks reads)

3. **Unauthenticated**: Chat still works, just no persistence.

4. **Run tests**: `npm run test:production` — changes are additive, no regressions expected.
