import fs from "node:fs/promises";
import { program } from "commander";

import { randomBytes } from "node:crypto";
import type { Config } from "#src/config.js";
import { buildMetainfo } from "#src/torrentFile.js";
import { trackerRequest } from "#src/tracker.js";

program.parse();

interface Download {
  filePath: string;
}

const download: Download = {
  filePath: "./test/ubuntu-24.04-desktop-amd64.iso.torrent",
};

const config: Config = {
  downloadsDirectory: "./downloads/",
  port: 6881,
  peerId: randomBytes(20).toString("ascii"),
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);
console.log("HELLO!");
console.log(metainfo);

await trackerRequest(config, metainfo);
