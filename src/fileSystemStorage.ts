import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface FileGroup {
    name: string;
    files: string[];
    branch?: string;
}

export class FileSystemStorageService {
    private projectPath: string;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
        this.ensureStorageDirectory();
    }

    /**
     * Checks if groups exist in the file system for a specific branch
     */
    async hasGroups(branch: string): Promise<boolean> {
        const filePath = this.getStoragePath(branch);
        return fs.existsSync(filePath);
    }

    private ensureStorageDirectory(): void {
        const groupiDir = path.join(this.projectPath, '.groupi');
        if (!fs.existsSync(groupiDir)) {
            try {
                fs.mkdirSync(groupiDir, { recursive: true });
                console.log(`Created .groupi directory at ${groupiDir}`);
            } catch (error) {
                console.error(`Failed to create .groupi directory: ${error}`);
                vscode.window.showErrorMessage('Failed to create storage directory for groups');
            }
        }
    }

    private getStoragePath(branch: string): string {
        return path.join(this.projectPath, '.groupi', `groups.${branch}.json`);
    }

    async saveGroups(groups: FileGroup[], branch: string): Promise<void> {
        if (!branch || !this.projectPath) {
            console.error('Cannot save groups: missing branch or project path');
            return;
        }

        try {
            const filePath = this.getStoragePath(branch);
            await fs.promises.writeFile(filePath, JSON.stringify(groups, null, 2));
            console.log(`Saved ${groups.length} groups to ${filePath}`);
        } catch (error) {
            console.error(`Error saving groups to file: ${error}`);
            vscode.window.showErrorMessage('Failed to save groups to workspace file');
        }
    }

    async loadGroups(branch: string): Promise<FileGroup[]> {
        if (!branch || !this.projectPath) {
            console.error('Cannot load groups: missing branch or project path');
            return [];
        }

        const filePath = this.getStoragePath(branch);

        if (!fs.existsSync(filePath)) {
            console.log(`No groups file found for branch ${branch}`);
            return [];
        }

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const groups = JSON.parse(content) as FileGroup[];
            console.log(`Loaded ${groups.length} groups from ${filePath}`);

            // Filter out files that no longer exist
            return groups.map(group => ({
                ...group,
                files: group.files.filter(file => {
                    try {
                        return fs.existsSync(file);
                    } catch {
                        return false;
                    }
                })
            }));
        } catch (error) {
            console.error(`Error loading groups from file: ${error}`);
            vscode.window.showErrorMessage('Failed to load groups from workspace file');
            return [];
        }
    }

    async migrateFromGlobalState(context: vscode.ExtensionContext, storageKey: string, projectPath: string, branch: string): Promise<boolean> {
        try {
            const key = `${storageKey}.${projectPath || 'default'}.${branch}`;
            const savedGroups = context.globalState.get<FileGroup[]>(key, []);

            if (savedGroups.length === 0) {
                console.log(`No groups to migrate for branch ${branch}`);
                return false;
            }

            await this.saveGroups(savedGroups, branch);
            console.log(`Migrated ${savedGroups.length} groups from VS Code storage to file system`);

            // Clear the old storage
            await context.globalState.update(key, undefined);

            return true;
        } catch (error) {
            console.error(`Migration error: ${error}`);
            return false;
        }
    }
}
