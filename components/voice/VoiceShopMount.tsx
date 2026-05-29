import { brand } from "@/brand.config";
import { getVoiceShopSettings } from "@/lib/voice/settings";
import VoiceShopButton from "@/components/voice/VoiceShopButton";

/**
 * Server-component wrapper der gater VoiceShopButton bag compile-time
 * brand.features.voiceShop + runtime settings.voiceShopEnabled + apiKey.
 *
 * Mounteres i app/[locale]/layout.tsx ved siden af AIStylistButton. Returnerer
 * null hvis voice ikke er aktiveret — så er der ingen overhead på shops der
 * ikke bruger feature'et.
 */
export default async function VoiceShopMount() {
  const features = (brand.features ?? {}) as Record<string, boolean | undefined>;
  if (!features.voiceShop) return null;

  const settings = await getVoiceShopSettings();
  if (!settings.configured) return null;

  return (
    <VoiceShopButton
      capabilities={{
        vision: settings.visionEnabled,
        maxMinutes: settings.maxMinutesPerSession,
        visionEnabled: settings.visionEnabled,
      }}
    />
  );
}
