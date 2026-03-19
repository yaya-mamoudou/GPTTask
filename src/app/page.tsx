'use client';

import { FormEvent, useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageRole = 'assistant' | 'user';

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
	level: 'beginner' | 'intermediate' | 'advanced';
	weeks: number;
	phases: number;
	intensity: 'light' | 'steady' | 'intense';
	emphasis: 'balanced' | 'fundamentals' | 'projects';
	capstone: boolean;
};

type PlannerState = {
	config: PlanConfig;
	messages: Message[];
	phases: Phase[];
};

type RoadmapPayload = {
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

type AssistantDecision = {
	assistantMessage: string;
	mode: 'chat' | 'clarify' | 'create_roadmap' | 'update_roadmap';
	readiness: 'insufficient' | 'sufficient';
	missingInformation: string[];
	roadmap: RoadmapPayload | null;
};

type PendingRoadmap = {
	mode: 'create_roadmap' | 'update_roadmap';
	config: PlanConfig;
	phases: Phase[];
	message: string;
};

function createId(prefix: string) {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildInitialState(): PlannerState {
	return {
		config: {
			topic: '',
			level: 'beginner',
			weeks: 8,
			phases: 4,
			intensity: 'steady',
			emphasis: 'balanced',
			capstone: true,
		},
		phases: [],
		messages: [],
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

function hydratePhases(phases: RoadmapPayload['phases']): Phase[] {
	return phases.map((phase) => ({
		id: createId('phase'),
		title: phase.title,
		summary: phase.summary,
		focus: phase.focus,
		tasks: phase.tasks.map((task) => ({
			id: createId('task'),
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
	const [draft, setDraft] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [animateRoadmap, setAnimateRoadmap] = useState(false);
	const [pendingRoadmap, setPendingRoadmap] = useState<PendingRoadmap | null>(null);
	const [isMobileRoadmapOpen, setIsMobileRoadmapOpen] = useState(false);
	const metrics = formatPercent(planner.phases);
	const hasRoadmap = planner.phases.length > 0;
	const displayedRoadmap = pendingRoadmap
		? { config: pendingRoadmap.config, phases: pendingRoadmap.phases }
		: { config: planner.config, phases: planner.phases };
	const showingPreview = pendingRoadmap !== null;
	const shouldShowRoadmapPanel = displayedRoadmap.phases.length > 0;

	useEffect(() => {
		if (!animateRoadmap) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setAnimateRoadmap(false);
		}, 900);

		return () => window.clearTimeout(timeoutId);
	}, [animateRoadmap]);

	useEffect(() => {
		if (!isMobileRoadmapOpen) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isMobileRoadmapOpen]);

	async function submitPrompt(rawInput: string) {
		const input = rawInput.trim();
		if (!input || isSubmitting) {
			return;
		}

		const nextMessages = [
			...planner.messages,
			{ id: createId('message'), role: 'user' as const, text: input },
		];
		const roadmapContext = pendingRoadmap
			? {
					config: pendingRoadmap.config,
					phases: pendingRoadmap.phases.map((phase) => ({
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
				}
			: {
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
				};

		setPlanner((current) => ({
			...current,
			messages: nextMessages,
		}));
		setDraft('');
		setError(null);
		setIsSubmitting(true);

		try {
			const response = await fetch('/api/roadmap', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					messages: nextMessages.map(({ role, text }) => ({ role, text })),
					currentRoadmap: roadmapContext,
				}),
			});

			const payload = (await response.json()) as AssistantDecision | { error?: string };

			if (!response.ok || !('mode' in payload)) {
				throw new Error(payload.error || 'Unable to generate roadmap right now.');
			}

			setPlanner((current) => ({
				...current,
				messages: [
					...current.messages,
					{
						id: createId('message'),
						role: 'assistant',
						text: payload.assistantMessage,
					},
				],
			}));

			if (
				(payload.mode === 'create_roadmap' || payload.mode === 'update_roadmap') &&
				payload.roadmap
			) {
				setPendingRoadmap({
					mode: payload.mode,
					config: payload.roadmap.config,
					phases: hydratePhases(payload.roadmap.phases),
					message: payload.assistantMessage,
				});
				setAnimateRoadmap(true);
			}
		} catch (submissionError) {
			const message =
				submissionError instanceof Error
					? submissionError.message
					: 'Unable to generate roadmap right now.';

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

	function updateTask(phaseId: string, taskId: string, field: 'title' | 'notes', value: string) {
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

	function updatePhase(phaseId: string, field: 'title' | 'summary' | 'focus', value: string) {
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
									id: createId('task'),
									title: 'New custom task',
									notes: 'Edit this task or ask Gemini to restructure the roadmap.',
									weekLabel: 'Custom timing',
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
					id: createId('phase'),
					title: 'New Phase',
					summary: 'Describe what this phase should accomplish.',
					focus: 'Set the main learning objective for this phase.',
					tasks: [
						{
							id: createId('task'),
							title: 'Define the first task',
							notes: 'This can be adjusted manually or from chat.',
							weekLabel: 'Custom timing',
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
		setDraft('');
		setError(null);
		setIsSubmitting(false);
		setPendingRoadmap(null);
		setIsMobileRoadmapOpen(false);
	}

	function applyPendingRoadmap() {
		if (!pendingRoadmap) {
			return;
		}

		setPlanner((current) => ({
			...current,
			config: pendingRoadmap.config,
			phases: pendingRoadmap.phases,
		}));
		setPendingRoadmap(null);
		setIsMobileRoadmapOpen(false);
	}

	function discardPendingRoadmap() {
		setPendingRoadmap(null);
		setIsMobileRoadmapOpen(false);
	}

	return (
		<main className='roadmap-shell'>
			<section
				className={`workspace-grid ${shouldShowRoadmapPanel ? '' : 'workspace-grid-single'}`}
			>
				<aside className={`panel chat-panel ${isSubmitting ? 'panel-busy' : ''}`}>
					<div className='panel-header'>
						<div>
							<h2>Roadmap Chat</h2>
							<p className='panel-meta'>
								{showingPreview
									? 'A roadmap proposal is ready for review.'
									: hasRoadmap
										? `${planner.config.topic} · ${planner.config.weeks} weeks`
										: "Chat normally, or ask Gemini to build a roadmap when you're ready."}
							</p>
						</div>
						<div className='chat-header-actions'>
							{shouldShowRoadmapPanel ? (
								<button
									className='secondary-button mobile-roadmap-trigger'
									onClick={() => setIsMobileRoadmapOpen(true)}
									type='button'
								>
									{showingPreview ? 'Open preview' : 'Open roadmap'}
								</button>
							) : null}
							<button className='ghost-button' onClick={resetPlanner} type='button'>
								Reset
							</button>
						</div>
					</div>

					<div className='message-list'>
						{planner.messages.length === 0 ? (
							<div className='chat-empty-state'>
								<div className='chat-empty-icon' aria-hidden='true'>
									<span className='chat-empty-orb' />
									<span className='chat-empty-sheet'>
										<i />
										<i />
										<i />
									</span>
								</div>
								<h3>Start a learning conversation.</h3>
								<p>Ask a question or request a roadmap when you&apos;re ready.</p>
							</div>
						) : (
							planner.messages.map((message) => (
								<article key={message.id} className={`message-bubble message-${message.role}`}>
									<span className='message-role'>
										{message.role === 'assistant' ? 'Planner' : 'You'}
									</span>
									<div className='message-content'>
										{message.role === 'assistant' ? (
											<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
										) : (
											<p className='message-paragraph'>{message.text}</p>
										)}
									</div>
								</article>
							))
						)}
						{isSubmitting ? (
							<article className='message-bubble message-assistant message-loading'>
								<span className='message-role'>Planner</span>
								<div className='loading-line-group' aria-label='Generating roadmap'>
									<span className='loading-spinner' aria-hidden='true' />
									<span className='loading-line short' />
									<span className='loading-line' />
								</div>
							</article>
						) : null}
					</div>

					<form className='composer' onSubmit={handleSubmit}>
						<label className='sr-only' htmlFor={composerId}>
							Chat with the roadmap planner
						</label>
						<div className='composer-input-shell'>
							<textarea
								id={composerId}
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								placeholder='Example: Build me a beginner roadmap for data analysis in 10 weeks, then make it project-heavy.'
								rows={4}
							/>
							<button
								className='primary-button composer-submit'
								disabled={isSubmitting}
								type='submit'
							>
								{isSubmitting ? 'Generating...' : 'Send'}
							</button>
						</div>
						<div className='composer-footer'>
							<span className='composer-status'>
								{isSubmitting
									? 'Gemini is shaping the roadmap...'
									: 'Roadmaps update from the conversation.'}
							</span>
						</div>
						{error ? <p className='form-error'>{error}</p> : null}
					</form>
				</aside>

				{shouldShowRoadmapPanel ? (
					<section
						className={`panel roadmap-panel ${animateRoadmap ? 'roadmap-reveal' : ''} ${
							isSubmitting ? 'panel-busy' : ''
						} ${isMobileRoadmapOpen ? 'mobile-open' : ''}`}
					>
						<div className='panel-header'>
							<div>
								<h2>{showingPreview ? 'Roadmap Preview' : 'Trackable Roadmap'}</h2>
								<p className='panel-meta'>
									{showingPreview
										? pendingRoadmap.mode === 'create_roadmap'
											? 'Review this draft before creating the roadmap.'
											: 'Review these edits before updating your roadmap.'
										: `${metrics.completed} of ${metrics.total} tasks complete · ${metrics.percent}%`}
								</p>
							</div>
							{showingPreview ? (
								<div className='preview-actions'>
									<button
										className='secondary-button'
										onClick={discardPendingRoadmap}
										type='button'
									>
										Keep chatting
									</button>
									<button className='primary-button' onClick={applyPendingRoadmap} type='button'>
										{pendingRoadmap.mode === 'create_roadmap' ? 'Create roadmap' : 'Apply changes'}
									</button>
								</div>
							) : hasRoadmap ? (
								<button className='secondary-button' onClick={addPhase} type='button'>
									Add phase
								</button>
							) : null}
						</div>
						<button
							className='ghost-button roadmap-modal-close'
							onClick={() => setIsMobileRoadmapOpen(false)}
							type='button'
						>
							Close
						</button>

						{displayedRoadmap.phases.length > 0 ? (
							<div className={`phase-list ${isSubmitting ? 'phase-list-dimmed' : ''}`}>
								{displayedRoadmap.phases.map((phase, index) => (
									<article className='phase-card' key={phase.id}>
										{(() => {
											const phaseMetrics = formatPhaseMetrics(phase.tasks);

											return (
												<>
													<div className='phase-head'>
														<div className='phase-heading'>
															<span className='phase-index'>Phase {index + 1}</span>
															<p className='phase-meta'>
																{phaseMetrics.completed}/{phaseMetrics.total} tasks complete ·{' '}
																{phaseMetrics.percent}%
															</p>
														</div>
														{showingPreview ? null : (
															<button
																className='ghost-button'
																onClick={() => addTask(phase.id)}
																type='button'
															>
																Add task
															</button>
														)}
													</div>

													<div className='phase-progress-track' aria-hidden='true'>
														<div
															className='phase-progress-bar'
															style={{ width: `${phaseMetrics.percent}%` }}
														/>
													</div>

													{showingPreview ? (
														<>
															<h3 className='phase-title'>{phase.title}</h3>
															<p className='phase-summary'>{phase.summary}</p>
															<p className='phase-focus'>{phase.focus}</p>
														</>
													) : (
														<>
															<input
																className='phase-title'
																value={phase.title}
																onChange={(event) =>
																	updatePhase(phase.id, 'title', event.target.value)
																}
															/>
															<textarea
																className='phase-summary'
																value={phase.summary}
																onChange={(event) =>
																	updatePhase(phase.id, 'summary', event.target.value)
																}
																rows={2}
															/>
															<input
																className='phase-focus'
																value={phase.focus}
																onChange={(event) =>
																	updatePhase(phase.id, 'focus', event.target.value)
																}
															/>
														</>
													)}

													<div className='task-list'>
														{phase.tasks.map((task) => (
															<label
																className={`task-card ${task.done ? 'task-done' : ''}`}
																key={task.id}
															>
																<div className='task-check-wrap'>
																	{showingPreview ? (
																		<span className='task-check-visual' aria-hidden='true' />
																	) : (
																		<input
																			checked={task.done}
																			onChange={() => toggleTask(phase.id, task.id)}
																			type='checkbox'
																		/>
																	)}
																	{showingPreview ? null : (
																		<span className='task-check-visual' aria-hidden='true' />
																	)}
																</div>
																<div className='task-body'>
																	<div className='task-topline'>
																		<span className='task-week'>{task.weekLabel}</span>
																	</div>
																	{showingPreview ? (
																		<>
																			<p className='task-title task-title-preview'>{task.title}</p>
																			<p className='task-notes'>{task.notes}</p>
																		</>
																	) : (
																		<>
																			<input
																				className='task-title'
																				value={task.title}
																				onChange={(event) =>
																					updateTask(phase.id, task.id, 'title', event.target.value)
																				}
																			/>
																			<textarea
																				className='task-notes'
																				rows={2}
																				value={task.notes}
																				onChange={(event) =>
																					updateTask(phase.id, task.id, 'notes', event.target.value)
																				}
																			/>
																		</>
																	)}
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
						) : (
							<div className='phase-list phase-skeleton-list' aria-hidden='true'>
								{Array.from({ length: 3 }, (_, index) => (
									<article className='phase-card phase-card-skeleton' key={`skeleton-${index}`}>
										<div className='skeleton-line skeleton-line-xs' />
										<div className='skeleton-line skeleton-line-lg' />
										<div className='skeleton-line skeleton-line-sm' />
										<div className='phase-progress-track skeleton-track'>
											<div
												className='phase-progress-bar skeleton-bar'
												style={{ width: `${40 + index * 15}%` }}
											/>
										</div>
										<div className='task-list'>
											{Array.from({ length: 3 }, (_, taskIndex) => (
												<div
													className='task-card task-card-skeleton'
													key={`task-skeleton-${taskIndex}`}
												>
													<span className='task-check-visual' />
													<div className='task-body'>
														<div className='task-topline'>
															<span className='skeleton-pill skeleton-pill-small' />
														</div>
														<div className='skeleton-line skeleton-line-md' />
														<div className='skeleton-line skeleton-line-sm' />
													</div>
												</div>
											))}
										</div>
									</article>
								))}
							</div>
						)}
					</section>
				) : null}
			</section>
		</main>
	);
}
