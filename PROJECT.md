# `llm-translate`

`llm-translate` CLI tool for bi-directional LLM-driven translation.
The binary requires two files to be provided, and starts a file-watcher on both.
Names of the files are used for context, together with the actual content.
If a change is detected in one of the file, it's passed through the LLM together with any additional data (the filenames, the content in both files), with a prompt to convert one to the other, with minimal amount of changes.

Usage:

- `llm polish.md english.md` would translate between Polish and English prose in both directions
- `llm imperative.ts declarative.ts` would convert imperative typescript to declarative one, and back again

## Feature 1: Init

- [x] initial project setup in typescript @done(2025-10-12)
- [x] set up Anthropic package @done(2025-10-12)
  - [x] set up key use from `~/.llm-translate-key` @done(2025-10-12)
- [x] make sure bin/cli is created (for `npm link` and `npm install -g`) @done(2025-10-12)

## Feature 2: "UI"

- [ ] remove the extraneous `DEBUG` logging
- [ ] make the logs actually nice, with colors
  - [ ] on start should show `Translating [file1] <-> [file2]`
  - [ ] on change should show formatted date, and then info where the change was detected
  - [ ] then a spinner as the model works, and an info when the other file was written to
- [ ] add flags
  - [ ] `--help`
  - [ ] `--version`
  - [ ] `--model` to choose the model (sonnet-4.5, haiku, opus)

