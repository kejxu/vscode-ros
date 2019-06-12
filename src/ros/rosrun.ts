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
    reporter.sendTelemetryCommand(extension.Commands.Rosrun);

    const terminal = await preparerosrun();
    terminal.show();
}

async function preparerosrun(): Promise<vscode.Terminal> {
    const packages = utils.getPackages();
    const packageName = await vscode.window.showQuickPick(packages.then(Object.keys), {
        placeHolder: "Choose a package",
    });
    if (packageName) {
        let executables: string[];
        utils.findPackageExecutables(packageName).then((files) => {
            executables = files.map((file) => {
                return path.basename(file);
            });
        });

        // const executables = utils.findPackageExecutables(packageName).then(basenames);
        const target = await vscode.window.showQuickPick(executables, {
            placeHolder: "Choose an executable",
        });
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
