import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";

import {
  copyAndRenderFiles,
  copyAndRenderFolders,
  getUserPrompts,
  installDependencies,
  patchRootLayoutAttributes,
  patchRootLayoutProviders,
  patchTsconfigStrictOptions,
} from "./utils.js";

// __filename and __dirname are available in CJS, no need to define them

export async function main(): Promise<void> {
  // --- Prompts ---
  const {
    packageManager,
    projectName,
    workosApiKey,
    workosClientId,
    emailFrom,
    resendApiKey,
    httpType,
    manageEmailsWithResend,
  } = await getUserPrompts();

  installDependencies({ packageManager, projectName, httpType, manageEmailsWithResend });

  // 2. Copy schemas folder to user's root, rendering .hbs recursively
  const srcDir = path.join(process.cwd(), "src");

  const destConvexJson = path.join(process.cwd(), "convex.json");
  if (!fs.existsSync(destConvexJson)) {
    const templateConvexJson = path.join(__dirname, "../src/convex.json");
    await fs.copy(templateConvexJson, destConvexJson, { overwrite: false });
  }

  const schemasSrc = path.join(__dirname, "../src/schemas");
  const schemasDest = path.join(srcDir, "schemas");
  await copyAndRenderFolders(schemasSrc, schemasDest, {}, httpType);

  // 3. Handle convex folder with special logic for http handler and workos/webhooks
  const convexSrc = path.join(__dirname, "../src/convex");
  const convexDest = path.join(srcDir, "convex");
  await copyAndRenderFolders(convexSrc, convexDest, {}, httpType, {
    isConvexRoot: true,
    onlyHttp: true,
  });

  // nextjs folder
  const nextjsSrc = path.join(__dirname, "../src/nextjs");

  // nextjs api folder
  const oauthRouteSrc = path.join(nextjsSrc, "app/api/auth/oauth");
  const oauthRouteDest = path.join(srcDir, "app/api/auth/oauth");
  await copyAndRenderFolders(oauthRouteSrc, oauthRouteDest, {}, httpType);

  const signInRouteSrc = path.join(nextjsSrc, "app/api/auth/otp/sign-in");
  const signInRouteDest = path.join(srcDir, "app/api/auth/otp/sign-in");
  await copyAndRenderFolders(signInRouteSrc, signInRouteDest, {}, httpType);

  const requestSignInRouteSrc = path.join(
    nextjsSrc,
    manageEmailsWithResend
      ? "app/api/auth/otp/request-sign-in-with-resend"
      : "app/api/auth/otp/request-sign-in",
  );

  const requestSignInRouteDest = path.join(srcDir, "app/api/auth/otp/request-sign-in");

  await copyAndRenderFolders(requestSignInRouteSrc, requestSignInRouteDest, {}, httpType);

  execSync(
    `npx convex dev --once; npx convex env set WORKOS_REDIRECT_URI="http://localhost:3000/api/auth/oauth"; npx convex env set WORKOS_API_KEY=${workosApiKey}; npx convex env set WORKOS_CLIENT_ID=${workosClientId};`,
    {
      stdio: "inherit",
    },
  );

  // nextjs (app) page
  const nextjsAppSrc = path.join(nextjsSrc, "app/(app)");
  const nextjsAppDest = path.join(srcDir, "app/(app)");
  await copyAndRenderFolders(nextjsAppSrc, nextjsAppDest, {}, httpType);

  // nextjs auth page
  const nextjsAuthSrc = path.join(nextjsSrc, "app/auth");
  const nextjsAuthDest = path.join(srcDir, "app/auth");
  await copyAndRenderFolders(nextjsAuthSrc, nextjsAuthDest, {}, httpType);

  // public files
  const publicSrc = path.join(nextjsSrc, "public");
  const publicDest = path.join(process.cwd(), "public");
  await copyAndRenderFolders(publicSrc, publicDest, {}, httpType);

  // lib files
  const libSrc = path.join(nextjsSrc, "lib");
  const libDest = path.join(srcDir, "lib");
  await copyAndRenderFolders(libSrc, libDest, {}, httpType);

  // components files
  const componentsSrc = path.join(nextjsSrc, "components");
  const componentsDest = path.join(srcDir, "components");
  await copyAndRenderFolders(componentsSrc, componentsDest, {}, httpType);

  // hooks files
  const hooksSrc = path.join(nextjsSrc, "hooks");
  const hooksDest = path.join(srcDir, "hooks");
  await copyAndRenderFolders(hooksSrc, hooksDest, {}, httpType);

  // queries files
  const queriesSrc = path.join(nextjsSrc, "queries");
  const queriesDest = path.join(srcDir, "queries");
  await copyAndRenderFolders(queriesSrc, queriesDest, {}, httpType);

  // middleware file
  const middlewareSrc = path.join(nextjsSrc, "middleware.ts.hbs");
  const middlewareDest = path.join(srcDir, "middleware.ts");
  await copyAndRenderFiles([{ src: middlewareSrc, dest: middlewareDest, context: {} }]);

  // favicon.ico file
  const faviconSrc = path.join(nextjsSrc, "app/favicon.ico");
  const faviconDest = path.join(srcDir, "app/favicon.ico");
  await copyAndRenderFiles([{ src: faviconSrc, dest: faviconDest, context: {} }]);

  // home page file
  const homePageSrc = path.join(nextjsSrc, "app/page.tsx.hbs");
  const homePageDest = path.join(srcDir, "app/page.tsx");
  await copyAndRenderFiles([{ src: homePageSrc, dest: homePageDest, context: {} }]);

  const layoutPath = path.join(srcDir, "app/layout.tsx");

  await patchRootLayoutProviders(layoutPath);

  await patchRootLayoutAttributes(layoutPath);

  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");

  await patchTsconfigStrictOptions(tsconfigPath);

  const randomSecret = execSync("openssl rand -base64 32").toString().trim();

  const envLocalContent = `

WORKOS_COOKIE_PASSWORD="${randomSecret}"
WORKOS_API_KEY="${workosApiKey}"
WORKOS_CLIENT_ID="${workosClientId}"
NEXT_PUBLIC_WORKOS_REDIRECT_URI="http://localhost:3000/api/auth/oauth"
${resendApiKey ? `RESEND_API_KEY="${resendApiKey}"` : ""}
${emailFrom ? `EMAIL_FROM="${emailFrom}"` : ""}
`;

  const envPath = path.join(process.cwd(), ".env.local");

  await fs.appendFile(envPath, envLocalContent, { encoding: "utf8" });
  console.log(`✅ authkit-convex setup complete. Next run:`);
  console.log(`cd ${projectName} && npx convex dev`);
}

if (require.main === module) {
  if (process.argv[2] === "init") {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
