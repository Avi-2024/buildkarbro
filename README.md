# Build Kar Bro — Instagram Auto Publisher

Free GitHub Actions queue for publishing original Instagram image posts and carousels for `@buildkarbro` through the Instagram API with Instagram Login.

## Authentication

Repository secret required:

- `META_ACCESS_TOKEN` — raw Instagram User access token generated/authorized for `@buildkarbro`

The Instagram user ID is configured in the publisher script, so an `IG_USER_ID` repository secret is not required.

Never commit, print, screenshot, or paste the access token into chat. Do not add `Bearer`, quotes, labels, or extra whitespace to the GitHub secret.

## Media requirements

Queued image URLs must be public HTTPS JPEG URLs. For the first carousel, upload these exact files under `assets/`:

- `first-post.jpg`
- `carousel-2.jpg`
- `carousel-3.jpg`
- `carousel-4.jpg`
- `carousel-5.jpg`
- `carousel-6.jpg`

The workflow runs a media preflight before any Meta publishing call. It checks HTTPS, JPEG extension/content type, public reachability, JPEG file integrity, carousel size, and caption length.

## Queue

Add posts to `posts.json` with:

- `id`
- `publish_at` as an ISO timestamp with timezone
- `image_urls` with 1–10 public HTTPS JPEG URLs
- `caption`

The first unpublished due post is published on each run. After a successful publish, the workflow writes `published_at` and `instagram_media_id` back to `posts.json`.

## Schedule

The workflow runs every day at **09:00 IST** (`03:30 UTC`) and can also be started manually from:

`Actions → Publish Instagram Queue → Run workflow`

## Publishing flow

`Checkout → Preflight due post → Create media container(s) → Wait for container readiness → Publish → Save queue status`

The Meta app does not need to be made public merely to test/publish to the authorized app-role/test account. App Review/live-mode requirements become relevant when the app is used by accounts outside the authorized app roles/testing setup.
