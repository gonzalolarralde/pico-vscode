// import { readFileSync, writeFileSync } from "fs";
import Logger, { LoggerSource } from "../logger.mjs";
import { unknownErrorToString } from "./errorHelper.mjs";
import { env, ProgressLocation, Uri, window } from "vscode";
// import { promisify } from "util";
import { exec } from "child_process";
import { promisify } from "util";
// import { join } from "path";
// import {
//   downloadAndInstallOpenOCD,
//   downloadAndInstallPicotool,
//   downloadAndInstallSDK,
//   downloadAndInstallToolchain,
// } from "./download.mjs";
// import { getSupportedToolchains } from "./toolchainUtil.mjs";
// import findPython, { showPythonNotFoundError } from "./pythonHelper.mjs";
// import VersionBundlesLoader from "./versionBundles.mjs";
// import { HOME_VAR } from "../settings.mjs";
// import { homedir } from "os";
// import type { Progress } from "got";
// import { OPENOCD_VERSION, SDK_REPOSITORY_URL } from "./sharedConstants.mjs";

/*const STABLE_INDEX_DOWNLOAD_URL =
  "https://static.rust-lang.org/dist/channel-rust-stable.toml";*/

const execAsync = promisify(exec);

// export enum FlashMethod {
//   debugProbe = 0,
//   elf2Uf2 = 1,
//   cargoEmbed = 2,
// }

// export async function cargoInstall(
//   packageName: string,
//   locked = false
// ): Promise<string | undefined> {
//   const command = process.platform === "win32" ? "cargo.exe" : "cargo";

//   try {
//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     const { stdout, stderr } = await execAsync(
//       `${command} install ${locked ? "--locked " : ""}${packageName}`,
//       {
//         windowsHide: true,
//       }
//     );

//     return;
//   } catch (error) {
//     const msg = unknownErrorToString(error);
//     if (
//       msg.toLowerCase().includes("already exists") ||
//       msg.toLowerCase().includes("to your path") ||
//       msg.toLowerCase().includes("is already installed") ||
//       msg.toLowerCase().includes("yanked in registry")
//     ) {
//       Logger.warn(
//         LoggerSource.rustUtil,
//         `Cargo package '${packageName}' is already installed ` +
//           "or cargo bin not in PATH:",
//         msg
//       );

//       return;
//     }
//     Logger.error(
//       LoggerSource.rustUtil,
//       `Failed to install cargo package '${packageName}': ${unknownErrorToString(
//         error
//       )}`
//     );

//     return unknownErrorToString(error);
//   }
// }

// export function calculateRequiredHostTriple(): string {
//   const arch = process.arch;
//   const platform = process.platform;
//   let triple = "";
//   if (platform === "win32" && arch === "x64") {
//     triple = "x86_64-pc-windows-msvc";
//   } else if (platform === "darwin") {
//     if (arch === "x64") {
//       triple = "x86_64-apple-darwin";
//     } else {
//       triple = "aarch64-apple-darwin";
//     }
//   } else if (platform === "linux") {
//     if (arch === "x64") {
//       triple = "x86_64-unknown-linux-gnu";
//     } else if (arch === "arm64") {
//       triple = "aarch64-unknown-linux-gnu";
//     } else {
//       throw new Error(`Unsupported architecture: ${arch}`);
//     }
//   } else {
//     throw new Error(`Unsupported platform: ${platform}`);
//   }

//   return triple;
// }

async function checkHostToolchainInstalled(): Promise<boolean> {
  try {
    // Check if swiftly has an active Swift toolchain
    const swiftly = process.platform === "win32" ? "swiftly.exe" : "swiftly";
    const { stdout } = await execAsync(`${swiftly} list`, {
      windowsHide: true,
    });

    // swiftly list should return available toolchains
    return stdout.length > 0;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Failed to check for Swift toolchain: ${unknownErrorToString(error)}`
    );

    return false;
  }
}

/**
 * Checks for all requirements except targets and cargo packages.
 *
 * (Cares about UI feedback)
 *
 * @returns {boolean} True if all requirements are met, false otherwise.
 */
export async function checkSwiftlyInstallation(): Promise<boolean> {
  let swiftlyOk = false;
  try {
    const swiftly = process.platform === "win32" ? "swiftly.exe" : "swiftly";
    await execAsync(`${swiftly} --version`, {
      windowsHide: true,
    });
    swiftlyOk = true;

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.rustUtil,
      `Swiftly installation check failed: ${unknownErrorToString(error)}`
    );

    if (!swiftlyOk) {
      void window
        .showErrorMessage(
          "Swiftly is not installed. Please install it " +
            "manually and restart VS Code.",
          "Install"
        )
        .then(result => {
          if (result) {
            env.openExternal(
              Uri.parse("https://swift.org/install/", true)
            );
          }
        });
    } else {
      void window.showErrorMessage(
        "Failed to check Swiftly installation. Please check the logs."
      );
    }

    return false;
  }
}

/**
 * Get the selected chip from the .pico-rs file in the workspace folder.
 *
 * @param workspaceFolder The workspace folder path.
 * @returns Returns the selected chip or null if the file does not exist or is invalid.
 */
export function swiftProjectGetSelectedChip(
  workspaceFolder: string
): "rp2040" | "rp2350" | "rp2350-riscv" | null {
  return "rp2350";
}

// /**
//  * Downloads and installs the latest SDK and toolchains.
//  *
//  * + OpenOCD + picotool
//  * (includes UI feedback)
//  *
//  * @param extensionUri The URI of the extension
//  */
// export async function installLatestRustRequirements(
//   extensionUri: Uri
// ): Promise<boolean> {
//   const vb = new VersionBundlesLoader(extensionUri);
//   const latest = await vb.getLatest();
//   if (latest === undefined) {
//     void window.showErrorMessage(
//       "Failed to get latest version bundles. " +
//         "Please try again and check your settings."
//     );

//     return false;
//   }

//   // install python (if necessary)
//   const python3Path = await findPython();
//   if (!python3Path) {
//     Logger.error(LoggerSource.downloader, "Failed to find Python3 executable.");
//     showPythonNotFoundError();

//     return false;
//   }

//   let result = await window.withProgress(
//     {
//       location: ProgressLocation.Notification,
//       title: "Downloading and installing SDK",
//       cancellable: false,
//     },
//     async progress2 => {
//       const result = await downloadAndInstallSDK(
//         extensionUri,
//         latest[0],
//         SDK_REPOSITORY_URL,
//         // python3Path is only possible undefined if downloaded and
//         // there is already checked and returned if this happened
//         python3Path.replace(HOME_VAR, homedir().replaceAll("\\", "/"))
//       );

//       if (!result) {
//         Logger.error(
//           LoggerSource.downloader,
//           "Failed to download and install SDK."
//         );
//         progress2.report({
//           message: "Failed - Make sure all requirements are met.",
//           increment: 100,
//         });

//         void window.showErrorMessage(
//           "Failed to download and install SDK. " +
//             "Make sure all requirements are met."
//         );

//         return false;
//       }

//       return true;
//     }
//   );

//   if (!result) {
//     return false;
//   }

//   const supportedToolchains = await getSupportedToolchains(extensionUri);

//   result = await window.withProgress(
//     {
//       location: ProgressLocation.Notification,
//       title: `Downloading ARM Toolchain for debugging...`,
//     },
//     async progress => {
//       const toolchain = supportedToolchains.find(
//         t => t.version === latest[1].toolchain
//       );

//       if (toolchain === undefined) {
//         void window.showErrorMessage(
//           "Failed to get default toolchain. " +
//             "Please try again and check your internet connection."
//         );

//         return false;
//       }

//       let progressState = 0;

//       return downloadAndInstallToolchain(toolchain, (prog: Progress) => {
//         const percent = prog.percent * 100;
//         progress.report({ increment: percent - progressState });
//         progressState = percent;
//       });
//     }
//   );

//   if (!result) {
//     void window.showErrorMessage(
//       "Failed to download ARM Toolchain. " +
//         "Please try again and check your settings."
//     );

//     return false;
//   }

//   result = await window.withProgress(
//     {
//       location: ProgressLocation.Notification,
//       title: "Downloading RISC-V Toolchain for debugging...",
//     },
//     async progress => {
//       const toolchain = supportedToolchains.find(
//         t => t.version === latest[1].riscvToolchain
//       );

//       if (toolchain === undefined) {
//         void window.showErrorMessage(
//           "Failed to get default RISC-V toolchain. " +
//             "Please try again and check your internet connection."
//         );

//         return false;
//       }

//       let progressState = 0;

//       return downloadAndInstallToolchain(toolchain, (prog: Progress) => {
//         const percent = prog.percent * 100;
//         progress.report({ increment: percent - progressState });
//         progressState = percent;
//       });
//     }
//   );

//   if (!result) {
//     void window.showErrorMessage(
//       "Failed to download RISC-V Toolchain. " +
//         "Please try again and check your internet connection."
//     );

//     return false;
//   }

//   result = await window.withProgress(
//     {
//       location: ProgressLocation.Notification,
//       title: "Downloading and installing OpenOCD...",
//     },
//     async progress => {
//       let progressState = 0;

//       return downloadAndInstallOpenOCD(OPENOCD_VERSION, (prog: Progress) => {
//         const percent = prog.percent * 100;
//         progress.report({ increment: percent - progressState });
//         progressState = percent;
//       });
//     }
//   );
//   if (!result) {
//     void window.showErrorMessage(
//       "Failed to download OpenOCD. " +
//         "Please try again and check your internet connection."
//     );

//     return false;
//   }

//   result = await window.withProgress(
//     {
//       location: ProgressLocation.Notification,
//       title: "Downloading and installing picotool...",
//     },
//     async progress => {
//       let progressState = 0;

//       return downloadAndInstallPicotool(
//         latest[1].picotool,
//         (prog: Progress) => {
//           const percent = prog.percent * 100;
//           progress.report({ increment: percent - progressState });
//           progressState = percent;
//         }
//       );
//     }
//   );
//   if (!result) {
//     void window.showErrorMessage(
//       "Failed to download picotool. " +
//         "Please try again and check your internet connection."
//     );
//   }

//   return result;
// }
