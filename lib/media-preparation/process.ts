export interface SpawnedCommand {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SpawnCommand {
  (
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      stdio: readonly ["ignore", "pipe", "pipe"];
      windowsHide: true;
    }>,
  ): Promise<SpawnedCommand>;
}

export async function runSpawnedCommand(
  spawnCommand: SpawnCommand,
  executable: string,
  args: readonly string[],
): Promise<SpawnedCommand> {
  if (!/^[a-z0-9._-]+$/i.test(executable)) {
    throw new TypeError("Media executable name is invalid.");
  }
  if (
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== "string")
  ) {
    throw new TypeError("Media command arguments must be a string array.");
  }
  const result = await spawnCommand(executable, [...args], {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.exitCode !== 0) {
    throw new Error(`${executable} exited with code ${result.exitCode}.`);
  }
  return result;
}

export async function preflightMediaTools(
  spawnCommand: SpawnCommand,
): Promise<void> {
  await runSpawnedCommand(spawnCommand, "ffprobe", ["-version"]);
  await runSpawnedCommand(spawnCommand, "ffmpeg", ["-version"]);
}
