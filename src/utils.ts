// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from "path";
import * as vscode from "vscode";

export interface IPackageInfo {
    aiKey: string;
    name: string;
    version: string;
}

export function getExtensionConfiguration(): vscode.WorkspaceConfiguration {
    const rosConfigurationName: string = "ros";
    return vscode.workspace.getConfiguration(rosConfigurationName);
}

export function getPackageInfo(context: vscode.ExtensionContext): IPackageInfo {
    const metadataFile: string = "package.json";

    // tslint:disable-next-line: non-literal-require
    const extensionMetadata = require(path.join(context.extensionPath, metadataFile));
    if ("name" in extensionMetadata &&
        "version" in extensionMetadata &&
        "aiKey" in extensionMetadata) {
        return {
            aiKey: extensionMetadata.aiKey,
            name: extensionMetadata.name,
            version: extensionMetadata.version,
        };
    }
    return undefined;
}
