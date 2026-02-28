// Edge Function: send-invite-email
// Triggered by a Supabase Database Webhook on INSERT to public.room_memberships.
// Looks up the room's company name, then sends a branded invite email via Resend.
//
// Required secrets (set in Supabase Dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY  — your Resend API key
//   SUPABASE_URL    — your project URL (auto-injected by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY — service role key (auto-injected by Supabase)
//   APP_URL         — e.g. https://www.zetarooms.com (no trailing slash)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FROM_ADDRESS = 'invites@zetarooms.com';
const FROM_NAME    = 'ZetaRooms';

Deno.serve(async (req: Request): Promise<Response> => {
      try {
              const payload = await req.json();

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

        if (record.status === 'accepted') {
                  return new Response('ignored', { status: 200 });
        }

        const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
              const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              const resendApiKey     = Deno.env.get('RESEND_API_KEY')!;
              const appUrl           = Deno.env.get('APP_URL') ?? 'https://www.zetarooms.com';

        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const { data: room, error: roomError } = await supabase
                .from('data_rooms')
                .select('company_name')
                .eq('id', record.room_id)
                .single();

        if (roomError || !room) {
                  console.error('Failed to fetch room:', roomError);
                  return new Response('room not found', { status: 500 });
        }

        const inviteUrl = `${appUrl}/dataroom.html?id=${record.room_id}&invite=${record.token}`;
              const companyName = room.company_name ?? 'a company';

        const htmlBody = `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>You've been invited to ${companyName}'s data room</title>
              </head>
              <body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:40px 0;">
                    <tr>
                          <td align="center">
                                  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                                            <tr>
                                                        <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e7eb;">
                                                                      <span style="font-size:15px;font-weight:600;color:#111827;letter-spacing:-0.01em;">ZetaRooms</span>
                                                                                  </td>
                                                                                            </tr>
                                                                                                      <tr>
                                                                                                                  <td style="padding:32px 40px;">
                                                                                                                                <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;letter-spacing:-0.02em;">
                                                                                                                                                You've been invited to ${companyName}'s data room
                                                                                                                                                              </p>
                                                                                                                                                                            <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6;">
                                                                                                                                                                                            You've been granted access to review confidential materials. Click the button below to open the data room.
                                                                                                                                                                                                          </p>
                                                                                                                                                                                                                        <a href="${inviteUrl}"
                                                                                                                                                                                                                                         style="display:inline-block;padding:10px 20px;background:#111827;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;border-radius:5px;letter-spacing:-0.01em;">
                                                                                                                                                                                                                                                         Open Data Room
                                                                                                                                                                                                                                                                       </a>
                                                                                                                                                                                                                                                                                     <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
                                                                                                                                                                                                                                                                                                     If the button doesn't work, copy and paste this link:<br/>
                                                                                                                                                                                                                                                                                                                     <a href="${inviteUrl}" style="color:#6b7280;word-break:break-all;">${inviteUrl}</a>
                                                                                                                                                                                                                                                                                                                                   </p>
                                                                                                                                                                                                                                                                                                                                               </td>
                                                                                                                                                                                                                                                                                                                                                         </tr>
                                                                                                                                                                                                                                                                                                                                                                   <tr>
                                                                                                                                                                                                                                                                                                                                                                               <td style="padding:20px 40px;border-top:1px solid #e5e7eb;">
                                                                                                                                                                                                                                                                                                                                                                                             <p style="margin:0;font-size:12px;color:#9ca3af;">
                                                                                                                                                                                                                                                                                                                                                                                                             Sent by ZetaRooms &mdash; Institutional data rooms for serious founders.
                                                                                                                                                                                                                                                                                                                                                                                                                           </p>
                                                                                                                                                                                                                                                                                                                                                                                                                                       </td>
                                                                                                                                                                                                                                                                                                                                                                                                                                                 </tr>
                                                                                                                                                                                                                                                                                                                                                                                                                                                         </table>
                                                                                                                                                                                                                                                                                                                                                                                                                                                               </td>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                   </tr>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </table>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </body>
                                                                                                                                                                                                                                                                                                                                                                                                                                                                     </html>`;

        const textBody = `You've been invited to ${companyName}'s data room on ZetaRooms.\n\nClick the link below to open it:\n${inviteUrl}\n\n---\nSent by ZetaRooms`;

        const resendRes = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                              'Authorization': `Bearer ${resendApiKey}`,
                              'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                              from: `${FROM_NAME} <${FROM_ADDRESS}>`,
                              to: [record.email],
                              subject: `You've been invited to ${companyName}'s data room`,
                              html: htmlBody,
                              text: textBody,
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
