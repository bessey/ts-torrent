import { program } from "commander";
import fs from "fs/promises";

import { buildMetainfo } from "#src/torrentFile.js";
import { trackerRequest } from "#src/tracker.js";
import type { Config } from "#src/config.js";
import { randomBytes } from "crypto";

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
  peerId: randomBytes(20).toString("hex"),
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);
console.log("HELLO!");
console.log(metainfo);

await trackerRequest(config, metainfo);
