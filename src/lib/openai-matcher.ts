import type { YouTubeItem } from "./types";

type OptimizedTrack = {
  artist: string | null;
  title: string;
};

type ResponsesApiOutput = {
  output_text?: string;
  output?: {
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
};

export async function optimizeTrackWithOpenAI(
  item: YouTubeItem,
  parsed: OptimizedTrack
): Promise<OptimizedTrack> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_MATCHING_ENABLED !== "true") {
    return parsed;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
        input: [
          {
            role: "system",
            content:
              "Extract the most likely canonical song title and primary artist for Spotify search. Return only the schema."
          },
          {
            role: "user",
            content: JSON.stringify({
              youtubeTitle: item.title,
              channelTitle: item.channelTitle,
              currentGuess: parsed
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "spotify_track_guess",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                artist: { type: ["string", "null"] },
                title: { type: "string" }
              },
              required: ["artist", "title"]
            }
          }
        }
      })
    });

    if (!response.ok) return parsed;

    const data = (await response.json()) as ResponsesApiOutput;
    const text =
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .find((content) => content.type === "output_text" || content.text)?.text;

    if (!text) return parsed;

    const optimized = JSON.parse(text) as OptimizedTrack;
    if (!optimized.title?.trim()) return parsed;

    return {
      artist: optimized.artist?.trim() || parsed.artist,
      title: optimized.title.trim()
    };
  } catch {
    return parsed;
  }
}
