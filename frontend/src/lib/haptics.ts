/** Light haptic feedback. No-op on web, vibrates on native (Capacitor). */
export async function hapticLight(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Web or plugin unavailable
  }
}
