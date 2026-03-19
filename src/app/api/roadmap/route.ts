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

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

const roadmapSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: {
      type: "string",
      minLength: 1,
    },
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
  required: ["assistantMessage", "config", "phases"],
} as const;

function extractStructuredText(response: OpenAIResponse) {
  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (contentItem.type === "output_text" && contentItem.text) {
        return contentItem.text;
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. Add it to your environment before generating roadmaps.",
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
  const model = process.env.OPENAI_MODEL || "gpt-5";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "You are a roadmap planner. Produce a clean, realistic, trackable learning roadmap. If the user asks to revise an existing roadmap, preserve the intent and update the structure instead of starting over unnecessarily. Return concise but useful task notes. Keep the roadmap practical, with specific phases and tasks that are easy to track.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Conversation:\n${JSON.stringify(messages, null, 2)}\n\nCurrent roadmap:\n${JSON.stringify(currentRoadmap, null, 2)}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "roadmap_plan",
            strict: true,
            schema: roadmapSchema,
          },
        },
      }),
    });

    const payload = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload.error?.message || "OpenAI did not return a valid roadmap response.",
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
