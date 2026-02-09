# Restated AI

**Know exactly what you've signed.**

Restated AI is an open-source contract management application that automatically parses, tracks, and visualizes changes across amended & restated agreements using AI-powered analysis.

![Restated AI Dashboard](https://img.shields.io/badge/status-open%20source-success)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![Next.js](https://img.shields.io/badge/next.js-14-black)

## Why Restated AI?

Managing amended contracts is painful. You receive an amendment, but what's actually changed? Which clauses are still active? What did the original say?

Restated AI solves this by:
- 🤖 **Automatically parsing** contracts using AI
- 🎨 **Color-coding changes** so you instantly see what's modified
- 📚 **Tracking full history** of every clause across all amendments
- 📄 **Generating clean PDFs** with all changes incorporated

Perfect for legal teams, contract managers, and anyone who needs clarity in their agreements.

## Features

- 📄 **AI-Powered Parsing**: Automatically extracts clauses, metadata, and structure from PDF contracts using Google Gemini
- 🔍 **Change Tracking**: Visual highlighting of added, modified, and eliminated clauses across amendments
- 📝 **Side Letter Support**: Identifies and tracks side letter modifications
- 📊 **Version History**: Complete timeline showing how each clause evolved over time
- 🎨 **Clean UI**: Modern, elegant interface built with Next.js and Tailwind CSS
- 📥 **PDF Export**: Generate clean, formatted amended & restated agreements
- 💡 **AI Summaries**: Get instant key points for each agreement

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - ORM for database management
- **Google Gemini API** - AI-powered contract parsing
- **ReportLab** - PDF generation
- **SQLite** - Lightweight database

### Frontend
- **Next.js 14** - React framework with TypeScript
- **Tailwind CSS** - Utility-first styling
- **Cormorant & DM Sans** - Premium typography

## Prerequisites

- Python 3.11+
- Node.js 18+
- Google Gemini API key

## Installation

### 1. Clone the Repository

\`\`\`bash
git clone https://github.com/Flosters/Restated-AI.git
cd Restated-AI
\`\`\`

### 2. Set Up Backend

\`\`\`bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
\`\`\`

Edit `.env` and add your Google Gemini API key:
\`\`\`bash
GOOGLE_API_KEY=your_api_key_here

# Optional: configure if deploying beyond localhost
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
\`\`\`

**Get your free API key**:
1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key or use an existing one
4. Copy and paste it into your `.env` file

**Note**: The free tier allows 5 requests per minute. The app includes automatic retry logic with backoff for rate limits, so it will work on the free tier — just slower with multiple amendments. For faster processing, enable billing on your Google Cloud project.

### 3. Set Up Frontend

\`\`\`bash
cd frontend
npm install
\`\`\`

### 4. Run the Application

**Terminal 1 - Backend:**
\`\`\`bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
\`\`\`

**Terminal 2 - Frontend:**
\`\`\`bash
cd frontend
npm run dev
\`\`\`

Open http://localhost:3000 in your browser.

## Usage

### First Time Setup
1. Enter your name and company when prompted
2. This helps identify counterparties in your agreements

### Uploading Contracts
1. Click **"New Agreement"**
2. Upload the original contract PDF
3. Optionally upload amendment or side letter PDFs
4. Click **"Generate Amended & Restated Agreement"**

### Viewing Contracts
- **Star icon** - View AI-generated key points
- **Eye icon** - Open the agreement viewer
- **Download icon** - Export as PDF

### Contract Viewer Features
- Click any colored clause to see its version history
- **Blue** = Added clauses
- **Red** = Modified terms
- **Green** = Eliminated clauses
- **Purple** = Side letter modifications
- Toggle the **Smart Legend** to see color meanings
- Click **Overview** to see document timeline and sources

## Project Structure

\`\`\`
restated/
├── app/                      # Backend (FastAPI)
│   ├── main.py              # API endpoints
│   ├── models.py            # Database models
│   ├── schemas.py           # Pydantic schemas
│   ├── gemini_parser.py     # AI parsing logic
│   ├── amendment.py         # Amendment application
│   ├── export.py            # PDF generation
│   └── static/              # Uploaded files
├── frontend/                 # Frontend (Next.js)
│   ├── app/                 # Pages and layouts
│   ├── components/          # React components
│   ├── lib/                 # API client
│   └── types/               # TypeScript types
├── tests/                    # Test suite (pytest)
├── .env.example             # Environment template
├── requirements.txt         # Python dependencies
└── README.md               # This file
\`\`\`

## Troubleshooting

### "GOOGLE_API_KEY environment variable is required"
Make sure you:
1. Created a `.env` file in the root directory (copy from `.env.example`)
2. Added your API key: `GOOGLE_API_KEY=your_actual_key_here`
3. Restarted the backend server

### PDFs not parsing correctly
- Ensure your PDF is text-based (not a scanned image)
- For best results, use clean PDFs exported from Word/Google Docs
- Scanned PDFs require OCR preprocessing (coming soon)

### Frontend can't connect to backend
- Make sure the backend is running on port 8000
- Check that no other service is using port 8000
- Verify `http://localhost:8000/docs` loads in your browser

## Security Notes

⚠️ **IMPORTANT**: This application is for internal use. Never expose it to the public internet without proper authentication and security measures.

- Keep your `.env` file private (already in `.gitignore`)
- Never commit API keys to version control
- The database contains your contract data - keep it secure
- Use HTTPS in production environments
- Consider adding authentication if deploying to a server

## Development

### Running Tests
\`\`\`bash
pytest tests/
\`\`\`

### Code Style
- Python: Follow PEP 8
- TypeScript/React: Follow Airbnb style guide
- Use meaningful variable names
- Comment complex logic

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit your changes (\`git commit -m 'Add amazing feature'\`)
4. Push to the branch (\`git push origin feature/amazing-feature\`)
5. Open a Pull Request

## Roadmap

- [ ] Multi-user support with authentication
- [ ] Export to Word/DOCX format
- [ ] OCR support for scanned PDFs
- [ ] Batch upload for multiple contracts
- [ ] Custom clause templates
- [ ] Integration with DocuSign/HelloSign
- [ ] API for programmatic access

Want to contribute to any of these? Open an issue to discuss!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

You're free to use, modify, and distribute this software for both personal and commercial purposes.

## Acknowledgments

- Built with [Google Gemini](https://ai.google.dev/)
- UI design inspired by legal document aesthetics
- Typography: [Cormorant](https://github.com/CatharsisFonts/Cormorant) & [DM Sans](https://fonts.google.com/specimen/DM+Sans)

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

Made with precision for legal professionals who need clarity in their contracts.
