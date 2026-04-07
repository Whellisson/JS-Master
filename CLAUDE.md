# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Overview

**JS Master AI** — plataforma educacional para praticar JavaScript com questões geradas por IA local (Ollama). O frontend é todo contido em `public/index.html` (HTML + CSS + JS inline). O backend é um servidor Node.js vanilla em `server.js` com http, fs e vm modules.

## Running the App

```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start the server
node server.js
```

Acesse `http://localhost:3002`.

## Architecture

### Backend (`server.js`)
- Single-file Node.js HTTP server (no frameworks)
- Uses `vm` sandbox to safely execute student JavaScript code
- Communicates with local Ollama instance (`qwen2.5:1.5b` on `localhost:11434`)
- Key functions:
  - `gerarQuestao()` — POST `/gerar-questao` — generates exercise questions via AI
  - `verificarResposta()` — POST `/verificar` — evaluates student code against the prompt
  - `pedirDica()` — POST `/dica` — provides progressive hints
  - `gerarEstudo()` — POST `/estudo` — generates study material on a topic
  - `gerarExemplos()` — POST `/exemplos` — generates practical examples
  - `perguntarEstudo()` — POST `/perguntar` — free chat with AI about a topic
  - `heuristicCheck()` — rule-based evaluator (word count, sum, length, contain, etc.) that short-circuits AI verification
  - `executarCodigoAluno()` — runs student code in a VM sandbox with restrictions

### Frontend (`public/index.html`)
- Single-file SPA: all CSS and JS inline in the HTML
- Monaco Editor (loaded from CDN) for code editing
- Topics: sidebar with grouped JS topics (Variables, Functions, Loops, Arrays, Objects, Strings, etc.)
- Difficulty levels: Auto, Fácil, Médio, Difícil
- Modes: practice (answer questions) and study (📚 Estudos — read explanations + chat with AI)
- Session history tracking and progress summary
- PDF/JSON report export support

## Configuration (server.js top)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3002` | Server port |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Ollama model for AI |
| `EXECUTION_TIMEOUT_MS` | `15000` | Student code execution timeout |
| `OLLAMA_TIMEOUT_MS` | `180000` | AI response timeout |
| `MAX_RETRIES` | `3` | Retry attempts for Ollama |

## Key Conventions

- All server files are single-file — no build step, no bundler, no tests framework
- Student code execution blocks dangerous patterns (`require`, `fs`, `process`, `eval`, `setTimeout`, etc.)
- AI responses are parsed with aggressive JSON normalization (`parseJSON`, `normalizeLooseJSON`) since LLMs return loose JSON
- The heuristic evaluator (`heuristicCheck`) runs before AI verification to handle deterministic cases quickly
