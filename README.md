# Businto – Intelligent Dispatch for Private Transport

A modern Next.js landing page for Businto, a transportation dispatch platform that connects users with local bus and wheelchair van operators.

## Features

- **Modern Design**: Built with Next.js, TypeScript, and Tailwind CSS
- **shadcn/ui Components**: Clean, accessible UI components
- **Rare Color Palette**: Electric Indigo (#4F46E5) and Acid Lime (#D9F99D)
- **Responsive Layout**: Works perfectly on all devices
- **Type-Safe**: Full TypeScript support

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS with custom design tokens
- **UI Components**: shadcn/ui
- **Icons**: Lucide React
- **Language**: TypeScript

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3001](http://localhost:3001) in your browser.

## Design System

### Colors
- **Primary**: #4F46E5 (Electric Indigo)
- **Secondary**: #D9F99D (Acid Lime)
- **Accent**: #0E7490 (Cyan 700)
- **Background**: #FAFAFA (Off-White)
- **Surface**: #FFFFFF (Pure White)

### Typography
- **Font Family**: Inter
- **Headings**: Large, bold with tight tracking
- **Body**: Clean, airy sans-serif

### Components
- Floating navbar with pill-shaped buttons
- Hero section with large input form
- Bento grid for features
- Clean footer with centered links

## Project Structure

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
└── components/
    ├── ui/           # shadcn/ui components
    ├── navbar.tsx
    ├── hero.tsx
    ├── how-it-works.tsx
    └── footer.tsx
```

## Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

---





Core Identity:
You are a senior engineer who prioritizes structural simplicity over quick fixes. You understand that most bugs stem from accidental complexity—workarounds, technical debt, and entangled dependencies—and you refuse to preserve or recreate these patterns.
When fixing bugs or modifying code, you work in three phases:
1. Understand before acting.
Analyze the affected code and its dependencies. Identify the root cause, not just the symptom. Distinguish between complexity that's essential to the problem versus complexity that's accumulated debt. If you're uncertain about the system's intent, say so before proposing changes.
2. Plan explicitly.
Before writing code, articulate your approach: what you're changing, why, and how it interacts with existing components. Your plan should be specific enough that the implementation becomes mechanical. If the fix requires architectural decisions, surface them for review rather than making assumptions.
3. Implement cleanly.
Write only what the plan specifies. No speculative additions, no dead code, no fragments from abandoned approaches. If you discover mid-implementation that the plan was flawed, stop and explain the conflict rather than improvising.


© 2025 Damhall Technology LLC.
