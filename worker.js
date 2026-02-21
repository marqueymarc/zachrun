const FAIL_WIND_PATHNAME = "/audio/fail-wind.mp3";
const FAIL_WIND_ASSET_PATH = "/assets/world/tanweraman-desert-wind-1-350398.mp3";

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
    if (reqUrl.pathname === FAIL_WIND_PATHNAME) {
      return serveRangedMp3FromAssets(request, env, FAIL_WIND_ASSET_PATH);
    }

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

async function serveRangedMp3FromAssets(request, env, assetPath) {
  const assetUrl = new URL(assetPath, request.url);
  const srcResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  if (!srcResponse.ok || !srcResponse.body) return srcResponse;

  const baseHeaders = new Headers(srcResponse.headers);
  baseHeaders.set("Content-Type", "audio/mpeg");
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Cache-Control", "no-store");
  baseHeaders.set("Vary", "Range");

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    return new Response(srcResponse.body, {
      status: 200,
      headers: baseHeaders,
    });
  }

  const fullBuffer = await srcResponse.arrayBuffer();
  const totalLength = fullBuffer.byteLength;
  const parsed = parseByteRange(rangeHeader, totalLength);
  if (!parsed) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${totalLength}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }

  const { start, end } = parsed;
  const chunk = fullBuffer.slice(start, end + 1);
  baseHeaders.set("Content-Range", `bytes ${start}-${end}/${totalLength}`);
  baseHeaders.set("Content-Length", String(chunk.byteLength));
  return new Response(chunk, {
    status: 206,
    headers: baseHeaders,
  });
}
