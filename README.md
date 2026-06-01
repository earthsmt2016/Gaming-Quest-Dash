# Gaming-Quest-Dash

A modern **full-stack gaming dashboard** and quest tracking application built with TypeScript.

> Repository for the [Replit Gaming-Quest-Dash project](https://replit.com/@ydkm7gmnbx/Gaming-Quest-Dash)

## ✨ Features

- **Modern React 19** frontend with Vite
- **Type-safe** development with strict TypeScript
- **Quest & Gaming Dashboard** interface
- Real-time data fetching with **TanStack Query**
- Beautiful UI with **Tailwind CSS** + **Radix UI** + **Framer Motion**
- Form handling with **React Hook Form** + **Zod**
- Charts and visualizations with **Recharts**
- Backend API server
- OpenAI integration support
- Monorepo architecture using **pnpm workspaces**

## 🛠 Tech Stack

### Frontend (`artifacts/gaming-quest`)
- **React 19** + **Vite**
- **TypeScript**
- **Tailwind CSS**
- **Radix UI** + **Lucide Icons**
- **TanStack React Query**
- **React Hook Form** + **Zod**
- **Wouter** (routing)
- **Framer Motion** (animations)
- **Recharts**

### Backend & Shared
- Node.js TypeScript API server
- Shared libraries (`lib/`)
  - `api-spec`, `api-zod`, `api-client-react`
  - Database layer
  - OpenAI client & server integrations

### Tooling
- **pnpm** workspaces
- **Drizzle ORM** (likely)
- Replit optimized

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm

### Installation

```bash
# Clone the repo
git clone https://github.com/earthsmt2016/Gaming-Quest-Dash.git
cd Gaming-Quest-Dash

# Install dependencies
pnpm install

# Start development server
pnpm --filter gaming-quest dev
```

### Project Structure

```
Gaming-Quest-Dash/
├── artifacts/                 # Built applications (frontend, API server, sandbox)
│   ├── gaming-quest/          # Main React frontend
│   ├── api-server/            # Backend API
│   └── mockup-sandbox/        # Testing/playground area
├── lib/                       # Shared packages
│   ├── api-*/                 # Type-safe API contracts and clients
│   └── db/                    # Database layer (Drizzle ORM)
├── scripts/                   # Utility scripts (post-merge hooks, etc.)
├── attached_assets/           # Static assets and resources
├── tsconfig*.json             # TypeScript configuration
├── pnpm-workspace.yaml        # Workspace and dependency management
└── .replit                    # Replit-specific configuration
```

## 📝 Development

- Run frontend: `pnpm --filter gaming-quest dev`
- Build: `pnpm --filter gaming-quest build`
- Type checking: `pnpm type-check`

## Deployment

Optimized for **Replit** but fully compatible with local development using Node.js and pnpm on any machine (including Windows).

## Contributing

1. Create an issue branch (feature branches are reserved for major work)
2. Make your changes
3. Submit a Pull Request

## License

All rights reserved.