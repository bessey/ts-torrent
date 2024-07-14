import { program } from "commander";
import fs from "fs/promises";

import { buildMetainfo } from "#src/torrentFile.js";

program.parse();

interface Download {
  filePath: string;
}

interface Config {
  downloadsDirectory: string;
}

const download: Download = {
  filePath: "./test/ubuntu-24.04-desktop-amd64.iso.torrent",
};

const config: Config = {
  downloadsDirectory: "./downloads/",
};

const data = await fs.readFile(download.filePath);

const metainfo = buildMetainfo(data);
console.log("HELLO!");
console.log(metainfo);
