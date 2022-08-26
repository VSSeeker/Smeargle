import fs from "node:fs";
import https from "node:https";

export async function cacheDownload(url, dest) {
  return new Promise((resolve, reject) => {
    fs.access(dest, fs.constants.F_OK, (err) => {
      // File already exists
      if (!err) {
        resolve();
        return;
      }

      async function onerror(err) {
        try {
          await fs.promises.unlink(dest);
        } catch {}

        reject(err);
      }

      const file = fs.createWriteStream(dest);
      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            return reject(`${response.statusCode} ${url}`);
          }

          response.pipe(file);
          file
            .on("finish", () => {
              file.close();
              resolve();
            })
            .on("error", onerror);
        })
        .on("error", onerror);
    });
  });
}
