// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from "path";
import * as vscode from "vscode";

import * as extension from "../extension";
import * as telemetry from "../telemetry-helper";
import * as utils from "../utils";

// tslint:disable-next-line: export-name
export async function setup(context: vscode.ExtensionContext) {
    const reporter = telemetry.getReporter(context);
    reporter.sendTelemetryCommand(extension.Commands.Roslaunch);

    const terminal = await prepareroslaunch();
    terminal.show();
}

async function prepareroslaunch(): Promise<vscode.Terminal> {
    const packages = utils.getPackages();
    const packageName = await vscode.window.showQuickPick(packages.then(Object.keys), {
        placeHolder: "Choose a package",
    });
    if (packageName) {
        const launchFiles = await utils.findPackageLaunchFiles(packageName);
        const launchFileBasenames = launchFiles.map((filename) => path.basename(filename));
        const target = await vscode.window.showQuickPick(launchFileBasenames, {
            placeHolder: "Choose a launch file",
        });
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
