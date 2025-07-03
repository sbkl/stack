import path from "path";
import fs from "fs-extra";
import Handlebars from "handlebars";
import { execSync } from "child_process";
import prompts from "prompts";
import slug from "slug";

export type PackageManager = "pnpm" | "yarn" | "bun" | "npm";

export interface TemplateContext {
  [key: string]: string;
}

export interface CopyOptions {
  isConvexRoot?: boolean;
  onlyHttp?: boolean;
}

export interface UserPrompts {
  packageManager: PackageManager;
  projectName: string;
  workosApiKey: string;
  workosClientId: string;
  resendApiKey: string | null;
  emailFrom: string | null;
  httpType: string;
  manageEmailsWithResend: boolean;
}

export function getOutputFileName(file: string, httpType: string): string {
  if (file === "http.ts.hbs" && httpType === "convex") return "http.ts";
  if (file === "http.hono.ts.hbs" && httpType === "hono") return "http.ts";
  return file
    .replace(/\.hono\.ts\.hbs$/, ".ts")
    .replace(/\.ts\.hbs$/, ".ts")
    .replace(/\.hbs$/, "");
}

export async function renderAndCopyHbs(
  src: string,
  dest: string,
  context: TemplateContext = {},
): Promise<void> {
  const template = await fs.readFile(src, "utf8");
  const compiled = Handlebars.compile(template);
  await fs.outputFile(dest, compiled(context));
}

export async function copyAndRenderTemplates(
  srcDir: string,
  destDir: string,
  context: TemplateContext,
  httpType: string,
  options: CopyOptions = {},
): Promise<void> {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const outName = getOutputFileName(entry.name, httpType);
    const destPath = path.join(destDir, outName);

    if (options.isConvexRoot && entry.name === "workos" && entry.isDirectory()) {
      await fs.ensureDir(destPath);
      const workosEntries = await fs.readdir(srcPath, { withFileTypes: true });
      for (const workosEntry of workosEntries) {
        const workosEntrySrc = path.join(srcPath, workosEntry.name);
        if (
          (httpType === "hono" && workosEntry.name === "webhooks-hono") ||
          (httpType === "convex" && workosEntry.name === "webhooks")
        ) {
          const webhooksDest = path.join(destPath, "webhooks");
          await copyAndRenderTemplates(workosEntrySrc, webhooksDest, context, httpType);
        } else if (workosEntry.name === "webhooks" || workosEntry.name === "webhooks-hono") {
          continue;
        } else if (workosEntry.isDirectory()) {
          await copyAndRenderTemplates(
            workosEntrySrc,
            path.join(destPath, workosEntry.name),
            context,
            httpType,
          );
        } else if (workosEntry.isFile() && workosEntry.name.endsWith(".hbs")) {
          const outName = getOutputFileName(workosEntry.name, httpType);
          const outPath = path.join(destPath, outName);
          await renderAndCopyHbs(workosEntrySrc, outPath, context);
        } else if (workosEntry.isFile()) {
          await fs.copy(workosEntrySrc, path.join(destPath, workosEntry.name), {
            overwrite: false,
            errorOnExist: false,
          });
        }
      }
      continue;
    }

    if (
      options.onlyHttp &&
      ((entry.name === "http.ts.hbs" && httpType !== "convex") ||
        (entry.name === "http.hono.ts.hbs" && httpType !== "hono"))
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyAndRenderTemplates(srcPath, destPath, context, httpType);
    } else if (entry.isFile() && entry.name.endsWith(".hbs")) {
      await renderAndCopyHbs(srcPath, destPath, context);
    } else if (entry.isFile()) {
      await fs.copy(srcPath, destPath, { overwrite: false, errorOnExist: false });
    }
  }
}

export function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm";
  return "npm";
}

export function installDeps(pkgManager: PackageManager, deps: string[], dev = false): void {
  if (!deps.length) return;
  let cmd = "";
  switch (pkgManager) {
    case "pnpm":
      cmd = `pnpm add${dev ? " -D" : ""} ${deps.join(" ")}`;
      break;
    case "yarn":
      cmd = `yarn add${dev ? " -D" : ""} ${deps.join(" ")}`;
      break;
    case "bun":
      cmd = `bun add${dev ? " -d" : ""} ${deps.join(" ")}`;
      break;
    case "npm":
    default:
      cmd = `npm install${dev ? " -D" : ""} ${deps.join(" ")}`;
      break;
  }
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

export async function getUserPrompts(): Promise<UserPrompts> {
  let packageManager: PackageManager | null = null;

  let projectName = "";

  if (!fs.existsSync("next.config.ts")) {
    const { promptPackageManager } = await prompts({
      type: "select",
      name: "promptPackageManager",
      message: "Which package manager do you want to use?",
      choices: [
        { title: "pnpm", value: "pnpm" },
        { title: "yarn", value: "yarn" },
        { title: "bun", value: "bun" },
        { title: "npm", value: "npm" },
      ],
    });
    packageManager = promptPackageManager as PackageManager;
    const { promptProjectName } = await prompts({
      type: "text",
      name: "promptProjectName",
      message: "How would you like to name your project?",
    });
    projectName = promptProjectName;
  } else {
    packageManager = detectPackageManager(process.cwd());
    projectName = path.basename(process.cwd());
  }

  const projectNameParsed = slug(projectName, {
    lower: true,
    trim: true,
    replacement: "-",
  });

  if (fs.existsSync(projectNameParsed)) {
    console.error(
      `A project with the name ${projectNameParsed} already exists in the current directory. Please choose a different name.`,
    );
    process.exit(1);
  }

  const { workosApiKey } = await prompts({
    type: "text",
    name: "workosApiKey",
    message: "Enter your WorkOS API key:",
  });

  const { workosClientId } = await prompts({
    type: "text",
    name: "workosClientId",
    message: "Enter your WorkOS Client ID:",
  });

  const { httpType } = await prompts({
    type: "select",
    name: "httpType",
    message: "Which HTTP handler do you want to use?",
    choices: [
      { title: "Hono Http Router", value: "hono" },
      { title: "Convex Http Router", value: "convex" },
    ],
  });

  const { email } = await prompts({
    type: "select",
    name: "email",
    message: "Do you want to setup Resend to manage your emails?",
    choices: [
      { title: "Yes", value: "yes" },
      { title: "No", value: "no" },
    ],
  });

  let resendApiKey: string | null = null;
  let emailFrom: string | null = null;
  if (email === "yes") {
    const { promptResendApiKey } = await prompts({
      type: "text",
      name: "promptResendApiKey",
      message: "Enter your Resend API key:",
    });
    const { promptEmailFrom } = await prompts({
      type: "text",
      name: "promptEmailFrom",
      message: "Enter your email from:",
    });
    resendApiKey = promptResendApiKey;
    emailFrom = promptEmailFrom;
  }

  return {
    packageManager,
    projectName: projectNameParsed,
    workosApiKey,
    workosClientId,
    resendApiKey,
    emailFrom,
    httpType,
    manageEmailsWithResend: email === "yes",
  };
}

interface InstallDependenciesProps {
  packageManager: PackageManager;
  projectName: string;
  httpType: string;
  manageEmailsWithResend: boolean;
}

export function installDependencies({
  packageManager,
  projectName,
  httpType,
  manageEmailsWithResend,
}: InstallDependenciesProps) {
  // check if nextjs is already installed
  if (!fs.existsSync("next.config.ts")) {
    let nextjsInstallCommand = "";
    switch (packageManager) {
      case "pnpm":
        nextjsInstallCommand = "pnpm create next-app@latest";
        break;
      case "npm":
        nextjsInstallCommand = "npx create-next-app@latest";
        break;
      case "yarn":
        nextjsInstallCommand = "yarn create next-app";
        break;
      case "bun":
        nextjsInstallCommand = "bun create next";
        break;
      default:
        throw new Error(`Unsupported package manager: ${packageManager}`);
    }
    execSync(
      `${nextjsInstallCommand} ${projectName} --typescript --no-eslint --tailwind --src-dir --app --turbopack --import-alias "@/*"`,
      {
        stdio: "inherit",
      },
    );
    process.chdir(projectName);
  }

  // check if shadcn is already installed
  if (!fs.existsSync("components.json")) {
    switch (packageManager) {
      case "pnpm":
        execSync(`pnpm dlx shadcn@latest init`, { stdio: "inherit" });
        break;
      case "npm":
        execSync(`npx shadcn@latest init`, { stdio: "inherit" });
        break;
      case "bun":
        execSync(`bunx --bun shadcn@latest init`, { stdio: "inherit" });
        break;
      case "yarn":
        execSync(`yarn shadcn@latest init`, { stdio: "inherit" });
        break;
      default:
        throw new Error(`Unsupported package manager: ${packageManager}`);
    }
  }

  const dependencies = [
    "@convex-dev/react-query",
    "@radix-ui/react-avatar",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-icons",
    "@radix-ui/react-label",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "@tanstack/react-form",
    "@tanstack/react-query",
    "@workos-inc/authkit-nextjs",
    "@workos-inc/node",
    "convex",
    "convex-helpers",
    "input-otp",
    "lodash.debounce",
    "next-themes",
    "sonner",
    "tldts",
    "zod",
    ...(httpType === "hono" ? ["@hono/zod-validator", "hono"] : []),
    ...(manageEmailsWithResend ? ["resend"] : []),
  ];
  installDeps(packageManager, dependencies);

  const devDependencies = ["@types/lodash.debounce"];
  installDeps(packageManager, devDependencies, true);
}

export async function copyAndRenderFolders(
  srcDir: string,
  destDir: string,
  context: TemplateContext,
  httpType: string,
  options: CopyOptions = {},
): Promise<void> {
  const stat = await fs.stat(srcDir);
  if (!stat.isDirectory()) {
    throw new Error(`copyAndRenderFolders: ${srcDir} is not a directory`);
  }
  await copyAndRenderTemplates(srcDir, destDir, context, httpType, options);
}

export interface CopyFileTask {
  src: string;
  dest: string;
  context?: TemplateContext;
}

export async function copyAndRenderFiles(tasks: CopyFileTask[]): Promise<void> {
  for (const { src, dest, context = {} } of tasks) {
    if (src.endsWith(".hbs")) {
      await renderAndCopyHbs(src, dest, context);
    } else {
      await fs.copy(src, dest, { overwrite: false, errorOnExist: false });
    }
  }
}

export async function patchRootLayoutProviders(layoutPath: string): Promise<void> {
  let content = await fs.readFile(layoutPath, "utf8");

  // 1. Add import after last import
  const importStatement = 'import { Providers } from "@/components/providers";';
  const importRegex = /^(import .+;\s*)+/m;
  const match = content.match(importRegex);
  if (match) {
    const lastImport = match[0];
    if (!content.includes(importStatement)) {
      content = content.replace(lastImport, lastImport + "\n" + importStatement + "\n");
    }
  }

  // 2. Replace first occurrence of {children} with <Providers>{children}</Providers>
  if (!content.includes("<Providers>{children}</Providers>")) {
    content = content.replace(/{children}/, "<Providers>{children}</Providers>");
  }

  await fs.writeFile(layoutPath, content, "utf8");
}

export async function patchTsconfigStrictOptions(tsconfigPath: string): Promise<void> {
  const content = await fs.readFile(tsconfigPath, "utf8");
  let json: any;
  try {
    json = JSON.parse(content);
  } catch (e) {
    throw new Error(`Could not parse ${tsconfigPath}: ${e}`);
  }
  if (!json.compilerOptions) json.compilerOptions = {};
  json.compilerOptions.noUncheckedIndexedAccess = true;
  json.compilerOptions.noUnusedLocals = true;
  json.compilerOptions.noUnusedParameters = true;
  // Write back with 2-space indentation
  await fs.writeFile(tsconfigPath, JSON.stringify(json, null, 2) + "\n", "utf8");
}

export async function patchRootLayoutAttributes(layoutPath: string): Promise<void> {
  let content = await fs.readFile(layoutPath, "utf8");

  // Patch <html ...>
  content = content.replace(/<html([^>]*)>/, (_match, attrs) => {
    let newAttrs = attrs;
    // Add suppressHydrationWarning if not present
    if (!/suppressHydrationWarning/.test(newAttrs)) {
      newAttrs += " suppressHydrationWarning";
    }
    // Add or update className="h-full w-full"
    if (/className=/.test(newAttrs)) {
      newAttrs = newAttrs.replace(/className="([^"]*)"/, (_m: string, classes: string) => {
        if (!classes.includes("h-full")) classes += " h-full";
        if (!classes.includes("w-full")) classes += " w-full";
        return `className="${classes.trim()}"`;
      });
    } else {
      newAttrs += ' className="h-full w-full"';
    }
    return `<html${newAttrs}>`;
  });

  // Patch <body ...> for both string and JSX expression className
  content = content.replace(/<body([^>]*)>/, (_match, attrs) => {
    let newAttrs = attrs;
    // Add suppressHydrationWarning if not present
    if (!/suppressHydrationWarning/.test(newAttrs)) {
      newAttrs += " suppressHydrationWarning";
    }
    // Handle className={...} (template string or string literal)
    if (/className=/.test(newAttrs)) {
      // Match className={`...`} or className="..."
      newAttrs = newAttrs.replace(/className=({`[^`]*`}|"[^"]*")/, (_m: string, value: string) => {
        let newValue = value;
        if (value.startsWith("{`") && value.endsWith("`}")) {
          // It's a template string
          let inner = value.slice(2, -2).trim();
          if (!inner.includes("h-full")) inner += " h-full";
          if (!inner.includes("w-full")) inner += " w-full";
          if (!inner.includes("bg-background")) inner += " bg-background";
          newValue = `{\`${inner.trim()}\`}`;
        } else if (value.startsWith('"') && value.endsWith('"')) {
          // It's a plain string
          let inner = value.slice(1, -1).trim();
          if (!inner.includes("h-full")) inner += " h-full";
          if (!inner.includes("w-full")) inner += " w-full";
          if (!inner.includes("bg-background")) inner += " bg-background";
          newValue = `"${inner.trim()}"`;
        }
        return `className=${newValue}`;
      });
    } else {
      newAttrs += ' className="h-full w-full bg-background"';
    }
    return `<body${newAttrs}>`;
  });

  await fs.writeFile(layoutPath, content, "utf8");
}
