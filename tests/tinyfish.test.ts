import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatJevError } from "../src/core/types";
import { searchTinyFish } from "../src/core/tinyfish";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MONID_API_KEY;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function completed(query: string, title: string): unknown {
  return {
    status: "COMPLETED",
    output: {
      results: [
        {
          title,
          url: `https://example.com/${encodeURIComponent(query)}`,
          snippet: `Evidence for ${query}.`,
        },
      ],
    },
    providerResponse: { httpStatus: 200 },
  };
}

describe("searchTinyFish", () => {
  it("sends each query to TinyFish through Monid", async () => {
    process.env.MONID_API_KEY = "test-key";
    const queries = [
      ["Canberra capital", "Canberra"],
      ["Pacific Ocean size", "Pacific Ocean"],
      ["James Webb launch year", "James Webb Space Telescope"],
    ] as const;
    const fetchMock = vi.fn((_: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        input: { queryParams: { query: string } };
      };
      const match = queries.find(
        ([query]) => query === body.input.queryParams.query,
      );
      return Promise.resolve(
        jsonResponse(completed(match?.[0] ?? "q", match?.[1] ?? "t")),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await Promise.all(
      queries.map(([query]) => searchTinyFish(query)),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    queries.forEach(([query, title], index) => {
      const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(url).toBe("https://api.monid.ai/v1/run");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer test-key",
      });
      expect(JSON.parse(String(init.body))).toEqual({
        provider: "tinyfish",
        endpoint: "/free/search",
        input: { queryParams: { query, domain_type: "web" } },
      });
      expect(hits[index]).toEqual([
        {
          title,
          url: `https://example.com/${encodeURIComponent(query)}`,
          snippet: `Evidence for ${query}.`,
        },
      ]);
    });
  });

  it("polls an accepted run until TinyFish finishes", async () => {
    process.env.MONID_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ runId: "run-1", status: "RUNNING" }, 202),
      )
      .mockResolvedValueOnce(jsonResponse(completed("tide times", "Tides")));
    vi.stubGlobal("fetch", fetchMock);

    const hits = await searchTinyFish("tide times");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.monid.ai/v1/runs/run-1",
    );
    expect(hits[0]?.title).toBe("Tides");
  });

  it("uses page content when a hit has no snippet", async () => {
    process.env.MONID_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "COMPLETED",
          output: {
            results: [
              {
                title: "Notes",
                url: "https://example.com/notes",
                content: "The longer extract.",
              },
              { title: "Skip", snippet: "No address." },
            ],
          },
        }),
      ),
    );

    await expect(searchTinyFish("notes")).resolves.toEqual([
      {
        title: "Notes",
        url: "https://example.com/notes",
        snippet: "The longer extract.",
      },
    ]);
  });

  it("keeps at most five hits", async () => {
    process.env.MONID_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "COMPLETED",
          output: {
            results: Array.from({ length: 8 }, (_, index) => ({
              title: `Result ${index}`,
              url: `https://example.com/${index}`,
              snippet: "text",
            })),
          },
        }),
      ),
    );

    const hits = await searchTinyFish("many");
    expect(hits).toHaveLength(5);
    expect(hits[4]?.title).toBe("Result 4");
  });

  it("refuses to search without a Monid key", async () => {
    await expect(searchTinyFish("anything")).rejects.toMatchObject({
      status: 503,
      code: "missing_search_key",
    });
  });

  it("reports a failed TinyFish run", async () => {
    process.env.MONID_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "FAILED",
          providerResponse: { httpStatus: 500 },
        }),
      ),
    );

    await expect(searchTinyFish("broken")).rejects.toBeInstanceOf(ChatJevError);
  });
});
