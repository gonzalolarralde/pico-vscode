/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/naming-convention */
import { join } from "path";
import Logger, { LoggerSource } from "../../logger.mjs";
import { unknownErrorToString } from "../errorHelper.mjs";
import { mkdir, writeFile } from "fs/promises";
import { extensionName } from "../../commands/command.mjs";
import { commands, window } from "vscode";
import { GET_PICOTOOL_PATH } from "../../commands/cmdIds.mjs";

function symbolProjectName(projectName: string): string {
  return projectName
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

async function generatePackageSwift(projectRoot: string, projectName: string): Promise<boolean> {
  const projectNameSymbol = symbolProjectName(projectName);

  const fileContent = `// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "${projectNameSymbol}",
    products: [
        .library(name: "${projectNameSymbol}", type: .static, targets: ["${projectNameSymbol}"]),
    ],
    dependencies: [
        .package(
            url: "https://github.com/gonzalolarralde/CPicoSDK",
            exact: "2.2.4",
            traits: [
                .init(name: "Platform_RP2350"),
                .init(name: "BootStage2_W25Q080"),

                // - Pico 2
                .init(name: "Variant_RP2350A"),
                .init(name: "Radio_None"),

                // - Pico 2 W
                // .init(name: "Variant_RP2350A"),
                // .init(name: "Radio_CYW43439"),

                // - Pimoroni Pico Plus 2
                // .init(name: "Variant_RP2350B"),
                // .init(name: "Radio_None"),

                // - Pimoroni Pico Plus 2 W
                // .init(name: "Variant_RP2350B"),
                // .init(name: "Radio_CYW43439"),
            ]
        ),
    ],
    targets: [
        .target(
            name: "${projectNameSymbol}",
            dependencies: ["CPicoSDK"],
            plugins: [.plugin(name: "PIOASM", package: "CPicoSDK")]
        ),
    ]
)
`;

  try {
    await writeFile(join(projectRoot, "Package.swift"), fileContent);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectSwift,
      "Failed to write Package.swift file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateBuildSh(projectRoot: string): Promise<boolean> {
  const buildSh = `#!/usr/bin/env /bin/bash
set -euo pipefail

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
export BUILD_TYPE="RelWithDebInfo" # Options: Debug, Release, RelWithDebInfo, MinSizeRel
export SDK_VERSION="2.2.0"
export TOOLCHAIN_VERSION="14_2_Rel1"
export PICOTOOL_VERSION="2.2.0-a4"
# ====================================================================================
export OPENOCD_PATH="/Users/gonzalo/.pico-sdk/openocd/0.12.0+dev"
export CMAKE_VERSION="3.31.5"
export NINJA_VERSION="1.12.1"

export SWIFT_VERSION="main-snapshot-2025-11-03"
# ====================================================================================


### Uncommenting the next line could help to debug issues or better understand the pipeline.
# set -x

export BUILD_SCRIPT_VERSION=1 # Helps the preparation script to warn in case of future changes.
export PREPARATION_SCRIPT_PATH="$(dirname "$0")/.env_prep"

if command -v swiftly >/dev/null 2>&1; then
  export SWIFTLY_PATH="$(command -v swiftly)"
elif [ -f "$HOME/.swiftly/bin/swiftly" ]; then                 # macOS default path
  export SWIFTLY_PATH="$HOME/.swiftly/bin/swiftly"
elif [ -f "$HOME/.local/share/swiftly/bin/swiftly" ]; then     # Linux default path
  export SWIFTLY_PATH="$HOME/.local/share/swiftly/bin/swiftly"
else
  echo "swiftly not found in PATH."
  echo "Install it from https://www.swift.org/download/"
  exit 1
fi

# This command will prepare the environment and create a swiftpm and a vscode basic configuration.
# On doing so, it might opt to overwrite some of the existing files. If you are customizing your
# environment, please inspect the preparation script dumped at PREPARATION_SCRIPT_PATH and source it
# manually after inspection. You can also use the following flags to disable parts of the preparation:
    #--disable-vscode-settings \
    #--disable-sourcekit-lsp-settings \
    #--disable-toolset \
    #--disable-swift-version \
    #--disable-install-dependencies \
"$SWIFTLY_PATH" run swift package prepare-rp2xxx-environment \
    "$@" \
    --dump-prep-script "$PREPARATION_SCRIPT_PATH" \
    --allow-writing-to-package-directory \
    --allow-network-connections all  # Used to download PicoSDK, toolchain and other dependencies.

# The preparation script is dumped to PREPARATION_SCRIPT_PATH so it can be inspected.
# Users can opt to place the output in a different location and source it here once inspected if preferred.
source "$PREPARATION_SCRIPT_PATH"

# Make sure the selected swift toolchain is installed.
"$SWIFTLY_PATH" install

# Builds the library using swiftpm. This is where the application code is compiled.
"$SWIFTLY_PATH" run swift build \
    --build-system native \
    --configuration $SWIFT_BUILD_TYPE \
    --toolset $TOOLSET_PATH \
    --triple $SWIFTPM_TRIPLE \
    $EXTRA_CONFIG_PARAMS            # This allows passing extra parameters from the command line.
                                    # Used for adding debugging flags based on the cmake configuration.

# Here the application code is linked with the PicoSDK and other imported libraries to produce
# the final binary that can be flashed to the target device. An UF2 and ELF file are produced.
finalize_rp2xxx_binary "$@"

# Flash the produced binary to the target device if requested.
flash_if_needed "$@"
`;

  try {
    await writeFile(join(projectRoot, "build.sh"), buildSh);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectSwift,
      "Failed to write build.sh file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateGitIgnore(projectRoot: string): Promise<boolean> {
  const gitIgnore = `.DS_Store
/.build
/Packages
xcuserdata/
DerivedData/
.swiftpm/configuration/registries.json
.swiftpm/xcode/package.xcworkspace/contents.xcworkspacedata
.netrc
Package.resolved
.env_prep
`;

  try {
    await writeFile(join(projectRoot, ".gitignore"), gitIgnore);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectSwift,
      "Failed to write .gitignore file",
      unknownErrorToString(error)
    );

    return false;
  }
}

async function generateSourceMain(projectRoot: string, projectName: string): Promise<boolean> {
  const projectNameSymbol = symbolProjectName(projectName);

  const swiftMain = `
`;

  try {
    await mkdir(join(projectRoot, "Sources", projectNameSymbol), { recursive: true });
    await writeFile(join(projectRoot, "Sources", projectNameSymbol, `${projectNameSymbol}.swift`), swiftMain);

    return true;
  } catch (error) {
    Logger.error(
      LoggerSource.projectSwift,
      "Failed to write main swift file",
      unknownErrorToString(error)
    );

    return false;
  }
}

/**
 * Generates a new Swift project.
 *
 * @param projectRoot The path where the project folder should be generated.
 * @param projectName The name of the project.
 * @param flashMethod The flash method to use.
 * @returns A promise that resolves to true if the project was generated successfully.
 */
export async function generateSwiftProject(
  projectFolder: string,
  projectName: string
): Promise<boolean> {
  // const picotoolPath: string | undefined = await commands.executeCommand(
  //   `${extensionName}.${GET_PICOTOOL_PATH}`
  // );

  // if (picotoolPath === undefined) {
  //   Logger.error(LoggerSource.projectSwift, "Failed to get picotool path.");

  //   void window.showErrorMessage(
  //     "Failed to detect or install picotool. Please try again and check your settings."
  //   );

  //   return false;
  // }
  // const picotoolVersion = picotoolPath.match(
  //   /picotool[/\\]+(\d+\.\d+\.\d+)/
  // )?.[1];

  // if (!picotoolVersion) {
  //   Logger.error(
  //     LoggerSource.projectSwift,
  //     "Failed to detect picotool version."
  //   );

  //   void window.showErrorMessage(
  //     "Failed to detect picotool version. Please try again and check your settings."
  //   );

  //   return false;
  // }

  try {
    await mkdir(projectFolder, { recursive: true });
  } catch (error) {
    const msg = unknownErrorToString(error);
    if (
      msg.includes("EPERM") ||
      msg.includes("EACCES") ||
      msg.includes("access denied")
    ) {
      Logger.error(
        LoggerSource.projectSwift,
        "Failed to create project folder",
        "Permission denied. Please check your permissions."
      );

      void window.showErrorMessage(
        "Failed to create project folder. Permission denied - Please check your permissions."
      );
    } else {
      Logger.error(
        LoggerSource.projectSwift,
        "Failed to create project folder",
        unknownErrorToString(error)
      );

      void window.showErrorMessage(
        "Failed to create project folder. See the output panel for more details."
      );
    }

    return false;
  }

  // TODO: do all in parallel
  let result = await generatePackageSwift(projectFolder, projectName);
  if (!result) {
    Logger.debug(
      LoggerSource.projectSwift,
      "Failed to generate Package.swift file"
    );

    return false;
  }

  result = await generateBuildSh(projectFolder);
  if (!result) {
    Logger.debug(LoggerSource.projectSwift, "Failed to generate build.sh file");

    return false;
  }

  result = await generateGitIgnore(projectFolder);
  if (!result) {
    Logger.debug(
      LoggerSource.projectSwift,
      "Failed to generate .gitignore file"
    );

    return false;
  }

  result = await generateSourceMain(projectFolder, projectName);
  if (!result) {
    Logger.debug(
      LoggerSource.projectSwift,
      "Failed to generate main swift file"
    );

    return false;
  }

  return true;
}
