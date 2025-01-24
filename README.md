# Groupi

Organize and manage your files into customizable groups with seamless Git integration.

![Groupi Banner](resources/banner.png)

## Features

- **Create Groups**: Organize your files into meaningful categories.
- **Drag and Drop**: Easily drag files from the File Explorer and drop them into existing groups or create new ones on the fly.
- **Multi-Select**: Select multiple files or groups for bulk actions.
- **Git Integration**: Sync your groups with Git branches, allowing different groupings per branch.
- **Context Menu Actions**: Access powerful commands directly from the context menu.
- **Clipboard Operations**: Copy absolute or relative paths of your files effortlessly.
- **Reveal in Explorer**: Quickly locate files in your system's file explorer.
- **Split Editor Opening**: Open files in split view for better multitasking.
- **Rename and Delete Groups**: Easily manage your groups by renaming or deleting them as needed.

## Installation

1. Open **Visual Studio Code**.
2. Navigate to the **Extensions** view by clicking on the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X`.
3. Search for `Groupi`.
4. Click **Install**.

## Usage

### Creating a New Group

1. Open the **Groupi** view from the Activity Bar.
2. Click on the **Create New Group** button .
3. Enter a name for your new group.

### Adding Files to a Group

- **Drag and Drop**:

  1. Drag files from the **File Explorer**.
  2. Drop them into an existing group or into the empty space to create a new group.

- **Using Commands**:
  1. Select a file in the editor.
  2. Right-click and choose `Add to Group` .
  3. Choose the target group from the list.

### Managing Groups

- **Rename a Group**:

  1. Right-click on the group you want to rename.
  2. Select `Rename Group` and enter the new name.

- **Delete a Group**:
  1. Right-click on the group you want to delete.
  2. Select `Delete Group` and confirm the action.

### Git Integration

- **Sync with Git Branch**:

  - Use the `Groupi: Sync with Git Branch` command to synchronize your groups with the current Git branch. This allows different groupings for different branches.

- **Copy Groups from Another Branch**:
  1. Use the `Groups from Branch` .
  2. Select the source branch and the groups you want to copy.

### Additional Commands

- **Add All Opened Files**:

  - Use the `Groupi: Add All Opened Files` command to add all currently opened files in your editor to a selected group.

- **Open File in Split Editor**:

  - Right-click on a file and select `Open in Split Editor` to view it alongside another file.

- **Copy File Paths**:

  - Use `Copy Path` or `Copy Relative Path` from the context menu to copy file paths to your clipboard.

- **Reveal in File Explorer**:
  - Right-click on a file and select `Reveal in File Explorer` to locate it in your system's file explorer.

## Keybindings

You can assign keyboard shortcuts to Groupi commands for quicker access. Visit the **Keyboard Shortcuts** settings and search for `Groupi` to customize them.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a pull request.

## Issues and Support

Encountered a bug or have a feature request? [Open an issue](https://github.com/kodebuds/groupi/issues) on GitHub.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

- Inspired by the need for better file organization within VS Code.
- Developed by [kodebuds](https://github.com/kodebuds).

  ** Enjoy Organizing with Groupi **
