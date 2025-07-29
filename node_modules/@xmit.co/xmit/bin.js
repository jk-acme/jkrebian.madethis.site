const { arch, type } = require("os");
const { join } = require("path");
const { existsSync, mkdirSync, renameSync, rmSync } = require("fs");
const { spawnSync } = require("child_process");
const axios = require("axios");
const tar = require("tar");
const version = require(join(__dirname, "package.json")).version.split("-")[0];

const osType = type();
const osArch = arch();

const goos = {
  Windows_NT: "windows",
  Linux: "linux",
  Darwin: "darwin",
}[osType];

const goarch = {
  arm64: "arm64",
  x64: "amd64",
}[osArch];

if (goos === undefined || goarch === undefined) {
  throw new Error(`Unsupported OS: ${osType} ${osArch}`);
}

/*! Copyright (c) 2019 Avery Harnish - MIT License */
class Binary {
  constructor(name, url, installDirectory) {
    this.url = url;
    this.name = name;
    this.installDirectory = installDirectory;

    if (!existsSync(this.installDirectory)) {
      mkdirSync(this.installDirectory, { recursive: true });
    }

    this.binaryPath = join(this.installDirectory, this.name);
  }
  install(fetchOptions, suppressLogs = false) {
    if (existsSync(this.binaryPath)) {
      if (!suppressLogs) {
        console.info(
          `${this.name} is already installed, skipping installation.`,
        );
      }
      return Promise.resolve();
    }

    if (existsSync(this.installDirectory)) {
      rmSync(this.installDirectory, { recursive: true });
    }

    mkdirSync(this.installDirectory, { recursive: true });

    if (!suppressLogs) {
      console.info(`Downloading release from ${this.url}`);
    }

    return axios({ ...fetchOptions, url: this.url, responseType: "stream" })
      .then((res) => {
        return new Promise((resolve, reject) => {
          const sink = res.data.pipe(
            tar.x({ strip: 1, C: this.installDirectory }),
          );
          sink.on("finish", () => resolve());
          sink.on("error", (err) => reject(err));
        });
      })
      .then(() => {
        renameSync(join(this.installDirectory, this.name), this.binaryPath);
        if (!suppressLogs) {
          console.info(`${this.name} has been installed!`);
        }
      })
      .catch((e) => {
        console.error(`Error fetching release: ${e.message}`);
      });
  }

  run(fetchOptions) {
    const promise = !existsSync(this.binaryPath)
      ? this.install(fetchOptions, true)
      : Promise.resolve();

    promise
      .then(() => {
        const [, , ...args] = process.argv;

        const options = { cwd: process.cwd(), stdio: "inherit" };

        const result = spawnSync(this.binaryPath, args, options);

        if (result.error) {
          console.error(result.error);
        }

        process.exit(result.status);
      })
      .catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
  }
}

const binary = new Binary(
  "xmit",
  `https://github.com/xmit-co/xmit/releases/download/v${version}/xmit_${version}_${goos}_${goarch}.tgz`,
  join(__dirname, `${goos}-${goarch}`),
);

module.exports = binary;
