import type { CommandDef } from '../shell';
import { fsCommands } from './fs';
import { textCommands } from './text';
import { systemCommands } from './system';
import { netCommands } from './net';
import { remoteCommands } from './remote';
import { toolCommands } from './tools';
import { archiveCommands } from './archive';

export const builtinCommands: CommandDef[] = [...fsCommands, ...textCommands, ...systemCommands, ...netCommands, ...remoteCommands, ...toolCommands, ...archiveCommands];
