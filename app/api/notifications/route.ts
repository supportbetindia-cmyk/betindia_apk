import { NextResponse } from 'next/server';
import { osConfigured, fetchNotifications, fetchApp, fetchSegments } from '@/lib/onesignal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  if (!osConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const [notifs, app, segments] = await Promise.all([
      fetchNotifications(50),
      fetchApp().catch(() => null),
      fetchSegments().catch(() => []),
    ]);

    let sent = 0;
    let delivered = 0;
    let opened = 0;

    const recent = notifs.map((n) => {
      const attempted = (n.successful ?? 0) + (n.failed ?? 0);
      const deliv = n.successful ?? 0;
      const open = n.converted ?? 0;
      sent += attempted;
      delivered += deliv;
      opened += open;

      const scheduledFuture = n.send_after && n.send_after * 1000 > Date.now();
      const status = n.completed_at ? 'Completed' : scheduledFuture ? 'Scheduled' : 'Sent';

      return {
        id: n.id,
        title: n.headings?.en || n.contents?.en || '(no title)',
        audience: (n.included_segments && n.included_segments.length ? n.included_segments.join(', ') : 'All Users'),
        sent: attempted,
        delivered: deliv,
        opened: open,
        ctr: deliv ? Math.round((open / deliv) * 1000) / 10 : 0,
        status,
        at: (n.completed_at ?? n.queued_at ?? 0) * 1000,
      };
    });

    const openRate = delivered ? Math.round((opened / delivered) * 1000) / 10 : 0;

    // Uninstall estimate: devices OneSignal has ever seen minus those still
    // reachable. A device becomes unreachable when the app is uninstalled or
    // the user turns notifications off — so this is an upper bound on uninstalls.
    const totalDevices = app?.players ?? null;
    const subscribers = app?.messageable_players ?? app?.players ?? null;
    const unsubscribed =
      totalDevices != null && subscribers != null ? Math.max(0, totalDevices - subscribers) : null;

    return NextResponse.json({
      configured: true,
      summary: {
        sent,
        delivered,
        opened,
        openRate,
        subscribers,
        totalDevices,
        unsubscribed,
      },
      segments: segments.map((s) => s.name),
      recent: recent.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ configured: true, error: message }, { status: 500 });
  }
}
