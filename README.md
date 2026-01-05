# Realtime Planning Poker

A real-time planning poker application powered by Next.js and Cloudflare Durable Objects.

## Architecture

- **Frontend**: Next.js (App Router)
- **Backend**: Cloudflare Workers + Durable Objects
- **Communication**: WebSockets (with Hibernation support)
- **State Management**: Durable Object Storage

## Prerequisites

- Node.js (v18+)
- npm
- Cloudflare Wrangler (`npm install -g wrangler`)

## Getting Started

1.  **Install Dependencies**

    ```bash
    npm install
    cd worker && npm install && cd ..
    ```

2.  **Run Locally**

    Run the frontend and backend concurrently with a single command:

    ```bash
    npm run dev
    ```

    - Frontend: [http://localhost:3000](http://localhost:3000)
    - Worker: [http://localhost:8787](http://localhost:8787)

    The application uses `concurrently` to spin up both the Next.js dev server and `wrangler dev` for the worker.

## Deployment

1.  **Deploy Worker**

    ```bash
    cd worker
    npx wrangler deploy
    ```

2.  **Configure Frontend**

    Update `NEXT_PUBLIC_WORKER_URL` in your Vercel/Cloudflare Pages project settings to point to your deployed Worker URL.

## Features

- Real-time voting and revealing
- WebSocket Hibernation for scaling and cost efficiency
- Automatic session cleanup (1 hour inactivity)
- Open/Closed session modes
