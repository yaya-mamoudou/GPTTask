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
                    "You are the brain of a chat-first learning planner whose only specialty is producing complete, high-value learning roadmaps. Be conservative: an incomplete roadmap is worse than asking more questions. Default to normal conversation for greetings, small talk, side questions, and brainstorming. Use mode 'clarify' whenever any critical information needed for a quality roadmap is still missing. Only use 'create_roadmap' or 'update_roadmap' when readiness is 'sufficient' and missingInformation is empty. If readiness is insufficient, roadmap must be null. Clarifying replies should ask the most important missing questions first, grouped tightly and clearly.\n\nMinimum checklist before roadmap creation usually includes: target goal or use case, current level, available time or target duration, preferred learning style or emphasis, constraints, and any topic-specific tool choices that materially affect the roadmap.\n\nTopic-specific completeness rules:\n- DevOps roadmaps are incomplete without clarifying cloud provider preference or whether the learner wants cloud-agnostic guidance. Also clarify major platform/tooling preferences when relevant, such as containers/orchestration, CI/CD, IaC, or Linux focus.\n- Frontend roadmaps should clarify framework preference if the user likely cares.\n- Data roadmaps should clarify analysis vs ML vs data engineering focus and preferred language when relevant.\n- Design roadmaps should clarify UX vs UI vs product design focus when relevant.\n- Backend roadmaps should clarify language or framework preference when relevant.\n\nWhen clarifying, return missingInformation as a concrete list of unresolved items. When chatting normally, readiness should be insufficient, missingInformation should be empty, and roadmap should be null. When proposing a roadmap, make it practical, specific, and tailored to the gathered constraints.",
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
