/**
 * Cached App Settings
 * ===================
 * Provides in-memory caching for Supabase `app_settings` rows.
 * Eliminates the ~135ms DB round-trip that was paid on *every*
 * POST /api/requests and POST /api/quotes/accept call.
 *
 * TTL: 60 seconds — settings changes propagate within 1 minute.
 */

import { supabaseAdmin } from './supabase-server';

interface SettingsCache {
    manual_dispatch_mode: boolean;
    expires: number;
}

let _cache: SettingsCache | null = null;
const TTL_MS = 60_000; // 60 seconds

/**
 * Returns the current manual_dispatch_mode value.
 * First call hits Supabase; subsequent calls use in-memory cache until TTL expires.
 */
export async function getDispatchMode(): Promise<boolean> {
    if (_cache && Date.now() < _cache.expires) {
        return _cache.manual_dispatch_mode;
    }

    const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'manual_dispatch_mode')
        .maybeSingle();

    if (error) {
        console.error('[app-settings] Failed to fetch manual_dispatch_mode:', error.message);
        // Return cached stale value if available, otherwise default safe value (false = auto-dispatch)
        return _cache?.manual_dispatch_mode ?? false;
    }

    _cache = {
        manual_dispatch_mode: data?.value === true,
        expires: Date.now() + TTL_MS,
    };

    return _cache.manual_dispatch_mode;
}

/**
 * Force-invalidates the cache (e.g. after an admin update).
 * Call this from any admin endpoint that modifies app_settings.
 */
export function invalidateSettingsCache(): void {
    _cache = null;
    console.log('[app-settings] Cache invalidated');
}
