import * as vscode from 'vscode';

export class InstructionToggleService {
    private _statusBarItem: vscode.StatusBarItem;
    private _enabled: boolean;

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this._enabled = vscode.workspace.getConfiguration('groupi').get('copilotInstructions.enabled', true);
        this.updateStatusBar();
        this._statusBarItem.show();
    }

    public toggle() {
        this._enabled = !this._enabled;
        // Update our configuration
        vscode.workspace.getConfiguration('groupi').update(
            'copilotInstructions.enabled',
            this._enabled,
            vscode.ConfigurationTarget.Global
        ).then(() => {
            // Sync with Copilot's setting
            vscode.workspace.getConfiguration().update(
                'github.copilot.chat.codeGeneration.useInstructionFiles',
                this._enabled,
                vscode.ConfigurationTarget.Global
            );
        });
        this.updateStatusBar();
    }

    private updateStatusBar() {
        this._statusBarItem.text = this._enabled ? 
            "$(copilot) On" : 
            "$(copilot) Off";
        this._statusBarItem.tooltip = "Copilot-instructions";
        this._statusBarItem.command = 'groupi.toggleInstructions';
    }

    public isEnabled(): boolean {
        return this._enabled;
    }

    public dispose() {
        this._statusBarItem.dispose();
    }
}
