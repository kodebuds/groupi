# Groupi - Group Storage

## Overview

This directory contains the group data for your project when using workspace storage. Groups can be stored in JSON files within this `.groupi` directory, making them portable between different machines.

## Storage Options

Groupi supports two storage locations for your groups:

1. **Workspace Storage** (default): Groups are stored in this `.groupi` directory in your project
2. **VS Code Storage**: Groups are stored in VS Code's extension storage

You can change the storage location in VS Code settings:

1. Open VS Code settings (`Ctrl+,` or `Cmd+,`)
2. Search for "groupi storage"
3. Change the "Groupi > Storage: Location" setting to either "workspace" or "vscode"

## How Workspace Storage Works

- Each Git branch has its own group file named `groups.[branch-name].json`
- Files contain all the groups and their associated files for that branch
- When you switch branches, the extension automatically loads the appropriate group file

## Benefits of Each Storage Option

### Workspace Storage
- **Portability**: Groups travel with your project when you clone it on another machine
- **Version Control**: You can include these files in your Git repository to share groups with your team
- **Team Sharing**: Easy to share group configurations with teammates

### VS Code Storage
- **Privacy**: Groups are stored in your personal VS Code settings
- **No Project Files**: Doesn't add any files to your project directory
- **Simplicity**: No need to manage additional files in your project

## Migrating Between Storage Options

You can migrate your groups between storage locations using the "Migrate Groups" command:

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Search for "Groupi: Migrate Groups"
3. Confirm the migration

The extension will automatically migrate your groups to the new location and update your settings.

## Git Integration

If you want to share your groups with your team, add this directory to your Git repository:

```bash
git add .groupi/
git commit -m "Add shared file groups"
```

If you prefer to keep your groups private, add this directory to your `.gitignore` file:

```
.groupi/
```

## Troubleshooting

If you encounter any issues with your groups:

1. Check your storage location setting in VS Code settings
2. If using workspace storage, verify that the `.groupi` directory exists in your project root
3. Verify that the group files exist for your current branch
4. Make sure the files contain valid JSON data

For more help, please open an issue in the extension repository.
