// SQLite extended result codes keep the primary result in the low byte.
export function isDatabaseBusy(error){return Number.isInteger(error?.errcode)&&[5,6].includes(error.errcode&255);}
export const databaseLockMessage='The database is busy. Close DB Browser for SQLite (save or revert pending edits), stop other Zindagi servers with Ctrl+C, then run npm.cmd start again. Do not delete the database or its -wal/-shm files.';
