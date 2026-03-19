import RoadmapLab from '@/components/roadmap-lab';

type PageProps = {
	params: Promise<{
		chatId: string;
	}>;
};

export default async function ChatPage({ params }: PageProps) {
	const { chatId } = await params;

	return <RoadmapLab chatId={chatId} />;
}
