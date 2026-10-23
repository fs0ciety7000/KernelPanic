import type { CommandDef } from '../shell';
import { fsCommands } from './fs';
import { textCommands } from './text';
import { systemCommands } from './system';
import { netCommands } from './net';

export const builtinCommands: CommandDef[] = [...fsCommands, ...textCommands, ...systemCommands, ...netCommands];
