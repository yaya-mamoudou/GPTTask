"use client";

import { FormEvent, useId, useState } from "react";

type MessageRole = "assistant" | "user";

type Message = {
  id: string;
  role: MessageRole;
  text: string;
};

type Task = {
  id: string;
  title: string;
  notes: string;
  weekLabel: string;
  done: boolean;
};

type Phase = {
  id: string;
  title: string;
  summary: string;
  focus: string;
  tasks: Task[];
};

type PlanConfig = {
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  weeks: number;
  phases: number;
  intensity: "light" | "steady" | "intense";
  emphasis: "balanced" | "fundamentals" | "projects";
  capstone: boolean;
};

type PlannerState = {
  config: PlanConfig;
  messages: Message[];
  phases: Phase[];
};

const topicTemplates = [
  "HTML, CSS, and JavaScript",
  "React and UI state",
  "Python for automation",
  "Data analysis",
  "Product design",
  "System design",
];

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractTopic(input: string) {
  const normalized = input.trim().replace(/[.?!]+$/, "");
  const patterns = [
    /roadmap for ([a-z0-9 +/#-]+)/i,
    /learn ([a-z0-9 +/#-]+)/i,
    /study plan for ([a-z0-9 +/#-]+)/i,
    /plan for ([a-z0-9 +/#-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return titleCase(match[1].trim());
    }
  }

  const plain = normalized
    .replace(/^(build|create|make|turn|give)\s+(me\s+)?/i, "")
    .replace(/(a|an)\s+(beginner|intermediate|advanced)\s+/i, "")
    .replace(/\bin\s+\d+\s+(week|weeks|month|months)\b/i, "")
    .trim();

  return plain ? titleCase(plain) : "Front-End Development";
}

function parseDuration(input: string) {
  const weeksMatch = input.match(/(\d+)\s*weeks?/i);
  if (weeksMatch) {
    return clamp(Number(weeksMatch[1]), 2, 52);
  }

  const monthsMatch = input.match(/(\d+)\s*months?/i);
  if (monthsMatch) {
    return clamp(Number(monthsMatch[1]) * 4, 2, 52);
  }

  return null;
}

function updateConfig(current: PlanConfig, input: string, hasExistingPlan: boolean) {
  const next = { ...current };
  const normalized = input.toLowerCase();

  if (!hasExistingPlan || /roadmap|learn|study plan|plan for/i.test(input)) {
    next.topic = extractTopic(input);
  }

  const parsedWeeks = parseDuration(input);
  if (parsedWeeks) {
    next.weeks = parsedWeeks;
  }

  if (normalized.includes("shorter") || normalized.includes("compress")) {
    next.weeks = clamp(next.weeks - 2, 2, 52);
  }

  if (normalized.includes("longer") || normalized.includes("deeper")) {
    next.weeks = clamp(next.weeks + 2, 2, 52);
  }

  const phaseMatch = normalized.match(/(\d+)\s*phases?/);
  if (phaseMatch) {
    next.phases = clamp(Number(phaseMatch[1]), 2, 6);
  }

  if (normalized.includes("more phases")) {
    next.phases = clamp(next.phases + 1, 2, 6);
  }

  if (normalized.includes("fewer phases")) {
    next.phases = clamp(next.phases - 1, 2, 6);
  }

  if (normalized.includes("beginner")) {
    next.level = "beginner";
  } else if (normalized.includes("intermediate")) {
    next.level = "intermediate";
  } else if (normalized.includes("advanced")) {
    next.level = "advanced";
  }

  if (
    normalized.includes("project") ||
    normalized.includes("portfolio") ||
    normalized.includes("hands-on")
  ) {
    next.emphasis = "projects";
  } else if (
    normalized.includes("fundamental") ||
    normalized.includes("theory") ||
    normalized.includes("basics")
  ) {
    next.emphasis = "fundamentals";
  } else if (normalized.includes("balanced")) {
    next.emphasis = "balanced";
  }

  if (normalized.includes("lighter") || normalized.includes("gentle")) {
    next.intensity = "light";
  } else if (normalized.includes("intense") || normalized.includes("aggressive")) {
    next.intensity = "intense";
  } else if (normalized.includes("steady")) {
    next.intensity = "steady";
  }

  if (
    normalized.includes("capstone") ||
    normalized.includes("final project") ||
    normalized.includes("portfolio project")
  ) {
    next.capstone = true;
  }

  if (normalized.includes("remove capstone")) {
    next.capstone = false;
  }

  next.phases = clamp(next.phases, 2, Math.min(6, next.weeks));

  return next;
}

function createPhaseBlueprints(topic: string, emphasis: PlanConfig["emphasis"]) {
  const base = [
    {
      title: "Orientation",
      summary: `Understand the landscape of ${topic} and define the end goal.`,
      focus: "Clarify why this topic matters and what “good” looks like.",
      taskBase: [
        "Map the core concepts and vocabulary",
        "Choose learning resources and examples",
        "Write a success definition for the roadmap",
      ],
    },
    {
      title: "Core Skills",
      summary: `Build the essential mental models behind ${topic}.`,
      focus: "Strengthen fundamentals until the basics feel predictable.",
      taskBase: [
        "Study the central principles in short focused sessions",
        "Create notes with examples in your own words",
        "Answer practice questions without looking things up",
      ],
    },
    {
      title: "Applied Practice",
      summary: `Turn theory into repeatable practice around ${topic}.`,
      focus: "Work through realistic exercises and small builds.",
      taskBase: [
        "Complete one scoped exercise from start to finish",
        "Review mistakes and capture patterns you missed",
        "Repeat the workflow with slightly more difficulty",
      ],
    },
    {
      title: "Integration",
      summary: `Connect the pieces into a reliable working process.`,
      focus: "Blend knowledge, speed, and judgment in one workflow.",
      taskBase: [
        "Combine multiple concepts in one mini-project",
        "Explain your decisions as if teaching someone else",
        "Create a checklist for your future practice sessions",
      ],
    },
    {
      title: "Capstone",
      summary: `Ship something that proves your progress in ${topic}.`,
      focus: "Produce visible evidence of learning and reflection.",
      taskBase: [
        "Define a capstone that matches your actual goal",
        "Build or present the final project in public",
        "Review gaps and plan the next iteration",
      ],
    },
  ];

  if (emphasis === "projects") {
    base[1] = {
      title: "Build Foundations",
      summary: `Learn only the concepts you need to start making with ${topic}.`,
      focus: "Keep theory lean and immediately apply it.",
      taskBase: [
        "Learn the minimum concepts needed to begin",
        "Copy one guided example and annotate what it teaches",
        "Create a tiny personal variation of that example",
      ],
    };
    base[2].title = "Project Sprints";
    base[2].summary = `Use short projects to learn ${topic} by doing.`;
    base[2].focus = "Bias the roadmap toward output instead of passive study.";
  }

  if (emphasis === "fundamentals") {
    base[2].title = "Deliberate Practice";
    base[2].summary = `Reinforce the theory of ${topic} until it feels natural.`;
    base[2].focus = "Slow down and build deep confidence before larger projects.";
  }

  return base;
}

function buildTasks(
  phaseIndex: number,
  phaseCount: number,
  totalWeeks: number,
  intensity: PlanConfig["intensity"],
  taskBase: string[],
) {
  const tasksPerPhase =
    intensity === "light" ? 2 : intensity === "intense" ? 4 : 3;
  const phaseSpan = Math.max(1, Math.floor(totalWeeks / phaseCount));
  const startWeek = phaseIndex * phaseSpan + 1;
  const endWeek =
    phaseIndex === phaseCount - 1
      ? totalWeeks
      : Math.min(totalWeeks, (phaseIndex + 1) * phaseSpan);

  return Array.from({ length: tasksPerPhase }, (_, index) => ({
    id: createId("task"),
    title: taskBase[index % taskBase.length],
    notes:
      index === tasksPerPhase - 1
        ? "Capture takeaways and adjust the next phase from chat."
        : "Keep the scope small enough to finish in one focused block.",
    weekLabel: `Weeks ${startWeek}-${endWeek}`,
    done: false,
  }));
}

function generatePlan(config: PlanConfig) {
  const blueprints = createPhaseBlueprints(config.topic, config.emphasis);
  const selected = blueprints.slice(0, config.phases);

  if (config.capstone && !selected.some((phase) => phase.title === "Capstone")) {
    selected[selected.length - 1] = blueprints[4];
  }

  return selected.map((phase, index) => ({
    id: createId("phase"),
    title: phase.title,
    summary: phase.summary,
    focus: phase.focus,
    tasks: buildTasks(
      index,
      selected.length,
      config.weeks,
      config.intensity,
      phase.taskBase,
    ),
  }));
}

function createAssistantReply(config: PlanConfig, previous: PlanConfig | null) {
  const changedTopic = previous ? previous.topic !== config.topic : true;
  const changes = [
    changedTopic ? `topic: ${config.topic}` : null,
    !previous || previous.weeks !== config.weeks ? `${config.weeks}-week scope` : null,
    !previous || previous.phases !== config.phases ? `${config.phases} phases` : null,
    !previous || previous.emphasis !== config.emphasis
      ? `${config.emphasis} emphasis`
      : null,
    !previous || previous.intensity !== config.intensity
      ? `${config.intensity} workload`
      : null,
    !previous || previous.level !== config.level ? `${config.level} level` : null,
    !previous || previous.capstone !== config.capstone
      ? config.capstone
        ? "capstone included"
        : "capstone removed"
      : null,
  ].filter(Boolean);

  const intro = previous
    ? "I updated the roadmap from your last instruction."
    : "I turned your idea into a trackable roadmap.";

  return `${intro} Current settings: ${changes.join(", ")}. You can keep steering it from chat with messages like “make it shorter”, “add more phases”, or “shift this toward projects.”`;
}

function buildInitialState(): PlannerState {
  const config: PlanConfig = {
    topic: "Product Design",
    level: "beginner",
    weeks: 8,
    phases: 4,
    intensity: "steady",
    emphasis: "balanced",
    capstone: true,
  };

  return {
    config,
    phases: generatePlan(config),
    messages: [
      {
        id: createId("message"),
        role: "assistant",
        text: "Describe what you want to learn, how long you want to spend, and whether you want fundamentals or projects. I’ll shape it into a roadmap you can actually track.",
      },
    ],
  };
}

function formatPercent(phases: Phase[]) {
  const tasks = phases.flatMap((phase) => phase.tasks);
  const completed = tasks.filter((task) => task.done).length;
  const percent = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  return { total: tasks.length, completed, percent };
}

export default function Home() {
  const composerId = useId();
  const [planner, setPlanner] = useState<PlannerState>(buildInitialState);
  const [draft, setDraft] = useState("");
  const metrics = formatPercent(planner.phases);

  function submitPrompt(rawInput: string) {
    const input = rawInput.trim();
    if (!input) {
      return;
    }

    setPlanner((current) => {
      const nextConfig = updateConfig(current.config, input, current.messages.length > 1);
      const nextPhases = generatePlan(nextConfig);
      const assistantReply = createAssistantReply(nextConfig, current.config);

      return {
        config: nextConfig,
        phases: nextPhases,
        messages: [
          ...current.messages,
          { id: createId("message"), role: "user", text: input },
          { id: createId("message"), role: "assistant", text: assistantReply },
        ],
      };
    });

    setDraft("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitPrompt(draft);
  }

  function toggleTask(phaseId: string, taskId: string) {
    setPlanner((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id !== phaseId
          ? phase
          : {
              ...phase,
              tasks: phase.tasks.map((task) =>
                task.id !== taskId ? task : { ...task, done: !task.done },
              ),
            },
      ),
    }));
  }

  function updateTask(
    phaseId: string,
    taskId: string,
    field: "title" | "notes",
    value: string,
  ) {
    setPlanner((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id !== phaseId
          ? phase
          : {
              ...phase,
              tasks: phase.tasks.map((task) =>
                task.id !== taskId ? task : { ...task, [field]: value },
              ),
            },
      ),
    }));
  }

  function updatePhase(phaseId: string, field: "title" | "summary" | "focus", value: string) {
    setPlanner((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id !== phaseId ? phase : { ...phase, [field]: value },
      ),
    }));
  }

  function addTask(phaseId: string) {
    setPlanner((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id !== phaseId
          ? phase
          : {
              ...phase,
              tasks: [
                ...phase.tasks,
                {
                  id: createId("task"),
                  title: "New custom task",
                  notes: "Refine this task from chat or edit it directly here.",
                  weekLabel: "Custom timing",
                  done: false,
                },
              ],
            },
      ),
    }));
  }

  function addPhase() {
    setPlanner((current) => {
      const nextPhases = [
        ...current.phases,
        {
          id: createId("phase"),
          title: "New Phase",
          summary: "Describe what this phase should accomplish.",
          focus: "Set the main learning objective for this phase.",
          tasks: [
            {
              id: createId("task"),
              title: "Define the first task",
              notes: "This can also be updated from chat.",
              weekLabel: "Custom timing",
              done: false,
            },
          ],
        },
      ];

      return {
        ...current,
        config: {
          ...current.config,
          phases: clamp(nextPhases.length, 2, 6),
        },
        phases: nextPhases,
      };
    });
  }

  function resetPlanner() {
    setPlanner(buildInitialState());
  }

  return (
    <main className="roadmap-shell">
      <section className="workspace-grid">
        <aside className="panel chat-panel">
          <div className="panel-header">
            <div>
              <h2>Roadmap Chat</h2>
              <p className="panel-meta">
                {planner.config.topic} · {planner.config.weeks} weeks
              </p>
            </div>
            <button className="ghost-button" onClick={resetPlanner} type="button">
              Reset
            </button>
          </div>

          <div className="message-list">
            {planner.messages.map((message) => (
              <article
                key={message.id}
                className={`message-bubble message-${message.role}`}
              >
                <span className="message-role">
                  {message.role === "assistant" ? "Planner" : "You"}
                </span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor={composerId}>
              Chat with the roadmap planner
            </label>
            <textarea
              id={composerId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Example: Build me a beginner roadmap for data analysis in 10 weeks, then make it project-heavy."
              rows={4}
            />
            <div className="composer-footer">
              <span>
                Try topics like{" "}
                {topicTemplates.map((topic, index) => (
                  <span key={topic}>
                    {index > 0 ? ", " : ""}
                    {topic}
                  </span>
                ))}
                .
              </span>
              <button className="primary-button" type="submit">
                Update roadmap
              </button>
            </div>
          </form>
        </aside>

        <section className="panel roadmap-panel">
          <div className="panel-header">
            <div>
              <h2>Trackable Roadmap</h2>
              <p className="panel-meta">
                {metrics.completed} of {metrics.total} tasks complete · {metrics.percent}%
              </p>
            </div>
            <button className="secondary-button" onClick={addPhase} type="button">
              Add phase
            </button>
          </div>

          <div className="phase-list">
            {planner.phases.map((phase, index) => (
              <article className="phase-card" key={phase.id}>
                <div className="phase-head">
                  <span className="phase-index">Phase {index + 1}</span>
                  <button
                    className="ghost-button"
                    onClick={() => addTask(phase.id)}
                    type="button"
                  >
                    Add task
                  </button>
                </div>

                <input
                  className="phase-title"
                  value={phase.title}
                  onChange={(event) =>
                    updatePhase(phase.id, "title", event.target.value)
                  }
                />
                <textarea
                  className="phase-summary"
                  value={phase.summary}
                  onChange={(event) =>
                    updatePhase(phase.id, "summary", event.target.value)
                  }
                  rows={2}
                />
                <input
                  className="phase-focus"
                  value={phase.focus}
                  onChange={(event) =>
                    updatePhase(phase.id, "focus", event.target.value)
                  }
                />

                <div className="task-list">
                  {phase.tasks.map((task) => (
                    <label
                      className={`task-card ${task.done ? "task-done" : ""}`}
                      key={task.id}
                    >
                      <input
                        checked={task.done}
                        onChange={() => toggleTask(phase.id, task.id)}
                        type="checkbox"
                      />
                      <div className="task-body">
                        <input
                          className="task-title"
                          value={task.title}
                          onChange={(event) =>
                            updateTask(phase.id, task.id, "title", event.target.value)
                          }
                        />
                        <textarea
                          className="task-notes"
                          rows={2}
                          value={task.notes}
                          onChange={(event) =>
                            updateTask(phase.id, task.id, "notes", event.target.value)
                          }
                        />
                        <span className="task-week">{task.weekLabel}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
