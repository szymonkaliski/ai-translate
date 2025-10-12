import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import chokidar from "chokidar";

export function getApiKey(): string {
  const keyPath = join(homedir(), ".llm-translate-key");
  try {
    return readFileSync(keyPath, "utf-8").trim();
  } catch (error) {
    console.error(`Error reading API key from ${keyPath}`);
    console.error(
      "Please create ~/.llm-translate-key with your Anthropic API key",
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

async function translateFile(
  client: Anthropic,
  sourceFile: FileState,
  targetFile: FileState,
): Promise<string> {
  const sourceName = basename(sourceFile.path);
  const targetName = basename(targetFile.path);

  const prompt = `You are a bi-directional file translator. Your task is to convert the content from "${sourceName}" to match the style/language/format of "${targetName}".

Source file (${sourceName}):
\`\`\`
${sourceFile.content}
\`\`\`

Current target file (${targetName}):
\`\`\`
${targetFile.content}
\`\`\`

Please convert the source file content to match the target file's style/language/format. Make minimal changes - only what's necessary for the conversion. Respond with ONLY the converted content, no explanations or markdown code blocks.`;

  const message = await client.messages.create({
    model: "claude-3-5-sonnet-20250129",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type === "text") {
    return content.text;
  }

  throw new Error("Unexpected response type from API");
}

export async function main(args: string[]) {
  if (args.length !== 2) {
    console.error("Usage: llm <file1> <file2>");
    console.error("Example: llm polish.md english.md");
    process.exit(1);
  }

  const [file1Path, file2Path] = args;
  const client = createClient();

  const file1: FileState = {
    path: file1Path,
    content: readFileSync(file1Path, "utf-8"),
    lastModified: Date.now(),
  };

  const file2: FileState = {
    path: file2Path,
    content: readFileSync(file2Path, "utf-8"),
    lastModified: Date.now(),
  };

  console.log(`Watching ${basename(file1Path)} <-> ${basename(file2Path)}`);
  console.log("Press Ctrl+C to stop\n");

  async function handleFileChange(
    changedFile: FileState,
    targetFile: FileState,
  ) {
    console.log(
      `[DEBUG] Change detected in ${basename(changedFile.path)}, isProcessing: ${isProcessing}`,
    );

    if (isProcessing) {
      console.log("[DEBUG] Already processing, skipping");
      return;
    }

    isProcessing = true;
    try {
      const newContent = readFileSync(changedFile.path, "utf-8");
      console.log(
        `[DEBUG] Old content length: ${changedFile.content.length}, New content length: ${newContent.length}`,
      );

      if (newContent === changedFile.content) {
        console.log("[DEBUG] Content unchanged, skipping");
        isProcessing = false;
        return;
      }

      changedFile.content = newContent;
      changedFile.lastModified = Date.now();

      console.log(
        `\n[${new Date().toLocaleTimeString()}] ${basename(changedFile.path)} changed, translating...`,
      );

      const translated = await translateFile(client, changedFile, targetFile);

      targetFile.content = translated;
      targetFile.lastModified = Date.now();
      writeFileSync(targetFile.path, translated, "utf-8");

      console.log(`✓ Updated ${basename(targetFile.path)}`);
    } catch (error) {
      console.error("Translation error:", error);
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, 100);
    }
  }

  const watcher1 = chokidar.watch(file1Path, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  const watcher2 = chokidar.watch(file2Path, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  watcher1.on("change", () => {
    console.log(`[DEBUG] Chokidar detected change in ${basename(file1Path)}`);
    handleFileChange(file1, file2);
  });

  watcher2.on("change", () => {
    console.log(`[DEBUG] Chokidar detected change in ${basename(file2Path)}`);
    handleFileChange(file2, file1);
  });

  console.log("[DEBUG] Watchers set up successfully");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
