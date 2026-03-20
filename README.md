## Roadmap Lab

Roadmap Lab is a chat-first learning planner that turns AI conversations into trackable study roadmaps. Each chat keeps its own conversation history, roadmap draft, and progress state.

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env.local
```

3. Add your Gemini API key to `.env.local`.

4. Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
```

`gemini-2.5-flash-lite` is the recommended default here because it is usually more practical for free-tier and lower-quota usage.

## Available Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Production Notes

- The Gemini-powered planner runs through `src/app/api/roadmap/route.ts`.
- Chats and roadmaps are currently stored in browser `localStorage`, so they are not shared across browsers or devices.
- To support shared chats, persistence, and shareable links, the next production step is adding a database-backed chat store.
- Your deployment environment must provide `GEMINI_API_KEY`.

## Deployment

This app can be deployed as a standard Next.js application on platforms like Vercel.

Before deploying:

- set `GEMINI_API_KEY`
- optionally set `GEMINI_MODEL`
- run `npm run build`
