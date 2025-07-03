# Stack

A CLI tool scaffolding the setup for AuthKit integration with Convex and Nextjs. All the code is available directly in your codebase to adapt it to your needs. Must sound familiar if you use shadcn. All instructions below are provided to make this app example work as expected. However, you can choose to customise it later as you see fit.

## Pre-requisits

- Get your `WORKOS_API_KEY` and `WORKOS_CLIENT_ID` from the Workos Dashboard
- If you want to use Resend to send your emails for authentication with OTP, you will need your `RESEND_API_KEY` and `EMAIL_FROM` (email from domain must be linked to the domain assigned to your Resend api key)

## Run the init command below in your terminal:

```bash
npx @sbkl-labs/stack init
```

## What does the cli does?

- Creates a new nextjs project if not created already,
- Init shadcn if not setup yet,
- Install the following dependencies for the template to work
  - @convex-dev/react-query
  - @radix-ui/react-avatar
  - @tanstack/react-form
  - @radix-ui/react-icons
  - @radix-ui/react-label
  - @tanstack/react-query
  - @radix-ui/react-slot
  - @radix-ui/react-tabs
  - @workos-inc/authkit-nextjs
  - @workos-inc/node
  - convex
  - convex-helpers
  - input-otp
  - lodash.debounce and its types
  - next-themes
  - sonner
  - tldts
  - zod
- Setup convex and the integration with authkit
- Setup the nextjs boilerplate for convex, tanstack query, tanstack from and shadcn components for the auth component.

## Workos redirects

Go to your Workos dashboard > Redirects

### Workos Sign-in callback:

Set the Sign-in callback redirect to:

```bash
http://localhost:3000/api/auth/oauth
```

### App homepage:

Set the App home page redirect to:

```bash
http://localhost:3000/dashboard
```

## Setup Workos webhooks

There are two endpoints setup for you to sync your convex database with the Workos users and organisations. To activate them, go to your Workos dashboard > Webhooks > Create webhook, enter the endpoint and their respective supported events:

### Users:

Endpoint:

```bash
https://<your-convex-slug>.convex.site/workos-webhooks/users
```

Events supported:

- user.created,
- user.updated,
- user.deleted,
- session.created

### Organisations:

Endpoint:

```bash
https://<your-convex-slug>.convex.site/workos-webhooks/organisations
```

Events supported:

- organization.created,
- organization.updated,
- organization.deleted
- organization_domain.verified
- organization_domain.verification_failed

Then get the signin secret of each webhook and set them up with your convex project like so (dont forget the sign-in secret at the end):

```bash
npx convex env set WORKOS_WEBHOOK_USERS_SECRET=
```

```bash
npx convex env set WORKOS_WEBHOOK_ORGANISATIONS_SECRET=
```

Go to `src/convex/env.ts` and uncomment the following:

```typescript
  WORKOS_WEBHOOK_USERS_SECRET: z
    .string()
    .parse(process.env.WORKOS_WEBHOOK_USERS_SECRET, {
      path: ["WORKOS_WEBHOOK_USERS_SECRET"],
    }),
  WORKOS_WEBHOOK_ORGANISATIONS_SECRET: z
    .string()
    .parse(process.env.WORKOS_WEBHOOK_ORGANISATIONS_SECRET, {
      path: ["WORKOS_WEBHOOK_ORGANISATIONS_SECRET"],
    }),
```

If you selected Hono as the http router, go to `src/convex/workos/webhooks/controller` and uncomment the middleware code.

If you use the convex http router, go to `src/convex/workos/webhooks/organisations` and `src/convex/workos/webhooks/users`, remove the code below

```typescript
const secret: string | null = null;
if (!secret) {
  return new Response("Bad Request", {
    status: 400,
  });
}
```

and assign the `secret` arg of `verifyWorkOSWebhook` to `env.WORKOS_WEBHOOK_ORGANISATIONS_SECRET` and `env.WORKOS_WEBHOOK_USERS_SECRET` respectively.

## Contributing

Contributions are welcome! Please open issues and pull requests on [GitHub](https://github.com/sbkl/stack).

## License

MIT
