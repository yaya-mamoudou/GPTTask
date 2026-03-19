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

type RoadmapResponse = {
  assistantMessage: string;
  config: PlanConfig;
  phases: Array<{
    title: string;
    summary: string;
    focus: string;
    tasks: Array<{
      title: string;
      notes: string;
      weekLabel: string;
    }>;
  }>;
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

function buildInitialState(): PlannerState {
  return {
    config: {
      topic: "",
      level: "beginner",
      weeks: 8,
      phases: 4,
      intensity: "steady",
      emphasis: "balanced",
      capstone: true,
    },
    phases: [],
    messages: [
      {
        id: createId("message"),
        role: "assistant",
        text: "Tell me what you want to learn and how you want the roadmap shaped. I’ll use Gemini to turn it into a structured plan you can track and keep editing from chat.",
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

function formatPhaseMetrics(tasks: Task[]) {
  const completed = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { completed, total, percent };
}

function hydratePhases(phases: RoadmapResponse["phases"]): Phase[] {
  return phases.map((phase) => ({
    id: createId("phase"),
    title: phase.title,
    summary: phase.summary,
    focus: phase.focus,
    tasks: phase.tasks.map((task) => ({
      id: createId("task"),
      title: task.title,
      notes: task.notes,
      weekLabel: task.weekLabel,
      done: false,
    })),
  }));
}

export default function Home() {
  const composerId = useId();
  const [planner, setPlanner] = useState<PlannerState>(buildInitialState);
  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metrics = formatPercent(planner.phases);
  const hasRoadmap = planner.phases.length > 0;

  async function submitPrompt(rawInput: string) {
    const input = rawInput.trim();
    if (!input || isSubmitting) {
      return;
    }

    const nextMessages = [
      ...planner.messages,
      { id: createId("message"), role: "user" as const, text: input },
    ];

    setPlanner((current) => ({
      ...current,
      messages: nextMessages,
    }));
    setDraft("");
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/roadmap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, text }) => ({ role, text })),
          currentRoadmap: {
            config: planner.config,
            phases: planner.phases.map((phase) => ({
              title: phase.title,
              summary: phase.summary,
              focus: phase.focus,
              tasks: phase.tasks.map((task) => ({
                title: task.title,
                notes: task.notes,
                weekLabel: task.weekLabel,
                done: task.done,
              })),
            })),
          },
        }),
      });

      const payload = (await response.json()) as
        | RoadmapResponse
        | { error?: string };

      if (!response.ok || !("config" in payload) || !("phases" in payload)) {
        throw new Error(payload.error || "Unable to generate roadmap right now.");
      }

      setPlanner((current) => ({
        config: payload.config,
        phases: hydratePhases(payload.phases),
        messages: [
          ...current.messages,
          {
            id: createId("message"),
            role: "assistant",
            text: payload.assistantMessage,
          },
        ],
      }));
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to generate roadmap right now.";

      setError(message);
      setPlanner((current) => ({
        ...current,
        messages: current.messages.slice(0, -1),
      }));
      setDraft(input);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(draft);
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
                  notes: "Edit this task or ask Gemini to restructure the roadmap.",
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
              notes: "This can be adjusted manually or from chat.",
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
          phases: nextPhases.length,
        },
        phases: nextPhases,
      };
    });
  }

  function resetPlanner() {
    setPlanner(buildInitialState());
    setDraft("");
    setError(null);
    setIsSubmitting(false);
  }

  return (
    <main className="roadmap-shell">
      <section className={`workspace-grid ${hasRoadmap ? "" : "workspace-grid-single"}`}>
        <aside className="panel chat-panel">
          <div className="panel-header">
            <div>
              <h2>Roadmap Chat</h2>
              <p className="panel-meta">
                {hasRoadmap
                  ? `${planner.config.topic} · ${planner.config.weeks} weeks`
                  : "Describe what you want to learn and Gemini will draft the roadmap."}
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
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Generating..." : "Update roadmap"}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </form>
        </aside>

        {hasRoadmap ? (
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
                  {(() => {
                    const phaseMetrics = formatPhaseMetrics(phase.tasks);

                    return (
                      <>
                        <div className="phase-head">
                          <div className="phase-heading">
                            <span className="phase-index">Phase {index + 1}</span>
                            <div className="phase-stat-row">
                              <span className="phase-pill">
                                {phaseMetrics.completed}/{phaseMetrics.total} tasks
                              </span>
                              <span className="phase-pill phase-pill-strong">
                                {phaseMetrics.percent}% complete
                              </span>
                            </div>
                          </div>
                          <button
                            className="ghost-button"
                            onClick={() => addTask(phase.id)}
                            type="button"
                          >
                            Add task
                          </button>
                        </div>

                        <div className="phase-progress-track" aria-hidden="true">
                          <div
                            className="phase-progress-bar"
                            style={{ width: `${phaseMetrics.percent}%` }}
                          />
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
                              <div className="task-check-wrap">
                                <input
                                  checked={task.done}
                                  onChange={() => toggleTask(phase.id, task.id)}
                                  type="checkbox"
                                />
                                <span className="task-check-visual" aria-hidden="true" />
                              </div>
                              <div className="task-body">
                                <div className="task-topline">
                                  <span className="task-status">
                                    {task.done ? "Done" : "In progress"}
                                  </span>
                                  <span className="task-week">{task.weekLabel}</span>
                                </div>
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
                              </div>
                            </label>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
