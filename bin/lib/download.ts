import * as fs from "fs";
import * as path from "path";

export async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  return await fetchOk(url, init).then((response) => response.text());
}

export async function downloadFile(from: string, to: string, init?: RequestInit): Promise<void> {
  const response = await fetchOk(from, init);
  const contentType = response.headers.get("content-type")?.toLowerCase();
  const isImageResponse =
    !contentType ||
    contentType.startsWith("image/") ||
    contentType.startsWith("application/octet-stream");

  if (!isImageResponse) {
    throw new Error(`Expected image response, received ${contentType} (${from})`);
  }

  const contents = await response.arrayBuffer();
  if (contents.byteLength === 0) {
    throw new Error(`Empty download response (${from})`);
  }

  await writeFileAtomic(to, contents);
}

export async function copyFileAtomic(from: string, to: string): Promise<void> {
  const outputDir = path.dirname(to);
  const tempFile = path.join(
    outputDir,
    `.${path.basename(to)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  await fs.promises.mkdir(outputDir, { recursive: true });

  try {
    await fs.promises.copyFile(from, tempFile);
    await fs.promises.rename(tempFile, to);
  } catch (error) {
    await fs.promises.unlink(tempFile).catch(() => {});
    throw error;
  }
}

export async function writeFileAtomic(to: string, contents: string | ArrayBuffer): Promise<void> {
  const outputDir = path.dirname(to);
  const tempFile = path.join(
    outputDir,
    `.${path.basename(to)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  await fs.promises.mkdir(outputDir, { recursive: true });

  try {
    await Bun.write(tempFile, contents);
    await fs.promises.rename(tempFile, to);
  } catch (error) {
    await fs.promises.unlink(tempFile).catch(() => {});
    throw error;
  }
}
