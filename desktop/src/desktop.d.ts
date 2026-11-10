export interface DesktopFile {
  path: string;
  name: string;
  bytes: Uint8Array;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface MissingFile {
  missing: true;
  path: string;
  name: string;
}

export interface SaveBytesRequest {
  bytes: Uint8Array;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  saveAs: boolean;
  currentPath: string | null;
}

export interface DesktopBridge {
  openFile(): Promise<DesktopFile | null>;
  takeLaunchFile(): Promise<DesktopFile | null>;
  recentFiles(): Promise<RecentFile[]>;
  touchRecent(filePath: string): Promise<void>;
  openRecent(filePath: string): Promise<DesktopFile | MissingFile | null>;
  saveBytes(payload: SaveBytesRequest): Promise<{ path: string } | null>;
  confirmDiscard(): Promise<boolean>;
  setDirty(dirty: boolean): void;
  setTitle(title: string): void;
  onOpenFile(cb: (file: DesktopFile) => void): () => void;
  onMenu(cb: (action: "new" | "open" | "home" | "save" | "save-as") => void): () => void;
}

declare global {
  interface Window {
    desktop: DesktopBridge;
    __slimpptSave?: () => Promise<boolean>;
  }
}

export {};
