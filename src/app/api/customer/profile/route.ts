import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, requireUser } from '@/lib/supabase-server';

/**
 * GET /api/customer/profile
 *
 * Returns the authenticated customer's profile including contact info
 * and saved medical transport preferences.
 *
 * SECURITY: Authenticated users only. Scoped to own profile.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch profile from unified_profiles view
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, role, transport_preferences, sms_opt_in, created_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching customer profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch profile' },
        { status: 500 }
      );
    }

    // If profile doesn't exist yet, return defaults from auth user
    if (!profile) {
      return NextResponse.json({
        profile: {
          id: user.id,
          fullName: user.user_metadata?.full_name || '',
          email: user.email || '',
          phone: '',
          smsOptIn: false,
          transportPreferences: null,
        },
      });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        fullName: profile.full_name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        smsOptIn: profile.sms_opt_in ?? false,
        transportPreferences: profile.transport_preferences || null,
      },
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/customer/profile
 *
 * Updates the customer's profile fields:
 * - full_name
 * - phone
 * - sms_opt_in (boolean — opt in/out of Brevo SMS notifications)
 * - transport_preferences (saved medical transport preferences)
 *
 * SECURITY: Authenticated users only. Scoped to own profile.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Whitelist of updatable fields
    const allowedFields = ['full_name', 'phone', 'sms_opt_in', 'transport_preferences'];
    const updateData: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Validate full_name
    if (updateData.full_name !== undefined) {
      if (typeof updateData.full_name !== 'string' || updateData.full_name.trim().length < 1) {
        return NextResponse.json(
          { error: 'Name must be at least 1 character' },
          { status: 400 }
        );
      }
      updateData.full_name = updateData.full_name.trim();
    }

    // Validate phone (basic validation)
    if (updateData.phone !== undefined) {
      if (typeof updateData.phone !== 'string') {
        return NextResponse.json(
          { error: 'Phone must be a string' },
          { status: 400 }
        );
      }
      // Allow empty string to clear, or validate format
      if (updateData.phone && !/^[\d\s\-+().]{7,20}$/.test(updateData.phone)) {
        return NextResponse.json(
          { error: 'Invalid phone number format' },
          { status: 400 }
        );
      }
    }

    // Validate sms_opt_in
    if (updateData.sms_opt_in !== undefined) {
      if (typeof updateData.sms_opt_in !== 'boolean') {
        return NextResponse.json(
          { error: 'sms_opt_in must be a boolean' },
          { status: 400 }
        );
      }
    }

    // Validate transport_preferences structure
    if (updateData.transport_preferences !== undefined) {
      const prefs = updateData.transport_preferences;
      if (prefs !== null && typeof prefs !== 'object') {
        return NextResponse.json(
          { error: 'Transport preferences must be an object or null' },
          { status: 400 }
        );
      }
      if (prefs) {
        const validMobility = ['ambulatory', 'wheelchair', 'manual-wheelchair', 'electric-wheelchair', 'stretcher'];
        const validServiceLevel = ['curb-to-curb', 'door-to-door', 'door-through-door', 'hand-to-hand'];

        if (prefs.default_mobility && !validMobility.includes(prefs.default_mobility)) {
          return NextResponse.json(
            { error: `Invalid mobility level: ${prefs.default_mobility}` },
            { status: 400 }
          );
        }
        if (prefs.default_service_level && !validServiceLevel.includes(prefs.default_service_level)) {
          return NextResponse.json(
            { error: `Invalid service level: ${prefs.default_service_level}` },
            { status: 400 }
          );
        }
      }
    }

    // Upsert profile — handles case where profile row may not exist yet
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabaseAdmin
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select('id, full_name, email, phone, sms_opt_in, transport_preferences')
        .single();
    } else {
      result = await supabaseAdmin
        .from('profiles')
        .insert({ id: user.id, email: user.email, ...updateData })
        .select('id, full_name, email, phone, sms_opt_in, transport_preferences')
        .single();
    }

    if (result.error) {
      console.error('Customer profile update error:', result.error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Also sync name to auth metadata if full_name was updated
    if (updateData.full_name) {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { full_name: updateData.full_name },
      });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: result.data.id,
        fullName: result.data.full_name || '',
        email: result.data.email || '',
        phone: result.data.phone || '',
        smsOptIn: result.data.sms_opt_in ?? false,
        transportPreferences: result.data.transport_preferences || null,
      },
    });
  } catch (error) {
    console.error('Error updating customer profile:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
