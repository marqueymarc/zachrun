function parseByteRange(rangeHeader, totalLength) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((rangeHeader || "").trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  let start;
  let end;
  if (startRaw) {
    start = Number.parseInt(startRaw, 10);
    end = endRaw ? Number.parseInt(endRaw, 10) : totalLength - 1;
  } else {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0 || start > end || start >= totalLength) return null;
  end = Math.min(end, totalLength - 1);
  return { start, end };
}

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);
    const isMp3 = reqUrl.pathname.toLowerCase().endsWith(".mp3");
    const rangeHeader = request.headers.get("range");
    if (!isMp3 || !rangeHeader) {
      return env.ASSETS.fetch(request);
    }

    const noRangeHeaders = new Headers(request.headers);
    noRangeHeaders.delete("range");
    const fullResponse = await env.ASSETS.fetch(
      new Request(request.url, {
        method: "GET",
        headers: noRangeHeaders,
      })
    );
    if (!fullResponse.ok || !fullResponse.body) {
      return fullResponse;
    }

    const fullBuffer = await fullResponse.arrayBuffer();
    const totalLength = fullBuffer.byteLength;
    const parsed = parseByteRange(rangeHeader, totalLength);
    if (!parsed) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalLength}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const { start, end } = parsed;
    const chunk = fullBuffer.slice(start, end + 1);
    const outHeaders = new Headers(fullResponse.headers);
    outHeaders.set("Accept-Ranges", "bytes");
    outHeaders.set("Content-Range", `bytes ${start}-${end}/${totalLength}`);
    outHeaders.set("Content-Length", String(chunk.byteLength));
    if (!outHeaders.get("Content-Type")) outHeaders.set("Content-Type", "audio/mpeg");

    return new Response(chunk, {
      status: 206,
      headers: outHeaders,
    });
  },
};
