// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from "path";
import * as vscode from "vscode";

import * as extension from "../extension";
import * as telemetry from "../telemetry-helper";
import * as utils from "./utils";

export async function roslaunch(context: vscode.ExtensionContext) {
    const reporter = telemetry.getReporter(context);
    reporter.sendTelemetryCommand(extension.Commands.Roslaunch);

    const terminal = await prepareroslaunch();
    terminal.show();
}

async function prepareroslaunch(): Promise<vscode.Terminal> {
    const pickPackageOptions: vscode.QuickPickOptions = {
        placeHolder: "Choose a package",
    };

    const getPackages = utils.getPackages();
    const packageName = await vscode.window.showQuickPick(getPackages.then((packages) => {
        return Array.from(packages.keys());
    }), pickPackageOptions);

    if (packageName) {
        const pickLaunchFileOptions: vscode.QuickPickOptions = {
            placeHolder: "Choose a launch file",
        };

        const launchFiles = await utils.findPackageLaunchFiles(packageName);
        const launchFileBasenames = launchFiles.map((filename) => {
            return path.basename(filename);
        });
        const target = await vscode.window.showQuickPick(launchFileBasenames, pickLaunchFileOptions);
        const argument = await vscode.window.showInputBox({
            placeHolder: "Enter any extra arguments",
        });
        const terminal = vscode.window.createTerminal({
            env: extension.env,
            name: "roslaunch",
        });
        terminal.sendText(`roslaunch ${launchFiles[launchFileBasenames.indexOf(target)]} ${argument}`);
        return terminal;
    } else {
        // none of the packages selected, error!
    }
}

export async function rosrun(context: vscode.ExtensionContext) {
    const reporter = telemetry.getReporter(context);
    reporter.sendTelemetryCommand(extension.Commands.Rosrun);

    const terminal = await preparerosrun();
    terminal.show();
}

async function preparerosrun(): Promise<vscode.Terminal> {
    const pickPackageOptions: vscode.QuickPickOptions = {
        placeHolder: "Choose a package",
    };

    const getPackages = utils.getPackages();
    const packageName = await vscode.window.showQuickPick(getPackages.then((packages) => {
        return Array.from(packages.keys());
    }), pickPackageOptions);

    if (packageName) {
        const pickExecutableOptions: vscode.QuickPickOptions = {
            placeHolder: "Choose an executable",
        };

        const findExecutables = utils.findPackageExecutables(packageName).then((files) => {
            return files.map((file) => {
                return path.basename(file);
            });
        });
        const target = await vscode.window.showQuickPick(findExecutables, pickExecutableOptions);
        const argument = await vscode.window.showInputBox({
            placeHolder: "Enter any extra arguments",
        });
        const terminal = vscode.window.createTerminal({
            env: extension.env,
            name: "rosrun",
        });
        terminal.sendText(`rosrun ${packageName} ${target} ${argument}`);
        return terminal;
    } else {
        // none of the packages selected, error!
    }
}
