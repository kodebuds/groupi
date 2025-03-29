import * as vscode from 'vscode';
import * as path from 'path';
import { InstructionToggleService } from './instructionToggle';
import { FileGroup, FileSystemStorageService } from './fileSystemStorage';

// 1. Update FileGroupItem class
class FileGroupItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly isGroup: boolean,
        public readonly fullPath?: string,
        public readonly parent?: string // Add parent tracking
    ) {
        super(
            label,
            isGroup ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
        );

        this.contextValue = isGroup ? 'group' : 'file';

        if (isGroup) {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (fullPath) {
            this.label = path.basename(fullPath);
            this.resourceUri = vscode.Uri.file(fullPath);
            this.tooltip = fullPath;
        }
    }
}

class FileGroupProvider implements vscode.TreeDataProvider<FileGroupItem>, vscode.TreeDragAndDropController<FileGroupItem> {
    private groups: FileGroup[] = [];
    private _onDidChangeTreeData = new vscode.EventEmitter<FileGroupItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private currentBranch: string | undefined;
    private storageKey = 'groupi.projectGroups';
    private projectPath: string | undefined;
    private selectedItems: Set<string> = new Set();
    private fileSystemStorage: FileSystemStorageService | undefined;

    public getCurrentBranchName(): string | undefined {
        return this.currentBranch;
    }

    public setCurrentBranch(branch: string) {
        this.currentBranch = branch;
    }

    constructor(private context: vscode.ExtensionContext) {
        this.projectPath = this.getProjectPath();
        if (this.projectPath) {
            this.fileSystemStorage = new FileSystemStorageService(this.projectPath);
        }
        this.loadState();
        this.selectedItems = new Set();
    }

    private getProjectPath(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    private getStorageKey(): string {
        const project = this.projectPath || 'default';
        const branch = this.currentBranch || 'default';
        return `${this.storageKey}.${project}.${branch}`;
    }

    async loadState() {
        const branch = await this.getCurrentBranch();
        const previousBranch = this.currentBranch;
        this.currentBranch = branch;

        if (!branch || !this.projectPath) {
            console.error('Cannot load state: missing branch or project path');
            return;
        }

        let savedGroups: FileGroup[] = [];

        // Try to load from file system first
        if (this.fileSystemStorage) {
            savedGroups = await this.fileSystemStorage.loadGroups(branch);
        }

        // If no groups found in file system, try to load from VS Code storage and migrate
        if (savedGroups.length === 0) {
            const storageKey = this.getStorageKey();
            const vsCodeGroups = this.context.globalState.get<FileGroup[]>(storageKey, []);

            if (vsCodeGroups.length > 0 && this.fileSystemStorage) {
                // Migrate groups from VS Code storage to file system
                const migrated = await this.fileSystemStorage.migrateFromGlobalState(
                    this.context,
                    this.storageKey,
                    this.projectPath,
                    branch
                );

                if (migrated) {
                    savedGroups = vsCodeGroups;
                    vscode.window.showInformationMessage(
                        `Migrated ${savedGroups.length} groups to workspace storage for better portability`
                    );
                }
            }
        }

        // Update groups and notify view
        this.groups = savedGroups;
        this._onDidChangeTreeData.fire(undefined);

        // Show notification only when actually switching branches
        if (previousBranch !== branch) {
            if (this.groups.length > 0) {
                vscode.window.showInformationMessage(
                    `Loaded ${this.groups.length} groups from branch: ${branch}`
                );
            }
        }
    }

    private async saveState() {
        if (!this.currentBranch || !this.projectPath) {
            console.error('Cannot save state: missing branch or project path');
            return;
        }

        // Save groups with branch info
        const groupsToSave = this.groups.map(group => ({
            ...group,
            branch: this.currentBranch
        }));

        // Save to file system if available
        if (this.fileSystemStorage) {
            await this.fileSystemStorage.saveGroups(groupsToSave, this.currentBranch);
        } else {
            // Fallback to VS Code storage if file system storage is not available
            const project = this.projectPath || 'default';
            const key = `${this.storageKey}.${project}.${this.currentBranch}`;
            await this.context.globalState.update(key, groupsToSave);
            console.log(`Saved ${groupsToSave.length} groups to VS Code storage for branch: ${this.currentBranch}`);
        }
    }

    // Add drag and drop support
    dropMimeTypes = ['application/vnd.code.tree.fileGroups', 'text/uri-list'];
    dragMimeTypes = ['text/uri-list'];

    // Handle drag
    async handleDrag(items: FileGroupItem[], dataTransfer: vscode.DataTransfer) {
        const uris: vscode.Uri[] = [];
        let groupName: string | undefined;

        // Track if we're dragging a group to handle it specially
        let isDraggingGroup = false;

        items.forEach(item => {
            if (item.isGroup) {
                isDraggingGroup = true;
                groupName = item.label;
                // If dragging a group, get all files from that group
                const group = this.groups.find(g => g.name === item.label);
                if (group) {
                    group.files.forEach(filePath => {
                        try {
                            if (require('fs').existsSync(filePath)) {
                                uris.push(vscode.Uri.file(filePath));
                            }
                        } catch (error) {
                            console.error(`Failed to create URI for path: ${filePath}`, error);
                        }
                    });
                }
            } else if (!item.isGroup && item.fullPath) {
                uris.push(vscode.Uri.file(item.fullPath));
            }
        });

        console.log(`Dragging ${uris.length} files ${isDraggingGroup ? `from group ${groupName}` : ''}`);

        if (uris.length > 0) {
            try {
                // Format URI list properly for standard file drag operations
                // This format is crucial for proper recognition by drop targets
                const uriStrings = uris.map(uri => uri.toString()).join('\r\n');
                dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uriStrings));

                // VS Code specific format as array
                dataTransfer.set('application/vnd.code.tree.fileGroups', new vscode.DataTransferItem(uris));

                // For groups, add metadata about the group being dragged
                if (isDraggingGroup) {
                    // Use a simple object that can be safely serialized
                    const groupInfo = {
                        isGroup: true,
                        fileCount: uris.length,
                        groupName: groupName
                    };
                    dataTransfer.set('application/vnd.groupi.group', new vscode.DataTransferItem(groupInfo));

                    // Add plain text format for GitHub Copilot and other targets
                    const plainTextPaths = uris.map(uri => uri.fsPath).join('\n');
                    dataTransfer.set('text/plain', new vscode.DataTransferItem(`Group: ${groupName}\nFiles:\n${plainTextPaths}`));

                    // Add file contents for Copilot (use separate async operation to avoid blocking UI)
                    this.addFileContentsForCopilot(uris, dataTransfer, groupName);
                } else {
                    // For single files, just add the path as text/plain
                    const plainTextPaths = uris.map(uri => uri.fsPath).join('\n');
                    dataTransfer.set('text/plain', new vscode.DataTransferItem(plainTextPaths));
                }
            } catch (error) {
                console.error('Error in handleDrag:', error);
            }
        }
    }

    // Helper method to read file contents for Copilot
    private async addFileContentsForCopilot(uris: vscode.Uri[], dataTransfer: vscode.DataTransfer, groupName?: string): Promise<void> {
        try {
            const fileContents = await Promise.all(uris.map(async (uri) => {
                try {
                    const document = await vscode.workspace.openTextDocument(uri);
                    return {
                        name: path.basename(uri.fsPath),
                        content: document.getText()
                    };
                } catch (error) {
                    console.error(`Failed to read file: ${uri.fsPath}`, error);
                    return null;
                }
            }));

            // Filter out failed reads and create content string
            const validContents = fileContents.filter((item): item is { name: string; content: string } => item !== null);

            if (validContents.length > 0) {
                let copilotData = '';

                if (groupName) {
                    copilotData = `Group: ${groupName}\n\n`;
                }

                copilotData += validContents.map(file =>
                    `File: ${file.name}\n\n\`\`\`\n${file.content}\n\`\`\`\n\n`
                ).join('---\n\n');

                dataTransfer.set('application/vnd.groupi.copilot', new vscode.DataTransferItem(copilotData));
            }
        } catch (error) {
            console.error('Error preparing file contents for Copilot:', error);
        }
    }

    // Handle drop
    async handleDrop(target: FileGroupItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('text/uri-list');
        if (!transferItem) {
            return;
        }

        let targetGroup: string;
        let uris: vscode.Uri[] = [];

        try {
            // Handle different types of drag sources
            if (Array.isArray(transferItem.value)) {
                uris = transferItem.value;
            } else if (transferItem.value instanceof vscode.Uri) {
                uris = [transferItem.value];
            } else {
                // Parse file paths from drag and drop
                const content = transferItem.value.toString();
                const paths = content.split('\n')
                    .filter((p: string) => p.trim())
                    .map((p: string) => {
                        // Handle various URI formats
                        try {
                            if (p.startsWith('file://')) {
                                return vscode.Uri.parse(p.trim());
                            } else {
                                // Handle encoded file paths
                                const decodedPath = decodeURIComponent(p.replace('file://', '').trim());
                                return vscode.Uri.file(decodedPath);
                            }
                        } catch (error) {
                            console.error('Failed to parse path:', p, error);
                            return null;
                        }
                    })
                    .filter((uri: unknown): uri is vscode.Uri => uri !== null);
                uris = paths;
            }
        } catch (error) {
            console.error('Failed to parse drag data:', error);
            vscode.window.showErrorMessage('Failed to process dragged files');
            return;
        }

        if (!uris.length) {
            return;
        }

        // Handle drop target
        if (!target) {
            const name = await vscode.window.showInputBox({
                prompt: 'Enter new group name for dropped files',
                placeHolder: 'New Group'
            });
            if (!name) { return; }

            this.addGroup(name);
            targetGroup = name;
        } else if (target.isGroup) {
            targetGroup = target.label;
        } else {
            const parentGroup = this.getParentGroup(target.fullPath!);
            if (!parentGroup) { return; }
            targetGroup = parentGroup;
        }

        // Add files to group with error handling
        let successCount = 0;
        let errorCount = 0;

        for (const uri of uris) {
            if (token.isCancellationRequested) { break; }

            try {
                const filePath = uri.fsPath;
                const exists = await this.checkFileExists(filePath);

                if (exists) {
                    this.addFileToGroup(targetGroup, filePath);
                    successCount++;
                } else {
                    console.warn(`File not found: ${filePath}`);
                    errorCount++;
                }
            } catch (error) {
                console.error(`Failed to add file ${uri.fsPath}:`, error);
                errorCount++;
            }
        }

        // Show results
        if (successCount > 0) {
            vscode.window.showInformationMessage(
                `Added ${successCount} file${successCount !== 1 ? 's' : ''} to group "${targetGroup}"`
            );
        }
        if (errorCount > 0) {
            vscode.window.showWarningMessage(
                `Failed to add ${errorCount} file${errorCount !== 1 ? 's' : ''}`
            );
        }
    }

    private async checkFileExists(filePath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
        } catch {
            return false;
        }
    }

    getTreeItem(element: FileGroupItem): FileGroupItem {
        const item = element;

        // Add selection state and double-click behavior
        if (this.selectedItems.has(this.getItemKey(element))) {
            item.contextValue = (item.contextValue || '') + ' selected';
            if (item.isGroup) {
                item.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('list.activeSelectionForeground'));
            } else {
                item.resourceUri = vscode.Uri.file(item.fullPath || '');
                // Add double-click command for files
                item.command = {
                    command: 'groupi.openFile',
                    title: 'Open File',
                    arguments: [item.fullPath]
                };
            }
        }

        return item;
    }

    private getItemKey(item: FileGroupItem): string {
        return item.isGroup ? `group:${item.label}` : `file:${item.fullPath}`;
    }

    toggleSelection(item: FileGroupItem, multiSelect: boolean = false) {
        const key = this.getItemKey(item);

        if (!multiSelect) {
            // Single selection - clear other selections
            this.selectedItems.clear();
        }

        if (this.selectedItems.has(key)) {
            this.selectedItems.delete(key);
        } else {
            this.selectedItems.add(key);
        }

        this._onDidChangeTreeData.fire(undefined);
    }

    getSelectedItems(): FileGroupItem[] {
        return Array.from(this.selectedItems).map(key => {
            const [type, ...parts] = key.split(':');
            const value = parts.join(':');

            if (type === 'group') {
                return new FileGroupItem(value, true);
            } else {
                return new FileGroupItem(path.basename(value), false, value);
            }
        });
    }
    getChildren(element?: FileGroupItem): FileGroupItem[] {
        if (!element) {
            // Root level - return groups
            return this.groups.map(g => new FileGroupItem(
                g.name,
                true
            ));
        } else if (element.isGroup) {
            // Group level - return files with parent reference
            const group = this.groups.find(g => g.name === element.label);
            return group ? group.files.map(f => new FileGroupItem(
                path.basename(f),
                false,
                f,
                element.label // Pass group name as parent
            )) : [];
        }
        return [];
    }

    addGroup(name: string) {
        this.groups.push({ name, files: [], branch: this.currentBranch });
        this._onDidChangeTreeData.fire(undefined);
        this.saveState();
    }

    addFileToGroup(groupName: string, filePath: string) {
        console.log(`Adding file ${filePath} to group ${groupName}`); // Debug log
        const group = this.groups.find(g => g.name === groupName);
        if (group && !group.files.includes(filePath)) {
            group.files.push(filePath);
            this._onDidChangeTreeData.fire(undefined);
            this.saveState();
            console.log(`Group ${groupName} now has ${group.files.length} files`); // Debug log
        }
    }

    removeGroup(name: string) {
        const index = this.groups.findIndex(g => g.name === name);
        if (index !== -1) {
            this.groups.splice(index, 1);
            this._onDidChangeTreeData.fire(undefined);
            this.saveState();
        }
    }

    removeFileFromGroup(groupName: string, filePath: string) {
        const group = this.groups.find(g => g.name === groupName);
        if (group) {
            const index = group.files.indexOf(filePath);
            if (index !== -1) {
                group.files.splice(index, 1);
                this._onDidChangeTreeData.fire(undefined);
                this.saveState();
            }
        }
    }

    getParentGroup(filePath: string): string | undefined {
        for (const group of this.groups) {
            if (group.files.includes(filePath)) {
                return group.name;
            }
        }
        return undefined;
    }

    updateGroupName(oldName: string, newName: string) {
        const group = this.groups.find(g => g.name === oldName);
        if (group) {
            group.name = newName;
            this._onDidChangeTreeData.fire(undefined);
            this.saveState();
        }
    }

    getOrCreateGroup(name: string): string {
        const existingGroup = this.groups.find(g => g.name === name);
        if (!existingGroup) {
            this.addGroup(name);
        }
        return name;
    }

    public async getGitAPI() {
        try {
            const extension = vscode.extensions.getExtension('vscode.git');
            if (!extension) {
                return undefined;
            }

            const gitExtension = extension.isActive ? extension.exports : await extension.activate();
            return gitExtension?.getAPI(1);
        } catch (error) {
            console.error('Failed to get Git API:', error);
            return undefined;
        }
    }

    async getCurrentBranch(): Promise<string | undefined> {
        try {
            const api = await this.getGitAPI();
            const repo = api?.repositories[0];
            return repo?.state.HEAD?.name || 'master';
        } catch (error) {
            console.error('Failed to get current branch:', error);
            return 'master';
        }
    }

    private async getAllBranches(): Promise<string[]> {
        try {
            const api = await this.getGitAPI();
            const repo = api?.repositories[0];
            if (!repo) {
                return [];
            }

            // Use getRefs() instead of deprecated state.refs
            const refs = await repo.getRefs();
            const branches = refs
                .filter((ref: { type: number, name?: string }) => ref.type === 0 || ref.type === 1) // Include both local and remote branches
                .map((ref: { type: number, name?: string }) => ref.name!)
                .filter(Boolean);

            console.log('Available branches:', branches);
            return branches;
        } catch (error) {
            console.error('Failed to get branches:', error);
            return [];
        }
    }

    private async getGroupsFromBranch(branch: string): Promise<FileGroup[]> {
        try {
            // Try to get groups from file system first
            if (this.fileSystemStorage) {
                const groups = await this.fileSystemStorage.loadGroups(branch);
                if (groups.length > 0) {
                    console.log(`Found ${groups.length} groups in branch ${branch} from file system`);
                    return groups;
                }
            }

            // Fallback to VS Code storage
            const project = this.projectPath || 'default';
            const key = `${this.storageKey}.${project}.${branch}`;
            const groups = this.context.globalState.get<FileGroup[]>(key, []);
            console.log(`Found ${groups.length} groups in branch ${branch} from VS Code storage`);
            return groups;
        } catch (error) {
            console.error(`Error getting groups from branch ${branch}:`, error);
            return [];
        }
    }

    async copyGroupsFromBranch(sourceBranch: string) {
        const sourceGroups = await this.getGroupsFromBranch(sourceBranch);
        if (sourceGroups.length === 0) {
            vscode.window.showInformationMessage(`No groups found in branch: ${sourceBranch}`);
            return;
        }

        // Let user select which groups to copy
        const selectedGroups = await vscode.window.showQuickPick(
            sourceGroups.map(g => ({
                label: g.name,
                detail: `${g.files.length} files`,
                group: g
            })),
            {
                canPickMany: true,
                placeHolder: 'Select groups to copy from ' + sourceBranch
            }
        );

        if (!selectedGroups || selectedGroups.length === 0) { return; }

        // Add selected groups to current branch
        selectedGroups.forEach(selection => {
            const group = selection.group;
            // Avoid duplicate group names
            const newName = this.groups.find(g => g.name === group.name)
                ? `${group.name} (from ${sourceBranch})`
                : group.name;

            this.groups.push({
                ...group,
                name: newName,
                branch: this.currentBranch
            });
        });

        await this.saveState();
        this._onDidChangeTreeData.fire(undefined);
        vscode.window.showInformationMessage(
            `Copied ${selectedGroups.length} groups from ${sourceBranch}`
        );
    }

    private async getBranchesWithGroups(): Promise<string[]> {
        try {
            // Get all Git branches
            const allBranches = await this.getAllBranches();
            console.log('Checking groups in branches:', allBranches);

            // Filter branches that have groups
            const branchesWithGroups = [];

            for (const branch of allBranches) {
                // Check file system storage first
                if (this.fileSystemStorage) {
                    const groups = await this.fileSystemStorage.loadGroups(branch);
                    if (groups.length > 0) {
                        branchesWithGroups.push(branch);
                        continue;
                    }
                }

                // Fallback to VS Code storage
                const key = `${this.storageKey}.${this.projectPath || 'default'}.${branch}`;
                const groups = this.context.globalState.get<FileGroup[]>(key, []);
                if (groups.length > 0) {
                    branchesWithGroups.push(branch);
                }
            }

            console.log('Branches with groups:', branchesWithGroups);
            return branchesWithGroups;

        } catch (error) {
            console.error('Error getting branches with groups:', error);
            return [];
        }
    }

    private async ensureGitExtension(): Promise<void> {
        const extension = vscode.extensions.getExtension('vscode.git');
        if (!extension) {
            throw new Error('Git extension is not installed');
        }
        if (!extension.isActive) {
            await extension.activate();
        }
    }

    async syncWithBranch() {
        try {
            await this.ensureGitExtension();
            const newBranch = await this.getCurrentBranch();

            if (!newBranch) {
                console.error('No branch detected');
                return;
            }

            console.log(`Syncing from ${this.currentBranch} to ${newBranch}`);

            // Save current groups to current branch before switching
            if (this.currentBranch && this.groups.length > 0) {
                await this.saveState();
                console.log(`Saved ${this.groups.length} groups to branch ${this.currentBranch}`);
            }

            // Clear current groups before loading new branch
            this.groups = [];
            this.currentBranch = newBranch;

            // Load groups from new branch
            let branchGroups: FileGroup[] = [];

            // Try to load from file system first
            if (this.fileSystemStorage) {
                branchGroups = await this.fileSystemStorage.loadGroups(newBranch);
            }

            // If no groups found in file system, try to load from VS Code storage
            if (branchGroups.length === 0) {
                const newKey = `${this.storageKey}.${this.projectPath || 'default'}.${newBranch}`;
                branchGroups = this.context.globalState.get<FileGroup[]>(newKey, []);

                // If groups found in VS Code storage, migrate them to file system
                if (branchGroups.length > 0 && this.fileSystemStorage) {
                    await this.fileSystemStorage.migrateFromGlobalState(
                        this.context,
                        this.storageKey,
                        this.projectPath || 'default',
                        newBranch
                    );
                }
            }

            if (branchGroups && branchGroups.length > 0) {
                console.log(`Loading ${branchGroups.length} groups from branch ${newBranch}`);

                // Update branch reference
                this.groups = branchGroups.map(group => ({
                    ...group,
                    branch: newBranch
                }));
            }

            this._onDidChangeTreeData.fire(undefined);
            vscode.window.showInformationMessage(
                `Switched to branch "${newBranch}" (${this.groups.length} groups)`
            );

        } catch (error) {
            console.error('Error in syncWithBranch:', error);
            vscode.window.showErrorMessage('Failed to sync branch groups');
        }
    }

    async copyGroupFromBranch() {
        try {
            const currentBranch = await this.getCurrentBranch();
            console.log(`Current branch: ${currentBranch}`);

            // Get branches with groups
            const branchesWithGroups = await this.getBranchesWithGroups();
            console.log(`Branches with groups: ${branchesWithGroups.join(', ')}`);

            if (branchesWithGroups.length === 0) {
                vscode.window.showInformationMessage('No groups found in other branches');
                return;
            }

            // Let user select source branch
            const selectedBranch = await vscode.window.showQuickPick(
                await Promise.all(branchesWithGroups.map(async branch => {
                    const groups = await this.getGroupsFromBranch(branch);
                    return {
                        label: branch,
                        description: `${groups.length} groups`,
                        detail: groups
                            .map(g => `${g.name} (${g.files.length} files)`)
                            .join(', ')
                    };
                })),
                {
                    placeHolder: 'Select branch to copy groups from',
                    title: 'Copy Groups from Branch'
                }
            );

            if (!selectedBranch) { return; }

            const sourceGroups = await this.getGroupsFromBranch(selectedBranch.label);
            const duplicateGroups = sourceGroups.filter(g =>
                this.groups.some(existing => existing.name === g.name)
            );

            // Let user select which groups to copy
            const selectedGroups = await vscode.window.showQuickPick(
                sourceGroups.map(g => ({
                    label: g.name,
                    description: `${g.files.length} files`,
                    detail: duplicateGroups.includes(g) ? 'Will be renamed' : 'Will be copied as is',
                    group: g
                })),
                {
                    canPickMany: true,
                    placeHolder: 'Select groups to copy'
                }
            );

            if (!selectedGroups || selectedGroups.length === 0) { return; }

            // Handle duplicates if they exist
            if (duplicateGroups.length > 0) {
                const choice = await vscode.window.showWarningMessage(
                    `${duplicateGroups.length} group(s) already exist. How would you like to proceed?`,
                    'Rename Duplicates',
                    'Skip Duplicates',
                    'Cancel'
                );

                if (choice === 'Cancel') {
                    return;
                }

                // Process selected groups based on user choice
                selectedGroups.forEach(selection => {
                    const group = selection.group;
                    const isDuplicate = this.groups.some(g => g.name === group.name);

                    if (!isDuplicate || choice === 'Rename Duplicates') {
                        const newName = isDuplicate ?
                            `${group.name} (from ${selectedBranch.label})` :
                            group.name;

                        this.groups.push({
                            ...group,
                            name: newName,
                            branch: this.currentBranch
                        });
                    }
                });
            } else {
                // No duplicates, copy all selected groups
                selectedGroups.forEach(selection => {
                    this.groups.push({
                        ...selection.group,
                        branch: this.currentBranch
                    });
                });
            }

            await this.saveState();
            this._onDidChangeTreeData.fire(undefined);
            vscode.window.showInformationMessage(
                `Copied ${selectedGroups.length} groups from ${selectedBranch.label}`
            );

        } catch (error) {
            console.error('Error in copyGroupFromBranch:', error);
            vscode.window.showErrorMessage('Failed to copy groups from branch');
        }
    }

    async deleteAllGroups() {
        if (this.groups.length === 0) {
            vscode.window.showInformationMessage('No groups to delete');
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete all ${this.groups.length} groups?`,
            'Yes', 'No'
        );

        if (confirmation === 'Yes') {
            this.groups = [];
            await this.saveState();
            this._onDidChangeTreeData.fire(undefined);
            vscode.window.showInformationMessage('All groups have been deleted');
        }
    }

    async openAllFilesInGroup(groupName: string): Promise<void> {
        const group = this.groups.find(g => g.name === groupName);
        if (!group) {
            return;
        }

        let openedCount = 0;
        let errorCount = 0;

        for (const filePath of group.files) {
            try {
                const uri = vscode.Uri.file(filePath);
                await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(uri, {
                    preview: false,
                    preserveFocus: true,
                    viewColumn: vscode.ViewColumn.Active
                });
                openedCount++;
            } catch (error) {
                console.error(`Failed to open file: ${filePath}`, error);
                errorCount++;
            }
        }

        if (openedCount > 0) {
            vscode.window.showInformationMessage(
                `Opened ${openedCount} files from group "${groupName}"`
            );
        }
        if (errorCount > 0) {
            vscode.window.showWarningMessage(
                `Failed to open ${errorCount} files from group "${groupName}"`
            );
        }
    }
}

export async function registerCopilotDropTarget(context: vscode.ExtensionContext) {
    // Register command to handle drops on Copilot
    const disposable = vscode.commands.registerCommand('groupi.handleCopilotDrop', async (uris: vscode.Uri[]) => {
        if (!uris || uris.length === 0) {
            return;
        }

        try {
            // Read all file contents
            const fileContents = await Promise.all(uris.map(async (uri) => {
                const document = await vscode.workspace.openTextDocument(uri);
                return {
                    name: path.basename(uri.fsPath),
                    content: document.getText()
                };
            }));

            // Format content for Copilot
            const formattedContent = fileContents.map(file =>
                `File: ${file.name}\n\n${file.content}\n\n`
            ).join('---\n\n');

            // Send to Copilot chat
            await vscode.commands.executeCommand('github.copilot.chat.insertCodeBlock', formattedContent);

            vscode.window.showInformationMessage(`Added ${fileContents.length} files to Copilot chat`);
        } catch (error) {
            console.error('Error handling Copilot drop:', error);
            vscode.window.showErrorMessage('Failed to add files to Copilot chat');
        }
    });

    context.subscriptions.push(disposable);
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Groupi extension is now active!');

    const groupProvider = new FileGroupProvider(context);
    const treeView = vscode.window.createTreeView('fileGroups', {
        treeDataProvider: groupProvider,
        dragAndDropController: groupProvider,
        canSelectMany: true // Enable multi-select
    });

    // Add selection change handler
    treeView.onDidChangeSelection(e => {
        const shiftKey = e.selection.length > 1;
        e.selection.forEach(item => {
            groupProvider.toggleSelection(item, shiftKey);
        });
    });

    // Add double-click handler
    vscode.commands.registerCommand('list.itemClick', async (item: FileGroupItem) => {
        if (!item.isGroup && item.fullPath) {
            try {
                const uri = vscode.Uri.file(item.fullPath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: false
                });
            } catch (error) {
                console.error('Failed to open file:', error);
                vscode.window.showErrorMessage(`Failed to open file: ${item.fullPath}`);
            }
        }
    });

    let disposable = vscode.commands.registerCommand('groupi.createGroup', async () => {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter Groupi name',
            placeHolder: 'My Groupi'
        });
        if (name) {
            groupProvider.addGroup(name);
        }
    });

    context.subscriptions.push(
        disposable,
        treeView,
        vscode.commands.registerCommand('groupi.addToGroup', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const filePath = activeEditor.document.uri.fsPath;
                console.log('Adding file:', filePath); // Debug log

                const groups = Array.from(groupProvider.getChildren())
                    .filter((item): item is FileGroupItem => item instanceof FileGroupItem);

                let selectedGroup: { label: string, groupId: string } | undefined;

                if (groups.length === 0) {
                    const name = await vscode.window.showInputBox({
                        prompt: 'Create new group for file',
                        placeHolder: 'My Group'
                    });
                    if (name) {
                        selectedGroup = { label: name, groupId: name };
                        groupProvider.addGroup(name); // Create the group first
                    }
                } else {
                    selectedGroup = await vscode.window.showQuickPick(
                        groups.map(group => ({
                            label: group.label,
                            groupId: group.label
                        })),
                        { placeHolder: 'Select a group' }
                    );
                }

                if (selectedGroup) {
                    groupProvider.addFileToGroup(selectedGroup.groupId, filePath);
                    vscode.window.showInformationMessage(`Added ${path.basename(filePath)} to group ${selectedGroup.label}`);
                }
            }
        }),
        // 3. Update removeFromGroup command
        vscode.commands.registerCommand('groupi.removeFromGroup', async (item: FileGroupItem) => {
            if (item.isGroup) {
                const confirmation = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete group "${item.label}"?`,
                    'Yes', 'No'
                );
                if (confirmation === 'Yes') {
                    groupProvider.removeGroup(item.label);
                }
            } else if (item.fullPath && item.parent) {
                // Use parent group directly from item
                groupProvider.removeFileFromGroup(item.parent, item.fullPath);
            }
        }),
        vscode.commands.registerCommand('groupi.syncWithBranch', async () => {
            try {
                await groupProvider.syncWithBranch();
            } catch (error) {
                console.error('Error executing syncWithBranch command:', error);
                vscode.window.showErrorMessage('Failed to sync with branch');
            }
        }),
        vscode.commands.registerCommand('groupi.addAllToGroup', async () => {
            // Get all editor files (both visible and non-visible)
            const openEditors = vscode.workspace.textDocuments
                .filter(doc => !doc.isUntitled) // Filter out untitled files
                .map(doc => doc.uri.fsPath);

            // Remove duplicates
            const uniqueFiles = Array.from(new Set(openEditors));

            if (uniqueFiles.length === 0) {
                vscode.window.showErrorMessage('No files open in editor');
                return;
            }

            // Show confirmation with file count
            const confirmation = await vscode.window.showInformationMessage(
                `Found ${uniqueFiles.length} open files in editor. Add them to a group?`,
                'Yes', 'No'
            );

            if (confirmation !== 'Yes') {
                return;
            }

            const groups = groupProvider.getChildren().map(item => item.label);
            let groupName: string | undefined;

            if (groups.length === 0) {
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter new group name for open files',
                    placeHolder: 'Editor Files'
                });
                if (name) {
                    groupProvider.addGroup(name);
                    groupName = name;
                }
            } else {
                groupName = await vscode.window.showQuickPick(groups, {
                    placeHolder: `Select group to add ${uniqueFiles.length} editor files`
                });
            }

            if (groupName) {
                uniqueFiles.forEach(file => {
                    groupProvider.addFileToGroup(groupName!, file);
                });
                vscode.window.showInformationMessage(
                    `Added ${uniqueFiles.length} editor files to group "${groupName}"`
                );
            }
        }),
        vscode.commands.registerCommand('groupi.addAllOpenedFiles', async () => {
            // Get all tabs from all tab groups
            const allTabs: vscode.Uri[] = [];
            vscode.window.tabGroups.all.forEach(tabGroup => {
                tabGroup.tabs.forEach(tab => {
                    if (tab.input instanceof vscode.TabInputText) {
                        allTabs.push(tab.input.uri);
                    }
                });
            });

            if (allTabs.length === 0) {
                vscode.window.showInformationMessage('No opened files to add.');
                return;
            }

            // Get available groups
            const groups = groupProvider.getChildren().map(item => item.label);
            let selectedGroup: string | undefined;

            if (groups.length === 0) {
                // If no groups exist, create one
                const name = await vscode.window.showInputBox({
                    prompt: 'Enter new group name for opened files',
                    placeHolder: 'Opened Files'
                });
                if (name) {
                    groupProvider.addGroup(name);
                    selectedGroup = name;
                }
            } else {
                // Let user select from existing groups
                selectedGroup = await vscode.window.showQuickPick(
                    groups,
                    { placeHolder: `Select a group to add ${allTabs.length} files to` }
                );
            }

            if (selectedGroup) {
                // Add all files to the selected group
                allTabs.forEach(uri => {
                    groupProvider.addFileToGroup(selectedGroup!, uri.fsPath);
                });
                vscode.window.showInformationMessage(
                    `Added ${allTabs.length} files to group "${selectedGroup}"`
                );
            }
        }),
        // Add command to open file
        vscode.commands.registerCommand('groupi.openFile', async (filePath: string) => {
            try {
                if (!filePath) { return; }
                console.log('Opening file:', filePath);

                const uri = vscode.Uri.file(filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, {
                    preview: false,
                    preserveFocus: false
                });
            } catch (error) {
                console.error('Failed to open file:', error);
                vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
            }
        }),

        vscode.commands.registerCommand('groupi.copyPath', (item: FileGroupItem) => {
            if (item.fullPath) {
                vscode.env.clipboard.writeText(item.fullPath);
                vscode.window.showInformationMessage('Path copied to clipboard');
            }
        }),

        vscode.commands.registerCommand('groupi.copyRelativePath', (item: FileGroupItem) => {
            if (item.fullPath && vscode.workspace.workspaceFolders) {
                const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
                const relativePath = path.relative(workspaceFolder, item.fullPath);
                vscode.env.clipboard.writeText(relativePath);
                vscode.window.showInformationMessage('Relative path copied to clipboard');
            }
        }),

        vscode.commands.registerCommand('groupi.revealInFileExplorer', (item: FileGroupItem) => {
            if (item.fullPath) {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.fullPath));
            }
        }),

        vscode.commands.registerCommand('groupi.openInSplitEditor', async (item: FileGroupItem) => {
            if (item.fullPath) {
                const doc = await vscode.workspace.openTextDocument(item.fullPath);
                await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
            }
        }),

        vscode.commands.registerCommand('groupi.renameGroup', async (item: FileGroupItem) => {
            if (item.isGroup) {
                // Show input box with current name pre-filled
                const newName = await vscode.window.showInputBox({
                    prompt: 'Enter new group name',
                    value: item.label  // Current group name
                });

                if (newName) {
                    // Call the provider method to update the name
                    groupProvider.updateGroupName(item.label, newName);
                }
            }
        }),

        vscode.commands.registerCommand('groupi.copyGroupFromBranch', async () => {
            try {
                await groupProvider.copyGroupFromBranch();
            } catch (error) {
                console.error('Error executing copyGroupFromBranch command:', error);
                vscode.window.showErrorMessage('Failed to copy groups from branch');
            }
        }),
        vscode.commands.registerCommand('groupi.deleteAllGroups', async () => {
            await groupProvider.deleteAllGroups();
        }),
        vscode.commands.registerCommand('groupi.openAllFiles', async (item: FileGroupItem) => {
            if (item.isGroup) {
                try {
                    await groupProvider.openAllFilesInGroup(item.label);
                } catch (error) {
                    console.error('Error opening files:', error);
                    vscode.window.showErrorMessage('Failed to open files in group');
                }
            }
        }),
        // Add collapse command
        vscode.commands.registerCommand('groupi.collapseAll', () => {
            vscode.commands.executeCommand('workbench.actions.treeView.fileGroups.collapseAll');
        })
    );

    // Status bar item with copy icon(left side)
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'groupi.copyBranchName';
    statusBarItem.text = '$(copy)';
    statusBarItem.tooltip = 'Copy Branch Name';
    statusBarItem.show();

    // Sync status bar item (right side)
    const syncStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    syncStatusBarItem.command = 'groupi.syncWithBranch';
    syncStatusBarItem.text = '$(sync)';
    syncStatusBarItem.tooltip = "Sync Groups";
    syncStatusBarItem.show();

    // Register copy branch command
    let copyBranchDisposable = vscode.commands.registerCommand('groupi.copyBranchName', async () => {
        const git = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
        if (git) {
            const repo = git.repositories[0];
            if (repo) {
                const branchName = repo.state.HEAD?.name || '';
                if (branchName) {
                    await vscode.env.clipboard.writeText(branchName);
                    vscode.window.showInformationMessage(`Branch name "${branchName}" copied to clipboard!`);
                } else {
                    vscode.window.showWarningMessage('No active branch found');
                }
            }
        }
    });
    context.subscriptions.push(statusBarItem);
    context.subscriptions.push(copyBranchDisposable);

    // Initialize Git integration with proper branch monitoring
    try {
        const api = await groupProvider.getGitAPI();
        if (api?.repositories[0]) {
            const repo = api.repositories[0];
            // Initial load
            const initialBranch = await groupProvider.getCurrentBranch();
            if (initialBranch) {
                groupProvider.setCurrentBranch(initialBranch);
                await groupProvider.loadState();
            }

            // Monitor branch changes
            repo.state.onDidChange(async () => {
                const currentBranch = await groupProvider.getCurrentBranch();
                if (currentBranch && currentBranch !== groupProvider.getCurrentBranchName()) {
                    await groupProvider.syncWithBranch();
                }
            });
        }
    } catch (error) {
        console.error('Failed to initialize Git integration:', error);
    }

    // Add workspace folder change listener
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            groupProvider.loadState();
        })
    );

    const instructionToggle = new InstructionToggleService();
    context.subscriptions.push(instructionToggle);

    // Register the toggle command with the correct context variable
    let toggleCommand = vscode.commands.registerCommand('groupi.toggleInstructions', () => {
        instructionToggle.toggle();
        // Use the correct context variable for Copilot instructions
        vscode.commands.executeCommand('setContext', 'github.copilot.chat.codeGeneration.useInstructionFiles', instructionToggle.isEnabled());
    });
    context.subscriptions.push(toggleCommand);

    // Initialize the instruction state
    await vscode.commands.executeCommand(
        'setContext',
        'github.copilot.chat.codeGeneration.useInstructionFiles',
        instructionToggle.isEnabled()
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('github.copilot.chat.codeGeneration.useInstructionFiles')) {
                const enabled = vscode.workspace.getConfiguration().get('github.copilot.chat.codeGeneration.useInstructionFiles', true);
                if (enabled !== instructionToggle.isEnabled()) {
                    instructionToggle.toggle();
                }
            }
        })
    );

    // Register Copilot drop target
    await registerCopilotDropTarget(context);
}

// Helper function to add files to a group
export async function addToGroup(files: vscode.Uri | vscode.Uri[], groupName: string, provider: FileGroupProvider) {
    const uris = Array.isArray(files) ? files : [files];
    uris.forEach(uri => {
        provider.addFileToGroup(groupName, uri.fsPath);
    });
}

export function deactivate() {}
