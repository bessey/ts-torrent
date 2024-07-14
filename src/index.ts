import { program } from "commander";

program.parse();

interface Download {
  filePath: string;
}

interface Config {
  downloadsDirectory: string;
}

const download: Download = {
  filePath: "./ubuntu-24.04-desktop-amd64.iso.torrent",
};

const config: Config = {
  downloadsDirectory: "./downloads/",
};

console.log("Hello world");
