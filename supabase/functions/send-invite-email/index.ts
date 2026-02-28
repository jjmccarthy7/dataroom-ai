// Edge Function: send-invite-email
// Triggered by a Supabase Database Webhook on INSERT to public.room_memberships.
// Looks up the room's company name, then sends a branded invite email via Resend.
//
// Required secrets (set in Supabase Dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY   — your Resend API key
//   RESEND_TEMPLATE_ID — the Resend template ID for the invite email
//   SUPABASE_URL     — your project URL (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY — service role key (auto-injected by Supabase)
//   APP_URL          — e.g. https://www.zetarooms.com  (no trailing slash)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FROM_ADDRESS = 'invites@zetarooms.com';
const FROM_NAME    = 'ZetaRooms';

Deno.serve(async (req: Request): Promise<Response> => {
    try {
          // Supabase Database Webhooks send a POST with a JSON body shaped as:
      // { type: 'INSERT', table: 'room_memberships', record: { ... }, ... }
      const payload = await req.json();

      // Only process INSERT events
      if (payload.type !== 'INSERT') {
              return new Response('ignored', { status: 200 });
      }

      const record = payload.record as {
              id: string;
              room_id: string;
              email: string;
              token: string;
              status: string;
      };

      // Skip if somehow already accepted (shouldn't happen on INSERT, but be safe)
      if (record.status === 'accepted') {
              return new Response('ignored', { status: 200 });
      }

      const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
          const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const resendApiKey    = Deno.env.get('RESEND_API_KEY')!;
          const resendTemplateId = Deno.env.get('RESEND_TEMPLATE_ID')!;
          const appUrl          = Deno.env.get('APP_URL') ?? 'https://www.zetarooms.com';

      // Use service role client so we can read data_rooms without RLS restriction
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      // Look up the room's company name
      const { data: room, error: roomError } = await supabase
            .from('data_rooms')
            .select('company_name')
            .eq('id', record.room_id)
            .single();

      if (roomError || !room) {
              console.error('Failed to fetch room:', roomError);
              return new Response('room not found', { status: 500 });
      }

      // Build the invite deep-link
      const inviteUrl = `${appUrl}/dataroom.html?id=${record.room_id}&invite=${record.token}`;

      // Send via Resend using a template
      const resendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                        'Authorization': `Bearer ${resendApiKey}`,
                        'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                        from:        `${FROM_NAME} <${FROM_ADDRESS}>`,
                        to:          [record.email],
                        template_id: resendTemplateId,
                        // Variables passed into the Resend template
                        variables: {
                                    company_name: room.company_name,
                                    invite_url:   inviteUrl,
                        },
              }),
      });

      if (!resendRes.ok) {
              const body = await resendRes.text();
              console.error('Resend error:', resendRes.status, body);
              return new Response('email send failed', { status: 500 });
      }

      const resendData = await resendRes.json();
          console.log('Email sent:', resendData.id, '→', record.email);

      return new Response(JSON.stringify({ ok: true, emailId: resendData.id }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
      });

    } catch (err) {
          console.error('Unexpected error:', err);
          return new Response('internal error', { status: 500 });
    }
});
