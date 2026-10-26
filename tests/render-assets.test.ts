import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  createAssetGrant,
  closeRenderAssetServer,
  prepareRenderImage,
} from "@/lib/render-assets";
import { dataRoot } from "@/lib/storage";
afterAll(closeRenderAssetServer);
describe("仅本机可用的渲染素材缓存", () => {
  it("随机凭证只授权指定文件，支持音频范围请求，释放后立即失效", async () => {
    await fs.mkdir(dataRoot, { recursive: true });
    const file = path.join(dataRoot, "asset-fixture.txt");
    await fs.writeFile(file, "1234567890");
    const grant = await createAssetGrant();
    const url = grant.add(file, "text/plain");
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const response = await fetch(url, { headers: { Range: "bytes=2-5" } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("3456");
    expect((await fetch(new URL("/unknown", url))).status).toBe(404);
    grant.release();
    expect((await fetch(url)).status).toBe(404);
  });
  it("背景缓存使用 CSS 的色彩矩阵，不修改原文件，并可复用", async () => {
    const file = path.join(dataRoot, "cache-source.png");
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 50, g: 100, b: 200 },
      },
    })
      .png()
      .toFile(file);
    const original = await fs.readFile(file);
    const prepared = await prepareRenderImage(file, 100, 100, 1.5);
    expect((await fs.readFile(file)).equals(original)).toBe(true);
    const pixel = await sharp(prepared.background)
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    // Blur/resampling may round individual 8-bit channels by up to two levels.
    expect(Math.abs(pixel[0] - 26)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixel[1] - 58)).toBeLessThanOrEqual(2);
    expect(Math.abs(pixel[2] - 122)).toBeLessThanOrEqual(2);
    expect(await prepareRenderImage(file, 100, 100, 1.5)).toEqual(prepared);
  });
});
