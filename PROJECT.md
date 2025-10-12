# `ai-translate`

`ai-translate` CLI tool for bi-directional AI-driven translation (package: `ai-translate`, binary: `translate`).
The binary requires two files to be provided, and starts a file-watcher on both.
Names of the files are used for context, together with the actual content.
If a change is detected in one of the file, it's passed through the LLM together with any additional data (the filenames, the content in both files), with a prompt to convert one to the other, with minimal amount of changes.

Usage:

- `translate polish.md english.md` would translate between Polish and English prose in both directions
- `translate imperative.ts declarative.ts` would convert imperative typescript to declarative one, and back again

## Feature 1: Init

- [x] initial project setup in typescript @done(2025-10-12)
- [x] set up Anthropic package @done(2025-10-12)
  - [x] set up key use from `~/.ai-translate-key` @done(2025-10-12)
- [x] make sure bin/cli is created (for `npm link` and `npm install -g`) @done(2025-10-12)
- [x] rename project to `ai-translate` and binary to `translate` @done(2025-10-12)

## Feature 2: "UI"

- [x] remove the extraneous `DEBUG` logging @done(2025-10-12)
- [x] make the logs actually nice, with colors @done(2025-10-12)
  - [x] on start should show `Translating [file1] <-> [file2]` @done(2025-10-12)
  - [x] on change should show formatted date, and then info where the change was detected @done(2025-10-12)
  - [x] then a spinner as the model works, and an info when the other file was written to @done(2025-10-12)
- [x] add flags @done(2025-10-12)
  - [x] `--help` @done(2025-10-12)
  - [x] `--version` @done(2025-10-12)
  - [x] `--model` to choose the model (sonnet-4.5, haiku, opus) @done(2025-10-12)

## Feature 3: Auto-Translate

- [x] with two files, if one of them has content, and the other does not, auto-translate as if the first one was just written to @done(2025-10-12)

## Todo

- [ ] support multiple file arguments instead of just two

