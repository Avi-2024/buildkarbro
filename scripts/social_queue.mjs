export function isContentBankPost(post) {
  return Boolean(
    post &&
    Array.isArray(post.image_urls) &&
    post.image_urls.length > 0 &&
    post.image_urls.every((url) =>
      typeof url === "string" && url.includes("/assets/content-bank/")
    )
  );
}

export function isPending(post) {
  return Boolean(
    post &&
    isContentBankPost(post) &&
    !post.published_at &&
    !post.skipped_at &&
    post.publish_at &&
    Number.isFinite(new Date(post.publish_at).getTime())
  );
}

export function getDuePosts(posts, now = new Date()) {
  if (!Array.isArray(posts)) return [];

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Invalid queue evaluation time.");

  return posts
    .map((post, index) => ({
      post,
      index,
      publishMs: post?.publish_at ? new Date(post.publish_at).getTime() : NaN,
    }))
    .filter(({ post, publishMs }) => isPending(post) && publishMs <= nowMs)
    .sort((a, b) => b.publishMs - a.publishMs || b.index - a.index)
    .map(({ post }) => post);
}

export function selectDuePost(posts, now = new Date()) {
  return getDuePosts(posts, now)[0] || null;
}

export function markSupersededBacklog(posts, selected, now = new Date()) {
  if (!selected) return [];

  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const due = getDuePosts(posts, now);
  const skipped = [];

  for (const post of due) {
    if (post === selected) continue;

    post.skipped_at = nowIso;
    post.skip_reason = `superseded_by_${selected.id}`;
    skipped.push(post.id || "(missing-id)");
  }

  return skipped;
}
