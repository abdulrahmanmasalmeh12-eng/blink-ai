# Blink.ai

Blink.ai is an independent, self-hostable chat app. It does not call OpenAI, Anthropic, Google, or any other model API. Its small JavaScript language engine is implemented in this repository and combines hand-written response rules, per-account conversation retrieval, and a word-level statistical model trained on its own bundled seed text and saved chats.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm start
```

Open <http://localhost:3000>. Accounts, chats, and learned text are stored in `data/store.json` on the server. Use a long, unique password; this starter does not include email verification, password-reset email delivery, or production-grade account recovery.

## What the model can and cannot do

This is an original, small statistical language engine, not a pretrained large language model. It can recall text from the current user's saved chats and generate short continuations, but it does not have general knowledge or ChatGPT-level reasoning and may answer incoherently. It runs on the CPU and sends no prompts to an AI provider. Attached image pixels are not analyzed. The image creator makes original deterministic geometric sketches from a prompt; it is not a neural image generator.

## Deploy to Render

Create a GitHub repository, push this project, then create a Render Web Service from that repository. The included `render.yaml` configures the free Node service. The free instance may sleep and its filesystem is ephemeral, so accounts and chat memory can be lost on restart or redeploy. Persistent accounts require a persistent disk or a database; password recovery requires configuring an email provider. Do not use this starter for sensitive information or production authentication without a security review.

The web app is installable on supported phones through the browser's "Add to Home Screen" action.