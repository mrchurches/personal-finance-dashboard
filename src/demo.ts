/**
 * Serves the API from a recorded snapshot, so the dashboard can be published as a static
 * page with no server behind it.
 *
 * The snapshot is produced by `scripts/build-demo-snapshot.ts`, which runs the real API
 * against the real sample import and records what it answers. Nothing is reimplemented
 * here: this file only decides where a request is answered from, never what the answer is.
 *
 * Writes are refused rather than faked. A demo that accepts a category and forgets it on
 * reload teaches the reader that the tool loses their work, which is the opposite of what
 * it is for, and it is a lie told in the one place - the interface - where the whole point
 * is to show what the thing actually does.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === "1";

const SNAPSHOT_URL = "/demo-api.json";

interface Recorded {
  status: number;
  body: unknown;
}

const READ_ONLY_MESSAGE =
  "This is a read-only demo with invented data. Clone the repository to use it with your own.";

let snapshot: Promise<Record<string, Recorded>> | null = null;

function loadSnapshot(): Promise<Record<string, Recorded>> {
  snapshot ??= fetch(SNAPSHOT_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error(`The demo data could not be loaded (${response.status}).`);
    }

    return (await response.json()) as Record<string, Recorded>;
  });

  return snapshot;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Replaces `fetch` for API calls only. Everything else - the snapshot itself, fonts,
 * anything a browser asks for on its own - goes through untouched.
 */
export function installDemoApi(): void {
  if (!IS_DEMO) {
    return;
  }

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const path = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;

    if (!path.startsWith("/api/")) {
      return original(input, init);
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") {
      return jsonResponse({ error: READ_ONLY_MESSAGE }, 403);
    }

    const recorded = (await loadSnapshot())[path];
    if (recorded === undefined) {
      /*
       * Every read this client can make was recorded, so a miss means the client learned to
       * ask something new and the snapshot was not rebuilt. Saying that is more useful than
       * an empty panel, which would read as a dashboard with nothing to report.
       */
      return jsonResponse(
        { error: `The demo has no recorded answer for ${path}. The snapshot needs rebuilding.` },
        404,
      );
    }

    return jsonResponse(recorded.body, recorded.status);
  };
}
