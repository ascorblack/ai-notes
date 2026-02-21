/**
 * Schedule local notifications for task deadlines.
 * Uses @capacitor/local-notifications. No-op on web.
 */

const MINUTES_BEFORE = 15;
const PREFIX = "task_deadline_";

function toId(taskId: number): number {
  return Math.abs((PREFIX + taskId).split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)) % 2147483647;
}

export async function scheduleReminder(taskId: number, title: string, deadline: string): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications: LN } = await import("@capacitor/local-notifications");
    await LN.requestPermissions();
    const perm = await LN.checkPermissions();
    if (perm.display !== "granted") return;

    const at = new Date(deadline);
    at.setMinutes(at.getMinutes() - MINUTES_BEFORE);
    if (at.getTime() <= Date.now()) return;

    await LN.schedule({
      notifications: [
        {
          id: toId(taskId),
          title: "Напоминание",
          body: title || "Задача",
          schedule: { at, allowWhileIdle: true },
          extra: { taskId },
        },
      ],
    });
  } catch {
    // Web or plugin unavailable
  }
}

export async function cancelReminder(taskId: number): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: toId(taskId) }] });
  } catch {
    // ignore
  }
}
