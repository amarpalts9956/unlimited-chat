# unlimited-chat

A real-time, full-featured chat application with no message limits.

## Version 2.0

## Overview

unlimited-chat is an open-source messaging platform that enables real-time communication without restrictions on message volume or history. It is designed for individuals and teams who need a reliable, scalable, and privacy-friendly chat solution.

## Features

- **Unlimited message history** – No cap on messages stored or retrieved.
- **Real-time messaging** – Instant delivery powered by WebSockets.
- **Multi-room support** – Create and join multiple chat rooms.
- **User authentication** – Secure sign-up and login flows.
- **Rich text support** – Markdown rendering in messages.
- **File sharing** – Upload and share files directly in conversations.
- **Notifications** – Browser and in-app notifications for new messages.
- **Search** – Full-text search across all messages and rooms.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 9 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/amarpalts9956/unlimited-chat.git
cd unlimited-chat

# Install dependencies
npm install
```

### Configuration

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |
| `DATABASE_URL` | Connection string for the database | — |
| `JWT_SECRET` | Secret key used to sign authentication tokens | — |
| `WEBSOCKET_ORIGIN` | Allowed origin for WebSocket connections | `*` |

### Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

The application will be available at `http://localhost:3000` by default.

## Usage

1. Open the application in your browser.
2. Create an account or log in with existing credentials.
3. Create a new room or join an existing one using a room code.
4. Start chatting — there are no message limits.

## API Reference

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Log in and receive a JWT |
| `POST` | `/api/auth/logout` | Invalidate the current session |

### Rooms

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rooms` | List all accessible rooms |
| `POST` | `/api/rooms` | Create a new room |
| `GET` | `/api/rooms/:id` | Get details for a specific room |
| `DELETE` | `/api/rooms/:id` | Delete a room (owner only) |

### Messages

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/rooms/:id/messages` | Retrieve message history |
| `POST` | `/api/rooms/:id/messages` | Send a message |
| `DELETE` | `/api/messages/:id` | Delete a message |

### WebSocket Events

Connect to `ws://localhost:3000` with a valid JWT in the `Authorization` header.

| Event | Direction | Payload |
|---|---|---|
| `message:new` | Server → Client | `{ roomId, message }` |
| `message:send` | Client → Server | `{ roomId, content }` |
| `room:join` | Client → Server | `{ roomId }` |
| `room:leave` | Client → Server | `{ roomId }` |

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes: `git commit -m "feat: add your feature"`.
4. Push to your fork: `git push origin feature/your-feature`.
5. Open a pull request against `main`.

Please make sure your code passes all existing tests before submitting:

```bash
npm test
```

## License

This project is licensed under the [MIT License](LICENSE).
