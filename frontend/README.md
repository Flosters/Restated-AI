# Contract Viewer - Next.js Frontend

A modern, responsive frontend for viewing contract documents with visual highlighting of amendments and modifications.

## Features

✅ **Visual Clause Highlighting**
- 🔵 Blue background for added clauses
- 🔴 Red background for modified clauses  
- 🟣 Purple background for side letter affected clauses

✅ **Interactive History Sidebar**
- Click on any modified clause to view its version history
- Timeline view of all changes
- Amendment details and timestamps
- Text comparison (old vs new)

✅ **Modern Tech Stack**
- Next.js 14 with App Router
- TypeScript for type safety
- Tailwind CSS for beautiful, responsive design
- Professional animations and transitions

## Installation

**Prerequisites:** Node.js 18+ and npm

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at **http://localhost:3000**

## Usage

### 1. Start the Backend Server

Make sure the FastAPI backend is running:

```bash
cd /Users/agustinsilvazambrano/Desktop/Antigraity\ Projects/Restated
PYTHONPATH=. python3 -m app.main
```

Backend should be running on **http://localhost:8000**

### 2. Upload a Contract

Use the backend interface at http://localhost:8000 to upload a contract and amendments.

### 3. View the Contract

Navigate to `http://localhost:3000/contracts/{contractId}` where `{contractId}` is the ID returned from the upload.

**Example:** http://localhost:3000/contracts/1

### 4. Explore Clause History

Click on any clause with a red background (modified) to open the history sidebar and see all changes over time.

## Project Structure

```
frontend/
├── app/
│   ├── contracts/
│   │   └── [contractId]/
│   │       └── page.tsx        # Dynamic contract viewer page
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── globals.css              # Global styles + Tailwind
├── components/
│   ├── ClauseComponent.tsx      # Individual clause display
│   └── Sidebar.tsx              # History sidebar
├── types/
│   └── contract.ts              # TypeScript interfaces
├── lib/
│   └── api.ts                   # API client functions
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies
```

## API Integration

The frontend connects to the FastAPI backend via:

- `GET /contracts/{contractId}` - Fetch contract with enriched clause metadata
- `GET /contracts/{contractId}/clauses/{clauseId}/history` - Fetch clause version history

API base URL is configured in `lib/api.ts` (default: http://localhost:8000)

## Building for Production

```bash
npm run build
npm start
```

## Responsive Design

The application is fully responsive:
- **Desktop**: Full-width sidebar for clause history
- **Tablet**: Half-width sidebar  
- **Mobile**: Full-screen sidebar overlay

## Color Scheme

| State | Background | Border | Use Case |
|-------|-----------|---------|----------|
| Added | `bg-blue-50` | `border-blue-200` | New clauses from amendments |
| Modified | `bg-red-50` | `border-red-200` | Changed/replaced clauses |
| Side Letter | `bg-purple-50` | `border-purple-200` | Affected by side letters |
| Default | `bg-white` | `border-gray-200` | Unchanged original clauses |

## Development Notes

- The app uses Next.js App Router (not Pages Router)
- All data fetching is client-side with React hooks
- TypeScript strict mode is enabled
- Tailwind JIT compiler for optimal CSS output

## Troubleshooting

**CORS errors?**
- Ensure the backend CORS middleware includes `http://localhost:3000`
- Check that both servers are running

**Contract not loading?**
- Verify the contract ID exists in the database
- Check browser console for API errors
- Ensure backend is reachable at http://localhost:8000

**Sidebar not showing history?**
- Ensure the clause has been modified (check for versions in database)
- Verify the clause history endpoint is working: http://localhost:8000/contracts/{id}/clauses/{clauseId}/history
