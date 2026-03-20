'use client';

import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

type ChatSession = {
	id: string;
	title: string;
	updatedAt: number;
	planner: PlannerState;
	pendingRoadmap: PendingRoadmap | null;
};

const STORAGE_KEY = 'roadmap-lab-chats-v1';

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

function buildChatSession(id = createId('chat'), title = 'New chat'): ChatSession {
	return {
		id,
		title,
		updatedAt: Date.now(),
		planner: buildInitialState(),
		pendingRoadmap: null,
	};
}

function sessionHasContent(session: ChatSession) {
	return (
		session.planner.messages.length > 0 ||
		session.planner.phases.length > 0 ||
		session.pendingRoadmap !== null
	);
}

function deriveSessionTitle(session: ChatSession, fallbackInput?: string) {
	if (session.pendingRoadmap?.config.topic) {
		return session.pendingRoadmap.config.topic;
	}

	if (session.planner.config.topic) {
		return session.planner.config.topic;
	}

	const firstUserMessage = session.planner.messages.find(
		(message) => message.role === 'user',
	)?.text;
	const seed = fallbackInput || firstUserMessage || 'New chat';

	return seed.length > 36 ? `${seed.slice(0, 36).trim()}...` : seed;
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

type Props = {
	chatId: string;
};

export default function RoadmapLab({ chatId }: Props) {
	const router = useRouter();
	const composerId = useId();
	const createdSessionRouteRef = useRef<string | null>(null);
	const messageListRef = useRef<HTMLDivElement | null>(null);
	const messageEndRef = useRef<HTMLDivElement | null>(null);
	const [sessions, setSessions] = useState<ChatSession[]>([]);
	const [draft, setDraft] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [animateRoadmap, setAnimateRoadmap] = useState(false);
	const [isRoadmapOpen, setIsRoadmapOpen] = useState(false);
	const [isRoadmapEditing, setIsRoadmapEditing] = useState(false);
	const [isMobileChatsOpen, setIsMobileChatsOpen] = useState(false);
	const [hasHydratedChats, setHasHydratedChats] = useState(false);

	useEffect(() => {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			setSessions([]);
			setHasHydratedChats(true);
			return;
		}

		try {
			const parsed = JSON.parse(raw) as { sessions?: ChatSession[] };
			setSessions(parsed.sessions ?? []);
		} catch {
			window.localStorage.removeItem(STORAGE_KEY);
			setSessions([]);
		} finally {
			setHasHydratedChats(true);
		}
	}, []);

	useEffect(() => {
		if (!hasHydratedChats) {
			return;
		}

		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }));
	}, [hasHydratedChats, sessions]);

	useEffect(() => {
		if (!hasHydratedChats) {
			return;
		}

		if (chatId === 'new') {
			if (createdSessionRouteRef.current === chatId) {
				return;
			}

			createdSessionRouteRef.current = chatId;
			const reusableSession = sessions.find((session) => !sessionHasContent(session));
			if (reusableSession) {
				router.replace(`/chat/${reusableSession.id}`);
				return;
			}

			const nextSession = buildChatSession();
			setSessions((current) => [nextSession, ...current]);
			router.replace(`/chat/${nextSession.id}`);
			return;
		}

		createdSessionRouteRef.current = null;

		const exists = sessions.some((session) => session.id === chatId);
		if (!exists) {
			setSessions((current) => [buildChatSession(chatId), ...current]);
		}
	}, [chatId, hasHydratedChats, router, sessions]);

	const activeSession = useMemo(
		() => sessions.find((session) => session.id === chatId) ?? null,
		[chatId, sessions],
	);

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
		if (!isRoadmapOpen && !isMobileChatsOpen) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isMobileChatsOpen, isRoadmapOpen]);

	function updateActiveSession(updater: (session: ChatSession) => ChatSession) {
		setSessions((current) =>
			current.map((session) => (session.id === chatId ? updater(session) : session)),
		);
	}

	function createNewChat() {
		if (activeSession && !sessionHasContent(activeSession)) {
			setDraft('');
			setError(null);
			setIsSubmitting(false);
			setIsRoadmapOpen(false);
			setIsMobileChatsOpen(false);
			return;
		}

		router.push('/chat/new');
		setDraft('');
		setError(null);
		setIsSubmitting(false);
		setIsRoadmapOpen(false);
		setIsMobileChatsOpen(false);
	}

	function selectChatSession(sessionId: string) {
		router.push(`/chat/${sessionId}`);
		setDraft('');
		setError(null);
		setIsSubmitting(false);
		setIsRoadmapOpen(false);
		setIsMobileChatsOpen(false);
	}

	function deleteChatSession(sessionId: string) {
		const remaining = sessions.filter((session) => session.id !== sessionId);
		setSessions(remaining);

		if (chatId === sessionId) {
			if (remaining.length > 0) {
				router.push(`/chat/${remaining[0].id}`);
			} else {
				router.push('/chat/new');
			}
		}

		setDraft('');
		setError(null);
		setIsSubmitting(false);
		setIsRoadmapOpen(false);
	}

	const planner = activeSession?.planner ?? buildInitialState();
	const pendingRoadmap = activeSession?.pendingRoadmap ?? null;
	const metrics = formatPercent(planner.phases);
	const hasRoadmap = planner.phases.length > 0;
	const displayedRoadmap = pendingRoadmap
		? { config: pendingRoadmap.config, phases: pendingRoadmap.phases }
		: { config: planner.config, phases: planner.phases };
	const showingPreview = pendingRoadmap !== null;
	const shouldShowRoadmapPanel = displayedRoadmap.phases.length > 0;
	const orderedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

	useEffect(() => {
		setIsRoadmapEditing(false);
	}, [chatId, showingPreview]);

	useEffect(() => {
		messageEndRef.current?.scrollIntoView({
			block: 'end',
			behavior: 'smooth',
		});
	}, [chatId, isSubmitting, planner.messages.length]);

	if (!hasHydratedChats || !activeSession) {
		return (
			<main className='roadmap-shell'>
				<section className='workspace-grid workspace-grid-no-roadmap'>
					<aside className='panel chat-panel'>
						<div className='message-list'>
							<div className='chat-empty-state'>
								<div className='chat-empty-icon' aria-hidden='true'>
									<span className='chat-empty-orb' />
									<span className='chat-empty-sheet'>
										<i />
										<i />
										<i />
									</span>
								</div>
								<h3>Loading chats...</h3>
							</div>
						</div>
					</aside>
				</section>
			</main>
		);
	}

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

		updateActiveSession((current) => ({
			...current,
			title: deriveSessionTitle(current, input),
			updatedAt: Date.now(),
			planner: {
				...current.planner,
				messages: nextMessages,
			},
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
			const responseError = 'error' in payload ? payload.error : undefined;

			if (!response.ok || !('mode' in payload)) {
				throw new Error(responseError || 'Unable to generate roadmap right now.');
			}

			updateActiveSession((current) => ({
				...current,
				title: deriveSessionTitle(current, input),
				updatedAt: Date.now(),
				planner: {
					...current.planner,
					messages: [
						...current.planner.messages,
						{
							id: createId('message'),
							role: 'assistant',
							text: payload.assistantMessage,
						},
					],
				},
			}));

			if (
				(payload.mode === 'create_roadmap' || payload.mode === 'update_roadmap') &&
				payload.roadmap
			) {
				const roadmap = payload.roadmap;
				const pendingMode =
					payload.mode === 'create_roadmap' ? 'create_roadmap' : 'update_roadmap';

				updateActiveSession((current) => ({
					...current,
					title: deriveSessionTitle(
						{
							...current,
							planner: {
								...current.planner,
								config: roadmap.config,
							},
						},
						input,
					),
					updatedAt: Date.now(),
					pendingRoadmap: {
						mode: pendingMode,
						config: roadmap.config,
						phases: hydratePhases(roadmap.phases),
						message: payload.assistantMessage,
					},
				}));
				setAnimateRoadmap(true);
				setIsRoadmapOpen(true);
			}
		} catch (submissionError) {
			const message =
				submissionError instanceof Error
					? submissionError.message
					: 'Unable to generate roadmap right now.';

			setError(message);
			updateActiveSession((current) => ({
				...current,
				planner: {
					...current.planner,
					messages: current.planner.messages.slice(0, -1),
				},
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

	function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
			return;
		}

		event.preventDefault();
		void submitPrompt(draft);
	}

	function toggleTask(phaseId: string, taskId: string) {
		updateActiveSession((current) => ({
			...current,
			updatedAt: Date.now(),
			planner: {
				...current.planner,
				phases: current.planner.phases.map((phase) =>
					phase.id !== phaseId
						? phase
						: {
								...phase,
								tasks: phase.tasks.map((task) =>
									task.id !== taskId ? task : { ...task, done: !task.done },
								),
							},
				),
			},
		}));
	}

	function updateTask(phaseId: string, taskId: string, field: 'title' | 'notes', value: string) {
		updateActiveSession((current) => ({
			...current,
			updatedAt: Date.now(),
			planner: {
				...current.planner,
				phases: current.planner.phases.map((phase) =>
					phase.id !== phaseId
						? phase
						: {
								...phase,
								tasks: phase.tasks.map((task) =>
									task.id !== taskId ? task : { ...task, [field]: value },
								),
							},
				),
			},
		}));
	}

	function updatePhase(phaseId: string, field: 'title' | 'summary' | 'focus', value: string) {
		updateActiveSession((current) => ({
			...current,
			updatedAt: Date.now(),
			planner: {
				...current.planner,
				phases: current.planner.phases.map((phase) =>
					phase.id !== phaseId ? phase : { ...phase, [field]: value },
				),
			},
		}));
	}

	function applyPendingRoadmap() {
		if (!pendingRoadmap) {
			return;
		}

		updateActiveSession((current) => ({
			...current,
			title: deriveSessionTitle({
				...current,
				planner: {
					...current.planner,
					config: pendingRoadmap.config,
				},
			}),
			updatedAt: Date.now(),
			planner: {
				...current.planner,
				config: pendingRoadmap.config,
				phases: pendingRoadmap.phases,
			},
			pendingRoadmap: null,
		}));
		setIsRoadmapEditing(false);
	}

	return (
		<main className='roadmap-shell'>
			<section className='workspace-grid workspace-grid-app'>
				<aside className={`panel sessions-panel ${isMobileChatsOpen ? 'mobile-open' : ''}`}>
					<div className='sessions-header'>
						<div className='sessions-header-row'>
							<h2>Chats</h2>
							<button
								aria-expanded={isMobileChatsOpen}
								aria-label={isMobileChatsOpen ? 'Close chats menu' : 'Open chats menu'}
								className={`hamburger-button sidebar-hamburger ${
									isMobileChatsOpen ? 'hamburger-button-open' : ''
								}`}
								onClick={() => setIsMobileChatsOpen((current) => !current)}
								type='button'
							>
								<span />
								<span />
								<span />
							</button>
						</div>
						<button className='primary-button' onClick={createNewChat} type='button'>
							New chat
						</button>
					</div>

					<div className='sessions-list'>
						{orderedSessions.map((session) => {
							const sessionRoadmap = session.pendingRoadmap
								? session.pendingRoadmap.phases
								: session.planner.phases;
							const sessionMetrics = formatPercent(sessionRoadmap);
							const isActive = session.id === activeSession.id;

							return (
								<div
									className={`session-item ${isActive ? 'session-item-active' : ''}`}
									key={session.id}
								>
									<button
										className='session-item-main'
										onClick={() => selectChatSession(session.id)}
										type='button'
									>
										<strong>{session.title}</strong>
										<span>
											{sessionRoadmap.length > 0
												? `${sessionMetrics.completed}/${sessionMetrics.total} tasks complete`
												: session.planner.messages.length > 0
													? `${session.planner.messages.length} messages`
													: 'Empty conversation'}
										</span>
									</button>
									{sessions.length > 1 ? (
										<button
											aria-label={`Delete ${session.title}`}
											className='session-delete'
											onClick={() => deleteChatSession(session.id)}
											type='button'
										>
											×
										</button>
									) : null}
								</div>
							);
						})}
					</div>
				</aside>

				<aside className={`panel chat-panel ${isSubmitting ? 'panel-busy' : ''}`}>
					<div className='panel-header'>
						<div className='chat-header-main'>
							<button
								aria-expanded={isMobileChatsOpen}
								aria-label={isMobileChatsOpen ? 'Close chats menu' : 'Open chats menu'}
								className={`hamburger-button mobile-chats-trigger ${
									isMobileChatsOpen ? 'hamburger-button-open' : ''
								}`}
								onClick={() => setIsMobileChatsOpen((current) => !current)}
								type='button'
							>
								<span />
								<span />
								<span />
							</button>
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
						</div>
						<div className='chat-header-actions'>
							<button
								className={`secondary-button roadmap-trigger ${
									shouldShowRoadmapPanel ? 'roadmap-trigger-ready' : 'roadmap-trigger-empty'
								}`}
								disabled={!shouldShowRoadmapPanel}
								onClick={() => setIsRoadmapOpen(true)}
								type='button'
							>
								{showingPreview ? 'Preview' : 'Roadmap'}
							</button>
						</div>
					</div>

					<div className='message-list' ref={messageListRef}>
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
									{message.role === 'assistant' && <span className='message-role'>Planner</span>}

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
						<div ref={messageEndRef} />
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
								onKeyDown={handleComposerKeyDown}
								placeholder='Ask for a roadmap or refinement...'
								rows={2}
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
			</section>

			{shouldShowRoadmapPanel ? (
				<>
					<button
						aria-label='Close roadmap'
						className={`roadmap-backdrop ${isRoadmapOpen ? 'open' : ''}`}
						onClick={() => setIsRoadmapOpen(false)}
						type='button'
					/>
					<section
						className={`panel roadmap-panel ${animateRoadmap ? 'roadmap-reveal' : ''} ${
							isSubmitting ? 'panel-busy' : ''
						} ${isRoadmapOpen ? 'open' : ''}`}
					>
						<div className='panel-header'>
							<div className='roadmap-header-main'>
								<button
									aria-label='Close roadmap'
									className='roadmap-modal-close'
									onClick={() => setIsRoadmapOpen(false)}
									type='button'
								>
									<span />
									<span />
								</button>
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
							</div>
							<div className='roadmap-header-actions'>
								{showingPreview ? (
									<div className='preview-actions'>
										<button className='primary-button' onClick={applyPendingRoadmap} type='button'>
											{pendingRoadmap.mode === 'create_roadmap'
												? 'Confirm roadmap'
												: 'Apply changes'}
										</button>
									</div>
								) : hasRoadmap ? (
									<button
										className='secondary-button'
										onClick={() => setIsRoadmapEditing((current) => !current)}
										type='button'
									>
										{isRoadmapEditing ? 'Done' : 'Edit'}
									</button>
								) : null}
							</div>
						</div>

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
												</div>

												<div className='phase-progress-track' aria-hidden='true'>
													<div
														className='phase-progress-bar'
														style={{ width: `${phaseMetrics.percent}%` }}
													/>
												</div>

												{showingPreview || !isRoadmapEditing ? (
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
														<div
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
																{showingPreview || !isRoadmapEditing ? (
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
														</div>
													))}
												</div>
											</>
										);
									})()}
								</article>
							))}
						</div>
					</section>
				</>
			) : null}
		</main>
	);
}
