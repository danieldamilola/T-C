# T&C Lens

> Decode Terms of Service and Privacy Policies instantly with AI. A minimal, bring-your-own-key Chrome extension.

T&C Lens is an AI-powered browser extension that reads the fine print so you don't have to. It extracts the complex legal jargon from Terms and Conditions or Privacy Policies and uses your preferred Large Language Model (LLM) to summarize it into plain English, assigning a risk score and highlighting critical findings.

## Features

- **Bring Your Own Key (BYOK)**: Supports major AI providers including Google Gemini, OpenAI, Anthropic, DeepSeek, Groq, Mistral, xAI, OpenRouter, and Together AI.
- **Minimal, Dark-by-Default UI**: Designed to feel like a premium developer tool. Zero clutter, pure utility.
- **Smart Extraction**: Intelligent scraper that specifically targets legal terms, ignoring navigation, headers, footers, and cookie banners.
- **On-Demand Analysis**: Runs strictly when you click the extension icon or context menu. Doesn't monitor your background browsing.
- **History & Export**: Saves your previous analyses locally and allows you to export them to a text file.

## Getting Started

### Installation (Developer Mode)

Since this extension is not yet published on the Chrome Web Store, you can load it as an unpacked extension:

1. Clone this repository:
   ```bash
   git clone https://github.com/danieldamilola/T-C.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the cloned `T-C` directory.
5. The extension icon will appear in your browser toolbar.

### Configuration

1. Click the T&C Lens icon in your toolbar.
2. Go to the **Settings** view.
3. Select your preferred AI provider (e.g., Google Gemini, OpenAI).
4. Enter your API Key for that provider.
5. Click **Refresh available models** and select your desired model.
6. Click **Save**.

## Usage

1. Navigate to any Terms of Service, Privacy Policy, or legal agreement page.
2. Click the T&C Lens extension icon (or right-click the page and select "Analyze with T&C Lens").
3. Wait a few seconds for the AI to analyze the document.
4. Review the overall risk score, plain-English summary, and specific high/medium/low importance findings.

## Development & Contribution

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Architecture Overview

- **`manifest.json`**: Manifest V3 configuration.
- **`background.js`**: Service worker handling tab deduplication, context menus, message routing, and badge updates.
- **`content/scraper.js`**: Injected script that intelligently extracts legal text from the page.
- **`options/`**: The core UI (HTML/CSS/JS) for the dashboard, analysis results, and settings.
- **`lib/`**: Core logic including the AI client (`ai-client.js`), response parsing (`parser.js`), and local storage (`storage.js`).

### Technology Stack

Built with vanilla web technologies (HTML, CSS, JavaScript) to remain lightweight, fast, and dependency-free at runtime. Uses ESLint and Prettier for code formatting.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
