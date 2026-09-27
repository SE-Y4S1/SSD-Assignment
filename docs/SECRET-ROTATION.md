# Secrets that were committed, and what has to happen to them

This is the record for V-A02. Unlike the other findings on this component, it
cannot be closed by changing the code in this repository. The values below were
committed to the original MedSync repository and are in its git history. Removing
them from the working tree does not remove them from the history, and anyone who
cloned or forked that repository before the history was touched still holds a
copy.

A committed secret has to be treated as disclosed. The only fix is to make the
disclosed value useless by replacing it at the place that honours it.

## What was committed

| What | Where in the original history | What it opened |
| :--- | :--- | :--- |
| MongoDB Atlas connection string, including the database user's password | `docker-compose.yml` in `c5d46b6` | Read and write on the whole cluster: every patient record, appointment and payment |
| Groq API key | `AIVoiceScribe.tsx` in `e2fd711` and `32eb28d` | Paid API calls billed to the key's owner |
| `JWT_SECRET`, short and guessable | `.env` files in `d7c96ac` and `4499eb5` | Forging a token for any account, including an admin one |

The signing key is the worst of the three. Anything holding it can mint a token
this platform accepts, so it defeats every access check at once.

## What has to be done, in this order

1. **Rotate the Atlas database user.** In the Atlas console, change that user's
   password, or delete the user and create a new one. Do this before anything
   else: it is the only item that exposes patient data directly.
2. **Revoke the Groq key** in the Groq console and issue a new one. Revoking
   matters as much as replacing: an unrevoked key keeps working and keeps
   billing.
3. **Replace `JWT_SECRET`** with a freshly generated value:
   `openssl rand -base64 48`. Every token signed with the old key stops being
   accepted, so everyone is signed out once. That is the intended effect.
4. **Replace `ADMIN_PASSWORD`** and any SMTP, Twilio or Stripe value that was
   ever in a committed file.
5. **Check the access logs** for the Atlas cluster and the Groq key for use that
   was not yours, over the whole period the values were exposed, not just
   recently.
6. **Update every deployment**: the `.env` used by Compose, and the Kubernetes
   Secret in `k8s/secrets.yaml`. Restart the services so they pick up the new
   values.

## What has already been done in this repository

- `.env` is in `.gitignore` and only `.env.example` is tracked. The committed
  file holds placeholders, not values.
- Every service refuses to start on one of those placeholders, on a missing
  secret, or on anything shorter than 32 characters
  (`src/config/validateSecrets.js`, V-A01). A repeat of the short guessable key
  now stops the service instead of running with it.
- The setup scripts generate a real signing key and admin password rather than
  copying the template and continuing.
- `frontend/.dockerignore` excludes `.env` and `.env.*`, so a local env file is
  not copied into the image (V-A19).
- Each container receives only the variables its own service reads, so the
  frontend and the AI service no longer get the signing key, the admin password
  or the Stripe keys (V-A18).

## Stopping the next one

`.gitignore` only helps for files someone remembered to name. Scanning catches
the value pasted into a source file, which is how the Groq key was committed.

### The check that runs on every push

`.github/workflows/secret-scan.yml` runs gitleaks over the repository, including
its history, on every push and pull request. It fails the run when it finds
something, so a committed secret is visible in the pull request rather than six
months later.

### The check before the commit is made

CI tells you after the fact, and the history already has the value by then. To
be stopped before the commit exists, install the hook once per clone:

```bash
pip install pre-commit        # or: brew install pre-commit
pre-commit install
```

`.pre-commit-config.yaml` is in the repository, so that is all that is needed.
The hook then runs gitleaks against what is staged, every time, and refuses the
commit when it matches.

### If something gets through anyway

Rotate first. Cleaning the history is secondary, it is disruptive for everyone
with a clone, and it does nothing about the copies that already exist. Rotating
is what makes the disclosed value worthless; treat rewriting the history as
tidying up afterwards.
