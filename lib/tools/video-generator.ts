import { prisma } from "../db";

export class VideoGenerator {
  /**
   * Submits an image to Luma Dream Machine to generate a 5-second cinematic video.
   * Returns the Generation ID that can be polled.
   */
  static async generateFromImage(imageUrl: string, prompt: string = "Cinematic slow motion, photorealistic, elegant product showcase"): Promise<string> {
    const settings = await prisma.integrationSettings.findFirst();
    const apiKey = settings?.videoGenerationApiKey;

    if (!apiKey) {
      throw new Error("Missing Video Generation API Key in Integration Settings.");
    }

    const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        keyframes: {
          frame0: {
            type: "image",
            url: imageUrl
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Video API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.id; // Luma generation ID
  }

  /**
   * Polls the Luma API to check if the video is complete.
   * If complete, returns the MP4 URL. If pending, returns null.
   */
  static async checkStatus(generationId: string): Promise<string | null> {
    const settings = await prisma.integrationSettings.findFirst();
    const apiKey = settings?.videoGenerationApiKey;

    if (!apiKey) {
      throw new Error("Missing Video Generation API Key.");
    }

    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Video API polling error: ${response.status}`);
    }

    const data = await response.json();

    if (data.state === "completed" && data.assets && data.assets.video) {
      return data.assets.video;
    }

    if (data.state === "failed") {
      throw new Error(`Video generation failed: ${data.failure_reason}`);
    }

    // Still processing
    return null;
  }
}
