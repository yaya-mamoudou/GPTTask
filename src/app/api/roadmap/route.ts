import { NextResponse } from "next/server";

type ClientMessage = {
  role: "assistant" | "user";
  text: string;
};

type ClientTask = {
  title: string;
  notes: string;
  weekLabel: string;
  done?: boolean;
};

type ClientPhase = {
  title: string;
  summary: string;
  focus: string;
  tasks: ClientTask[];
};

type ClientRoadmap = {
  config: {
    topic: string;
    level: "beginner" | "intermediate" | "advanced";
    weeks: number;
    phases: number;
    intensity: "light" | "steady" | "intense";
    emphasis: "balanced" | "fundamentals" | "projects";
    capstone: boolean;
  };
  phases: ClientPhase[];
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const roadmapPayloadSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    config: {
      type: "object",
      additionalProperties: false,
      properties: {
        topic: { type: "string", minLength: 1 },
        level: {
          type: "string",
          enum: ["beginner", "intermediate", "advanced"],
        },
        weeks: { type: "integer", minimum: 1, maximum: 52 },
        phases: { type: "integer", minimum: 1, maximum: 12 },
        intensity: {
          type: "string",
          enum: ["light", "steady", "intense"],
        },
        emphasis: {
          type: "string",
          enum: ["balanced", "fundamentals", "projects"],
        },
        capstone: { type: "boolean" },
      },
      required: [
        "topic",
        "level",
        "weeks",
        "phases",
        "intensity",
        "emphasis",
        "capstone",
      ],
    },
    phases: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          focus: { type: "string", minLength: 1 },
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string", minLength: 1 },
                notes: { type: "string", minLength: 1 },
                weekLabel: { type: "string", minLength: 1 },
              },
              required: ["title", "notes", "weekLabel"],
            },
          },
        },
        required: ["title", "summary", "focus", "tasks"],
      },
    },
  },
  required: ["config", "phases"],
} as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: {
      type: "string",
      minLength: 1,
    },
    mode: {
      type: "string",
      enum: ["chat", "clarify", "create_roadmap", "update_roadmap"],
    },
    readiness: {
      type: "string",
      enum: ["insufficient", "sufficient"],
    },
    missingInformation: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
    },
    roadmap: {
      anyOf: [roadmapPayloadSchema, { type: "null" }],
    },
  },
  required: [
    "assistantMessage",
    "mode",
    "readiness",
    "missingInformation",
    "roadmap",
  ],
} as const;

function extractStructuredText(response: GeminiResponse) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) {
        return part.text;
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Missing GEMINI_API_KEY. Add it to your environment before generating roadmaps.",
      },
      { status: 500 },
    );
  }

  let body: {
    messages?: ClientMessage[];
    currentRoadmap?: ClientRoadmap;
  };

  try {
    body = (await request.json()) as {
      messages?: ClientMessage[];
      currentRoadmap?: ClientRoadmap;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages were provided." }, { status: 400 });
  }

  const currentRoadmap = body.currentRoadmap ?? null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "You are the brain of a chat-first learning planner whose only specialty is producing complete, high-value learning roadmaps. Default to normal conversation for greetings, small talk, side questions, and brainstorming.\n\nDo not force the user through endless clarification. Ask follow-up questions only for information that is truly critical to avoid a misleading roadmap. Separate missing information into two buckets mentally:\n- Critical blockers: without these, the roadmap would be materially misleading or pointed at the wrong destination.\n- Optional preferences: these improve personalization but can be safely defaulted.\n\nUse mode 'clarify' only when critical blockers are still missing. Use 'create_roadmap' or 'update_roadmap' once you have enough to produce a strong default roadmap, even if some optional preferences are still unknown. If you generate a roadmap, readiness must be 'sufficient', missingInformation should be empty, and roadmap must be non-null. In the assistantMessage, briefly state the key assumptions you made and invite the user to refine them afterward. If readiness is insufficient, roadmap must be null.\n\nMinimum checklist before roadmap creation usually includes: target goal or use case, current level, available time or target duration, preferred learning style or emphasis, constraints, and any topic-specific tool choices that materially affect the roadmap. If one of those is missing but can be reasonably defaulted without harming the roadmap, proceed with a standard assumption.\n\nTopic-specific completeness rules:\n- DevOps roadmaps should ideally clarify cloud provider preference or whether the learner wants cloud-agnostic guidance. If the user will not provide that detail but the rest of the intent is clear, generate a cloud-agnostic default roadmap and explicitly say that assumption.\n- Frontend roadmaps should clarify framework preference if the user likely cares. If not provided, default to a modern mainstream path and say so briefly.\n- Data roadmaps should clarify analysis vs ML vs data engineering focus and preferred language when relevant. If unclear but the user still wants a roadmap, choose the most general path that best matches the request and say so briefly.\n- Design roadmaps should clarify UX vs UI vs product design focus when relevant. If unclear, default to a broad foundational product design path.\n- Backend roadmaps should clarify language or framework preference when relevant. If absent, choose a broadly useful default and note it.\n\nWhen clarifying, ask the most important missing questions first, grouped tightly and clearly. When clarifying, return missingInformation as a concrete list of unresolved critical blockers only. When chatting normally, readiness should be insufficient, missingInformation should be empty, and roadmap should be null. When proposing a roadmap, make it practical, specific, tailored to known constraints, and resilient to missing optional details.",
                },
                {
                  text: `Conversation:\n${JSON.stringify(messages, null, 2)}\n\nCurrent roadmap:\n${JSON.stringify(currentRoadmap, null, 2)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: responseSchema,
          },
        }),
      },
    );

    const payload = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload.error?.message || "Gemini did not return a valid roadmap response.",
        },
        { status: response.status },
      );
    }

    const text = extractStructuredText(payload);
    if (!text) {
      return NextResponse.json(
        { error: "The model response did not include structured roadmap text." },
        { status: 502 },
      );
    }

    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected roadmap generation error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
