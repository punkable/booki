const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor < 18) {
  console.error(`Node 24.18+ and <25 required; found ${process.version}`);
  process.exitCode = 1;
}
