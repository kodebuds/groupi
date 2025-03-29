# Groupi - Portable Group Storage

## Overview

This directory contains the group data for your project. Groups are now stored in JSON files within this `.groupi` directory, making them portable between different machines.

## How It Works

- Each Git branch has its own group file named `groups.[branch-name].json`
- Files contain all the groups and their associated files for that branch
- When you switch branches, the extension automatically loads the appropriate group file

## Benefits

- **Portability**: Groups travel with your project when you clone it on another machine
- **Version Control**: You can include these files in your Git repository to share groups with your team
- **No Data Loss**: The extension automatically migrates your existing groups from VS Code storage

## Usage

You don't need to do anything special to use this feature. The extension automatically:

1. Creates this directory when needed
2. Saves groups to files in this directory
3. Loads groups from these files when you open the project
4. Migrates existing groups from VS Code storage

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

1. Check that the `.groupi` directory exists in your project root
2. Verify that the group files exist for your current branch
3. Make sure the files contain valid JSON data

For more help, please open an issue in the extension repository.
