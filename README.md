# Blink.ai

Blink.ai is an independent, self-hostable chat app. It does not call OpenAI, Anthropic, Google, or any other model API. Its JavaScript retrieval engine ranks relevant passages from an editable, bundled guide library, each account's saved conversations and explicit memories, and uploaded plain-text or Markdown files. It uses no pretrained model and does not generate general-purpose language.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```sh
npm start
```

Open <http://localhost:3000>. Accounts, chats, and learned text are stored in `data/store.json` on the server. Use a long, unique password; this starter does not include email verification, password-reset email delivery, or production-grade account recovery.

Run the built-in tests with `npm test`. Add or revise local reference material in `knowledge.json`. Uploaded plain-text and Markdown documents are stored per account and can be cleared from Settings.

## What the model can and cannot do

This is an original retrieval system, not a trained language model. It can find relevant passages in its bundled guides, saved user text, and uploaded plain-text or Markdown documents. It cannot reason beyond those sources and will say when it cannot find a grounded match. It runs on the CPU and sends no prompts to an AI provider. Attached image pixels are not analyzed. The image creator makes original deterministic geometric sketches from a prompt; it is not a neural image generator.

## Deploy to Render

Create a GitHub repository, push this project, then create a Render Web Service from that repository. The included `render.yaml` configures the free Node service. The free instance may sleep and its filesystem is ephemeral, so accounts and chat memory can be lost on restart or redeploy. Persistent accounts require a persistent disk or a database; password recovery requires configuring an email provider. Do not use this starter for sensitive information or production authentication without a security review.

The web app is installable on supported phones through the browser's "Add to Home Screen" action.