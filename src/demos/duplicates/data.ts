export type Report = {
  id: string;
  title: string;
  short: string;
  area: string;
  platform: string;
  body: string;
  passages: string[];
};
export const reports: Report[] = [
  {
    id: "184",
    title: "Preview comes back blank after reopening a workspace",
    short: "Blank on reopen",
    area: "Preview lifecycle",
    platform: "macOS 15",
    body: "The preview is fine until I quit the desktop app and reopen the same workspace. It shows a blank pane even though the dev server is healthy. Switching to a different workspace and back fixes it. Reproduced on macOS 15 with persisted preview sessions enabled.",
    passages: [
      "The preview is fine until I quit the desktop app and reopen the same workspace.",
      "It shows a blank pane even though the dev server is healthy.",
      "Switching to a different workspace and back fixes it.",
    ],
  },
  {
    id: "207",
    title: "Old preview session survives a full restart",
    short: "Stale session",
    area: "Preview lifecycle",
    platform: "macOS 15 / Windows 11",
    body: "After restarting the app, the preview reconnects to yesterday’s session ID and waits forever. The server is running and responds in a normal browser. Clearing the saved preview session makes the preview load. Happens on both macOS and Windows. Changing branches without restarting does not reproduce it.",
    passages: [
      "After restarting the app, the preview reconnects to yesterday’s session ID and waits forever.",
      "Clearing the saved preview session makes the preview load.",
      "Changing branches without restarting does not reproduce it.",
    ],
  },
  {
    id: "221",
    title: "Branch switch leaves preview on the previous build",
    short: "Branch switch",
    area: "Preview lifecycle",
    platform: "macOS 15",
    body: "Switch from main to a feature branch while the app is open. The preview keeps showing the old branch. The app restart restores the correct preview. I can reproduce with session persistence disabled. File watchers log that they are still attached to the old worktree.",
    passages: [
      "Switch from main to a feature branch while the app is open.",
      "The app restart restores the correct preview.",
      "File watchers log that they are still attached to the old worktree.",
    ],
  },
  {
    id: "229",
    title: "Preview stops updating when checking out another branch",
    short: "Old worktree",
    area: "Preview lifecycle",
    platform: "Windows 11",
    body: "Checking out another branch leaves the embedded preview on old files. Refreshing the iframe does not help because the watcher never switches worktrees. Relaunching the app fixes it. It only happens during a branch switch in an already running app.",
    passages: [
      "Checking out another branch leaves the embedded preview on old files.",
      "The watcher never switches worktrees.",
      "It only happens during a branch switch in an already running app.",
    ],
  },
  {
    id: "243",
    title: "Blank pane when offline after sleep",
    short: "Network resume",
    area: "Network recovery",
    platform: "macOS 15",
    body: "The preview becomes blank after my laptop wakes from sleep without a network connection. It starts working when Wi-Fi returns. The session ID is current. A cold restart does not reproduce it when the network is available.",
    passages: [
      "The preview becomes blank after my laptop wakes from sleep without a network connection.",
      "It starts working when Wi-Fi returns.",
      "A cold restart does not reproduce it when the network is available.",
    ],
  },
  {
    id: "251",
    title: "Large canvas freezes the renderer",
    short: "Canvas freeze",
    area: "Rendering",
    platform: "Linux / integrated GPU",
    body: "Opening the particle example with 80,000 canvas nodes makes the preview stop painting. CPU stays high, and the dev server remains healthy. This happens on the first launch, with no branch switch or restart. Reducing the particle count fixes it.",
    passages: [
      "Opening the particle example with 80,000 canvas nodes makes the preview stop painting.",
      "This happens on the first launch, with no branch switch or restart.",
      "Reducing the particle count fixes it.",
    ],
  },
  {
    id: "266",
    title: "Preview is broken again",
    short: "Needs detail",
    area: "Unknown",
    platform: "Not stated",
    body: "The preview is broken again. I see a blank area and nothing loads. Not sure which version I am running. I have not tried restarting or checked the dev server.",
    passages: [
      "I see a blank area and nothing loads.",
      "Not sure which version I am running.",
      "I have not tried restarting or checked the dev server.",
    ],
  },
  {
    id: "270",
    title: "Sign-in disappears when the app restarts",
    short: "Lost sign-in",
    area: "Authentication",
    platform: "macOS 15",
    body: "Every full app restart signs me out of my account. Preview works normally after signing in again. The auth token is stored in the temporary cache directory and is cleared on launch. No preview session problem occurs.",
    passages: [
      "Every full app restart signs me out of my account.",
      "The auth token is stored in the temporary cache directory and is cleared on launch.",
      "No preview session problem occurs.",
    ],
  },
  {
    id: "278",
    title: "Restored workspace points at an expired preview",
    short: "Expired preview",
    area: "Preview lifecycle",
    platform: "Windows 11",
    body: "The persisted preview address contains a session token from the previous process. After quit and reopen, the embedded pane keeps waiting for that expired token. Deleting workspace-state.json once fixes it until the next restart. The same address loads normally with a new token.",
    passages: [
      "The persisted preview address contains a session token from the previous process.",
      "After quit and reopen, the embedded pane keeps waiting for that expired token.",
      "Deleting workspace-state.json once fixes it until the next restart.",
    ],
  },
  {
    id: "283",
    title: "Remote preview fails behind the company proxy",
    short: "Proxy socket",
    area: "Network transport",
    platform: "Windows 11",
    body: "Remote previews fail on our corporate network. The WebSocket upgrade receives HTTP 403 from the proxy. Local previews are fine. The failure occurs regardless of workspace, branch, or restart; connecting through a different network fixes it.",
    passages: [
      "The WebSocket upgrade receives HTTP 403 from the proxy.",
      "Local previews are fine.",
      "Connecting through a different network fixes it.",
    ],
  },
  {
    id: "291",
    title: "Preview remembers scroll position from another branch",
    short: "Scroll restore",
    area: "Preview state",
    platform: "macOS 15",
    body: "After switching branches, the preview loads the correct code but restores the old scroll position. Rendering and live updates still work. I expected the scroll position to reset for a new branch. Restarting does not change the stored scroll position.",
    passages: [
      "The preview loads the correct code but restores the old scroll position.",
      "Rendering and live updates still work.",
      "Restarting does not change the stored scroll position.",
    ],
  },
  {
    id: "304",
    title: "Fresh clone cannot find the package manager",
    short: "Missing tool",
    area: "Environment setup",
    platform: "Linux",
    body: "On a new Linux machine, starting a preview fails with bun: command not found. I have not installed Bun. The app is launching correctly; installing the required runtime makes preview start.",
    passages: [
      "Starting a preview fails with bun: command not found.",
      "I have not installed Bun.",
      "Installing the required runtime makes preview start.",
    ],
  },
];

export const draftPresets = [
  {
    id: "restart",
    label: "After a restart",
    title: "Preview freezes after opening my project",
    body: "After I fully quit and reopen the desktop app, the preview stays blank. The dev server works in my browser. Clearing the persisted preview session fixes it. I am on macOS 15. Switching branches while the app is already open works normally.",
  },
  {
    id: "branch",
    label: "After a branch switch",
    title: "Preview freezes after opening my project",
    body: "While the desktop app is running, I switch from main to another branch. The preview keeps showing the previous build and stops picking up changes. A full restart fixes it. It also happens with persisted sessions disabled. The watcher still points to the previous worktree.",
  },
  {
    id: "ambiguous",
    label: "Missing the details",
    title: "Preview freezes after opening my project",
    body: "My preview stopped working and is sometimes blank. I do not know the trigger yet. I have not checked the dev server or tried restarting.",
  },
  {
    id: "unrelated",
    label: "A different problem",
    title: "Exported PDF has the wrong page margins",
    body: "The PDF exporter ignores my custom page margins when I select A4. Preview is working normally. This is about exporting a document to a file, not the live development preview.",
  },
];
