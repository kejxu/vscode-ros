// Copyright (c) Andrew Short. All rights reserved.
// Licensed under the MIT License.

import * as path from "path";
import * as vscode from "vscode";

import * as cpp_formatter from "./cpp-formatter";
import * as pfs from "./promise-fs";
import * as telemetry from "./telemetry-helper";
import * as vscodeHelper from "./utils";

import * as catkin from "./catkin/catkin";

import * as ros_build_env from "./ros/build-env-utils";
import * as ros_cli from "./ros/cli";
import * as ros_core from "./ros/core-helper";
import * as ros_debug from "./ros/debug-config-provider";
import * as ros_utils from "./ros/utils";

/**
 * The catkin workspace base dir.
 */
export let baseDir: string;

export enum BuildSystem {
    None,
    CatkinMake,
    CatkinTools,
}

/**
 * The build system in use.
 */
export let buildSystem: BuildSystem;

/**
 * The sourced ROS environment.
 */
export let env: any;

const onEnvChanged = new vscode.EventEmitter<void>();

/**
 * Triggered when the env is soured.
 */
export let onDidChangeEnv = onEnvChanged.event;

/**
 * Subscriptions to dispose when the environment is changed.
 */
const subscriptions: vscode.Disposable[] = [];

export enum Commands {
    CreateCatkinPackage = "ros.createCatkinPackage",
    CreateTerminal = "ros.createTerminal",
    GetDebugSettings = "ros.getDebugSettings",
    Rosrun = "ros.rosrun",
    Roslaunch = "ros.roslaunch",
    ShowCoreStatus = "ros.showCoreStatus",
    StartRosCore = "ros.startCore",
    TerminateRosCore = "ros.stopCore",
    UpdateCppProperties = "ros.updateCppProperties",
    UpdatePythonPath = "ros.updatePythonPath",
}

export async function activate(context: vscode.ExtensionContext) {
    const reporter = telemetry.getReporter(context);

    // Activate if we're in a catkin workspace.
    await determineBuildSystem(vscode.workspace.rootPath);

    if (buildSystem === BuildSystem.None) {
        return;
    }

    // Activate components when the ROS env is changed.
    context.subscriptions.push(onDidChangeEnv(activateEnvironment.bind(null, context)));

    // Activate components which don't require the ROS env.
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(
        "cpp", new cpp_formatter.CppFormatter(),
    ));

    // Source the environment, and re-source on config change.
    let config = vscodeHelper.getExtensionConfiguration();

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        const updatedConfig = vscodeHelper.getExtensionConfiguration();
        const fields = Object.keys(config).filter((k) => !(config[k] instanceof Function));
        const changed = fields.some((key) => updatedConfig[key] !== config[key]);

        if (changed) {
            sourceRosAndWorkspace();
        }

        config = updatedConfig;
    }));

    sourceRosAndWorkspace();

    reporter.sendTelemetryActivate();
    return {
        getBaseDir: () => baseDir,
        getEnv: () => env,
        onDidChangeEnv: (listener: () => any, thisArg: any) => onDidChangeEnv(listener, thisArg),
    };
}

export function deactivate() {
    subscriptions.forEach((disposable) => {
        disposable.dispose();
    });
}

/**
 * Determines build system and workspace path in use by checking for unique
 * auto-generated files.
 */
async function determineBuildSystem(dir: string): Promise<void> {
    while (dir && path.dirname(dir) !== dir) {
        if (await pfs.exists(`${dir}/.catkin_workspace`)) {
            baseDir = dir;
            buildSystem = BuildSystem.CatkinMake;
            return;
        } else if (await pfs.exists(`${dir}/.catkin_tools`)) {
            baseDir = dir;
            buildSystem = BuildSystem.CatkinTools;
            return;
        }

        dir = path.dirname(dir);
    }

    buildSystem = BuildSystem.None;
}

/**
 * Activates components which require a ROS env.
 */
function activateEnvironment(context: vscode.ExtensionContext) {
    // Clear existing disposables.
    while (subscriptions.length > 0) {
        subscriptions.pop().dispose();
    }

    if (!env.ROS_ROOT) {
        return;
    }

    // Set up the master.
    const coreApi = new ros_core.XmlRpcApi(env.ROS_MASTER_URI);
    const coreStatusItem = new ros_core.StatusBarItem(coreApi);

    coreStatusItem.activate();

    subscriptions.push(coreStatusItem);
    subscriptions.push(vscode.workspace.registerTaskProvider("catkin", catkin.getCatkinTaskProvider()));
    subscriptions.push(vscode.debug.registerDebugConfigurationProvider("ros", ros_debug.getDebugConfigConfiguration()));

    // register plugin commands
    subscriptions.push(
        vscode.commands.registerCommand(Commands.CreateCatkinPackage, () => {
            catkin.createPackage(context);
        }),
        vscode.commands.registerCommand(Commands.CreateTerminal, () => {
            ros_utils.createTerminal(context);
        }),
        vscode.commands.registerCommand(Commands.GetDebugSettings, () => {
            ros_debug.getDebugSettings(context);
        }),
        vscode.commands.registerCommand(Commands.ShowCoreStatus, () => {
            ros_core.launchMonitor(context);
        }),
        vscode.commands.registerCommand(Commands.StartRosCore, () => {
            ros_core.startCore(context);
        }),
        vscode.commands.registerCommand(Commands.TerminateRosCore, () => {
            ros_core.stopCore(context, coreApi);
        }),
        vscode.commands.registerCommand(Commands.UpdateCppProperties, () => {
            ros_build_env.updateCppProperties(context);
        }),
        vscode.commands.registerCommand(Commands.UpdatePythonPath, () => {
            ros_build_env.updatePythonPath(context);
        }),
        vscode.commands.registerCommand(Commands.Rosrun, () => {
            ros_cli.rosrun(context);
        }),
        vscode.commands.registerCommand(Commands.Roslaunch, () => {
            ros_cli.roslaunch(context);
        }),
    );

    // Generate config files if they don't already exist.
    ros_build_env.createConfigFiles();
}

/**
 * Loads the ROS environment, and prompts the user to select a distro if required.
 */
async function sourceRosAndWorkspace(): Promise<void> {
    env = undefined;

    const config = vscodeHelper.getExtensionConfiguration();
    const distro = config.get("distro", "");
    let setupScriptExt: string;
    if (process.platform === "win32") {
        setupScriptExt = ".bat";
    } else {
        setupScriptExt = ".bash";
    }

    if (distro) {
        try {
            let globalInstallPath: string;
            if (process.platform === "win32") {
                globalInstallPath = path.join("C:", "opt", "ros", `${distro}`, "x64");
            } else {
                globalInstallPath = path.join("/", "opt", "ros", `${distro}`);
            }
            const setupScript: string = path.format({
                dir: globalInstallPath,
                ext: setupScriptExt,
                name: "setup",
            });
            env = await ros_utils.sourceSetupFile(setupScript, {});
        } catch (err) {
            vscode.window.showErrorMessage(`Could not source the setup file for ROS distro "${distro}".`);
        }
    } else if (process.env.ROS_ROOT) {
        env = process.env;
    } else {
        const message = "The ROS distro is not configured.";
        const configure = "Configure";

        if (await vscode.window.showErrorMessage(message, configure) === configure) {
            config.update("distro", await vscode.window.showQuickPick(ros_utils.getDistros()));
        }
    }

    // Source the workspace setup over the top.
    let workspaceDevelPath: string;
    workspaceDevelPath = path.join(`${baseDir}`, "devel_isolated");
    if (!await pfs.exists(workspaceDevelPath)) {
        workspaceDevelPath = path.join(`${baseDir}`, "devel");
    }
    const wsSetupScript: string = path.format({
        dir: workspaceDevelPath,
        ext: setupScriptExt,
        name: "setup",
    });

    if (env && env.ROS_ROOT && await pfs.exists(wsSetupScript)) {
        try {
            env = await ros_utils.sourceSetupFile(wsSetupScript, env);
        } catch (err) {
            vscode.window.showErrorMessage("Failed to source the workspace setup file.");
        }
    }

    // Notify listeners the environment has changed.
    onEnvChanged.fire();
}
