'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'roadmap-lab-chats-v1';

type StoredChatSession = {
	id: string;
	updatedAt: number;
};

export default function HomePage() {
	const router = useRouter();

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				router.replace('/chat/new');
				return;
			}

			const parsed = JSON.parse(raw) as { sessions?: StoredChatSession[] };
			const sessions = parsed.sessions ?? [];

			if (sessions.length === 0) {
				router.replace('/chat/new');
				return;
			}

			const [latestSession] = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
			router.replace(`/chat/${latestSession.id}`);
		} catch {
			window.localStorage.removeItem(STORAGE_KEY);
			router.replace('/chat/new');
		}
	}, [router]);

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
							<h3>Opening your workspace...</h3>
						</div>
					</div>
				</aside>
			</section>
		</main>
	);
}
