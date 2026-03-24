export {
  type IFileSystem,
  type FileInfo,
  type DirEntry,
  type FileWatchEvent,
  type FileWatchCallback,
  type FileDialogFilter,
  normalizePath,
  pathJoin,
  pathDirname,
  pathBasename,
  pathExtension,
  isInsidePath,
} from './FileSystem';

export {
  ElectronFileSystem,
  setGlobalFileSystem,
  getFileSystem,
} from './ElectronFileSystem';
