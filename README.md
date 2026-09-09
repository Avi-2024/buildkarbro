# Build Kar Bro — Instagram Publisher

Free GitHub Actions queue for Instagram image posts and carousels through the Instagram Graph API.

## Secrets

In Settings -> Secrets and variables -> Actions, add:

- IG_USER_ID: 17841424749134562
- META_ACCESS_TOKEN: fresh Meta System User token (never commit or paste it into chat)

## Queue

Add posts to posts.json with publish_at (ISO time with timezone), image_urls (public HTTPS URLs), and caption. The workflow checks daily at 09:00 IST and can be run manually from Actions. After publishing, it records published_at and instagram_media_id.

Images must be publicly reachable HTTPS URLs.
