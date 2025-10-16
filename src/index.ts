import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import chokidar from "chokidar";
import chalk from "chalk";
import ora from "ora";

const VERSION = "1.1.0";

const MODELS = {
  "sonnet-4.5": "claude-sonnet-4-5-20250929",
  "haiku-4.5": "claude-haiku-4-5-20251001",
  "haiku-3.5": "claude-3-5-haiku-20241022",
  "opus-4.1": "claude-opus-4-1-20250805",
  "opus-4": "claude-opus-4-20250514",
} as const;

type ModelName = keyof typeof MODELS;

const DEFAULT_MAX_TOKENS = 4096;
const PROCESSING_DELAY_MS = 100;

const WATCHER_CONFIG = {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 100,
  },
} as const;

const SPINNER_CONFIG = {
  text: "Translating...",
  color: "cyan",
} as const;

interface Options {
  model: ModelName;
  help: boolean;
  version: boolean;
}

function showHelp() {
  console.log(`
${chalk.bold("ai-translate")} - Bi-directional AI-driven file translation

${chalk.bold("USAGE:")}
  translate [OPTIONS] <file1> <file2>

${chalk.bold("ARGUMENTS:")}
  <file1>    First file to watch
  <file2>    Second file to watch

${chalk.bold("OPTIONS:")}
  --model <name>     Choose Claude model (default: sonnet-4.5)
                     Options: sonnet-4.5, haiku-4.5, haiku-3.5, opus-4.1, opus-4
  --help, -h         Show this help message
  --version, -v      Show version number

${chalk.bold("EXAMPLES:")}
  translate polish.md english.md                  Translate between Polish and English
  translate --model haiku-4.5 code.js code.ts     Use Haiku 4.5 model for conversion
  translate imperative.ts declarative.ts          Convert coding styles

${chalk.bold("SETUP:")}
  Create ~/.ai-translate-key with your Anthropic API key
`);
}

function showVersion() {
  console.log(`ai-translate v${VERSION}`);
}

function parseArgs(args: string[]): {
  options: Options;
  files: string[];
} {
  const options: Options = {
    model: "sonnet-4.5",
    help: false,
    version: false,
  };
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--model") {
      const modelName = args[++i] as ModelName;
      if (!MODELS[modelName]) {
        console.error(
          chalk.red(
            `Error: Invalid model "${modelName}". Choose from: sonnet-4.5, haiku-4.5, haiku-3.5, opus-4.1, opus-4`,
          ),
        );
        process.exit(1);
      }
      options.model = modelName;
    } else if (!arg.startsWith("--")) {
      files.push(arg);
    }
  }

  return { options, files };
}

export function getApiKey(): string {
  const keyPath = join(homedir(), ".ai-translate-key");
  try {
    return readFileSync(keyPath, "utf-8").trim();
  } catch (error) {
    console.error(chalk.red(`Error reading API key from ${keyPath}`));
    console.error(
      chalk.yellow(
        "Please create ~/.ai-translate-key with your Anthropic API key",
      ),
    );
    process.exit(1);
  }
}

export function createClient(): Anthropic {
  const apiKey = getApiKey();
  return new Anthropic({ apiKey });
}

interface FileState {
  path: string;
  content: string;
  lastModified: number;
}

let isProcessing = false;

function stripMarkdownCodeBlocks(text: string): string {
  const trimmed = text.trim();
  const codeBlockRegex = /^```[\w-]*\n([\s\S]*?)\n```$/;
  const match = trimmed.match(codeBlockRegex);

  if (match) {
    return match[1];
  }

  return text;
}

async function translateFile(
  client: Anthropic,
  sourceFile: FileState,
  targetFile: FileState,
  modelId: string,
): Promise<string> {
  const sourceName = basename(sourceFile.path);
  const targetName = basename(targetFile.path);

  const targetHasContent = targetFile.content.trim().length > 0;

  const prompt = targetHasContent
    ? `You are a bi-directional file translator. Your task is to convert the content from "${sourceName}" to match the style/language/format of "${targetName}".

Source file (${sourceName}):
\`\`\`
${sourceFile.content}
\`\`\`

Current target file (${targetName}):
\`\`\`
${targetFile.content}
\`\`\`

Please convert the source file content to match the target file's style/language/format. Make minimal changes - only what's necessary for the conversion. Respond with ONLY the converted content, no explanations or markdown code blocks.`
    : `You are a bi-directional file translator. Your task is to convert the content from "${sourceName}" to match the style/language/format suggested by "${targetName}".

Source file (${sourceName}):
\`\`\`
${sourceFile.content}
\`\`\`

The target file "${targetName}" is currently empty. Based on the file names and extensions, infer the appropriate style/language/format for the conversion. Respond with ONLY the converted content, no explanations or markdown code blocks.`;

  const message = await client.messages.create({
    model: modelId,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type === "text") {
    return stripMarkdownCodeBlocks(content.text);
  }

  throw new Error("Unexpected response type from API");
}

async function performTranslation(
  client: Anthropic,
  sourceFile: FileState,
  targetFile: FileState,
  modelId: string,
  successMessage: string,
  logPrefix?: string,
): Promise<boolean> {
  if (logPrefix) {
    console.log(logPrefix);
  }

  const spinner = ora(SPINNER_CONFIG).start();

  try {
    const translated = await translateFile(
      client,
      sourceFile,
      targetFile,
      modelId,
    );

    targetFile.content = translated;
    targetFile.lastModified = Date.now();
    writeFileSync(targetFile.path, translated, "utf-8");

    spinner.succeed(successMessage);
    return true;
  } catch (error) {
    spinner.fail("Translation failed");
    console.error(chalk.red("Error:"), error);
    return false;
  }
}

export async function main(args: string[]) {
  const { options, files } = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    showVersion();
    process.exit(0);
  }

  if (files.length !== 2) {
    console.error(chalk.red("Error: Please provide exactly two files"));
    console.error(chalk.dim("Run 'translate --help' for usage information"));
    process.exit(1);
  }

  const [file1Path, file2Path] = files;

  if (!existsSync(file1Path)) {
    console.error(chalk.red(`Error: File not found: ${file1Path}`));
    process.exit(1);
  }

  if (!existsSync(file2Path)) {
    console.error(chalk.red(`Error: File not found: ${file2Path}`));
    process.exit(1);
  }

  const client = createClient();
  const modelId = MODELS[options.model];

  const file1: FileState = {
    path: file1Path,
    content: readFileSync(file1Path, "utf-8"),
    lastModified: statSync(file1Path).mtimeMs,
  };

  const file2: FileState = {
    path: file2Path,
    content: readFileSync(file2Path, "utf-8"),
    lastModified: statSync(file2Path).mtimeMs,
  };

  console.log(
    chalk.bold(
      `Translating ${chalk.cyan(basename(file1Path))} ${chalk.dim("<->")} ${chalk.cyan(basename(file2Path))}`,
    ),
  );
  console.log(chalk.dim(`Model: ${options.model}`));
  console.log(chalk.dim("Press Ctrl+C to stop\n"));

  const file1HasContent = file1.content.trim().length > 0;
  const file2HasContent = file2.content.trim().length > 0;

  if (file1HasContent && !file2HasContent) {
    await performTranslation(
      client,
      file1,
      file2,
      modelId,
      `Created ${chalk.cyan(basename(file2Path))}`,
      chalk.blue("→") +
        ` ${chalk.cyan(basename(file2Path))} is empty, auto-translating from ${chalk.cyan(basename(file1Path))}`,
    );
    console.log();
  } else if (file2HasContent && !file1HasContent) {
    await performTranslation(
      client,
      file2,
      file1,
      modelId,
      `Created ${chalk.cyan(basename(file1Path))}`,
      chalk.blue("→") +
        ` ${chalk.cyan(basename(file1Path))} is empty, auto-translating from ${chalk.cyan(basename(file2Path))}`,
    );
    console.log();
  }

  async function handleFileChange(
    changedFile: FileState,
    targetFile: FileState,
  ) {
    if (isProcessing) return;

    isProcessing = true;
    try {
      const newContent = readFileSync(changedFile.path, "utf-8");

      if (newContent === changedFile.content) {
        isProcessing = false;
        return;
      }

      changedFile.content = newContent;
      changedFile.lastModified = Date.now();

      const timestamp = new Date().toLocaleTimeString();
      const logPrefix = `\n${chalk.dim(`[${timestamp}]`)} ${chalk.blue("→")} Change detected in ${chalk.cyan(basename(changedFile.path))}`;

      await performTranslation(
        client,
        changedFile,
        targetFile,
        modelId,
        `Updated ${chalk.cyan(basename(targetFile.path))}`,
        logPrefix,
      );
    } catch (error) {
      console.error(chalk.red("Error reading file:"), error);
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, PROCESSING_DELAY_MS);
    }
  }

  const watcher1 = chokidar.watch(file1Path, WATCHER_CONFIG);
  const watcher2 = chokidar.watch(file2Path, WATCHER_CONFIG);

  watcher1.on("change", () => handleFileChange(file1, file2));
  watcher2.on("change", () => handleFileChange(file2, file1));

  process.on("SIGINT", async () => {
    console.log(chalk.dim("\n\nShutting down..."));
    await watcher1.close();
    await watcher2.close();
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  });
}
